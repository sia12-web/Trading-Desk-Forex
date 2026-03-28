'use client'

import { useState } from 'react'
import type { CMSResult, CMSCondition } from '@/lib/cms/types'
import { CMSConditionCard } from './CMSConditionCard'
import { CMSSummaryCard } from './CMSSummaryCard'

type Category = 'daily' | 'weekly' | 'session' | 'volatility' | 'cross_market'

const TABS: { key: Category; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'session', label: 'Session' },
    { key: 'volatility', label: 'Volatility' },
    { key: 'cross_market', label: 'Cross-Market' },
]

export function CMSResultsView({ result }: { result: CMSResult }) {
    const [activeTab, setActiveTab] = useState<Category>('daily')

    const conditions: CMSCondition[] = result.categories[activeTab] || []

    return (
        <div className="space-y-6">
            <CMSSummaryCard result={result} />

            {/* Category tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {TABS.map(tab => {
                    const count = (result.categories[tab.key] || []).length
                    const isActive = activeTab === tab.key
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                isActive
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                                    : 'bg-neutral-900/50 text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-700'
                            }`}
                        >
                            {tab.label}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-neutral-800 text-neutral-500'
                            }`}>
                                {count}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Condition cards grid */}
            {conditions.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {conditions.map((condition) => (
                        <CMSConditionCard key={condition.id} condition={condition} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 text-neutral-500 text-sm">
                    No conditions found in this category.
                </div>
            )}
        </div>
    )
}
