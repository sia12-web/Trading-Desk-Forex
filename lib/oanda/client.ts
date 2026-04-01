import {
    OandaAccountSummary,
    OandaTrade,
    OandaPrice,
    OandaInstrument,
    OandaTransaction,
    OandaOrderResponse,
    OandaModifyResponse,
    OandaCloseResponse,
    OandaCancelResponse,
    OandaCandle
} from '@/lib/types/oanda'
import { getOandaConfig, getOandaDemoConfig, OandaConfig } from './account'

async function oandaFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    revalidate: number | false = false,
    config?: OandaConfig
): Promise<{ data?: T; error?: any }> {
    const cfg = config || await getOandaConfig()

    if (!cfg.apiKey || !cfg.accountId) {
        console.error(`OANDA Error: Missing ${cfg.mode} credentials. AccountID: ${cfg.accountId ? 'YES' : 'NO'}, APIKey: ${cfg.apiKey ? 'YES' : 'NO'}`)
        return { error: 'OANDA API key or Account ID not configured' }
    }

    const maxRetries = 3
    const baseRetryDelayMs = 2000 // Increased from 1000
    const timeoutMs = 30000 // Increased from 10000 (30 seconds)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), timeoutMs)

        try {
            const fetchOptions: RequestInit = {
                ...options,
                headers: {
                    'Authorization': `Bearer ${cfg.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'TradeDesk-CFD/1.0.0',
                    ...options.headers,
                },
                signal: controller.signal
            }

            // Add caching for GET requests if specified
            if (revalidate !== false && (options.method === 'GET' || !options.method)) {
                fetchOptions.next = { revalidate }
            }

            const response = await fetch(`${cfg.baseUrl}${endpoint}`, fetchOptions)
            clearTimeout(id)

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                
                // Retry on server errors or rate limits
                const isRetryable = response.status === 429 || response.status >= 500
                if (isRetryable && attempt < maxRetries) {
                    const delay = baseRetryDelayMs * Math.pow(2, attempt - 1)
                    console.warn(`OANDA API Error ${response.status} on ${endpoint}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`)
                    await new Promise(resolve => setTimeout(resolve, delay))
                    continue
                }

                console.error(`[OANDA_DEBUG] OANDA API Error [${response.status}] on ${endpoint}:`, errorData)
                return { error: { status: response.status, endpoint, ...errorData } }
            }

            const data = await response.json()
            return { data }
        } catch (error: any) {
            clearTimeout(id)
            
            // Retry on connection timeouts or network errors
            const isTimeout = error.name === 'AbortError' || error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message?.includes('timeout')
            if (attempt < maxRetries) {
                const delay = baseRetryDelayMs * Math.pow(2, attempt - 1)
                console.warn(`OANDA Fetch Exception (${error.name}) on ${endpoint}: ${error.message}. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
            }

            console.error(`OANDA Fetch Exception after final attempt for ${endpoint}:`, error)
            return { error: { message: error.message, name: error.name, code: error.code } }
        }
    }

    return { error: 'Failed after maximum retry attempts' }
}

export async function getAccountSummary() {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ account: OandaAccountSummary }>(`/v3/accounts/${cfg.accountId}/summary`, {}, 10, cfg)
    return { data: result.data?.account, error: result.error }
}

export async function getAccountInstruments() {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ instruments: OandaInstrument[] }>(`/v3/accounts/${cfg.accountId}/instruments`, {}, 3600, cfg)
    return { data: result.data?.instruments, error: result.error }
}

export async function getOpenTrades() {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ trades: OandaTrade[] }>(`/v3/accounts/${cfg.accountId}/openTrades`, {}, 5, cfg)
    return { data: result.data?.trades || [], error: result.error }
}

export async function getPendingOrders() {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ orders: any[] }>(`/v3/accounts/${cfg.accountId}/orders?state=PENDING`, {}, 5, cfg)
    return { data: result.data?.orders || [], error: result.error }
}

