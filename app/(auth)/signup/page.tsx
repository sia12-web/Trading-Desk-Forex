'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        } else {
            setSuccess(true)
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-100 p-4">
                <div className="w-full max-w-md p-8 bg-neutral-900 rounded-2xl border border-neutral-800 text-center">
                    <h2 className="text-2xl font-bold mb-4 text-green-400">Check your email</h2>
                    <p className="text-neutral-400 mb-6">
                        We&apos;ve sent a confirmation link to <span className="text-neutral-200">{email}</span>.
                    </p>
                    <Link
                        href="/login"
                        className="inline-block py-3 px-6 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl transition-all"
                    >
                        Back to login
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-100">
            <div className="w-full max-w-md p-8 bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl relative overflow-hidden group">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="w-16 h-16 rounded-2xl bg-neutral-800/50 p-2 mb-6 mx-auto flex items-center justify-center border border-neutral-700/50 shadow-xl shadow-blue-500/10 transition-transform hover:rotate-3 hover:scale-110 duration-500 relative z-10">
                    <img src="/logo.png" alt="TradeDesk Forex Logo" className="w-full h-full object-contain rounded-xl" />
                </div>

                <h1 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent relative z-10">
                    Create Account
                </h1>
                <p className="text-neutral-400 text-center mb-8">Join TradeDesk Forex today</p>

                <form onSubmit={handleSignup} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <p className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-900/50">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating account...' : 'Sign Up'}
                    </button>
                </form>

                <p className="mt-8 text-center text-neutral-500">
                    Already have an account?{' '}
                    <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    )
}
