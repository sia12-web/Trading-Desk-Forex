import type { SupabaseClient } from '@supabase/supabase-js'
import type { PositionGuidance, EpisodeType } from '@/lib/story/types'
import { callGemini } from '@/lib/ai/clients/gemini'
import { parseAIJson } from '@/lib/ai/parse-response'
import {
    buildPositionEntryReactionPrompt,
    buildPositionManagementReactionPrompt,
} from './prompts/story-reaction'
import type { PsychologyContext } from './prompts/story-reaction'

const DESK_MODEL = 'gemini-1.5-flash'

// Re-export PsychologyContext for pipeline usage
export type { PsychologyContext }

// ── Context passed from pipeline (avoids re-fetching) ──

export interface StoryReactionContext {
    userId: string
    pair: string
    episodeId: string
    episodeNumber: number
    seasonNumber: number
    episodeType: EpisodeType
    currentPrice: number
    atr14: number
    atr50: number
    volatilityStatus: string  // 'spike' | 'hot' | 'normal' | 'cold'
    fractalAnalysis?: {
        alligatorState: 'sleeping' | 'awakening' | 'eating' | 'sated'
        alligatorDirection: 'bullish' | 'bearish' | 'neutral'
        setupScore: number
        setupDirection: 'buy' | 'sell' | 'none'
        signals: string[]
    }
}

// ── AI Output Types ──

interface EntryReactionOutput {
    ray: { message: string; tone: string }
    sarah: { message: string; tone: string }
    alex: { message: string; tone: string }
    marcus: { message: string; tone: string; verdict: string }
}

