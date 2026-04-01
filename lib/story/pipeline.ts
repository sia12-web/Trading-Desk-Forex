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
import { getSeasonNumber, getSeasonArchive, endSeason } from './seasons'
import { getAgentReportsForPair } from './agents/data'
import {
    createEpisode,
    createScenarios,
    getLatestEpisode,
    getNextEpisodeNumber,
    getScenariosForEpisode,
    getRecentlyResolvedScenarios,
    deactivateAllActiveScenariosForPair,
} from '@/lib/data/stories'
import { validateStoryLevels, validateScenarioLevels, parseFlaggedLevels } from './validators'
import { getLatestScenarioAnalysisForPrompt } from '@/lib/scenario-analysis/context'
import { getLatestScenarioAnalysis } from '@/lib/data/scenario-analyses'
import type { MarketContext } from '@/lib/scenario-analysis/types'
import { notifyUser } from '@/lib/notifications/notifier'
import { getActivePosition, createPosition, updatePosition, addAdjustment, getAdjustmentsForPosition } from '@/lib/data/story-positions'
import { getOandaConfig } from '@/lib/oanda/account'
import type { OandaAccountSummary } from '@/lib/types/oanda'
import type { ActivePositionContext } from './prompts/claude-narrator'
import { triggerAutoProcessScore, getMinimalPsychologyContext, generatePositionEntryReaction, generatePositionManagementReaction } from '@/lib/desk/story-reactions'
import type { StoryReactionContext } from '@/lib/desk/story-reactions'
import type { StoryResult, PositionGuidance, EpisodeType } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

const TAG = '[Story]'

/**
 * Story generation pipeline orchestrator.
 * Runs as a background task: data collection → tri-model analysis → DB storage.
 *
 * All 3 models must succeed — no fallbacks (Promise.all, not Promise.allSettled).
 *
 * @param options.useServiceRole - When true (cron/bot), uses service-role client to bypass RLS
 * @param options.triggeredScenarioId - Which scenario triggered this generation (from monitor)
 * @param options.triggeredEpisodeId - Which episode the triggered scenario belonged to
 */
