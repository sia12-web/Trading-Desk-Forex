/**
 * Shared instrument list across Trade page, Indicator Optimization, and Story subscriptions.
 * This is the canonical source of truth for which instruments are tradable in the system.
 */
export const ALLOWED_INSTRUMENTS = [
    // Major Forex Pairs
    'EUR_USD', 'GBP_USD', 'USD_JPY', 'EUR_GBP', 'AUD_USD',
    'USD_CAD', 'NZD_USD', 'EUR_JPY', 'USD_CHF', 'GBP_JPY',

    // Cross Pairs
    'GBP_AUD', 'EUR_AUD', 'AUD_JPY', 'NZD_JPY',

    // Exotic
    'USD_TRY',

    // Commodities
    'XAU_USD',

    // Indices
    'NAS100_USD', 'SPX500_USD', 'US30_USD', 'DE30_EUR',

    // Cryptocurrencies (via CoinGecko API - Free)
    'CRYPTO_BTC_USD',   // Bitcoin
    'CRYPTO_ETH_USD',   // Ethereum
    'CRYPTO_BNB_USD',   // Binance Coin
    'CRYPTO_SOL_USD',   // Solana
    'CRYPTO_XRP_USD',   // Ripple
    'CRYPTO_ADA_USD',   // Cardano
    'CRYPTO_DOGE_USD',  // Dogecoin
    'CRYPTO_AVAX_USD',  // Avalanche
    'CRYPTO_DOT_USD',   // Polkadot
    'CRYPTO_MATIC_USD', // Polygon
] as const

export type AllowedInstrument = typeof ALLOWED_INSTRUMENTS[number]

/**
 * Convert display format (EUR/USD) to OANDA format (EUR_USD)
 */
export function displayToOandaPair(pair: string): string {
    return pair.replace('/', '_')
}

/**
 * Convert OANDA format (EUR_USD) to display format (EUR/USD)
 * Also handles crypto pairs (CRYPTO_BTC_USD -> BTC/USD)
 */
export function oandaToDisplayPair(instrument: string): string {
    if (instrument.startsWith('CRYPTO_')) {
        return instrument.replace('CRYPTO_', '').replace('_', '/')
    }
    return instrument.replace('_', '/')
}

/**
 * Check if an instrument is a cryptocurrency
 */
export function isCryptoPair(instrument: string): boolean {
    return instrument.startsWith('CRYPTO_')
}
