import { callClaudeWithCaching, callGemini, callDeepSeek } from '@/lib/ai/clients'
import { parseAIJson } from '@/lib/ai/parse-response'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { updateProgress, completeTask, failTask } from '@/lib/background-tasks/manager'
import { collectStoryData } from './data-collector'
import { summarizeNewsForStory } from './news-summarizer'
import { buildStoryStructuralPrompt } from './prompts/gemini-structural'
import { buildStoryQuantPrompt } from './prompts/deepseek-quant'
import { buildStoryNarratorPromptCached } from './prompts/claude-narrator'
import { getBible, upsertBible } from './bible'
import { getSeasonNumber, checkAndCloseSeason, getSeasonArchive, shouldForceSeasonFinale } from './seasons'
import { getAgentReportsForPair } from './agents/data'
import {
    createEpisode,
    createScenarios,
    getLatestEpisode,
    getNextEpisodeNumber,
    getScenariosForEpisode,
    getRecentlyResolvedScenarios,
} from '@/lib/data/stories'
import { validateStoryLevels, validateScenarioLevels, parseFlaggedLevels } from './validators'
import { getLatestScenarioAnalysisForPrompt } from '@/lib/scenario-analysis/context'
import { getLatestScenarioAnalysis } from '@/lib/data/scenario-analyses'
import type { MarketContext } from '@/lib/scenario-analysis/types'
import { notifyUser } from '@/lib/notifications/notifier'
import { getActivePosition, createPosition, updatePosition, addAdjustment, getAdjustmentsForPosition } from '@/lib/data/story-positions'
import { getOandaDemoConfig } from '@/lib/oanda/account'
import type { OandaAccountSummary } from '@/lib/types/oanda'
import type { ActivePositionContext } from './prompts/claude-narrator'
import type { StoryResult, PositionGuidance } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

const TAG = '[Story]'

/**
 * Story generation pipeline orchestrator.
 * Runs as a background task: data collection → tri-model analysis → DB storage.
 *
 * All 3 models must succeed — no fallbacks (Promise.all, not Promise.allSettled).
 *
 * @param options.useServiceRole - When true (cron), uses service-role client to bypass RLS
 */
