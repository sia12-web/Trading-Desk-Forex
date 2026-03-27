import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getPositionsForPair } from '@/lib/data/story-positions'

export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const pair = searchParams.get('pair')

    if (!pair) {
        return NextResponse.json({ error: 'pair is required' }, { status: 400 })
    }

    try {
        const positions = await getPositionsForPair(user.id, pair)
        return NextResponse.json({ positions })
    } catch (error) {
        console.error('API /api/story/positions error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
