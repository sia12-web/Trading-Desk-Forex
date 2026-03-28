import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getSubscribedPairs, subscribeToPair, unsubscribePair } from '@/lib/data/stories'
import { isValidPair } from '@/lib/utils/valid-pairs'

export async function GET() {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pairs = await getSubscribedPairs(user.id)
    return NextResponse.json({ pairs })
}

export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const pair = body.pair as string

    if (!pair || !isValidPair(pair)) {
        return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    }

    const subscription = await subscribeToPair(user.id, pair, body.notes)
    return NextResponse.json({ subscription })
}

export async function DELETE(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const pair = body.pair as string

    if (!pair) {
        return NextResponse.json({ error: 'Pair is required' }, { status: 400 })
    }

    await unsubscribePair(user.id, pair)
    return NextResponse.json({ success: true })
}
