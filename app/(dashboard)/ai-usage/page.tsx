'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, Sparkles, Cpu, Loader2, DollarSign, Zap, Clock, TrendingUp, AlertTriangle } from 'lucide-react'

interface ProviderStats {
    provider: string
    model: string
    totalCalls: number
    successCalls: number
    failedCalls: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheReadTokens: number
    totalCost: number
    avgDuration: number
    features: Record<string, number>
}

interface DailyCost {
    date: string
    anthropic: number
    google: number
    deepseek: number
}

interface UsageData {
    providers: ProviderStats[]
    dailyCosts: DailyCost[]
    totalCost: number
    totalCalls: number
    period: { days: number; since: string }
}

const PROVIDER_CONFIG: Record<string, { label: string; company: string; model: string; role: string; color: string; icon: typeof Sparkles }> = {
    anthropic: {
        label: 'Claude',
        company: 'Anthropic',
        model: 'claude-opus-4-6',
        role: 'Decision Architect',
        color: 'blue',
        icon: Sparkles,
    },
    google: {
        label: 'Gemini',
        company: 'Google',
        model: 'gemini-1.5-flash',
        role: 'Pattern Archaeologist',
        color: 'emerald',
        icon: Sparkles,
    },
    deepseek: {
        label: 'DeepSeek',
        company: 'DeepSeek',
        model: 'deepseek-chat',
        role: 'Quantitative Engine',
        color: 'violet',
        icon: Cpu,
    },
}

const PERIOD_OPTIONS = [
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
]

