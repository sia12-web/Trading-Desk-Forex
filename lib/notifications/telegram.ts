/**
 * Telegram Bot Integration for 24/7 Trading Mentor
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

export interface TelegramMessage {
    chat_id: string
    text: string
    parse_mode?: 'Markdown' | 'HTML'
    disable_web_page_preview?: boolean
}

export async function sendTelegramMessage(
    chatId: string,
    title: string,
    body: string,
    url?: string
): Promise<{ success: boolean; error?: string }> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('Telegram bot token not configured')
        return { success: false, error: 'Bot token not configured' }
    }

    if (!chatId) {
        return { success: false, error: 'No chat ID provided' }
    }

    // Format message with title, body, and optional link
    let message = `*${title}*\n\n${body}`
    if (url) {
        const fullUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://tradedesk-forex.app'}${url}`
        message += `\n\n👉 [Open in TradeDesk Forex](${fullUrl})`
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            }
        )

        const data = await response.json()

        if (!data.ok) {
            console.error('Telegram API error:', data)
            let errorMessage = data.description || 'Telegram API error'
            
            // Provide more actionable error messages
            if (data.error_code === 403) {
                errorMessage = 'Forbidden: The bot was blocked by the user. Please unblock it in Telegram.'
            } else if (data.error_code === 400 && data.description.includes('chat not found')) {
                errorMessage = 'Bad Request: Chat not found. Make sure you have started a conversation with the bot.'
            }
            
            return { success: false, error: errorMessage }
        }

        return { success: true }
    } catch (error: any) {
        console.error('Telegram send error:', error)
        return { success: false, error: error.message }
    }
}

export function isTelegramConfigured(): boolean {
    return Boolean(TELEGRAM_BOT_TOKEN)
}

/**
 * Helper to format trade info for Telegram
 */
export function formatTradeMessage(trade: {
    pair: string
    direction: string
    entry: number
    sl?: number
    tp?: number
}): string {
    const emoji = trade.direction === 'long' ? '📈' : '📉'
    let msg = `${emoji} *${trade.pair}* ${trade.direction.toUpperCase()}\n`
    msg += `Entry: ${trade.entry}\n`
    if (trade.sl) msg += `SL: ${trade.sl}\n`
    if (trade.tp) msg += `TP: ${trade.tp}\n`
    return msg
}
