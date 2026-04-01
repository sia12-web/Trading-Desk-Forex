export const VALID_PAIRS = [
    // Major Forex Pairs
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'EUR/GBP', 'AUD/USD',
    'USD/CAD', 'NZD/USD', 'EUR/JPY', 'USD/CHF', 'GBP/JPY',
    // Cross Pairs
    'GBP/AUD', 'EUR/AUD', 'AUD/JPY', 'NZD/JPY', 'USD/TRY',
    // CFD Indexes
    'NAS100/USD', 'SPX500/USD', 'DE30/EUR', 'US30/USD',
    // Commodities
    'XAU/USD',
] as const

export type ValidPair = (typeof VALID_PAIRS)[number]

export function isValidPair(pair: string): pair is ValidPair {
    return VALID_PAIRS.includes(pair as ValidPair)
}
