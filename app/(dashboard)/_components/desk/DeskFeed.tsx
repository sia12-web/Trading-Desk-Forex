'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Sparkles, Coffee, Trash2 } from 'lucide-react'
import { useBackgroundTask } from '@/lib/hooks/use-background-task'
import { MessageBubble } from './MessageBubble'
import type { DeskMessage } from '@/lib/desk/types'

export function DeskFeed() {
    const [messages, setMessages] = useState<DeskMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [todayMeetingExists, setTodayMeetingExists] = useState(false)
    const feedRef = useRef<HTMLDivElement>(null)

    const {
        status: taskStatus,
        progress,
        message: taskMessage,
        startTask,
        reset,
    } = useBackgroundTask('desk_morning_meeting')

    // Fetch today's meeting on mount
    useEffect(() => {
        fetchTodayMeeting()
    }, [])

    // Refetch when task completes
    useEffect(() => {
        if (taskStatus === 'completed') {
            fetchTodayMeeting()
        }
    }, [taskStatus])

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight
        }
    }, [messages])

    async function fetchTodayMeeting() {
        try {
            setLoading(true)
            // First check if today's meeting exists
            const meetingRes = await fetch('/api/desk/meeting')
            const meetingData = await meetingRes.json()

            if (meetingData.meeting) {
                setTodayMeetingExists(true)
                // Fetch messages for this meeting
                const msgRes = await fetch(`/api/desk/messages?meeting_id=${meetingData.meeting.id}`)
                const msgData = await msgRes.json()
                setMessages(msgData.messages || [])
            } else {
                setTodayMeetingExists(false)
                // Fetch recent messages regardless
                const msgRes = await fetch('/api/desk/messages?limit=20')
                const msgData = await msgRes.json()
                setMessages(msgData.messages || [])
            }
        } catch (err) {
            console.error('Failed to fetch desk feed:', err)
        } finally {
            setLoading(false)
        }
    }

    async function handleGenerateMeeting() {
        reset()
        await startTask('/api/desk/meeting')
    }

    async function handleResetMemory() {
        if (!confirm('Are you sure you want to reset ALL AI memory? This will delete the current season, story bible, and desk history. This cannot be undone.')) {
            return
        }

        try {
            setLoading(true)
            const res = await fetch('/api/system/reset-memory', { method: 'POST' })
            const data = await res.json()
            if (data.success) {
                setMessages([])
                setTodayMeetingExists(false)
                alert('System memory reset successfully. You now have a blank canvas.')
            } else {
                alert('Failed to reset memory: ' + (data.error || 'Unknown error'))
            }
        } catch (err) {
            console.error('Reset memory failed:', err)
            alert('An error occurred during reset.')
        } finally {
            setLoading(false)
        }
    }

    const isGenerating = taskStatus === 'running'

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] shadow-2xl flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <h2 className="text-base font-black text-white uppercase tracking-wider">Desk Feed</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleResetMemory}
                        disabled={isGenerating || loading}
                        title="Reset All AI Memory"
                        className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={16} />
                    </button>
                    <button
                        onClick={handleGenerateMeeting}
                        disabled={isGenerating || loading}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all active:scale-95"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Generating...
                            </>
                        ) : todayMeetingExists ? (
                            <>
                                <Coffee size={14} />
                                New Session
                            </>
                        ) : (
                            <>
                                <Sparkles size={14} />
                                Morning Meeting
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Progress bar during generation */}
            {isGenerating && (
                <div className="px-5 pt-3">
                    <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-1.5 font-medium">{taskMessage || 'Assembling the desk...'}</p>
                </div>
            )}

            {/* Message feed */}
            <div
                ref={feedRef}
                className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-[300px] max-h-[500px] scrollbar-thin scrollbar-thumb-neutral-800"
            >
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 size={20} className="animate-spin text-neutral-600" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                        <Coffee size={32} className="text-neutral-700 mb-3" />
                        <p className="text-sm font-bold text-neutral-600">The desk is quiet</p>
                        <p className="text-xs text-neutral-700 mt-1">Generate a morning meeting to start the day.</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                    ))
                )}
            </div>
        </div>
    )
}
