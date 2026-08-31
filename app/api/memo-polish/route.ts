export const runtime = 'nodejs'
export const maxDuration = 30

const GEMINI_MODEL = 'gemini-2.5-flash'

const SYSTEM_PROMPT = `你是一位資深香港建造業機電工程 (M&E) 合約專家，專責撰寫地盤公函 (Site Memo)。
使用者會提供口語、粗略的巡查要點，請將其潤色為正式、專業的香港工程合約行話。

要求：
- 使用繁體中文（香港用語），保留必要的英文工程術語（如 Block、VG、EOT）。
- 將輸入按因果關係重組成完整 Site Memo 正文，清楚交代事件、阻礙、影響及要求。
- 語氣客觀、正式，適合呈交予總承建商 (Main Contractor)。
- 只輸出可直接放入 Site Memo 的正文，不要標題、編號、解釋或 Markdown。
- 保留輸入中的日期、地點、設備名稱及待填入的括號欄位。`

export async function POST(request: Request) {
  try {
    const { roughInput } = await request.json()
    if (typeof roughInput !== 'string' || !roughInput.trim()) {
      return Response.json({ error: '缺少輸入內容' }, { status: 400 })
    }

    const prompt = `請潤色以下巡查要點：\n\n${roughInput.trim()}`
    let text = ''

    const baseUrl = process.env.AI_BASE_URL?.replace(/\/$/, '')
    const apiKey = process.env.AI_API_KEY
    const model = process.env.AI_MODEL

    if (baseUrl && apiKey && model) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'AI request failed')
      text = data.choices?.[0]?.message?.content || ''
    } else if (process.env.AI_GATEWAY_API_KEY) {
      return Response.json({ error: '請改用 AI_BASE_URL、AI_API_KEY 及 AI_MODEL 設定' }, { status: 503 })
    } else if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      const response = await fetch(
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
      return Response.json({ error: '未設定完整 AI 連線資料，請加入 AI_BASE_URL、AI_API_KEY 及 AI_MODEL' }, { status: 503 })
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
