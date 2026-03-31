import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callGemini } from '@/lib/ai/clients/gemini'
import { parseAIJson } from '@/lib/ai/parse-response'
import { createTask, updateProgress, completeTask, failTask } from '@/lib/background-tasks/manager'
import { notifyUser } from '@/lib/notifications/notifier'
import { collectDeskContext } from './data-collector'
import { buildMorningMeetingPrompt } from './prompts/morning-meeting'
import { buildTradeReviewPrompt } from './prompts/trade-review'
import type { VolatilitySnapshot } from './prompts/trade-review'
import { buildProcessScoringPrompt } from './prompts/process-scoring'
import { getCandles } from '@/lib/oanda/client'
import { calculateATR, getATRStatus } from '@/lib/utils/atr'
import { getAssetConfig } from '@/lib/story/asset-config'
import type {
    DeskMeeting,
    MorningMeetingOutput,
    TradeReviewOutput,
    ProcessScoreOutput,
    ProcessScore,
    TradeProposal,
    DeskState,
} from './types'
import type { ClosedTradeForScoring } from './prompts/process-scoring'

const DESK_MODEL = 'gemini-3-flash-preview'

// =============================================================================
// Morning Meeting Generator
// =============================================================================

export async function generateMorningMeeting(
    userId: string,
    taskId: string
): Promise<DeskMeeting> {
    const supabase = await createClient()

    try {
        await updateProgress(taskId, 10, 'Collecting desk data...')

        // 1. Collect all context
        const context = await collectDeskContext(userId)
        await updateProgress(taskId, 30, 'Alex is reviewing overnight macro...')

        // 2. Build prompt
        const prompt = buildMorningMeetingPrompt(context)
        await updateProgress(taskId, 40, 'Ray is crunching the numbers...')

        // 3. Call Gemini (single call for all 4 characters)
        const start = Date.now()
        const raw = await callGemini(prompt, {
            maxTokens: 4096,
            model: DESK_MODEL,
            usage: { userId, feature: 'desk_morning_meeting' },
        })
        const elapsed = Date.now() - start

        await updateProgress(taskId, 70, 'Sarah is checking risk compliance...')

        // 4. Parse output
        const output = parseAIJson<MorningMeetingOutput>(raw)

        await updateProgress(taskId, 80, 'Marcus is setting priorities...')

        // 5. Store meeting
        const { data: meeting, error } = await supabase
            .from('desk_meetings')
            .insert({
                user_id: userId,
                meeting_type: 'morning_meeting',
                alex_brief: output.alex_brief,
                ray_analysis: output.ray_analysis,
                sarah_report: output.sarah_report,
                marcus_directive: output.marcus_directive,
                context_snapshot: context as unknown as Record<string, unknown>,
                ai_model: DESK_MODEL,
                generation_duration_ms: elapsed,
            })
            .select()
            .single()

        if (error) throw new Error(`Failed to save meeting: ${error.message}`)

        // 6. Store individual messages for the feed
        const messages = [
            { speaker: 'alex', message: output.alex_brief.message, message_type: 'comment', context_data: output.alex_brief },
            { speaker: 'ray', message: output.ray_analysis.message, message_type: 'comment', context_data: output.ray_analysis },
            { speaker: 'sarah', message: output.sarah_report.message, message_type: output.sarah_report.violations.length > 0 ? 'alert' : 'comment', context_data: output.sarah_report },
            { speaker: 'marcus', message: output.marcus_directive.message, message_type: output.marcus_directive.desk_verdict === 'blocked' ? 'block' : 'comment', context_data: output.marcus_directive },
        ]

        await supabase.from('desk_messages').insert(
            messages.map(m => ({
                user_id: userId,
                meeting_id: meeting.id,
                speaker: m.speaker,
                message: m.message,
                message_type: m.message_type,
                context_data: m.context_data,
            }))
        )

        // 7. Update desk state
        await updateDeskState(supabase, userId, output)

        await updateProgress(taskId, 90, 'Sending to Telegram...')

        // 8. Telegram notification
        await notifyUser(userId, {
            title: 'Morning Meeting - The Desk',
            body: formatMeetingForTelegram(output),
            url: '/',
        }).catch(err => console.error('Telegram notification failed:', err))

        // 9. Complete task
        await completeTask(taskId, { meetingId: meeting.id })

        return meeting as DeskMeeting
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('Morning meeting generation failed:', msg)
        await failTask(taskId, msg)
        throw err
    }
}

