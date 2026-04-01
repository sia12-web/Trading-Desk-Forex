import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { runGlobalOptimization } from '@/lib/strategy/optimization'

export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Trigger the optimization in the background (using a separate process or just awaiting it for now since it's a testable feature)
    // For a better user experience, we can return a "queued" status and use a job runner or long-polling.
    // For now, let's run it synchronously to provide immediate feedback on success/failure for the test run.
    try {
        await runGlobalOptimization(user.id)
        return NextResponse.json({ success: true, message: 'Optimization completed successfully' })
    } catch (err: any) {
        console.error('Failed to run indicator optimization:', err)
        return NextResponse.json({ error: err.message || 'Optimization failed' }, { status: 500 })
    }
}
