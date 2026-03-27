import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

async function getDefaultClient(): Promise<SupabaseClient> {
    return createClient()
}

// ── Types ──

export interface StoryPosition {
    id: string
    user_id: string
    pair: string
    season_number: number
    direction: 'long' | 'short'
    status: 'suggested' | 'active' | 'partial_closed' | 'closed'
    entry_episode_id: string | null
    entry_episode_number: number | null
    entry_price: number | null
    suggested_entry: number
    current_stop_loss: number | null
    current_take_profit_1: number | null
    current_take_profit_2: number | null
    current_take_profit_3: number | null
    original_stop_loss: number
    original_take_profit_1: number | null
    close_episode_id: string | null
    close_episode_number: number | null
    close_price: number | null
    close_reason: string | null
    oanda_trade_id: string | null
    realized_pnl_pips: number | null
    created_at: string
    updated_at: string
}

export interface PositionAdjustment {
    id: string
    position_id: string
    episode_id: string
    episode_number: number
    action: 'open' | 'move_sl' | 'move_tp' | 'partial_close' | 'close' | 'hold'
    details: Record<string, unknown>
    ai_reasoning: string | null
    created_at: string
}

// ── CRUD ──

export async function getActivePosition(
    userId: string,
    pair: string,
    client?: SupabaseClient
): Promise<StoryPosition | null> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_positions')
        .select('*')
        .eq('user_id', userId)
        .eq('pair', pair)
        .in('status', ['suggested', 'active', 'partial_closed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') throw error
    return (data as StoryPosition) || null
}

export async function getPositionsForPair(
    userId: string,
    pair: string,
    client?: SupabaseClient
): Promise<StoryPosition[]> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_positions')
        .select('*')
        .eq('user_id', userId)
        .eq('pair', pair)
        .order('created_at', { ascending: false })

    if (error) throw error
    return (data as StoryPosition[]) || []
}

export async function getPositionById(
    positionId: string,
    client?: SupabaseClient
): Promise<StoryPosition | null> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_positions')
        .select('*')
        .eq('id', positionId)
        .single()

    if (error && error.code !== 'PGRST116') throw error
    return (data as StoryPosition) || null
}

export async function createPosition(
    userId: string,
    pair: string,
    positionData: {
        season_number: number
        direction: 'long' | 'short'
        entry_episode_id: string
        entry_episode_number: number
        suggested_entry: number
        original_stop_loss: number
        original_take_profit_1?: number
        current_stop_loss?: number
        current_take_profit_1?: number
        current_take_profit_2?: number
        current_take_profit_3?: number
    },
    client?: SupabaseClient
): Promise<StoryPosition> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_positions')
        .insert({
            user_id: userId,
            pair,
            ...positionData,
            current_stop_loss: positionData.current_stop_loss ?? positionData.original_stop_loss,
            current_take_profit_1: positionData.current_take_profit_1 ?? positionData.original_take_profit_1,
        })
        .select()
        .single()

    if (error) throw error
    return data as StoryPosition
}

export async function updatePosition(
    positionId: string,
    updates: Partial<Pick<StoryPosition,
        'status' | 'entry_price' | 'current_stop_loss' | 'current_take_profit_1' |
        'current_take_profit_2' | 'current_take_profit_3' | 'close_episode_id' |
        'close_episode_number' | 'close_price' | 'close_reason' |
        'oanda_trade_id' | 'realized_pnl_pips'
    >>,
    client?: SupabaseClient
): Promise<StoryPosition> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_positions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', positionId)
        .select()
        .single()

    if (error) throw error
    return data as StoryPosition
}

export async function addAdjustment(
    adjustmentData: {
        position_id: string
        episode_id: string
        episode_number: number
        action: PositionAdjustment['action']
        details?: Record<string, unknown>
        ai_reasoning?: string
    },
    client?: SupabaseClient
): Promise<PositionAdjustment> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_position_adjustments')
        .insert({
            ...adjustmentData,
            details: adjustmentData.details || {},
        })
        .select()
        .single()

    if (error) throw error
    return data as PositionAdjustment
}

export async function getAdjustmentsForPosition(
    positionId: string,
    client?: SupabaseClient
): Promise<PositionAdjustment[]> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_position_adjustments')
        .select('*')
        .eq('position_id', positionId)
        .order('episode_number', { ascending: true })

    if (error) throw error
    return (data as PositionAdjustment[]) || []
}

export async function getPositionWithAdjustments(
    positionId: string,
    client?: SupabaseClient
): Promise<{ position: StoryPosition; adjustments: PositionAdjustment[] } | null> {
    const [position, adjustments] = await Promise.all([
        getPositionById(positionId, client),
        getAdjustmentsForPosition(positionId, client),
    ])

    if (!position) return null
    return { position, adjustments }
}

export async function getPositionByOandaTradeId(
    oandaTradeId: string,
    client?: SupabaseClient
): Promise<StoryPosition | null> {
    const supabase = client || await getDefaultClient()
    const { data, error } = await supabase
        .from('story_positions')
        .select('*')
        .eq('oanda_trade_id', oandaTradeId)
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') throw error
    return (data as StoryPosition) || null
}

export async function getStoryContextForTrade(
    trade: { oanda_trade_id?: string | null; story_episode_id?: string | null; story_season_number?: number | null; pair?: string },
    client?: SupabaseClient
): Promise<{
    position: StoryPosition | null
    adjustments: PositionAdjustment[]
    entryEpisode: { episode_number: number; title: string; season_number: number } | null
    closeEpisode: { episode_number: number; title: string; season_number: number } | null
} | null> {
    const supabase = client || await getDefaultClient()

    // Try to find linked story position
    let position: StoryPosition | null = null
    if (trade.oanda_trade_id) {
        position = await getPositionByOandaTradeId(trade.oanda_trade_id, supabase)
    }

    if (!position && !trade.story_episode_id) return null

    // Fetch adjustments if we have a position
    let adjustments: PositionAdjustment[] = []
    if (position) {
        adjustments = await getAdjustmentsForPosition(position.id, supabase)
    }

    // Fetch entry episode info
    let entryEpisode = null
    const entryEpId = position?.entry_episode_id || trade.story_episode_id
    if (entryEpId) {
        const { data } = await supabase
            .from('story_episodes')
            .select('episode_number, title, season_number')
            .eq('id', entryEpId)
            .single()
        if (data) entryEpisode = data
    }

    // Fetch close episode info
    let closeEpisode = null
    if (position?.close_episode_id) {
        const { data } = await supabase
            .from('story_episodes')
            .select('episode_number, title, season_number')
            .eq('id', position.close_episode_id)
            .single()
        if (data) closeEpisode = data
    }

    return { position, adjustments, entryEpisode, closeEpisode }
}

export async function activatePosition(
    positionId: string,
    entryPrice?: number,
    client?: SupabaseClient
): Promise<StoryPosition> {
    return updatePosition(positionId, {
        status: 'active',
        ...(entryPrice != null ? { entry_price: entryPrice } : {}),
    }, client)
}
