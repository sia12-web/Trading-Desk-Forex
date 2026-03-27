import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getOandaConfig } from '@/lib/oanda/account'

export async function POST() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Safety check: verify server-side that active account is demo, not live
    const config = await getOandaConfig()
    const demoAccountId = process.env.OANDA_DEMO_ACCOUNT_ID

    if (config.mode !== 'demo' || !demoAccountId || config.accountId !== demoAccountId) {
        return NextResponse.json(
            { error: 'Reset is only allowed for demo accounts. Switch to demo mode first.' },
            { status: 403 }
        )
    }

    try {
        // Delete all user data in order (to handle foreign key constraints)
        // Most tables have ON DELETE CASCADE, but we'll be explicit for safety

        const tablesToClear = [
            // Trading records (delete first due to FK dependencies)
            'trade_pnl',
            'trade_screenshots',
            'trade_strategies',
            'trades',
            'trade_sync_log',
            'execution_log',

            // AI Story
            'story_episodes',
            'story_scenarios',
            'pair_subscriptions',
            'story_agent_reports',

            // Optimizations
            'indicator_optimizations'
        ]

        // Save reset timestamp BEFORE deleting (in case trader_profile gets cleared)
        const resetTimestamp = new Date().toISOString()
        await supabase
            .from('trader_profile')
            .update({ last_demo_reset_at: resetTimestamp })
            .eq('user_id', user.id)

        let totalDeleted = 0

        for (const table of tablesToClear) {
            const { error, count } = await supabase
                .from(table)
                .delete()
                .eq('user_id', user.id)

            if (error && !error.message.includes('does not exist')) {
                console.error(`Error deleting from ${table}:`, error)
                // Continue with other tables even if one fails
            } else if (count) {
                totalDeleted += count
            }
        }

        return NextResponse.json({
            success: true,
            message: `Demo account reset successfully. ${totalDeleted} records deleted. Future syncs will only import trades after ${new Date(resetTimestamp).toLocaleString()}.`,
            deletedRecords: totalDeleted,
            resetAt: resetTimestamp
        })
    } catch (error: any) {
        console.error('Reset error:', error)
        return NextResponse.json(
            { error: 'Failed to reset account' },
            { status: 500 }
        )
    }
}
