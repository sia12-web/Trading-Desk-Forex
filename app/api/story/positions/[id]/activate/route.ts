import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getPositionById, activatePosition } from '@/lib/data/story-positions'

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    try {
        const position = await getPositionById(id)
        if (!position || position.user_id !== user.id) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        if (position.status !== 'suggested') {
            return NextResponse.json({ error: 'Position is not in suggested state' }, { status: 400 })
        }

        const body = await req.json().catch(() => ({}))
        const entryPrice = body.entry_price as number | undefined

        const updated = await activatePosition(id, entryPrice)
        return NextResponse.json({ position: updated })
    } catch (error) {
        console.error('API /api/story/positions/[id]/activate error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
