import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, createClient } from '@/lib/supabase/server'
import { getCurrentPrices, getCandles } from '@/lib/oanda/client'
import { predictTomorrow } from '@/lib/correlation/predictor'
import { VALID_PAIRS } from '@/lib/utils/valid-pairs'

/**
 * POST /api/correlation/predict
 *
 * Predict tomorrow's movements based on current market conditions
 * and discovered correlation patterns.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = await createClient()

    // Step 1: Fetch all discovered patterns
    const { data: scenarios, error: scenariosError } = await client
      .from('correlation_scenarios')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gte('accuracy_percentage', 60) // Only use patterns with ≥60% accuracy for predictions

    if (scenariosError || !scenarios) {
      throw new Error('Failed to fetch patterns: ' + scenariosError?.message)
    }

    console.log(`[PredictAPI] Analyzing ${scenarios.length} patterns`)

    // Step 2: Fetch current market prices
    const instruments = VALID_PAIRS.map(p => p.replace('/', '_'))
    const { data: pricesData, error: pricesError } = await getCurrentPrices(instruments)

    if (pricesError || !pricesData) {
      throw new Error('Failed to fetch current prices: ' + pricesError)
    }

    const currentPrices = new Map(
      pricesData.map(p => [p.instrument.replace('_', '/'), p])
    )

    // Step 3: Fetch previous day's close for each pair
    const previousClose = new Map<string, number>()

    await Promise.all(
      VALID_PAIRS.map(async pair => {
        try {
          const { data: candles } = await getCandles({
            instrument: pair.replace('/', '_'),
            granularity: 'D',
            count: 2, // Last 2 days
            price: 'M'
          })

          if (candles && candles.length >= 2) {
            // Use second-to-last candle's close as "previous close"
            const prevClose = parseFloat(candles[candles.length - 2].mid.c)
            previousClose.set(pair, prevClose)
          }
        } catch (error) {
          console.error(`[PredictAPI] Failed to fetch candles for ${pair}:`, error)
        }
      })
    )

    console.log(`[PredictAPI] Fetched ${previousClose.size} previous closes`)

    // Step 4: Run prediction engine
    const prediction = await predictTomorrow(scenarios, currentPrices, previousClose)

    return NextResponse.json(prediction)
  } catch (error) {
    console.error('[PredictAPI] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prediction failed' },
      { status: 500 }
    )
  }
}
