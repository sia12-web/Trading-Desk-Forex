import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchForexFactoryCalendar, getUpcomingEventsForPair } from '@/lib/news/forex-factory-client'
import { fetchForexNews } from '@/lib/news/forex-news-client'

export const runtime = 'nodejs'

const newsCache = new Map<string, { timestamp: number, data: any }>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour caching for news/sentiment

/**
 * GET: Fetch news data (calendar + headlines + sentiment)
 * Query params:
 *   - pair: Currency pair (optional, e.g., EUR/USD)
 *   - hoursAhead: How many hours ahead to show events (default: 48)
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const pair = searchParams.get('pair') || 'EUR/USD'
        const hoursAhead = Math.max(1, Math.min(168, parseInt(searchParams.get('hoursAhead') || '48') || 48))
        
        const cacheKey = `${pair}-${hoursAhead}`
        const cached = newsCache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            console.log(`⚡ Returning cached news for ${pair}`)
            return NextResponse.json(cached.data)
        }

        console.log(`📰 Fetching news for ${pair}, ${hoursAhead}h ahead...`)

        // Fetch economic calendar
        const allEvents = await fetchForexFactoryCalendar()
        const now = new Date()
        const cutoffTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000)

        // Filter events for the time window
        const upcomingEvents = allEvents.filter(event => {
            const eventTime = new Date(event.date)
            return eventTime >= now && eventTime <= cutoffTime
        }).map(event => {
            const eventTime = new Date(event.date)
            const minutesUntil = Math.floor((eventTime.getTime() - now.getTime()) / 60000)

            return {
                title: event.title,
                currency: event.currency,
                country: event.country,
                date: event.date,
                impact: event.impact,
                forecast: event.forecast,
                previous: event.previous,
                actual: event.actual,
                minutesUntil,
                hoursUntil: (minutesUntil / 60).toFixed(1)
            }
        })

        // Get events specific to the selected pair
        const pairEvents = await getUpcomingEventsForPair(pair, hoursAhead)

        // Fetch recent news headlines
        const headlines = await fetchForexNews(20)

        console.log(`✅ News fetched: ${upcomingEvents.length} events, ${headlines.length} headlines`)

        const finalResult = {
            success: true,
            pair,
            timestamp: new Date().toISOString(),
            calendar: {
                allEvents: upcomingEvents,
                pairEvents,
                totalEvents: upcomingEvents.length,
                highImpact: upcomingEvents.filter(e => e.impact === 'High').length,
                mediumImpact: upcomingEvents.filter(e => e.impact === 'Medium').length
            },
            news: {
                headlines,
                totalHeadlines: headlines.length
            }
        }

        // Save to cache
        newsCache.set(cacheKey, { timestamp: Date.now(), data: finalResult })

        return NextResponse.json(finalResult)
    } catch (error: any) {
        console.error('❌ News fetch error:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch news'
            },
            { status: 500 }
        )
    }
}
