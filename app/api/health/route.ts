import { NextResponse } from 'next/server'

let startupTime: string | null = null
if (!startupTime) {
    startupTime = new Date().toISOString()
    console.log(`[Health] App started at ${startupTime}`)
}

export async function GET() {
    const now = new Date().toISOString()
    const uptimeMs = startupTime ? Date.now() - new Date(startupTime).getTime() : 0
    const uptimeSec = Math.floor(uptimeMs / 1000)

    console.log(`[Health] Check at ${now} (uptime: ${uptimeSec}s)`)

    return NextResponse.json({
        status: 'healthy',
        timestamp: now,
        startupTime,
        uptimeSeconds: uptimeSec
    })
}
