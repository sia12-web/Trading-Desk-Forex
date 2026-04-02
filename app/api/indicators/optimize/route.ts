import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { runGlobalOptimization, calibrateForPairAndTimeframe, Timeframe } from '@/lib/strategy/optimization'

export async function POST(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { pair } = body

        if (pair) {
            console.log(`[Optimization] Running calibration for single pair: ${pair}`)
            const timeframes: Timeframe[] = ['M', 'W', 'D', 'H4', 'H3', 'H1']
            for (const tf of timeframes) {
                await calibrateForPairAndTimeframe(user.id, pair, tf as any)
            }
            return NextResponse.json({ success: true, message: `Calibration for ${pair} completed` })
        } else {
            console.log(`[Optimization] Running global calibration for all subscribed pairs`)
            await runGlobalOptimization(user.id)
            return NextResponse.json({ success: true, message: 'Global optimization completed successfully' })
        }
    } catch (err: any) {
        console.error('Failed to run indicator optimization:', err)
        return NextResponse.json({ error: err.message || 'Optimization failed' }, { status: 500 })
    }
}
