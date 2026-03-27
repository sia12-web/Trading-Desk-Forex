import { NextResponse } from 'next/server'
import { getCandles } from '@/lib/oanda/client'

const FX_PAIRS = [
    { instrument: 'EUR_USD', name: 'EUR/USD' },
    { instrument: 'USD_JPY', name: 'USD/JPY' },
    { instrument: 'GBP_USD', name: 'GBP/USD' },
    { instrument: 'AUD_USD', name: 'AUD/USD' },
    { instrument: 'USD_CAD', name: 'USD/CAD' },
    { instrument: 'USD_CHF', name: 'USD/CHF' },
    { instrument: 'NZD_USD', name: 'NZD/USD' },
    { instrument: 'EUR_GBP', name: 'EUR/GBP' },
    { instrument: 'EUR_JPY', name: 'EUR/JPY' },
    { instrument: 'GBP_JPY', name: 'GBP/JPY' },
    { instrument: 'AUD_JPY', name: 'AUD/JPY' },
    { instrument: 'EUR_AUD', name: 'EUR/AUD' },
    { instrument: 'GBP_AUD', name: 'GBP/AUD' },
    { instrument: 'XAU_USD', name: 'Gold' },
    { instrument: 'USO_USD', name: 'WTI Oil' },
]

interface PairVolatility {
    instrument: string
    name: string
    volatility: number // Percentage: (High-Low)/Close * 100
    price: number
    change1d: number
}

export async function GET() {
    try {
        const results: PairVolatility[] = []

        for (const pair of FX_PAIRS) {
            try {
                const data = await fetchPairVolatility(pair.instrument, pair.name)
                if (data) results.push(data)
                await new Promise(resolve => setTimeout(resolve, 100))
            } catch (err) {
                console.error(`Failed to fetch volatility for ${pair.name}:`, err)
            }
        }

        // Sort by volatility descending and take top 6
        const topVolatile = results
            .sort((a, b) => b.volatility - a.volatility)
            .slice(0, 6)

        return NextResponse.json({
            pairs: topVolatile,
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        console.error('Volatile pairs API error:', error)
        return NextResponse.json({ error: 'Failed to fetch volatile pairs' }, { status: 500 })
    }
}

async function fetchPairVolatility(instrument: string, name: string): Promise<PairVolatility | null> {
    const { data: candles, error } = await getCandles({ 
        instrument, 
        granularity: 'D', 
        count: 2 
    })

    if (error || !candles || candles.length < 1) return null

    const latest = candles[candles.length - 1]
    const high = parseFloat(latest.mid.h)
    const low = parseFloat(latest.mid.l)
    const close = parseFloat(latest.mid.c)
    const open = parseFloat(latest.mid.o)

    // Calculate daily range as percentage of close
    const volatility = ((high - low) / close) * 100
    const change1d = ((close - open) / open) * 100

    return {
        instrument,
        name,
        volatility,
        price: close,
        change1d
    }
}
