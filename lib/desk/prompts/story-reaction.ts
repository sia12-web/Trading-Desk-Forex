import type { PositionGuidance } from '@/lib/story/types'
import { getAssetConfig } from '@/lib/story/asset-config'

interface PsychologyContext {
    streak: number
    weeklyAvg: number | null
    weaknesses: string[]
    currentFocus: string | null
    riskPersonality: string | null
    violationsThisWeek: number
}

/**
 * Build the desk reaction prompt for a position entry recommendation.
 * 4 characters react: Ray (edge), Sarah (risk + psychology), Alex (macro), Marcus (verdict).
 */
export function buildPositionEntryReactionPrompt(
    pair: string,
    guidance: PositionGuidance,
    storyTitle: string,
    psychology: PsychologyContext,
    currentPrice: number,
    atr14: number,
    atr50: number,
    volatilityStatus: string,
): string {
    const config = getAssetConfig(pair)
    const mult = config.pointMultiplier
    const label = config.pointLabel

    const slPoints = guidance.stop_loss
        ? Math.abs(currentPrice - guidance.stop_loss) * mult
        : null
    const tp1Points = guidance.take_profit_1
        ? Math.abs(guidance.take_profit_1 - currentPrice) * mult
        : null
    const rr = slPoints && tp1Points ? (tp1Points / slPoints).toFixed(2) : 'N/A'

    const isCold = volatilityStatus === 'cold'
    const isSpike = volatilityStatus === 'spike'
    const ratio = atr50 > 0 ? (atr14 / atr50).toFixed(2) : '1.00'

    return `You are a JP Morgan desk reacting to an AI-generated trade entry recommendation. Each character gives a 1-2 sentence reaction. Stay in character. Be honest — if the trade looks weak, say so.

## THE RECOMMENDATION

Episode: "${storyTitle}"
Pair: ${pair}
Action: ${guidance.action}
Entry: ${guidance.entry_price ?? currentPrice}
Stop Loss: ${guidance.stop_loss ?? 'NOT SET'}
TP1: ${guidance.take_profit_1 ?? 'N/A'} | TP2: ${guidance.take_profit_2 ?? '-'} | TP3: ${guidance.take_profit_3 ?? '-'}
R:R: ${rr}
Lots: ${guidance.suggested_lots ?? 'N/A'}
Risk: ${guidance.risk_percent ?? 'N/A'}%
AI Confidence: ${(guidance.confidence * 100).toFixed(0)}%
Reasoning: ${guidance.reasoning}

## VOLATILITY STATUS

- Regime: **${volatilityStatus.toUpperCase()}** | ATR14: ${atr14.toFixed(1)} ${label} | ATR50: ${atr50.toFixed(1)} ${label} | Ratio: ${ratio}x
${tp1Points ? `- TP distance vs daily ATR: ${(tp1Points / atr14).toFixed(1)}x daily range${tp1Points > atr14 * 2 ? ' — TARGET IS >2x DAILY RANGE' : ''}` : ''}
${isCold ? `- COLD MARKET: The market is moving LESS than average. A ${tp1Points ? tp1Points.toFixed(0) : '?'} ${label} target in a market averaging ${atr14.toFixed(0)} ${label}/day is questionable without a catalyst.` : ''}
${isSpike ? `- SPIKE: Volatility is 1.5x+ above average. Wider stops needed. Whipsaw risk elevated.` : ''}

## TRADER PSYCHOLOGY

Process Streak: ${psychology.streak} consecutive 7+ scores
Weekly Score Average: ${psychology.weeklyAvg !== null ? `${psychology.weeklyAvg.toFixed(1)}/10` : 'No data'}
Known Weaknesses: ${psychology.weaknesses.length > 0 ? psychology.weaknesses.join(', ') : 'None identified'}
Current Focus: ${psychology.currentFocus || 'None set'}
Risk Personality: ${psychology.riskPersonality || 'Unknown'}
Violations This Week: ${psychology.violationsThisWeek}

## CHARACTERS

- **RAY (Quant — VOLATILITY HAWK):** Assess statistical edge, confluence, AND VOLATILITY. Ray is OBSESSED with whether the market has enough energy to reach the target. If ATR is compressed (cold), Ray MUST loudly flag that the trade will "die of boredom." If spiking, warn about whipsaws. Use ATR numbers. Never say "bullish/bearish."
- **SARAH (Risk):** Check R:R, exposure, lot size. Reference the trader's streak and weaknesses. Be blunt.
- **ALEX (Macro):** Does the macro picture align? One sentence.
- **MARCUS (PM):** Final verdict. If Ray flags cold volatility, Marcus MUST factor it in — a perfect setup in a dead market is still a bad trade. Reference trader psychology if a weakness is relevant.

## RULES

1. Each character: 1-2 sentences MAX. Fast, professional desk banter.
2. If R:R < 1.5 or SL not set, Sarah flags it.
3. ${isCold ? '**VOLATILITY IS COLD** — Ray MUST flag this. Marcus should push back unless exceptional confluence exists.' : isSpike ? '**VOLATILITY IS SPIKING** — Ray MUST warn about whipsaw risk.' : 'Ray comments on volatility conditions.'}
4. If trader has "impatience" weakness and this is a swing trade, Marcus mentions it.
5. If violations > 0 this week, Sarah is more cautious.
6. ONLY reference data provided. Never fabricate.

## OUTPUT (JSON only)

{
    "ray": { "message": "...", "tone": "neutral|positive|cautious|warning" },
    "sarah": { "message": "...", "tone": "neutral|positive|cautious|warning" },
    "alex": { "message": "...", "tone": "neutral|positive|cautious|warning" },
    "marcus": { "message": "...", "tone": "neutral|positive|cautious|warning", "verdict": "approved|caution|blocked" }
}`
}

