'use client'

import React from 'react'
import { format } from 'date-fns'
import { 
    TrendingUp, 
    TrendingDown, 
    ChevronRight, 
    ChevronLeft,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    ExternalLink
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface WeeklyJournalViewProps {
    weeks: { id: string, label: string }[]
    currentWeekId: string
    data: {
        totalPnL: number
        days: {
            name: string
            pnl: number
            trades: any[]
            date: string
        }[]
    }
}

export function WeeklyJournalView({ weeks, currentWeekId, data }: WeeklyJournalViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const handleWeekChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('week', e.target.value)
        router.push(`${pathname}?${params.toString()}`)
    }

    const currentWeekIndex = weeks.findIndex(w => w.id === currentWeekId)
    
    const navigateWeek = (direction: 'next' | 'prev') => {
        const nextIndex = direction === 'next' ? currentWeekIndex - 1 : currentWeekIndex + 1
        if (nextIndex >= 0 && nextIndex < weeks.length) {
            const params = new URLSearchParams(searchParams.toString())
            params.set('week', weeks[nextIndex].id)
            router.push(`${pathname}?${params.toString()}`)
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Week Selector & Summary */}
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-stretch">
                <div className="flex-1 bg-neutral-900 border border-neutral-800 p-6 rounded-[2.5rem] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => navigateWeek('prev')}
                            disabled={currentWeekIndex === weeks.length - 1}
                            className="p-2 hover:bg-neutral-800 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Journal Period</span>
                            <select 
                                value={currentWeekId}
                                onChange={handleWeekChange}
                                className="bg-transparent border-none text-xl font-bold p-0 focus:ring-0 cursor-pointer appearance-none"
                            >
                                {weeks.map(w => (
                                    <option key={w.id} value={w.id} className="bg-neutral-900">{w.label}</option>
                                ))}
                            </select>
                        </div>

                        <button 
                            onClick={() => navigateWeek('next')}
                            disabled={currentWeekIndex === 0}
                            className="p-2 hover:bg-neutral-800 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>

                    <div className="text-right">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Weekly P&L</p>
                        <p className={cn(
                            "text-3xl font-mono font-bold",
                            data.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                            {data.totalPnL >= 0 ? '+' : ''}${data.totalPnL.toFixed(2)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Daily Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {data.days.map((day) => (
                    <div 
                        key={day.name}
                        className={cn(
                            "bg-neutral-900 border border-neutral-800 rounded-[2rem] p-6 flex flex-col min-h-[400px] transition-all hover:border-neutral-700",
                            day.trades.length > 0 ? "bg-neutral-900/50" : "opacity-50"
                        )}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h4 className="font-bold text-neutral-200">{day.name}</h4>
                                <p className="text-xs text-neutral-500">{day.date}</p>
                            </div>
                            {day.trades.length > 0 && (
                                <div className={cn(
                                    "px-2 py-1 rounded-lg text-[10px] font-bold font-mono",
                                    day.pnl >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                )}>
                                    {day.pnl >= 0 ? '+' : ''}{day.pnl.toFixed(0)}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 space-y-3">
                            {day.trades.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                                    <Calendar size={32} className="mb-2" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">No Activity</p>
                                </div>
                            ) : (
                                day.trades.map((trade: any) => (
                                    <Link 
                                        key={trade.id}
                                        href={`/journal/${trade.id}`}
                                        className="block p-3 bg-neutral-800/50 border border-neutral-800 rounded-2xl hover:border-blue-500/50 transition-all group scale-100 active:scale-95"
                                    >
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">{trade.pair}</span>
                                            <span className={cn(
                                                "text-[8px] px-1.5 py-0.5 rounded uppercase font-bold",
                                                trade.direction === 'long' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                            )}>
                                                {trade.direction}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <span className="text-[10px] text-neutral-500 uppercase tracking-widest">Outcome</span>
                                            <span className={cn(
                                                "text-xs font-mono font-bold",
                                                Number(trade.trade_pnl?.[0]?.pnl_amount || 0) >= 0 ? "text-green-400" : "text-red-400"
                                            )}>
                                                {trade.status === 'closed' 
                                                    ? `${Number(trade.trade_pnl?.[0]?.pnl_amount || 0) >= 0 ? '+' : ''}${Number(trade.trade_pnl?.[0]?.pnl_amount || 0).toFixed(0)}`
                                                    : <span className="text-neutral-500 italic lowercase">{trade.status}</span>
                                                }
                                            </span>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>

                        {day.trades.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-neutral-800 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                                    {day.trades.length} {day.trades.length === 1 ? 'Trade' : 'Trades'}
                                </span>
                                <div className="text-neutral-600 group-hover:text-blue-400 transition-colors">
                                    <ChevronRight size={14} />
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
