import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──

export interface BibleEvent {
    episode_number: number
    event: string
    significance: string
}

export interface CharacterEvolution {
    buyers: { arc: string; turning_points: string[] }
    sellers: { arc: string; turning_points: string[] }
}

export interface NarrativeThread {
    thread: string
    introduced_episode: number
    description: string
}

export interface ResolvedThread {
    thread: string
    introduced_episode: number
    resolved_episode: number
    outcome: string
}

export interface StoryBible {
    id: string
    user_id: string
    pair: string
    arc_summary: string
    key_events: BibleEvent[]
    character_evolution: CharacterEvolution
    unresolved_threads: NarrativeThread[]
    resolved_threads: ResolvedThread[]
    dominant_themes: string[]
    episode_count: number
    last_episode_number: number
    lessons_learned: string[]
    created_at: string
    updated_at: string
}

export interface BibleUpdate {
    arc_summary: string
    key_events: BibleEvent[]
    character_evolution: CharacterEvolution
    unresolved_threads: NarrativeThread[]
    resolved_threads: ResolvedThread[]
    dominant_themes: string[]
    trade_history_summary?: string
    lessons_learned?: string[]
}

// ── CRUD ──

async function getDefaultClient(): Promise<SupabaseClient> {
    return createClient()
}

export async function getBible(
    userId: string,
    pair: string,
    client?: SupabaseClient
): Promise<StoryBible | null> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_bibles')
        .select('*')
        .eq('user_id', userId)
        .eq('pair', pair)
        .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
}

export async function upsertBible(
    userId: string,
    pair: string,
    update: BibleUpdate,
    episodeNumber: number,
    client?: SupabaseClient
): Promise<StoryBible> {
    const supabase = client || await getDefaultClient()

    // Prune arrays to prevent unbounded growth
    const prunedKeyEvents = update.key_events?.slice(-15) || []
    const prunedResolvedThreads = update.resolved_threads?.slice(-10) || []

    const { data, error } = await supabase
        .from('story_bibles')
        .upsert(
            {
                user_id: userId,
                pair,
                arc_summary: update.arc_summary,
                key_events: prunedKeyEvents,
                character_evolution: update.character_evolution,
                unresolved_threads: update.unresolved_threads,
                resolved_threads: prunedResolvedThreads,
                dominant_themes: update.dominant_themes,
                trade_history_summary: update.trade_history_summary,
                lessons_learned: update.lessons_learned || [],
                episode_count: episodeNumber,
                last_episode_number: episodeNumber,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,pair' }
        )
        .select()
        .single()

    if (error) throw error
    return data
}
