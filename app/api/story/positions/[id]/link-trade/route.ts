import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getPositionById, updatePosition } from '@/lib/data/story-positions'

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

        const body = await req.json()
        const oandaTradeId = body.oanda_trade_id as string | undefined

        if (!oandaTradeId) {
            return NextResponse.json({ error: 'oanda_trade_id is required' }, { status: 400 })
        }

        const updated = await updatePosition(id, { oanda_trade_id: oandaTradeId })
        return NextResponse.json({ position: updated })
    } catch (error) {
        console.error('API /api/story/positions/[id]/link-trade error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
