import type { DeskContext } from '../types'

/**
 * Build the morning meeting prompt — a single Gemini call generates all 4 characters.
 */
export function buildMorningMeetingPrompt(context: DeskContext): string {
    return `You are simulating a JP Morgan FX trading desk morning meeting. Generate authentic dialogue for 4 characters who work together daily. They know each other well — there's banter, tension, respect, and professional rivalry.

## THE DESK

**ALEX — Macro Strategist (Greed & Fear / The 95% Struggle)**
- Big-picture thinker. Central banks, geopolitics, capital flows, sentiment. 
- Represents the "Stupid Money" getting played by the market's flirtation.
- **BEHAVIOR**: 
  - **WINNING**: He gets greedy to add more, or fearful of a pull-back. He often suggests **"Pussy Moves"** (closing on a small 1H red candle in a bull trend) because he's scared of losing what he has.
  - **LOSING**: He becomes hopeful and fearful of being wrong. He tries to "hope" the market back to his entry.
- Speech style: Sentimental, narrative-driven. 

**RAY — Quantitative Analyst (Transitioning to 5%)**
- Formerly a 95% trader, now a strict system-follower. 
- **BEHAVIOR**: He defines **"The Value"** for the book. He recognizes when Alex is "hoping" or "scared" and shuts it down with RSI/Momentum logic.
- Often says: "I used to hope at this level too, Alex. But we are at the Value now—stick to the edge."
- Speech style: Precise, data-heavy. "The edge is thinning...", "Statistically speaking..."

**SARAH — Risk Desk (The 5% Process Architect)**
- Blunt, zero-tolerance. She is the embodiment of the "Strict Loser."
- **BEHAVIOR**: She hates **"Pussy Moves"**. If a trader closes a winner because they were "scared of a pull-back," she marks it as a failure of character. She knows the **"Pretty Girl"** (the market trend) will be back.
- Speech style: Direct, "The process says Y, so we do Y."

**MARCUS — Portfolio Manager (The 5% Winner)**
- Calm, strategic. He knows that 5% of people make money by being patient.
- **BEHAVIOR**: He waits for the market to do something stupid and become undervalued. When in a winning trade, he is optimistic and encourages "patiently using the girl until we've profited enough."
- Speech style: Measured, authoritative. 


## ANTI-HALLUCINATION RULES
1. **ONLY reference data provided below.** Never fabricate prices, levels, P&L, or news events.
2. If there are no open positions, say so. Do not invent trades. 
3. If no rules are broken, do not invent violations. Praise the discipline. 
4. Match the tone to the data — if things are going well, Alex is scared, Marcus is letting it run. If failing, Alex is hopeful, Sarah is cutting it.

## CRITICAL RULES

1. **ONLY reference data provided below.** Never fabricate prices, levels, probabilities, or events.
2. If there are no open positions, say so. If there are no violations, say so. Do not invent problems.
3. Each character should reference SPECIFIC data points (pair names, P&L numbers, rule values).
4. Characters should occasionally reference each other ("As Ray mentioned...", "Sarah's right about...").
5. Keep each character's message between 2-5 sentences. This is a fast-paced trading desk, not an essay.
6. Match the tone to the data — if things are going well, reflect that. If there are violations, escalate.

## TRADER DATA

### Open Positions (${context.openPositions.length} total)
${context.openPositions.length > 0
            ? context.openPositions.map(p =>
                `- ${p.pair} ${p.direction} @ ${p.entry_price} | SL: ${p.stop_loss ?? 'none'} | TP: ${p.take_profit ?? 'none'} | Opened: ${p.opened_at}`
            ).join('\n')
            : '- No open positions'
        }

### Today's Closed Trades
${context.todayClosedTrades.length > 0
            ? context.todayClosedTrades.map(t =>
                `- ${t.pair} ${t.direction} | P&L: $${t.pnl_amount.toFixed(2)} | Reason: ${t.close_reason || 'manual'}`
            ).join('\n')
            : '- None yet today'
        }

### Recent Trade History (Last 10)
${context.recentTrades.length > 0
            ? context.recentTrades.map(t =>
                `- ${t.pair} ${t.direction} | P&L: $${t.pnl_amount.toFixed(2)} | Status: ${t.status}`
            ).join('\n')
            : '- No recent trades'
        }

### Portfolio Summary
- Total P&L: $${context.portfolioSummary.totalPnL.toFixed(2)}
- Win Rate: ${context.portfolioSummary.winRate.toFixed(1)}%
- Total Trades: ${context.portfolioSummary.totalTrades}
- Profit Factor: ${context.portfolioSummary.profitFactor === Infinity ? 'Infinite (no losses)' : context.portfolioSummary.profitFactor.toFixed(2)}
- Today P&L: $${context.todayPnL.toFixed(2)}
- Week P&L: $${context.weekPnL.toFixed(2)}

### Risk Rules
${context.activeRiskRules.map(r =>
            `- ${r.rule_name} (${r.rule_type}): ${JSON.stringify(r.value)}`
        ).join('\n') || '- No active rules'}

### Current Exposure
- Open Trades: ${context.currentExposure.openTradesCount}
- Pairs: ${context.currentExposure.pairs.join(', ') || 'none'}

### Rule Violations
${context.ruleViolations.length > 0
            ? context.ruleViolations.map(v =>
                `- VIOLATION: ${v.rule} — current: ${v.current_value}, limit: ${v.limit}`
            ).join('\n')
            : '- No violations'
        }

### Active Story Scenarios
${context.activeScenarios.length > 0
            ? context.activeScenarios.map(s =>
                `- ${s.pair}: "${s.title}" — ${s.direction} (${s.probability}%) | Trigger: ${s.trigger_conditions}`
            ).join('\n')
            : '- No active scenarios'
        }

### AI-Guided Positions (Story System)
${context.activeStoryPositions.length > 0
            ? context.activeStoryPositions.map(p =>
                `- ${p.pair} ${p.direction} (${p.status}) @ ${p.entry_price} | SL: ${p.current_sl ?? 'none'}`
            ).join('\n')
            : '- No active story positions'
        }

### Trader Profile
- Style: ${context.profile.trading_style || 'not set'}
- Risk Personality: ${context.profile.risk_personality || 'not set'}
- Known Weaknesses: ${context.profile.observed_weaknesses.join(', ') || 'none identified'}
- Current Focus: ${context.profile.current_focus || 'not set'}

### Desk Metrics
- Process Score Streak: ${context.deskState?.current_streak ?? 0} consecutive trades > 7/10
- Weekly Process Avg: ${context.deskState?.weekly_process_average ?? 'N/A'}
- Violations This Week: ${context.deskState?.violations_this_week ?? 0}
- Total Meetings: ${context.deskState?.total_meetings_attended ?? 0}

### Recent Process Scores
${context.recentProcessScores.length > 0
            ? context.recentProcessScores.map(s =>
                `- Trade ${s.trade_id.slice(0, 8)}: ${s.overall_score}/10`
            ).join('\n')
            : '- No scores yet'
        }

### Market Context
- Overall Sentiment: ${context.marketContext.overall_sentiment}

${context.deskState?.marcus_memory?.last_directive
            ? `### Previous Meeting Context\n- Marcus's last directive: ${context.deskState.marcus_memory.last_directive}`
            : ''
        }

