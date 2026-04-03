import { createClient } from '@/lib/supabase/server'
import { listTrades, getAvailablePairs, getJournalWeeks, getWeeklyJournalData } from '@/lib/data/trades'
import Link from 'next/link'
import { Plus, ArrowUpRight, ArrowDownRight, ImageIcon, ExternalLink, Search, List, LayoutGrid, BarChart3 } from 'lucide-react'
import { format } from 'date-fns'
import { JournalFilters } from './_components/JournalFilters'
import { WeeklyJournalView } from './_components/WeeklyJournalView'
import { cn } from '@/lib/utils'

interface JournalPageProps {
    searchParams: Promise<{
        pair?: string
        status?: string | string[]
        direction?: string
        search?: string
        view?: 'list' | 'weekly'
        week?: string
    }>
}

export default async function JournalPage({ searchParams }: JournalPageProps) {
    const params = await searchParams
    const view = params.view || 'list'
    
    const filters = {
        pair: params.pair,
        status: typeof params.status === 'string' ? [params.status] : params.status,
        direction: params.direction,
        search: params.search,
    }

    // Fetch data based on view
    const [trades, availablePairs, weeks] = await Promise.all([
        listTrades(filters),
        getAvailablePairs(),
        getJournalWeeks()
    ])

    const currentWeekId = params.week || (weeks.length > 0 ? weeks[0].id : null)
    const weeklyData = view === 'weekly' && currentWeekId 
        ? await getWeeklyJournalData(currentWeekId)
        : null

    const availableStatuses = ['planned', 'open', 'closed', 'cancelled']

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
        <div className="max-w-6xl mx-auto space-y-8 pb-20 px-4 md:px-0">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight">Trade Journal</h1>
                    <p className="text-neutral-500 mt-2 text-lg">Track your execution and strategy performance.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-neutral-900 border border-neutral-800 p-1 rounded-2xl">
                        <Link
                            href="/journal?view=list"
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                                view === 'list' ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"
                            )}
                        >
                            <List size={16} />
                            List
                        </Link>
                        <Link
                            href="/journal?view=weekly"
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                                view === 'weekly' ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"
                            )}
                        >
                            <BarChart3 size={16} />
                            Weekly
                        </Link>
                    </div>
                    <Link
                        href="/trade"
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                    >
                        <Plus size={20} />
                        Record
                    </Link>
                </div>
            </div>

            {view === 'list' ? (
                <>
                    {/* Filter Bar */}
                    <JournalFilters pairs={availablePairs} statuses={availableStatuses} />

                    {trades.length === 0 ? (
                        <div className="p-20 bg-neutral-900 border border-dashed border-neutral-800 rounded-[3rem] text-center space-y-4">
                            <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <Search size={32} className="text-neutral-600" />
                            </div>
                            <h2 className="text-2xl font-bold">No trades found</h2>
                            <p className="text-neutral-500 max-w-sm mx-auto">
                                Try adjusting your filters or record your first trade to start building your journal.
                            </p>
                            <Link
                                href="/trade"
                                className="inline-block mt-4 text-blue-400 font-bold hover:text-blue-300 transition-colors"
                            >
                                Log a new entry &rarr;
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {trades.map((trade) => (
                                <Link
                                    key={trade.id}
                                    href={`/journal/${trade.id}`}
                                    className="group bg-neutral-900 border border-neutral-800 rounded-3xl p-6 hover:border-blue-500/50 hover:bg-neutral-800/50 transition-all flex flex-col"
                                >
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl border ${trade.direction === 'long' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                                {trade.direction === 'long' ? (
                                                    <ArrowUpRight className="text-green-500" size={20} />
                                                ) : (
                                                    <ArrowDownRight className="text-red-500" size={20} />
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold tracking-tight">{trade.name || trade.pair}</h3>
                                                {trade.name && <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest leading-none mt-1">{trade.pair}</p>}
                                            </div>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${getStatusColor(trade.status)}`}>
                                            {trade.status}
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-4">
                                        <div className="flex justify-between items-end border-b border-neutral-800 pb-4">
                                            <div>
                                                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Entry Price</p>
                                                <p className="font-mono text-lg">{trade.entry_price ? Number(trade.entry_price).toFixed(5) : '—'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Units</p>
                                                <p className="font-mono text-lg">{trade.lot_size ? (Number(trade.lot_size) * 100000).toLocaleString() : '—'}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-neutral-600">
                                                {format(new Date(trade.created_at), 'MMM dd, yyyy')}
                                            </span>
                                            <div className="flex items-center gap-2 text-neutral-600 group-hover:text-blue-400 transition-colors">
                                                <span className="text-[10px] font-bold uppercase tracking-widest">Details</span>
                                                <ExternalLink size={14} />
                                            </div>
                                        </div>
                                    </div>

                                    {trade.trade_screenshots?.[0] && (
                                        <div className="mt-6 aspect-video relative rounded-2xl overflow-hidden bg-neutral-800 border border-neutral-700">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <ImageIcon className="text-neutral-700" size={32} />
                                            </div>
                                        </div>
                                    )}
                                </Link>
                            ))}
                        </div>
                    )}
                </>
            ) : weeks.length > 0 ? (
                <WeeklyJournalView 
                    weeks={weeks} 
                    currentWeekId={currentWeekId!} 
                    data={weeklyData!} 
                />
            ) : (
                <div className="p-20 bg-neutral-900 border border-dashed border-neutral-800 rounded-[3rem] text-center space-y-4">
                    <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <BarChart3 size={32} className="text-neutral-600" />
                    </div>
                    <h2 className="text-2xl font-bold">No weekly data available</h2>
                    <p className="text-neutral-500 max-w-sm mx-auto">
                        Record and close trades to see your weekly performance analysis.
                    </p>
                </div>
            )}
        </div>
    )
}
