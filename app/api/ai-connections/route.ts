import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { callClaude } from '@/lib/ai/clients/claude'
import { callGemini } from '@/lib/ai/clients/gemini'
import { callDeepSeek } from '@/lib/ai/clients/deepseek'

interface ModelTest {
    name: string
    model: string
    role: string
    connected: boolean
    responseTime?: number
    error?: string
    version?: string
}

const TEST_PROMPT = 'Respond with exactly: "Connection successful"'

/**
 * Test all 3 AI model connections.
 * GET returns configuration + test results.
 */
export async function GET() {
    const user = await getAuthUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: ModelTest[] = []

    // Test Claude (Decision Architect)
    const claudeStart = Date.now()
    try {
        await callClaude(TEST_PROMPT, { timeout: 10_000, maxTokens: 100, model: 'claude-opus-4-6' })
        results.push({
            name: 'Claude',
            model: 'claude-opus-4-6',
            role: 'Decision Architect',
            connected: true,
            responseTime: Date.now() - claudeStart,
            version: 'Opus 4.6',
        })
    } catch (error) {
        results.push({
            name: 'Claude',
            model: 'claude-opus-4-6',
            role: 'Decision Architect',
            connected: false,
            error: error instanceof Error ? error.message : 'Connection failed',
        })
    }

    // Test Gemini (Pattern Archaeologist)
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    const geminiStart = Date.now()
    try {
        await callGemini(TEST_PROMPT, { timeout: 10_000, maxTokens: 100, model: geminiModel })
        results.push({
            name: 'Gemini',
            model: geminiModel,
            role: 'Pattern Archaeologist',
            connected: true,
            responseTime: Date.now() - geminiStart,
            version: '1.5 Flash',
        })
    } catch (error) {
        results.push({
            name: 'Gemini',
            model: geminiModel,
            role: 'Pattern Archaeologist',
            connected: false,
            error: error instanceof Error ? error.message : 'Connection failed',
        })
    }

    // Test DeepSeek (Quantitative Engine)
    const deepseekStart = Date.now()
    try {
        await callDeepSeek(TEST_PROMPT, { timeout: 10_000, maxTokens: 100, model: 'deepseek-chat' })
        results.push({
            name: 'DeepSeek',
            model: 'deepseek-chat',
            role: 'Quantitative Engine',
            connected: true,
            responseTime: Date.now() - deepseekStart,
            version: 'V3',
        })
    } catch (error) {
        results.push({
            name: 'DeepSeek',
            model: 'deepseek-chat',
            role: 'Quantitative Engine',
            connected: false,
            error: error instanceof Error ? error.message : 'Connection failed',
        })
    }

    const allConnected = results.every(r => r.connected)

    return NextResponse.json({
        connected: allConnected,
        models: results,
        config: {
            claude: {
                configured: !!process.env.ANTHROPIC_API_KEY,
                model: 'claude-opus-4-6',
            },
            gemini: {
                configured: !!process.env.GEMINI_API_KEY,
                model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            },
            deepseek: {
                configured: !!process.env.DEEPSEEK_API_KEY,
                model: 'deepseek-chat',
            },
        },
    })
}
