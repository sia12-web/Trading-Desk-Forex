import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createTask } from '@/lib/background-tasks/manager'
import { generateStory } from '@/lib/story/pipeline'
import { getCurrentPrices } from '@/lib/oanda/client'

const MIN_HOURS_BETWEEN_EPISODES = 12
const MIN_ATR_MOVE_RATIO = 0.3 // Price must move at least 30% of ATR since last episode

/**
 * Daily cron: auto-generates story episodes for all active pair subscriptions.
 * Runs at 5:00 AM UTC, weekdays only.
 *
 * SMART TIMING: Does NOT blindly generate. Checks:
 * 1. Already generated today? → skip
 * 2. Last episode too recent (< 12h)? → skip
 * 3. Price hasn't moved enough (< 30% ATR)? → skip (unless scenario resolved)
 * 4. Scenario just resolved? → always generate (important plot development)
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization')
    const expectedSecret = `Bearer ${(process.env.CRON_SECRET || '').trim()}`

    if (!authHeader || authHeader.trim() !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = createServiceClient()
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    console.log('[Cron:StoryGen] Starting smart episode generation')

    const { data: subscriptions, error: subError } = await client
        .from('pair_subscriptions')
        .select('user_id, pair')
        .eq('is_active', true)

    if (subError) {
        console.error('[Cron:StoryGen] Failed to fetch subscriptions:', subError.message)
        return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    if (!subscriptions?.length) {
        return NextResponse.json({ message: 'No active subscriptions', processed: 0 })
    }

    // Check which pairs already have an episode generated today
    const { data: todayEpisodes } = await client
        .from('story_episodes')
        .select('user_id, pair')
        .gte('created_at', `${today}T00:00:00Z`)
        .lte('created_at', `${today}T23:59:59Z`)

    const alreadyGenerated = new Set(
        (todayEpisodes || []).map(e => `${e.user_id}:${e.pair}`)
    )

    const results: Array<{ user_id: string; pair: string; status: string; reason?: string; error?: string }> = []

    for (const sub of subscriptions) {
        const key = `${sub.user_id}:${sub.pair}`
        const instrument = sub.pair.replace('/', '_')

        // ── Check 1: Already generated today ──
        if (alreadyGenerated.has(key)) {
            console.log(`[Cron:StoryGen] ${sub.pair} — skipped: already generated today`)
            results.push({ user_id: sub.user_id, pair: sub.pair, status: 'skipped', reason: 'already_today' })
            continue
        }

        // ── Check 2: Last episode recency + price movement ──
        try {
            const { data: lastEp } = await client
                .from('story_episodes')
                .select('created_at, raw_ai_output')
                .eq('user_id', sub.user_id)
                .eq('pair', sub.pair)
                .order('episode_number', { ascending: false })
                .limit(1)
                .single()

            if (lastEp) {
                const hoursSince = (now.getTime() - new Date(lastEp.created_at).getTime()) / (1000 * 60 * 60)

                // Check if a scenario was recently resolved (important event = always generate)
                const { count: recentResolvedCount } = await client
                    .from('story_scenarios')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', sub.user_id)
                    .eq('pair', sub.pair)
                    .in('status', ['triggered', 'invalidated'])
                    .gte('resolved_at', lastEp.created_at)

                const hasRecentResolution = (recentResolvedCount || 0) > 0

                if (hasRecentResolution) {
                    console.log(`[Cron:StoryGen] ${sub.pair} — generating: scenario resolved since last episode`)
                } else if (hoursSince < MIN_HOURS_BETWEEN_EPISODES) {
                    console.log(`[Cron:StoryGen] ${sub.pair} — skipped: last episode ${hoursSince.toFixed(1)}h ago (min: ${MIN_HOURS_BETWEEN_EPISODES}h)`)
                    results.push({ user_id: sub.user_id, pair: sub.pair, status: 'skipped', reason: `too_recent_${hoursSince.toFixed(0)}h` })
                    continue
                } else {
                    // Check price movement vs ATR
                    const lastOutput = lastEp.raw_ai_output as Record<string, unknown> | null
                    const lastKeyLevels = lastOutput?.key_levels as { entries?: number[] } | undefined
                    const lastEntry = lastKeyLevels?.entries?.[0]

                    if (lastEntry) {
                        const { data: prices } = await getCurrentPrices([instrument])
                        if (prices?.[0]) {
                            const currentPrice = (parseFloat(prices[0].asks[0].price) + parseFloat(prices[0].bids[0].price)) / 2
                            const priceMoveAbs = Math.abs(currentPrice - lastEntry)
                            // Rough ATR estimate from the pair (use 50 pips as default if unavailable)
                            const approxAtrPips = 0.005 // ~50 pips for major pairs
                            const moveRatio = priceMoveAbs / approxAtrPips

                            if (moveRatio < MIN_ATR_MOVE_RATIO) {
                                console.log(`[Cron:StoryGen] ${sub.pair} — skipped: price moved ${(priceMoveAbs * 10000).toFixed(1)} pips (< 30% ATR), market quiet`)
                                results.push({ user_id: sub.user_id, pair: sub.pair, status: 'skipped', reason: 'low_movement' })
                                continue
                            }
                        }
                    }
                }
            }
        } catch {
            // If checks fail, generate anyway (first episode or DB issue)
        }

        // ── Generate episode ──
        console.log(`[Cron:StoryGen] ${sub.pair} — generating new episode`)
        try {
            const taskId = await createTask(
                sub.user_id,
                'story_generation',
                { pair: sub.pair, source: 'cron' },
                client
            )

            await generateStory(sub.user_id, sub.pair, taskId, { useServiceRole: true, generationSource: 'cron' })
            results.push({ user_id: sub.user_id, pair: sub.pair, status: 'generated' })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error(`[Cron:StoryGen] ${sub.pair} — FAILED:`, message)
            results.push({ user_id: sub.user_id, pair: sub.pair, status: 'failed', error: message })
        }
    }

    const processed = results.filter(r => r.status === 'generated').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const failed = results.filter(r => r.status === 'failed').length

    console.log(`[Cron:StoryGen] Done — ${processed} generated, ${skipped} skipped, ${failed} failed`)

    return NextResponse.json({
        message: `Story cron complete`,
        processed,
        skipped,
        failed,
        total: subscriptions.length,
        details: results,
    })
}
