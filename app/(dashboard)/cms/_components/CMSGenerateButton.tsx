'use client'

import { Loader2, Sparkles } from 'lucide-react'

interface CMSGenerateButtonProps {
    onGenerate: () => void
    status: 'idle' | 'running' | 'completed' | 'failed'
    progress: number
    message: string | null
    error: string | null
    disabled?: boolean
}

export function CMSGenerateButton({
    onGenerate,
    status,
    progress,
    message,
    error,
    disabled,
}: CMSGenerateButtonProps) {
    const isRunning = status === 'running'

    return (
        <div className="space-y-2">
            <button
                onClick={onGenerate}
                disabled={disabled || isRunning}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isRunning
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30 cursor-wait'
                        : disabled
                            ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
                }`}
            >
                {isRunning ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : (
                    <Sparkles size={16} />
                )}
                {isRunning ? 'Generating...' : 'Generate Analysis'}
            </button>

            {/* Progress bar */}
            {isRunning && (
                <div className="space-y-1">
                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    {message && (
                        <p className="text-xs text-neutral-500">{message}</p>
                    )}
                </div>
            )}

            {/* Error */}
            {status === 'failed' && error && (
                <p className="text-xs text-red-400">{error}</p>
            )}
        </div>
    )
}