export async function getTrade(tradeId: string) {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ trade: OandaTrade }>(`/v3/accounts/${cfg.accountId}/trades/${tradeId}`, {}, 5, cfg)
    return { data: result.data?.trade, error: result.error }
}

export async function getTradeHistory(count: number = 50) {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ trades: OandaTrade[] }>(`/v3/accounts/${cfg.accountId}/trades?state=CLOSED&count=${count}`, {}, 30, cfg)
    return { data: result.data?.trades || [], error: result.error }
}

// ─── Sync-specific methods (no cache) ────────────────────────────────

export async function getOpenTradesForSync() {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ trades: OandaTrade[] }>(
        `/v3/accounts/${cfg.accountId}/openTrades`,
        { cache: 'no-store' },
        false,
        cfg
    )
    return { data: result.data?.trades || [], error: result.error }
}

export async function getTradeHistoryForSync(count: number = 500, beforeId?: string) {
    const cfg = await getOandaConfig()
    let endpoint = `/v3/accounts/${cfg.accountId}/trades?state=CLOSED&count=${count}`
    if (beforeId) {
        endpoint += `&beforeID=${beforeId}`
    }
    const result = await oandaFetch<{ trades: OandaTrade[] }>(endpoint, { cache: 'no-store' }, false, cfg)
    return { data: result.data?.trades || [], error: result.error }
}

export async function getCurrentPrices(instruments: string[]): Promise<{ data?: OandaPrice[], error?: any }> {
    if (!instruments.length) return { data: [] }

    const cfg = await getOandaConfig()
    // Robust formatting: filter truthy, trim, replace slash, and remove duplicates
    const formatted = [...new Set(instruments.filter(Boolean).map(i => i.trim().replace('/', '_')))]
    if (formatted.length === 0) return { data: [] }
    const instrumentsParam = formatted.join(',')
    const result = await oandaFetch<{ prices: OandaPrice[] }>(`/v3/accounts/${cfg.accountId}/pricing?instruments=${instrumentsParam}`, {}, 1, cfg)
    
    // Filter and sanitize price data to prevent downstream crashes on missing asks/bids
    const sanitizedPrices = (result.data?.prices || []).map(p => {
        const ask = p.asks?.[0]?.price
        const bid = p.bids?.[0]?.price
        if (!ask || !bid) {
            console.warn(`[OANDA] Missing price components for ${p.instrument} (Live Mode: ${cfg.mode})`)
        }
        return p
    })

    return { data: sanitizedPrices, error: result.error }
}

export async function getRecentTransactions(count: number = 50) {
    const cfg = await getOandaConfig()
    const result = await oandaFetch<{ transactions: OandaTransaction[] }>(`/v3/accounts/${cfg.accountId}/transactions?count=${count}`, {}, 30, cfg)
    return { data: result.data?.transactions || [], error: result.error }
}

export async function createMarketOrder(params: {
    instrument: string,
    units: number,
    stopLossOnFill?: { price: string },
    takeProfitOnFill?: { price: string },
    trailingStopLossOnFill?: { distance: string },
    clientExtensions?: { comment: string, tag: string }
}) {
    const cfg = await getOandaConfig()
    const body = {
        order: {
            type: 'MARKET',
            instrument: params.instrument,
            units: params.units.toString(),
            timeInForce: 'FOK',
            stopLossOnFill: params.stopLossOnFill,
            takeProfitOnFill: params.takeProfitOnFill,
            trailingStopLossOnFill: params.trailingStopLossOnFill,
            clientExtensions: params.clientExtensions
        }
    }
    return oandaFetch<OandaOrderResponse>(`/v3/accounts/${cfg.accountId}/orders`, {
        method: 'POST',
        body: JSON.stringify(body)
    }, false, cfg)
}

