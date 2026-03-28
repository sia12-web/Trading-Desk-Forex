'use client'

import { useState, useEffect, useCallback } from 'react'
import { GitBranch } from 'lucide-react'
import { useBackgroundTask } from '@/lib/hooks/use-background-task'
import { CMSGenerateButton } from './_components/CMSGenerateButton'
import { CMSResultsView } from './_components/CMSResultsView'
import type { CMSResult } from '@/lib/cms/types'

const PAIRS = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'EUR/GBP', 'AUD/USD',
    'USD/CAD', 'NZD/USD', 'EUR/JPY', 'USD/CHF', 'GBP/JPY',
]

export default function CMSPage() {
    const [selectedPair, setSelectedPair] = useState(PAIRS[0])
    const [cachedResult, setCachedResult] = useState<CMSResult | null>(null)
    const [cachedAt, setCachedAt] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const task = useBackgroundTask('cms_generation')

    // Load cached results on pair change
    const loadCachedResults = useCallback(async (pair: string) => {
        setLoading(true)
        setCachedResult(null)
        setCachedAt(null)
        try {
            const res = await fetch(`/api/cms/results?pair=${encodeURIComponent(pair)}`)
            if (res.ok) {
                const data = await res.json()
                if (data.result) {
                    setCachedResult(data.result as CMSResult)
                    setCachedAt(data.created_at)
                }
            }
        } catch {
            // silently fail — user can generate
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadCachedResults(selectedPair)
    }, [selectedPair, loadCachedResults])

    // When task completes, reload cached results
    useEffect(() => {
        if (task.status === 'completed') {
            loadCachedResults(selectedPair)
        }
    }, [task.status, selectedPair, loadCachedResults])

    const handleGenerate = () => {
        task.reset()
        task.startTask('/api/cms/generate', { pair: selectedPair })
    }

    const handlePairChange = (pair: string) => {
        if (task.status === 'running') return // don't switch while generating
        setSelectedPair(pair)
        task.reset()
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <GitBranch size={20} className="text-blue-400" />
                    <h1 className="text-lg font-bold text-white">CMS Engine</h1>
                </div>
                <p className="text-sm text-neutral-500">
                    Discover how this market behaves after specific conditions — statistical IF → THEN patterns
                </p>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <label className="text-xs text-neutral-500 font-medium">Pair</label>
                    <select
                        value={selectedPair}
                        onChange={(e) => handlePairChange(e.target.value)}
                        disabled={task.status === 'running'}
                        className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    >
                        {PAIRS.map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>

                <CMSGenerateButton
                    onGenerate={handleGenerate}
                    status={task.status}
                    progress={task.progress}
                    message={task.message}
                    error={task.error}
                    disabled={task.status === 'running'}
                />

                {cachedAt && !task.status.match(/running/) && (
                    <span className="text-xs text-neutral-600">
                        Last generated: {new Date(cachedAt).toLocaleDateString()} {new Date(cachedAt).toLocaleTimeString()}
                    </span>
                )}
            </div>

            {/* Results */}
            {loading && !cachedResult && (
                <div className="text-center py-12 text-neutral-500 text-sm">
                    Loading cached results...
                </div>
            )}

            {cachedResult && (
                <CMSResultsView result={cachedResult} />
            )}

            {!cachedResult && !loading && task.status !== 'running' && (
                <div className="text-center py-20 space-y-3">
                    <GitBranch size={40} className="mx-auto text-neutral-700" />
                    <p className="text-neutral-500 text-sm">
                        Select a pair and generate to discover conditional market patterns.
                    </p>
                    <p className="text-neutral-600 text-xs">
                        Analysis uses 3 AI models and takes approximately 2-3 minutes. Results are cached for 7 days.
                    </p>
                </div>
            )}
        </div>
    )
}
