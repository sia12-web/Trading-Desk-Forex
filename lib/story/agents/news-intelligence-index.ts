import { callGemini } from '@/lib/ai/clients'
import { parseAIJson } from '@/lib/ai/parse-response'
import { fetchForexNews } from '@/lib/news/forex-news-client'
import { fetchForexFactoryCalendar, getNewsContextForAI } from '@/lib/news/forex-factory-client'
import { saveAgentReport } from './data'
import { getAssetConfig } from '../asset-config'
import type { IndexNewsIntelligenceReport } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Index News Intelligence Agent — fundamentals-first analysis for CFD indices.
 * Focuses on: Fed/ECB policy, earnings, sector rotation, VIX, dollar impact.
 */
export async function runIndexNewsIntelligence(
    pair: string,
    userId: string,
    client: SupabaseClient
): Promise<IndexNewsIntelligenceReport | null> {
    const start = Date.now()
    const config = getAssetConfig(pair)
    const meta = config.indexMeta!

    try {
        const [headlines, calendar, newsContext] = await Promise.all([
            fetchForexNews(30),
            fetchForexFactoryCalendar(),
            getNewsContextForAI(pair),
        ])

        const prompt = buildIndexNewsPrompt(pair, meta, headlines, calendar, newsContext)
        const rawOutput = await callGemini(prompt, { timeout: 60_000, maxTokens: 4096 })
        const report = parseAIJson<IndexNewsIntelligenceReport>(rawOutput)
        report.pair = pair

        await saveAgentReport(userId, pair, 'news_intelligence', report as unknown as Record<string, unknown>, {
            rawOutput, model: 'gemini-1.5-flash', durationMs: Date.now() - start,
        }, client)

        return report
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Index news intelligence failed for ${pair}:`, message)
        await saveAgentReport(userId, pair, 'news_intelligence', {}, {
            model: 'gemini-1.5-flash', durationMs: Date.now() - start, error: message,
        }, client)
        return null
    }
}

function buildIndexNewsPrompt(
    pair: string,
    meta: NonNullable<ReturnType<typeof getAssetConfig>['indexMeta']>,
    headlines: Array<{ title: string; source: string; time: string }>,
    calendar: Array<{ title: string; country: string; date: string; impact: string; forecast: string; previous: string; currency: string }>,
    newsContext: string
): string {
    // Search terms for this index
    const searchTerms = [
        meta.displayName,
        ...meta.keySectors.slice(0, 3),
        meta.country === 'US' ? 'Fed' : 'ECB',
        meta.country === 'US' ? 'Wall Street' : 'European markets',
        'earnings', 'VIX', 'S&P', 'Nasdaq', 'Dow',
    ]

    const relevantHeadlines = headlines.filter(h => {
        const upper = h.title.toUpperCase()
        return searchTerms.some(term => upper.includes(term.toUpperCase()))
    })

    const countryCurrency = meta.country === 'US' ? 'USD' : meta.country === 'DE' ? 'EUR' : 'USD'
    const relevantCalendar = calendar.filter(e =>
        e.currency === countryCurrency || e.impact === 'High'
    )

    const headlineBlock = relevantHeadlines.length > 0
        ? relevantHeadlines.slice(0, 20).map(h => `- ${h.title} (${h.source}, ${h.time})`).join('\n')
        : 'No directly relevant headlines found. Use general market context.'

    const calendarBlock = relevantCalendar.length > 0
        ? relevantCalendar.slice(0, 15).map(e =>
            `- ${e.title} (${e.currency}) — ${e.impact} impact — Forecast: ${e.forecast || 'N/A'}, Previous: ${e.previous || 'N/A'}, Date: ${e.date}`
        ).join('\n')
        : 'No high-impact events this week.'

    return `You are a senior equity/macro strategist specializing in stock indices. Produce a FUNDAMENTALS-FIRST intelligence report for ${meta.displayName} (${pair}).

## INDEX: ${meta.displayName} (${pair})
Country: ${meta.country}
Sector Composition: ${meta.sector}
Key Sectors: ${meta.keySectors.join(', ')}
Central Bank: ${meta.centralBank}

## NEWS HEADLINES (filtered for index-relevant terms)
${headlineBlock}

## ECONOMIC CALENDAR
${calendarBlock}

## ADDITIONAL CONTEXT
${newsContext}

## YOUR ANALYSIS TASK

This is a STOCK INDEX, not a currency pair. Your analysis must be equity-focused:

1. **Monetary Policy**: ${meta.centralBank} current stance (hawkish/dovish/neutral), rate path expectations, QT/QE status, next meeting date. This is the #1 driver for indices.
2. **Economic Outlook**: GDP trajectory, inflation status, labor market health. Is the economy supporting or threatening equities?
3. **Earnings Context**: Are we in earnings season? Which mega-caps have reported or are reporting? Sector-level beat/miss trends.
4. **Risk Appetite**: VIX assessment, institutional equity flows, credit spread conditions. Is money flowing into or out of equities?
5. **Sector Dynamics**: Which sectors are leading/lagging the ${meta.displayName}? Any notable rotation?
6. **Dollar Impact**: DXY trend and its implication for this index (strong dollar = headwind for US multinationals).
7. **Key Risks & Catalysts**: What could cause a 2%+ move this week?
8. **Fundamental Scenarios (IF-THEN)**: Create 2-3 logical scenarios based on upcoming news (e.g., "If [speaker/event] says [outcome], then [impact on ${meta.displayName}]"). This is CRITICAL for the Story narrator Alex.

Respond with JSON (no markdown fences):
{
  "pair": "${pair}",
  "monetary_policy": {
    "central_bank": "${meta.centralBank}",
    "current_stance": "hawkish" | "dovish" | "neutral",
    "rate_path": "Expected rate path (1-2 sentences)",
    "qt_status": "ongoing" | "tapering" | "ended" | "N/A",
    "next_meeting": "Date or 'upcoming' or 'not imminent'"
  },
  "economic_outlook": {
    "growth_trajectory": "accelerating" | "decelerating" | "stable",
    "inflation_status": "Current inflation assessment (1 sentence)",
    "labor_market": "Current labor market status (1 sentence)",
    "key_data_this_week": ["NFP Friday", "CPI Wednesday", ...]
  },
  "earnings_context": {
    "season_status": "peak" | "early" | "winding_down" | "off_season",
    "notable_reports": ["AAPL beat estimates +5%", "NVDA reports Thursday", ...],
    "sector_surprises": "Which sectors are beating/missing and by how much"
  },
  "risk_appetite": {
    "vix_assessment": "VIX level and what it signals (1 sentence)",
    "institutional_flow": "Fund flow direction (1 sentence)",
    "overall": "risk_on" | "risk_off" | "neutral"
  },
  "sector_dynamics": {
    "leading_sectors": ["tech", "AI"],
    "lagging_sectors": ["energy", "utilities"],
    "rotation_narrative": "What the sector rotation tells us (1-2 sentences)"
  },
  "dollar_impact": {
    "dxy_trend": "DXY direction and strength (1 sentence)",
    "implication": "How this affects ${meta.displayName} (1 sentence)"
  },
  "key_risks": [
    {"risk": "Description", "probability": "low/medium/high", "impact_direction": "bullish" | "bearish"}
  ],
  "upcoming_catalysts": [
    {"event": "Event name", "date": "YYYY-MM-DD", "expected_impact": "How it affects ${meta.displayName}"}
  ],
  "fundamental_scenarios": [
    {"condition": "If Fed mentions rate cut", "outcome": "Yields drop", "impact": "Bullish for ${meta.displayName}"}
  ],
  "fundamental_narrative": "3-5 sentence fundamental story for ${meta.displayName}. What is the MAIN theme driving this index right now?",
  "summary": "2-3 sentence executive summary for the story narrator"
}`
}
