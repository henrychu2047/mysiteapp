export const runtime = 'nodejs'
export const maxDuration = 30

const API_VERSION = 'memo-polish-2026-09-01-2'

const GEMINI_MODEL = 'gemini-2.5-flash'
const MAX_INPUT_CHARS = 12_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 10
const requestBuckets = new Map<string, { count: number; resetAt: number }>()

const SYSTEM_PROMPT = `你是一位資深香港建造業機電工程 (M&E) 合約專家，專責撰寫地盤公函 (Site Memo)。
使用者會提供口語、粗略的巡查要點，請將其潤色為正式、專業的香港工程合約行話。

要求：
- 使用繁體中文（香港用語），保留必要的英文工程術語（如 Block、VG、EOT）。
- 將輸入按因果關係重組成完整 Site Memo 正文，清楚交代事件、阻礙、影響及要求。
- 語氣客觀、正式，適合呈交予總承建商 (Main Contractor)。
- 只輸出可直接放入 Site Memo 的正文，不要標題、編號、解釋或 Markdown。
- 保留輸入中的日期、地點、設備名稱及待填入的括號欄位。`

function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, '').trim() || ''
}

function clientKey(request: Request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
}

function isRateLimited(request: Request) {
  const now = Date.now()
  const key = clientKey(request)
  const current = requestBuckets.get(key)
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    if (requestBuckets.size > 1_000) for (const [bucketKey, bucket] of requestBuckets) if (bucket.resetAt <= now) requestBuckets.delete(bucketKey)
    return false
  }
  current.count += 1
  return current.count > RATE_LIMIT_MAX_REQUESTS
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  try {
    const allowedOrigin = cleanEnv(process.env.MEMO_POLISH_ALLOWED_ORIGIN)
    if (allowedOrigin && request.headers.get('origin') !== allowedOrigin) return Response.json({ error: '不允許的請求來源' }, { status: 403 })
    if (isRateLimited(request)) return Response.json({ error: '請求過於頻繁，請稍後再試' }, { status: 429, headers: { 'Retry-After': '60' } })
    const { roughInput } = await request.json()
    if (typeof roughInput !== 'string' || !roughInput.trim()) {
      return Response.json({ error: '缺少輸入內容' }, { status: 400 })
    }
    if (roughInput.length > MAX_INPUT_CHARS) return Response.json({ error: `輸入內容不可超過 ${MAX_INPUT_CHARS.toLocaleString()} 個字元` }, { status: 413 })

    const prompt = `請潤色以下巡查要點：\n\n${roughInput.trim()}`
    let text = ''

    const firstConfigured = (...values: Array<string | undefined>) => values.map(cleanEnv).find(Boolean) || ''
    const apiKey = firstConfigured(process.env.AI_API_KEY, process.env.OPENAI_API_KEY, process.env.SHARES_AI_API_KEY)
    const baseUrl = (firstConfigured(process.env.AI_BASE_URL, process.env.OPENAI_BASE_URL) || (apiKey ? 'https://api.openai.com/v1' : '')).replace(/\/$/, '')
    const model = firstConfigured(process.env.AI_MODEL, process.env.OPENAI_MODEL) || 'gpt-4o-mini'

    if (baseUrl && apiKey) {
      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model: model.trim(),
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        }),
      })
      const raw = await response.text()
      let data: { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> } = {}
      try { data = JSON.parse(raw) } catch { /* Provider returned non-JSON text. */ }
      if (!response.ok) throw new Error(data.error?.message || `AI 服務錯誤（HTTP ${response.status}）`)
      text = data.choices?.[0]?.message?.content || ''
    } else if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
        },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Google AI request failed')
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else {
      const configuredNames = ['AI_API_KEY', 'OPENAI_API_KEY', 'SHARES_AI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']
        .filter(name => cleanEnv(process.env[name]))
      const detected = configuredNames.length ? `已讀到：${configuredNames.join('、')}，但未能建立 AI 連線。` : '完全沒有讀到任何 AI Key。'
      return Response.json({ error: `目前 Container 未讀到可用的 AI API Key（${API_VERSION}）。${detected} 請在 Portainer 的同一個 Container > Env 設定變數，然後 Redeploy／Recreate；不要只 Restart。` }, { status: 503 })
    }

    const polishedText = text.trim()
    if (!polishedText) return Response.json({ error: 'AI 沒有返回可用內容' }, { status: 502 })
    const items = polishedText.split(/\n+/).map(line => line.replace(/^[-•\d.、\s]+/, '').trim()).filter(Boolean)
    return Response.json({ text: polishedText, items: items.length ? items : [polishedText] })
  } catch (error) {
    console.error('[v0] memo-polish error:', error)
    return Response.json({ error: 'AI 潤色失敗，請稍後再試' }, { status: 500 })
  }
}
