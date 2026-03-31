import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentPrices, getCandles } from '@/lib/oanda/client'
import { updateScenarioStatus, deactivateSiblingScenarios } from '@/lib/data/stories'
import { createTask } from '@/lib/background-tasks/manager'
import { notifyUser } from '@/lib/notifications/notifier'
import { generateStory } from './pipeline'
import type { SupabaseClient } from '@supabase/supabase-js'

interface MonitorableScenario {
    id: string
    user_id: string
    pair: string
    title: string
    direction: string
    trigger_level: number
    trigger_direction: 'above' | 'below'
    trigger_timeframe: 'H1' | 'H4' | 'D' | null
    invalidation_level: number
    invalidation_direction: 'above' | 'below'
    episode_id: string
}

interface MonitorResult {
    checked: number
    triggered: number
    invalidated: number
    siblingsDeactivated: number
    generationsQueued: number
    skippedBusy: number
    skippedMarketClosed: boolean
}

// Map our timeframe labels to OANDA granularities
const TIMEFRAME_TO_GRANULARITY: Record<string, string> = {
    H1: 'H1',
    H4: 'H4',
    D: 'D',
}

/**
 * Check if the market is currently open (OANDA hours).
 * OANDA forex + CFD indices: Sunday 10PM UTC → Friday 10PM UTC
 */
export function isMarketOpen(): boolean {
    const now = new Date()
    const day = now.getUTCDay() // 0=Sun, 6=Sat
    const hour = now.getUTCHours()

    // Saturday: always closed
    if (day === 6) return false
    // Sunday: only open after 10PM UTC
    if (day === 0 && hour < 22) return false
    // Friday: closed after 10PM UTC
    if (day === 5 && hour >= 22) return false

    return true
}

/**
 * Fetch all active scenarios that have structured monitoring levels.
 */
async function getMonitorableScenarios(client: SupabaseClient): Promise<MonitorableScenario[]> {
    const { data, error } = await client
        .from('story_scenarios')
        .select('id, user_id, pair, title, direction, trigger_level, trigger_direction, trigger_timeframe, invalidation_level, invalidation_direction, episode_id')
        .eq('status', 'active')
        .eq('monitor_active', true)
        .not('trigger_level', 'is', null)
        .not('invalidation_level', 'is', null)

    if (error) {
        console.error('[ScenarioMonitor] Failed to fetch scenarios:', error.message)
        return []
    }

    return (data || []) as MonitorableScenario[]
}

/**
 * Check if a candle close has crossed a scenario's trigger or invalidation level.
 * Uses candle CLOSE price, not spot price — prevents false triggers from wicks.
 */
function evaluateScenario(
    scenario: MonitorableScenario,
    closePrice: number
): 'triggered' | 'invalidated' | null {
    // Check trigger
    if (scenario.trigger_direction === 'above' && closePrice >= scenario.trigger_level) {
        return 'triggered'
    }
    if (scenario.trigger_direction === 'below' && closePrice <= scenario.trigger_level) {
        return 'triggered'
    }

    // Check invalidation
    if (scenario.invalidation_direction === 'above' && closePrice >= scenario.invalidation_level) {
        return 'invalidated'
    }
    if (scenario.invalidation_direction === 'below' && closePrice <= scenario.invalidation_level) {
        return 'invalidated'
    }

    return null
}

/**
 * Check if a story_generation task is already running for this user+pair.
 * Prevents duplicate generation when scenarios resolve rapidly.
 */
async function isGenerationAlreadyRunning(
    client: SupabaseClient,
    userId: string,
    pair: string
): Promise<boolean> {
    const { data } = await client
        .from('background_tasks')
        .select('id')
        .eq('user_id', userId)
        .eq('task_type', 'story_generation')
        .in('status', ['pending', 'running'])
        .limit(1)

    if (!data?.length) return false

    // Check if it's for this pair (metadata contains pair)
    const { data: tasks } = await client
        .from('background_tasks')
        .select('id, metadata')
        .eq('user_id', userId)
        .eq('task_type', 'story_generation')
        .in('status', ['pending', 'running'])

    return (tasks || []).some(t => {
        const meta = t.metadata as Record<string, unknown> | null
        return meta?.pair === pair
    })
}

/**
 * Fetch the latest CLOSED candle's close price for a given pair and timeframe.
 * Returns null if the candle data can't be fetched.
 */
async function getLatestCandleClose(
    instrument: string,
    timeframe: string
): Promise<{ close: number; time: string } | null> {
    const granularity = TIMEFRAME_TO_GRANULARITY[timeframe]
    if (!granularity) return null

    const { data: candles, error } = await getCandles({
        instrument,
        granularity,
        count: 2,  // Get 2 to ensure we have the latest COMPLETED candle
        price: 'M',
    })

    if (error || !candles?.length) return null

    // Find the latest completed candle (complete: true)
    const completedCandle = candles
        .filter(c => c.complete)
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]

    if (!completedCandle) return null

    return {
        close: parseFloat(completedCandle.mid.c),
        time: completedCandle.time,
    }
}

