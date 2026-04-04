/**
 * Pattern Backtesting Engine
 *
 * Simulates trading based on discovered correlation patterns
 * and calculates performance metrics using DeepSeek for quantitative analysis.
 */

import { callDeepSeek } from '@/lib/ai/clients'
import type { CorrelationScenarioRow, PatternOccurrence } from './types'
import type { OandaCandle } from '@/lib/types/oanda'
import { fetchAllPairCandles } from './data-fetcher'

export interface BacktestTrade {
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  direction: 'long' | 'short'
  pips: number
  profit_loss: number
  duration_hours: number
  outcome: 'win' | 'loss'
}

export interface BacktestMetrics {
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  total_pips: number
  avg_win_pips: number
  avg_loss_pips: number
  largest_win: number
  largest_loss: number
  profit_factor: number
  avg_rr_ratio: number
  max_consecutive_wins: number
  max_consecutive_losses: number
  max_drawdown_pips: number
  max_drawdown_percent: number
  sharpe_ratio: number
  sortino_ratio: number
  calmar_ratio: number
  expectancy: number
}

export interface BacktestResult {
  scenario_id: string
  pattern_description: string
  trades: BacktestTrade[]
  metrics: BacktestMetrics
  equity_curve: Array<{ date: string; equity: number }>
  deepseek_analysis: string
  recommendations: string[]
}

/**
 * Run backtest for a correlation pattern
 */
export async function backtestPattern(
  scenario: CorrelationScenarioRow,
  lookbackDays: number = 200,
  riskPerTrade: number = 2, // % of account per trade
  stopLossPips: number = 50,
  takeProfitPips: number = 100
): Promise<BacktestResult> {
  console.log(`[Backtester] Running backtest for pattern: ${scenario.pattern_description}`)

  const outcome = scenario.expected_outcome as { pair: string; direction: string; minMove: number }

  // Fetch historical candles for the outcome pair
  const pairCandles = await fetchAllPairCandles([outcome.pair], lookbackDays)
  const candles = pairCandles.get(outcome.pair) || []

  if (candles.length < 50) {
    throw new Error('Insufficient candle data for backtesting')
  }

  // Simulate trades based on pattern occurrences
  const trades: BacktestTrade[] = []
  let accountBalance = 10000 // Starting capital
  const equityCurve: Array<{ date: string; equity: number }> = [
    { date: candles[0].time.split('T')[0], equity: accountBalance }
  ]

  // Get pattern occurrences from database
  const occurrences = (scenario as any).occurrences || []

  for (const occurrence of occurrences) {
    const occurrenceDate = occurrence.date
    const candleIndex = candles.findIndex(c => c.time.split('T')[0] === occurrenceDate)

    if (candleIndex < 0 || candleIndex >= candles.length - 5) continue

    const entryCandle = candles[candleIndex + 1] // Enter next day
    const entryPrice = parseFloat(entryCandle.mid.c)
    const direction = outcome.direction === 'up' ? 'long' : 'short'

    // Calculate position size (risk 2% of account)
    const riskAmount = accountBalance * (riskPerTrade / 100)
    const positionSize = riskAmount / stopLossPips

    // Simulate trade execution over next 5 days
    let exitPrice = entryPrice
    let exitDate = entryCandle.time.split('T')[0]
    let exitIndex = candleIndex + 1
    let outcome_result: 'win' | 'loss' = 'loss'

    for (let i = candleIndex + 2; i < Math.min(candleIndex + 7, candles.length); i++) {
      const checkCandle = candles[i]
      const high = parseFloat(checkCandle.mid.h)
      const low = parseFloat(checkCandle.mid.l)
      const close = parseFloat(checkCandle.mid.c)

      if (direction === 'long') {
        // Check stop loss
        if (low <= entryPrice - stopLossPips * 0.0001) {
          exitPrice = entryPrice - stopLossPips * 0.0001
          exitDate = checkCandle.time.split('T')[0]
          exitIndex = i
          outcome_result = 'loss'
          break
        }
        // Check take profit
        if (high >= entryPrice + takeProfitPips * 0.0001) {
          exitPrice = entryPrice + takeProfitPips * 0.0001
          exitDate = checkCandle.time.split('T')[0]
          exitIndex = i
          outcome_result = 'win'
          break
        }
        exitPrice = close
        exitDate = checkCandle.time.split('T')[0]
        exitIndex = i
      } else {
        // Short
        if (high >= entryPrice + stopLossPips * 0.0001) {
          exitPrice = entryPrice + stopLossPips * 0.0001
          exitDate = checkCandle.time.split('T')[0]
          exitIndex = i
          outcome_result = 'loss'
          break
        }
        if (low <= entryPrice - takeProfitPips * 0.0001) {
          exitPrice = entryPrice - takeProfitPips * 0.0001
          exitDate = checkCandle.time.split('T')[0]
          exitIndex = i
          outcome_result = 'win'
          break
        }
        exitPrice = close
        exitDate = checkCandle.time.split('T')[0]
        exitIndex = i
      }
    }

    // Calculate P&L
    const priceDiff = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice
    const pips = priceDiff * 10000
    const profitLoss = pips * positionSize

    accountBalance += profitLoss

    trades.push({
      entry_date: entryCandle.time.split('T')[0],
      entry_price: entryPrice,
      exit_date: exitDate,
      exit_price: exitPrice,
      direction,
      pips,
      profit_loss: profitLoss,
      duration_hours: (exitIndex - candleIndex - 1) * 24,
      outcome: outcome_result
    })

    equityCurve.push({
      date: exitDate,
      equity: accountBalance
    })
  }

  // Calculate metrics
  const metrics = calculateMetrics(trades, equityCurve)

  // Use DeepSeek for advanced quantitative analysis
  const deepseekAnalysis = await analyzeBacktestWithDeepSeek(scenario, trades, metrics)

  return {
    scenario_id: scenario.id,
    pattern_description: scenario.pattern_description,
    trades,
    metrics,
    equity_curve: equityCurve,
    deepseek_analysis: deepseekAnalysis,
    recommendations: extractRecommendations(deepseekAnalysis)
  }
}

