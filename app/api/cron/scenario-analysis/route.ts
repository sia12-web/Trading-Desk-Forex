import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createTask } from '@/lib/background-tasks/manager'
import { generateScenarioAnalysis } from '@/lib/scenario-analysis/pipeline'

export const maxDuration = 300 // 5 minutes

/**
 * Weekly cron: auto-generates scenario analysis for all active story pairs.
 * Runs Monday 3:30 AM UTC — before story agents (4AM) and story generation (5AM).
 *
 * Scenario Analysis is the "institutional weekly report" that story episodes reference.
 * Running weekly is sufficient since key levels, liquidity pools, and macro scenarios
 * change on a weekly basis, not daily.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization')
    const expectedSecret = `Bearer ${(process.env.CRON_SECRET || '').trim()}`

    if (!authHeader || authHeader.trim() !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = createServiceClient()

    console.log('[Cron:ScenarioAnalysis] Starting weekly scenario analysis generation')

    // Fetch ALL active subscriptions across all users
    const { data: subscriptions, error: subError } = await client
        .from('pair_subscriptions')
        .select('user_id, pair')
        .eq('is_active', true)

    if (subError) {
        console.error('[Cron:ScenarioAnalysis] Failed to fetch subscriptions:', subError.message)
        return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    if (!subscriptions?.length) {
        console.log('[Cron:ScenarioAnalysis] No active subscriptions')
        return NextResponse.json({ message: 'No active subscriptions', processed: 0 })
    }

    console.log(`[Cron:ScenarioAnalysis] Processing ${subscriptions.length} pair(s)`)

    const results: Array<{ user_id: string; pair: string; status: string; error?: string }> = []

    // Process sequentially to respect OANDA rate limits + AI API rate limits
    for (const sub of subscriptions) {
        console.log(`[Cron:ScenarioAnalysis] ── Generating for ${sub.pair} (user: ${sub.user_id.slice(0, 8)}...)`)

        try {
            const taskId = await createTask(
                sub.user_id,
                'scenario_analysis',
                { pair: sub.pair, source: 'cron' },
                client
            )

            await generateScenarioAnalysis(sub.user_id, sub.pair, taskId, { useServiceRole: true })
            results.push({ user_id: sub.user_id, pair: sub.pair, status: 'generated' })
            console.log(`[Cron:ScenarioAnalysis] ✓ ${sub.pair} completed`)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error(`[Cron:ScenarioAnalysis] ✗ ${sub.pair} failed:`, message)
            results.push({ user_id: sub.user_id, pair: sub.pair, status: 'failed', error: message })
        }

        // Delay between pairs to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const processed = results.filter(r => r.status === 'generated').length
    const failed = results.filter(r => r.status === 'failed').length

    console.log(`[Cron:ScenarioAnalysis] Done — ${processed} generated, ${failed} failed out of ${subscriptions.length}`)

    return NextResponse.json({
        message: 'Weekly scenario analysis cron complete',
        processed,
        failed,
        total: subscriptions.length,
    })
}
