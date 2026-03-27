import Link from 'next/link'
import {
    BookOpen, ArrowUpRight, ArrowDownRight, Shield, Scissors,
    XCircle, Pause, ChevronRight
} from 'lucide-react'

interface StoryPosition {
    id: string
    pair: string
    season_number: number
    direction: string
    status: string
    suggested_entry: number
    entry_price: number | null
    original_stop_loss: number
    original_take_profit_1: number | null
    current_stop_loss: number | null
    current_take_profit_1: number | null
    close_price: number | null
    close_reason: string | null
    realized_pnl_pips: number | null
    entry_episode_number: number | null
    close_episode_number: number | null
}

interface Adjustment {
    id: string
    episode_number: number
    action: string
    details: Record<string, unknown>
    ai_reasoning: string | null
    created_at: string
}

interface EpisodeInfo {
    episode_number: number
    title: string
    season_number: number
}

interface Props {
    position: StoryPosition | null
    adjustments: Adjustment[]
    entryEpisode: EpisodeInfo | null
    closeEpisode: EpisodeInfo | null
    pair: string
    seasonNumber?: number | null
}

const ACTION_ICONS = {
    open: ArrowUpRight,
    move_sl: Shield,
    move_tp: ArrowUpRight,
    partial_close: Scissors,
    close: XCircle,
    hold: Pause,
} as const

function getActionColor(action: string): string {
    switch (action) {
        case 'open': return 'bg-blue-500/10 border-blue-500/30 text-blue-400'
        case 'move_sl': return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
        case 'move_tp': return 'bg-green-500/10 border-green-500/30 text-green-400'
        case 'partial_close': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        case 'close': return 'bg-red-500/10 border-red-500/30 text-red-400'
        case 'hold': return 'bg-neutral-800 border-neutral-700 text-neutral-400'
        default: return 'bg-neutral-800 border-neutral-700 text-neutral-400'
    }
}

function getActionLabel(action: string, details: Record<string, unknown>): string {
    switch (action) {
        case 'open': return 'Opened'
        case 'move_sl': return `SL → ${details.to_sl ?? '?'}`
        case 'move_tp': return `TP → ${details.to_tp ?? '?'}`
        case 'partial_close': return `Partial Close ${details.close_percent ?? '?'}%`
        case 'close': return 'Closed'
        case 'hold': return 'Hold'
        default: return action
    }
}

export function StoryPositionContext({ position, adjustments, entryEpisode, closeEpisode, pair, seasonNumber }: Props) {
    const hasAnyContext = position || entryEpisode
    if (!hasAnyContext) return null

    const pairSlug = pair.replace('/', '-')
    const season = position?.season_number ?? entryEpisode?.season_number ?? seasonNumber ?? 1

    return (
        <div className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-500/20 rounded-3xl p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                        <BookOpen size={20} className="text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-neutral-200">Story Position Context</h3>
                        <p className="text-[10px] text-neutral-500">This trade is linked to the {pair} story</p>
                    </div>
                </div>
                <Link
                    href={`/story/${pairSlug}`}
                    className="flex items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
                >
                    View Story <ChevronRight size={14} />
                </Link>
            </div>

            {/* Episode Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Entry Episode */}
                {entryEpisode && (
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded leading-none">
                                S{entryEpisode.season_number}E{entryEpisode.episode_number}
                            </span>
                            <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Entry Episode</span>
                        </div>
                        <p className="text-sm text-neutral-300 font-medium">&ldquo;{entryEpisode.title}&rdquo;</p>
                        {position && (
                            <p className="text-[11px] text-neutral-500 mt-1 font-mono">
                                {position.direction.toUpperCase()} @ {position.entry_price ?? position.suggested_entry}
                            </p>
                        )}
                    </div>
                )}

                {/* Close Episode */}
                {closeEpisode && (
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded leading-none">
                                S{closeEpisode.season_number}E{closeEpisode.episode_number}
                            </span>
                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Exit Episode</span>
                        </div>
                        <p className="text-sm text-neutral-300 font-medium">&ldquo;{closeEpisode.title}&rdquo;</p>
                        {position?.close_reason && (
                            <p className="text-[11px] text-neutral-500 mt-1 italic">{position.close_reason}</p>
                        )}
                    </div>
                )}

                {/* If only entry and no close yet, show "still open" */}
                {entryEpisode && !closeEpisode && position && position.status !== 'closed' && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <div>
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Position Active</span>
                            <p className="text-[11px] text-neutral-400 mt-0.5">Still being managed across episodes</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Position Journey (condensed) */}
            {adjustments.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Position Journey</h4>
                    <div className="relative pl-6">
                        <div className="absolute left-[9px] top-1 bottom-1 w-px bg-neutral-700" />
                        <div className="space-y-3">
                            {adjustments.map((adj) => {
                                const Icon = ACTION_ICONS[adj.action as keyof typeof ACTION_ICONS] || Pause
                                const colorClass = getActionColor(adj.action)

                                return (
                                    <div key={adj.id} className="relative">
                                        <div className={`absolute -left-6 top-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center ${colorClass}`}>
                                            <Icon size={9} />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded leading-none">
                                                S{season}E{adj.episode_number}
                                            </span>
                                            <span className="text-[11px] font-semibold text-neutral-300">
                                                {getActionLabel(adj.action, adj.details)}
                                            </span>
                                        </div>
                                        {adj.ai_reasoning && (
                                            <p className="text-[10px] text-neutral-500 mt-0.5 italic pl-0">
                                                &ldquo;{adj.ai_reasoning}&rdquo;
                                            </p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Summary stats */}
            {position && position.status === 'closed' && (
                <div className="flex items-center gap-6 pt-4 border-t border-neutral-800">
                    <div>
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Duration</span>
                        <p className="text-sm font-bold text-neutral-300">
                            {position.entry_episode_number && position.close_episode_number
                                ? `${position.close_episode_number - position.entry_episode_number} episode${position.close_episode_number - position.entry_episode_number !== 1 ? 's' : ''}`
                                : '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Adjustments</span>
                        <p className="text-sm font-bold text-neutral-300">{adjustments.filter(a => a.action !== 'hold' && a.action !== 'open').length}</p>
                    </div>
                    {position.realized_pnl_pips != null && (
                        <div>
                            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Result</span>
                            <p className={`text-sm font-bold ${Number(position.realized_pnl_pips) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {Number(position.realized_pnl_pips) >= 0 ? '+' : ''}{Number(position.realized_pnl_pips).toFixed(1)} pips
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
