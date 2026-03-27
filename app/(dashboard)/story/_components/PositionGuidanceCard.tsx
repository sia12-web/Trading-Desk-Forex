'use client'

import { useState } from 'react'
import {
    ArrowUpRight, ArrowDownRight, Pause, Settings2, XCircle,
    Clock, CheckCircle2, Loader2, Link2
} from 'lucide-react'

interface PositionGuidance {
    action: 'enter_long' | 'enter_short' | 'hold' | 'adjust' | 'close' | 'wait'
    confidence: number
    reasoning: string
    entry_price?: number
    stop_loss?: number
    take_profit_1?: number
    take_profit_2?: number
    take_profit_3?: number
    move_stop_to?: number
    partial_close_percent?: number
    new_take_profit?: number
    close_reason?: string
    suggested_lots?: number
    risk_percent?: number
    risk_amount?: number
    favored_scenario_id?: string
}

interface ActivePosition {
    id: string
    status: string
    direction: string
    suggested_entry: number
    entry_price: number | null
    current_stop_loss: number | null
    current_take_profit_1: number | null
}

interface Props {
    guidance: PositionGuidance | null
    activePosition: ActivePosition | null
    onActivate?: (positionId: string) => void
}

const ACTION_CONFIG = {
    enter_long: { label: 'Enter Long', icon: ArrowUpRight, color: 'green', bg: 'bg-green-500/10 border-green-500/30' },
    enter_short: { label: 'Enter Short', icon: ArrowDownRight, color: 'red', bg: 'bg-red-500/10 border-red-500/30' },
    hold: { label: 'Hold Position', icon: Pause, color: 'blue', bg: 'bg-blue-500/10 border-blue-500/30' },
    adjust: { label: 'Adjust Position', icon: Settings2, color: 'yellow', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    close: { label: 'Close Position', icon: XCircle, color: 'red', bg: 'bg-red-500/10 border-red-500/30' },
    wait: { label: 'Wait — No Trade', icon: Clock, color: 'neutral', bg: 'bg-neutral-800 border-neutral-700' },
} as const

export function PositionGuidanceCard({ guidance, activePosition, onActivate }: Props) {
    const [activating, setActivating] = useState(false)

    if (!guidance) return null

    const config = ACTION_CONFIG[guidance.action]
    const Icon = config.icon
    const conf = Math.round(guidance.confidence * 100)

    const handleActivate = async () => {
        if (!activePosition || !onActivate) return
        setActivating(true)
        try {
            await onActivate(activePosition.id)
        } finally {
            setActivating(false)
        }
    }

    return (
        <section className={`border rounded-2xl p-5 ${config.bg}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon size={16} className={`text-${config.color}-400`} />
                    <h3 className="text-sm font-bold text-neutral-200">{config.label}</h3>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    conf >= 70 ? 'bg-green-500/10 text-green-400' :
                    conf >= 50 ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-neutral-700 text-neutral-400'
                }`}>
                    {conf}% confidence
                </span>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4">{guidance.reasoning}</p>

            {/* Entry details */}
            {(guidance.action === 'enter_long' || guidance.action === 'enter_short') && (
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-4">
                    {guidance.entry_price != null && (
                        <div className="bg-neutral-900/50 rounded-lg px-3 py-2">
                            <span className="text-neutral-500 block">Entry</span>
                            <span className="text-neutral-200 font-mono font-bold">{guidance.entry_price}</span>
                        </div>
                    )}
                    {guidance.stop_loss != null && (
                        <div className="bg-neutral-900/50 rounded-lg px-3 py-2">
                            <span className="text-red-400 block">Stop Loss</span>
                            <span className="text-neutral-200 font-mono font-bold">{guidance.stop_loss}</span>
                        </div>
                    )}
                    {guidance.take_profit_1 != null && (
                        <div className="bg-neutral-900/50 rounded-lg px-3 py-2">
                            <span className="text-green-400 block">TP1</span>
                            <span className="text-neutral-200 font-mono font-bold">{guidance.take_profit_1}</span>
                        </div>
                    )}
                    {guidance.take_profit_2 != null && (
                        <div className="bg-neutral-900/50 rounded-lg px-3 py-2">
                            <span className="text-green-400 block">TP2</span>
                            <span className="text-neutral-200 font-mono font-bold">{guidance.take_profit_2}</span>
                        </div>
                    )}
                    {guidance.take_profit_3 != null && (
                        <div className="bg-neutral-900/50 rounded-lg px-3 py-2">
                            <span className="text-green-400 block">TP3</span>
                            <span className="text-neutral-200 font-mono font-bold">{guidance.take_profit_3}</span>
                        </div>
                    )}
                    {guidance.suggested_lots != null && (
                        <div className="bg-neutral-900/50 rounded-lg px-3 py-2">
                            <span className="text-purple-400 block">Volume</span>
                            <span className="text-neutral-200 font-mono font-bold">{guidance.suggested_lots} lots</span>
                        </div>
                    )}
                    {guidance.risk_percent != null && (
                        <div className="bg-neutral-900/50 rounded-lg px-3 py-2">
                            <span className="text-orange-400 block">Risk</span>
                            <span className="text-neutral-200 font-mono font-bold">
                                {guidance.risk_percent}%{guidance.risk_amount != null && ` ($${guidance.risk_amount.toFixed(0)})`}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Adjustment details */}
            {guidance.action === 'adjust' && (
                <div className="space-y-1.5 text-[11px] mb-4">
                    {guidance.move_stop_to != null && (
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-400 font-semibold">Move SL to:</span>
                            <span className="text-neutral-200 font-mono">{guidance.move_stop_to}</span>
                        </div>
                    )}
                    {guidance.partial_close_percent != null && (
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-400 font-semibold">Close:</span>
                            <span className="text-neutral-200">{guidance.partial_close_percent}% of position</span>
                        </div>
                    )}
                    {guidance.new_take_profit != null && (
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-400 font-semibold">New TP:</span>
                            <span className="text-neutral-200 font-mono">{guidance.new_take_profit}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Close reason */}
            {guidance.action === 'close' && guidance.close_reason && (
                <div className="text-[11px] mb-4">
                    <span className="text-red-400 font-semibold">Reason: </span>
                    <span className="text-neutral-300">{guidance.close_reason}</span>
                </div>
            )}

            {/* Activate button (for suggested positions) */}
            {activePosition?.status === 'suggested' && onActivate && (
                <button
                    onClick={handleActivate}
                    disabled={activating}
                    className="flex items-center gap-2 w-full justify-center px-4 py-2 text-xs font-semibold bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 rounded-xl transition-colors border border-blue-500/30"
                >
                    {activating ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <CheckCircle2 size={14} />
                    )}
                    Activate This Position
                </button>
            )}

            {/* Active position badge */}
            {activePosition && activePosition.status === 'active' && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/10 px-2.5 py-1.5 rounded-lg">
                    <Link2 size={10} />
                    <span className="font-semibold">Position Active</span>
                    <span className="text-neutral-400 ml-1">
                        {activePosition.direction.toUpperCase()} @ {activePosition.entry_price ?? activePosition.suggested_entry}
                    </span>
                </div>
            )}

            {/* Favored scenario */}
            {guidance.favored_scenario_id && (
                <div className="mt-3 text-[10px] text-neutral-500">
                    Aligned with: <span className="text-neutral-400 font-medium">{guidance.favored_scenario_id.replace('_', ' ').toUpperCase()}</span>
                </div>
            )}
        </section>
    )
}
