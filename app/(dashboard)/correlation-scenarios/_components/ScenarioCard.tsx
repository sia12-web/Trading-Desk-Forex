'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DayDistributionChart } from './DayDistributionChart'
import type { CorrelationScenarioRow } from '@/lib/correlation/types'

interface ScenarioCardProps {
  scenario: CorrelationScenarioRow
  onDelete?: () => void
}

export function ScenarioCard({ scenario, onDelete }: ScenarioCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const accuracyColor =
    scenario.accuracy_percentage >= 70 ? 'text-green-400' :
    scenario.accuracy_percentage >= 60 ? 'text-yellow-400' :
    'text-orange-400'

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this pattern? This action cannot be undone.')) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/correlation/scenarios/${scenario.id}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        throw new Error('Failed to delete pattern')
      }

      onDelete?.()
    } catch (error) {
      console.error('Error deleting pattern:', error)
      alert('Failed to delete pattern')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs">
              {scenario.pattern_type.replace('_', '-')}
            </Badge>
            <span className={`text-lg font-bold ${accuracyColor}`}>
              {scenario.accuracy_percentage.toFixed(1)}%
            </span>
          </div>

          <p className="text-white font-medium mb-3">
            {scenario.pattern_description}
          </p>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
            <span>
              Occurrences: <strong className="text-white">{scenario.total_occurrences}</strong>
            </span>
            <span>
              Success: <strong className="text-green-400">{scenario.successful_outcomes}</strong>
            </span>
            <span>
              Failed: <strong className="text-red-400">{scenario.failed_outcomes}</strong>
            </span>
            {scenario.avg_outcome_pips && (
              <span>
                Avg Move: <strong className="text-blue-400">
                  {scenario.avg_outcome_pips.toFixed(1)} pips
                </strong>
              </span>
            )}
            <span>
              Best Day: <strong className="text-purple-400 capitalize">{scenario.best_day}</strong>
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleDelete}
            disabled={deleting}
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            {deleting ? (
              <span className="text-xs">Deleting...</span>
            ) : (
              <Trash2 size={16} />
            )}
          </Button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-neutral-500 hover:text-white transition-colors p-2"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-6 pt-6 border-t border-neutral-800 space-y-4">
          <div>
            <h4 className="text-xs uppercase text-neutral-500 font-bold mb-2">Conditions</h4>
            <div className="space-y-1">
              {scenario.conditions.map((cond, i) => (
                <div key={i} className="text-sm text-neutral-300">
                  {i + 1}. {cond.pair} → {cond.movement.replace(/_/g, ' ')}
                  {' '}(≥{(cond.threshold * 100).toFixed(1)}%)
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase text-neutral-500 font-bold mb-2">Expected Outcome</h4>
            <div className="text-sm text-neutral-300">
              {scenario.expected_outcome.pair} moves{' '}
              <strong className={scenario.expected_outcome.direction === 'up' ? 'text-green-400' : 'text-red-400'}>
                {scenario.expected_outcome.direction.toUpperCase()}
              </strong>
              {' '}by ≥{(scenario.expected_outcome.minMove * 100).toFixed(1)}%
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase text-neutral-500 font-bold mb-2">
              Day of Week Distribution
            </h4>
            <DayDistributionChart distribution={scenario.day_distribution} />
          </div>

          {/* AI Explanation */}
          {(scenario as any).pattern_explanation && (
            <div>
              <h4 className="text-xs uppercase text-neutral-500 font-bold mb-2">AI Analysis</h4>
              <div className="text-sm text-neutral-300 space-y-2">
                <p className="text-neutral-400 italic">
                  {(scenario as any).pattern_explanation.narrative}
                </p>
                {(scenario as any).pattern_explanation.key_drivers && (
                  <div className="flex flex-wrap gap-2">
                    {(scenario as any).pattern_explanation.key_drivers.map((driver: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded">
                        {driver}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Backtest Results */}
          {(scenario as any).backtest_results && (
            <div>
              <h4 className="text-xs uppercase text-neutral-500 font-bold mb-2">Backtest Results</h4>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-neutral-500 text-xs">Win Rate</div>
                  <div className="text-white font-bold">
                    {(scenario as any).backtest_results.metrics.win_rate.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500 text-xs">Profit Factor</div>
                  <div className="text-white font-bold">
                    {(scenario as any).backtest_results.metrics.profit_factor.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500 text-xs">Max DD</div>
                  <div className="text-white font-bold">
                    {(scenario as any).backtest_results.metrics.max_drawdown_percent.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-neutral-500">
            First seen: {new Date(scenario.first_occurrence_date).toLocaleDateString()} •
            Last seen: {new Date(scenario.last_occurrence_date).toLocaleDateString()}
            {scenario.avg_time_to_outcome_hours && (
              <> • Avg time to outcome: {Math.round(scenario.avg_time_to_outcome_hours)} hours</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
