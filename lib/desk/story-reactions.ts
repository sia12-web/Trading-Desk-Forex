import type { SupabaseClient } from '@supabase/supabase-js'
import type { PsychologyContext } from './prompts/story-reaction'

// Re-export PsychologyContext for pipeline usage
export type { PsychologyContext }

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
    }

    try {
        // Fetch desk state + trader profile in parallel
        const [stateRes, profileRes, scoresRes] = await Promise.all([
            client.from('desk_state').select('current_streak, weekly_process_average, violations_this_week').eq('user_id', userId).limit(1).maybeSingle(),
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
        }
    } catch (err) {
        console.error('[DeskReaction] Failed to fetch psychology context:', err instanceof Error ? err.message : err)
        return defaults
    }
}
