'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/types/database'
import { cache } from 'react'
import { getActiveAccountId } from '@/lib/oanda/account'

export type TradeReasoning = {
    entry?: string
    stop_loss?: string
    take_profit?: string
}

export type TradeFormData = {
    pair: string
    direction: 'long' | 'short'
    entry_price: number | null
    stop_loss: number | null
    take_profit: number | null
    lot_size: number | null
    status: 'planned' | 'open' | 'closed' | 'cancelled'
    name?: string | null
    strategy_explanation?: string | null
    trade_reasoning?: TradeReasoning | null
}

export type StrategyStepData = {
    step_number: number
    title: string
    description: string
}

export type ScreenshotData = {
    storage_path: string
    label: string | null
    notes: string | null
}

export async function createTrade(
    tradeData: TradeFormData,
    screenshots: ScreenshotData[],
    strategies: StrategyStepData[]
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    const accountId = await getActiveAccountId()

    const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .insert({
            ...tradeData,
            user_id: user.id,
            oanda_account_id: accountId,
        })
        .select()
        .single()

    if (tradeError) throw tradeError

    if (screenshots.length > 0) {
        const { error: ssError } = await supabase.from('trade_screenshots').insert(
            screenshots.map((ss) => ({
                ...ss,
                trade_id: trade.id,
                user_id: user.id,
            }))
        )
        if (ssError) throw ssError
    }

    if (strategies.length > 0) {
        const { error: stratError } = await supabase.from('trade_strategies').insert(
            strategies.map((strat) => ({
                ...strat,
                trade_id: trade.id,
                user_id: user.id,
            }))
        )
        if (stratError) throw stratError
    }

    return trade
}

export const getTrade = cache(async (id: string) => {
    const supabase = await createClient()
    const accountId = await getActiveAccountId()
    const { data: trade, error } = await supabase
        .from('trades')
        .select(`
      *,
      trade_screenshots (*),
      trade_strategies (*),
      trade_pnl (*)
    `)
        .eq('oanda_account_id', accountId)
        .eq('id', id)
        .single()

    if (error) throw error

    // Record Sync: If trade is 'open' locally, check OANDA for actual status
    if (trade && trade.status === 'open' && trade.oanda_trade_id) {
        try {
            const { getTrade: getOandaTrade } = await import('@/lib/oanda/client')
            const { data: oandaTrade } = await getOandaTrade(trade.oanda_trade_id)

            // If OANDA says it's CLOSED, sync the local record
            if (oandaTrade && oandaTrade.state === 'CLOSED') {
                const exitPrice = parseFloat(oandaTrade.averageClosePrice || '0')
                const pnlAmount = parseFloat(oandaTrade.realizedPL || '0')
                const pnlPips = parseFloat(oandaTrade.averageClosePrice || '0') // Simplified for now

                // Update trade status
                await supabase.from('trades').update({
                    status: 'closed',
                    exit_price: exitPrice,
                    closed_at: oandaTrade.closeTime
                }).eq('id', id)

                // Update PNL record if not exists
                if (!trade.trade_pnl || trade.trade_pnl.length === 0) {
                    await supabase.from('trade_pnl').insert({
                        trade_id: id,
                        user_id: trade.user_id,
                        pnl_amount: pnlAmount,
                        pnl_pips: 0, // Would need calculation logic for precise pips
                        fees: parseFloat(oandaTrade.financing || '0'),
                        notes: 'Auto-synced from OANDA'
                    })
                }

                // Return updated data
                return {
                    ...trade,
                    status: 'closed' as const,
                    exit_price: exitPrice,
                    closed_at: oandaTrade.closeTime
                }
            }
        } catch (syncError) {
            console.error('Failed to sync trade status with OANDA:', syncError)
        }
    }

    return trade
})