export async function generateStory(
    userId: string,
    pair: string,
    taskId: string,
    options?: { useServiceRole?: boolean; generationSource?: 'manual' | 'cron' | 'bot' }
): Promise<void> {
    const client: SupabaseClient = options?.useServiceRole
        ? createServiceClient()
        : await createClient()

    const startTime = Date.now()
    console.log(`${TAG} ════════ START ${pair} (source: ${options?.generationSource || 'manual'}) ════════`)

    try {
        // ── Step 1: Collect OANDA data ──
        console.log(`${TAG} [OANDA] Fetching 5-TF candle data...`)
        await updateProgress(taskId, 10, 'Fetching market data across 5 timeframes...', client)
        const data = await collectStoryData(userId, pair, client)
        console.log(`${TAG} [OANDA] Price: ${data.currentPrice.toFixed(5)}, ATR14: ${data.atr14.toFixed(1)} pips`)

        // ── Step 2: Get news context ──
        console.log(`${TAG} [News] Fetching economic context...`)
        await updateProgress(taskId, 20, 'Gathering news and economic calendar...', client)
        const news = await summarizeNewsForStory(pair)
        console.log(`${TAG} [News] Sentiment: ${news.sentiment}`)

        // ── Step 2.5: Fetch agent intelligence ──
        console.log(`${TAG} [Agents] Loading cached intelligence...`)
        await updateProgress(taskId, 22, 'Loading agent intelligence reports...', client)
        const agentIntelligence = await getAgentReportsForPair(userId, pair, client)
        const agentCount = [agentIntelligence.optimizer, agentIntelligence.news, agentIntelligence.crossMarket, agentIntelligence.cms].filter(Boolean).length
        console.log(`${TAG} [Agents] ${agentCount}/4 reports available`)

        // ── Step 2.7: Fetch risk rules + account balance ──
        console.log(`${TAG} [Risk] Loading risk rules + OANDA account balance...`)
        let riskRules: Array<{ rule_name: string; rule_type: string; value: Record<string, unknown>; is_active: boolean }> = []
        let accountSummary: OandaAccountSummary | null = null
        try {
            const { data: rules } = await client
                .from('risk_rules')
                .select('rule_name, rule_type, value, is_active')
                .eq('user_id', userId)
                .eq('is_active', true)
            riskRules = rules || []

            const cfg = await getOandaDemoConfig()
            const res = await fetch(`${cfg.baseUrl}/v3/accounts/${cfg.accountId}/summary`, {
                headers: { Authorization: `Bearer ${cfg.apiKey}` },
            })
            if (res.ok) {
                const json = await res.json()
                accountSummary = json.account
            }
        } catch (err) {
            console.warn(`${TAG} [Risk] Failed to fetch risk/account (non-critical):`, err instanceof Error ? err.message : err)
        }
        console.log(`${TAG} [Risk] ${riskRules.length} rules, balance: ${accountSummary ? `${parseFloat(accountSummary.balance).toFixed(2)} ${accountSummary.currency}` : 'unavailable'}`)

        // ── Step 3: Load continuity context (Bible + last episode + resolved scenarios) ──
        await updateProgress(taskId, 25, 'Loading story history...', client)

        const [bible, lastEpisodeRaw, resolvedScenarios, seasonArchive, scenarioAnalysisContext, scenarioAnalysisRaw, existingPosition] = await Promise.all([
            getBible(userId, pair, client),
            getLatestEpisode(userId, pair, client),
            getRecentlyResolvedScenarios(userId, pair, 10, client),
            getSeasonArchive(userId, pair, client),
            getLatestScenarioAnalysisForPrompt(userId, pair, client),
            getLatestScenarioAnalysis(userId, pair, client),
            getActivePosition(userId, pair, client),
        ])

        // Build active position context for narrator
        let activePositionCtx: ActivePositionContext | null = null
        if (existingPosition) {
            const adjustments = await getAdjustmentsForPosition(existingPosition.id, client)
            activePositionCtx = { position: existingPosition, adjustments }
        }

        // Extract validated key levels for DeepSeek cross-referencing
        const scenarioAnalysisLevels = scenarioAnalysisRaw
            ? ((scenarioAnalysisRaw.market_context as MarketContext)?.key_levels || [])
            : null

        // Build last episode with full narrative + scenarios
        let lastEpisode: {
            episode_number: number
            title: string
            narrative: string
            current_phase: string
            next_episode_preview: string | null
            scenarios?: Array<{ title: string; status: string; direction: string }>
        } | null = null

        if (lastEpisodeRaw) {
            const scenarios = await getScenariosForEpisode(lastEpisodeRaw.id, client)
            lastEpisode = {
                episode_number: lastEpisodeRaw.episode_number,
                title: lastEpisodeRaw.title,
                narrative: lastEpisodeRaw.narrative,
                current_phase: lastEpisodeRaw.current_phase,
                next_episode_preview: lastEpisodeRaw.next_episode_preview,
                scenarios: scenarios.map(s => ({
                    title: s.title,
                    status: s.status,
                    direction: s.direction,
                })),
            }
        }

        // ── Step 4: Gemini structural analysis ──
        console.log(`${TAG} [Gemini] Starting structural analysis (gemini-3-flash-preview, 90s, 8K tokens)...`)
        const geminiStart = Date.now()
        await updateProgress(taskId, 35, 'Gemini analyzing market structure...', client)
        const geminiPrompt = buildStoryStructuralPrompt(data, news)
        const geminiOutput = await callGemini(geminiPrompt, {
            timeout: 90_000,
            maxTokens: 8192,
        })
        console.log(`${TAG} [Gemini] Done in ${((Date.now() - geminiStart) / 1000).toFixed(1)}s — ${geminiOutput.length} chars`)

        // ── Step 5: DeepSeek quantitative validation ──
        console.log(`${TAG} [DeepSeek] Starting quant validation (deepseek-chat V3.2, 90s, 4K tokens)...`)
        const deepseekStart = Date.now()
        await updateProgress(taskId, 55, 'DeepSeek validating with quantitative analysis...', client)
        const deepseekPrompt = buildStoryQuantPrompt(data, geminiOutput, scenarioAnalysisLevels)
        const deepseekOutput = await callDeepSeek(deepseekPrompt, {
            timeout: 90_000,
            maxTokens: 4096,
        })
        console.log(`${TAG} [DeepSeek] Done in ${((Date.now() - deepseekStart) / 1000).toFixed(1)}s — ${deepseekOutput.length} chars`)

        // ── Step 5.5: Parse flagged levels from DeepSeek (best-effort) ──
        const flaggedLevels = parseFlaggedLevels(deepseekOutput)
        if (flaggedLevels.length > 0) {
            console.log(`${TAG} [DeepSeek] Flagged ${flaggedLevels.length} suspicious levels:`, flaggedLevels.map(f => f.level))
        }

        // ── Step 6: Claude narration (with Bible + resolved scenarios + prompt caching) ──
        console.log(`${TAG} [Claude] Starting narrator (claude-opus, 90s, 8K tokens, cached)...`)
        console.log(`${TAG} [Context] Bible: ${bible ? 'yes' : 'no'}, lastEp: ${lastEpisode?.episode_number || 'none'}, resolved: ${resolvedScenarios.length}, scenarioAnalysis: ${scenarioAnalysisContext ? 'yes' : 'no'}, activePosition: ${activePositionCtx ? activePositionCtx.position.direction : 'none'}`)
        const claudeStart = Date.now()
        await updateProgress(taskId, 75, 'Claude crafting the story narrative...', client)
        // Check if AI should be nudged to end the season (safety cap)
        const currentSeasonNumber = lastEpisodeRaw?.season_number || 1
        const currentSeasonIsFinale = lastEpisodeRaw?.is_season_finale || false
        const episodeNumber = await getNextEpisodeNumber(userId, pair, client)
        const nextSeasonNumber = getSeasonNumber(currentSeasonNumber, currentSeasonIsFinale)

        // Count episodes in the current season for safety cap
        const episodesInCurrentSeason = lastEpisodeRaw
            ? (lastEpisodeRaw.season_number === nextSeasonNumber ? episodeNumber - 1 : 0)
            : 0
        const forceFinale = shouldForceSeasonFinale(episodesInCurrentSeason + 1)

        // Build risk context for narrator
        const riskContextBlock = buildRiskContextBlock(riskRules, accountSummary)

        const { cacheablePrefix, dynamicPrompt } = buildStoryNarratorPromptCached(
            data,
            geminiOutput,
            deepseekOutput,
            news,
            lastEpisode,
            bible,
            resolvedScenarios,
            agentIntelligence,
            flaggedLevels,
            seasonArchive,
            forceFinale,
            scenarioAnalysisContext,
            activePositionCtx,
            riskContextBlock
        )
        const claudeOutput = await callClaudeWithCaching(cacheablePrefix, dynamicPrompt, {
            timeout: 180_000,
            maxTokens: 8192,
        })
        console.log(`${TAG} [Claude] Done in ${((Date.now() - claudeStart) / 1000).toFixed(1)}s — ${claudeOutput.length} chars`)

        // ── Step 7: Parse and store ──
        console.log(`${TAG} [Validation] Parsing JSON + validating scenarios...`)
        await updateProgress(taskId, 85, 'Validating AI output...', client)
        let result = parseAIJson<StoryResult>(claudeOutput)

        // ── Step 7a: Hard validation — scenario levels ──
        const scenarioValidation = validateScenarioLevels(result, data.currentPrice, data.atr14)
        if (!scenarioValidation.valid) {
            console.warn(`[Story] ${pair} scenario validation failed:`, scenarioValidation.errors)

            // Retry Claude once with correction context
            await updateProgress(taskId, 88, 'Correcting scenario levels (retry)...', client)
            const correctionPrompt = `${dynamicPrompt}

⚠️ CORRECTION REQUIRED — your previous response had these errors:
${scenarioValidation.errors.map(e => `- ${e}`).join('\n')}

Fix these issues and regenerate the COMPLETE JSON response. Remember:
- Bullish scenarios: trigger_direction="above", invalidation_direction="below"
- Bearish scenarios: trigger_direction="below", invalidation_direction="above"
- All levels must be within 3x ATR (${(data.atr14 * 3).toFixed(1)} pips) of current price ${data.currentPrice.toFixed(5)}`

            try {
                const retryOutput = await callClaudeWithCaching(cacheablePrefix, correctionPrompt, {
                    timeout: 180_000,
                    maxTokens: 8192,
                })
                result = parseAIJson<StoryResult>(retryOutput)
                console.log(`[Story] ${pair} retry succeeded after scenario validation failure`)
            } catch (retryErr) {
                console.warn(`[Story] ${pair} retry failed, using original result:`, retryErr instanceof Error ? retryErr.message : retryErr)
            }
        }

        await updateProgress(taskId, 90, 'Saving story episode...', client)

        // ── Step 7b: Validate price levels (warnings only) ──
        const levelWarnings = validateStoryLevels(result, data)
        if (levelWarnings.length > 0) {
            console.warn(`[Story] ${pair} price level warnings (${levelWarnings.length}):`,
                levelWarnings.map(w => `${w.context}: ${w.level} outside [${w.observedRange.min.toFixed(5)}, ${w.observedRange.max.toFixed(5)}]`))
        }

        // Build agent reports snapshot for episode
        const agentReportsSnapshot: Record<string, unknown> = {}
        if (agentIntelligence.optimizer) agentReportsSnapshot.optimizer = { summary: agentIntelligence.optimizer.summary, market_regime: agentIntelligence.optimizer.market_regime }
        if (agentIntelligence.news) agentReportsSnapshot.news = { summary: agentIntelligence.news.summary, sentiment: agentIntelligence.news.sentiment_indicators?.overall }
        if (agentIntelligence.crossMarket) agentReportsSnapshot.crossMarket = { summary: agentIntelligence.crossMarket.summary, risk_appetite: agentIntelligence.crossMarket.risk_appetite }
        if (agentIntelligence.cms) agentReportsSnapshot.cms = { total_conditions: agentIntelligence.cms.total_conditions, market_personality: agentIntelligence.cms.market_personality }

        // Season number already computed above before narrator call
        const seasonNumber = nextSeasonNumber

        const episode = await createEpisode(userId, pair, {
            episode_number: episodeNumber,
            season_number: seasonNumber,
            title: result.story_title,
            narrative: result.narrative,
            characters: result.characters as unknown as Record<string, unknown>,
            current_phase: result.current_phase,
            key_levels: result.key_levels as unknown as Record<string, unknown>,
            raw_ai_output: result as unknown as Record<string, unknown>,
            gemini_output: { raw: geminiOutput },
            deepseek_output: { raw: deepseekOutput },
            news_context: news as unknown as Record<string, unknown>,
            confidence: result.confidence,
            next_episode_preview: result.next_episode_preview,
            agent_reports: Object.keys(agentReportsSnapshot).length > 0 ? agentReportsSnapshot : undefined,
            generation_source: options?.generationSource || 'manual',
            is_season_finale: result.is_season_finale || forceFinale,
        }, client)

        // Create scenarios linked to this episode
        if (result.scenarios?.length > 0) {
            await createScenarios(
                episode.id,
                userId,
                pair,
                result.scenarios.map(s => ({
                    title: s.title,
                    description: s.description,
                    direction: s.direction,
                    probability: s.probability,
                    trigger_conditions: s.trigger_conditions,
                    invalidation: s.invalidation,
                    ...(s.trigger_level != null ? { trigger_level: s.trigger_level } : {}),
                    ...(s.trigger_direction ? { trigger_direction: s.trigger_direction } : {}),
                    ...(s.invalidation_level != null ? { invalidation_level: s.invalidation_level } : {}),
                    ...(s.invalidation_direction ? { invalidation_direction: s.invalidation_direction } : {}),
                })),
                client
            )
        }

        // ── Step 7b: Process position guidance ──
        if (result.position_guidance) {
            console.log(`${TAG} [Position] Guidance: ${result.position_guidance.action} (confidence: ${result.position_guidance.confidence})`)
            await processPositionGuidance(
                userId, pair, result.position_guidance,
                episode.id, episodeNumber, seasonNumber,
                existingPosition, client
            )
        }

        // ── Step 7c: Update Story Bible ──
        if (result.bible_update) {
            await upsertBible(userId, pair, result.bible_update, episodeNumber, client)
        }

        // ── Step 7d: Check season finale (AI-driven or safety cap forced) ──
        const isFinale = result.is_season_finale || forceFinale
        await checkAndCloseSeason(
            userId, pair, episodeNumber, seasonNumber,
            result.bible_update?.arc_summary || '',
            isFinale,
            episodesInCurrentSeason + 1,
            client
        )

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`${TAG} ════════ DONE ${pair} S${seasonNumber}E${episodeNumber} "${result.story_title}" in ${totalTime}s ════════`)

        await completeTask(taskId, {
            episodeId: episode.id,
            episodeNumber,
            title: result.story_title,
        }, client)

        // ── Step 7e: Notify User ──
        await notifyUser(userId, {
            title: `📖 New Story: ${pair}`,
            body: result.story_title || `Episode ${episodeNumber} is now live.`,
            url: `/story/${pair.replace('/', '-')}`
        }, client)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error during story generation'
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.error(`${TAG} ════════ FAILED ${pair} after ${totalTime}s — ${message} ════════`)
        await failTask(taskId, message, client)
    }
}