export async function createLimitOrder(params: {
    instrument: string,
    units: number,
    price: string,
    stopLossOnFill?: { price: string },
    takeProfitOnFill?: { price: string },
    trailingStopLossOnFill?: { distance: string },
    timeInForce?: 'GTC' | 'GTD' | 'GFD',
    gtdTime?: string
}) {
    const cfg = await getOandaConfig()
    const body = {
        order: {
            type: 'LIMIT',
            instrument: params.instrument,
            units: params.units.toString(),
            price: params.price,
            stopLossOnFill: params.stopLossOnFill,
            takeProfitOnFill: params.takeProfitOnFill,
            trailingStopLossOnFill: params.trailingStopLossOnFill,
            timeInForce: params.timeInForce || 'GTC',
            gtdTime: params.gtdTime
        }
    }
    return oandaFetch<OandaOrderResponse>(`/v3/accounts/${cfg.accountId}/orders`, {
        method: 'POST',
        body: JSON.stringify(body)
    }, false, cfg)
}

export async function modifyTrade(tradeId: string, params: {
    stopLoss?: { price: string },
    takeProfit?: { price: string }
}) {
    const cfg = await getOandaConfig()
    const body = {
        stopLoss: params.stopLoss,
        takeProfit: params.takeProfit
    }
    return oandaFetch<OandaModifyResponse>(`/v3/accounts/${cfg.accountId}/trades/${tradeId}/orders`, {
        method: 'PUT',
        body: JSON.stringify(body)
    }, false, cfg)
}

export async function closeTrade(tradeId: string, units: string | 'ALL' = 'ALL') {
    const cfg = await getOandaConfig()
    const body = { units }
    return oandaFetch<OandaCloseResponse>(`/v3/accounts/${cfg.accountId}/trades/${tradeId}/close`, {
        method: 'PUT',
        body: JSON.stringify(body)
    }, false, cfg)
}

export async function cancelOrder(orderId: string) {
    const cfg = await getOandaConfig()
    return oandaFetch<OandaCancelResponse>(`/v3/accounts/${cfg.accountId}/orders/${orderId}/cancel`, {
        method: 'PUT'
    }, false, cfg)
}

export async function getCandles(params: {
    instrument: string,
    granularity: string,
    count: number,
    price?: string
}): Promise<{ data?: OandaCandle[], error?: any }> {
    const cfg = await getOandaConfig()
    const { instrument: rawInstrument, granularity, count, price = 'M' } = params
    
    // Robust formatting: ensure truthiness, trim and ensure underscore
    if (!rawInstrument) {
        return { error: 'No instrument provided' }
    }
    const instrument = rawInstrument.trim().replace('/', '_')

    const result = await oandaFetch<{ candles: OandaCandle[] }>(
        `/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=${price}`,
        {},
        false,
        cfg
    )
    return { data: result.data?.candles, error: result.error }
}

export async function fetchHistoricalCandles(params: {
    instrument: string,
    granularity: string,
    from: string,
    to: string,
    price?: string
}): Promise<OandaCandle[]> {
    const cfg = await getOandaConfig()
    const { instrument, granularity, from, to, price = 'M' } = params

    // Retry logic for transient errors (502, 503, 504, network errors)
    const maxRetries = 3
    const retryDelayMs = 1000 // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await oandaFetch<{ candles: OandaCandle[] }>(
            `/v3/instruments/${instrument}/candles?granularity=${granularity}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&price=${price}`,
            {},
            false,
            cfg
        )

        // Success - return candles
        if (!result.error) {
            return result.data?.candles || []
        }

        // Check if error is retryable (502, 503, 504 = server issues)
        const status = result.error?.status
        const isRetryable = status === 502 || status === 503 || status === 504

        if (!isRetryable || attempt === maxRetries) {
            // Non-retryable error or max retries reached
            console.error(`Failed to fetch historical candles after ${attempt} attempts:`, result.error)
            return []
        }

        // Wait before retrying
        console.log(`OANDA API error ${status}, retrying in ${retryDelayMs}ms (attempt ${attempt}/${maxRetries})...`)
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt)) // Exponential backoff
    }

    return []
}
