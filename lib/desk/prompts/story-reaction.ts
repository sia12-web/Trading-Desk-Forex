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

## TRADER PSYCHOLOGY

Process Streak: ${psychology.streak} consecutive 7+ scores
Weekly Score Average: ${psychology.weeklyAvg !== null ? `${psychology.weeklyAvg.toFixed(1)}/10` : 'No data'}
Known Weaknesses: ${psychology.weaknesses.length > 0 ? psychology.weaknesses.join(', ') : 'None identified'}
Current Focus: ${psychology.currentFocus || 'None set'}
Risk Personality: ${psychology.riskPersonality || 'Unknown'}
Violations This Week: ${psychology.violationsThisWeek}

## CHARACTERS

- **RAY (Quant):** Assess statistical edge and confluence. Use numbers. Never say "bullish/bearish."
- **SARAH (Risk):** Check R:R, exposure, lot size. Reference the trader's streak and weaknesses. Be blunt.
- **ALEX (Macro):** Does the macro picture align? One sentence.
- **MARCUS (PM):** Final verdict. Reference trader psychology if a weakness is relevant to this trade.

## RULES

1. Each character: 1-2 sentences MAX. Fast, professional desk banter.
2. If R:R < 1.5 or SL not set, Sarah flags it.
3. If trader has "impatience" weakness and this is a swing trade, Marcus mentions it.
4. If violations > 0 this week, Sarah is more cautious.
5. ONLY reference data provided. Never fabricate.

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
