import { getAuthUser } from '@/lib/supabase/server'
import { getDashboardStats } from '@/lib/data/analytics'
import { listTrades } from '@/lib/data/trades'
import Link from 'next/link'
import { Plus, LayoutDashboard, History, TrendingUp, ArrowRight, ArrowUpRight, ArrowDownRight, Clock, ChevronDown, Activity, ShieldCheck, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { AccountRiskWidget } from '@/components/dashboard/AccountRiskWidget'
import { MarketSessionsWidget } from '@/components/dashboard/MarketSessionsWidget'
import { IndicatorOptimizerWidget } from '@/components/dashboard/IndicatorOptimizerWidget'
import { VolatilePairsWidget } from '@/components/dashboard/VolatilePairsWidget'
import { MarketIndicesWidget } from './_components/MarketIndicesWidget'



export default async function DashboardPage() {
    const user = await getAuthUser()
    if (!user) return null

    const stats = await getDashboardStats(user.id)
    const recentTrades = await listTrades({ status: ['open', 'closed'] })
    const top5 = recentTrades.slice(0, 5)

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'planned': return 'text-sky-400 bg-sky-500/10'
            case 'open': return 'text-emerald-400 bg-emerald-500/10'
            case 'closed': return 'text-neutral-400 bg-neutral-800'
            case 'cancelled': return 'text-rose-400 bg-rose-500/10'
            default: return 'text-neutral-400 bg-neutral-800'
        }
    }

    return (
        <div className="max-w-[1500px] mx-auto space-y-6 pb-20 px-4">
            {/* Hero Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 py-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                        Precision Terminal
                        <span className="text-sm font-medium text-neutral-500 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full tracking-normal uppercase">Trader active</span>
                    </h1>
                    <p className="text-neutral-500 text-sm mt-1">Institutional-grade risk & execution companion.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/trade"
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-xl shadow-blue-900/30 active:scale-95 group"
                    >
                        <Zap size={18} />
                        New Execution
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </div>

            {/* Quick Stats Bento */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Active Exposure', value: stats.openTradesCount, detail: 'Current trades', icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                    { label: "Day Performance", value: `$${stats.todayPnL.toFixed(2)}`, detail: 'Locked & Floating', icon: TrendingUp, color: stats.todayPnL >= 0 ? 'text-emerald-400' : 'text-rose-400', bg: stats.todayPnL >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10', border: stats.todayPnL >= 0 ? 'border-emerald-500/20' : 'border-rose-500/20' },
                    { label: 'Total Volume', value: recentTrades.length, detail: 'Historical entries', icon: History, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
                    { label: 'System Health', value: 'Optimal', detail: 'Risk rules active', icon: ShieldCheck, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                ].map((stat) => (
                    <div key={stat.label} className={`bg-neutral-900 border ${stat.border} p-5 rounded-2xl hover:bg-neutral-800/50 transition-all group relative overflow-hidden`}>
                        <div className="relative z-10 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-1">{stat.label}</p>
                                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                                <p className="text-[10px] text-neutral-600 mt-1 font-medium">{stat.detail}</p>
                            </div>
                            <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
                                <stat.icon size={20} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Application Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Section: Market Status & Intelligence (Bento Columns) */}
                <div className="lg:col-span-8 space-y-6">


                    {/* Recent Trades Compact List */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-6 px-2">
                            <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                                <History size={20} className="text-blue-500" />
                                Recent Execution Log
                            </h3>
                            <Link href="/journal" className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors flex items-center gap-2">
                                Explorer Case Logs
                                <ArrowRight size={14} />
                            </Link>
                        </div>

                        <div className="space-y-2">
                            {top5.map((trade) => (
                                <Link
                                    key={trade.id}
                                    href={`/journal/${trade.id}`}
                                    className="flex items-center justify-between p-3 bg-neutral-950/40 border border-neutral-800 hover:border-blue-500/30 hover:bg-neutral-800/30 rounded-2xl transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-xl ${trade.direction === 'long' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                            {trade.direction === 'long' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm text-white">{trade.pair}</h4>
                                            <p className="text-[10px] text-neutral-600 font-mono tracking-tighter">{format(new Date(trade.created_at), 'MMM dd, HH:mm')}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${getStatusColor(trade.status)}`}>
                                            {trade.status}
                                        </div>
                                        <div className="hidden sm:block text-right min-w-[60px]">
                                            <p className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest mb-0.5">Lots</p>
                                            <p className="font-mono text-[11px] text-neutral-400">{trade.lot_size}</p>
                                        </div>
                                        <ChevronDown className="-rotate-90 text-neutral-800 group-hover:text-blue-500 transition-all shrink-0" size={16} />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Indicator Optimizer */}
                    <IndicatorOptimizerWidget />
                </div>

                {/* Right Section: Account, Risk & Focus */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl relative">
                        <MarketSessionsWidget />
                    </div>

                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl relative">
                        <AccountRiskWidget />
                    </div>

                    <VolatilePairsWidget />

                    <MarketIndicesWidget />

                    {/* Upgrade to Pro / Journal Tip */}
                    <div className="bg-gradient-to-br from-blue-900/40 to-black border border-blue-500/20 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[50px] -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all" />
                        <h3 className="text-xl font-black text-white leading-tight relative z-10">Journaling is the edge.</h3>
                        <p className="text-neutral-500 text-xs mt-2 relative z-10 leading-relaxed">
                            Every trade is a data point. Success is built on the review of the failures.
                        </p>
                        <Link href="/journal/new" className="mt-4 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all relative z-10 shadow-lg shadow-blue-900/40">
                            Log New Record
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
