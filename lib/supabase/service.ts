import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

    if (!url || !key) {
        // Log warning during production build, but provide fallbacks
        if (process.env.NODE_ENV === 'production') {
            console.warn('Supabase service role credentials missing!')
        }
    }

    return createSupabaseClient(
        url || 'https://placeholder.supabase.co',
        key || 'placeholder',
        {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}
