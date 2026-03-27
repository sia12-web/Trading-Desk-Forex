import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - api/cron (cron jobs — we skip middleware to avoid session redirects)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|/api/cron|/api/health|/favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
