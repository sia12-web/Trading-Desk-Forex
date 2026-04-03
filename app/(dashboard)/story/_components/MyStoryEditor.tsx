'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Highlight } from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Placeholder } from '@tiptap/extension-placeholder'
import { 
    format, startOfWeek, addDays, subWeeks, addWeeks, 
    isSameDay, parseISO, startOfDay, endOfDay
} from 'date-fns'
import { 
    Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, 
    Type, Save, Loader2, Clock, Zap, Activity, Info,
    ChevronLeft, ChevronRight, Calendar, Camera, X, Plus,
    Maximize2, Trash2, Image as ImageIcon
} from 'lucide-react'

interface Screenshot {
    id: string
    storage_path: string
    label: string
    created_at: string
    publicUrl?: string
}

interface MyStoryEditorProps {
    pair: string
}

const TIMEFRAMES = [
    { label: 'MN', color: '#a855f7', name: 'Monthly' },
    { label: 'W1', color: '#3b82f6', name: 'Weekly' },
    { label: 'D1', color: '#10b981', name: 'Daily' },
    { label: 'H4', color: '#f59e0b', name: '4 Hours' },
    { label: 'H1', color: '#f43f5e', name: '1 Hour' },
]

const INDICATORS = ['EMA', 'SMA', 'Bollinger', 'Ichimoku', 'VWAP', 'Pivot Points', 'Supply/Demand']
const OSCILLATORS = ['RSI', 'MACD', 'Stochastic', 'ATR', 'CCI', 'ADX']