/**
 * Calculate backtest metrics
 */
function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: Array<{ date: string; equity: number }>
): BacktestMetrics {
  const winningTrades = trades.filter(t => t.outcome === 'win')
  const losingTrades = trades.filter(t => t.outcome === 'loss')

  const totalPips = trades.reduce((sum, t) => sum + t.pips, 0)
  const winPips = winningTrades.reduce((sum, t) => sum + t.pips, 0)
  const lossPips = Math.abs(losingTrades.reduce((sum, t) => sum + t.pips, 0))

  const avgWinPips = winningTrades.length > 0 ? winPips / winningTrades.length : 0
  const avgLossPips = losingTrades.length > 0 ? lossPips / losingTrades.length : 0

  const profitFactor = lossPips > 0 ? winPips / lossPips : 0
  const avgRR = avgLossPips > 0 ? avgWinPips / avgLossPips : 0

  // Max consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0
  let currentConsecWins = 0, currentConsecLosses = 0

  for (const trade of trades) {
    if (trade.outcome === 'win') {
      currentConsecWins++
      currentConsecLosses = 0
      maxConsecWins = Math.max(maxConsecWins, currentConsecWins)
    } else {
      currentConsecLosses++
      currentConsecWins = 0
      maxConsecLosses = Math.max(maxConsecLosses, currentConsecLosses)
    }
  }

  // Max drawdown
  let peak = equityCurve[0].equity
  let maxDrawdownPips = 0
  let maxDrawdownPercent = 0

  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity
    const drawdown = peak - point.equity
    const drawdownPercent = (drawdown / peak) * 100

    maxDrawdownPips = Math.max(maxDrawdownPips, drawdown)
    maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent)
  }

  // Sharpe ratio (simplified)
  const returns = []
  for (let i = 1; i < equityCurve.length; i++) {
    const ret = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity
    returns.push(ret)
  }

  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  )
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0

  // Expectancy
  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0
  const expectancy = (winRate * avgWinPips) - ((1 - winRate) * avgLossPips)

  return {
    total_trades: trades.length,
    winning_trades: winningTrades.length,
    losing_trades: losingTrades.length,
    win_rate: winRate * 100,
    total_pips: totalPips,
    avg_win_pips: avgWinPips,
    avg_loss_pips: avgLossPips,
    largest_win: Math.max(...trades.map(t => t.pips)),
    largest_loss: Math.min(...trades.map(t => t.pips)),
    profit_factor: profitFactor,
    avg_rr_ratio: avgRR,
    max_consecutive_wins: maxConsecWins,
    max_consecutive_losses: maxConsecLosses,
    max_drawdown_pips: maxDrawdownPips,
    max_drawdown_percent: maxDrawdownPercent,
    sharpe_ratio: sharpeRatio,
    sortino_ratio: 0, // Placeholder
    calmar_ratio: 0, // Placeholder
    expectancy
  }
}

