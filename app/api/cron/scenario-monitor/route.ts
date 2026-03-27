import { NextRequest, NextResponse } from 'next/server'
import { runScenarioMonitor } from '@/lib/story/scenario-monitor'

export const maxDuration = 60

/**
 * Cron: monitors active story scenarios against live OANDA prices.
 * Runs every 15 minutes. Auto-resolves triggered/invalidated scenarios
 * and queues new episode generation when a scenario triggers.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
    const secret = (process.env.CRON_SECRET || '').trim()
    const authHeader = req.headers.get('authorization')
    const queryKey = req.nextUrl.searchParams.get('key')
    const expectedSecret = `Bearer ${secret}`

    if (!secret) {
        console.error('[ScenarioMonitor Cron] CRON_SECRET is not configured')
        return NextResponse.json({ error: 'Config missing' }, { status: 500 })
    }

    const isAuthorized = 
        (authHeader && authHeader.trim() === expectedSecret) || 
        (queryKey && queryKey.trim() === secret)

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const result = await runScenarioMonitor()
        return NextResponse.json(result)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ScenarioMonitor Cron] Error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