interface ManagementReactionOutput {
    ray: { message: string; tone: string }
    sarah: { message: string; tone: string }
    alex?: { message: string; tone: string }
    marcus?: { message: string; tone: string }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Connection Point 1: Auto Desk Review on Position Entry
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatePositionEntryReaction(
    ctx: StoryReactionContext,
    guidance: PositionGuidance,
    storyTitle: string,
    client: SupabaseClient,
): Promise<void> {
    const TAG = '[DeskReaction:Entry]'

    try {
        // 1. Fetch minimal psychology context
        const psychology = await getMinimalPsychologyContext(ctx.userId, client)

        // 2. Build prompt
        const prompt = buildPositionEntryReactionPrompt(
            ctx.pair, guidance, storyTitle, psychology, ctx.currentPrice, ctx.atr14,
            ctx.atr50, ctx.volatilityStatus, ctx.fractalAnalysis,
        )

        // 3. Call Gemini
        const raw = await callGemini(prompt, {
            maxTokens: 1024,
            model: DESK_MODEL,
            usage: { userId: ctx.userId, feature: 'desk_story_reaction' },
        })

        // 4. Parse
        const output = parseAIJson<EntryReactionOutput>(raw)

        // 5. Store 4 desk messages
        const contextData = {
            episode_id: ctx.episodeId,
            episode_number: ctx.episodeNumber,
            season_number: ctx.seasonNumber,
            pair: ctx.pair,
            reaction_type: 'position_entry',
        }

        const toneToType = (tone: string, verdict?: string) => {
            if (verdict === 'blocked') return 'block'
            if (tone === 'warning') return 'alert'
            if (verdict === 'approved') return 'approval'
            if (verdict === 'caution') return 'challenge'
            return 'comment'
        }

        const messages = [
            { speaker: 'ray', message: output.ray.message, message_type: 'comment' },
            { speaker: 'sarah', message: output.sarah.message, message_type: toneToType(output.sarah.tone) },
            { speaker: 'alex', message: output.alex.message, message_type: 'comment' },
            { speaker: 'marcus', message: output.marcus.message, message_type: toneToType(output.marcus.tone, output.marcus.verdict) },
        ]

        await client.from('desk_messages').insert(
            messages.map(m => ({
                user_id: ctx.userId,
                speaker: m.speaker,
                message: m.message,
                message_type: m.message_type,
                context_data: contextData,
            }))
        )

        console.log(`${TAG} ${ctx.pair} S${ctx.seasonNumber}E${ctx.episodeNumber}: ${output.marcus.verdict} — 4 messages stored`)
    } catch (err) {
        console.error(`${TAG} Failed:`, err instanceof Error ? err.message : err)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Connection Point 2: Desk Commentary on Position Management
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatePositionManagementReaction(
    ctx: StoryReactionContext,
    guidance: PositionGuidance,
    storyTitle: string,
    client: SupabaseClient,
): Promise<void> {
    const TAG = '[DeskReaction:Mgmt]'

    try {
        const psychology = await getMinimalPsychologyContext(ctx.userId, client)
        const isClose = guidance.action === 'close'

        const prompt = buildPositionManagementReactionPrompt(
            ctx.pair, guidance, storyTitle, psychology, ctx.currentPrice, isClose,
        )

        const raw = await callGemini(prompt, {
            maxTokens: 512,
            model: DESK_MODEL,
            usage: { userId: ctx.userId, feature: 'desk_story_reaction' },
        })

        const output = parseAIJson<ManagementReactionOutput>(raw)

        const contextData = {
            episode_id: ctx.episodeId,
            episode_number: ctx.episodeNumber,
            season_number: ctx.seasonNumber,
            pair: ctx.pair,
            reaction_type: 'position_management',
            action: guidance.action,
        }

        const messages: Array<{ speaker: string; message: string; message_type: string }> = [
            { speaker: 'ray', message: output.ray.message, message_type: 'comment' },
            { speaker: 'sarah', message: output.sarah.message, message_type: output.sarah.tone === 'warning' ? 'alert' : 'comment' },
        ]

        // Close actions get all 4 characters
        if (isClose && output.alex && output.marcus) {
            messages.push(
                { speaker: 'alex', message: output.alex.message, message_type: 'comment' },
                { speaker: 'marcus', message: output.marcus.message, message_type: 'comment' },
            )
        }

        await client.from('desk_messages').insert(
            messages.map(m => ({
                user_id: ctx.userId,
                speaker: m.speaker,
                message: m.message,
                message_type: m.message_type,
                context_data: contextData,
            }))
        )

        console.log(`${TAG} ${ctx.pair} S${ctx.seasonNumber}E${ctx.episodeNumber} [${guidance.action}]: ${messages.length} messages stored`)
    } catch (err) {
        console.error(`${TAG} Failed:`, err instanceof Error ? err.message : err)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Connection Point 3: Auto Process Score on Season End
// ═══════════════════════════════════════════════════════════════════════════════

export async function triggerAutoProcessScore(
    userId: string,
    pair: string,
    tradeId: string,
    client: SupabaseClient,
): Promise<void> {
    const TAG = '[AutoScore]'

    try {
        // Guard: check if already scored
        const { data: existing } = await client
            .from('process_scores')
            .select('id')
            .eq('trade_id', tradeId)
            .limit(1)

        if (existing && existing.length > 0) {
            console.log(`${TAG} ${pair} trade ${tradeId} already scored, skipping`)
            return
        }

        // Import scoreTradeProcess dynamically to avoid circular deps
        const { scoreTradeProcess } = await import('./generator')
        await scoreTradeProcess(userId, tradeId, client)

        console.log(`${TAG} ${pair} trade ${tradeId} auto-scored successfully`)
    } catch (err) {
        console.error(`${TAG} Failed for ${pair}:`, err instanceof Error ? err.message : err)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Fetch minimal psychology context (avoids full collectDeskContext)
// ═══════════════════════════════════════════════════════════════════════════════

export async function getMinimalPsychologyContext(
    userId: string,
    client: SupabaseClient,
): Promise<PsychologyContext> {
    const defaults: PsychologyContext = {
        streak: 0,
        weeklyAvg: null,
        weaknesses: [],
        currentFocus: null,
        riskPersonality: null,
        violationsThisWeek: 0,
        ai_trading_scars: [],
    }

    try {
        // Fetch desk state + trader profile in parallel
        const [stateRes, profileRes, scoresRes] = await Promise.all([
            client.from('desk_state').select('current_streak, weekly_process_average, violations_this_week, ai_trading_scars').eq('user_id', userId).limit(1).maybeSingle(),
            client.from('trader_profile').select('observed_weaknesses, current_focus, risk_personality').eq('user_id', userId).limit(1).maybeSingle(),
            client.from('process_scores').select('overall_score').eq('user_id', userId).order('scored_at', { ascending: false }).limit(5),
        ])

        const state = stateRes.data
        const profile = profileRes.data

        // Calculate recent average if weekly isn't available
        let weeklyAvg = state?.weekly_process_average ?? null
        if (weeklyAvg === null && scoresRes.data && scoresRes.data.length > 0) {
            weeklyAvg = scoresRes.data.reduce((s, r) => s + Number(r.overall_score || 0), 0) / scoresRes.data.length
        }

        return {
            streak: state?.current_streak ?? 0,
            weeklyAvg,
            weaknesses: (profile?.observed_weaknesses as string[]) || [],
            currentFocus: (profile?.current_focus as string) || null,
            riskPersonality: (profile?.risk_personality as string) || null,
            violationsThisWeek: state?.violations_this_week ?? 0,
            ai_trading_scars: (state?.ai_trading_scars as string[]) || [],
        }
    } catch (err) {
        console.error('[DeskReaction] Failed to fetch psychology context:', err instanceof Error ? err.message : err)
        return defaults
    }
}