export function MyStoryEditor({ pair }: MyStoryEditorProps) {
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [initialLoading, setInitialLoading] = useState(true)
    const [entryId, setEntryId] = useState<string | null>(null)
    const [screenshots, setScreenshots] = useState<Screenshot[]>([])
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Calculate trading week (Monday based)
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
    const tradingDays = [0, 1, 2, 3, 4].map(d => addDays(weekStart, d))

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            Placeholder.configure({
                placeholder: `Record your ${pair} analysis for this session...`,
            }),
        ],
        editorProps: {
            attributes: {
                class: 'prose prose-invert max-w-none min-h-[400px] focus:outline-none p-6 text-sm',
            },
        },
    })

    // Load content and screenshots for the selected date
    const loadEntry = useCallback(async () => {
        if (!editor) return
        setInitialLoading(true)
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd')
            const res = await fetch(`/api/story/my-story?pair=${encodeURIComponent(pair)}&date=${dateStr}`)
            const data = await res.json()
            
            setEntryId(data.entryId || null)
            setScreenshots(data.screenshots || [])
            editor.commands.setContent(data.content || '')
        } catch (err) {
            console.error('Failed to load entry:', err)
        } finally {
            setInitialLoading(false)
        }
    }, [pair, selectedDate, editor])

    useEffect(() => {
        loadEntry()
    }, [loadEntry])

    const saveContent = useCallback(async () => {
        if (!editor || saving) return
        setSaving(true)
        try {
            const content = editor.getHTML()
            const dateStr = format(selectedDate, 'yyyy-MM-dd')
            const res = await fetch('/api/story/my-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pair, content, date: dateStr }),
            })
            const data = await res.json()
            if (data.entryId) setEntryId(data.entryId)
            setLastSaved(new Date())
        } catch (err) {
            console.error('Failed to save entry:', err)
        } finally {
            setSaving(false)
        }
    }, [editor, pair, selectedDate, saving])

    // Auto-save logic
    useEffect(() => {
        if (!editor) return
        const handleUpdate = () => {
            const timeoutId = (editor as any)._saveTimeout
            if (timeoutId) clearTimeout(timeoutId)
            ;(editor as any)._saveTimeout = setTimeout(() => saveContent(), 3000)
        }
        editor.on('update', handleUpdate)
        return () => {
            editor.off('update', handleUpdate)
            clearTimeout((editor as any)._saveTimeout)
        }
    }, [editor, saveContent])

    // Screenshot Handling
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !entryId) return

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('entryId', entryId)
        formData.append('label', `Screenshot ${screenshots.length + 1}`)

        try {
            const res = await fetch('/api/story/my-story/screenshots', {
                method: 'POST',
                body: formData
            })
            const data = await res.json()
            if (data.success) {
                setScreenshots(prev => [...prev, data.screenshot])
            }
        } catch (err) {
            console.error('Upload failed:', err)
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const deleteScreenshot = async (id: string) => {
        if (!confirm('Are you sure you want to delete this screenshot?')) return
        try {
            await fetch(`/api/story/my-story/screenshots?id=${id}`, { method: 'DELETE' })
            setScreenshots(prev => prev.filter(s => s.id !== id))
        } catch (err) {
            console.error('Delete failed:', err)
        }
    }

    const insertLabel = (text: string, color: string) => {
        editor?.chain().focus().insertContent(`<span style="background-color: ${color}33; color: ${color}; padding: 1px 6px; border-radius: 4px; font-weight: 800; font-size: 10px; margin: 0 2px; border: 1px solid ${color}44;">${text}</span> `).run()
    }

    if (initialLoading && !editor) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-neutral-900/20 border border-neutral-800 rounded-2xl">
                <Loader2 size={24} className="animate-spin text-neutral-600 mb-4" />
                <p className="text-xs font-black text-neutral-500 uppercase tracking-widest">Entering Private Archive...</p>
            </div>
        )
    }

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-full max-h-[900px]">
            {/* Header / Week Navigation */}
            <div className="bg-neutral-950/80 border-b border-neutral-800 p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
                            <button 
                                onClick={() => setSelectedDate(subWeeks(selectedDate, 1))}
                                className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-white transition-all"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <div className="px-3 flex items-center gap-2">
                                <Calendar size={14} className="text-orange-500" />
                                <span className="text-[11px] font-black uppercase tracking-widest text-neutral-100">
                                    {format(weekStart, 'MMM dd')} - {format(addDays(weekStart, 4), 'MMM dd, yyyy')}
                                </span>
                            </div>
                            <button 
                                onClick={() => setSelectedDate(addWeeks(selectedDate, 1))}
                                className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-white transition-all"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {lastSaved && (
                            <span className="text-[10px] text-neutral-600 font-mono italic">
                                Sync: {format(lastSaved, 'HH:mm:ss')}
                            </span>
                        )}
                        <button 
                            onClick={saveContent}
                            disabled={saving}
                            className={`p-2 rounded-xl border transition-all ${
                                saving ? 'bg-orange-500/10 border-orange-500/50 text-orange-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                            }`}
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        </button>
                    </div>
                </div>

                {/* Day Selector */}
                <div className="flex items-center gap-2">
                    {tradingDays.map((day) => {
                        const isSelected = isSameDay(day, selectedDate)
                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => setSelectedDate(day)}
                                className={`flex-1 py-2.5 rounded-xl border transition-all relative group ${
                                    isSelected 
                                        ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20' 
                                        : 'bg-neutral-900/50 border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300'
                                }`}
                            >
                                <div className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{format(day, 'EEE')}</div>
                                <div className="text-xs font-bold leading-none">{format(day, 'dd')}</div>
                                {isSelected && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Toolbar */}
            <div className="border-b border-neutral-800 p-3 bg-neutral-950/30 flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-neutral-900/50 p-1 rounded-lg border border-neutral-800">
                        <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`p-1.5 rounded ${editor?.isActive('bold') ? 'bg-orange-500/20 text-orange-400' : 'text-neutral-500 hover:text-white'}`}><Bold size={14} /></button>
                        <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`p-1.5 rounded ${editor?.isActive('italic') ? 'bg-orange-500/20 text-orange-400' : 'text-neutral-500 hover:text-white'}`}><Italic size={14} /></button>
                    </div>
                    
                    <div className="h-6 w-px bg-neutral-800 mx-1" />

                    <div className="flex items-center gap-1.5">
                        {TIMEFRAMES.map(tf => (
                            <button 
                                key={tf.label}
                                onClick={() => insertLabel(tf.label, tf.color)}
                                className="px-2 py-1 text-[9px] font-black rounded-md transition-all hover:scale-105 active:scale-95 border"
                                style={{ backgroundColor: `${tf.color}15`, color: tf.color, borderColor: `${tf.color}30` }}
                            >
                                {tf.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <select 
                        className="bg-neutral-900 text-[9px] font-black text-neutral-400 border border-neutral-800 rounded px-2 py-1.5 uppercase tracking-widest focus:outline-none"
                        onChange={(e) => {
                            if (e.target.value) {
                                insertLabel(e.target.value, '#06b6d4')
                                e.target.value = ''
                            }
                        }}
                    >
                        <option value="">Indicators</option>
                        {INDICATORS.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Editor Section */}
                <div className="flex-1 overflow-y-auto bg-neutral-950/20 relative">
                    {initialLoading && (
                        <div className="absolute inset-0 bg-neutral-950/50 backdrop-blur-sm z-10 flex items-center justify-center">
                            <Loader2 size={24} className="animate-spin text-orange-500" />
                        </div>
                    )}
                    <EditorContent editor={editor} />
                </div>

                {/* Screenshot Sidebar */}
                <div className="w-72 bg-neutral-950/50 border-l border-neutral-800 flex flex-col">
                    <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Camera size={14} className="text-neutral-500" />
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Screenshots</h3>
                        </div>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!entryId || uploading}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300 disabled:opacity-30 transition-all"
                        >
                            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileUpload} 
                            className="hidden" 
                            accept="image/*" 
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {!entryId && (
                            <div className="h-full flex flex-col items-center justify-center text-center px-4">
                                <ImageIcon size={24} className="text-neutral-800 mb-2" />
                                <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-tighter">Write something first to enable uploads</p>
                            </div>
                        )}
                        
                        {screenshots.map(screen => (
                            <div key={screen.id} className="group relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden aspect-video shadow-lg">
                                <img 
                                    src={`https://mrtpwyuobofpizmqivkd.supabase.co/storage/v1/object/public/story-screenshots/${screen.storage_path}`} 
                                    alt={screen.label}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button 
                                        onClick={() => deleteScreenshot(screen.id)}
                                        className="p-2 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                                    <p className="text-[9px] font-bold text-neutral-300 truncate">{screen.label}</p>
                                </div>
                            </div>
                        ))}

                        {screenshots.length === 0 && entryId && (
                            <div className="h-40 border-2 border-dashed border-neutral-800 rounded-2xl flex flex-col items-center justify-center text-neutral-600 hover:border-neutral-700 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <Plus size={20} className="mb-1" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Add First Visual</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer Status */}
            <div className="bg-orange-500/5 px-6 py-2 flex items-center justify-between border-t border-neutral-800">
                <div className="flex items-center gap-2">
                    <Info size={12} className="text-orange-500" />
                    <span className="text-[9px] font-black text-orange-500/70 uppercase tracking-widest">
                        Dated Entry: {format(selectedDate, 'PPP')}
                    </span>
                </div>
                <span className="text-[9px] font-black text-neutral-600 uppercase tracking-widest">
                    Private Trading Workspace • AES-256 Cloud Sync
                </span>
            </div>

            <style>{`
                .ProseMirror p.is-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: #525252;
                    pointer-events: none;
                    height: 0;
                }
                .prose strong { color: #f97316; }
                .prose h1, .prose h2, .prose h3 { color: #ffffff !important; margin-top: 1em; margin-bottom: 0.5em; }
                .prose ul, .prose ol { padding-left: 1.25em; margin-top: 0.5em; margin-bottom: 0.5em; }
                .prose li { margin-bottom: 0.25em; }
                .ProseMirror { outline: none !important; }
            `}</style>
        </div>
    )
}