// =============================================================================
// Trade Review Generator (synchronous — no background task)
// =============================================================================

export async function generateTradeReview(
    userId: string,
    proposal: TradeProposal
): Promise<DeskMeeting> {
    const supabase = await createClient()

    // 1. Collect context + volatility in parallel
    const [context, volatility] = await Promise.all([
        collectDeskContext(userId),
        fetchVolatilityForPair(proposal.pair),
    ])

    // 2. Build prompt
    const prompt = buildTradeReviewPrompt(context, proposal, volatility)

    // 3. Call Gemini
    const start = Date.now()
    const raw = await callGemini(prompt, {
        maxTokens: 3072,
        model: DESK_MODEL,
        usage: { userId, feature: 'desk_trade_review' },
    })
    const elapsed = Date.now() - start

    // 4. Parse output
    const output = parseAIJson<TradeReviewOutput>(raw)

    // 5. Store meeting
    const { data: meeting, error } = await supabase
        .from('desk_meetings')
        .insert({
            user_id: userId,
            meeting_type: 'trade_review',
            trigger_context: proposal as unknown as Record<string, unknown>,
            alex_brief: output.alex_brief,
            ray_analysis: output.ray_analysis,
            sarah_report: output.sarah_report,
            marcus_directive: output.marcus_directive,
            context_snapshot: context as unknown as Record<string, unknown>,
            ai_model: DESK_MODEL,
            generation_duration_ms: elapsed,
        })
        .select()
        .single()

    if (error) throw new Error(`Failed to save trade review: ${error.message}`)

    // 6. Store individual messages
    const messages = [
        { speaker: 'ray', message: output.ray_analysis.message, message_type: 'comment', context_data: output.ray_analysis },
        { speaker: 'sarah', message: output.sarah_report.message, message_type: output.sarah_report.blocks.length > 0 ? 'block' : 'comment', context_data: output.sarah_report },
        { speaker: 'alex', message: output.alex_brief.message, message_type: 'comment', context_data: output.alex_brief },
        { speaker: 'marcus', message: output.marcus_directive.message, message_type: output.marcus_directive.final_verdict === 'blocked' ? 'block' : output.marcus_directive.final_verdict === 'approved' ? 'approval' : 'challenge', context_data: output.marcus_directive },
    ]

    await supabase.from('desk_messages').insert(
        messages.map(m => ({
            user_id: userId,
            meeting_id: meeting.id,
            speaker: m.speaker,
            message: m.message,
            message_type: m.message_type,
            context_data: m.context_data,
        }))
    )

    return meeting as DeskMeeting
}

// =============================================================================
// Process Score Generator
// =============================================================================

export async function generateProcessScore(
    userId: string,
    tradeId: string
): Promise<ProcessScore> {
    const supabase = await createClient()
    return scoreTradeProcess(userId, tradeId, supabase)
}

/**
 * Core process scoring logic — accepts a SupabaseClient so it works with
 * both cookie-based (API routes) and service-role (pipeline bot) clients.
 */
