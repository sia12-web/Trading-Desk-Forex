import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/ai/rate-limiter'
import { createTask } from '@/lib/background-tasks/manager'
import { generateStory } from '@/lib/story/pipeline'
import { isValidPair } from '@/lib/utils/valid-pairs'

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

    // Rate limit check
    const limit = await checkRateLimit(user.id)
    if (!limit.allowed) {
        const minutes = Math.ceil(limit.resetIn / 60_000)
        return NextResponse.json(
            { error: `Rate limit exceeded. Try again in ${minutes} minutes.` },
            { status: 429 }
        )
    }

    // Create background task and start pipeline
    const taskId = await createTask(user.id, 'story_generation', { pair })

    // Fire and forget — pipeline runs in background
    generateStory(user.id, pair, taskId).catch(err => {
        console.error('Story generation error:', err)
    })

    return NextResponse.json({ taskId, remaining: limit.remaining })
}
