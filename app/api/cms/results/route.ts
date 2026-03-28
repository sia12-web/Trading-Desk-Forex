import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { isValidPair } from '@/lib/utils/valid-pairs'

export async function GET(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pair = req.nextUrl.searchParams.get('pair')
    if (!pair || !isValidPair(pair)) {
        return NextResponse.json({ error: 'Invalid pair' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('cms_analyses')
        .select('id, pair, result, created_at, expires_at')
        .eq('user_id', user.id)
        .eq('pair', pair)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
        return NextResponse.json({ result: null })
    }

    return NextResponse.json({
        result: data.result,
        created_at: data.created_at,
        expires_at: data.expires_at,
    })
}
