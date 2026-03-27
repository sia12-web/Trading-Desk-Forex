import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

async function getDefaultClient(): Promise<SupabaseClient> {
    return createClient()
}

// ── Pair Subscriptions ──

export async function getSubscribedPairs(userId: string) {
    const supabase = await getDefaultClient()
    const { data, error } = await supabase
        .from('pair_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('subscribed_at', { ascending: true })

    if (error) throw error
    return data || []
}

export async function subscribeToPair(userId: string, pair: string, notes?: string) {
    const supabase = await getDefaultClient()
    const { data, error } = await supabase
        .from('pair_subscriptions')
        .upsert(
            { user_id: userId, pair, is_active: true, notes },
            { onConflict: 'user_id,pair' }
        )
        .select()
        .single()

    if (error) throw error
    return data
}

export async function unsubscribePair(userId: string, pair: string) {
    const supabase = await getDefaultClient()
    const { error } = await supabase
        .from('pair_subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('pair', pair)

    if (error) throw error
}

// ── Story Episodes ──

export async function getEpisodes(
    userId: string,
    pair: string,
    limit = 20,
    offset = 0,
    client?: SupabaseClient,
    options?: { includeArchived?: boolean }
) {
    const supabase = client || await getDefaultClient()
    let query = supabase
        .from('story_episodes')
        .select('id, pair, episode_number, season_number, title, current_phase, confidence, next_episode_preview, created_at')
        .eq('user_id', userId)
        .eq('pair', pair)

    if (!options?.includeArchived) {
        query = query.eq('archived', false)
    }

    const { data, error } = await query
        .order('episode_number', { ascending: false })
        .range(offset, offset + limit - 1)

    if (error) throw error
    return data || []
}

export async function getLatestEpisode(userId: string, pair: string, client?: SupabaseClient) {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_episodes')
        .select('*')
        .eq('user_id', userId)
        .eq('pair', pair)
        .order('episode_number', { ascending: false })
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
    return data || null
}

export async function getEpisodeById(episodeId: string) {
    const supabase = await getDefaultClient()
    const { data, error } = await supabase
        .from('story_episodes')
        .select('*')
        .eq('id', episodeId)
        .single()

    if (error) throw error
    return data
}

export async function createEpisode(
    userId: string,
    pair: string,
    episodeData: {
        episode_number: number,
        season_number?: number,
        title: string
        narrative: string
        characters: Record<string, unknown>
        current_phase: string
        key_levels?: Record<string, unknown>
        raw_ai_output?: Record<string, unknown>
        gemini_output?: Record<string, unknown>
        deepseek_output?: Record<string, unknown>
        news_context?: Record<string, unknown>
        confidence?: number
        next_episode_preview?: string
        agent_reports?: Record<string, unknown>
        generation_source?: 'manual' | 'cron' | 'bot'
    },
    client?: SupabaseClient
) {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_episodes')
        .insert({
            user_id: userId,
            pair,
            ...episodeData,
        })
        .select()
        .single()

    if (error) throw error
    return data
}

export async function getNextEpisodeNumber(userId: string, pair: string, client?: SupabaseClient): Promise<number> {
    const supabase = client || await getDefaultClient()
    const { data } = await supabase
        .from('story_episodes')
        .select('episode_number')
        .eq('user_id', userId)
        .eq('pair', pair)
        .order('episode_number', { ascending: false })
        .limit(1)
        .single()

    return (data?.episode_number || 0) + 1
}

// ── Scenarios ──

export async function getActiveScenarios(userId: string, pair: string) {
    const supabase = await getDefaultClient()
    const { data, error } = await supabase
        .from('story_scenarios')
        .select('*')
        .eq('user_id', userId)
        .eq('pair', pair)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
}

export async function getScenariosForEpisode(episodeId: string, client?: SupabaseClient) {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_scenarios')
        .select('*')
        .eq('episode_id', episodeId)
        .order('probability', { ascending: false })

    if (error) throw error
    return data || []
}

export async function createScenarios(
    episodeId: string,
    userId: string,
    pair: string,
    scenarios: Array<{
        title: string
        description: string
        direction: string
        probability: number
        trigger_conditions: string
        invalidation: string
        trigger_level?: number
        trigger_direction?: 'above' | 'below'
        invalidation_level?: number
        invalidation_direction?: 'above' | 'below'
    }>,
    client?: SupabaseClient
) {
    const supabase = client || await getDefaultClient()
    const rows = scenarios.map(s => ({
        episode_id: episodeId,
        user_id: userId,
        pair,
        ...s,
    }))

    const { data, error } = await supabase
        .from('story_scenarios')
        .insert(rows)
        .select()

    if (error) throw error
    return data
}

export async function updateScenarioStatus(
    scenarioId: string,
    status: 'triggered' | 'invalidated' | 'expired',
    outcomeNotes?: string,
    resolvedBy?: 'manual' | 'bot' | 'expired',
    client?: SupabaseClient
) {
    const supabase = client || await getDefaultClient()
    const { error } = await supabase
        .from('story_scenarios')
        .update({
            status,
            outcome_notes: outcomeNotes || null,
            resolved_at: new Date().toISOString(),
            ...(resolvedBy ? { resolved_by: resolvedBy } : {}),
        })
        .eq('id', scenarioId)

    if (error) throw error
}

export async function getRecentlyResolvedScenarios(
    userId: string,
    pair: string,
    limit = 10,
    client?: SupabaseClient
) {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_scenarios')
        .select('*')
        .eq('user_id', userId)
        .eq('pair', pair)
        .in('status', ['triggered', 'invalidated', 'expired'])
        .order('resolved_at', { ascending: false })
        .limit(limit)

    if (error) throw error
    return data || []
}
