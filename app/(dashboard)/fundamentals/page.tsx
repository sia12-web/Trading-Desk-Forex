'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp, Plus, Loader2, MessageSquare, Archive, Sparkles, Trash2 } from 'lucide-react'
import { PairSelector } from '../story/_components/PairSelector'

interface FundamentalSession {
    id: string
    pair: string
    title: string | null
    status: 'active' | 'archived'
    conclusion: string | null
    created_episode_id: string | null
    created_at: string
    updated_at: string
    messageCount?: number
}

export default function FundamentalsPage() {
    const router = useRouter()
    const [sessions, setSessions] = useState<FundamentalSession[]>([])
    const [loading, setLoading] = useState(true)
    const [showSelector, setShowSelector] = useState(false)
    const [creating, setCreating] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        if (!confirm('Are you sure you want to delete this session? All messages will be lost.')) return

        setDeletingId(sessionId)
        try {
            const res = await fetch(`/api/fundamentals/sessions/${sessionId}`, {
                method: 'DELETE',
            })
            if (!res.ok) throw new Error(await res.text())
            
            // Remove from local state
            setSessions(prev => prev.filter(s => s.id !== sessionId))
        } catch (err) {
            console.error('Failed to delete session:', err)
            alert('Failed to delete session')
        } finally {
            setDeletingId(null)
        }
    }

    const loadSessions = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/fundamentals/sessions?status=${activeTab}`)
            if (!res.ok) throw new Error(await res.text())

            const { sessions: loadedSessions } = await res.json()

            // Load message counts for each session
            const sessionsWithCounts = await Promise.all(
                (loadedSessions || []).map(async (session: FundamentalSession) => {
                    try {
                        const msgRes = await fetch(`/api/fundamentals/sessions/${session.id}`)
                        if (!msgRes.ok) return { ...session, messageCount: 0 }

                        const { messages } = await msgRes.json()
                        return { ...session, messageCount: messages?.length || 0 }
                    } catch {
                        return { ...session, messageCount: 0 }
                    }
                })
            )

            setSessions(sessionsWithCounts)
        } catch (err) {
            console.error('Failed to load sessions:', err)
        } finally {
            setLoading(false)
        }
    }, [activeTab])

    useEffect(() => { loadSessions() }, [loadSessions])

    const handleCreateSession = async (pair: string) => {
        setCreating(true)
        try {
            const res = await fetch('/api/fundamentals/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pair }),
            })

            if (!res.ok) throw new Error(await res.text())

            const { session } = await res.json()
            setShowSelector(false)

            // Navigate to session detail
            router.push(`/fundamentals/${session.id}`)
        } catch (err) {
            console.error('Failed to create session:', err)
            alert('Failed to create fundamental analysis session')
        } finally {
            setCreating(false)
        }
    }

    const formatDate = (date: string) => {
        const d = new Date(date)
        const now = new Date()
        const diffMs = now.getTime() - d.getTime()
        const diffMins = Math.floor(diffMs / 60_000)
        const diffHours = Math.floor(diffMs / 3_600_000)
        const diffDays = Math.floor(diffMs / 86_400_000)

        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`
        return d.toLocaleDateString()
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <TrendingUp size={32} className="text-blue-400" />
                        <h1 className="text-2xl font-bold text-white">Fundamental Analysis</h1>
                    </div>
                    <p className="text-sm text-neutral-400">
                        Discuss macro forces, central bank policy, and economic data with AI
                    </p>
                </div>
                <button
                    onClick={() => setShowSelector(true)}
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {creating ? (
                        <><Loader2 size={16} className="animate-spin" /> Creating...</>
                    ) : (
                        <><Plus size={16} /> New Analysis</>
                    )}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-neutral-800">
                <button
                    onClick={() => setActiveTab('active')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'active'
                            ? 'text-white border-blue-500'
                            : 'text-neutral-400 border-transparent hover:text-neutral-200'
                    }`}
                >
                    Active
                </button>
                <button
                    onClick={() => setActiveTab('archived')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === 'archived'
                            ? 'text-white border-blue-500'
                            : 'text-neutral-400 border-transparent hover:text-neutral-200'
                    }`}
                >
                    Archived
                </button>
            </div>

            {/* Sessions List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-neutral-500" />
                </div>
            ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <TrendingUp size={48} className="text-neutral-700 mb-4" />
                    <h3 className="text-lg font-semibold text-neutral-400 mb-2">
                        No {activeTab} analysis sessions
                    </h3>
                    <p className="text-sm text-neutral-500 mb-6 max-w-md">
                        Start a new fundamental analysis to explore macro forces, interest rate differentials,
                        and economic data with AI guidance
                    </p>
                    <button
                        onClick={() => setShowSelector(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        <Plus size={16} /> Start First Analysis
                    </button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => router.push(`/fundamentals/${session.id}`)}
                            className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 hover:bg-neutral-900/70 transition-all text-left cursor-pointer group relative"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className="text-lg font-bold text-blue-400">
                                        {session.pair}
                                    </div>
                                    {session.created_episode_id && (
                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 border border-green-700 rounded text-[10px] font-bold text-green-400 uppercase">
                                            <Sparkles size={10} />
                                            Episode Created
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                                        <MessageSquare size={12} />
                                        {session.messageCount || 0} messages
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteSession(e, session.id)}
                                        disabled={deletingId === session.id}
                                        className="p-1.5 text-neutral-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        {deletingId === session.id ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Trash2 size={14} />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {session.title && (
                                <div className="text-sm font-medium text-white mb-1">
                                    {session.title}
                                </div>
                            )}

                            {session.conclusion && (
                                <div className="text-xs text-neutral-400 line-clamp-2 mb-2">
                                    {session.conclusion}
                                </div>
                            )}

                            <div className="flex items-center gap-3 text-[10px] text-neutral-600">
                                <span>Updated {formatDate(session.updated_at)}</span>
                                {session.status === 'archived' && (
                                    <>
                                        <span>•</span>
                                        <div className="flex items-center gap-1">
                                            <Archive size={10} />
                                            Archived
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pair Selector Modal */}
            {showSelector && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full">
                        <h2 className="text-lg font-bold text-white mb-4">Start Fundamental Analysis</h2>
                        <p className="text-sm text-neutral-400 mb-4">
                            Select a currency pair to analyze macro forces and fundamentals
                        </p>
                        <PairSelector
                            subscribedPairs={[]}
                            onSubscribe={handleCreateSession}
                            onClose={() => setShowSelector(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
