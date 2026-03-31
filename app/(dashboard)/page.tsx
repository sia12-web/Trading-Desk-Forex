import { getAuthUser } from '@/lib/supabase/server'
import Link from 'next/link'
import { Zap, ArrowRight } from 'lucide-react'
import { OandaAccountWidget } from '@/components/dashboard/OandaAccountWidget'
import { RiskStatusWidget } from '@/components/dashboard/RiskStatusWidget'
import { VolatilePairsWidget } from '@/components/dashboard/VolatilePairsWidget'
import { MarketSessionsWidget } from '@/components/dashboard/MarketSessionsWidget'

export default async function DashboardPage() {
    const user = await getAuthUser()
    if (!user) return null

    return (
        <div className="max-w-[1500px] mx-auto space-y-6 pb-20 px-4">
            {/* Hero Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 py-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                        Dashboard
                        <span className="text-sm font-medium text-neutral-500 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full tracking-normal uppercase">
                            Portfolio Overview
                        </span>
                    </h1>
                    <p className="text-neutral-500 text-sm mt-1">
                        Your portfolio, risk status, and market volatility at a glance.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/trade"
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-xl shadow-blue-900/30 active:scale-95 group"
                    >
                        <Zap size={18} />
                        New Execution
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </div>

            {/* Top Row: Portfolio + Risk */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <OandaAccountWidget />
                <RiskStatusWidget />
            </div>

            {/* Bottom Row: Volatility + Sessions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <VolatilePairsWidget />
                <MarketSessionsWidget />
            </div>
        </div>
    )
}
