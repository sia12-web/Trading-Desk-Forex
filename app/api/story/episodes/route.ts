import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getEpisodes } from '@/lib/data/stories'

export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const pair = searchParams.get('pair')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!pair) {
        return NextResponse.json({ error: 'pair is required' }, { status: 400 })
    }

    try {
        const episodes = await getEpisodes(user.id, pair, limit, offset)
        return NextResponse.json({ episodes })
    } catch (error) {
        console.error('API /api/story/episodes error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
