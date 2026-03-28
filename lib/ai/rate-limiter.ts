/**
 * Database-backed rate limiter for AI pipeline calls.
 * 5 calls per hour per user. Counts from ai_usage_logs table.
 * Survives cold starts and works across multiple instances.
 */
import { createClient } from '@/lib/supabase/server'

const MAX_CALLS_PER_HOUR = 5
const HOUR_MS = 60 * 60 * 1000

export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    try {
        const supabase = await createClient()
        const oneHourAgo = new Date(Date.now() - HOUR_MS).toISOString()

        const { count, error } = await supabase
            .from('ai_usage_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', oneHourAgo)

        if (error) {
            // If table doesn't exist or query fails, allow the call (fail open)
            console.error('[RateLimit] DB query failed, allowing call:', error.message)
            return { allowed: true, remaining: MAX_CALLS_PER_HOUR - 1, resetIn: HOUR_MS }
        }

        const used = count ?? 0

        if (used >= MAX_CALLS_PER_HOUR) {
            return { allowed: false, remaining: 0, resetIn: HOUR_MS }
        }

        return {
            allowed: true,
            remaining: MAX_CALLS_PER_HOUR - used,
            resetIn: HOUR_MS,
        }
    } catch (err) {
        // Fail open on unexpected errors
        console.error('[RateLimit] Unexpected error, allowing call:', err)
        return { allowed: true, remaining: MAX_CALLS_PER_HOUR - 1, resetIn: HOUR_MS }
    }
}
