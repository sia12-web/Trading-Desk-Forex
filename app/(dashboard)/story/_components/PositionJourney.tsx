'use client'

import { ArrowUpRight, ArrowDownRight, Shield, Scissors, XCircle, Pause } from 'lucide-react'

interface Adjustment {
    id: string
    episode_number: number
    action: string
    details: Record<string, unknown>
    ai_reasoning: string | null
    created_at: string
}

interface Position {
    id: string
    direction: string
    status: string
    season_number: number
    entry_episode_number: number | null
    suggested_entry: number
    entry_price: number | null
    original_stop_loss: number
    original_take_profit_1: number | null
    close_episode_number: number | null
    close_price: number | null
    close_reason: string | null
    realized_pnl_pips: number | null
}

interface Props {
    position: Position
    adjustments: Adjustment[]
    episodeTitles?: Record<number, string>
}

const ACTION_ICONS = {
    open: ArrowUpRight,
    move_sl: Shield,
    move_tp: ArrowUpRight,
    partial_close: Scissors,
    close: XCircle,
    hold: Pause,
} as const

function getActionColor(action: string, details: Record<string, unknown>): string {
    switch (action) {
        case 'open': return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
        case 'move_sl': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
        case 'move_tp': return 'text-green-400 bg-green-500/10 border-green-500/30'
        case 'partial_close': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
        case 'close': {
            const pnl = details.realized_pnl_pips as number | undefined
            if (pnl != null && pnl > 0) return 'text-green-400 bg-green-500/10 border-green-500/30'
            return 'text-red-400 bg-red-500/10 border-red-500/30'
        }
        case 'hold': return 'text-neutral-400 bg-neutral-800 border-neutral-700'
        default: return 'text-neutral-400 bg-neutral-800 border-neutral-700'
    }
}

function getActionLabel(action: string, details: Record<string, unknown>): string {
    switch (action) {
        case 'open': return 'ENTERED'
        case 'move_sl': return `SL → ${details.to_sl ?? '?'}`
        case 'move_tp': return `TP → ${details.to_tp ?? '?'}`
        case 'partial_close': return `PARTIAL CLOSE ${details.close_percent ?? '?'}%`
        case 'close': return 'CLOSED'
        case 'hold': return 'HOLD'
        default: return action.toUpperCase()
    }
}

function getActionDetail(action: string, details: Record<string, unknown>, position: Position): string {
    switch (action) {
        case 'open': {
            const entry = details.entry_price ?? position.suggested_entry
            const sl = details.stop_loss ?? position.original_stop_loss
            const tp = details.take_profit_1 ?? position.original_take_profit_1
            return `${position.direction.toUpperCase()} @ ${entry} (SL: ${sl}${tp ? `, TP: ${tp}` : ''})`
        }
        case 'move_sl': return `${details.from_sl} → ${details.to_sl}`
        case 'move_tp': return `${details.from_tp} → ${details.to_tp}`
        case 'partial_close': return `${details.close_percent}% at ${details.at_price ?? 'market'}`
        case 'close': return position.close_reason || (details.close_reason as string) || 'Position closed'
        case 'hold': return 'No adjustment needed'
        default: return ''
    }
}

export function PositionJourney({ position, adjustments, episodeTitles }: Props) {
    if (adjustments.length === 0) return null

    const season = position.season_number

    return (
        <section className="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Position Journey</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    position.status === 'active' || position.status === 'partial_closed'
                        ? 'bg-green-500/10 text-green-400'
                        : position.status === 'closed'
                            ? 'bg-neutral-700 text-neutral-400'
                            : 'bg-blue-500/10 text-blue-400'
                }`}>
                    {position.status.toUpperCase().replace('_', ' ')}
                </span>
            </div>

            <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-neutral-700" />

                <div className="space-y-4">
                    {adjustments.map((adj, idx) => {
                        const Icon = ACTION_ICONS[adj.action as keyof typeof ACTION_ICONS] || Pause
                        const colorClass = getActionColor(adj.action, adj.details)
                        const isLast = idx === adjustments.length - 1
                        const title = episodeTitles?.[adj.episode_number]

                        return (
                            <div key={adj.id} className="relative">
                                {/* Node dot */}
                                <div className={`absolute -left-6 top-0.5 w-[18px] h-[18px] rounded-full border flex items-center justify-center ${colorClass}`}>
                                    <Icon size={10} />
                                </div>

                                <div className={isLast ? '' : 'pb-1'}>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded leading-none">
                                            S{season}E{adj.episode_number}
                                        </span>
                                        <span className="text-[11px] font-bold text-neutral-200">
                                            {getActionLabel(adj.action, adj.details)}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-neutral-400 font-mono">
                                        {getActionDetail(adj.action, adj.details, position)}
                                    </p>
                                    {adj.ai_reasoning && (
                                        <p className="text-[10px] text-neutral-500 mt-0.5 italic leading-relaxed">
                                            &ldquo;{adj.ai_reasoning}&rdquo;
                                        </p>
                                    )}
                                    {title && (
                                        <p className="text-[10px] text-neutral-600 mt-0.5">
                                            {title}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* P&L summary for closed positions */}
            {position.status === 'closed' && position.realized_pnl_pips != null && (
                <div className={`mt-4 pt-3 border-t border-neutral-800 text-center ${
                    position.realized_pnl_pips > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                    <span className="text-xs font-bold">
                        {position.realized_pnl_pips > 0 ? '+' : ''}{Number(position.realized_pnl_pips).toFixed(1)} pips
                    </span>
                </div>
            )}
        </section>
    )
}
