import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runAgentsForPair } from '@/lib/story/agents/runner'
import { notifyUser } from '@/lib/notifications/notifier'

export const maxDuration = 300 // 5 minutes

/**
 * Daily cron: runs intelligence agents for all active pair subscriptions.
 * Runs at 4:00 AM UTC weekdays — 1 hour before story generation.
 *
 * Sequential processing to respect OANDA rate limits.
 * Individual try/catch — one pair's failure doesn't stop others.
 */
export async function GET(req: NextRequest) {
    // Verify cron secret (Bearer header or ?key= param)
    const secret = (process.env.CRON_SECRET || '').trim()
    const authHeader = req.headers.get('authorization')
    const queryKey = req.nextUrl.searchParams.get('key')
    const expectedSecret = `Bearer ${secret}`

    if (!secret) {
        console.error('Agents cron: CRON_SECRET is not configured')
        return NextResponse.json({ error: 'Config missing' }, { status: 500 })
    }

    const isAuthorized = 
        (authHeader && authHeader.trim() === expectedSecret) || 
        (queryKey && queryKey.trim() === secret)

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = createServiceClient()

    // Fetch ALL active subscriptions across all users
    const { data: subscriptions, error: subError } = await client
        .from('pair_subscriptions')
        .select('user_id, pair')
        .eq('is_active', true)

    if (subError) {
        console.error('Agents cron: Failed to fetch subscriptions:', subError.message)
        return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    if (!subscriptions?.length) {
        return NextResponse.json({ message: 'No active subscriptions', processed: 0 })
    }

    const results: Array<{ user_id: string; pair: string; status: string; agents?: string[]; error?: string }> = []

    // Process sequentially — respect OANDA rate limits
    for (const sub of subscriptions) {
        try {
            const intelligence = await runAgentsForPair(sub.user_id, sub.pair, client)

            const completedAgents: string[] = []
            if (intelligence.optimizer) completedAgents.push('optimizer')
            if (intelligence.news) completedAgents.push('news')
            if (intelligence.crossMarket) completedAgents.push('cross_market')

            results.push({
                user_id: sub.user_id,
                pair: sub.pair,
                status: completedAgents.length > 0 ? 'processed' : 'skipped',
                agents: completedAgents,
            })

            // Daily Intelligence Briefing
            if (completedAgents.length > 0) {
                let summary = ''
                if (intelligence.optimizer) summary += `📊 *Indicators:* ${intelligence.optimizer.summary.substring(0, 100)}...\n`
                if (intelligence.news) summary += `📰 *News:* ${intelligence.news.summary.substring(0, 100)}...\n`
                if (intelligence.crossMarket) summary += `🌐 *Market:* ${intelligence.crossMarket.summary.substring(0, 100)}...\n`

                await notifyUser(sub.user_id, {
                    title: `🤖 Intelligence Brief: ${sub.pair}`,
                    body: summary || 'No major insights found today.',
                    url: `/story/${sub.pair.replace('/', '-')}`
                }, client)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error(`Agents cron: Failed for ${sub.user_id}/${sub.pair}:`, message)
            results.push({ user_id: sub.user_id, pair: sub.pair, status: 'failed', error: message })
        }

        // Delay between pairs to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500))
    }

    const processed = results.filter(r => r.status === 'processed').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
        message: 'Story agents cron complete',
        processed,
        skipped,
        failed,
        total: subscriptions.length,
    })
}
