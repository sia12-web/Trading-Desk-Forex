'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, Sparkles, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TomorrowPrediction } from '@/lib/correlation/predictor'

export function PredictionsPanel() {
  const [loading, setLoading] = useState(false)
  const [prediction, setPrediction] = useState<TomorrowPrediction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePredict = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/correlation/predict', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Prediction failed')
      }

      setPrediction(data)
    } catch (err) {
      console.error('Prediction error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate predictions')
    } finally {
      setLoading(false)
    }
  }

  const confidenceColor = {
    high: 'bg-green-500/10 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    low: 'bg-orange-500/10 text-orange-400 border-orange-500/30'
  }

  return (
    <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Sparkles size={20} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Tomorrow's Predictions</h2>
              <p className="text-sm text-neutral-400">
                AI-powered analysis of current market conditions
              </p>
            </div>
          </div>

          <Button
            onClick={handlePredict}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500"
          >
            {loading ? 'Analyzing...' : 'Predict Tomorrow'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {prediction && (
          <div className="space-y-4 mt-6">
            {/* Trading Day Warning */}
            {!prediction.tradingDayStatus.isTradingDay && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-amber-400 font-bold text-sm mb-1">
                      Market Closed Tomorrow
                    </div>
                    <div className="text-amber-200/80 text-sm">
                      {prediction.tradingDayStatus.reason}
                    </div>
                    {prediction.tradingDayStatus.nextTradingDay && (
                      <div className="text-amber-200/60 text-xs mt-2">
                        Next trading day:{' '}
                        {new Date(prediction.tradingDayStatus.nextTradingDay).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Confidence Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Confidence:</span>
              <Badge
                variant="outline"
                className={`${confidenceColor[prediction.confidence]} uppercase text-xs font-bold`}
              >
                {prediction.confidence}
              </Badge>
              <span className="text-xs text-neutral-500">
                ({prediction.predictions.length} matching patterns)
              </span>
            </div>

            {/* Top Predictions */}
            {prediction.topPredictions.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-neutral-400 uppercase mb-3">
                  Top Predictions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {prediction.topPredictions.map((pred, i) => (
                    <div
                      key={i}
                      className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white">{pred.pair}</span>
                        <div className="flex items-center gap-1">
                          {pred.direction === 'up' ? (
                            <TrendingUp size={16} className="text-green-400" />
                          ) : (
                            <TrendingDown size={16} className="text-red-400" />
                          )}
                          <span
                            className={`text-sm font-bold ${
                              pred.direction === 'up' ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {pred.direction === 'up' ? '+' : '-'}
                            {pred.expectedMove.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-neutral-500 space-y-1">
                        <div>
                          {pred.supportingPatterns} pattern
                          {pred.supportingPatterns !== 1 ? 's' : ''}
                        </div>
                        <div>{pred.avgAccuracy.toFixed(1)}% avg accuracy</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Synthesis */}
            <div className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-4">
              <h3 className="text-sm font-bold text-neutral-400 uppercase mb-2">
                AI Analysis
              </h3>
              <div className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
                {prediction.aiSynthesis}
              </div>
            </div>

            {/* Matching Patterns */}
            {prediction.predictions.length > 0 && (
              <details className="bg-neutral-900/30 border border-neutral-700 rounded-lg">
                <summary className="cursor-pointer p-4 text-sm font-bold text-neutral-400 uppercase hover:bg-neutral-800/30">
                  View Matching Patterns ({prediction.predictions.length})
                </summary>
                <div className="p-4 pt-0 space-y-3">
                  {prediction.predictions.slice(0, 5).map((match, i) => (
                    <div key={i} className="border-t border-neutral-800 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-purple-400">
                          Pattern {i + 1}
                        </span>
                        <div className="flex gap-2 text-xs">
                          <span className="text-green-400">
                            {match.scenario.accuracy_percentage.toFixed(1)}% accurate
                          </span>
                          <span className="text-neutral-500">•</span>
                          <span className="text-neutral-400">
                            {match.conditionsMet}/{match.totalConditions} conditions met
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-neutral-300">
                        {match.scenario.pattern_description}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {prediction.predictions.length === 0 && (
              <div className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-6 text-center">
                <p className="text-neutral-400">
                  No strong pattern matches detected in current market conditions.
                  <br />
                  Monitor for clearer correlation signals.
                </p>
              </div>
            )}
          </div>
        )}

        {!prediction && !loading && !error && (
          <div className="text-center py-6 text-neutral-500 text-sm">
            Click "Predict Tomorrow" to analyze current market conditions
            <br />
            against discovered correlation patterns
          </div>
        )}
      </CardContent>
    </Card>
  )
}