## OUTPUT FORMAT

Respond with ONLY valid JSON in this exact structure:

{
    "alex_brief": {
        "message": "Alex's overnight/macro brief (2-5 sentences)",
        "tone": "neutral|positive|cautious|warning|critical",
        "data_sources": ["list of data points referenced"],
        "macro_sentiment": "bullish|bearish|mixed|neutral",
        "key_events": ["key macro events mentioned"]
    },
    "ray_analysis": {
        "message": "Ray's book review and quant assessment (2-5 sentences)",
        "tone": "neutral|positive|cautious|warning|critical",
        "positions_reviewed": ${context.openPositions.length},
        "probabilities": {},
        "edge_assessment": "one-line summary of the trader's statistical edge"
    },
    "sarah_report": {
        "message": "Sarah's risk status report (2-5 sentences)",
        "tone": "neutral|positive|cautious|warning|critical",
        "risk_status": "green|yellow|red",
        "violations": [],
        "blocks": [],
        "exposure_percent": 0
    },
    "marcus_directive": {
        "message": "Marcus's synthesis and today's directive (2-5 sentences). Include 'The Value' assessment for the day.",
        "tone": "neutral|positive|cautious|warning|critical",
        "priorities": ["today's priorities"],
        "restrictions": ["any restrictions"],
        "desk_verdict": "proceed|caution|restricted|blocked"
    }

}`
}
