'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw, Flame, TrendingUp, TrendingDown, ArrowRight, Zap, Target } from 'lucide-react'
import Link from 'next/link'

interface VolatilePair {
    instrument: string
    name: string
    volatility: number
    price: number
    change1d: number
}

export function VolatilePairsWidget() {
    const [pairs, setPairs] = useState<VolatilePair[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    const fetchVolatilePairs = useCallback(async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/volatile-pairs')
            if (!res.ok) throw new Error('Failed to fetch volatility data')
            const data = await res.json()
            setPairs(data.pairs || [])
            setLastUpdated(new Date())
            setError(null)
        } catch (err) {
            console.error('Volatility widget error:', err)
            setError('System timeout')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchVolatilePairs()
        // Auto-refresh every 15 minutes
        const interval = setInterval(fetchVolatilePairs, 15 * 60 * 1000)
        return () => clearInterval(interval)
    }, [fetchVolatilePairs])

    if (error) {
        return (
            <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Flame className="text-rose-500" size={14} />
                        Volatility Engine
                    </h3>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 text-center">
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{error}</p>
                    <button 
                        onClick={fetchVolatilePairs}
                        className="mt-2 text-[10px] font-black text-neutral-400 hover:text-white flex items-center gap-1 mx-auto transition-colors"
                    >
                        <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                        RE-INITIALIZE
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden group">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-[50px] -mr-16 -mt-16 group-hover:bg-orange-500/10 transition-all duration-700" />
            
            <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col">
                    <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Flame className="text-orange-500" size={14} />
                        High Volatility Engine
                    </h3>
                    <p className="text-[9px] text-neutral-600 font-bold mt-0.5 uppercase tracking-tighter">Current Market Deviations</p>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && !loading && (
                        <span className="text-[9px] text-neutral-700 font-mono font-black italic">
                            {lastUpdated.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchVolatilePairs}
                        disabled={loading}
                        className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-600 hover:text-orange-500 transition-all active:scale-90"
                    >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="space-y-2.5">
                {loading && pairs.length === 0 ? (
                    Array(5).fill(0).map((_, i) => (
                        <div key={i} className="h-14 bg-neutral-950/40 border border-neutral-800/50 rounded-2xl animate-pulse" />
                    ))
                ) : (
                    pairs.map((pair) => (
                        <div 
                            key={pair.instrument}
                            className="flex items-center justify-between p-3.5 bg-neutral-950/40 border border-neutral-800/50 rounded-2xl hover:border-orange-500/30 hover:bg-neutral-800/20 transition-all group/item"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl transition-colors ${pair.change1d >= 0 ? 'bg-emerald-500/5 text-emerald-500 group-hover/item:bg-emerald-500/10' : 'bg-rose-500/5 text-rose-500 group-hover/item:bg-rose-500/10'}`}>
                                    {pair.change1d >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                </div>
                                <div>
                                    <h4 className="font-black text-xs text-white tracking-tight group-hover/item:text-orange-400 transition-colors uppercase">{pair.name}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[10px] font-mono text-neutral-500 font-bold">{pair.price.toFixed(5)}</p>
                                        <span className={`text-[9px] font-black ${pair.change1d >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                                            {pair.change1d >= 0 ? '+' : ''}{pair.change1d.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right flex flex-col items-end">
                                <div className="flex items-center gap-1.5">
                                    <Activity size={10} className="text-orange-500 opacity-60" />
                                    <span className="text-[9px] font-black text-neutral-500 uppercase tracking-widest">Volatility</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className="w-16 h-1 bg-neutral-900 rounded-full overflow-hidden shrink-0">
                                        <div 
                                            className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-1000"
                                            style={{ width: `${Math.min(100, pair.volatility * 100)}%` }}
                                        />
                                    </div>
                                    <p className="font-mono text-[11px] font-black text-white group-hover/item:text-orange-400">
                                        {pair.volatility.toFixed(3)}%
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                    <span className="text-[9px] font-black text-neutral-600 uppercase tracking-widest">Live Scan Active</span>
                </div>
                <Link 
                    href="/trade" 
                    className="text-[9px] font-black text-neutral-500 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors group/link"
                >
                    Execution Hub
                    <ArrowRight size={10} className="group-hover/link:translate-x-1 transition-transform" />
                </Link>
            </div>
        </div>
    )
}
