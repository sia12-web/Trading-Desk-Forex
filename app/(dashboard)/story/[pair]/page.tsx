'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Target, ScrollText } from 'lucide-react'
import Link from 'next/link'
import { AMDPhaseBadge } from '../_components/AMDPhaseBadge'
import { StoryNarrative } from '../_components/StoryNarrative'
import { CharacterPanel } from '../_components/CharacterPanel'
import { ScenarioCard } from '../_components/ScenarioCard'
import { EpisodeTimeline } from '../_components/EpisodeTimeline'
import { GenerateStoryButton } from '../_components/GenerateStoryButton'
import { PositionGuidanceCard } from '../_components/PositionGuidanceCard'
import { PositionJourney } from '../_components/PositionJourney'
import { ScenarioProximity } from '../_components/ScenarioProximity'

interface Episode {
    id: string
    pair: string
    episode_number: number
    season_number?: number | null
    title: string
    narrative: string
    characters: { buyers: any; sellers: any }
    current_phase: string
    key_levels: { entries?: number[]; stop_losses?: number[]; take_profits?: number[] } | null
    confidence: number | null
    next_episode_preview: string | null
    created_at: string
    raw_ai_output?: { position_guidance?: any } | null
}

interface Scenario {
    id: string
    title: string
    description: string
    direction: string
    probability: number
    trigger_conditions: string
    invalidation: string
    status: string
    trigger_level?: number | null
    invalidation_level?: number | null
    trigger_direction?: string | null
    invalidation_direction?: string | null
}

interface EpisodeListItem {
    id: string
    episode_number: number
    title: string
    current_phase: string
    confidence: number | null
    next_episode_preview: string | null
    created_at: string
}

