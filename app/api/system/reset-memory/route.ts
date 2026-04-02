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

        // Phase 1 — FK children first (delete tables that are referenced by others)
        const phase1Tables = [
            'story_position_adjustments',
            'story_episodes', // Must delete before story_scenarios (FK: triggered_scenario_id)
        ]

        // Phase 2 — Parent tables and everything else
        const phase2Tables = [
            'story_scenarios', // Can delete after story_episodes
            'story_positions',
            'story_bibles',
            'story_seasons',
            'story_agent_reports',
            'pair_subscriptions',
            'desk_messages',
            'process_scores',
            'desk_state',
            'cms_analyses',
            'scenario_analyses',
            'indicator_optimizations',
            'structural_analysis_cache',
            'wave_analysis',
        ]

        const deleteFromTable = async (table: string) => {
            const { error, count } = await supabase
                .from(table)
                .delete()
                .eq('user_id', user.id)

            if (error) {
                // Ignore errors for non-existent tables
                const isTableNotFound =
                    error.message.includes('does not exist') ||
                    error.message.includes('Could not find the table')

                if (!isTableNotFound) {
                    console.error(`[reset-memory] Error deleting from ${table}:`, error.message)
                }
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
            story: ['story_position_adjustments', 'story_scenarios', 'story_positions', 'story_episodes', 'story_bibles', 'story_seasons', 'story_agent_reports', 'pair_subscriptions', 'desk_messages', 'process_scores', 'desk_state'],
            cms: ['cms_analyses', 'scenario_analyses'],
            analysis_cache: ['indicator_optimizations', 'structural_analysis_cache', 'wave_analysis'],
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
