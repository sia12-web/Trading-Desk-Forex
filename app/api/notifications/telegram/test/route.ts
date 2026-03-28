import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendTelegramMessage } from '@/lib/notifications/telegram'

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const bodyValue = await req.json().catch(() => ({}))
        const chatId = bodyValue.chatId

        if (!chatId) {
            return NextResponse.json({ error: 'Please enter a Telegram Chat ID first' }, { status: 400 })
        }

        const result = await sendTelegramMessage(
            chatId,
            '🎯 Connection Success',
            'Your Telegram account is now successfully connected to TradeDesk Forex! 🎯'
        )

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Failed to send message' }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: 'Test message sent!' })
    } catch (error: any) {
        console.error('Error sending test telegram:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