/**
 * Main orchestrator: check all monitorable scenarios against candle closes.
 * Uses candle close prices (not spot) to prevent false triggers from wicks.
 *
 * Lifecycle: When one scenario triggers, its sibling is auto-invalidated,
 * and a new episode is queued (passing the triggered scenario context).
 */
export async function runScenarioMonitor(): Promise<MonitorResult> {
    const result: MonitorResult = {
        checked: 0,
        triggered: 0,
        invalidated: 0,
        siblingsDeactivated: 0,
        generationsQueued: 0,
        skippedBusy: 0,
        skippedMarketClosed: false,
    }

    // Guard: market must be open
    if (!isMarketOpen()) {
        result.skippedMarketClosed = true
        console.log('[ScenarioMonitor] Market closed, skipping.')
        return result
    }

    const client = createServiceClient()
    const scenarios = await getMonitorableScenarios(client)

    if (scenarios.length === 0) {
        console.log('[ScenarioMonitor] No monitorable scenarios found.')
        return result
    }

    result.checked = scenarios.length

    // Group scenarios by pair+timeframe for efficient candle fetching
    const pairTimeframeMap = new Map<string, MonitorableScenario[]>()
    for (const s of scenarios) {
        const tf = s.trigger_timeframe || 'H1'
        const key = `${s.pair}|${tf}`
        if (!pairTimeframeMap.has(key)) {
            pairTimeframeMap.set(key, [])
        }
        pairTimeframeMap.get(key)!.push(s)
    }

    // Fetch candle closes for each pair+timeframe combo
    const closePriceMap = new Map<string, { close: number; time: string }>()
    const fetchPromises = Array.from(pairTimeframeMap.keys()).map(async (key) => {
        const [pair, timeframe] = key.split('|')
        const instrument = pair.replace('/', '_')

        const candleData = await getLatestCandleClose(instrument, timeframe)
        if (candleData) {
            closePriceMap.set(key, candleData)
        }
    })
    await Promise.all(fetchPromises)

    // Also fetch spot prices for invalidation fallback
    const uniquePairs = [...new Set(scenarios.map(s => s.pair))]
    const instruments = uniquePairs.map(p => p.replace('/', '_'))
    const { data: spotPrices } = await getCurrentPrices(instruments)
    const spotPriceMap: Record<string, number> = {}
    for (const p of spotPrices || []) {
        const mid = (parseFloat(p.asks[0].price) + parseFloat(p.bids[0].price)) / 2
        spotPriceMap[p.instrument.replace('_', '/')] = mid
    }

    // Track which user+pair combos need new episodes (with triggered context)
    const generationQueue: Array<{
        userId: string
        pair: string
        triggeredScenarioId: string
        triggeredEpisodeId: string
    }> = []

    // Evaluate each scenario against its timeframe's candle close
    for (const scenario of scenarios) {
        const tf = scenario.trigger_timeframe || 'H1'
        const key = `${scenario.pair}|${tf}`
        const candleData = closePriceMap.get(key)

        // Use candle close for trigger evaluation, fall back to spot for invalidation
        const closePrice = candleData?.close
        const spotPrice = spotPriceMap[scenario.pair]

        if (closePrice == null && spotPrice == null) continue

        // Primary: evaluate on candle close (prevents wick false triggers)
        let evaluation: 'triggered' | 'invalidated' | null = null
        let priceUsed = 0
        let method = ''

        if (closePrice != null) {
            evaluation = evaluateScenario(scenario, closePrice)
            priceUsed = closePrice
            method = `${tf} candle close`
        }

        // If no trigger from candle close, check spot price for invalidation only
        // (invalidation is more urgent — a wick below support IS a break)
        if (!evaluation && spotPrice != null) {
            // Only check invalidation on spot — triggers need candle close confirmation
            if (scenario.invalidation_direction === 'above' && spotPrice >= scenario.invalidation_level) {
                evaluation = 'invalidated'
                priceUsed = spotPrice
                method = 'spot price'
            }
            if (scenario.invalidation_direction === 'below' && spotPrice <= scenario.invalidation_level) {
                evaluation = 'invalidated'
                priceUsed = spotPrice
                method = 'spot price'
            }
        }

        if (!evaluation) continue

        // Resolve the scenario
        const candleTimeStr = candleData?.time ? ` (candle: ${new Date(candleData.time).toISOString()})` : ''
        const outcomeNotes = evaluation === 'triggered'
            ? `Bot detected: ${tf} candle close at ${priceUsed.toFixed(5)} confirmed trigger level ${scenario.trigger_level} (${scenario.trigger_direction})${candleTimeStr}`
            : `Bot detected: ${method} ${priceUsed.toFixed(5)} crossed invalidation level ${scenario.invalidation_level} (${scenario.invalidation_direction})`

        try {
            await updateScenarioStatus(
                scenario.id,
                evaluation,
                outcomeNotes,
                'bot',
                client
            )

            // Binary pair logic: deactivate sibling scenario from the same episode
            const siblingCount = await deactivateSiblingScenarios(scenario.id, scenario.episode_id, client)
            result.siblingsDeactivated += siblingCount
            if (siblingCount > 0) {
                console.log(`[ScenarioMonitor] Deactivated ${siblingCount} sibling scenario(s) for episode ${scenario.episode_id}`)
            }

            // Notify user with timeframe context
            const triggerDetail = evaluation === 'triggered'
                ? `${tf} candle closed ${scenario.trigger_direction} ${scenario.trigger_level.toFixed(5)} at ${priceUsed.toFixed(5)}`
                : `Price ${priceUsed.toFixed(5)} broke ${scenario.invalidation_direction} invalidation ${scenario.invalidation_level.toFixed(5)}`

            await notifyUser(scenario.user_id, {
                title: `${evaluation === 'triggered' ? 'Scenario Triggered' : 'Scenario Invalidated'}: ${scenario.pair}`,
                body: `${scenario.title}\n\n${triggerDetail}\n\nThe Desk is reviewing this for you.`,
                url: `/story/${scenario.pair.replace('/', '-')}`
            }, client)

            if (evaluation === 'triggered') {
                result.triggered++

                // Post a desk alert message for the triggered scenario
                await client.from('desk_messages').insert({
                    user_id: scenario.user_id,
                    speaker: 'sarah',
                    message: `SCENARIO TRIGGERED: ${scenario.pair} — "${scenario.title}". ${tf} candle closed ${scenario.trigger_direction} ${scenario.trigger_level.toFixed(5)} at ${priceUsed.toFixed(5)}. Review your position sizing before entry.`,
                    message_type: 'alert',
                    context_data: {
                        scenario_id: scenario.id,
                        pair: scenario.pair,
                        trigger_level: scenario.trigger_level,
                        trigger_timeframe: tf,
                        close_price: priceUsed,
                    },
                })

                // Queue generation for triggered scenarios (with context)
                const alreadyQueued = generationQueue.some(
                    g => g.userId === scenario.user_id && g.pair === scenario.pair
                )
                if (!alreadyQueued) {
                    generationQueue.push({
                        userId: scenario.user_id,
                        pair: scenario.pair,
                        triggeredScenarioId: scenario.id,
                        triggeredEpisodeId: scenario.episode_id,
                    })
                }
            } else {
                result.invalidated++
            }

            console.log(`[ScenarioMonitor] ${scenario.pair} "${scenario.title}" → ${evaluation} via ${method} at ${priceUsed.toFixed(5)}`)
        } catch (error) {
            console.error(`[ScenarioMonitor] Failed to resolve ${scenario.id}:`, error instanceof Error ? error.message : error)
        }
    }

    // Queue new episode generation for triggered scenarios (fire-and-forget)
    for (const item of generationQueue) {
        try {
            // Guard: don't queue if a generation is already running for this pair
            const busy = await isGenerationAlreadyRunning(client, item.userId, item.pair)
            if (busy) {
                result.skippedBusy++
                console.log(`[ScenarioMonitor] ${item.pair} generation skipped (already running)`)
                continue
            }

            const taskId = await createTask(
                item.userId,
                'story_generation',
                { pair: item.pair, source: 'bot', trigger: 'scenario_monitor', triggeredScenarioId: item.triggeredScenarioId },
                client
            )

            // Fire-and-forget: don't await story generation
            generateStory(item.userId, item.pair, taskId, {
                useServiceRole: true,
                generationSource: 'bot',
                triggeredScenarioId: item.triggeredScenarioId,
                triggeredEpisodeId: item.triggeredEpisodeId,
            }).catch(err => {
                console.error(`[ScenarioMonitor] Background story generation failed for ${item.pair}:`, err instanceof Error ? err.message : err)
            })

            result.generationsQueued++
            console.log(`[ScenarioMonitor] Queued new episode for ${item.pair} (task: ${taskId}, triggered: ${item.triggeredScenarioId})`)
        } catch (error) {
            console.error(`[ScenarioMonitor] Failed to queue generation for ${item.pair}:`, error instanceof Error ? error.message : error)
        }
    }

    console.log(`[ScenarioMonitor] Done: checked=${result.checked} triggered=${result.triggered} invalidated=${result.invalidated} siblings=${result.siblingsDeactivated} queued=${result.generationsQueued} busy=${result.skippedBusy}`)
    return result
}
