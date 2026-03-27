'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScrollText, Plus, Loader2 } from 'lucide-react'
import { PairCard } from './_components/PairCard'
import { PairSelector } from './_components/PairSelector'

interface Subscription {
    id: string
    pair: string
}

interface PairInfo {
    pair: string
    latestEpisode: {
        title: string
        current_phase: string
        episode_number: number
        created_at: string
    } | null
    activeScenarios: number
}

export default function StoryPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
    const [pairInfos, setPairInfos] = useState<PairInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [showSelector, setShowSelector] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/story/subscriptions')
            const { pairs } = await res.json()
            setSubscriptions(pairs || [])

            // Load latest episode + scenario count for each pair
            const infos: PairInfo[] = await Promise.all(
                (pairs || []).map(async (sub: Subscription) => {
                    const [episodesRes, scenariosRes] = await Promise.all([
                        fetch(`/api/story/episodes?pair=${encodeURIComponent(sub.pair)}&limit=1`),
                        fetch(`/api/story/scenarios?pair=${encodeURIComponent(sub.pair)}`),
                    ])
                    if (!episodesRes.ok || !scenariosRes.ok) {
                        const err = !episodesRes.ok ? await episodesRes.text() : await scenariosRes.text()
                        throw new Error(`Failed to load data: ${err}`)
                    }

                    const { episodes } = await episodesRes.json()
                    const { scenarios } = await scenariosRes.json()

                    return {
                        pair: sub.pair,
                        latestEpisode: episodes?.[0] || null,
                        activeScenarios: scenarios?.length || 0,
                    }
                })
            )
            setPairInfos(infos)
        } catch (err) {
            console.error('Failed to load story data:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const handleSubscribe = async (pair: string) => {
        try {
            await fetch('/api/story/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pair }),
            })
            setShowSelector(false)
            loadData()
        } catch (err) {
            console.error('Failed to subscribe:', err)
        }
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ScrollText size={24} className="text-blue-400" />
                    <div>
                        <h1 className="text-xl font-bold text-neutral-100">Story</h1>
                        <p className="text-xs text-neutral-500">Follow your pairs like a TV show. Understand the narrative.</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowSelector(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                    <Plus size={16} />
                    Add Pair
                </button>
            </div>

            {/* Pair Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={24} className="animate-spin text-neutral-600" />
                </div>
            ) : pairInfos.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-neutral-800 rounded-2xl">
                    <ScrollText size={40} className="mx-auto text-neutral-700 mb-4" />
                    <h2 className="text-lg font-bold text-neutral-400 mb-2">No pairs yet</h2>
                    <p className="text-sm text-neutral-600 mb-6 max-w-md mx-auto">
                        Start following a currency pair to get AI-powered narrative analysis.
                        Each pair becomes an ongoing story with characters, scenarios, and episodes.
                    </p>
                    <button
                        onClick={() => setShowSelector(true)}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
                    >
                        Follow Your First Pair
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pairInfos.map(info => (
                        <PairCard
                            key={info.pair}
                            pair={info.pair}
                            latestEpisode={info.latestEpisode}
                            activeScenarios={info.activeScenarios}
                        />
                    ))}
                </div>
            )}

            {/* Pair Selector Modal */}
            {showSelector && (
                <PairSelector
                    subscribedPairs={subscriptions.map(s => s.pair)}
                    onSubscribe={handleSubscribe}
                    onClose={() => setShowSelector(false)}
                />
            )}
        </div>
    )
}
