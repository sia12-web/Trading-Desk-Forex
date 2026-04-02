import { callGemini } from '@/lib/ai/clients'
import { parseAIJson } from '@/lib/ai/parse-response'
import { getCandles } from '@/lib/oanda/client'
import { saveAgentReport } from './data'
import type { CrossMarketReport } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

// Currency → relevant stock indices (OANDA instruments)
const CURRENCY_INDICES: Record<string, Array<{ instrument: string; name: string }>> = {
    USD: [
        { instrument: 'SPX500_USD', name: 'S&P 500' },
        { instrument: 'US30_USD', name: 'Dow Jones' },
        { instrument: 'NAS100_USD', name: 'Nasdaq 100' },
    ],
    EUR: [
        { instrument: 'DE30_EUR', name: 'DAX 40' },
        { instrument: 'EU50_EUR', name: 'Euro Stoxx 50' },
    ],
    GBP: [
        { instrument: 'UK100_GBP', name: 'FTSE 100' },
    ],
    JPY: [
        { instrument: 'JP225_USD', name: 'Nikkei 225' },
    ],
    AUD: [
        { instrument: 'AU200_AUD', name: 'ASX 200' },
    ],
}

interface IndexSummary {
    instrument: string
    name: string
    currency: string
    change1d: number
    change5d: number
    change20d: number
    trendDirection: string
}

/**
 * Cross-Market Effects Agent — uses Gemini to analyze stock index impacts on forex.
 * Fetches daily candles for relevant indices via OANDA.
 */
export async function runCrossMarketAnalysis(
    pair: string,
    userId: string,
    client: SupabaseClient
): Promise<CrossMarketReport | null> {
    const start = Date.now()

    try {
        const [baseCcy, quoteCcy] = pair.split('/')

        // Determine relevant indices
        const baseIndices = (CURRENCY_INDICES[baseCcy] || []).map(idx => ({ ...idx, currency: baseCcy }))
        const quoteIndices = (CURRENCY_INDICES[quoteCcy] || []).map(idx => ({ ...idx, currency: quoteCcy }))
        const allIndices = [...baseIndices, ...quoteIndices]

        // If neither currency has direct indices, analyze USD indices as proxy
        if (allIndices.length === 0) {
            const usdIndices = CURRENCY_INDICES['USD'].map(idx => ({ ...idx, currency: 'USD' }))
            allIndices.push(...usdIndices)
        }

        // Fetch index data sequentially with delay to respect rate limits
        const indexSummaries: IndexSummary[] = []
        for (const idx of allIndices) {
            const summary = await fetchIndexSummary(idx.instrument, idx.name, idx.currency)
            if (summary) indexSummaries.push(summary)
            await sleep(200)
        }

        if (indexSummaries.length === 0) {
            console.error(`No index data available for ${pair}`)
            return null
        }

        const prompt = buildCrossMarketPrompt(pair, indexSummaries)
        const rawOutput = await callGemini(prompt, { timeout: 60_000, maxTokens: 4096 })
        const report = parseAIJson<CrossMarketReport>(rawOutput)
        report.pair = pair

        await saveAgentReport(userId, pair, 'cross_market', report as unknown as Record<string, unknown>, {
            rawOutput, model: 'gemini-2.5-flash', durationMs: Date.now() - start,
        }, client)

        return report
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Cross-market analysis failed for ${pair}:`, message)
        await saveAgentReport(userId, pair, 'cross_market', {}, {
            model: 'gemini-2.5-flash', durationMs: Date.now() - start, error: message,
        }, client)
        return null
    }
}

async function fetchIndexSummary(
    instrument: string,
    name: string,
    currency: string
): Promise<IndexSummary | null> {
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

        // Simple trend: compare short MA vs long MA
        const sma5 = average(closes.slice(-5))
        const sma20 = average(closes.slice(-20))
        const trendDirection = sma5 > sma20 ? 'bullish' : sma5 < sma20 ? 'bearish' : 'flat'

        return { instrument, name, currency, change1d, change5d, change20d, trendDirection }
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

function buildCrossMarketPrompt(pair: string, indices: IndexSummary[]): string {
    const [baseCcy, quoteCcy] = pair.split('/')

    const indexBlock = indices.map(idx =>
        `- **${idx.name}** (${idx.instrument}, affects ${idx.currency}): 1D: ${idx.change1d.toFixed(2)}%, 5D: ${idx.change5d.toFixed(2)}%, 20D: ${idx.change20d.toFixed(2)}%, Trend: ${idx.trendDirection}`
    ).join('\n')

    return `You are a cross-market correlation specialist. Analyze how stock indices affect ${pair}.

## PAIR: ${pair} (Base: ${baseCcy}, Quote: ${quoteCcy})

## STOCK INDEX DATA (Daily)
${indexBlock}

## YOUR ANALYSIS TASK

Analyze the cross-market dynamics:

1. **Index-Currency Correlation**: How does each index's movement affect its related currency?
   - Rising stock markets → risk-on → typically weakens safe havens (JPY, CHF, USD)
   - Falling stock markets → risk-off → typically strengthens safe havens
   - Country-specific indices reflect that economy's health → currency support

2. **Risk Appetite Assessment**: Is the global environment risk-on or risk-off?
   - Are indices broadly rising (risk-on) or falling (risk-off)?
   - What does this mean for the specific currencies in ${pair}?

3. **Divergences**: Are any indices diverging from expectations?
   - e.g., USD weakening despite rising US indices (unusual)
   - e.g., EUR/GBP rising despite falling DAX

4. **Net Currency Implication**: Given all cross-market signals, is the net effect bullish, bearish, or neutral for ${pair}?

Respond with JSON (no markdown fences):
{
  "pair": "${pair}",
  "indices_analyzed": [
    {
      "instrument": "SPX500_USD",
      "name": "S&P 500",
      "currency_affected": "USD",
      "recent_trend": "Brief description of trend",
      "correlation_signal": "What this means for the currency"
    }
  ],
  "cross_market_thesis": "2-3 sentence synthesis of what cross-market data tells us about ${pair}",
  "risk_appetite": "risk_on" | "risk_off" | "mixed",
  "risk_appetite_reasoning": "Why this risk appetite assessment",
  "currency_implications": {
    "base_currency": "How cross-market data affects ${baseCcy}",
    "quote_currency": "How cross-market data affects ${quoteCcy}",
    "net_effect": "bullish" | "bearish" | "neutral"
  },
  "divergences": ["Any notable divergences or unusual patterns"],
  "summary": "2-3 sentence executive summary for the narrator"
}`
}
