import type { PositionGuidance } from '@/lib/story/types'
import { getAssetConfig } from '@/lib/story/asset-config'

interface PsychologyContext {
    streak: number
    weeklyAvg: number | null
    weaknesses: string[]
    currentFocus: string | null
    riskPersonality: string | null
    violationsThisWeek: number
    ai_trading_scars: string[]
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
    fractalAnalysis?: {
        alligatorState: string
        alligatorDirection: string
        setupScore: number
        setupDirection: string
        signals: string[]
    },
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

${fractalAnalysis ? `## BILL WILLIAMS FRACTAL CHECKLIST (for Ray's validation)

Setup Score: ${fractalAnalysis.setupScore}/100 → ${fractalAnalysis.setupDirection}
Alligator State: ${fractalAnalysis.alligatorState} (${fractalAnalysis.alligatorDirection})
Signals Detected: ${fractalAnalysis.signals.length > 0 ? fractalAnalysis.signals.join(', ') : 'none'}

**6-ITEM CHECKLIST** (Ray must validate if this is a fractal-based entry):
1. ✓/✗ Alligator Awake — State must be 'eating' or 'awakening', NOT 'sleeping'
2. ✓/✗ Price Beyond Alligator — Price must be above ALL 3 lines (longs) or below ALL 3 (shorts)
3. ✓/✗ Valid Fractal Signal — Fractal must be BEYOND the Teeth line (not inside the mouth)
4. ✓/✗ AO Confirmation — Awesome Oscillator positive for longs, negative for shorts
5. ✓/✗ AC Green/Red Bars — 2+ consecutive green (longs) or red (shorts) bars
6. ✓/✗ ATR-Based Stop — Stop placed below recent fractal or Jaw (whichever is more conservative)

**Ray's Task**: If setup score is <60/100 OR Alligator is 'sleeping', flag this as a weak fractal setup. Only high-score setups (70+) during 'eating' phase are institutional-grade.
` : ''}
## TRADER PSYCHOLOGY

Process Streak: ${psychology.streak} consecutive 7+ scores
Weekly Score Average: ${psychology.weeklyAvg !== null ? `${psychology.weeklyAvg.toFixed(1)}/10` : 'No data'}
Known Weaknesses: ${psychology.weaknesses.length > 0 ? psychology.weaknesses.join(', ') : 'None identified'}
Current Focus: ${psychology.currentFocus || 'None set'}
Risk Personality: ${psychology.riskPersonality || 'Unknown'}
Violations This Week: ${psychology.violationsThisWeek}

## CHARACTERS

- **RAY (Quant — Transitioning to 5%):** Focus on **"The Value"**. He reviews if price is actually at a level where smart money plays (RSI/Momentum extremes). ${fractalAnalysis ? `**FOR FRACTAL SETUPS**: Ray validates the 6-item Bill Williams checklist above. If setup score <60 or Alligator is sleeping, he MUST flag it as incomplete. If 5/6 criteria met but one is weak, he notes it.` : 'He denies entries that are just "chasing" without real value.'}
- **SARAH (Risk — The 5% Resident):** The iron hand. She hates **"Pussy Moves"**. If the trader is closing because of a wiggle, she will alert that the "Pretty Girl" hasn't left the bar yet.
- **ALEX (Macro — The 95% Struggle):** Represents Greed and Fear.
  - **WINNING**: Suggests "Pussy Moves" to close early because he's scared of a pull-back.
  - **LOSING**: Suggests "Hoping" for a reversal because he's fearful of taking the loss.
- **MARCUS (PM — The 5% Leader):** The "Confident Winner." He looks for a "major trend" and waits for it to be tested. He is patient. He ignores Alex's fear and checks if the "Value" has actually changed.


## ANTI-HALLUCINATION DOCTRINE
1. **ONLY reference data provided.** Never fabricate prices, P&L, or news events.
2. If the trade violates risk rules, Sarah MUST block it.
3. Match character reactions to this psychology framework.

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

### POSITION MANAGEMENT REACTION (THE 95% VS 5% TEST)
Episode: "${storyTitle}"
Pair: ${pair}
Action: ${guidance.action}
Current Price: ${currentPrice}
${guidance.move_stop_to ? `Move SL to: ${guidance.move_stop_to}` : ''}
${guidance.partial_close_percent ? `Partial close: ${guidance.partial_close_percent}%` : ''}
${guidance.new_take_profit ? `New TP: ${guidance.new_take_profit}` : ''}
Reasoning: ${guidance.reasoning}

## THE CHARACTERS (1-2 sentences each)
- **RAY (Quant — Transitioning to 5%):** Review **"The Value"**. Has the RSI/Momentum regime actually shifted, or is this just a "Stupid Money" pull-back?
- **SARAH (Risk — The 5% Resident):** The iron hand. Identifies **"Pussy Moves"**. If the trader is panicking on a winner, she calls it out. If they are hoping on a loser, she cuts it.
- **ALEX (Macro — The 95% Struggle):** 
  - If in PROFIT: Scared of the red candle. Suggests closing early (**Pussy Move**).
  - If in LOSS: Hopeful that the central bank or "some news" will save him.
- **MARCUS (PM — The 5% Leader):** The Patient Winner. He knows the **"Pretty Girl"** story. He enforces staying in winners for the full target and cutting losers at the stop.


## OUTPUT (JSON only)
{
    "ray": { "message": "...", "tone": "neutral|positive|cautious|warning" },
    "sarah": { "message": "...", "tone": "neutral|positive|cautious|warning" }
}`
}

export type { PsychologyContext }
