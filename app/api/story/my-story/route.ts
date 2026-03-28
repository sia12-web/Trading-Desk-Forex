import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { isValidPair } from '@/lib/utils/valid-pairs'

/**
 * GET /api/story/my-story?pair=EUR_USD
 * Fetches the user's private note for a pair.
 */
export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const pair = req.nextUrl.searchParams.get('pair')
    if (!pair || !isValidPair(pair)) return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('user_pair_notes')
        .select('content')
        .eq('user_id', user.id)
        .eq('pair', pair)
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
        console.error('Fetch user note error:', error)
        return NextResponse.json({ error: 'Failed to fetch note' }, { status: 500 })
    }

    return NextResponse.json({ content: data?.content || '' })
}

/**
 * POST /api/story/my-story
 * Upserts the user's private note for a pair.
 */
export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { pair, content } = body

    if (!pair || !isValidPair(pair)) return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })

    const supabase = await createClient()
    const { error } = await supabase
        .from('user_pair_notes')
        .upsert({
            user_id: user.id,
            pair,
            content: content || '',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id, pair' })

    if (error) {
        console.error('Upsert user note error:', error)
        return NextResponse.json({ error: 'Failed to save note' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
