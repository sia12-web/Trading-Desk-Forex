export interface PivotPointLevels {
    pp: number     // Pivot Point (central)
    r1: number     // Resistance 1
    r2: number     // Resistance 2
    r3: number     // Resistance 3
    s1: number     // Support 1
    s2: number     // Support 2
    s3: number     // Support 3

    // Midpoints
    m1: number     // Midpoint between S1 and PP
    m2: number     // Midpoint between PP and R1
    m3: number     // Midpoint between R1 and R2
    m4: number     // Midpoint between S1 and S2
}

export interface VolumeFlowData {
    volumeProfile: {
        vpoc: number              // Volume Point of Control — single strongest S/R level
        valueAreaHigh: number     // Upper bound of 70% value area
        valueAreaLow: number      // Lower bound of 70% value area
        hvn: number[]             // High Volume Nodes (real S/R where big money sits)
        lvn: number[]             // Low Volume Nodes (thin zones, fast moves)
        totalVolume: number
    }
    vwap: number[]                // Volume-Weighted Average Price series
    exhaustion: {
        detected: boolean
        type: 'bullish_exhaustion' | 'bearish_exhaustion' | 'none'
        severity: 'mild' | 'moderate' | 'strong'
        description: string
    }
}

export interface CalculatedIndicators {
    ema: Record<number, number[]>  // period → values
    sma: Record<number, number[]>
    rsi: number[]
    macd: { line: number[], signal: number[], histogram: number[] }
    stochastic: { k: number[], d: number[] }
    bollingerBands: { upper: number[], middle: number[], lower: number[] }
    bbWidth: number[]  // (upper - lower) / middle * 100 — measures Bollinger Band squeeze
    atr: number[]
    pivotPoints: PivotPointLevels
    parabolicSar: { sar: number[], direction: string[] }
    adx: number[]
    volume: number[]
    volumeSma: number[]
    // Volume Flow Analysis
    volumeFlow: VolumeFlowData
    // Bill Williams indicators
    alligator: {
        jaw: number[]
        teeth: number[]
        lips: number[]
        state: ('sleeping' | 'awakening' | 'eating' | 'sated')[]
    }
    awesomeOscillator: number[]
    acceleratorOscillator: number[]
    fractals: Array<{ index: number; price: number; type: 'bullish' | 'bearish'; time?: string }>
    gatorOscillator: { upper: number[]; lower: number[] }
}
