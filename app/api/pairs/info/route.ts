import { NextRequest, NextResponse } from 'next/server'
import { PAIR_KNOWLEDGE } from '@/lib/utils/pair-knowledge'
import { getMarketSessions } from '@/lib/utils/market-sessions'
import { getOpenTrades } from '@/lib/oanda/client'
import { getAuthUser } from '@/lib/supabase/server'
import { isValidPair } from '@/lib/utils/valid-pairs'

export async function GET(request: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const pairQuery = searchParams.get('pair')

    if (!pairQuery) {
        return NextResponse.json({ error: 'Pair is required' }, { status: 400 })
    }

    // Convert from EUR_USD to EUR/USD if needed
    const pair = pairQuery.replace('_', '/')

    if (!isValidPair(pair)) {
        return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    }
    const knowledge = PAIR_KNOWLEDGE[pair]

    if (!knowledge) {
        // Return a basic fallback if we don't have knowledge base entry
        const [base, quote] = pair.split('/')
        return NextResponse.json({
            pair,
            displayName: `${base || ''} / ${quote || ''}`,
            baseCurrency: base || '',
            quoteCurrency: quote || '',
            nickname: null,
            bestSessions: [],
            worstSessions: [],
            avgDailyRange: 0,
            avgRangeBySession: {},
            drivers: [],
            correlations: [],
            warnings: [],
            tips: [],
            currentSession: {
                status: 'Closed/Other',
                isIdeal: false,
                isWorst: false
            },
            correlatedPositions: []
        })
    }

    // 1. Get current session context
    const sessionSnapshot = getMarketSessions()
    const currentSessionStr = sessionSnapshot.displaySession

    let isIdeal = false
    let isWorst = false

    // 2. Identify if it's an ideal trading window for this pair
    if (knowledge) {
        isIdeal = knowledge.bestSessions.some((s: string) =>
            s.toLowerCase().includes(currentSessionStr.toLowerCase()) ||
            currentSessionStr.toLowerCase().includes(s.toLowerCase())
        )
        isWorst = knowledge.worstSessions.some((s: string) =>
            s.toLowerCase().includes(currentSessionStr.toLowerCase()) ||
            currentSessionStr.toLowerCase().includes(s.toLowerCase())
        )
    }

    // 2. Get user's correlated open positions
    const openTradesResult = await getOpenTrades()
    let correlatedPositions: any[] = []

    if (!openTradesResult.error && openTradesResult.data) {
        const openTrades = openTradesResult.data; // Rename for clarity
        const openCorrelated = openTrades.filter((t: any) => {
            const tPair = t.instrument.replace('_', '/')
            return tPair !== pair && knowledge.correlations.some((c: any) => c.pair === tPair)
        })

        correlatedPositions = openCorrelated.map((t: any) => {
            const tPair = t.instrument.replace('_', '/')
            const correlationInfo = knowledge.correlations.find((c: any) => c.pair === tPair)
            return {
                tradeId: t.id,
                instrument: tPair,
                units: t.currentUnits,
                correlation: correlationInfo
            }
        })
    }

    return NextResponse.json({
        ...knowledge,
        currentSession: {
            status: currentSessionStr,
            isIdeal,
            isWorst,
            marketPhase: sessionSnapshot.marketPhase
        },
        correlatedPositions
    })
}
