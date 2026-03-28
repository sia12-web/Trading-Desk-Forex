import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const days = Math.max(1, Math.min(365, parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const client = await createClient()

    // Get per-provider aggregates
    const { data: providerStats, error: providerError } = await client.rpc('get_ai_usage_by_provider', {
        p_user_id: user.id,
        p_since: since,
    }).select('*')

    // If RPC doesn't exist, fall back to raw query
    if (providerError) {
        // Direct query approach
        const { data: logs, error: logsError } = await client
            .from('ai_usage_logs')
            .select('provider, model, feature, input_tokens, output_tokens, cache_read_tokens, estimated_cost_usd, duration_ms, success, created_at')
            .eq('user_id', user.id)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(500)

        if (logsError) {
            return NextResponse.json({ error: logsError.message }, { status: 500 })
        }

        // Aggregate in JS
        const byProvider: Record<string, {
            provider: string
            model: string
            totalCalls: number
            successCalls: number
            failedCalls: number
            totalInputTokens: number
            totalOutputTokens: number
            totalCacheReadTokens: number
            totalCost: number
            avgDuration: number
            features: Record<string, number>
        }> = {}

        for (const log of logs || []) {
            const key = log.provider
            if (!byProvider[key]) {
                byProvider[key] = {
                    provider: log.provider,
                    model: log.model,
                    totalCalls: 0,
                    successCalls: 0,
                    failedCalls: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                    totalCacheReadTokens: 0,
                    totalCost: 0,
                    avgDuration: 0,
                    features: {},
                }
            }
            const p = byProvider[key]
            p.totalCalls++
            if (log.success) p.successCalls++
            else p.failedCalls++
            p.totalInputTokens += log.input_tokens || 0
            p.totalOutputTokens += log.output_tokens || 0
            p.totalCacheReadTokens += log.cache_read_tokens || 0
            p.totalCost += parseFloat(log.estimated_cost_usd) || 0
            p.avgDuration += log.duration_ms || 0
            p.features[log.feature] = (p.features[log.feature] || 0) + 1
        }

        // Compute averages
        for (const p of Object.values(byProvider)) {
            p.avgDuration = p.totalCalls > 0 ? Math.round(p.avgDuration / p.totalCalls) : 0
        }

        // Daily breakdown for chart
        const byDay: Record<string, { date: string; anthropic: number; google: number; deepseek: number }> = {}
        for (const log of logs || []) {
            const day = log.created_at.split('T')[0]
            if (!byDay[day]) byDay[day] = { date: day, anthropic: 0, google: 0, deepseek: 0 }
            byDay[day][log.provider as 'anthropic' | 'google' | 'deepseek'] += parseFloat(log.estimated_cost_usd) || 0
        }

        return NextResponse.json({
            providers: Object.values(byProvider),
            dailyCosts: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
            totalCost: Object.values(byProvider).reduce((sum, p) => sum + p.totalCost, 0),
            totalCalls: Object.values(byProvider).reduce((sum, p) => sum + p.totalCalls, 0),
            period: { days, since },
        })
    }

    return NextResponse.json({ providers: providerStats })
}
