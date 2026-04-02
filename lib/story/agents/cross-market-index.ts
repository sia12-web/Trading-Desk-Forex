import { callGemini } from '@/lib/ai/clients'
import { parseAIJson } from '@/lib/ai/parse-response'
import { getCandles } from '@/lib/oanda/client'
import { saveAgentReport } from './data'
import { getAssetConfig } from '../asset-config'
import type { IndexCrossMarketReport } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

interface PeerSummary {
    instrument: string
    name: string
    change1d: number
    change5d: number
    change20d: number
    trendDirection: string
}

/**
 * Index Cross-Market Agent — analyzes how bonds, peer indices, and the dollar
 * affect the given CFD index. Reverse of the forex cross-market agent.
 */
export async function runIndexCrossMarketAnalysis(
    pair: string,
    userId: string,
    client: SupabaseClient
): Promise<IndexCrossMarketReport | null> {
    const start = Date.now()
    const config = getAssetConfig(pair)
    const meta = config.indexMeta!
    const instrument = pair.replace('/', '_')

    try {
        // Collect peer indices + bond + dollar proxy data
        const instruments: Array<{ instrument: string; name: string; role: string }> = []

        // Peer indices
        for (const peer of meta.peerInstruments) {
            if (peer !== instrument) {
                const peerName = getAssetConfig(peer.replace('_', '/'))?.indexMeta?.displayName || peer
                instruments.push({ instrument: peer, name: peerName, role: 'peer_index' })
            }
        }

        // Bond instrument
        if (meta.bondInstrument) {
            instruments.push({ instrument: meta.bondInstrument, name: `${meta.country} 10Y Bond`, role: 'bond' })
        }

        // Dollar proxy (EUR/USD as inverse DXY)
        instruments.push({ instrument: 'EUR_USD', name: 'EUR/USD (inverse DXY proxy)', role: 'dollar_proxy' })

        // Fetch data sequentially with delay for rate limits
        const summaries: Array<PeerSummary & { role: string }> = []
        for (const item of instruments) {
            const summary = await fetchSummary(item.instrument, item.name)
            if (summary) summaries.push({ ...summary, role: item.role })
            await sleep(200)
        }

        if (summaries.length === 0) {
            console.error(`No cross-market data available for ${pair}`)
            return null
        }

        const prompt = buildIndexCrossMarketPrompt(pair, meta, summaries)
        const rawOutput = await callGemini(prompt, { timeout: 60_000, maxTokens: 3072 })
        const report = parseAIJson<IndexCrossMarketReport>(rawOutput)
        report.pair = pair

        await saveAgentReport(userId, pair, 'cross_market', report as unknown as Record<string, unknown>, {
            rawOutput, model: 'gemini-1.5-flash', durationMs: Date.now() - start,
        }, client)

        return report
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Index cross-market analysis failed for ${pair}:`, message)
        await saveAgentReport(userId, pair, 'cross_market', {}, {
            model: 'gemini-1.5-flash', durationMs: Date.now() - start, error: message,
        }, client)
        return null
    }
}

async function fetchSummary(instrument: string, name: string): Promise<PeerSummary | null> {
    try {
        const { data: candles } = await getCandles({ instrument, granularity: 'D', count: 50 })
        if (!candles || candles.length < 20) return null

        const closes = candles.map(c => parseFloat(c.mid.c))
        const latest = closes[closes.length - 1]
        const prev1d = closes[closes.length - 2]
        const prev5d = closes[closes.length - 6] ?? closes[0]
        const prev20d = closes[closes.length - 21] ?? closes[0]

        const change1d = ((latest - prev1d) / prev1d) * 100
        const change5d = ((latest - prev5d) / prev5d) * 100
        const change20d = ((latest - prev20d) / prev20d) * 100

        const sma5 = average(closes.slice(-5))
        const sma20 = average(closes.slice(-20))
        const trendDirection = sma5 > sma20 ? 'bullish' : sma5 < sma20 ? 'bearish' : 'flat'

        return { instrument, name, change1d, change5d, change20d, trendDirection }
    } catch {
        return null
    }
}

function average(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function buildIndexCrossMarketPrompt(
    pair: string,
    meta: NonNullable<ReturnType<typeof getAssetConfig>['indexMeta']>,
    summaries: Array<PeerSummary & { role: string }>
): string {
    const peerBlock = summaries
        .filter(s => s.role === 'peer_index')
        .map(s => `- **${s.name}** (${s.instrument}): 1D: ${s.change1d.toFixed(2)}%, 5D: ${s.change5d.toFixed(2)}%, 20D: ${s.change20d.toFixed(2)}%, Trend: ${s.trendDirection}`)
        .join('\n') || 'No peer data available.'

    const bondData = summaries.find(s => s.role === 'bond')
    const bondBlock = bondData
        ? `**${bondData.name}** (${bondData.instrument}): 1D: ${bondData.change1d.toFixed(2)}%, 5D: ${bondData.change5d.toFixed(2)}%, Trend: ${bondData.trendDirection}`
        : 'Bond data unavailable.'

    const dollarData = summaries.find(s => s.role === 'dollar_proxy')
    const dollarBlock = dollarData
        ? `**EUR/USD** (inverse DXY): 1D: ${dollarData.change1d.toFixed(2)}%, 5D: ${dollarData.change5d.toFixed(2)}%, Trend: ${dollarData.trendDirection} (EUR rising = dollar weakening)`
        : 'Dollar proxy data unavailable.'

    return `You are a cross-market correlation specialist for equity indices. Analyze how external markets affect ${meta.displayName} (${pair}).

## INDEX: ${meta.displayName} (${pair})
Sector: ${meta.sector}
Country: ${meta.country}

## PEER INDICES (daily data)
${peerBlock}

## BOND MARKET
${bondBlock}
Note: Rising bond yields are typically BEARISH for growth/tech stocks, MIXED for value/cyclicals.

## DOLLAR (via EUR/USD as inverse proxy)
${dollarBlock}
Note: A weakening dollar (EUR/USD rising) is typically a TAILWIND for US equities (boosts multinational earnings). For DE30, EUR strength can be a headwind (hurts export competitiveness).

## YOUR ANALYSIS TASK

1. **Peer Divergence**: Is ${meta.displayName} leading or lagging its peers? Any notable divergences?
2. **Bond Impact**: Are rising/falling yields supporting or threatening this index?
3. **Dollar Effect**: Is the dollar trend a tailwind or headwind?
4. **Risk Appetite**: Based on all cross-market signals, is the environment risk-on or risk-off?
5. **Correlation Thesis**: Synthesize what all this means for ${meta.displayName} direction.

Respond with JSON (no markdown fences):
{
  "pair": "${pair}",
  "peer_indices": [
    {
      "instrument": "SPX500_USD",
      "name": "S&P 500",
      "change1d": 0.5,
      "change5d": 1.2,
      "trend": "bullish",
      "divergence_note": "Any divergence with ${meta.displayName}"
    }
  ],
  "bond_analysis": {
    "instrument": "${meta.bondInstrument || 'N/A'}",
    "yield_trend": "Rising/falling yields and direction (1 sentence)",
    "implication": "Impact on ${meta.displayName} (1 sentence)"
  },
  "dollar_analysis": {
    "trend": "Dollar direction (1 sentence)",
    "implication": "Impact on ${meta.displayName} (1 sentence)"
  },
  "correlation_thesis": "2-3 sentence synthesis of all cross-market signals for ${meta.displayName}",
  "risk_appetite": "risk_on" | "risk_off" | "mixed",
  "summary": "2-3 sentence executive summary for the story narrator"
}`
}
