import { collectCMSData } from '@/lib/cms/data-collector'
import { computeAllConditions } from '@/lib/cms/condition-engine'
import { saveAgentReport } from './data'
import type { CMSIntelligenceReport } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

const TAG = '[CMS-Agent]'

/**
 * CMS Intelligence Agent — computes programmatic conditions for a pair
 * and stores the top patterns as a story agent report.
 *
 * Unlike other agents, this one does NOT call any AI models.
 * All statistics are computed purely from OANDA candle data.
 */
export async function runCMSIntelligence(
    pair: string,
    userId: string,
    client: SupabaseClient,
): Promise<CMSIntelligenceReport | null> {
    const start = Date.now()

    try {
        console.log(`${TAG} Collecting CMS data for ${pair}...`)
        const data = await collectCMSData(pair)

        console.log(`${TAG} Computing conditions for ${pair}...`)
        const conditions = computeAllConditions(data)
        console.log(`${TAG} ${conditions.length} conditions passed thresholds for ${pair}`)

        if (conditions.length === 0) {
            console.log(`${TAG} No conditions met thresholds for ${pair}`)
            return null
        }

        // Sort by probability (descending), then sample_size (descending)
        const sorted = [...conditions].sort((a, b) => {
            if (b.probability !== a.probability) return b.probability - a.probability
            return b.sample_size - a.sample_size
        })

        // Take top 15 for the report
        const topConditions = sorted.slice(0, 15).map(c => ({
            condition: c.condition,
            outcome: c.outcome,
            probability: c.probability,
            sample_size: c.sample_size,
            avg_move_pips: c.avg_move_pips,
            category: c.category,
        }))

        // Build a simple market personality from the pattern distribution
        const categoryCounts = conditions.reduce((acc, c) => {
            acc[c.category] = (acc[c.category] || 0) + 1
            return acc
        }, {} as Record<string, number>)

        const topCategory = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])[0]

        const avgProb = Math.round(
            conditions.reduce((s, c) => s + c.probability, 0) / conditions.length
        )

        const personality = `${pair} shows ${conditions.length} statistically significant patterns ` +
            `(avg ${avgProb}% probability). Strongest category: ${topCategory?.[0] || 'mixed'} ` +
            `(${topCategory?.[1] || 0} patterns). ` +
            `Data covers ${data.summaryStats.total_daily_candles} daily candles ` +
            `from ${data.summaryStats.date_range.from} to ${data.summaryStats.date_range.to}.`

        const report: CMSIntelligenceReport = {
            pair,
            total_conditions: conditions.length,
            top_conditions: topConditions,
            market_personality: personality,
            data_range: data.summaryStats.date_range,
        }

        await saveAgentReport(userId, pair, 'cms_intelligence', report as unknown as Record<string, unknown>, {
            model: 'programmatic',
            durationMs: Date.now() - start,
        }, client)

        console.log(`${TAG} Done — ${topConditions.length} top conditions stored for ${pair} in ${Date.now() - start}ms`)
        return report
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`${TAG} Failed for ${pair}:`, message)
        await saveAgentReport(userId, pair, 'cms_intelligence', {}, {
            model: 'programmatic',
            durationMs: Date.now() - start,
            error: message,
        }, client)
        return null
    }
}
