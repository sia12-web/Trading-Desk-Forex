'use client'

import { Database, Calendar } from 'lucide-react'
import type { CMSResult } from '@/lib/cms/types'

export function CMSSummaryCard({ result }: { result: CMSResult }) {
    const stats = result.data_stats

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
            {/* Market personality */}
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Database size={16} className="text-blue-400" />
                Market Personality
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed mb-4">
                {result.summary}
            </p>

            {/* Data stats */}
            <div className="border-t border-neutral-800 pt-4">
                <div className="flex items-center gap-2 mb-3">
                    <Calendar size={14} className="text-neutral-500" />
                    <span className="text-xs text-neutral-500">
                        {stats.date_range.from} — {stats.date_range.to}
                    </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <DataStat label="Daily Candles" value={stats.daily_candles} />
                    <DataStat label="Weekly Candles" value={stats.weekly_candles} />
                    <DataStat label="H1 Candles" value={stats.h1_candles} />
                    <DataStat label="H4 Candles" value={stats.h4_candles} />
                </div>
            </div>

            {/* Total conditions */}
            <div className="mt-4 pt-4 border-t border-neutral-800 flex items-center justify-between">
                <span className="text-xs text-neutral-500">Total Conditions Discovered</span>
                <span className="text-lg font-bold text-white">{result.total_conditions}</span>
            </div>
        </div>
    )
}

function DataStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="bg-neutral-800/50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest">{label}</p>
            <p className="text-sm font-bold text-white">{value.toLocaleString()}</p>
        </div>
    )
}
