'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'

interface Scenario {
    id: string
    title: string
    direction: string
    trigger_level?: number | null
    invalidation_level?: number | null
    trigger_direction?: string | null
    trigger_timeframe?: string | null
    invalidation_direction?: string | null
    probability: number
}

interface Props {
    scenarios: Scenario[]
    currentPrice: number
    pair: string
    positionEntry?: number | null
}

const REFRESH_INTERVAL = 60_000 // 60 seconds

export function ScenarioProximity({ scenarios, currentPrice: initialPrice, pair, positionEntry }: Props) {
    const [livePrice, setLivePrice] = useState<number>(initialPrice)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [loading, setLoading] = useState(false)
    const [relativeTime, setRelativeTime] = useState<string>('')

    const fetchLivePrice = useCallback(async () => {
        try {
            setLoading(true)
            const instrument = pair.replace('/', '_')
            const res = await fetch(`/api/oanda/prices?instruments=${instrument}`)
            if (!res.ok) return

            const data = await res.json()
            if (data.prices && data.prices.length > 0) {
                const p = data.prices[0]
                const mid = (parseFloat(p.asks[0].price) + parseFloat(p.bids[0].price)) / 2
                setLivePrice(mid)
                setLastUpdated(new Date())
            }
        } catch {
            // Silently fall back to initial price
        } finally {
            setLoading(false)
        }
    }, [pair])

    // Fetch on mount + interval
    useEffect(() => {
        fetchLivePrice()
        const interval = setInterval(fetchLivePrice, REFRESH_INTERVAL)
        return () => clearInterval(interval)
    }, [fetchLivePrice])

    // Update relative time every 10 seconds
    useEffect(() => {
        function updateRelative() {
            if (!lastUpdated) {
                setRelativeTime('')
                return
            }
            const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
            if (seconds < 5) setRelativeTime('just now')
            else if (seconds < 60) setRelativeTime(`${seconds}s ago`)
            else {
                const mins = Math.floor(seconds / 60)
                setRelativeTime(`${mins}m ago`)
            }
        }
        updateRelative()
        const timer = setInterval(updateRelative, 10_000)
        return () => clearInterval(timer)
    }, [lastUpdated])

    const currentPrice = livePrice || initialPrice

    // Need at least 1 scenario with structured levels
    const scenariosWithLevels = scenarios.filter(
        s => s.trigger_level != null && s.invalidation_level != null
    )
    if (scenariosWithLevels.length === 0 || !currentPrice) return null

    // Collect all relevant price levels to determine the range
    const allLevels: number[] = [currentPrice]
    scenariosWithLevels.forEach(s => {
        if (s.trigger_level != null) allLevels.push(s.trigger_level)
        if (s.invalidation_level != null) allLevels.push(s.invalidation_level)
    })
    if (positionEntry != null) allLevels.push(positionEntry)

    const rangeMin = Math.min(...allLevels)
    const rangeMax = Math.max(...allLevels)
    const range = rangeMax - rangeMin

    if (range === 0) return null

    // Add 10% padding
    const paddedMin = rangeMin - range * 0.1
    const paddedMax = rangeMax + range * 0.1
    const paddedRange = paddedMax - paddedMin

    const toPercent = (price: number) => ((price - paddedMin) / paddedRange) * 100

    const currentPct = toPercent(currentPrice)
    const entryPct = positionEntry != null ? toPercent(positionEntry) : null

    return (
        <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Scenario Proximity</h3>
                <div className="flex items-center gap-2">
                    {lastUpdated && (
                        <span className="text-[9px] text-neutral-600">
                            Updated {relativeTime}
                        </span>
                    )}
                    <button
                        onClick={fetchLivePrice}
                        disabled={loading}
                        className="p-1 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
                        title="Refresh price"
                    >
                        <RefreshCw size={12} className={`text-neutral-500 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {scenariosWithLevels.map(scenario => {
                    const triggerPct = toPercent(scenario.trigger_level!)
                    const invalidationPct = toPercent(scenario.invalidation_level!)
                    const isBullish = scenario.direction === 'bullish'

                    // Distance from current price to trigger/invalidation
                    const distToTrigger = Math.abs(currentPrice - scenario.trigger_level!)
                    const distToInvalidation = Math.abs(currentPrice - scenario.invalidation_level!)
                    const totalDist = distToTrigger + distToInvalidation
                    const triggerProximity = totalDist > 0 ? Math.round((1 - distToTrigger / totalDist) * 100) : 50

                    // High-confidence scenarios (>= 55%) trigger at 85% proximity
                    const isHighConfidence = scenario.probability >= 0.55
                    const willAutoTrigger = isHighConfidence && triggerProximity >= 85

                    return (
                        <div key={scenario.id} className="space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                                <div className="flex items-center gap-2">
                                    <span className={`font-semibold ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
                                        {scenario.title}
                                    </span>
                                    {scenario.trigger_timeframe && (
                                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                                            {scenario.trigger_timeframe} close
                                        </span>
                                    )}
                                    {isHighConfidence && (
                                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700">
                                            85% AUTO
                                        </span>
                                    )}
                                    {willAutoTrigger && (
                                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-700 animate-pulse">
                                            READY
                                        </span>
                                    )}
                                </div>
                                <span className="text-neutral-500">{Math.round(scenario.probability * 100)}%</span>
                            </div>

                            {/* Visual bar */}
                            <div className="relative h-6 bg-neutral-800 rounded-lg overflow-hidden">
                                {/* Invalidation marker */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-red-500/60 z-10"
                                    style={{ left: `${invalidationPct}%` }}
                                />
                                <div
                                    className="absolute -top-0.5 text-[8px] text-red-400 font-mono z-20 -translate-x-1/2"
                                    style={{ left: `${Math.max(5, Math.min(95, invalidationPct))}%` }}
                                >
                                    {scenario.invalidation_level!.toFixed(scenario.invalidation_level! >= 100 ? 2 : 4)}
                                </div>

                                {/* 85% Proximity marker for high-confidence scenarios */}
                                {isHighConfidence && (() => {
                                    const range = scenario.trigger_level! - scenario.invalidation_level!
                                    const proximity85Level = scenario.invalidation_level! + (range * 0.85)
                                    const proximity85Pct = toPercent(proximity85Level)
                                    return (
                                        <>
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-amber-400/40 z-10"
                                                style={{ left: `${proximity85Pct}%` }}
                                            />
                                            <div
                                                className="absolute top-1/2 -translate-y-1/2 text-[7px] text-amber-400/60 font-mono z-20 -translate-x-1/2"
                                                style={{ left: `${Math.max(5, Math.min(95, proximity85Pct))}%` }}
                                            >
                                                85%
                                            </div>
                                        </>
                                    )
                                })()}

                                {/* Trigger marker */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-green-500/60 z-10"
                                    style={{ left: `${triggerPct}%` }}
                                />
                                <div
                                    className="absolute bottom-0 text-[8px] text-green-400 font-mono z-20 -translate-x-1/2"
                                    style={{ left: `${Math.max(5, Math.min(95, triggerPct))}%` }}
                                >
                                    {scenario.trigger_level!.toFixed(scenario.trigger_level! >= 100 ? 2 : 4)}
                                </div>

                                {/* Current price indicator */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-white z-30"
                                    style={{ left: `${currentPct}%` }}
                                />

                                {/* Position entry marker */}
                                {entryPct != null && (
                                    <div
                                        className="absolute top-1 bottom-1 w-0.5 bg-blue-400/80 z-20"
                                        style={{ left: `${entryPct}%` }}
                                    />
                                )}

                                {/* Proximity fill */}
                                <div
                                    className={`absolute top-0 bottom-0 opacity-20 ${isBullish ? 'bg-green-500' : 'bg-red-500'}`}
                                    style={{
                                        left: `${Math.min(invalidationPct, triggerPct)}%`,
                                        width: `${Math.abs(triggerPct - invalidationPct)}%`
                                    }}
                                />
                            </div>

                            {/* Proximity percentage */}
                            <div className="flex items-center justify-between text-[10px] text-neutral-500">
                                <span>Invalidation</span>
                                <span className={`font-semibold ${
                                    willAutoTrigger
                                        ? 'text-green-400 animate-pulse'
                                        : triggerProximity >= 60
                                            ? 'text-green-400'
                                            : triggerProximity >= 40
                                                ? 'text-yellow-400'
                                                : 'text-red-400'
                                }`}>
                                    {triggerProximity}% toward trigger
                                    {willAutoTrigger && ' (Auto-trigger active)'}
                                </span>
                                <span>Trigger</span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-neutral-800 text-[9px] text-neutral-500">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-white rounded-sm" />
                    <span>Price: {currentPrice.toFixed(currentPrice >= 100 ? 2 : 5)}</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500/60 rounded-sm" />
                    <span>Trigger</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-amber-400/40 rounded-sm" />
                    <span>85% Auto (High-Conf)</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500/60 rounded-sm" />
                    <span>Invalidation</span>
                </div>
                {positionEntry != null && (
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-400/80 rounded-sm" />
                        <span>Entry</span>
                    </div>
                )}
            </div>

            {/* Info note for high-confidence scenarios */}
            {scenariosWithLevels.some(s => s.probability >= 0.55) && (
                <div className="mt-2 text-[9px] text-amber-400/60 bg-amber-900/10 border border-amber-800/30 rounded px-2 py-1">
                    ⚡ High-confidence scenarios (≥55%) auto-trigger at 85% proximity to avoid missing entries
                </div>
            )}
        </section>
    )
}