export async function generateStory(
    userId: string,
    pair: string,
    taskId: string,
    options?: {
        useServiceRole?: boolean
        generationSource?: 'manual' | 'cron' | 'bot'
        triggeredScenarioId?: string
        triggeredEpisodeId?: string
        isInvalidation?: boolean
    }
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

            const cfg = await getOandaConfig()
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

        const [bible, lastEpisodeRaw, resolvedScenarios, seasonArchive, scenarioAnalysisContext, scenarioAnalysisRaw, existingPosition, psychologyRaw] = await Promise.all([
            getBible(userId, pair, client),
            getLatestEpisode(userId, pair, client),
            getRecentlyResolvedScenarios(userId, pair, 10, client),
            getSeasonArchive(userId, pair, client),
            getLatestScenarioAnalysisForPrompt(userId, pair, client),
            getLatestScenarioAnalysis(userId, pair, client),
            getActivePosition(userId, pair, client),
            getMinimalPsychologyContext(userId, client),
        ])

        const psychology = psychologyRaw as Awaited<ReturnType<typeof getMinimalPsychologyContext>>

        // ── Determine active position (Sync/Adopt OANDA live trade) ──
        let activePosition = existingPosition
        if (data.live_oanda_position) {
            const live = data.live_oanda_position
            if (!activePosition) {
                // AUTO-ADOPT: Live OANDA trade exists but no Story position. Adopt it into the narrative.
                console.log(`${TAG} [Adoption] Found unlinked live OANDA trade (${live.id}) — adopting into Story...`)
                const season = lastEpisodeRaw?.season_number || 1
                const epNum = lastEpisodeRaw?.episode_number || 0
                
                activePosition = await createPosition(userId, pair, {
                    season_number: season,
                    direction: live.units > 0 ? 'long' : 'short',
                    entry_episode_id: lastEpisodeRaw?.id || '',
                    entry_episode_number: epNum,
                    suggested_entry: live.entryPrice,
                    original_stop_loss: live.stopLoss || 0,
                    current_stop_loss: live.stopLoss,
                    current_take_profit_1: live.takeProfit,
                }, client)
                
                await updatePosition(activePosition.id, { 
                    status: 'active', 
                    entry_price: live.entryPrice,
                    oanda_trade_id: live.id
                }, client)

                await addAdjustment({
                    position_id: activePosition.id,
                    episode_id: lastEpisodeRaw?.id || '',
                    episode_number: epNum,
                    action: 'open',
                    details: { adopted_from_oanda: true, oanda_trade_id: live.id },
                    ai_reasoning: "ADOPTED: Live OANDA position detected on account without existing narrative guidance. Synchronizing story state."
                }, client)
            } else if (activePosition.oanda_trade_id !== live.id) {
                // Link existing Story position to this OANDA trade if it was just opened
                console.log(`${TAG} [Sync] Linking Story position ${activePosition.id} to OANDA trade ${live.id}`)
                activePosition = await updatePosition(activePosition.id, { 
                    oanda_trade_id: live.id,
                    status: 'active' 
                }, client)
            }
        } else if (activePosition && activePosition.status === 'active' && activePosition.oanda_trade_id) {
            // TRADE GONE: Story thinks we have a position but OANDA says no.
            console.warn(`${TAG} [Sync] Active Story position has no corresponding OANDA trade! Trade likely closed/liquidated manually.`)
            // We'll let the AI decide how to narrate this (it will see 0 live positions)
        }

        // Build active position context for narrator
        let activePositionCtx: ActivePositionContext | null = null
        if (activePosition) {
            const adjustments = await getAdjustmentsForPosition(activePosition.id, client)
            activePositionCtx = { 
                position: activePosition, 
                adjustments,
                live_oanda_details: data.live_oanda_position 
            }
        }

        // Extract validated key levels for DeepSeek cross-referencing
        const scenarioAnalysisLevels = scenarioAnalysisRaw
            ? ((scenarioAnalysisRaw.market_context as MarketContext)?.key_levels || [])
            : null

        // ── Determine episode type based on lifecycle ──
        let episodeType: EpisodeType = 'analysis'
        if (options?.triggeredScenarioId && lastEpisodeRaw && !options.isInvalidation) {
            const lastType = (lastEpisodeRaw.episode_type as EpisodeType) || 'analysis'
            if (lastType === 'analysis') {
                episodeType = 'position_entry'
            } else {
                episodeType = 'position_management'
            }
        }

        // ── Volatility Gate: block position entries when market is too quiet ──
        // If volatility is "cold" (ATR14/ATR50 < 0.7), there's not enough movement
        // to justify risk. Downgrade to analysis — the AI will still analyze but
        // won't recommend entries in a dead market.
        if (episodeType === 'position_entry' && data.volatilityStatus === 'cold') {
            console.log(`${TAG} [VolatilityGate] ${pair} volatility is COLD (ratio: ${data.atrRatio.toFixed(2)}) — downgrading position_entry → analysis`)
            episodeType = 'analysis'
        }

        // Load triggered scenario details for prompt context
        let triggeredScenario: {
            title: string
            direction: string
            trigger_level: number
            trigger_direction: string
            trigger_timeframe: string
            description: string
        } | null = null
        if (options?.triggeredScenarioId) {
            const { data: scenarioData } = await client
                .from('story_scenarios')
                .select('title, direction, trigger_level, trigger_direction, trigger_timeframe, description')
                .eq('id', options.triggeredScenarioId)
                .single()
            triggeredScenario = scenarioData
        }

        console.log(`${TAG} [Lifecycle] Episode type: ${episodeType}${triggeredScenario ? ` (triggered: "${triggeredScenario.title}")` : ''}`)

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

        // Season number computation
        const currentSeasonNumber = lastEpisodeRaw?.season_number || 1
        const currentSeasonIsFinale = lastEpisodeRaw?.is_season_finale || false
        const episodeNumber = await getNextEpisodeNumber(userId, pair, client)
        const nextSeasonNumber = getSeasonNumber(currentSeasonNumber, currentSeasonIsFinale)
        const seasonNumber = nextSeasonNumber

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
            scenarioAnalysisContext,
            activePositionCtx,
            riskContextBlock,
            episodeType,
            triggeredScenario,
            psychology,
            options?.isInvalidation
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
        if (agentIntelligence.news) {
            const newsReport = agentIntelligence.news
            const sentiment = 'sentiment_indicators' in newsReport ? newsReport.sentiment_indicators?.overall : ('risk_appetite' in newsReport ? newsReport.risk_appetite?.overall : undefined)
            agentReportsSnapshot.news = { summary: newsReport.summary, sentiment }
        }
        if (agentIntelligence.crossMarket) agentReportsSnapshot.crossMarket = { summary: agentIntelligence.crossMarket.summary, risk_appetite: agentIntelligence.crossMarket.risk_appetite }
        if (agentIntelligence.cms) agentReportsSnapshot.cms = { total_conditions: agentIntelligence.cms.total_conditions, market_personality: agentIntelligence.cms.market_personality }

        // ── Deactivate all old active scenarios before creating new ones ──
        const deactivated = await deactivateAllActiveScenariosForPair(
            userId, pair, `Superseded by S${seasonNumber}E${episodeNumber}`, client
        )
        if (deactivated > 0) {
            console.log(`${TAG} [Lifecycle] Deactivated ${deactivated} old scenarios`)
        }

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
            is_season_finale: false, // System-controlled, not AI-controlled
            episode_type: episodeType,
            triggered_scenario_id: options?.triggeredScenarioId || null,
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
                    ...(s.trigger_timeframe ? { trigger_timeframe: s.trigger_timeframe } : {}),
                    ...(s.invalidation_level != null ? { invalidation_level: s.invalidation_level } : {}),
                    ...(s.invalidation_direction ? { invalidation_direction: s.invalidation_direction } : {}),
                })),
                client
            )
        }

        // ── Step 7c: Process position guidance ──
        if (result.position_guidance) {
            console.log(`${TAG} [Position] Guidance: ${result.position_guidance.action} (confidence: ${result.position_guidance.confidence})`)
            await processPositionGuidance(
                userId, pair, result.position_guidance,
                episode.id, episodeNumber, seasonNumber,
                existingPosition, client
            )
        }

        // ── Step 7c-bis: Fire-and-forget Gemini desk reaction for position episodes ──
        // Claude generates baseline desk_messages for narrative coherence, but we
        // use a dedicated Gemini Flash pass for deeper, focused character reactions.
        if (episodeType !== 'analysis' && result.position_guidance) {
            const reactionCtx: StoryReactionContext = {
                userId, pair, episodeId: episode.id,
                episodeNumber, seasonNumber, episodeType,
                currentPrice: data.currentPrice, atr14: data.atr14,
                atr50: data.atr50, volatilityStatus: data.volatilityStatus,
            }

            if (episodeType === 'position_entry') {
                console.log(`${TAG} [Desk] Firing Gemini entry reaction (fire-and-forget)...`)
                generatePositionEntryReaction(reactionCtx, result.position_guidance, result.story_title, client)
                    .catch(err => console.error(`${TAG} [Desk] Entry reaction failed:`, err instanceof Error ? err.message : err))
            } else {
                console.log(`${TAG} [Desk] Firing Gemini management reaction (fire-and-forget)...`)
                generatePositionManagementReaction(reactionCtx, result.position_guidance, result.story_title, client)
                    .catch(err => console.error(`${TAG} [Desk] Mgmt reaction failed:`, err instanceof Error ? err.message : err))
            }
        }

        // ── Step 7d: Update Story Bible ──
        if (result.bible_update) {
            await upsertBible(userId, pair, result.bible_update, episodeNumber, client)
        }

        // Season ending is now trade-cycle-driven (handled in processPositionGuidance on 'close')
        // No AI-driven season finale logic here

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`${TAG} ════════ DONE ${pair} S${seasonNumber}E${episodeNumber} "${result.story_title}" (${episodeType}) in ${totalTime}s ════════`)

        await completeTask(taskId, {
            episodeId: episode.id,
            episodeNumber,
            title: result.story_title,
            episodeType,
        }, client)

        // ── Step 7e: Notify User ──
        const typeLabel = episodeType === 'analysis' ? 'Analysis' : episodeType === 'position_entry' ? 'Entry Signal' : 'Position Update'
        await notifyUser(userId, {
            title: `${typeLabel}: ${pair}`,
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
 * When a position is closed, the season ends (trade-cycle-driven seasons).
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

        // ── Enter new position (Market or Limit) ──
        const isEntry = action === 'enter_long' || action === 'enter_short' || action === 'set_limit_long' || action === 'set_limit_short'
        if (isEntry && !existingPosition) {
            if (!guidance.entry_price || !guidance.stop_loss) {
                console.warn('[Story Position] entry action missing entry_price or stop_loss, skipping')
                return
            }

            const direction = (action === 'enter_long' || action === 'set_limit_long') ? 'long' : 'short'
            const isLimit = action === 'set_limit_long' || action === 'set_limit_short'

            const position = await createPosition(userId, pair, {
                season_number: seasonNumber,
                direction,
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

            // If it's a market entry, we can mark it active immediately (or keep as suggested for manual approval)
            // Given the "Human in the loop" rule, we'll keep it as 'suggested' first, but log clearly.
            // Keep as 'suggested' for manual approval and execution through the Trade page
            await updatePosition(position.id, { status: 'suggested' }, client)


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

        // ── Close position → end season ──
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

            // Trade closed = season ends (trade-cycle-driven seasons)
            await endSeason(userId, pair, seasonNumber, guidance.close_reason || 'Trade closed', client)
            console.log(`[Story Position] Season ${seasonNumber} ended for ${pair} (trade closed)`)

            // Auto-trigger process scoring if position was linked to a real OANDA trade
            if (existingPosition.oanda_trade_id) {
                const { data: linkedTrade } = await client
                    .from('trades')
                    .select('id')
                    .eq('oanda_trade_id', existingPosition.oanda_trade_id)
                    .limit(1)
                    .maybeSingle()

                if (linkedTrade) {
                    triggerAutoProcessScore(userId, pair, linkedTrade.id, client)
                        .catch(err => console.error(`[Story Position] Auto process score failed:`, err instanceof Error ? err.message : err))
                }
            }
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
