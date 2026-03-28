'use client'

import type { CMSCondition } from '@/lib/cms/types'

const confidenceColors = {
    high: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const probabilityBarColor = (prob: number) => {
    if (prob >= 75) return 'bg-green-500'
    if (prob >= 65) return 'bg-blue-500'
    if (prob >= 55) return 'bg-yellow-500'
    return 'bg-red-500'
}

export function CMSConditionCard({ condition }: { condition: CMSCondition }) {
    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-colors">
            {/* IF → THEN */}
            <div className="space-y-2 mb-4">
                <div className="flex items-start gap-2">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">IF</span>
                    <p className="text-sm text-neutral-200 leading-relaxed">{condition.condition.replace(/^IF\s+/i, '')}</p>
                </div>
                <div className="flex items-start gap-2">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">THEN</span>
                    <p className="text-sm text-neutral-200 leading-relaxed">{condition.outcome.replace(/^THEN\s+/i, '')}</p>
                </div>
            </div>

            {/* Probability bar */}
            <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-neutral-500">Probability</span>
                    <span className="text-sm font-bold text-white">{condition.probability}%</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${probabilityBarColor(condition.probability)}`}
                        style={{ width: `${condition.probability}%` }}
                    />
                </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-xs text-neutral-400 mb-3">
                <span title="Sample size">n={condition.sample_size}</span>
                <span className="text-neutral-700">|</span>
                <span title="Average pip movement">{condition.avg_move_pips} pips avg</span>
                <span className="text-neutral-700">|</span>
                <span title="Time to play out">{condition.time_to_play_out}</span>
            </div>

            {/* Confidence badge */}
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${confidenceColors[condition.confidence]}`}>
                    {condition.confidence}
                </span>
            </div>

            {/* Implication */}
            {condition.implication && (
                <p className="mt-3 text-xs text-neutral-400 leading-relaxed border-t border-neutral-800 pt-3 italic">
                    {condition.implication}
                </p>
            )}
        </div>
    )
}