/**
 * Use DeepSeek to analyze backtest results and provide insights
 */
async function analyzeBacktestWithDeepSeek(
  scenario: CorrelationScenarioRow,
  trades: BacktestTrade[],
  metrics: BacktestMetrics
): Promise<string> {
  const prompt = `You are a quantitative analyst reviewing a forex pattern backtest.

## CRITICAL ANTI-HALLUCINATION RULES
1. ONLY analyze the backtest metrics provided below
2. DO NOT reference:
   - Specific market conditions or events not in the data
   - Other strategies or benchmarks not provided
   - Personal trading experiences or anecdotes
   - Specific traders or funds
3. Base ALL conclusions on the numerical metrics shown
4. If a metric isn't provided, acknowledge the limitation
5. Use statistical language: "The data suggests..." not "This will..."

PATTERN:
${scenario.pattern_description}

BACKTEST RESULTS:
- Total Trades: ${metrics.total_trades}
- Win Rate: ${metrics.win_rate.toFixed(1)}%
- Profit Factor: ${metrics.profit_factor.toFixed(2)}
- Total Pips: ${metrics.total_pips.toFixed(1)}
- Avg Win: ${metrics.avg_win_pips.toFixed(1)} pips
- Avg Loss: ${metrics.avg_loss_pips.toFixed(1)} pips
- R:R Ratio: ${metrics.avg_rr_ratio.toFixed(2)}
- Max Drawdown: ${metrics.max_drawdown_percent.toFixed(1)}%
- Sharpe Ratio: ${metrics.sharpe_ratio.toFixed(2)}
- Expectancy: ${metrics.expectancy.toFixed(1)} pips

TRADING PARAMETERS:
- Risk per trade: 2%
- Stop Loss: 50 pips
- Take Profit: 100 pips

Analyze these results and provide:
1. Overall assessment (is this pattern tradable?)
2. Statistical significance (are metrics reliable given sample size?)
3. Risk analysis (is drawdown acceptable? Is profit factor healthy?)
4. Optimization suggestions (should SL/TP be adjusted?)
5. Position sizing recommendations
6. Final verdict: TRADE, OPTIMIZE, or AVOID

Be quantitative and specific. Provide actionable insights in 300-400 words.`

  const response = await callDeepSeek(prompt, {
    maxTokens: 800
  })

  return response
}

/**
 * Extract actionable recommendations from DeepSeek analysis
 */
function extractRecommendations(analysis: string): string[] {
  const recommendations: string[] = []

  const lines = analysis.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()

    // Look for recommendation patterns
    if (
      trimmed.toLowerCase().includes('recommend') ||
      trimmed.toLowerCase().includes('suggest') ||
      trimmed.toLowerCase().includes('should') ||
      trimmed.toLowerCase().includes('adjust') ||
      trimmed.match(/^\d+\./) || // Numbered lists
      trimmed.startsWith('-') || // Bullet points
      trimmed.startsWith('•')
    ) {
      if (trimmed.length > 10 && trimmed.length < 200) {
        recommendations.push(trimmed.replace(/^[\d\.\-•]\s*/, ''))
      }
    }
  }

  return recommendations.slice(0, 5) // Top 5 recommendations
}
