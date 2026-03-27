'use client'

interface Scenario {
    id: string
    title: string
    direction: string
    trigger_level?: number | null
    invalidation_level?: number | null
    trigger_direction?: string | null
    invalidation_direction?: string | null
    probability: number
}

interface Props {
    scenarios: Scenario[]
    currentPrice: number
    positionEntry?: number | null
}

export function ScenarioProximity({ scenarios, currentPrice, positionEntry }: Props) {
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
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">Scenario Proximity</h3>

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

                    return (
                        <div key={scenario.id} className="space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
                                    {scenario.title}
                                </span>
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
                                <span className={`font-semibold ${triggerProximity >= 60 ? 'text-green-400' : triggerProximity >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {triggerProximity}% toward trigger
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
        </section>
    )
}
