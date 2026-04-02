import { createServiceClient } from '@/lib/supabase/service'

// Pricing per 1M tokens (approximate, as of 2025)
const PRICING: Record<string, { input: number; output: number; cacheRead?: number }> = {
    'claude-opus-4-6':         { input: 15.00, output: 75.00, cacheRead: 1.50 },
    'claude-sonnet-4-6':       { input: 3.00,  output: 15.00, cacheRead: 0.30 },
    'gemini-1.5-flash':       { input: 0.075, output: 0.30 }, // Pay-as-you-go pricing for v1 standard
    'deepseek-chat':           { input: 0.27,  output: 1.10 },
}

function estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number
): number {
    const pricing = PRICING[model]
    if (!pricing) return 0

    const inputCost = (inputTokens / 1_000_000) * pricing.input
    const outputCost = (outputTokens / 1_000_000) * pricing.output
    const cacheCost = pricing.cacheRead
        ? (cacheReadTokens / 1_000_000) * pricing.cacheRead
        : 0

    return inputCost + outputCost + cacheCost
}

interface UsageEntry {
    userId: string
    provider: 'anthropic' | 'google' | 'deepseek'
    model: string
    feature: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    durationMs: number
    success: boolean
    errorMessage?: string
}

/**
 * Log AI usage to the database. Fire-and-forget — never blocks the caller.
 */
export function logAIUsage(entry: UsageEntry): void {
    // Fire and forget — don't await
    _logUsage(entry).catch(err => {
        console.error('[AI Usage] Failed to log:', err instanceof Error ? err.message : err)
    })
}

async function _logUsage(entry: UsageEntry): Promise<void> {
    const client = createServiceClient()
    const cost = estimateCost(
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
        entry.cacheReadTokens || 0
    )

    const { error } = await client.from('ai_usage_logs').insert({
        user_id: entry.userId,
        provider: entry.provider,
        model: entry.model,
        feature: entry.feature,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        cache_read_tokens: entry.cacheReadTokens || 0,
        cache_creation_tokens: entry.cacheCreationTokens || 0,
        duration_ms: entry.durationMs,
        estimated_cost_usd: cost,
        success: entry.success,
        error_message: entry.errorMessage || null,
    })

    if (error) {
        console.error('[AI Usage] DB insert error:', error.message)
    }
}
