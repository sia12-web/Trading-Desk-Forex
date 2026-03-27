import { getTrade } from '@/lib/data/trades'
import { getScreenshotUrl } from '@/lib/data/screenshots'
import { getStoryContextForTrade } from '@/lib/data/story-positions'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Target,
    ShieldAlert,
    BadgeInfo,
    ImageIcon,
    DollarSign,
    TrendingUp,
    Rocket,
    Clock,
    AlertTriangle,
    Trophy,
    Scale
} from 'lucide-react'
import { calculatePips, estimatePnL } from '@/lib/utils/forex'
import { format } from 'date-fns'
import Image from 'next/image'
import { TradeDetailActions } from '@/app/(dashboard)/journal/_components/TradeDetailActions'
import { StoryPositionContext } from '@/app/(dashboard)/journal/_components/StoryPositionContext'

interface TradeDetailPageProps {
    params: Promise<{
        id: string
    }>
}

async function ScreenshotCard({ screenshot }: { screenshot: any }) {
    const signedUrl = await getScreenshotUrl(screenshot.storage_path)

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden group">
            <div className="aspect-video relative bg-neutral-800">
                {signedUrl ? (
                    <Image
                        src={signedUrl}
                        alt={screenshot.label || 'Trade Analysis'}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-neutral-600">
                        <ImageIcon size={48} />
                    </div>
                )}
                <div className="absolute top-4 left-4">
                    <span className="px-3 py-1.5 bg-neutral-950/80 backdrop-blur-md rounded-xl text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                        {screenshot.label}
                    </span>
                </div>
            </div>
            {screenshot.notes && (
                <div className="p-6">
                    <p className="text-sm text-neutral-400 leading-relaxed italic">&quot;{screenshot.notes}&quot;</p>
                </div>
            )}
        </div>
    )
}

