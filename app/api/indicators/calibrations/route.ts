import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const pair = searchParams.get('pair')
    const timeframe = searchParams.get('timeframe')

    const supabase = await createClient()
    let query = supabase
        .from('indicator_calibrations')
        .select('*')
        .eq('user_id', user.id)

    if (pair) query = query.eq('pair', pair)
    if (timeframe) query = query.eq('timeframe', timeframe)

    const { data, error } = await query.order('pair', { ascending: true }).order('timeframe', { ascending: true })

    if (error) {
        console.error('Failed to fetch calibrations:', error)
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
    }

    return NextResponse.json({ calibrations: data || [] })
}
