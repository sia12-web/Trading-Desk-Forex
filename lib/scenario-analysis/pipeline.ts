import { callClaudeWithCaching, callGemini, callDeepSeek } from '@/lib/ai/clients'
import { parseAIJson } from '@/lib/ai/parse-response'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { updateProgress, completeTask, failTask } from '@/lib/background-tasks/manager'
import { collectStoryData } from '@/lib/story/data-collector'
import { summarizeNewsForStory } from '@/lib/story/news-summarizer'
import { getAgentReportsForPair } from '@/lib/story/agents/data'
import { parseFlaggedLevels } from '@/lib/story/validators'
import { buildScenarioScannerPrompt } from './prompts/gemini-scanner'
import { buildScenarioValidatorPrompt } from './prompts/deepseek-validator'
import { buildScenarioSynthesizerPromptCached } from './prompts/claude-synthesizer'
import { createScenarioAnalysis } from '@/lib/data/scenario-analyses'
import { validateScenarioAnalysisLevels } from './validators'
import type { ScenarioAnalysisResult } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

const TAG = '[ScenarioAnalysis]'

/**
 * Scenario Analysis pipeline orchestrator.
 * Runs as a background task: data collection → tri-model analysis → DB storage.
 *
 * All 3 models must succeed — no fallbacks.
 */
