import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { unsubscribePair } from '@/lib/data/stories'
import { isValidPair } from '@/lib/utils/valid-pairs'

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ pair: string }> }
) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pair: rawPair } = await params
    const pair = decodeURIComponent(rawPair).replace('_', '/')

    if (!isValidPair(pair)) {
        return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    }

    await unsubscribePair(user.id, pair)
    return NextResponse.json({ success: true })
}