export default function AIUsagePage() {
    const [data, setData] = useState<UsageData | null>(null)
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState(30)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/ai-usage?days=${period}`)
            if (res.ok) {
                const json = await res.json()
                setData(json)
            }
        } catch (err) {
            console.error('Failed to load AI usage:', err)
        } finally {
            setLoading(false)
        }
    }, [period])

    useEffect(() => { loadData() }, [loadData])

    const formatTokens = (n: number) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
        return n.toString()
    }

    const formatCost = (n: number) => `$${n.toFixed(4)}`

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Brain size={24} className="text-violet-400" />
                    <div>
                        <h1 className="text-xl font-bold text-neutral-100">AI Usage</h1>
                        <p className="text-xs text-neutral-500">Track token usage, costs, and performance across all 3 AI models.</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-neutral-800 rounded-xl p-1">
                    {PERIOD_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setPeriod(opt.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                period === opt.value
                                    ? 'bg-violet-600 text-white'
                                    : 'text-neutral-400 hover:text-neutral-200'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={24} className="animate-spin text-neutral-600" />
                </div>
            ) : !data || data.totalCalls === 0 ? (
                <div className="text-center py-20 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/20">
                    <Brain size={40} className="mx-auto text-neutral-700 mb-4" />
                    <h2 className="text-lg font-bold text-neutral-400 mb-2">No AI usage yet</h2>
                    <p className="text-sm text-neutral-600 max-w-md mx-auto">
                        Usage tracking starts when you generate stories, scenario analyses, or run technical market analyses.
                        Previous calls before this feature was enabled are not tracked.
                    </p>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SummaryCard
                            icon={Zap}
                            label="Total Calls"
                            value={data.totalCalls.toString()}
                            color="blue"
                        />
                        <SummaryCard
                            icon={DollarSign}
                            label="Total Cost"
                            value={formatCost(data.totalCost)}
                            color="green"
                        />
                        <SummaryCard
                            icon={TrendingUp}
                            label="Avg per Day"
                            value={formatCost(data.totalCost / data.period.days)}
                            color="yellow"
                        />
                        <SummaryCard
                            icon={AlertTriangle}
                            label="Failed Calls"
                            value={data.providers.reduce((sum, p) => sum + p.failedCalls, 0).toString()}
                            color="red"
                        />
                    </div>

                    {/* Provider Cards */}
                    <div className="space-y-4">
                        {(['anthropic', 'google', 'deepseek'] as const).map(providerId => {
                            const config = PROVIDER_CONFIG[providerId]
                            const stats = data.providers.find(p => p.provider === providerId)
                            return (
                                <ProviderCard
                                    key={providerId}
                                    config={config}
                                    stats={stats}
                                    formatTokens={formatTokens}
                                    formatCost={formatCost}
                                />
                            )
                        })}
                    </div>

                    {/* Daily Cost Breakdown (simple bar) */}
                    {data.dailyCosts.length > 0 && (
                        <div className="border border-neutral-800 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-neutral-300 mb-4">Daily Cost Breakdown</h3>
                            <div className="space-y-1.5">
                                {data.dailyCosts.slice(-14).map(day => {
                                    const total = day.anthropic + day.google + day.deepseek
                                    const maxCost = Math.max(...data.dailyCosts.map(d => d.anthropic + d.google + d.deepseek), 0.001)
                                    const width = Math.max((total / maxCost) * 100, 1)
                                    return (
                                        <div key={day.date} className="flex items-center gap-3 text-xs">
                                            <span className="text-neutral-500 w-20 shrink-0 font-mono">{day.date.slice(5)}</span>
                                            <div className="flex-1 h-4 bg-neutral-800/50 rounded overflow-hidden flex">
                                                {day.anthropic > 0 && (
                                                    <div className="bg-blue-500/60 h-full" style={{ width: `${(day.anthropic / total) * width}%` }} />
                                                )}
                                                {day.google > 0 && (
                                                    <div className="bg-emerald-500/60 h-full" style={{ width: `${(day.google / total) * width}%` }} />
                                                )}
                                                {day.deepseek > 0 && (
                                                    <div className="bg-violet-500/60 h-full" style={{ width: `${(day.deepseek / total) * width}%` }} />
                                                )}
                                            </div>
                                            <span className="text-neutral-400 w-16 text-right font-mono">{formatCost(total)}</span>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-neutral-800">
                                <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                                    <div className="w-2.5 h-2.5 rounded bg-blue-500/60" /> Anthropic (Claude)
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                                    <div className="w-2.5 h-2.5 rounded bg-emerald-500/60" /> Google (Gemini)
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                                    <div className="w-2.5 h-2.5 rounded bg-violet-500/60" /> DeepSeek
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: typeof Zap; label: string; value: string; color: string }) {
    const colorMap: Record<string, string> = {
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        green: 'bg-green-500/10 text-green-400 border-green-500/20',
        yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        red: 'bg-red-500/10 text-red-400 border-red-500/20',
    }
    return (
        <div className={`p-4 rounded-xl border ${colorMap[color]}`}>
            <div className="flex items-center gap-2 mb-2">
                <Icon size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-xl font-bold text-neutral-100">{value}</div>
        </div>
    )
}

function ProviderCard({
    config,
    stats,
    formatTokens,
    formatCost,
}: {
    config: typeof PROVIDER_CONFIG['anthropic']
    stats: ProviderStats | undefined
    formatTokens: (n: number) => string
    formatCost: (n: number) => string
}) {
    const colorMap: Record<string, { border: string; bg: string; text: string; badge: string }> = {
        blue: { border: 'border-blue-500/20', bg: 'bg-blue-500/5', text: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400' },
        emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', text: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400' },
        violet: { border: 'border-violet-500/20', bg: 'bg-violet-500/5', text: 'text-violet-400', badge: 'bg-violet-500/10 text-violet-400' },
    }
    const colors = colorMap[config.color] || colorMap.blue

    return (
        <div className={`p-5 rounded-xl border ${colors.border} ${colors.bg}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <config.icon size={18} className={colors.text} />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${colors.text}`}>{config.label}</span>
                            <span className="text-[10px] text-neutral-500">by {config.company}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500">{config.role} — <span className="font-mono">{config.model}</span></div>
                    </div>
                </div>
                {stats && (
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${colors.badge}`}>
                        {formatCost(stats.totalCost)}
                    </span>
                )}
            </div>

            {!stats ? (
                <p className="text-xs text-neutral-500">No usage recorded in this period.</p>
            ) : (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <Stat label="Calls" value={stats.totalCalls.toString()} sub={stats.failedCalls > 0 ? `${stats.failedCalls} failed` : undefined} />
                        <Stat label="Input Tokens" value={formatTokens(stats.totalInputTokens)} />
                        <Stat label="Output Tokens" value={formatTokens(stats.totalOutputTokens)} />
                        <Stat label="Avg Latency" value={`${(stats.avgDuration / 1000).toFixed(1)}s`} />
                    </div>

                    {/* Cache stats for Anthropic */}
                    {stats.provider === 'anthropic' && stats.totalCacheReadTokens > 0 && (
                        <div className="mb-4 px-3 py-2 bg-neutral-800/30 rounded-lg text-xs">
                            <span className="text-neutral-500">Cache reads: </span>
                            <span className="text-blue-300 font-mono">{formatTokens(stats.totalCacheReadTokens)} tokens</span>
                            <span className="text-neutral-600 ml-2">(~90% discount on these)</span>
                        </div>
                    )}

                    {/* Feature breakdown */}
                    {Object.keys(stats.features).length > 0 && (
                        <div>
                            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Usage by Feature</div>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(stats.features)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([feature, count]) => (
                                        <span key={feature} className="px-2 py-0.5 bg-neutral-800/50 rounded text-[10px] text-neutral-400">
                                            {feature.replace(/_/g, ' ')} <span className="text-neutral-500">({count})</span>
                                        </span>
                                    ))
                                }
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="px-3 py-2 bg-neutral-800/30 rounded-lg">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</div>
            <div className="text-sm font-bold text-neutral-200 mt-0.5">{value}</div>
            {sub && <div className="text-[9px] text-red-400 mt-0.5">{sub}</div>}
        </div>
    )
}
