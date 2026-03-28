import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/ai/rate-limiter'
import { collectStoryData } from '@/lib/story/data-collector'
import { runIndicatorOptimizer } from '@/lib/story/agents/indicator-optimizer'
import { isValidPair } from '@/lib/utils/valid-pairs'

export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pair = req.nextUrl.searchParams.get('pair')
    if (!pair || !isValidPair(pair)) {
        return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch cached optimizations
    const { data: optimizations } = await supabase
        .from('indicator_optimizations')
        .select('*')
        .eq('user_id', user.id)
        .eq('pair', pair)
        .order('optimized_at', { ascending: false })

    // Fetch latest agent report for regime + summary
    const { data: reports } = await supabase
        .from('story_agent_reports')
        .select('report, created_at')
        .eq('user_id', user.id)
        .eq('pair', pair)
        .eq('agent_type', 'indicator_optimizer')
        .order('created_at', { ascending: false })
        .limit(1)

    const latestReport = reports?.[0]?.report as Record<string, unknown> | undefined

    return NextResponse.json({
        optimizations: optimizations ?? [],
        regime: latestReport?.market_regime ?? null,
        regimeImplications: latestReport?.regime_implications ?? null,
        summary: latestReport?.summary ?? null,
        optimizedAt: reports?.[0]?.created_at ?? null,
    })
}

export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const pair = body.pair as string
    if (!pair || !isValidPair(pair)) {
        return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    }

    // Rate limit (shared 5/hr pool)
    const limit = await checkRateLimit(user.id)
    if (!limit.allowed) {
        const minutes = Math.ceil(limit.resetIn / 60_000)
        return NextResponse.json(
            { error: `Rate limit exceeded. Try again in ${minutes} minutes.` },
            { status: 429 }
        )
    }

    try {
        const supabase = await createClient()
        const data = await collectStoryData(user.id, pair, supabase)
        const report = await runIndicatorOptimizer(pair, data, user.id, supabase)

        if (!report) {
            return NextResponse.json({ error: 'Optimizer failed to produce results' }, { status: 500 })
        }

        return NextResponse.json({
            optimizations: report.optimizations,
            regime: report.market_regime,
            regimeImplications: report.regime_implications,
            summary: report.summary,
            optimizedAt: new Date().toISOString(),
            remaining: limit.remaining,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('Indicator optimizer API error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
