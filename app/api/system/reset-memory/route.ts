import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const results: Record<string, number> = {}

        // Phase 1 — FK children first
        const phase1Tables = [
            'story_position_adjustments',
            'story_scenarios',
            'daily_tasks',
            'lab_signals',
            'lab_performance_snapshots',
        ]

        // Phase 2 — Everything else
        const phase2Tables = [
            'story_positions',
            'story_episodes',
            'story_bibles',
            'story_seasons',
            'story_agent_reports',
            'pair_subscriptions',
            'cms_analyses',
            'scenario_analyses',
            'ai_coaching_sessions',
            'coaching_memory',
            'behavioral_analysis',
            'daily_plans',
            'indicator_optimizations',
            'structural_analysis_cache',
            'wave_analysis',
            'big_picture_analysis',
            'technical_analyses',
            'strategy_discoveries',
            'lab_settings',
            'lab_scan_history',
            'strategy_engines',
            'strategy_signals',
        ]

        const deleteFromTable = async (table: string) => {
            const { error, count } = await supabase
                .from(table)
                .delete()
                .eq('user_id', user.id)

            if (error && !error.message.includes('does not exist')) {
                console.error(`[reset-memory] Error deleting from ${table}:`, error.message)
            }
            results[table] = count ?? 0
        }

        // Phase 1
        for (const table of phase1Tables) {
            await deleteFromTable(table)
        }

        // Phase 2
        for (const table of phase2Tables) {
            await deleteFromTable(table)
        }

        // Categorize results for response
        const categories = {
            story: ['story_position_adjustments', 'story_scenarios', 'story_positions', 'story_episodes', 'story_bibles', 'story_seasons', 'story_agent_reports', 'pair_subscriptions'],
            cms: ['cms_analyses', 'scenario_analyses'],
            coaching: ['ai_coaching_sessions', 'coaching_memory', 'behavioral_analysis'],
            daily_plans: ['daily_tasks', 'daily_plans'],
            analysis_cache: ['indicator_optimizations', 'structural_analysis_cache', 'wave_analysis', 'big_picture_analysis', 'technical_analyses'],
            strategy_lab: ['lab_signals', 'lab_performance_snapshots', 'strategy_discoveries', 'lab_settings', 'lab_scan_history', 'strategy_engines', 'strategy_signals'],
        }

        const categorySummary: Record<string, number> = {}
        for (const [cat, tables] of Object.entries(categories)) {
            categorySummary[cat] = tables.reduce((sum, t) => sum + (results[t] || 0), 0)
        }

        const totalDeleted = Object.values(results).reduce((sum, n) => sum + n, 0)

        return NextResponse.json({
            success: true,
            message: `AI memory reset complete. ${totalDeleted} records deleted.`,
            totalDeleted,
            categories: categorySummary,
        })
    } catch (error: any) {
        console.error('[reset-memory] Error:', error)
        return NextResponse.json(
            { error: 'Failed to reset AI memory' },
            { status: 500 }
        )
    }
}