export async function scoreTradeProcess(
    userId: string,
    tradeId: string,
    supabase: SupabaseClient
): Promise<ProcessScore> {
    // 1. Fetch the trade with P&L
    const { data: trade, error: tradeErr } = await supabase
        .from('trades')
        .select('*, trade_pnl(*)')
        .eq('id', tradeId)
        .single()

    if (tradeErr || !trade) throw new Error(`Trade not found: ${tradeId}`)

    const pnlAmount = trade.trade_pnl?.[0]?.pnl_amount || 0
    const closedTrade: ClosedTradeForScoring = {
        id: trade.id,
        pair: trade.pair,
        direction: trade.direction,
        entry_price: Number(trade.entry_price),
        exit_price: trade.exit_price ? Number(trade.exit_price) : null,
        stop_loss: trade.stop_loss ? Number(trade.stop_loss) : null,
        take_profit: trade.take_profit ? Number(trade.take_profit) : null,
        lot_size: trade.lot_size ? Number(trade.lot_size) : null,
        pnl_amount: Number(pnlAmount),
        created_at: trade.created_at,
        closed_at: trade.closed_at,
        close_reason: trade.close_reason,
        voice_transcript: trade.voice_transcript || null,
    }

    // 2. Collect context
    const context = await collectDeskContext(userId)

    // 3. Build prompt
    const prompt = buildProcessScoringPrompt(closedTrade, context)

    // 4. Call Gemini
    const raw = await callGemini(prompt, {
        maxTokens: 2048,
        model: DESK_MODEL,
        usage: { userId, feature: 'desk_process_score' },
    })

    // 5. Parse output
    const output = parseAIJson<ProcessScoreOutput>(raw)

    // 6. Store score
    const { data: score, error: scoreErr } = await supabase
        .from('process_scores')
        .insert({
            user_id: userId,
            trade_id: tradeId,
            entry_criteria_score: output.entry_criteria_score,
            stop_loss_discipline: output.stop_loss_discipline,
            rr_compliance: output.rr_compliance,
            size_discipline: output.size_discipline,
            patience_score: output.patience_score,
            overall_score: output.overall_score,
            sarah_commentary: output.sarah_commentary,
            marcus_commentary: output.marcus_commentary,
        })
        .select()
        .single()

    if (scoreErr) throw new Error(`Failed to save process score: ${scoreErr.message}`)

    // 7. Update desk state streak and averages
    await updateStreakAfterScore(supabase, userId, output.overall_score)

    // 8. If score < 5, issue violation alert
    if (output.overall_score < 5) {
        await supabase.from('desk_messages').insert({
            user_id: userId,
            speaker: 'sarah',
            message: `PROCESS ALERT: Trade ${trade.pair} scored ${output.overall_score}/10. ${output.sarah_commentary}`,
            message_type: 'alert',
            context_data: output,
        })
    }

    return score as ProcessScore
}

// =============================================================================
// Volatility Fetch (lightweight — daily candles only)
// =============================================================================

async function fetchVolatilityForPair(pair: string): Promise<VolatilitySnapshot> {
    try {
        const instrument = pair.replace('/', '_')
        const config = getAssetConfig(pair)
        const pipLocation = config.type === 'cfd_index' ? -1
            : pair.includes('JPY') ? -2 : -4

        const { data: candles } = await getCandles({
            instrument,
            granularity: 'D',
            count: 60,
        })

        if (!candles || candles.length < 20) {
            return { atr14: 0, atr50: 0, ratio: 1, status: 'normal', label: 'Unavailable', pointLabel: config.pointLabel }
        }

        const atr14 = calculateATR(candles, 14, pipLocation)
        const atr50 = calculateATR(candles, 50, pipLocation)
        const ratio = atr50 > 0 ? atr14 / atr50 : 1
        const { status, label } = getATRStatus(ratio)

        return { atr14, atr50, ratio, status, label, pointLabel: config.pointLabel }
    } catch {
        return { atr14: 0, atr50: 0, ratio: 1, status: 'normal', label: 'Unavailable', pointLabel: 'pips' }
    }
}

// =============================================================================
// Helpers
// =============================================================================

