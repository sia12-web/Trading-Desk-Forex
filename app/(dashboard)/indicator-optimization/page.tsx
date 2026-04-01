'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { 
    FlaskConical, 
    RefreshCw, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    ChevronRight, 
    Cpu,
    LineChart,
    BarChart3,
    Activity,
    Settings2
} from 'lucide-react'
import { Card } from '@/components/ui/card' // Assuming basic UI components exist or using standard div

interface Calibration {
    id: string
    pair: string
    timeframe: string
    settings: any
    updated_at: string
}

export default function IndicatorOptimizationPage() {
    const [calibrations, setCalibrations] = useState<Calibration[]>([])
    const [subscribedPairs, setSubscribedPairs] = useState<{ pair: string }[]>([])
    const [selectedPair, setSelectedPair] = useState<string>('all')
    const [loading, setLoading] = useState(true)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lastRun, setLastRun] = useState<string | null>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [calRes, subRes] = await Promise.all([
                fetch('/api/indicators/calibrations'),
                fetch('/api/story/subscriptions')
            ])
            
            const { calibrations: data } = await calRes.json()
            const { pairs } = await subRes.json()
            
            setCalibrations(data)
            setSubscribedPairs(pairs || [])
            
            // Find most recent update
            if (data.length > 0) {
                const dates = data.map((c: any) => new Date(c.updated_at).getTime())
                setLastRun(new Date(Math.max(...dates)).toLocaleString())
            }
        } catch (err) {
            setError('Failed to load data')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    const handleRunOptimization = async () => {
        setRunning(true)
        setError(null)
        try {
            const res = await fetch('/api/indicators/optimize', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pair: selectedPair === 'all' ? null : selectedPair })
            })
            if (!res.ok) throw new Error('Optimization failed')
            await fetchData()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setRunning(false)
        }
    }

    // Group calibrations by pair
    const pairs = Array.from(new Set(calibrations.map(c => c.pair)))

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            {/* Header section with Glassmorphism */}
            <div className="relative overflow-hidden rounded-3xl bg-neutral-900/50 border border-neutral-800 p-8 shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <Cpu size={140} className="text-blue-500" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                                <FlaskConical size={24} />
                            </div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Indicator Optimization</h1>
                        </div>
                        <p className="text-neutral-400 max-w-lg text-sm leading-relaxed">
                            DeepSeek-powered calibration engine for your technical indicators. 
                            Analyzes recent market volatility and structure to find the absolute best mathematical fit for each timeframe.
                        </p>
                        {lastRun && (
                            <div className="flex items-center gap-2 text-xs text-neutral-500 pt-1">
                                <Clock size={12} />
                                <span>Last Global Calibration: {lastRun}</span>
                            </div>
                        )}
                    </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <select
                                value={selectedPair}
                                onChange={(e) => setSelectedPair(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer min-w-[180px]"
                            >
                                <option value="all">🌐 All Pairs</option>
                                {subscribedPairs.map(sub => (
                                    <option key={sub.pair} value={sub.pair}>
                                        {sub.pair.replace('_', ' / ')}
                                    </option>
                                ))}
                            </select>

                            <button
                                onClick={handleRunOptimization}
                                disabled={running}
                                className={`relative group overflow-hidden px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest flex items-center gap-3 transition-all ${
                                    running 
                                    ? 'bg-neutral-800 text-neutral-500' 
                                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                }`}
                            >
                                {running ? (
                                    <RefreshCw size={18} className="animate-spin" />
                                ) : (
                                    <Activity size={18} className="group-hover:scale-110 transition-transform" />
                                )}
                                <span>
                                    {running ? 'Calibrating...' : 
                                     selectedPair === 'all' ? 'Run Global Calibration' : `Calibrate ${selectedPair.replace('_', '/')}`}
                                </span>
                                {!running && (
                                    <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-[-20deg]" />
                                )}
                            </button>
                        </div>
                </div>

                {error && (
                    <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-4 duration-300">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 gap-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <RefreshCw size={32} className="animate-spin text-blue-500/50" />
                        <p className="text-neutral-500 font-medium animate-pulse">Scanning instruments...</p>
                    </div>
                ) : pairs.length === 0 ? (
                    <div className="text-center py-20 rounded-3xl border border-dashed border-neutral-800 bg-neutral-900/20">
                        <Settings2 size={48} className="mx-auto text-neutral-700 mb-4" />
                        <h2 className="text-xl font-bold text-neutral-400 mb-2">No Optimized Pairs</h2>
                        <p className="text-neutral-500 max-w-sm mx-auto mb-8">
                            Start by subscribing to instruments in the Story section, then run the calibration engine.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {pairs.map(pair => (
                            <InstrumentCalibrationRow key={pair} pair={pair} calibrations={calibrations.filter(c => c.pair === pair)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function InstrumentCalibrationRow({ pair, calibrations }: { pair: string, calibrations: Calibration[] }) {
    const tfs = ['M', 'W', 'D', 'H4', 'H1']
    
    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 px-2">
                <div className="w-1.5 h-6 rounded-full bg-blue-500" />
                <h2 className="text-lg font-bold text-neutral-200 tracking-wide uppercase">{pair.replace('_', ' / ')}</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {tfs.map(tf => {
                    const cal = calibrations.find(c => c.timeframe === tf)
                    return (
                        <TimeframeCalibrationCard 
                            key={tf} 
                            timeframe={tf} 
                            calibration={cal} 
                        />
                    )
                })}
            </div>
        </div>
    )
}

function TimeframeCalibrationCard({ timeframe, calibration }: { timeframe: string, calibration?: Calibration }) {
    if (!calibration) {
        return (
            <div className="h-full rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5 flex flex-col items-center justify-center text-center opacity-50 grayscale">
                <span className="text-xs font-black text-neutral-600 mb-1">{timeframe}</span>
                <Clock size={16} className="text-neutral-700 mb-2" />
                <span className="text-[10px] text-neutral-700 font-medium">Pending</span>
            </div>
        )
    }

    const { settings } = calibration
    
    return (
        <div className="group rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-800/60 transition-all hover:border-neutral-700 p-5 space-y-4 shadow-sm hover:shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-800/50 pb-3">
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-tighter">Timeframe</span>
                    <span className="text-lg font-black text-white">{timeframe}</span>
                </div>
                <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                    <CheckCircle2 size={16} />
                </div>
            </div>

            <div className="space-y-3.5 pt-1">
                <CalibrationItem 
                    label="RSI" 
                    value={`${settings.RSI.period} / ${settings.RSI.overbought}-${settings.RSI.oversold}`} 
                    icon={Activity}
                />
                <CalibrationItem 
                    label="MACD" 
                    value={`${settings.MACD.fastPeriod}-${settings.MACD.slowPeriod}-${settings.MACD.signalPeriod}`} 
                    icon={BarChart3}
                />
                <CalibrationItem 
                    label="Stochastic" 
                    value={`${settings.Stochastic.kPeriod}-${settings.Stochastic.dPeriod}`} 
                    icon={LineChart}
                />
                <CalibrationItem 
                    label="B-Bands" 
                    value={`${settings['Bollinger Bands'].period} (x${settings['Bollinger Bands'].stdDev})`} 
                    icon={Activity}
                />
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800/50 flex items-center justify-between group-hover:px-1 transition-all">
                <span className="text-[9px] text-neutral-500 font-mono">
                    {new Date(calibration.updated_at).toLocaleDateString()}
                </span>
                <ChevronRight size={14} className="text-neutral-600 group-hover:text-blue-500 transition-colors" />
            </div>
        </div>
    )
}

function CalibrationItem({ label, value, icon: Icon }: { label: string, value: string, icon: any }) {
    return (
        <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
                <Icon size={12} className="text-neutral-500" />
                <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">{label}</span>
            </div>
            <span className="text-[11px] font-bold text-neutral-300 tabular-nums">{value}</span>
        </div>
    )
}
