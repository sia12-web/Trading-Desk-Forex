import { GoogleGenAI } from '@google/genai'
import { logAIUsage } from '../usage-logger'
import type { UsageContext } from './claude'

let _client: GoogleGenAI | null = null
function getClient() {
    if (!_client) {
        _client = new GoogleGenAI({ 
            apiKey: process.env.GEMINI_API_KEY!,
            apiVersion: 'v1beta' // Using v1beta for access to Gemini 2.5+ models in 2026
        })
    }
    return _client
}

interface GeminiOptions {
    timeout?: number
    maxTokens?: number
    model?: string
    usage?: UsageContext
}

/**
 * Call Gemini API — used as the "Pattern Archaeologist" for structural analysis.
 * Primary model: gemini-2.5-flash (reliable with JSON mode).
 */
export async function callGemini(
    prompt: string,
    options: GeminiOptions = {}
): Promise<string> {
    const {
        timeout = 90_000,
        maxTokens = 8192,
        model = process.env.GEMINI_MODEL || 'gemini-2.5-flash', // Using env override or latest stable v2.5 baseline
        usage,
    } = options

    const promptPreview = prompt.slice(0, 80).replace(/\n/g, ' ')
    console.log(`[AI] GEMINI (Pattern Archaeologist) | model=${model} | maxTokens=${maxTokens} | timeout=${timeout}ms | prompt="${promptPreview}..."`)

    const start = Date.now()
    const maxRetries = 5
    let attempt = 0

    while (attempt <= maxRetries) {
        attempt++
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeout)

        try {
            const response = await getClient().models.generateContent({
                model,
                contents: prompt,
                config: {
                    maxOutputTokens: maxTokens,
                },
            })

            const elapsed = Date.now() - start
            const text = response.text
            if (!text) {
                throw new Error('Gemini returned empty response')
            }

            // Gemini SDK provides usageMetadata
            const usageMeta = response.usageMetadata
            const inputTokens = usageMeta?.promptTokenCount ?? 0
            const outputTokens = usageMeta?.candidatesTokenCount ?? 0
            console.log(`[AI] GEMINI DONE | ${elapsed}ms | attempt=${attempt} | input=${inputTokens} output=${outputTokens} | ${text.length} chars`)

            if (usage) {
                logAIUsage({
                    userId: usage.userId,
                    provider: 'google',
                    model,
                    feature: usage.feature,
                    inputTokens,
                    outputTokens,
                    durationMs: elapsed,
                    success: true,
                })
            }

            clearTimeout(timer)
            return text
        } catch (error: any) {
            clearTimeout(timer)
            const elapsed = Date.now() - start
            
            // Extract error info from SDK or response
            const status = error?.status || error?.error?.code || 0
            const messageStr = error?.message || error?.error?.message || ''
            
            // 502 (Bad Gateway), 503 (Service Unavailable), 429 (Rate Limit), 529 (Overloaded)
            const isRetryable = status === 502 || status === 503 || status === 429 || status === 529 || 
                               messageStr.toLowerCase().includes('bad gateway') || 
                               messageStr.toLowerCase().includes('overloaded') ||
                               messageStr.toLowerCase().includes('deadline exceeded')

            if (isRetryable && attempt <= maxRetries) {
                const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s, 16s, 32s
                console.warn(`[AI] GEMINI ${status} RECOVERABLE ERROR (attempt ${attempt}/${maxRetries+1}) | retrying in ${delay}ms... | ${messageStr.slice(0, 50)}`)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
            }

            console.error(`[AI] GEMINI FAILED after ${attempt} attempts | ${elapsed}ms | ${messageStr}`)

            if (usage) {
                logAIUsage({
                    userId: usage.userId,
                    provider: 'google',
                    model,
                    feature: usage.feature,
                    inputTokens: 0,
                    outputTokens: 0,
                    durationMs: elapsed,
                    success: false,
                    errorMessage: messageStr,
                })
            }

            throw error
        }
    }

    throw new Error('Gemini call failed after maximum retries')
}
