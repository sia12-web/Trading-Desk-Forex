import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentIntelligence, IndicatorOptimizerReport, NewsIntelligenceReport, CrossMarketReport, CMSIntelligenceReport } from './types'

type AgentType = 'indicator_optimizer' | 'news_intelligence' | 'cross_market' | 'cms_intelligence'

/**
 * Upsert an agent report (deduped by user+pair+agent+date).
 */
export async function saveAgentReport(
    userId: string,
    pair: string,
    agentType: AgentType,
    report: Record<string, unknown>,
    meta: { rawOutput?: string; model?: string; durationMs?: number; error?: string },
    client: SupabaseClient
): Promise<void> {
    const today = new Date().toISOString().split('T')[0]

    const { error } = await client
        .from('story_agent_reports')
        .upsert({
            user_id: userId,
            pair,
            agent_type: agentType,
            report_date: today,
            report,
            raw_ai_output: meta.rawOutput ?? null,
            model_used: meta.model ?? null,
            duration_ms: meta.durationMs ?? null,
            status: meta.error ? 'failed' : 'completed',
            error: meta.error ?? null,
        }, {
            onConflict: 'user_id,pair,agent_type,report_date',
        })

    if (error) {
        console.error(`Failed to save ${agentType} report for ${pair}:`, error.message)
    }
}

/**
 * Fetch today's 3 agent reports for a pair and return as AgentIntelligence.
 */
export async function getAgentReportsForPair(
    userId: string,
    pair: string,
    client: SupabaseClient
): Promise<AgentIntelligence> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await client
        .from('story_agent_reports')
        .select('agent_type, report, created_at')
        .eq('user_id', userId)
        .eq('pair', pair)
        .eq('report_date', today)
        .eq('status', 'completed')

    if (error) {
        console.error('Failed to fetch agent reports:', error.message)
    }

    const reports = data || []

    const optimizer = reports.find(r => r.agent_type === 'indicator_optimizer')
    const news = reports.find(r => r.agent_type === 'news_intelligence')
    const crossMarket = reports.find(r => r.agent_type === 'cross_market')
    const cms = reports.find(r => r.agent_type === 'cms_intelligence')

    return {
        optimizer: optimizer?.report as unknown as IndicatorOptimizerReport ?? null,
        news: news?.report as unknown as NewsIntelligenceReport ?? null,
        crossMarket: crossMarket?.report as unknown as CrossMarketReport ?? null,
        cms: cms?.report as unknown as CMSIntelligenceReport ?? null,
        generatedAt: reports[0]?.created_at ?? new Date().toISOString(),
    }
}

/**
 * Check which agents already ran today for a user+pair (for dedup).
 */
export async function getTodayReportTypes(
    userId: string,
    pair: string,
    client: SupabaseClient
): Promise<string[]> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await client
        .from('story_agent_reports')
        .select('agent_type')
        .eq('user_id', userId)
        .eq('pair', pair)
        .eq('report_date', today)
        .eq('status', 'completed')

    if (error) {
        console.error('Failed to check today reports:', error.message)
        return []
    }

    return (data || []).map(r => r.agent_type)
}
