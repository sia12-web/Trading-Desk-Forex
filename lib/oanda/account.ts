import { cookies } from 'next/headers'

export type AccountMode = 'demo' | 'live'

export interface OandaConfig {
    accountId: string
    apiKey: string
    baseUrl: string
    mode: AccountMode
}

export async function getAccountMode(): Promise<AccountMode> {
    try {
        const cookieStore = await cookies()
        return (cookieStore.get('oanda-mode')?.value as AccountMode) || 'live'
    } catch {
        // cookies() can fail during static generation or build time
        return 'live'
    }
}

export async function getOandaConfig(): Promise<OandaConfig> {
    const mode = await getAccountMode()

    if (mode === 'live') {
        return {
            accountId: process.env.OANDA_LIVE_ACCOUNT_ID || '',
            apiKey: process.env.OANDA_LIVE_API_KEY || '',
            baseUrl: process.env.OANDA_LIVE_API_URL || 'https://api-fxtrade.oanda.com',
            mode
        }
    }

    return {
        accountId: process.env.OANDA_DEMO_ACCOUNT_ID || '',
        apiKey: process.env.OANDA_DEMO_API_KEY || '',
        baseUrl: process.env.OANDA_DEMO_API_URL || 'https://api-fxpractice.oanda.com',
        mode
    }
}

export async function getOandaDemoConfig(): Promise<OandaConfig> {
    return {
        accountId: process.env.OANDA_DEMO_ACCOUNT_ID || '',
        apiKey: process.env.OANDA_DEMO_API_KEY || '',
        baseUrl: process.env.OANDA_DEMO_API_URL || 'https://api-fxpractice.oanda.com',
        mode: 'demo'
    }
}

export async function getActiveAccountId(): Promise<string> {
    const config = await getOandaConfig()
    return config.accountId
}