/**
 * Build the risk management context block for the narrator.
 */
function buildRiskContextBlock(
    riskRules: Array<{ rule_name: string; rule_type: string; value: Record<string, unknown> }>,
    account: OandaAccountSummary | null
): string | null {
    if (riskRules.length === 0 && !account) return null

    const parts: string[] = ['## RISK MANAGEMENT & ACCOUNT CONTEXT']

    if (account) {
        const balance = parseFloat(account.balance)
        const marginAvail = parseFloat(account.marginAvailable)
        const unrealizedPL = parseFloat(account.unrealizedPL)
        parts.push(`### Account Status
- Balance: ${balance.toFixed(2)} ${account.currency}
- Margin Available: ${marginAvail.toFixed(2)} ${account.currency}
- Unrealized P&L: ${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)} ${account.currency}
- Open Trades: ${account.openTradeCount}`)
    }

    if (riskRules.length > 0) {
        const rulesStr = riskRules.map(r => {
            const v = r.value as Record<string, unknown>
            switch (r.rule_type) {
                case 'max_risk_per_trade': return `- Max Risk Per Trade: ${v.percent}% of balance`
                case 'max_daily_loss': return `- Max Daily Loss: ${v.percent}% of balance`
                case 'max_open_trades': return `- Max Open Trades: ${v.count}`
                case 'max_position_size': return `- Max Position Size: ${v.lots} lots`
                case 'min_reward_risk': return `- Minimum R:R Ratio: 1:${v.ratio}`
                default: return `- ${r.rule_name}: ${JSON.stringify(v)}`
            }
        }).join('\n')
        parts.push(`### Active Risk Rules\n${rulesStr}`)
    }

    return parts.join('\n\n')
}

