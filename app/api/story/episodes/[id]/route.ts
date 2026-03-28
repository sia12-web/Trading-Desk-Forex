import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getEpisodeById, getScenariosForEpisode } from '@/lib/data/stories'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const episode = await getEpisodeById(id)
    if (!episode || episode.user_id !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const scenarios = await getScenariosForEpisode(id)

    return NextResponse.json({ episode, scenarios })
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const { narrative } = await req.json()
    const { updateEpisodeNarrative } = await import('@/lib/data/stories')
    await updateEpisodeNarrative(id, user.id, narrative)
    return NextResponse.json({ success: true })
}