/**
 * Build the desk reaction prompt for position management actions.
 * hold/adjust: Ray + Sarah only. close: all 4 characters.
 */
export function buildPositionManagementReactionPrompt(
    pair: string,
    guidance: PositionGuidance,
    storyTitle: string,
    psychology: PsychologyContext,
    currentPrice: number,
    isCloseAction: boolean,
): string {
    if (isCloseAction) {
        return `You are a JP Morgan desk reacting to an AI recommendation to CLOSE a position. Each character gives 1 sentence.

Episode: "${storyTitle}"
Pair: ${pair}
Action: ${guidance.action}
Close Reason: ${guidance.close_reason || guidance.reasoning}
Current Price: ${currentPrice}
Trader Streak: ${psychology.streak}

## CHARACTERS (1 sentence each)
- RAY: Comment on the outcome/timing.
- SARAH: Risk compliance check.
- ALEX: Macro context of the close.
- MARCUS: Wrap-up. Reference what the trader learned.

## OUTPUT (JSON only)
{
    "ray": { "message": "...", "tone": "neutral|positive|cautious" },
    "sarah": { "message": "...", "tone": "neutral|positive|cautious" },
    "alex": { "message": "...", "tone": "neutral|positive|cautious" },
    "marcus": { "message": "...", "tone": "neutral|positive|cautious" }
}`
    }

    // hold/adjust — only Ray + Sarah
    return `You are the quant (Ray) and risk manager (Sarah) on a JP Morgan desk. React to a position management recommendation. 1-2 sentences each.

Episode: "${storyTitle}"
Pair: ${pair}
Action: ${guidance.action}
${guidance.move_stop_to ? `Move SL to: ${guidance.move_stop_to}` : ''}
${guidance.partial_close_percent ? `Partial close: ${guidance.partial_close_percent}%` : ''}
${guidance.new_take_profit ? `New TP: ${guidance.new_take_profit}` : ''}
Reasoning: ${guidance.reasoning}
Current Price: ${currentPrice}
Trader Streak: ${psychology.streak}
Trader Weaknesses: ${psychology.weaknesses.join(', ') || 'None'}

## OUTPUT (JSON only)
{
    "ray": { "message": "...", "tone": "neutral|positive|cautious|warning" },
    "sarah": { "message": "...", "tone": "neutral|positive|cautious|warning" }
}`
}

export type { PsychologyContext }
