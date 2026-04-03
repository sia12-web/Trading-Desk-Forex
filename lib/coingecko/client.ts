import { OandaCandle } from '@/lib/types/oanda'

/**
 * CoinGecko API Client - Free crypto market data
 * No API key required for basic usage (10-50 calls/minute)
 */

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3'

// Map crypto symbols to CoinGecko IDs
const CRYPTO_ID_MAP: Record<string, string> = {
    'CRYPTO_BTC_USD': 'bitcoin',
    'CRYPTO_ETH_USD': 'ethereum',
    'CRYPTO_BNB_USD': 'binancecoin',
    'CRYPTO_SOL_USD': 'solana',
    'CRYPTO_XRP_USD': 'ripple',
    'CRYPTO_ADA_USD': 'cardano',
    'CRYPTO_DOGE_USD': 'dogecoin',
    'CRYPTO_AVAX_USD': 'avalanche-2',
    'CRYPTO_DOT_USD': 'polkadot',
    'CRYPTO_MATIC_USD': 'matic-network',
}

// Map timeframes to CoinGecko granularity (in days)
function timeframeToGranularity(timeframe: string): { days: number; interval: string } {
    switch (timeframe) {
        case 'M':  return { days: 365, interval: 'daily' }   // Monthly
        case 'W':  return { days: 90, interval: 'daily' }    // Weekly
        case 'D':  return { days: 90, interval: 'daily' }    // Daily
        case 'H4': return { days: 30, interval: 'hourly' }   // 4-hour
        case 'H3': return { days: 30, interval: 'hourly' }   // 3-hour
        case 'H1': return { days: 30, interval: 'hourly' }   // 1-hour
        default:   return { days: 30, interval: 'hourly' }
    }
}

interface CoinGeckoOHLC {
    timestamp: number
    open: number
    high: number
    low: number
    close: number
}

/**
 * Fetch OHLC candle data from CoinGecko and convert to OANDA format
 */
export async function getCryptoCandles(params: {
    instrument: string
    granularity: string
    count: number
}): Promise<{ data?: OandaCandle[]; error?: any }> {
    try {
        const coinId = CRYPTO_ID_MAP[params.instrument]
        if (!coinId) {
            return { error: `Unsupported crypto instrument: ${params.instrument}` }
        }

        const { days } = timeframeToGranularity(params.granularity)

        // CoinGecko OHLC endpoint (free tier)
        const url = `${COINGECKO_BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
            },
            next: { revalidate: 60 } // Cache for 1 minute
        })

        if (!response.ok) {
            const error = await response.text()
            console.error(`CoinGecko API Error [${response.status}]:`, error)
            return { error: `CoinGecko API error: ${response.status}` }
        }

        const rawData: number[][] = await response.json()

        // Convert CoinGecko format [timestamp, open, high, low, close] to OANDA format
        let candles: OandaCandle[] = rawData.map(([timestamp, open, high, low, close]) => ({
            time: new Date(timestamp).toISOString(),
            volume: 0, // CoinGecko OHLC doesn't include volume
            mid: {
                o: open.toString(),
                h: high.toString(),
                l: low.toString(),
                c: close.toString(),
            },
            complete: true,
        }))

        // Apply timeframe aggregation if needed
        candles = aggregateCandles(candles, params.granularity)

        // Return only the requested count (most recent)
        candles = candles.slice(-params.count)

        return { data: candles }
    } catch (error: any) {
        console.error('CoinGecko fetch error:', error)
        return { error: error.message || 'Unknown CoinGecko error' }
    }
}

/**
 * Aggregate hourly/daily candles to match requested timeframe
 */
function aggregateCandles(candles: OandaCandle[], timeframe: string): OandaCandle[] {
    // For M (Monthly), group by month
    if (timeframe === 'M') {
        return aggregateByPeriod(candles, 30)
    }

    // For W (Weekly), group by 7 days
    if (timeframe === 'W') {
        return aggregateByPeriod(candles, 7)
    }

    // For H4, group every 4 candles
    if (timeframe === 'H4') {
        return aggregateByCount(candles, 4)
    }

    // For H3, group every 3 candles
    if (timeframe === 'H3') {
        return aggregateByCount(candles, 3)
    }

    // D and H1 are already in correct format from CoinGecko
    return candles
}

function aggregateByPeriod(candles: OandaCandle[], daysPerPeriod: number): OandaCandle[] {
    const grouped: Map<string, OandaCandle[]> = new Map()

    candles.forEach(candle => {
        const date = new Date(candle.time)
        const periodKey = Math.floor(date.getTime() / (daysPerPeriod * 24 * 60 * 60 * 1000)).toString()

        if (!grouped.has(periodKey)) {
            grouped.set(periodKey, [])
        }
        grouped.get(periodKey)!.push(candle)
    })

    return Array.from(grouped.values()).map(group => mergeCandles(group))
}

function aggregateByCount(candles: OandaCandle[], count: number): OandaCandle[] {
    const result: OandaCandle[] = []

    for (let i = 0; i < candles.length; i += count) {
        const chunk = candles.slice(i, i + count)
        if (chunk.length > 0) {
            result.push(mergeCandles(chunk))
        }
    }

    return result
}

function mergeCandles(candles: OandaCandle[]): OandaCandle {
    if (candles.length === 0) throw new Error('Cannot merge empty candles')
    if (candles.length === 1) return candles[0]

    const opens = candles.map(c => parseFloat(c.mid.o))
    const highs = candles.map(c => parseFloat(c.mid.h))
    const lows = candles.map(c => parseFloat(c.mid.l))
    const closes = candles.map(c => parseFloat(c.mid.c))

    return {
        time: candles[candles.length - 1].time, // Use last candle's time
        volume: 0,
        mid: {
            o: opens[0].toString(),                    // First open
            h: Math.max(...highs).toString(),          // Highest high
            l: Math.min(...lows).toString(),           // Lowest low
            c: closes[closes.length - 1].toString(),   // Last close
        },
        complete: true,
    }
}

/**
 * Check if an instrument is a crypto pair
 */
export function isCryptoPair(instrument: string): boolean {
    return instrument.startsWith('CRYPTO_')
}

/**
 * Get display name for crypto pair (e.g., "CRYPTO_BTC_USD" -> "BTC/USD")
 */
export function cryptoToDisplayPair(instrument: string): string {
    return instrument.replace('CRYPTO_', '').replace('_', '/')
}