export const listTrades = cache(async (filters?: {
    pair?: string
    status?: string[]
    direction?: string
    search?: string
}) => {
    const supabase = await createClient()
    const accountId = await getActiveAccountId()
    let query = supabase
        .from('trades')
        .select(`
      *,
      trade_screenshots (storage_path)
    `)
        .eq('oanda_account_id', accountId)
        .order('created_at', { ascending: false })

    if (filters?.pair) {
        query = query.eq('pair', filters.pair)
    }
    if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status)
    }
    if (filters?.direction) {
        query = query.eq('direction', filters.direction)
    }
    if (filters?.search) {
        query = query.or(`pair.ilike.%${filters.search}%,voice_transcript.ilike.%${filters.search}%`)
    }

    const { data, error } = await query

    if (error) throw error
    return data
})

export async function updateTrade(
    id: string,
    tradeData: Partial<Database['public']['Tables']['trades']['Update']>,
    strategies?: StrategyStepData[],
    screenshots?: ScreenshotData[]
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error: tradeError } = await supabase
        .from('trades')
        .update(tradeData)
        .eq('id', id)

    if (tradeError) throw tradeError

    if (strategies) {
        const { error: delStratError } = await supabase
            .from('trade_strategies')
            .delete()
            .eq('trade_id', id)

        if (delStratError) throw delStratError

        if (strategies.length > 0) {
            const { error: insStratError } = await supabase
                .from('trade_strategies')
                .insert(strategies.map(s => ({ ...s, trade_id: id, user_id: user.id })))

            if (insStratError) throw insStratError
        }
    }

    if (screenshots) {
        const { error: delSSError } = await supabase
            .from('trade_screenshots')
            .delete()
            .eq('trade_id', id)

        if (delSSError) throw delSSError

        if (screenshots.length > 0) {
            const { error: insSSError } = await supabase
                .from('trade_screenshots')
                .insert(screenshots.map(s => ({ ...s, trade_id: id, user_id: user.id })))

            if (insSSError) throw insSSError
        }
    }
}

export async function closeTrade(
    id: string,
    exitPrice: number,
    pnlData: {
        pnl_amount: number,
        pnl_pips: number,
        fees: number,
        notes?: string
    }
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error: tradeError } = await supabase
        .from('trades')
        .update({
            status: 'closed',
            exit_price: exitPrice,
            closed_at: new Date().toISOString()
        })
        .eq('id', id)

    if (tradeError) throw tradeError

    const { error: pnlError } = await supabase
        .from('trade_pnl')
        .insert({
            trade_id: id,
            user_id: user.id,
            ...pnlData
        })

    if (pnlError) throw pnlError
}

export async function cancelTrade(id: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('trades')
        .update({ status: 'cancelled' })
        .eq('id', id)

    if (error) throw error
}

export async function deleteTrade(id: string) {
    const supabase = await createClient()

    // Delete screenshot files from storage
    const { data: ssRecords } = await supabase
        .from('trade_screenshots')
        .select('storage_path')
        .eq('trade_id', id)

    if (ssRecords && ssRecords.length > 0) {
        const paths = ssRecords.map(r => r.storage_path)
        await supabase.storage.from('trade-screenshots').remove(paths)
    }

    // Delete records that don't have ON DELETE CASCADE
    // execution_log records
    const { error: execLogError } = await supabase
        .from('execution_log')
        .delete()
        .eq('trade_id', id)

    if (execLogError) throw execLogError

    // Finally delete the trade (CASCADE will handle screenshots, strategies, and pnl)
    const { error } = await supabase.from('trades').delete().eq('id', id)
    if (error) throw error
}

export const getAvailablePairs = cache(async () => {
    const supabase = await createClient()
    const accountId = await getActiveAccountId()
    const { data, error } = await supabase
        .from('trades')
        .select('pair')
        .eq('oanda_account_id', accountId)

    if (error) return []
    const pairs = Array.from(new Set(data.map(t => t.pair)))
    return pairs.sort()
})
