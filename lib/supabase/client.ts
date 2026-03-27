import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  
  // If we're missing credentials, return a dummy client during build to avoid crashing
  // But log a warning so the user knows they need to set these in Railway
  if (!url || !key) {
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
       console.warn('Supabase credentials missing! Authentication will not work.')
    }
  }

  return createBrowserClient(
    url || 'https://placeholder.supabase.co',
    key || 'placeholder'
  )
}