export async function generateScenarioAnalysis(
    userId: string,
    pair: string,
    taskId: string,
    options?: { useServiceRole?: boolean }
): Promise<void> {
    const client: SupabaseClient = options?.useServiceRole
        ? createServiceClient()
        : await createClient()

    const startTime = Date.now()
    console.log(`${TAG} ════════ START ${pair} ════════`)

    try {
        // ── Step 1: Collect OANDA data ──
        console.log(`${TAG} [OANDA] Fetching 5-TF candle data for ${pair}...`)
        await updateProgress(taskId, 10, 'Fetching market data across 5 timeframes...', client)
        const data = await collectStoryData(userId, pair, client)
        console.log(`${TAG} [OANDA] Done — price: ${data.currentPrice.toFixed(5)}, ATR14: ${data.atr14.toFixed(1)} pips`)

        // ── Step 2: Get news context ──
        console.log(`${TAG} [News] Fetching economic calendar + news...`)
        await updateProgress(taskId, 20, 'Gathering news and economic calendar...', client)
        const news = await summarizeNewsForStory(pair)
        console.log(`${TAG} [News] Sentiment: ${news.sentiment}, drivers: ${news.key_drivers.length}`)

        // ── Step 2.5: Fetch agent intelligence (best-effort) ──
        console.log(`${TAG} [Agents] Loading cached intelligence reports...`)
        await updateProgress(taskId, 22, 'Loading intelligence reports...', client)
        const agentIntelligence = await getAgentReportsForPair(userId, pair, client)
        const agentCount = [agentIntelligence.optimizer, agentIntelligence.news, agentIntelligence.crossMarket].filter(Boolean).length
        console.log(`${TAG} [Agents] ${agentCount}/3 reports available`)

        // ── Step 3: Gemini structural scan ──
        console.log(`${TAG} [Gemini] Starting structural scan (gemini-3-flash-preview, 90s timeout, 8K tokens)...`)
        const geminiStart = Date.now()
        await updateProgress(taskId, 30, 'Gemini scanning market structure...', client)
        const geminiPrompt = buildScenarioScannerPrompt(data, news)
        const geminiOutput = await callGemini(geminiPrompt, {
            timeout: 90_000,
            maxTokens: 8192,
        })
        console.log(`${TAG} [Gemini] Done in ${((Date.now() - geminiStart) / 1000).toFixed(1)}s — output: ${geminiOutput.length} chars`)

        // ── Step 4: DeepSeek probability validation ──
        console.log(`${TAG} [DeepSeek] Starting level validation (deepseek-chat V3.2, 90s timeout, 4K tokens)...`)
        const deepseekStart = Date.now()
        await updateProgress(taskId, 55, 'DeepSeek validating levels and probabilities...', client)
        const deepseekPrompt = buildScenarioValidatorPrompt(data, geminiOutput, news)
        const deepseekOutput = await callDeepSeek(deepseekPrompt, {
            timeout: 90_000,
            maxTokens: 4096,
        })
        console.log(`${TAG} [DeepSeek] Done in ${((Date.now() - deepseekStart) / 1000).toFixed(1)}s — output: ${deepseekOutput.length} chars`)

        // ── Step 4.5: Parse flagged levels ──
        const flaggedLevels = parseFlaggedLevels(deepseekOutput)
        if (flaggedLevels.length > 0) {
            console.log(`${TAG} [DeepSeek] Flagged ${flaggedLevels.length} suspicious levels:`, flaggedLevels.map(f => f.level))
        }

        // ── Step 5: Claude institutional synthesis ──
        console.log(`${TAG} [Claude] Starting institutional synthesis (claude-sonnet, 90s timeout, 8K tokens, cached)...`)
        const claudeStart = Date.now()
        await updateProgress(taskId, 75, 'Claude crafting institutional analysis...', client)

        const agentSummary = agentIntelligence.crossMarket
            ? {
                summary: agentIntelligence.crossMarket.summary,
                risk_appetite: agentIntelligence.crossMarket.risk_appetite,
            }
            : null

        const { cacheablePrefix, dynamicPrompt } = buildScenarioSynthesizerPromptCached(
            data,
            geminiOutput,
            deepseekOutput,
            news,
            flaggedLevels,
            agentSummary
        )
        const claudeOutput = await callClaudeWithCaching(cacheablePrefix, dynamicPrompt, {
            timeout: 90_000,
            maxTokens: 8192,
        })
        console.log(`${TAG} [Claude] Done in ${((Date.now() - claudeStart) / 1000).toFixed(1)}s — output: ${claudeOutput.length} chars`)

        // ── Step 6: Parse and validate ──
        console.log(`${TAG} [Validation] Parsing JSON + validating price levels...`)
        await updateProgress(taskId, 85, 'Validating AI output...', client)
        let result = parseAIJson<ScenarioAnalysisResult>(claudeOutput)

        const validation = validateScenarioAnalysisLevels(result, data.currentPrice, data.atr14)
        if (!validation.valid) {
            console.warn(`${TAG} [Validation] FAILED — ${validation.errors.length} error(s):`, validation.errors)

            console.log(`${TAG} [Claude] Retrying with correction context...`)
            await updateProgress(taskId, 88, 'Correcting levels (retry)...', client)
            const correctionPrompt = `${dynamicPrompt}

⚠️ CORRECTION REQUIRED — your previous response had these errors:
${validation.errors.map(e => `- ${e}`).join('\n')}

Fix these issues and regenerate the COMPLETE JSON response. Remember:
- All price levels must be within 3x ATR (${(data.atr14 * 3).toFixed(1)} pips) of current price ${data.currentPrice.toFixed(5)}
- Scenario probabilities must sum to ~1.0
- Every scenario must have trigger.level and invalidation.level`

            try {
                const retryOutput = await callClaudeWithCaching(cacheablePrefix, correctionPrompt, {
                    timeout: 90_000,
                    maxTokens: 8192,
                })
                result = parseAIJson<ScenarioAnalysisResult>(retryOutput)
                console.log(`${TAG} [Claude] Retry succeeded`)
            } catch (retryErr) {
                console.warn(`${TAG} [Claude] Retry failed, using original:`, retryErr instanceof Error ? retryErr.message : retryErr)
            }
        } else {
            console.log(`${TAG} [Validation] Passed — ${result.scenarios.length} scenarios, confidence: ${result.confidence}`)
        }

        await updateProgress(taskId, 90, 'Saving analysis...', client)

        const analysis = await createScenarioAnalysis(userId, pair, result, {
            currentPrice: data.currentPrice,
            atr14: data.atr14,
            geminiOutput,
            deepseekOutput,
            claudeOutput,
            newsContext: news as unknown as Record<string, unknown>,
        }, client)

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`${TAG} ════════ DONE ${pair} in ${totalTime}s — ${result.scenarios.length} scenarios, ID: ${analysis.id} ════════`)

        await completeTask(taskId, {
            analysisId: analysis.id,
            pair,
            summary: result.summary,
            scenarioCount: result.scenarios.length,
        }, client)

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error during scenario analysis'
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.error(`${TAG} ════════ FAILED ${pair} after ${totalTime}s — ${message} ════════`)
        await failTask(taskId, message, client)
    }
}
