'use client'

import { useState, useEffect } from 'react'
import { useBackgroundTask } from '@/lib/hooks/use-background-task'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScenarioCard } from './_components/ScenarioCard'
import { PredictionsPanel } from './_components/PredictionsPanel'
import type { CorrelationScenarioRow, CorrelationCacheRow } from '@/lib/correlation/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export default function CorrelationScenariosPage() {
  const [scenarios, setScenarios] = useState<CorrelationScenarioRow[]>([])
  const [cache, setCache] = useState<CorrelationCacheRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    minAccuracy: 55,
    day: null as string | null,
    sortBy: 'accuracy'
  })

  const task = useBackgroundTask('correlation_analysis')

  const checkCache = async () => {
    try {
      const res = await fetch('/api/correlation/cache')
      const data = await res.json()
      setCache(data.cache)
    } catch (error) {
      console.error('Error checking cache:', error)
    }
  }

  const loadScenarios = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        minAccuracy: filters.minAccuracy.toString(),
        day: filters.day || '',
        sortBy: filters.sortBy,
        limit: '1000'
      })
      const res = await fetch(`/api/correlation/scenarios?${params}`)
      const data = await res.json()
      setScenarios(data.scenarios || [])
    } catch (error) {
      console.error('Error loading scenarios:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyze = async () => {
    task.reset()
    task.startTask('/api/correlation/analyze', { lookbackDays: 200 })
  }

  useEffect(() => {
    checkCache()
    loadScenarios()
  }, [])

  useEffect(() => {
    loadScenarios()
  }, [filters])

  useEffect(() => {
    if (task.status === 'completed') {
      checkCache()
      loadScenarios()
    }
  }, [task.status])

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="rounded-3xl bg-neutral-900/50 border border-neutral-800 p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
            <TrendingUp size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Correlation Scenario Analysis</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Multi-currency pattern mining across all 18 forex pairs
            </p>
          </div>
        </div>

        {cache && (
          <div className="mt-4 text-xs text-neutral-500 space-y-1">
            <div>
              Last analyzed: {new Date(cache.created_at).toLocaleString()} •
              Expires: {new Date(cache.expires_at).toLocaleString()}
            </div>
            <div>
              {cache.total_patterns_discovered} patterns discovered •
              {cache.high_accuracy_count} high (≥70%) •
              {cache.medium_accuracy_count} medium (60-69%) •
              {cache.low_accuracy_count} low (55-59%)
            </div>
          </div>
        )}
      </div>

      {/* Tomorrow's Predictions */}
      <PredictionsPanel />

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <Button
              onClick={handleAnalyze}
              disabled={task.status === 'running'}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
            >
              {task.status === 'running' ? 'Analyzing...' : 'Run Analysis'}
            </Button>

            {task.status === 'running' && (
              <div className="flex-1 max-w-md">
                <div className="text-xs text-neutral-500 mb-1">{task.message || 'Processing...'}</div>
                <div className="w-full bg-neutral-800 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="ml-auto flex gap-3">
              <Button
                onClick={() => window.open('/api/correlation/export?format=csv', '_blank')}
                className="bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 text-xs"
              >
                Export CSV
              </Button>

              <Button
                onClick={() => window.open('/api/correlation/export?format=json', '_blank')}
                className="bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 text-xs"
              >
                Export JSON
              </Button>

              <select
                value={filters.minAccuracy}
                onChange={(e) => setFilters({...filters, minAccuracy: parseInt(e.target.value)})}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="55">Accuracy ≥ 55%</option>
                <option value="60">Accuracy ≥ 60%</option>
                <option value="70">Accuracy ≥ 70%</option>
                <option value="80">Accuracy ≥ 80%</option>
              </select>

              <select
                value={filters.day || ''}
                onChange={(e) => setFilters({...filters, day: e.target.value || null})}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">All Days</option>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              <select
                value={filters.sortBy}
                onChange={(e) => setFilters({...filters, sortBy: e.target.value})}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="accuracy">Sort by Accuracy</option>
                <option value="occurrences">Sort by Occurrences</option>
                <option value="pips">Sort by Avg Pips</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12 text-neutral-500">Loading scenarios...</div>
      ) : scenarios.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-500">
            No patterns discovered yet. Click "Run Analysis" to mine historical data.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-neutral-500">
            Showing {scenarios.length} pattern{scenarios.length !== 1 ? 's' : ''}
          </div>
          {scenarios.map(scenario => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onDelete={() => loadScenarios()}
            />
          ))}
        </div>
      )}
    </div>
  )
}
