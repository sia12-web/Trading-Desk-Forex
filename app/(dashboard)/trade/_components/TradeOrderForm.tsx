'use client'

import React, { useState, useEffect } from 'react'
import {
    TrendingUp,
    TrendingDown,
    Target,
    ShieldCheck,
    AlertCircle,
    ChevronRight,
    CheckCircle2,
    XCircle,
    Briefcase,
    Zap,
    Loader2,
    ShieldAlert,
    Edit3,
    Activity,
    ChevronDown as ChevronDownIcon,
    Bookmark,
    ExternalLink
} from 'lucide-react'
import { OandaInstrument, OandaPrice } from '@/lib/types/oanda'
import { RiskValidationResult } from '@/lib/risk/validator'
import { TradeRiskGauge } from './TradeRiskGauge'
import Link from 'next/link'
import { MarketSentiment } from '@/lib/utils/sentiment'
import { getMarketSessions } from '@/lib/utils/market-sessions'
import type { DeskMeeting, TradeReviewOutput } from '@/lib/desk/types'

interface TradeFormProps {
    instruments: OandaInstrument[]
    accountInfo: any
}

export function TradeOrderForm({ instruments, accountInfo }: TradeFormProps) {
    const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET')
    const [selectedInstrument, setSelectedInstrument] = useState<string>('EUR_USD')
    const [direction, setDirection] = useState<'long' | 'short'>('long')
    const [units, setUnits] = useState<number>(1000)
    const [sizeMode, setSizeMode] = useState<'units' | 'lots'>('lots')
    const [entryPrice, setEntryPrice] = useState<number>(0)
    const [limitPrice, setLimitPrice] = useState<number>(0)
    const [stopLoss, setStopLoss] = useState<number>(0)
    const [takeProfit, setTakeProfit] = useState<number>(0)
    const [currentPrice, setCurrentPrice] = useState<OandaPrice | null>(null)

    const [validation, setValidation] = useState<RiskValidationResult | null>(null)
    const [isValidating, setIsValidating] = useState(false)
    const [isExecuting, setIsExecuting] = useState(false)

    const [showConfirm, setShowConfirm] = useState(false)
    const [confirmText, setConfirmText] = useState('')
    const [executionResult, setExecutionResult] = useState<any>(null)

    const [marketSentiment, setMarketSentiment] = useState<MarketSentiment | null>(null)
    const [name, setName] = useState('')
    const [strategyExplanation, setStrategyExplanation] = useState('')
    const [isPlanning, setIsPlanning] = useState(false)
    const [planResult, setPlanResult] = useState<{ tradeId: string } | null>(null)

    const [deskReview, setDeskReview] = useState<DeskMeeting | null>(null)
    const [isReviewing, setIsReviewing] = useState(false)

    // Load persisted state on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('tradeFormState')
                if (saved) {
                    const state = JSON.parse(saved)
                    if (state.selectedInstrument) setSelectedInstrument(state.selectedInstrument)
                    if (state.direction) setDirection(state.direction)
                    if (state.units) setUnits(state.units)
                    if (state.stopLoss) setStopLoss(state.stopLoss)
                    if (state.takeProfit) setTakeProfit(state.takeProfit)
                    if (state.orderType) setOrderType(state.orderType)
                }
            } catch (err) {
                console.error('Failed to restore trade form state:', err)
            }
        }
    }, [])

    // Persist state whenever it changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const state = {
                    selectedInstrument,
                    direction,
                    units,
                    stopLoss,
                    takeProfit,
                    orderType,
                    timestamp: Date.now()
                }
                localStorage.setItem('tradeFormState', JSON.stringify(state))
            } catch (err) {
                console.error('Failed to save trade form state:', err)
            }
        }
    }, [selectedInstrument, direction, units, stopLoss, takeProfit, orderType])

    useEffect(() => {
        const fetchSentiment = async () => {
            try {
                const res = await fetch('/api/sentiment')
                if (res.ok) {
                    const data = await res.json()
                    setMarketSentiment(data)
                }
            } catch (err) {
                console.error('Failed to fetch sentiment:', err)
            }
        }
        fetchSentiment()
    }, [])



    // Find selected instrument details
    const instrumentDetails = instruments.find(i => i.name === selectedInstrument)
    const pipLocation = instrumentDetails?.pipLocation || -4

    // Fetch current price
    useEffect(() => {
        const fetchPrice = async () => {
            try {
                const res = await fetch(`/api/oanda/prices?instruments=${selectedInstrument}`)
                const data = await res.json()
                const price = data.prices?.find((p: any) => p.instrument === selectedInstrument)
                if (price) {
                    setCurrentPrice(price)
                    const marketPrice = direction === 'long' ? parseFloat(price.asks[0].price) : parseFloat(price.bids[0].price)
                    if (entryPrice === 0 || orderType === 'MARKET') {
                        setEntryPrice(marketPrice)
                    }
                    if (limitPrice === 0) setLimitPrice(marketPrice)
                }
            } catch (err) {
                console.error(err)
            }
        }
        fetchPrice()
        const interval = setInterval(fetchPrice, 5000)
        return () => clearInterval(interval)
    }, [selectedInstrument, direction, orderType])


    // Validation function with manual debounce
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!stopLoss || stopLoss === 0) {
                setValidation(null)
                return
            }
            setIsValidating(true)
            try {
                const res = await fetch('/api/risk/validate', {
                    method: 'POST',
                    body: JSON.stringify({
                        instrument: selectedInstrument,
                        direction,
                        units,
                        entryPrice: orderType === 'LIMIT' ? limitPrice : entryPrice,
                        stopLoss,
                        takeProfit: takeProfit || undefined,
                        orderType
                    }),
                    headers: { 'Content-Type': 'application/json' }
                })
                const data = await res.json()
                setValidation(data)
            } catch (err) {
                console.error(err)
            } finally {
                setIsValidating(false)
            }
        }, 500)

        return () => clearTimeout(timer)
    }, [selectedInstrument, direction, units, entryPrice, limitPrice, stopLoss, takeProfit, orderType])


    const handleExecute = async () => {
        if (confirmText !== 'CONFIRM') return

        setIsExecuting(true)
        try {
            const res = await fetch('/api/trade/execute', {
                method: 'POST',
                body: JSON.stringify({
                    instrument: selectedInstrument,
                    direction,
                    units,
                    entryPrice,
                    limitPrice,
                    stopLoss,
                    takeProfit,
                    orderType,
                    strategy_template_id: null,
                    voice_transcript: "Manual trade",
                    parsed_strategy: null,
                    name: name || null,
                    strategy_explanation: strategyExplanation || null
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            if (!res.ok) {
                const errorText = await res.text().catch(() => 'Unknown server error')
                let errorData: any = { error: 'Unknown server error' }
                try {
                    errorData = JSON.parse(errorText)
                } catch (e) { }
                alert(errorData.error || `Execution failed: ${res.status}`)
                setIsExecuting(false)
                return
            }

            const data = await res.json()
            setExecutionResult(data)
            setShowConfirm(false)

            // Clear persisted state after successful execution
            if (typeof window !== 'undefined') {
                localStorage.removeItem('tradeFormState')
            }
        } catch (err) {
            alert('Network error during execution')
        } finally {
            setIsExecuting(false)
        }
    }

    const handlePlanTrade = async () => {
        if (!stopLoss) return
        setIsPlanning(true)
        try {
            const res = await fetch('/api/trade/plan', {
                method: 'POST',
                body: JSON.stringify({
                    instrument: selectedInstrument,
                    direction,
                    units,
                    entryPrice,
                    limitPrice,
                    stopLoss,
                    takeProfit,
                    orderType,
                    name: name || null,
                    strategy_explanation: strategyExplanation || null
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
                alert(errorData.error || 'Failed to save planned trade')
                return
            }

            const data = await res.json()
            setPlanResult(data)

            if (typeof window !== 'undefined') {
                localStorage.removeItem('tradeFormState')
            }
        } catch (err) {
            alert('Network error while saving planned trade')
        } finally {
            setIsPlanning(false)
        }
    }

    const handleDeskReview = async () => {
        if (!stopLoss || !takeProfit) return
        setIsReviewing(true)
        setDeskReview(null)
        try {
            const res = await fetch('/api/desk/review', {
                method: 'POST',
                body: JSON.stringify({
                    pair: selectedInstrument,
                    direction,
                    entry_price: orderType === 'LIMIT' ? limitPrice : entryPrice,
                    stop_loss: stopLoss,
                    take_profit: takeProfit,
                    lot_size: units / 100000,
                    reasoning: strategyExplanation || undefined,
                }),
                headers: { 'Content-Type': 'application/json' },
            })

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
                alert(errorData.error || 'Desk review failed')
                return
            }

            const data = await res.json()
            setDeskReview(data.meeting)
        } catch (err) {
            alert('Network error during desk review')
        } finally {
            setIsReviewing(false)
        }
    }

    // Calculations
    const activeEntryPrice = orderType === 'LIMIT' ? limitPrice : entryPrice
    const riskPips = Math.abs(activeEntryPrice - stopLoss) * Math.pow(10, -pipLocation)
    const riskAmount = Math.abs(activeEntryPrice - stopLoss) * units
    const rewardPips = takeProfit ? Math.abs(takeProfit - activeEntryPrice) * Math.pow(10, -pipLocation) : 0
    const rrRatio = riskPips > 0 ? (rewardPips / riskPips).toFixed(2) : '0'
    const riskPercent = (riskAmount / parseFloat(accountInfo?.balance || '1')) * 100

    // Live Pre-Trade Analytics
    const marketSnapshot = getMarketSessions(new Date())
    const bidPrice = currentPrice ? parseFloat(currentPrice.bids[0].price) : 0
    const askPrice = currentPrice ? parseFloat(currentPrice.asks[0].price) : 0
    const liveSpread = (askPrice - bidPrice) * Math.pow(10, -pipLocation)

    const marginRate = instrumentDetails?.marginRate ? parseFloat(instrumentDetails.marginRate) : 0.05
    const marginRequired = units * activeEntryPrice * marginRate

    const longFinancing = instrumentDetails?.financing?.longRate ? parseFloat(instrumentDetails.financing.longRate) : 0
    const shortFinancing = instrumentDetails?.financing?.shortRate ? parseFloat(instrumentDetails.financing.shortRate) : 0
    const estFinancing = direction === 'long' ? longFinancing : shortFinancing

    // Estimate daily swap (simplified: units * price * rate / 365)
    const dailySwap = (units * activeEntryPrice * (estFinancing / 100)) / 365

    if (executionResult) {
        return (
            <div className="bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-12 text-center space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-500/20">
                    <CheckCircle2 size={48} />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-premium-white">Order Executed Successfully</h2>
                    <p className="text-neutral-500 mt-2">Your trade has been placed and logged in your journal.</p>
                </div>
                <div className="bg-neutral-800 rounded-[1.5rem] p-6 max-w-sm mx-auto flex items-center justify-between border border-neutral-700">
                    <div className="text-left">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">OANDA ID</p>
                        <p className="font-mono font-bold text-blue-400">#{executionResult.oandaResponse?.orderFillTransaction?.tradeOpened?.tradeID || executionResult.oandaResponse?.orderCreateTransaction?.id}</p>
                    </div>
                    <Link
                        href={`/journal/${executionResult.localTradeId}`}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all text-xs"
                    >
                        <Edit3 size={14} />
                        Add Analysis
                    </Link>
                </div>
                <button
                    onClick={() => {
                        setExecutionResult(null)
                        // Reset form to clean state
                        setStopLoss(0)
                        setTakeProfit(0)
                    }}
                    className="text-neutral-500 hover:text-white font-bold text-sm transition-colors"
                >
                    Return to Terminal
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Form Section (2/3) */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] p-2 flex gap-2">
                        <button onClick={() => setOrderType('MARKET')} className={`flex-1 py-3 rounded-2xl font-bold transition-all ${orderType === 'MARKET' ? 'bg-neutral-800 text-white shadow-inner' : 'text-neutral-500'}`}>Market</button>
                        <button onClick={() => setOrderType('LIMIT')} className={`flex-1 py-3 rounded-2xl font-bold transition-all ${orderType === 'LIMIT' ? 'bg-neutral-800 text-white shadow-inner' : 'text-neutral-500'}`}>Limit</button>
                    </div>

                    <div className="bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-10 space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="md:col-span-2 space-y-4">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Trade Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Bullish Breakout on H4"
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl px-6 py-4 text-white font-bold outline-none placeholder:text-neutral-700 focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Instrument</label>
                                <select value={selectedInstrument} onChange={(e) => setSelectedInstrument(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl px-6 py-4 text-white font-bold outline-none">
                                    {instruments.map(i => <option key={i.name} value={i.name}>{i.displayName}</option>)}
                                </select>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Direction</label>
                                <div className="flex bg-neutral-800 p-1.5 rounded-2xl border border-neutral-700">
                                    <button onClick={() => setDirection('long')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${direction === 'long' ? 'bg-green-600 text-white' : 'text-neutral-500'}`}>Long</button>
                                    <button onClick={() => setDirection('short')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${direction === 'short' ? 'bg-red-600 text-white' : 'text-neutral-500'}`}>Short</button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Position Size */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Position Size</label>
                                    <div className="flex bg-neutral-800 p-0.5 rounded-lg border border-neutral-700">
                                        <button onClick={() => setSizeMode('lots')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${sizeMode === 'lots' ? 'bg-blue-600 text-white' : 'text-neutral-500'}`}>Lots</button>
                                        <button onClick={() => setSizeMode('units')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${sizeMode === 'units' ? 'bg-blue-600 text-white' : 'text-neutral-500'}`}>Units</button>
                                    </div>
                                </div>
                                <input
                                    type="number"
                                    step={sizeMode === 'lots' ? '0.01' : '1000'}
                                    value={sizeMode === 'lots' ? (units / 100000 || '') : (units || '')}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0
                                        setUnits(sizeMode === 'lots' ? Math.round(val * 100000) : val)
                                    }}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl px-6 py-4 text-white font-mono font-bold outline-none"
                                    placeholder={sizeMode === 'lots' ? '0.01' : '1000'}
                                />
                                <p className="text-[10px] text-neutral-500">
                                    {sizeMode === 'lots'
                                        ? `= ${units.toLocaleString()} units`
                                        : `= ${(units / 100000).toFixed(2)} lot${units / 100000 !== 1 ? 's' : ''}`
                                    }
                                </p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {[0.01, 0.05, 0.1, 0.5, 1.0].map(lot => (
                                        <button
                                            key={lot}
                                            onClick={() => setUnits(lot * 100000)}
                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border ${units === lot * 100000
                                                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                                                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-600'
                                            }`}
                                        >
                                            {lot} lot
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Entry / Limit Price */}
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">{orderType === 'MARKET' ? 'Entry Price' : 'Limit Price'}</label>
                                <input type="number" step="0.00001" value={orderType === 'MARKET' ? entryPrice : limitPrice} disabled={orderType === 'MARKET'} onChange={(e) => orderType === 'LIMIT' ? setLimitPrice(parseFloat(e.target.value)) : setEntryPrice(parseFloat(e.target.value))} className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl px-6 py-4 text-white font-mono font-bold outline-none" />
                                {currentPrice && (
                                    <div className="flex items-center gap-3 text-[10px] font-mono">
                                        <span className="text-green-400">BID {bidPrice.toFixed(instrumentDetails?.displayPrecision || 5)}</span>
                                        <span className="text-neutral-600">|</span>
                                        <span className="text-red-400">ASK {askPrice.toFixed(instrumentDetails?.displayPrecision || 5)}</span>
                                        <span className="text-neutral-600">|</span>
                                        <span className={`${liveSpread > 2 ? 'text-orange-400' : 'text-neutral-400'}`}>{liveSpread.toFixed(1)} pip spread</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stop Loss & Take Profit */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Stop Loss</label>
                                <input type="number" step="0.00001" value={stopLoss || ''} onChange={(e) => setStopLoss(parseFloat(e.target.value))} className="w-full bg-neutral-800 border border-red-500/30 rounded-2xl px-6 py-4 text-white font-mono font-bold outline-none" />
                                {stopLoss > 0 && activeEntryPrice > 0 && (
                                    <p className="text-[10px] text-red-400 font-mono">
                                        Risk: -${riskAmount.toFixed(2)} ({riskPips.toFixed(1)} pips)
                                    </p>
                                )}
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Take Profit</label>
                                <input type="number" step="0.00001" value={takeProfit || ''} onChange={(e) => setTakeProfit(parseFloat(e.target.value))} className="w-full bg-neutral-800 border border-green-500/30 rounded-2xl px-6 py-4 text-white font-mono font-bold outline-none" />
                                {takeProfit > 0 && activeEntryPrice > 0 && (
                                    <p className="text-[10px] text-green-400 font-mono">
                                        Reward: +${(Math.abs(takeProfit - activeEntryPrice) * units).toFixed(2)} ({rewardPips.toFixed(1)} pips) &middot; R:R {rrRatio}
                                    </p>
                                )}
                            </div>

                            <div className="md:col-span-2 space-y-4 pt-4 border-t border-neutral-800">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Strategy Explanation</label>
                                <textarea
                                    value={strategyExplanation}
                                    onChange={(e) => setStrategyExplanation(e.target.value)}
                                    placeholder="Explain your execution details, strategy, and indicators..."
                                    className="w-full h-40 bg-neutral-800 border border-neutral-700 rounded-2xl px-6 py-4 text-white text-sm outline-none resize-none placeholder:text-neutral-700 focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar (1/3) */}
                <div className="space-y-8">
                    {/* Market Context */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-8 space-y-6">
                        <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={14} className="text-blue-400" />
                            Market Context
                        </h4>

                        {/* Market Sentiment */}
                        {marketSentiment && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-neutral-400">Macro Sentiment</span>
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                                        marketSentiment.overall === 'risk_on' ? 'bg-emerald-500/10 text-emerald-400' :
                                        marketSentiment.overall === 'risk_off' ? 'bg-rose-500/10 text-rose-400' :
                                        'bg-neutral-800 text-neutral-400'
                                    }`}>
                                        {marketSentiment.overall === 'risk_on' && <TrendingUp size={12} />}
                                        {marketSentiment.overall === 'risk_off' && <TrendingDown size={12} />}
                                        <span className="text-[10px] font-black uppercase">{marketSentiment.overall.replace('_', '-')}</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-neutral-500 leading-relaxed">
                                    {marketSentiment.summary}
                                </p>
                            </div>
                        )}

                        {/* Active Sessions */}
                        <div className="space-y-2 pt-4 border-t border-neutral-800">
                            <span className="text-xs text-neutral-400">Active Sessions</span>
                            <div className="space-y-2">
                                {marketSnapshot.sessions
                                    .filter(s => s.status === 'open' || s.status === 'closing_soon')
                                    .map((session, i) => (
                                        <div key={i} className="flex items-center justify-between bg-neutral-950/50 rounded-lg px-3 py-2">
                                            <span className="text-xs font-bold text-white">{session.name}</span>
                                            <span className="text-[9px] text-emerald-400 font-black uppercase">Live</span>
                                        </div>
                                    ))
                                }
                                {!marketSnapshot.sessions.some(s => s.status === 'open' || s.status === 'closing_soon') && (
                                    <div className="text-center py-3 bg-neutral-950/50 rounded-lg">
                                        <span className="text-[10px] text-neutral-600 font-medium">No active sessions</span>
                                    </div>
                                )}
                            </div>
                            {marketSnapshot.currentOverlap && (
                                <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/10 px-3 py-2 rounded-lg mt-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <p className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                                        {marketSnapshot.currentOverlap} Overlap
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Liquidity Phase */}
                        <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
                            <span className="text-xs text-neutral-400">Liquidity Phase</span>
                            <span className={`text-xs font-bold ${
                                marketSnapshot.marketPhase === 'high_liquidity' ? 'text-green-400' :
                                marketSnapshot.marketPhase === 'moderate' ? 'text-yellow-400' :
                                'text-orange-400'
                            }`}>
                                {marketSnapshot.marketPhase.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>
                    </div>

                    {/* Pip Value Calculator */}
                    <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-[2.5rem] p-8 space-y-6">
                        <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                            <Target size={14} className="text-blue-400" />
                            Pip Value Calculator
                        </h4>

                        <div className="space-y-4">
                            {/* Current Position Pip Value */}
                            <div className="bg-neutral-900/50 border border-blue-500/20 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs text-neutral-400">Your Position ({units.toLocaleString()} units)</span>
                                    <span className="text-[9px] px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded font-bold uppercase">Active</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-black text-white">
                                        ${((Math.abs(activeEntryPrice - (activeEntryPrice + Math.pow(10, pipLocation))) * units)).toFixed(2)}
                                    </span>
                                    <span className="text-sm text-neutral-500">per pip</span>
                                </div>
                                <div className="mt-3 pt-3 border-t border-neutral-800/50">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-neutral-500">10 pips move =</span>
                                        <span className="font-mono font-bold text-emerald-400">
                                            ${(Math.abs(activeEntryPrice - (activeEntryPrice + Math.pow(10, pipLocation))) * units * 10).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-neutral-500">50 pips move =</span>
                                        <span className="font-mono font-bold text-blue-400">
                                            ${(Math.abs(activeEntryPrice - (activeEntryPrice + Math.pow(10, pipLocation))) * units * 50).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-neutral-500">100 pips move =</span>
                                        <span className="font-mono font-bold text-purple-400">
                                            ${(Math.abs(activeEntryPrice - (activeEntryPrice + Math.pow(10, pipLocation))) * units * 100).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Standard Lot Sizes Reference */}
                            <div className="space-y-2">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Reference: Standard Lot Sizes</p>
                                <div className="space-y-1.5">
                                    {[
                                        { name: 'Micro', units: 1000, color: 'text-green-400' },
                                        { name: 'Mini', units: 10000, color: 'text-blue-400' },
                                        { name: 'Standard', units: 100000, color: 'text-purple-400' }
                                    ].map(lot => {
                                        const pipValue = Math.abs(activeEntryPrice - (activeEntryPrice + Math.pow(10, pipLocation))) * lot.units
                                        return (
                                            <div key={lot.name} className="flex items-center justify-between bg-neutral-900/30 rounded-xl px-3 py-2 border border-neutral-800/50">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-neutral-400">{lot.name}</span>
                                                    <span className="text-[9px] text-neutral-600 font-mono">({lot.units.toLocaleString()})</span>
                                                </div>
                                                <span className={`text-xs font-mono font-bold ${lot.color}`}>
                                                    ${pipValue.toFixed(2)}/pip
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3">
                                <p className="text-[9px] text-blue-400/70 leading-relaxed">
                                    💡 Each pip movement in your {direction} position at {units.toLocaleString()} units equals ${((Math.abs(activeEntryPrice - (activeEntryPrice + Math.pow(10, pipLocation))) * units)).toFixed(2)} profit or loss.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Trade Risk Gauge */}
                    {(stopLoss > 0 && takeProfit > 0) && (
                        <TradeRiskGauge 
                            riskPercent={riskPercent}
                            rrRatio={parseFloat(rrRatio)}
                            passedValidation={validation?.passed ?? true}
                        />
                    )}

                    <div className="bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-8 space-y-6">
                        <div className="space-y-4 pb-4 border-b border-neutral-800">
                            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                                <Zap size={14} className="text-yellow-400" />
                                Live Pre-Trade Analytics
                            </h4>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-neutral-400">Current Spread</span>
                                    <span className={`font-mono font-bold ${liveSpread > 2 ? 'text-orange-400' : 'text-green-400'}`}>
                                        {liveSpread.toFixed(1)} Pips
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-neutral-400">Margin Requirement</span>
                                    <span className="font-mono font-bold text-white">
                                        ${marginRequired.toFixed(2)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-neutral-400">Estimated Daily Swap</span>
                                    <span className={`font-mono font-bold ${dailySwap < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        ${Math.abs(dailySwap).toFixed(4)} {dailySwap < 0 ? '(Debit)' : '(Credit)'}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-[10px] pt-1">
                                    <span className="text-neutral-500 italic">
                                        Phase: {marketSnapshot.marketPhase === 'low_liquidity' ? 'Low Liquidity (Wider Spreads)' : 'High Liquidity'}
                                    </span>
                                    {marketSnapshot.marketPhase === 'low_liquidity' && (
                                        <AlertCircle size={10} className="text-orange-500" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {marginRequired > parseFloat(accountInfo?.balance || '0') && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                                <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={16} />
                                <div>
                                    <p className="text-sm font-bold text-red-400">Insufficient Margin Capital</p>
                                    <p className="text-xs text-red-300">Requires <span className="font-mono">${marginRequired.toFixed(2)}</span> vs Balance <span className="font-mono">${parseFloat(accountInfo?.balance || '0').toFixed(2)} CAD</span>.</p>
                                </div>
                            </div>
                        )}

                        {stopLoss > 0 && riskPercent > 2 && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
                                <AlertCircle className="text-amber-400 mt-0.5 flex-shrink-0" size={16} />
                                <div>
                                    <p className="text-sm font-bold text-amber-400">High Risk Threshold</p>
                                    <p className="text-xs text-amber-300">Risk <span className="font-mono font-bold">${riskAmount.toFixed(2)} CAD</span> is above 2% of capital.</p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center px-2">
                            <span className="text-[10px] font-bold text-neutral-500 uppercase">Risk Percent</span>
                            <span className={`font-bold ${riskPercent > 2 ? 'text-red-400' : 'text-blue-400'}`}>{riskPercent.toFixed(2)}%</span>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handlePlanTrade}
                                disabled={!stopLoss || isPlanning}
                                className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${stopLoss ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/30' : 'bg-neutral-800 text-neutral-600'}`}
                            >
                                {isPlanning ? <Loader2 size={16} className="animate-spin" /> : <Bookmark size={16} />}
                                {isPlanning ? 'Saving...' : 'Save to Journal'}
                            </button>
                            <button
                                onClick={handleDeskReview}
                                disabled={!stopLoss || !takeProfit || isReviewing}
                                className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${stopLoss && takeProfit ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'bg-neutral-800 text-neutral-600'}`}
                            >
                                {isReviewing ? <><Loader2 size={16} className="animate-spin" /> Desk Review...</> : <>
                                    <ShieldCheck size={16} />
                                    Execute Order
                                </>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Plan Trade Success Banner */}
            {planResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm" onClick={() => setPlanResult(null)} />
                    <div className="relative bg-neutral-900 border border-amber-500/30 rounded-[3rem] p-10 max-w-lg w-full shadow-2xl space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                                <Bookmark className="text-amber-400" size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Trade Saved to Journal</h3>
                                <p className="text-sm text-neutral-400">Ready to execute when you decide</p>
                            </div>
                        </div>
                        <div className="bg-neutral-800 rounded-2xl p-5 space-y-2">
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Pair</span><span className="font-bold">{selectedInstrument.replace('_', '/')}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Direction</span><span className={`font-bold ${direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>{direction.toUpperCase()}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Status</span><span className="font-bold text-amber-400">Planned — Ready to Execute</span></div>
                        </div>
                        <div className="flex gap-3">
                            <Link
                                href={`/journal/${planResult.tradeId}`}
                                className="flex-1 py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                <ExternalLink size={16} />
                                View in Journal
                            </Link>
                        </div>
                        <button
                            onClick={() => setPlanResult(null)}
                            className="w-full py-3 text-neutral-500 hover:text-neutral-300 text-sm font-medium transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {deskReview && !showConfirm && (() => {
                const marcus = deskReview.marcus_directive as TradeReviewOutput['marcus_directive'] | null
                const sarah = deskReview.sarah_report as TradeReviewOutput['sarah_report'] | null
                const ray = deskReview.ray_analysis as TradeReviewOutput['ray_analysis'] | null
                const alex = deskReview.alex_brief as TradeReviewOutput['alex_brief'] | null
                const verdict = marcus?.final_verdict || 'approved'
                const isBlocked = verdict === 'blocked'

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm" onClick={() => setDeskReview(null)} />
                        <div className="relative bg-neutral-900 border border-neutral-800 rounded-[3rem] p-8 max-w-2xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-white">Desk Review</h3>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                                    isBlocked ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                    verdict === 'approved_with_concerns' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}>
                                    {verdict.replace(/_/g, ' ')}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Ray */}
                                {ray && (
                                    <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-neutral-900/50 text-blue-400 flex items-center justify-center text-[10px] font-black border border-blue-500/20">R</div>
                                            <div>
                                                <p className="text-xs font-bold text-blue-400">Ray</p>
                                                <p className="text-[9px] text-neutral-600">Quant Analyst</p>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-neutral-300 leading-relaxed">{ray.message}</p>
                                        {'confluence_score' in ray && (
                                            <p className="text-[9px] text-blue-400/70 font-mono">Confluence: {(ray as TradeReviewOutput['ray_analysis']).confluence_score}/10</p>
                                        )}
                                    </div>
                                )}

                                {/* Sarah */}
                                {sarah && (
                                    <div className={`p-4 rounded-2xl border space-y-2 ${sarah.blocks?.length ? 'border-red-500/30 bg-red-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-neutral-900/50 text-rose-400 flex items-center justify-center text-[10px] font-black border border-rose-500/20">S</div>
                                            <div>
                                                <p className="text-xs font-bold text-rose-400">Sarah</p>
                                                <p className="text-[9px] text-neutral-600">Risk Desk</p>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-neutral-300 leading-relaxed">{sarah.message}</p>
                                        {sarah.blocks && sarah.blocks.length > 0 && (
                                            <div className="space-y-1">
                                                {sarah.blocks.map((block, i) => (
                                                    <p key={i} className="text-[10px] text-red-400 flex items-center gap-1">
                                                        <XCircle size={10} /> {block}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Alex */}
                                {alex && (
                                    <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-neutral-900/50 text-emerald-400 flex items-center justify-center text-[10px] font-black border border-emerald-500/20">A</div>
                                            <div>
                                                <p className="text-xs font-bold text-emerald-400">Alex</p>
                                                <p className="text-[9px] text-neutral-600">Macro Strategist</p>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-neutral-300 leading-relaxed">{alex.message}</p>
                                        {'macro_alignment' in alex && (
                                            <p className={`text-[9px] font-mono ${
                                                (alex as TradeReviewOutput['alex_brief']).macro_alignment === 'aligned' ? 'text-emerald-400/70' :
                                                (alex as TradeReviewOutput['alex_brief']).macro_alignment === 'conflicting' ? 'text-red-400/70' :
                                                'text-neutral-500'
                                            }`}>
                                                Macro: {(alex as TradeReviewOutput['alex_brief']).macro_alignment}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Marcus */}
                                {marcus && (
                                    <div className={`p-4 rounded-2xl border space-y-2 ${isBlocked ? 'border-red-500/30 bg-red-500/5' : 'border-purple-500/20 bg-purple-500/5'}`}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-neutral-900/50 text-purple-400 flex items-center justify-center text-[10px] font-black border border-purple-500/20">M</div>
                                            <div>
                                                <p className="text-xs font-bold text-purple-400">Marcus</p>
                                                <p className="text-[9px] text-neutral-600">Portfolio Manager</p>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-neutral-300 leading-relaxed">{marcus.message}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setDeskReview(null)}
                                    className="flex-1 py-4 bg-neutral-800 text-white font-bold rounded-2xl text-sm transition-all hover:bg-neutral-700"
                                >
                                    {isBlocked ? 'Adjust Trade' : 'Go Back'}
                                </button>
                                {!isBlocked && (
                                    <button
                                        onClick={() => { setDeskReview(null); setShowConfirm(true) }}
                                        className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl text-sm transition-all shadow-xl shadow-blue-500/20 hover:bg-blue-500"
                                    >
                                        Proceed to Execute
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })()}

            {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
                    <div className="relative bg-neutral-900 border border-neutral-800 rounded-[3rem] p-10 max-w-lg w-full shadow-2xl space-y-8">
                        <h3 className="text-2xl font-bold text-premium-white">Confirm Order</h3>
                        <div className="bg-neutral-800 rounded-3xl p-6 space-y-3">
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Instrument</span><span className="font-bold">{selectedInstrument.replace('_', '/')}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Direction</span><span className={`font-bold ${direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>{direction.toUpperCase()}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Size</span><span className="font-bold">{(units / 100000).toFixed(2)} lots ({units.toLocaleString()} units)</span></div>
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Price</span><span className="font-bold font-mono">{activeEntryPrice}</span></div>
                            <div className="border-t border-neutral-700 my-2" />
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Stop Loss</span><span className="font-bold font-mono text-red-400">{stopLoss || 'None'}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Take Profit</span><span className="font-bold font-mono text-green-400">{takeProfit || 'None'}</span></div>
                            {stopLoss > 0 && (
                                <>
                                    <div className="border-t border-neutral-700 my-2" />
                                    <div className="flex justify-between text-sm"><span className="text-neutral-400">Risk</span><span className="font-bold text-red-400">-${riskAmount.toFixed(2)} ({riskPips.toFixed(1)} pips)</span></div>
                                    {takeProfit > 0 && (
                                        <>
                                            <div className="flex justify-between text-sm"><span className="text-neutral-400">Reward</span><span className="font-bold text-green-400">+${(Math.abs(takeProfit - activeEntryPrice) * units).toFixed(2)} ({rewardPips.toFixed(1)} pips)</span></div>
                                            <div className="flex justify-between text-sm"><span className="text-neutral-400">R:R Ratio</span><span className="font-bold text-blue-400">1:{rrRatio}</span></div>
                                        </>
                                    )}
                                    <div className="flex justify-between text-sm"><span className="text-neutral-400">Risk %</span><span className={`font-bold ${riskPercent > 2 ? 'text-red-400' : 'text-blue-400'}`}>{riskPercent.toFixed(2)}%</span></div>
                                </>
                            )}
                        </div>
                        <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value.toUpperCase())} placeholder="TYPE 'CONFIRM'" className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-6 py-4 text-center font-bold text-white focus:border-blue-500 outline-none" />
                        <div className="flex gap-4">
                            <button onClick={() => setShowConfirm(false)} className="flex-1 py-4 bg-neutral-800 text-white font-bold rounded-2xl">Cancel</button>
                            <button onClick={handleExecute} disabled={confirmText !== 'CONFIRM'} className={`flex-1 py-4 rounded-2xl font-bold ${confirmText === 'CONFIRM' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-600'}`}>{isExecuting ? 'Executing...' : 'EXECUTE'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
