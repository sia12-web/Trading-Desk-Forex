import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

const CRON_JOBS = [
    {
        name: 'Scenario Analysis',
        slug: 'scenario-analysis',
        schedule: 'Monday 3:30 AM UTC',
        description: 'Weekly institutional scenario report per pair',
    },
    {
        name: 'Story Agents',
        slug: 'story-agents',
        schedule: 'Mon-Fri 4:00 AM UTC',
        description: 'Daily intelligence agents (Optimizer, News, Cross-Market)',
    },
    {
        name: 'Story Generation',
        slug: 'story-generation',
        schedule: 'Mon-Fri 5:00 AM UTC',
        description: 'Daily episode generation for subscribed pairs',
    },
    {
        name: 'Scenario Monitor',
        slug: 'scenario-monitor',
        schedule: 'Every 15 minutes',
        description: 'Auto-resolve scenarios vs OANDA prices',
    },
]

/**
 * Test all cron job endpoints by sending a GET with the CRON_SECRET.
 * Does NOT run the full pipeline — each cron route returns quickly
 * if there are no subscriptions to process.
 *
 * Auth: regular user auth (not cron secret).
 */
export async function GET() {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
        return NextResponse.json({
            error: 'CRON_SECRET not configured',
            jobs: CRON_JOBS.map(j => ({
                ...j,
                status: 'error',
                error: 'CRON_SECRET env var missing',
            })),
        }, { status: 500 })
    }

    // Determine base URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const results = await Promise.all(
        CRON_JOBS.map(async (job) => {
            const url = `${appUrl}/api/cron/${job.slug}`
            const start = Date.now()
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${cronSecret}`,
                    },
                    signal: AbortSignal.timeout(15000),
                })
                const elapsed = Date.now() - start
                const body = await res.json().catch(() => null)

                if (res.ok) {
                    return {
                        ...job,
                        status: 'success' as const,
                        statusCode: res.status,
                        responseTime: elapsed,
                        response: body,
                    }
                } else {
                    return {
                        ...job,
                        status: 'error' as const,
                        statusCode: res.status,
                        responseTime: elapsed,
                        error: body?.error || `HTTP ${res.status}`,
                    }
                }
            } catch (err) {
                return {
                    ...job,
                    status: 'error' as const,
                    responseTime: Date.now() - start,
                    error: err instanceof Error ? err.message : 'Connection failed',
                }
            }
        })
    )

    const allPassed = results.every(r => r.status === 'success')

    return NextResponse.json({
        allPassed,
        jobs: results,
    })
}
