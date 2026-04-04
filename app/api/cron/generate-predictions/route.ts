import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { predictTomorrow } from '@/lib/correlation/predictor'
import { getCurrentPrices, getCandles } from '@/lib/oanda/client'
import { VALID_PAIRS } from '@/lib/utils/valid-pairs'

/**
 * CRON: Generate Daily Correlation Predictions
 *
 * Runs at 5:30 AM UTC (after market close, all daily candles finalized)
 * Generates predictions for all users with active correlation patterns
 *
 * Railway Cron: 30 5 star star star (5:30 AM UTC daily)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[GeneratePredictionsCron] Starting daily prediction generation...')
  const startTime = Date.now()

  try {
    const client = await createClient()

    // Get all users with active correlation scenarios
    const { data: users } = await client
      .from('correlation_scenarios')
      .select('user_id')
      .eq('is_active', true)
      .gte('accuracy_percentage', 60) // Only users with patterns ≥60% accurate

    if (!users || users.length === 0) {
      console.log('[GeneratePredictionsCron] No users with active patterns')
      return NextResponse.json({
        success: true,
        message: 'No users to generate predictions for',
        duration: Date.now() - startTime
      })
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(users.map(u => u.user_id))]
    console.log(`[GeneratePredictionsCron] Generating predictions for ${uniqueUserIds.length} users`)

    // Fetch current prices and previous close (once for all users)
    const instruments = VALID_PAIRS.map(p => p.replace('/', '_'))
    const { data: pricesData } = await getCurrentPrices(instruments)

    if (!pricesData) {
      throw new Error('Failed to fetch current prices from OANDA')
    }

    const currentPrices = new Map(
      pricesData.map(p => [p.instrument.replace('_', '/'), p])
    )

    // Fetch previous close for all pairs
    const previousClose = new Map<string, number>()
    await Promise.all(
      VALID_PAIRS.map(async pair => {
        try {
          const { data: candles } = await getCandles({
            instrument: pair.replace('/', '_'),
            granularity: 'D',
            count: 2,
            price: 'M'
          })

          if (candles && candles.length >= 2) {
            const prevClose = parseFloat(candles[candles.length - 2].mid.c)
            previousClose.set(pair, prevClose)
          }
        } catch (error) {
          console.warn(`[GeneratePredictionsCron] Failed to fetch candles for ${pair}:`, error)
        }
      })
    )

    console.log('[GeneratePredictionsCron] Market data fetched. Generating predictions...')

    let successCount = 0
    let errorCount = 0
    const results = []

    for (const userId of uniqueUserIds) {
      try {
        // Fetch user's scenarios
        const { data: scenarios } = await client
          .from('correlation_scenarios')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .gte('accuracy_percentage', 60)
          .order('accuracy_percentage', { ascending: false, nullsFirst: false })

        if (!scenarios || scenarios.length === 0) {
          continue
        }

        // Generate predictions
        const prediction = await predictTomorrow(scenarios, currentPrices, previousClose)

        // Delete old predictions (keep only last 7 days)
        await client
          .from('correlation_predictions')
          .delete()
          .eq('user_id', userId)
          .lt('generated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

        // Store new prediction
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        const { error: insertError } = await client
          .from('correlation_predictions')
          .insert({
            user_id: userId,
            predictions: prediction,
            top_predictions: prediction.topPredictions,
            confidence: prediction.confidence,
            ai_synthesis: prediction.aiSynthesis,
            patterns_used: prediction.predictions.length,
            avg_pattern_accuracy:
              prediction.predictions.length > 0
                ? prediction.predictions.reduce((sum, p) => sum + p.scenario.accuracy_percentage, 0) /
                  prediction.predictions.length
                : 0,
            trading_day_status: prediction.tradingDayStatus,
            expires_at: expiresAt.toISOString()
          })

        if (insertError) {
          console.error(`[GeneratePredictionsCron] Error storing prediction for user ${userId}:`, insertError)
          errorCount++
          results.push({
            user_id: userId,
            error: insertError.message
          })
        } else {
          successCount++
          results.push({
            user_id: userId,
            patterns_used: prediction.predictions.length,
            top_predictions_count: prediction.topPredictions.length,
            confidence: prediction.confidence
          })
        }
      } catch (error) {
        console.error(`[GeneratePredictionsCron] Error generating prediction for user ${userId}:`, error)
        errorCount++
        results.push({
          user_id: userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const duration = Date.now() - startTime

    console.log(
      `[GeneratePredictionsCron] Complete: ${successCount} success, ${errorCount} errors in ${duration}ms`
    )

    return NextResponse.json({
      success: true,
      users_processed: uniqueUserIds.length,
      predictions_generated: successCount,
      errors: errorCount,
      duration,
      results
    })
  } catch (error) {
    console.error('[GeneratePredictionsCron] Fatal error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Prediction generation failed',
        duration: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}
