import { createClient } from '@/lib/supabase/server'
import { updateProgress, completeTask, failTask } from '@/lib/background-tasks/manager'
import { callGemini } from '@/lib/ai/clients/gemini'
import { callDeepSeek } from '@/lib/ai/clients/deepseek'
import { callClaude } from '@/lib/ai/clients/claude'
import { parseAIJson } from '@/lib/ai/parse-response'
import { collectCMSData } from './data-collector'
import { computeAllConditions } from './condition-engine'
import { buildGeminiPatternPrompt } from './prompts/gemini-pattern'
import { buildDeepSeekStatsPrompt } from './prompts/deepseek-stats'
import { buildClaudeSynthesisPrompt } from './prompts/claude-synthesis'
import type { CMSResult } from './types'

const TAG = '[CMS]'

export async function generateCMSAnalysis(
    userId: string,
    pair: string,
    taskId: string,
): Promise<void> {
    const startTime = Date.now()
    const client = await createClient()

    try {
        console.log(`${TAG} ════════ START ${pair} for user ${userId.slice(0, 8)}... ════════`)

        // ── Phase 0: Collect OANDA data + pre-compute relationships ──
        console.log(`${TAG} [Data] Fetching OANDA candles + pre-computing relationships...`)
        await updateProgress(taskId, 10, 'Fetching market data...', client)
        const data = await collectCMSData(pair)
        console.log(`${TAG} [Data] Done — ${data.summaryStats.total_daily_candles} daily, ${data.summaryStats.total_weekly_candles} weekly, ${data.summaryStats.total_h1_candles} H1, ${data.summaryStats.total_h4_candles} H4 candles`)

        // ── Phase 0.5: Programmatic condition computation (NO AI) ──
        console.log(`${TAG} [Engine] Computing conditions programmatically...`)
        await updateProgress(taskId, 20, 'Computing conditions from candle data...', client)
        const conditions = computeAllConditions(data)
        console.log(`${TAG} [Engine] Done — ${conditions.length} conditions passed filters (n≥15, prob≥55%)`)

        if (conditions.length === 0) {
            console.log(`${TAG} No conditions met thresholds — storing empty result`)
            await storeResult(client, userId, pair, {
                pair,
                generated_at: new Date().toISOString(),
                total_conditions: 0,
                categories: { daily: [], weekly: [], session: [], volatility: [], cross_market: [] },
                summary: 'Insufficient data or no patterns met the minimum thresholds (n≥15, probability≥55%).',
                data_stats: {
                    daily_candles: data.summaryStats.total_daily_candles,
                    weekly_candles: data.summaryStats.total_weekly_candles,
                    h1_candles: data.summaryStats.total_h1_candles,
                    h4_candles: data.summaryStats.total_h4_candles,
                    date_range: data.summaryStats.date_range,
                },
            })
            await completeTask(taskId, { pair, total_conditions: 0 }, client)
            return
        }

        // ── Phase 1: Gemini ranks and groups pre-computed conditions ──
        console.log(`${TAG} [Gemini] Ranking ${conditions.length} conditions (gemini-2.5-flash, 120s, 8K tokens)...`)
        const geminiStart = Date.now()
        await updateProgress(taskId, 35, 'Gemini ranking patterns...', client)
        const geminiPrompt = buildGeminiPatternPrompt(data, conditions)
        const geminiOutput = await callGemini(geminiPrompt, {
            timeout: 120_000,
            maxTokens: 8192,
            usage: { userId, feature: 'cms' },
        })
        console.log(`${TAG} [Gemini] Done in ${((Date.now() - geminiStart) / 1000).toFixed(1)}s — ${geminiOutput.length} chars`)

        // ── Phase 2: DeepSeek validates market structure logic ──
        console.log(`${TAG} [DeepSeek] Validating market structure (deepseek-chat, 120s, 6K tokens)...`)
        const deepseekStart = Date.now()
        await updateProgress(taskId, 60, 'DeepSeek validating structure...', client)
        const deepseekPrompt = buildDeepSeekStatsPrompt(data, conditions, geminiOutput)
        const deepseekOutput = await callDeepSeek(deepseekPrompt, {
            timeout: 120_000,
            maxTokens: 6144,
            usage: { userId, feature: 'cms' },
        })
        console.log(`${TAG} [DeepSeek] Done in ${((Date.now() - deepseekStart) / 1000).toFixed(1)}s — ${deepseekOutput.length} chars`)

        // ── Phase 3: Claude synthesizes trading implications ──
        console.log(`${TAG} [Claude] Synthesizing implications (claude-opus, 90s, 6K tokens)...`)
        const claudeStart = Date.now()
        await updateProgress(taskId, 85, 'Claude synthesizing implications...', client)
        const claudePrompt = buildClaudeSynthesisPrompt(data, conditions, deepseekOutput)
        const claudeOutput = await callClaude(claudePrompt, {
            timeout: 90_000,
            maxTokens: 6144,
            usage: { userId, feature: 'cms' },
        })
        console.log(`${TAG} [Claude] Done in ${((Date.now() - claudeStart) / 1000).toFixed(1)}s — ${claudeOutput.length} chars`)

        // ── Parse + Store ──
        await updateProgress(taskId, 90, 'Storing results...', client)
        const result = parseAIJson<CMSResult>(claudeOutput)

        // Override data_stats with real values (never trust AI for these)
        result.data_stats = {
            daily_candles: data.summaryStats.total_daily_candles,
            weekly_candles: data.summaryStats.total_weekly_candles,
            h1_candles: data.summaryStats.total_h1_candles,
            h4_candles: data.summaryStats.total_h4_candles,
            date_range: data.summaryStats.date_range,
        }
        result.pair = pair
        result.generated_at = new Date().toISOString()

        // Ensure source='programmatic' on all conditions
        for (const cat of Object.values(result.categories)) {
            for (const cond of cat) {
                cond.source = 'programmatic'
            }
        }

        // Count total conditions
        const cats = result.categories
        result.total_conditions =
            (cats.daily?.length || 0) +
            (cats.weekly?.length || 0) +
            (cats.session?.length || 0) +
            (cats.volatility?.length || 0) +
            (cats.cross_market?.length || 0)

        await storeResult(client, userId, pair, result)

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`${TAG} ════════ DONE ${pair} — ${result.total_conditions} conditions in ${totalTime}s ════════`)

        await completeTask(taskId, {
            pair,
            total_conditions: result.total_conditions,
        }, client)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error during CMS analysis'
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.error(`${TAG} ════════ FAILED ${pair} after ${totalTime}s — ${message} ════════`)
        await failTask(taskId, message, client)
    }
}

async function storeResult(
    client: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    pair: string,
    result: CMSResult,
): Promise<void> {
    // Delete any previous results for this user+pair, then insert new
    await client
        .from('cms_analyses')
        .delete()
        .eq('user_id', userId)
        .eq('pair', pair)

    const { error: insertError } = await client
        .from('cms_analyses')
        .insert({
            user_id: userId,
            pair,
            result: result as unknown as Record<string, unknown>,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })

    if (insertError) {
        console.error(`${TAG} Insert error:`, insertError.message)
        throw new Error(`Failed to store CMS results: ${insertError.message}`)
    }
}
