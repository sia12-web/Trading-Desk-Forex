import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, createClient } from '@/lib/supabase/server'

/**
 * GET /api/correlation/predictions/latest
 *
 * Fetches the most recent cached prediction for the current user.
 * Returns null if no valid prediction exists (expired or not generated yet).
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = await createClient()

  // Fetch latest prediction that hasn't expired
  const { data, error } = await client
    .from('correlation_predictions')
    .select('*')
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    // No prediction found or expired
    if (error.code === 'PGRST116') {
      // No rows returned
      return NextResponse.json({
        prediction: null,
        message: 'No cached prediction available. Generate predictions or wait for daily update.'
      })
    }

    console.error('[PredictionsAPI] Error fetching latest prediction:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prediction' },
      { status: 500 }
    )
  }

  // Calculate staleness
  const generatedAt = new Date(data.generated_at)
  const now = new Date()
  const ageHours = Math.floor((now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60))
  const ageMinutes = Math.floor((now.getTime() - generatedAt.getTime()) / (1000 * 60))

  // Determine staleness level
  let stalenessLevel: 'fresh' | 'recent' | 'stale' = 'fresh'
  if (ageHours >= 12) stalenessLevel = 'stale'
  else if (ageHours >= 6) stalenessLevel = 'recent'

  return NextResponse.json({
    prediction: data.predictions, // Full TomorrowPrediction payload
    metadata: {
      id: data.id,
      generated_at: data.generated_at,
      expires_at: data.expires_at,
      age_hours: ageHours,
      age_minutes: ageMinutes,
      staleness: stalenessLevel,
      patterns_used: data.patterns_used,
      avg_accuracy: data.avg_pattern_accuracy,
      verified: data.verified,
      accuracy_percentage: data.accuracy_percentage
    }
  })
}
