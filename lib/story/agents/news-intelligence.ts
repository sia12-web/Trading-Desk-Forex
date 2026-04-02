import { callGemini } from '@/lib/ai/clients'
import { parseAIJson } from '@/lib/ai/parse-response'
import { fetchForexNews } from '@/lib/news/forex-news-client'
import { fetchForexFactoryCalendar, getNewsContextForAI } from '@/lib/news/forex-factory-client'
import { saveAgentReport } from './data'
import type { NewsIntelligenceReport } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

// Currency → Central Bank mapping
const CENTRAL_BANKS: Record<string, string> = {
    USD: 'Federal Reserve (Fed)',
    EUR: 'European Central Bank (ECB)',
    GBP: 'Bank of England (BoE)',
    JPY: 'Bank of Japan (BoJ)',
    AUD: 'Reserve Bank of Australia (RBA)',
    CAD: 'Bank of Canada (BoC)',
    NZD: 'Reserve Bank of New Zealand (RBNZ)',
    CHF: 'Swiss National Bank (SNB)',
}

/**
 * News Intelligence Agent — uses Gemini for deep macro/fundamental analysis.
 * No OANDA calls — purely news/calendar data from existing infrastructure.
 */
export async function runNewsIntelligence(
    pair: string,
    userId: string,
    client: SupabaseClient
): Promise<NewsIntelligenceReport | null> {
    const start = Date.now()

    try {
        // Gather all news data in parallel
        const [headlines, calendar, newsContext] = await Promise.all([
            fetchForexNews(25),
            fetchForexFactoryCalendar(),
            getNewsContextForAI(pair),
        ])

        const prompt = buildNewsPrompt(pair, headlines, calendar, newsContext)
        const rawOutput = await callGemini(prompt, { timeout: 60_000, maxTokens: 4096 })
        const report = parseAIJson<NewsIntelligenceReport>(rawOutput)
        report.pair = pair

        await saveAgentReport(userId, pair, 'news_intelligence', report as unknown as Record<string, unknown>, {
            rawOutput, model: 'gemini-1.5-flash', durationMs: Date.now() - start,
        }, client)

        return report
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`News intelligence failed for ${pair}:`, message)
        await saveAgentReport(userId, pair, 'news_intelligence', {}, {
            model: 'gemini-1.5-flash', durationMs: Date.now() - start, error: message,
        }, client)
        return null
    }
}

function buildNewsPrompt(
    pair: string,
    headlines: Array<{ title: string; source: string; time: string }>,
    calendar: Array<{ title: string; country: string; date: string; impact: string; forecast: string; previous: string; currency: string }>,
    newsContext: string
): string {
    const [baseCcy, quoteCcy] = pair.split('/')
    const basBank = CENTRAL_BANKS[baseCcy] || `${baseCcy} central bank`
    const quoteBank = CENTRAL_BANKS[quoteCcy] || `${quoteCcy} central bank`

    // Filter headlines for relevant currencies
    const relevantHeadlines = headlines.filter(h =>
        h.title.toUpperCase().includes(baseCcy) || h.title.toUpperCase().includes(quoteCcy)
    )

    // Filter calendar for relevant currencies
    const relevantCalendar = calendar.filter(e =>
        e.currency === baseCcy || e.currency === quoteCcy
    )

    const headlineBlock = relevantHeadlines.length > 0
        ? relevantHeadlines.map(h => `- ${h.title} (${h.source}, ${h.time})`).join('\n')
        : 'No relevant headlines found.'

    const calendarBlock = relevantCalendar.length > 0
        ? relevantCalendar.slice(0, 15).map(e =>
            `- ${e.title} (${e.currency}) — ${e.impact} impact — Forecast: ${e.forecast || 'N/A'}, Previous: ${e.previous || 'N/A'}, Date: ${e.date}`
        ).join('\n')
        : 'No upcoming events for these currencies.'

    return `You are a senior macro-fundamental forex analyst. Produce a deep intelligence report for ${pair}.

## PAIR: ${pair}
Base Currency: ${baseCcy} (Central Bank: ${basBank})
Quote Currency: ${quoteCcy} (Central Bank: ${quoteBank})

## NEWS HEADLINES (filtered for ${baseCcy} and ${quoteCcy})
${headlineBlock}

## ECONOMIC CALENDAR (this week)
${calendarBlock}

## ADDITIONAL CONTEXT
${newsContext}

## YOUR ANALYSIS TASK

Produce a comprehensive macro-fundamental intelligence report. Analyze:

1. **Macro Environment**: Current economic outlook for each currency. GDP trajectory, employment, inflation trends.
2. **Central Bank Analysis**: Current rate, expected rate path (hiking/cutting/holding), rate differential trend between ${baseCcy} and ${quoteCcy}.
3. **Geopolitical Factors**: Wars, sanctions, elections, trade deals that affect these currencies.
4. **Sentiment**: What institutional money is doing (COT positioning if inferrable), retail positioning contrarian signals.
5. **Key Risks**: What could cause a sudden move? Probability and direction.
6. **Upcoming Catalysts**: Specific events from the calendar that could move ${pair}.
7. **Fundamental Scenarios (IF-THEN)**: Create 2-3 logical scenarios based on upcoming news (e.g., "If [speaker/event] says [outcome], then [impact on pair]"). This is CRITICAL for the Story narrator Alex.
8. **Fundamental Narrative**: A 3-5 sentence narrative about the fundamental story behind ${pair}.

Respond with JSON (no markdown fences):
{
  "pair": "${pair}",
  "macro_environment": {
    "base_currency_outlook": "${baseCcy} economic outlook (2-3 sentences)",
    "quote_currency_outlook": "${quoteCcy} economic outlook (2-3 sentences)",
    "relative_strength": "Which currency is fundamentally stronger and why"
  },
  "central_bank_analysis": {
    "base_currency_bank": "${basBank}",
    "base_rate_path": "Current stance and expected path",
    "quote_currency_bank": "${quoteBank}",
    "quote_rate_path": "Current stance and expected path",
    "rate_differential_trend": "widening" | "narrowing" | "stable"
  },
  "geopolitical_factors": ["factor1", "factor2"],
  "sentiment_indicators": {
    "institutional": "What smart money appears to be doing",
    "retail": "Retail positioning signal",
    "overall": "bullish" | "bearish" | "neutral"
  },
  "key_risks": [
    {"risk": "Description", "probability": "low/medium/high", "impact_direction": "bullish" | "bearish"}
  ],
  "upcoming_catalysts": [
    {"event": "Event name", "date": "YYYY-MM-DD", "expected_impact": "How it could affect ${pair}"}
  ],
  "fundamental_scenarios": [
    {"condition": "If Trump mentions X", "outcome": "Market sees Y", "impact": "Hawkish for USD, bearish for ${pair}"}
  ],
  "fundamental_narrative": "3-5 sentence fundamental story for ${pair}",
  "summary": "2-3 sentence executive summary for the narrator"
}`
}