async function updateDeskState(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    output: MorningMeetingOutput
) {
    // Upsert desk state
    const { data: existing } = await supabase
        .from('desk_state')
        .select('*')
        .eq('user_id', userId)
        .single()

    const now = new Date().toISOString()

    if (existing) {
        await supabase
            .from('desk_state')
            .update({
                marcus_memory: {
                    ...(existing.marcus_memory || {}),
                    last_directive: output.marcus_directive.message,
                    recent_comments: [output.marcus_directive.message, ...((existing.marcus_memory as Record<string, unknown>)?.recent_comments as string[] || [])].slice(0, 5),
                },
                sarah_memory: {
                    ...(existing.sarah_memory || {}),
                    last_risk_status: output.sarah_report.risk_status,
                    violations_this_week: output.sarah_report.violations.length + (existing.violations_this_week || 0),
                },
                ray_memory: {
                    ...(existing.ray_memory || {}),
                    regime_assessment: output.ray_analysis.edge_assessment,
                },
                alex_memory: {
                    ...(existing.alex_memory || {}),
                    macro_thesis: output.alex_brief.message,
                    key_events_tracked: output.alex_brief.key_events,
                },
                total_meetings_attended: (existing.total_meetings_attended || 0) + 1,
                last_meeting_at: now,
                violations_this_week: output.sarah_report.violations.length > 0
                    ? (existing.violations_this_week || 0) + output.sarah_report.violations.length
                    : existing.violations_this_week || 0,
            })
            .eq('user_id', userId)
    } else {
        await supabase.from('desk_state').insert({
            user_id: userId,
            marcus_memory: { last_directive: output.marcus_directive.message },
            sarah_memory: { last_risk_status: output.sarah_report.risk_status },
            ray_memory: { regime_assessment: output.ray_analysis.edge_assessment },
            alex_memory: { macro_thesis: output.alex_brief.message, key_events_tracked: output.alex_brief.key_events },
            total_meetings_attended: 1,
            last_meeting_at: now,
            violations_this_week: output.sarah_report.violations.length,
        })
    }
}

async function updateStreakAfterScore(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    score: number
) {
    const { data: state } = await supabase
        .from('desk_state')
        .select('*')
        .eq('user_id', userId)
        .single()

    const newStreak = score >= 7
        ? (state?.current_streak || 0) + 1
        : 0

    // Fetch recent scores for weekly average
    const { data: weekScores } = await supabase
        .from('process_scores')
        .select('overall_score')
        .eq('user_id', userId)
        .gte('scored_at', getWeekStart().toISOString())

    const weekAvg = weekScores && weekScores.length > 0
        ? weekScores.reduce((s, r) => s + Number(r.overall_score || 0), 0) / weekScores.length
        : null

    if (state) {
        await supabase
            .from('desk_state')
            .update({
                current_streak: newStreak,
                weekly_process_average: weekAvg,
                violations_this_week: score < 5
                    ? (state.violations_this_week || 0) + 1
                    : state.violations_this_week || 0,
            })
            .eq('user_id', userId)
    } else {
        await supabase.from('desk_state').insert({
            user_id: userId,
            current_streak: newStreak,
            weekly_process_average: weekAvg,
            violations_this_week: score < 5 ? 1 : 0,
        })
    }
}

function formatMeetingForTelegram(output: MorningMeetingOutput): string {
    return [
        `ALEX (MACRO): ${output.alex_brief.message}`,
        '',
        `RAY (QUANT): ${output.ray_analysis.message}`,
        '',
        `SARAH (RISK): ${output.sarah_report.message}`,
        `Risk Status: ${output.sarah_report.risk_status.toUpperCase()}`,
        '',
        `MARCUS (PM): ${output.marcus_directive.message}`,
        `Verdict: ${output.marcus_directive.desk_verdict.toUpperCase()}`,
    ].join('\n')
}

function getWeekStart(): Date {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(now.getFullYear(), now.getMonth(), diff)
}

// Re-export for API route usage
export { collectDeskContext }
