import { generateText } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 30

const SYSTEM_PROMPT = `你是一位資深香港建造業機電工程 (M&E) 合約專家，專責撰寫地盤公函 (Site Memo)。
使用者會提供口語、粗略的巡查要點，請將其潤色為正式、專業的香港工程合約行話。

要求：
- 使用繁體中文（香港用語），保留必要的英文工程術語（如 Block、VG、EOT）。
- 每一項工項獨立一行，並以「- 」作為前綴。
- 語氣客觀、正式，聚焦阻礙、影響及責任，適合呈交予總承建商 (Main Contractor)。
- 不要加入標題、編號、解釋或額外評論，只輸出潤色後的工項列表。
- 保持與輸入相同的項目數量，不要合併或拆分。`

export async function POST(request: Request) {
  try {
    const { roughInput } = await request.json()
    if (typeof roughInput !== 'string' || !roughInput.trim()) {
      return Response.json({ error: '缺少輸入內容' }, { status: 400 })
    }

    const { text } = await generateText({
      model: 'google/gemini-2.5-flash',
      system: SYSTEM_PROMPT,
      prompt: `請潤色以下巡查要點：\n\n${roughInput.trim()}`,
    })

    const items = text
      .split('\n')
      .map(line => line.replace(/^[-•\d.、\s]+/, '').trim())
      .filter(Boolean)

    return Response.json({ items })
  } catch (error) {
    console.error('[v0] memo-polish error:', error)
    return Response.json({ error: 'AI 潤色失敗，請稍後再試' }, { status: 500 })
  }
}
