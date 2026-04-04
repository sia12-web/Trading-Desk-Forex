/**
 * Storage Helpers for Correlation Analysis
 *
 * Handles database operations for storing discovered patterns and occurrences.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DiscoveredPattern, CorrelationScenarioRow, CorrelationCacheRow } from './types'
import { generatePatternDescription } from './pattern-detector'

/**
 * Convert pattern condition count to pattern type string
 */
function getPatternType(conditionCount: number): 'two_pair' | 'three_pair' | 'four_pair' {
  switch (conditionCount) {
    case 2: return 'two_pair'
    case 3: return 'three_pair'
    case 4: return 'four_pair'
    default: throw new Error(`Invalid condition count: ${conditionCount}`)
  }
}

/**
 * Store discovered patterns in the database
 */
export async function storePatterns(
  client: SupabaseClient,
  userId: string,
  patterns: DiscoveredPattern[],
  dateRangeStart: string,
  dateRangeEnd: string,
  totalDays: number
): Promise<void> {
  console.log(`[Storage] Storing ${patterns.length} patterns for user ${userId}...`)

  // Step 1: Clear existing patterns for this user
  const { error: deleteError } = await client
    .from('correlation_scenarios')
    .delete()
    .eq('user_id', userId)

  if (deleteError) {
    console.error('[Storage] Error clearing old patterns:', deleteError)
    throw new Error(`Failed to clear old patterns: ${deleteError.message}`)
  }

  if (patterns.length === 0) {
    console.log('[Storage] No patterns to store')
    return
  }

  // Step 2: Prepare scenario rows
  const scenarioRows = patterns.map(pattern => {
    const avgPips =
      pattern.successCount > 0
        ? pattern.occurrences
            .filter(o => o.success)
            .reduce((sum, o) => sum + o.pips, 0) / pattern.successCount
        : null

    const maxPips =
      pattern.occurrences.length > 0
        ? Math.max(...pattern.occurrences.map(o => o.pips))
        : null

    const avgTimeToOutcome =
      pattern.successCount > 0
        ? Math.round(
            pattern.occurrences
              .filter(o => o.success)
              .reduce((sum, o) => sum + o.timeToOutcome, 0) / pattern.successCount
          )
        : null

    const sortedDays = Object.entries(pattern.dayDistribution).sort((a, b) => b[1] - a[1])
    const bestDay = sortedDays.length > 0 ? sortedDays[0][0] : null

    return {
      user_id: userId,
      pattern_type: getPatternType(pattern.conditions.length),
      conditions: pattern.conditions,
      expected_outcome: pattern.outcome,
      pattern_description: generatePatternDescription(pattern),
      pattern_hash: pattern.hash,
      total_occurrences: pattern.occurrences.length,
      successful_outcomes: pattern.successCount,
      failed_outcomes: pattern.failCount,
      accuracy_percentage: pattern.accuracy,
      day_distribution: pattern.dayDistribution,
      best_day: bestDay,
      avg_outcome_pips: avgPips,
      max_outcome_pips: maxPips,
      avg_time_to_outcome_hours: avgTimeToOutcome,
      first_occurrence_date: pattern.occurrences[0].date,
      last_occurrence_date: pattern.occurrences[pattern.occurrences.length - 1].date,
      date_range_analyzed: {
        start: dateRangeStart,
        end: dateRangeEnd,
        days: totalDays
      },
      is_active: true
    }
  })

  // Step 3: Insert scenarios
  const { data: insertedScenarios, error: insertError } = await client
    .from('correlation_scenarios')
    .insert(scenarioRows)
    .select('id, pattern_hash')

  if (insertError) {
    console.error('[Storage] Error inserting scenarios:', insertError)
    throw new Error(`Failed to insert scenarios: ${insertError.message}`)
  }

  console.log(`[Storage] ✓ Inserted ${insertedScenarios?.length} scenarios`)

  // Step 4: Create hash-to-id mapping
  const hashToId = new Map<string, string>()
  for (const row of insertedScenarios || []) {
    hashToId.set(row.pattern_hash, row.id)
  }

  // Step 5: Prepare occurrence rows
  const occurrenceRows = []
  for (const pattern of patterns) {
    const scenarioId = hashToId.get(pattern.hash)
    if (!scenarioId) continue

    for (const occurrence of pattern.occurrences) {
      occurrenceRows.push({
        scenario_id: scenarioId,
        occurrence_date: occurrence.date,
        day_of_week: occurrence.dayOfWeek,
        condition_values: occurrence.conditionValues,
        outcome_success: occurrence.success,
        outcome_pips: occurrence.pips,
        outcome_time_hours: Math.round(occurrence.timeToOutcome)
      })
    }
  }

  // Step 6: Insert occurrences in batches (Supabase limit: 1000 rows)
  const batchSize = 1000
  for (let i = 0; i < occurrenceRows.length; i += batchSize) {
    const batch = occurrenceRows.slice(i, i + batchSize)
    const { error: occError } = await client
      .from('correlation_scenario_occurrences')
      .insert(batch)

    if (occError) {
      console.error(`[Storage] Error inserting occurrence batch ${i / batchSize + 1}:`, occError)
      throw new Error(`Failed to insert occurrences: ${occError.message}`)
    }

    console.log(`[Storage] ✓ Inserted occurrence batch ${i / batchSize + 1}/${Math.ceil(occurrenceRows.length / batchSize)}`)
  }

  console.log(`[Storage] ✓ Stored ${occurrenceRows.length} total occurrences`)
}

/**
 * Update the analysis cache
 */
export async function updateCache(
  client: SupabaseClient,
  userId: string,
  pairs: string[],
  dateRangeStart: string,
  dateRangeEnd: string,
  patterns: DiscoveredPattern[],
  durationSeconds: number
): Promise<void> {
  console.log('[Storage] Updating analysis cache...')

  const highAccuracy = patterns.filter(p => p.accuracy >= 70).length
  const mediumAccuracy = patterns.filter(p => p.accuracy >= 60 && p.accuracy < 70).length
  const lowAccuracy = patterns.filter(p => p.accuracy >= 55 && p.accuracy < 60).length

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now

  const cacheRow: Omit<CorrelationCacheRow, 'id' | 'created_at'> = {
    user_id: userId,
    pairs_analyzed: pairs,
    date_range_start: dateRangeStart,
    date_range_end: dateRangeEnd,
    total_patterns_discovered: patterns.length,
    high_accuracy_count: highAccuracy,
    medium_accuracy_count: mediumAccuracy,
    low_accuracy_count: lowAccuracy,
    computation_duration_seconds: durationSeconds,
    expires_at: expiresAt.toISOString()
  }

  // Upsert (insert or update)
  const { error } = await client
    .from('correlation_analysis_cache')
    .upsert(cacheRow, { onConflict: 'user_id' })

  if (error) {
    console.error('[Storage] Error updating cache:', error)
    throw new Error(`Failed to update cache: ${error.message}`)
  }

  console.log('[Storage] ✓ Cache updated, expires:', expiresAt.toISOString())
}

/**
 * Clear analysis cache for a user
 */
export async function clearCache(
  client: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await client
    .from('correlation_analysis_cache')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to clear cache: ${error.message}`)
  }

  console.log(`[Storage] ✓ Cache cleared for user ${userId}`)
}
