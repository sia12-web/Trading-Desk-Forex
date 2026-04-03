import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { isValidPair } from '@/lib/utils/valid-pairs'

/**
 * GET /api/story/my-story?pair=EUR_USD&date=2024-04-03
 * Fetches the user's private entry for a specific date and pair.
 */
export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const pair = req.nextUrl.searchParams.get('pair')
    const date = req.nextUrl.searchParams.get('date')

    if (!pair || !isValidPair(pair)) return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })

    const supabase = await createClient()
    
    // Fetch entry and its screenshots
    const { data: entry, error } = await supabase
        .from('user_story_entries')
        .select(`
            id,
            content,
            screenshots:user_story_screenshots(*)
        `)
        .eq('user_id', user.id)
        .eq('pair', pair)
        .eq('entry_date', date)
        .single()

    if (error && error.code !== 'PGRST116') {
        console.error('Fetch user story error:', error)
        return NextResponse.json({ error: 'Failed to fetch entry' }, { status: 500 })
    }

    return NextResponse.json({ 
        content: entry?.content || '',
        screenshots: entry?.screenshots || [],
        entryId: entry?.id || null
    })
}

/**
 * POST /api/story/my-story
 * Upserts a daily analysis entry.
 */
export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { pair, content, date } = body

    if (!pair || !isValidPair(pair)) return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('user_story_entries')
        .upsert({
            user_id: user.id,
            pair,
            entry_date: date,
            content: content || '',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id, pair, entry_date' })
        .select('id')
        .single()

    if (error) {
        console.error('Upsert user story error:', error)
        return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
    }

    return NextResponse.json({ success: true, entryId: data.id })
}
