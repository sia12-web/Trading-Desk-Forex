// ── Asset Type Detection & Configuration ──
// Detects whether an instrument is forex or CFD index and returns asset-specific config.

export type AssetType = 'forex' | 'cfd_index'

export interface IndexMeta {
    displayName: string
    country: string
    sector: string
    centralBank: string
    peerInstruments: string[]
    bondInstrument: string | null
    keySectors: string[]
}

export interface AssetConfig {
    type: AssetType
    pointLabel: 'pips' | 'points'
    pointMultiplier: number
    decimalPlaces: number
    indexMeta: IndexMeta | null
}

// Known CFD index instruments (OANDA format → config)
const INDEX_MAP: Record<string, IndexMeta> = {
    NAS100_USD: {
        displayName: 'Nasdaq 100',
        country: 'US',
        sector: 'tech-heavy',
        centralBank: 'Federal Reserve (Fed)',
        peerInstruments: ['SPX500_USD', 'US30_USD'],
        bondInstrument: 'USB10Y_USD',
        keySectors: ['technology', 'AI & semiconductors', 'cloud computing', 'consumer tech'],
    },
    SPX500_USD: {
        displayName: 'S&P 500',
        country: 'US',
        sector: 'broad market',
        centralBank: 'Federal Reserve (Fed)',
        peerInstruments: ['NAS100_USD', 'US30_USD'],
        bondInstrument: 'USB10Y_USD',
        keySectors: ['technology', 'financials', 'healthcare', 'energy', 'consumer'],
    },
    DE30_EUR: {
        displayName: 'DAX 40',
        country: 'DE',
        sector: 'export-oriented industrials',
        centralBank: 'European Central Bank (ECB)',
        peerInstruments: ['EU50_EUR'],
        bondInstrument: 'DE10YB_EUR',
        keySectors: ['automotive', 'industrials', 'chemicals', 'financials', 'tech'],
    },
    US30_USD: {
        displayName: 'Dow Jones 30',
        country: 'US',
        sector: 'blue-chip / cyclical',
        centralBank: 'Federal Reserve (Fed)',
        peerInstruments: ['SPX500_USD', 'NAS100_USD'],
        bondInstrument: 'USB10Y_USD',
        keySectors: ['financials', 'industrials', 'healthcare', 'energy', 'consumer staples'],
    },
}

// Default forex config
const FOREX_DEFAULT: AssetConfig = {
    type: 'forex',
    pointLabel: 'pips',
    pointMultiplier: 10000,
    decimalPlaces: 5,
    indexMeta: null,
}

/**
 * Get asset configuration for any instrument.
 * Accepts both formats: "NAS100_USD" or "NAS100/USD"
 */
export function getAssetConfig(pair: string): AssetConfig {
    const instrument = pair.replace('/', '_')
    const meta = INDEX_MAP[instrument]

    if (meta) {
        return {
            type: 'cfd_index',
            pointLabel: 'points',
            pointMultiplier: 1,
            decimalPlaces: 1,
            indexMeta: meta,
        }
    }

    // JPY pairs use 3 decimal places
    if (pair.includes('JPY')) {
        return { ...FOREX_DEFAULT, decimalPlaces: 3 }
    }

    return FOREX_DEFAULT
}

/**
 * Check if a pair is a known CFD index.
 */
export function isCFDIndex(pair: string): boolean {
    return getAssetConfig(pair).type === 'cfd_index'
}
