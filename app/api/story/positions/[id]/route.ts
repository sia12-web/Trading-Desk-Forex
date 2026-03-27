import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getPositionWithAdjustments } from '@/lib/data/story-positions'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    try {
        const result = await getPositionWithAdjustments(id)
        if (!result || result.position.user_id !== user.id) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        return NextResponse.json(result)
    } catch (error) {
        console.error('API /api/story/positions/[id] error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
