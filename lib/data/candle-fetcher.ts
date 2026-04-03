import { OandaCandle } from '@/lib/types/oanda'
import { getCandles as getOandaCandles } from '@/lib/oanda/client'
import { getCryptoCandles, isCryptoPair } from '@/lib/coingecko/client'

/**
 * Unified candle fetcher - routes to OANDA or CoinGecko based on instrument type
 */
export async function getCandles(params: {
    instrument: string
    granularity: string
    count: number
}): Promise<{ data?: OandaCandle[]; error?: any }> {
    // Route crypto pairs to CoinGecko
    if (isCryptoPair(params.instrument)) {
        return getCryptoCandles(params)
    }

    // Route forex/commodities/indices to OANDA
    return getOandaCandles(params)
}
