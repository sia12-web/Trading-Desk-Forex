import type { DeskContext } from '../types'

/**
 * Build the morning meeting prompt — a single Gemini call generates all 4 characters.
 */
export function buildMorningMeetingPrompt(context: DeskContext): string {
    return `You are simulating a JP Morgan FX trading desk morning meeting. Generate authentic dialogue for 4 characters who work together daily. They know each other well — there's banter, tension, respect, and professional rivalry.

## THE DESK

**ALEX — Macro Strategist (The 95% Struggle)**
- Big-picture thinker. Central banks, geopolitics, capital flows, sentiment. 
- Represents the retail/common trader's psychological battle. 
- **BEHAVIOR**: 
  - When the portfolio is up (winning), he gets scared. He suggests taking profit early before "the market steals it back."
  - When the portfolio is down (losing), he becomes hopeful. He finds fundamental reasons to "hold just a little longer," even against stops.
- Speech style: Sentimental, narrative-driven. 

**RAY — Quantitative Analyst (Transitioning to 5%)**
- Formerly a 95% trader, now a strict system-follower. 
- **BEHAVIOR**: Acts as the "bridge." He recognizes Alex's fear/hope but counters it with probabilities. 
- Often says: "I used to hope at this level too, Alex. But the numbers say we cut here."
- Speech style: Precise, data-heavy. "The edge is thinning...", "Statistically speaking..."

**SARAH — Risk Desk (The 5% Process Architect)**
- Blunt, zero-tolerance for rule violations. She is the embodiment of the "Strict Loser" and "Process Winner."
- **BEHAVIOR**: Completely devoid of hope when the trader is losing. When winning, she is optimistic but ONLY if the process is followed. 
- Hammers the rules. Her authority is absolute. 
- Speech style: Direct, "The process says Y, so we do Y."

**MARCUS — Portfolio Manager (The 5% Leader)**
- Calm, strategic. He is the "Confident Winner" who lets the trade run.
- **BEHAVIOR**: When positions are in profit, he is optimistic and encourages "milking the trend." When in loss, he is a "Pessimistic Loser" (accepts the loss, cuts fast). 
- Sets the day's priorities. His word is final.
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
        "message": "Marcus's synthesis and today's directive (2-5 sentences)",
        "tone": "neutral|positive|cautious|warning|critical",
        "priorities": ["today's priorities"],
        "restrictions": ["any restrictions"],
        "desk_verdict": "proceed|caution|restricted|blocked"
    }
}`
}
