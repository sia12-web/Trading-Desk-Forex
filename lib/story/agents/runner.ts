import { collectStoryData } from '../data-collector'
import { getAssetConfig } from '../asset-config'
import { getTodayReportTypes } from './data'
import { runIndicatorOptimizer } from './indicator-optimizer'
import { runNewsIntelligence } from './news-intelligence'
import { runIndexNewsIntelligence } from './news-intelligence-index'
import { runCrossMarketAnalysis } from './cross-market'
import { runIndexCrossMarketAnalysis } from './cross-market-index'
import { runCMSIntelligence } from './cms-intelligence'
import type { AgentIntelligence } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Run all 3 intelligence agents for a single pair.
 * Each agent has independent error handling — one failure doesn't block others.
 * Checks dedup before running: skips agents that already completed today.
 */
export async function runAgentsForPair(
    userId: string,
    pair: string,
    client: SupabaseClient
): Promise<AgentIntelligence> {
    // Check which agents already ran today
    const completedTypes = await getTodayReportTypes(userId, pair, client)
    const needsOptimizer = !completedTypes.includes('indicator_optimizer')
    const needsNews = !completedTypes.includes('news_intelligence')
    const needsCrossMarket = !completedTypes.includes('cross_market')
    const needsCMS = !completedTypes.includes('cms_intelligence')

    if (!needsOptimizer && !needsNews && !needsCrossMarket && !needsCMS) {
        console.log(`All agents already ran today for ${userId}/${pair}`)
        return { optimizer: null, news: null, crossMarket: null, cms: null, generatedAt: new Date().toISOString() }
    }

    // Collect story data (shared with optimizer agent, avoids duplicate OANDA calls)
    const data = needsOptimizer ? await collectStoryData(userId, pair, client) : null

    // Run agents — each with independent try/catch
    const results: AgentIntelligence = {
        optimizer: null,
        news: null,
        crossMarket: null,
        cms: null,
        generatedAt: new Date().toISOString(),
    }

    // Agent 1: Indicator Optimizer (DeepSeek) — needs collected data
    if (needsOptimizer && data) {
        try {
            results.optimizer = await runIndicatorOptimizer(pair, data, userId, client)
        } catch (error) {
            console.error(`Optimizer agent error for ${pair}:`, error instanceof Error ? error.message : error)
        }
    }

    // Agent 2: News Intelligence (Gemini) — routes to index or forex variant
    const assetConfig = getAssetConfig(pair)
    if (needsNews) {
        try {
            if (assetConfig.type === 'cfd_index') {
                results.news = await runIndexNewsIntelligence(pair, userId, client)
            } else {
                results.news = await runNewsIntelligence(pair, userId, client)
            }
        } catch (error) {
            console.error(`News agent error for ${pair}:`, error instanceof Error ? error.message : error)
        }
    }

    // Agent 3: Cross-Market Effects (Gemini) — routes to index or forex variant
    if (needsCrossMarket) {
        try {
            if (assetConfig.type === 'cfd_index') {
                results.crossMarket = await runIndexCrossMarketAnalysis(pair, userId, client)
            } else {
                results.crossMarket = await runCrossMarketAnalysis(pair, userId, client)
            }
        } catch (error) {
            console.error(`Cross-market agent error for ${pair}:`, error instanceof Error ? error.message : error)
        }
    }

    // Agent 4: CMS Intelligence (Programmatic) — conditional market patterns
    if (needsCMS) {
        try {
            results.cms = await runCMSIntelligence(pair, userId, client)
        } catch (error) {
            console.error(`CMS agent error for ${pair}:`, error instanceof Error ? error.message : error)
        }
    }

    return results
}