/**
 * Process position guidance from AI output.
 * Creates, adjusts, or closes story positions based on the AI's recommendation.
 */
async function processPositionGuidance(
    userId: string,
    pair: string,
    guidance: PositionGuidance,
    episodeId: string,
    episodeNumber: number,
    seasonNumber: number,
    existingPosition: Awaited<ReturnType<typeof getActivePosition>>,
    client: SupabaseClient
): Promise<void> {
    try {
        const { action } = guidance

        // ── Enter new position ──
        if ((action === 'enter_long' || action === 'enter_short') && !existingPosition) {
            if (!guidance.entry_price || !guidance.stop_loss) {
                console.warn('[Story Position] enter action missing entry_price or stop_loss, skipping')
                return
            }
            const position = await createPosition(userId, pair, {
                season_number: seasonNumber,
                direction: action === 'enter_long' ? 'long' : 'short',
                entry_episode_id: episodeId,
                entry_episode_number: episodeNumber,
                suggested_entry: guidance.entry_price,
                original_stop_loss: guidance.stop_loss,
                original_take_profit_1: guidance.take_profit_1,
                current_stop_loss: guidance.stop_loss,
                current_take_profit_1: guidance.take_profit_1,
                current_take_profit_2: guidance.take_profit_2,
                current_take_profit_3: guidance.take_profit_3,
            }, client)

            await addAdjustment({
                position_id: position.id,
                episode_id: episodeId,
                episode_number: episodeNumber,
                action: 'open',
                details: {
                    entry_price: guidance.entry_price,
                    stop_loss: guidance.stop_loss,
                    take_profit_1: guidance.take_profit_1,
                    take_profit_2: guidance.take_profit_2,
                    take_profit_3: guidance.take_profit_3,
                    favored_scenario: guidance.favored_scenario_id,
                },
                ai_reasoning: guidance.reasoning,
            }, client)

            console.log(`[Story Position] Created ${action} position for ${pair} at ${guidance.entry_price}`)
            return
        }

        // ── Adjust existing position ──
        if (action === 'adjust' && existingPosition) {
            const updates: Parameters<typeof updatePosition>[1] = {}
            const details: Record<string, unknown> = {}

            if (guidance.move_stop_to != null) {
                details.from_sl = existingPosition.current_stop_loss
                details.to_sl = guidance.move_stop_to
                updates.current_stop_loss = guidance.move_stop_to
            }
            if (guidance.new_take_profit != null) {
                details.from_tp = existingPosition.current_take_profit_1
                details.to_tp = guidance.new_take_profit
                updates.current_take_profit_1 = guidance.new_take_profit
            }
            if (guidance.partial_close_percent != null) {
                details.close_percent = guidance.partial_close_percent
                updates.status = 'partial_closed'
            }

            if (Object.keys(updates).length > 0) {
                await updatePosition(existingPosition.id, updates, client)
            }

            await addAdjustment({
                position_id: existingPosition.id,
                episode_id: episodeId,
                episode_number: episodeNumber,
                action: guidance.partial_close_percent ? 'partial_close' : guidance.move_stop_to ? 'move_sl' : 'move_tp',
                details,
                ai_reasoning: guidance.reasoning,
            }, client)

            console.log(`[Story Position] Adjusted position for ${pair}: ${JSON.stringify(details)}`)
            return
        }

        // ── Close position ──
        if (action === 'close' && existingPosition) {
            await updatePosition(existingPosition.id, {
                status: 'closed',
                close_episode_id: episodeId,
                close_episode_number: episodeNumber,
                close_reason: guidance.close_reason || guidance.reasoning,
            }, client)

            await addAdjustment({
                position_id: existingPosition.id,
                episode_id: episodeId,
                episode_number: episodeNumber,
                action: 'close',
                details: { close_reason: guidance.close_reason || guidance.reasoning },
                ai_reasoning: guidance.reasoning,
            }, client)

            console.log(`[Story Position] Closed position for ${pair}: ${guidance.close_reason}`)
            return
        }

        // ── Hold (log for journey tracking) ──
        if (action === 'hold' && existingPosition) {
            await addAdjustment({
                position_id: existingPosition.id,
                episode_id: episodeId,
                episode_number: episodeNumber,
                action: 'hold',
                details: { favored_scenario: guidance.favored_scenario_id },
                ai_reasoning: guidance.reasoning,
            }, client)
            return
        }

        // ── Wait (no position action needed) ──
        // action === 'wait' — nothing to do
    } catch (err) {
        // Position tracking is non-critical — don't fail the whole pipeline
        console.error('[Story Position] Error processing guidance:', err instanceof Error ? err.message : err)
    }
}
