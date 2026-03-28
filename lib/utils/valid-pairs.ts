export const VALID_PAIRS = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'EUR/GBP', 'AUD/USD',
    'USD/CAD', 'NZD/USD', 'EUR/JPY', 'USD/CHF', 'GBP/JPY',
] as const

export type ValidPair = (typeof VALID_PAIRS)[number]

export function isValidPair(pair: string): pair is ValidPair {
    return VALID_PAIRS.includes(pair as ValidPair)
}