export default function PairStoryPage() {
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const rawPair = params.pair as string
    const pair = decodeURIComponent(rawPair).replace('_', '/')
    const autoGenerate = searchParams.get('autoGenerate') === 'true'

    const [episode, setEpisode] = useState<Episode | null>(null)
    const [scenarios, setScenarios] = useState<Scenario[]>([])
    const [episodes, setEpisodes] = useState<EpisodeListItem[]>([])
    const [bible, setBible] = useState<any>(null)
    const [positionData, setPositionData] = useState<{ position: any; adjustments: any[] } | null>(null)
    const [allPositions, setAllPositions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const loadEpisodes = useCallback(async () => {
        const res = await fetch(`/api/story/episodes?pair=${encodeURIComponent(pair)}&limit=50`)
        const data = await res.json()
        setEpisodes(data.episodes || [])
        return data.episodes || []
    }, [pair])

    const loadBible = useCallback(async () => {
        const res = await fetch(`/api/story/bible?pair=${encodeURIComponent(pair)}`)
        const data = await res.json()
        setBible(data.bible)
    }, [pair])

    const loadEpisode = useCallback(async (episodeId: string) => {
        const res = await fetch(`/api/story/episodes/${episodeId}`)
        const data = await res.json()
        setEpisode(data.episode)
        setScenarios(data.scenarios || [])
    }, [])

    const loadPositions = useCallback(async () => {
        try {
            const res = await fetch(`/api/story/positions?pair=${encodeURIComponent(pair)}`)
            const data = await res.json()
            const positions = data.positions || []
            setAllPositions(positions)

            // Load adjustments for the most recent non-closed position (or latest closed)
            const active = positions.find((p: any) => ['suggested', 'active', 'partial_closed'].includes(p.status))
            const target = active || positions[0]
            if (target) {
                const detailRes = await fetch(`/api/story/positions/${target.id}`)
                const detailData = await detailRes.json()
                setPositionData(detailData)
            } else {
                setPositionData(null)
            }
        } catch (err) {
            console.error('Failed to load positions:', err)
        }
    }, [pair])

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [eps] = await Promise.all([
                loadEpisodes(),
                loadBible(),
                loadPositions()
            ])
            if (eps.length > 0) {
                await loadEpisode(eps[0].id)
            }
        } catch (err) {
            console.error('Failed to load story:', err)
        } finally {
            setLoading(false)
        }
    }, [loadEpisodes, loadBible, loadEpisode, loadPositions])

    useEffect(() => { loadData() }, [loadData])

    const handleResolveScenario = async (scenarioId: string, status: 'triggered' | 'invalidated') => {
        await fetch(`/api/story/scenarios/${scenarioId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
        // Reload scenarios
        if (episode) {
            await loadEpisode(episode.id)
        }
    }

    const handleSelectEpisode = (episodeId: string) => {
        loadEpisode(episodeId)
    }

    const handleActivatePosition = async (positionId: string) => {
        await fetch(`/api/story/positions/${positionId}/activate`, { method: 'POST' })
        await loadPositions()
    }

    const handleGenerateComplete = () => {
        loadData()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-neutral-600" />
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/story"
                        className="p-2 hover:bg-neutral-800 rounded-xl transition-colors"
                    >
                        <ArrowLeft size={18} className="text-neutral-400" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-bold text-neutral-100">{pair}</h1>
                            {episode && <AMDPhaseBadge phase={episode.current_phase} />}
                        </div>
                        {episode && (
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded leading-none">
                                    S{episode.season_number || 1}
                                </span>
                                <span className="text-[10px] font-bold text-neutral-500 bg-neutral-500/10 px-1.5 py-0.5 rounded leading-none">
                                    EP {episode.episode_number}
                                </span>
                                <p className="text-xs text-neutral-500 font-medium">
                                    {episode.title}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <GenerateStoryButton pair={pair} episodeCount={episodes.length} onComplete={handleGenerateComplete} autoGenerate={autoGenerate} />
            </div>

            {episode ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Story Bible Summary */}
                        {bible && (
                            <section className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 border-l-4 border-l-blue-500/50">
                                <div className="flex items-center gap-2 mb-4">
                                    <ScrollText size={16} className="text-blue-400" />
                                    <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Story Bible (Full Arc Summary)</h2>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-300 leading-relaxed font-medium">
                                        {bible.arc_summary}
                                    </p>
                                    
                                    {bible.trade_history_summary && (
                                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                                            <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Trader Account Activity</h3>
                                            <p className="text-xs text-neutral-400 italic">
                                                {bible.trade_history_summary}
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-800">
                                        {bible.dominant_themes?.map((t: string) => (
                                            <span key={t} className="text-[10px] text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded-md">
                                                #{t.replace(' ', '_')}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Position Guidance */}
                        <PositionGuidanceCard
                            guidance={episode.raw_ai_output?.position_guidance || null}
                            activePosition={positionData?.position && ['suggested', 'active', 'partial_closed'].includes(positionData.position.status) ? positionData.position : null}
                            onActivate={handleActivatePosition}
                        />

                        {/* Narrative */}
                        <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-6">
                            <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4">Story</h2>
                            <StoryNarrative content={episode.narrative} />
                        </section>

                        {/* Characters */}
                        <section>
                            <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-3">Characters</h2>
                            <CharacterPanel
                                buyers={episode.characters?.buyers || { strength: 'balanced', momentum: '', narrative: '' }}
                                sellers={episode.characters?.sellers || { strength: 'balanced', momentum: '', narrative: '' }}
                            />
                        </section>

                        {/* Scenarios */}
                        <section>
                            <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-3">
                                Scenarios
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {scenarios.map(s => (
                                    <ScenarioCard
                                        key={s.id}
                                        scenario={s}
                                        onResolve={handleResolveScenario}
                                    />
                                ))}
                                {scenarios.length === 0 && (
                                    <p className="text-sm text-neutral-500 col-span-2">No scenarios for this episode.</p>
                                )}
                            </div>
                        </section>

                        {/* Next Episode Preview */}
                        {episode.next_episode_preview && (
                            <section className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Next Episode Preview</h3>
                                <p className="text-sm text-neutral-300">{episode.next_episode_preview}</p>
                            </section>
                        )}
                    </div>

                    {/* Sidebar (1/3) */}
                    <div className="space-y-6">
                        {/* Key Levels */}
                        {episode.key_levels && (
                            <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Target size={14} className="text-blue-400" />
                                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Key Levels</h3>
                                </div>
                                <div className="space-y-3 text-xs">
                                    {episode.key_levels.entries && episode.key_levels.entries.length > 0 && (
                                        <div>
                                            <span className="text-blue-400 font-semibold">Entries</span>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {episode.key_levels.entries.map((p, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded font-mono">{p}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {episode.key_levels.stop_losses && episode.key_levels.stop_losses.length > 0 && (
                                        <div>
                                            <span className="text-red-400 font-semibold">Stop Loss</span>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {episode.key_levels.stop_losses.map((p, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-300 rounded font-mono">{p}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {episode.key_levels.take_profits && episode.key_levels.take_profits.length > 0 && (
                                        <div>
                                            <span className="text-green-400 font-semibold">Take Profit</span>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {episode.key_levels.take_profits.map((p, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-green-500/10 text-green-300 rounded font-mono">{p}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Confidence */}
                        {episode.confidence != null && (
                            <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Confidence</h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${
                                                episode.confidence >= 0.7 ? 'bg-green-500' :
                                                episode.confidence >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                                            }`}
                                            style={{ width: `${Math.round(episode.confidence * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-bold text-neutral-200">
                                        {Math.round(episode.confidence * 100)}%
                                    </span>
                                </div>
                            </section>
                        )}

                        {/* Scenario Proximity Gauge */}
                        {scenarios.length > 0 && episode.key_levels?.entries?.[0] && (
                            <ScenarioProximity
                                scenarios={scenarios}
                                currentPrice={episode.key_levels.entries[0]}
                                positionEntry={positionData?.position?.entry_price ?? positionData?.position?.suggested_entry}
                            />
                        )}

                        {/* Position Journey */}
                        {positionData && positionData.adjustments.length > 0 && (
                            <PositionJourney
                                position={positionData.position}
                                adjustments={positionData.adjustments}
                                episodeTitles={Object.fromEntries(
                                    episodes.map((ep: any) => [ep.episode_number, ep.title])
                                )}
                            />
                        )}

                        {/* Episode Timeline */}
                        <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Episodes</h3>
                            <EpisodeTimeline
                                episodes={episodes}
                                currentEpisodeId={episode.id}
                                onSelect={handleSelectEpisode}
                            />
                        </section>
                    </div>
                </div>
            ) : (
                /* Empty state — no episodes yet */
                <div className="text-center py-20 border border-dashed border-blue-500/20 rounded-2xl bg-blue-500/5">
                    <h2 className="text-lg font-bold text-neutral-300 mb-2">Ready to begin {pair}&apos;s story</h2>
                    <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto">
                        Click &quot;Begin the Story&quot; to create Season 1, Episode 1.
                        The AI will analyze 5 timeframes, news, and craft the opening chapter.
                    </p>
                </div>
            )}
        </div>
    )
}
