import { Shield, Flame, AlertTriangle, DollarSign } from 'lucide-react'
import type { DeskState, ProcessScore } from '@/lib/desk/types'

interface DeskStatsProps {
    deskState: DeskState | null
    todayPnL: number
    recentScores: ProcessScore[]
}

export function DeskStats({ deskState, todayPnL, recentScores }: DeskStatsProps) {
    const processAvg = deskState?.weekly_process_average
        ? Number(deskState.weekly_process_average).toFixed(1)
        : recentScores.length > 0
            ? (recentScores.reduce((s, r) => s + Number(r.overall_score || 0), 0) / recentScores.length).toFixed(1)
            : 'N/A'

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] p-5 shadow-2xl">
            <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-4">Desk Metrics</h3>
            <div className="space-y-3">
                {/* Process Score */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                            <Shield size={16} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Process Score</p>
                            <p className="text-xs text-neutral-600">Weekly average</p>
                        </div>
                    </div>
                    <p className="text-lg font-black text-white">{processAvg}</p>
                </div>

                {/* Discipline Streak */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center">
                            <Flame size={16} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Streak</p>
                            <p className="text-xs text-neutral-600">Trades scoring &gt;7</p>
                        </div>
                    </div>
                    <p className="text-lg font-black text-white">{deskState?.current_streak ?? 0}</p>
                </div>

                {/* Violations */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                            <AlertTriangle size={16} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Violations</p>
                            <p className="text-xs text-neutral-600">This week</p>
                        </div>
                    </div>
                    <p className={`text-lg font-black ${(deskState?.violations_this_week ?? 0) > 0 ? 'text-rose-400' : 'text-white'}`}>
                        {deskState?.violations_this_week ?? 0}
                    </p>
                </div>

                {/* Today P&L */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg ${todayPnL >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center`}>
                            <DollarSign size={16} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Today P&L</p>
                        </div>
                    </div>
                    <p className={`text-lg font-black ${todayPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${todayPnL.toFixed(2)}
                    </p>
                </div>

            </div>
        </div>
    )
}