export default async function TradeDetailPage({ params }: TradeDetailPageProps) {
    const { id } = await params
    let trade
    try {
        trade = await getTrade(id)
    } catch (e) {
        notFound()
    }

    if (!trade) notFound()

    // Fetch story position context (if trade is linked to a story)
    const storyContext = await getStoryContextForTrade({
        oanda_trade_id: trade.oanda_trade_id,
        story_episode_id: trade.story_episode_id,
        story_season_number: trade.story_season_number,
        pair: trade.pair,
    }).catch(() => null)

    const pnl = trade.trade_pnl?.[0]

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'planned': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            case 'open': return 'bg-green-500/10 text-green-400 border-green-500/20'
            case 'closed': return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
            case 'cancelled': return 'bg-red-500/10 text-red-400 border-red-500/20'
            default: return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
        }
    }

    return (
        <div className="max-w-6xl mx-auto space-y-12 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <Link
                        href="/journal"
                        className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl text-neutral-400 hover:text-white transition-all hover:bg-neutral-800"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${getStatusColor(trade.status)}`}>
                                {trade.status}
                            </span>
                            <span className="flex items-center gap-1.5 text-neutral-500 text-xs font-medium">
                                <Calendar size={14} />
                                {format(new Date(trade.created_at), 'MMMM dd, yyyy')}
                            </span>
                        </div>
                        <h1 className="text-4xl font-bold tracking-tight flex items-center gap-4">
                            {trade.name || trade.pair}
                            <div className={`p-1.5 rounded-lg border ${trade.direction === 'long' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                {trade.direction === 'long' ? (
                                    <ArrowUpRight className="text-green-500" size={24} />
                                ) : (
                                    <ArrowDownRight className="text-red-500" size={24} />
                                )}
                            </div>
                        </h1>
                        {trade.name && <p className="text-neutral-500 mt-1 font-medium">{trade.pair}</p>}
                    </div>
                </div>

                <TradeDetailActions trade={trade} />
            </div>

            {/* Ready to Execute Banner for Planned Trades */}
            {trade.status === 'planned' && !trade.oanda_trade_id && (
                <div className="flex items-center gap-5 p-6 bg-gradient-to-r from-amber-500/10 to-blue-500/10 border border-amber-500/20 rounded-[2rem]">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <Rocket className="text-amber-400" size={24} />
                    </div>
                    <div className="flex-1">
                        <p className="font-bold text-amber-400 text-sm">Ready to Execute</p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                            This trade is planned and saved locally. It has not been sent to OANDA yet. Use the buttons above to get AI advice or execute when ready.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Clock size={14} />
                        Planned {format(new Date(trade.created_at), 'MMM dd, HH:mm')}
                    </div>
                </div>
            )}

            {/* Risk & Reward Overview */}
            {trade.entry_price && trade.stop_loss && (
                (() => {
                    const entry = Number(trade.entry_price)
                    const sl = Number(trade.stop_loss)
                    const tp = trade.take_profit ? Number(trade.take_profit) : null
                    const lotSize = trade.lot_size ? Number(trade.lot_size) : null

                    const riskPips = Math.abs(calculatePips(entry, sl, 'long', trade.pair))
                    const profitPips = tp ? Math.abs(calculatePips(entry, tp, 'long', trade.pair)) : null
                    const rrRatio = profitPips && riskPips > 0 ? profitPips / riskPips : null

                    const riskDollars = lotSize ? estimatePnL(riskPips, lotSize, trade.pair) : null
                    const profitDollars = profitPips && lotSize ? estimatePnL(profitPips, lotSize, trade.pair) : null

                    return (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Risk */}
                            <div className="bg-red-500/5 border border-red-500/15 rounded-3xl p-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle size={16} className="text-red-400" />
                                    <span className="text-[10px] font-bold text-red-400/70 uppercase tracking-widest">Risk</span>
                                </div>
                                <p className="text-2xl font-bold text-red-400 font-mono">{riskPips.toFixed(1)} <span className="text-sm font-normal text-red-400/60">pips</span></p>
                                {riskDollars !== null && (
                                    <p className="text-sm text-red-400/60 font-mono mt-1">-${Math.abs(riskDollars).toFixed(2)} CAD</p>
                                )}
                            </div>
 
                            {/* Profit */}
                            <div className={`border rounded-3xl p-6 ${profitPips ? 'bg-green-500/5 border-green-500/15' : 'bg-neutral-900 border-neutral-800'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <Trophy size={16} className={profitPips ? 'text-green-400' : 'text-neutral-500'} />
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${profitPips ? 'text-green-400/70' : 'text-neutral-500'}`}>Potential Profit</span>
                                </div>
                                {profitPips ? (
                                    <>
                                        <p className="text-2xl font-bold text-green-400 font-mono">{profitPips.toFixed(1)} <span className="text-sm font-normal text-green-400/60">pips</span></p>
                                        {profitDollars !== null && (
                                            <p className="text-sm text-green-400/60 font-mono mt-1">+${profitDollars.toFixed(2)} CAD</p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-lg text-neutral-500">No TP set</p>
                                )}
                            </div>

                            {/* R:R Ratio */}
                            <div className={`border rounded-3xl p-6 col-span-2 lg:col-span-1 ${rrRatio && rrRatio >= 2 ? 'bg-emerald-500/5 border-emerald-500/15' : rrRatio ? 'bg-amber-500/5 border-amber-500/15' : 'bg-neutral-900 border-neutral-800'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <Scale size={16} className={rrRatio && rrRatio >= 2 ? 'text-emerald-400' : rrRatio ? 'text-amber-400' : 'text-neutral-500'} />
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${rrRatio && rrRatio >= 2 ? 'text-emerald-400/70' : rrRatio ? 'text-amber-400/70' : 'text-neutral-500'}`}>Risk : Reward</span>
                                </div>
                                {rrRatio ? (
                                    <p className={`text-2xl font-bold font-mono ${rrRatio >= 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        1 : {rrRatio.toFixed(2)}
                                    </p>
                                ) : (
                                    <p className="text-lg text-neutral-500">—</p>
                                )}
                            </div>
                        </div>
                    )
                })()
            )}

            {pnl && (
                <div className={`p-8 rounded-[2.5rem] border ${Number(pnl.pnl_amount) >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'} flex flex-col md:flex-row items-center gap-12`}>
                    <div className="flex items-center gap-6">
                        <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center ${Number(pnl.pnl_amount) >= 0 ? 'bg-green-500 text-white' : 'bg-red-500 text-white'} shadow-lg`}>
                            <DollarSign size={32} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Total P&L</p>
                            <p className={`text-4xl font-bold ${Number(pnl.pnl_amount) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {Number(pnl.pnl_amount) >= 0 ? '+' : ''}{pnl.pnl_amount} CAD
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-8">
                        <div>
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Pips</p>
                            <p className="text-xl font-bold flex items-center gap-2">
                                <TrendingUp size={18} className="text-neutral-500" />
                                {pnl.pnl_pips}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Exit Price</p>
                            <p className="text-xl font-bold font-mono">{trade.exit_price ? Number(trade.exit_price).toFixed(5) : '—'}</p>
                        </div>
                        {pnl.fees > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Fees</p>
                                <p className="text-xl font-bold text-red-400/80">-{pnl.fees}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Story Position Context */}
            {storyContext && (
                <StoryPositionContext
                    position={storyContext.position}
                    adjustments={storyContext.adjustments}
                    entryEpisode={storyContext.entryEpisode}
                    closeEpisode={storyContext.closeEpisode}
                    pair={trade.pair}
                    seasonNumber={trade.story_season_number}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                    {/* Trade Levels with Reasoning */}
                    {(() => {
                        const reasoning = trade.trade_reasoning || {}
                        const levels = [
                            {
                                label: 'Entry Price',
                                value: trade.entry_price ? Number(trade.entry_price).toFixed(5) : null,
                                icon: Target,
                                color: 'text-blue-400',
                                borderColor: 'border-blue-500/20',
                                bgColor: 'bg-blue-500/5',
                                reasoning: reasoning.entry,
                                prompt: 'Why this entry?',
                            },
                            {
                                label: 'Stop Loss',
                                value: trade.stop_loss ? Number(trade.stop_loss).toFixed(5) : null,
                                icon: ShieldAlert,
                                color: 'text-red-400',
                                borderColor: 'border-red-500/20',
                                bgColor: 'bg-red-500/5',
                                reasoning: reasoning.stop_loss,
                                prompt: 'Why this stop loss?',
                            },
                            {
                                label: 'Take Profit',
                                value: trade.take_profit ? Number(trade.take_profit).toFixed(5) : null,
                                icon: Target,
                                color: 'text-green-400',
                                borderColor: 'border-green-500/20',
                                bgColor: 'bg-green-500/5',
                                reasoning: reasoning.take_profit,
                                prompt: 'Why this target?',
                            },
                        ]

                        return (
                            <section className="space-y-4">
                                {levels.map(l => (
                                    <div key={l.label} className={`border rounded-3xl overflow-hidden ${l.reasoning ? l.borderColor : 'border-neutral-800'}`}>
                                        <div className={`flex items-center justify-between p-5 ${l.reasoning ? l.bgColor : 'bg-neutral-900'}`}>
                                            <div className="flex items-center gap-3">
                                                <l.icon size={16} className={l.color} />
                                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{l.label}</span>
                                            </div>
                                            <p className="text-xl font-mono font-bold">{l.value || '—'}</p>
                                        </div>
                                        {l.reasoning ? (
                                            <div className="px-5 pb-5 pt-2 bg-neutral-900">
                                                <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{l.reasoning}</p>
                                            </div>
                                        ) : l.value ? (
                                            <div className="px-5 pb-4 pt-1 bg-neutral-900">
                                                <p className="text-xs text-neutral-600 italic">{l.prompt} Click Strategy to add your reasoning.</p>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}

                                {/* Units & Margin row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl">
                                        <div className="flex items-center gap-2 mb-3">
                                            <BadgeInfo size={14} className="text-neutral-400" />
                                            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Units</span>
                                        </div>
                                        <p className="text-xl font-mono font-bold">{trade.lot_size ? (Number(trade.lot_size) * 100000).toLocaleString() : '—'}</p>
                                    </div>
                                    <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl">
                                        <div className="flex items-center gap-2 mb-3">
                                            <BadgeInfo size={14} className="text-blue-400" />
                                            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Est. Margin</span>
                                        </div>
                                        <p className="text-xl font-mono font-bold">{trade.lot_size ? `${((Number(trade.lot_size) * 100000) / 30).toFixed(2)} CAD` : '—'}</p>
                                    </div>
                                </div>
                            </section>
                        )
                    })()}

                    <section className="space-y-6">
                        <h2 className="text-xl font-bold flex items-center gap-3">
                            Strategy & Execution
                            <div className="h-px flex-1 bg-neutral-900" />
                        </h2>
                        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
                            {trade.strategy_explanation ? (
                                <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                                    {trade.strategy_explanation}
                                </p>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-neutral-500 italic mb-4">No strategy execution details provided yet.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="space-y-8">
                    {pnl?.notes && (
                        <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-3xl space-y-4">
                            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Post-Trade Review</h3>
                            <p className="text-neutral-300 italic text-sm leading-relaxed">&quot;{pnl.notes}&quot;</p>
                        </div>
                    )}



                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
                        <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-6">Trade Progress</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-neutral-950/50 rounded-2xl border border-neutral-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                    <span className="text-sm font-bold text-white">Entry Executed</span>
                                </div>
                                <span className="text-[10px] font-mono text-neutral-500">
                                    {format(new Date(trade.created_at), 'MMM dd, HH:mm')}
                                </span>
                            </div>

                            {trade.status === 'closed' ? (
                                <div className="flex items-center justify-between p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                        <span className="text-sm font-bold text-emerald-400">Position Closed</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-emerald-600">
                                        {trade.closed_at ? format(new Date(trade.closed_at), 'MMM dd, HH:mm') : 'Recorded'}
                                    </span>
                                </div>
                            ) : trade.status === 'cancelled' ? (
                                <div className="flex items-center justify-between p-4 bg-red-500/5 rounded-2xl border border-red-500/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-sm font-bold text-red-400">Cancelled</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 animate-pulse">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                                        <span className="text-sm font-bold text-blue-400 uppercase tracking-tighter">Live Track</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-blue-500/60 uppercase">In Progress</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
