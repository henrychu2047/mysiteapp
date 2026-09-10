import { NextResponse } from 'next/server'

const APP_DETAILS: Record<string, { name: string; shortName: string }> = {
  camera: { name: '相片記錄', shortName: '相片記錄' },
  'site-memo': { name: 'Site Memo', shortName: 'Site Memo' },
  handover: { name: '機房移交', shortName: '機房移交' },
  notebook: { name: '記事簿', shortName: '記事簿' },
  database: { name: '資料庫', shortName: '資料庫' },
  full: { name: '地盤相片記錄系統', shortName: '全功能版' },
}

export function GET(_request: Request, context: { params: Promise<{ appId: string }> }) {
  return context.params.then(({ appId }) => {
    const detail = APP_DETAILS[appId]
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const startUrl = appId === 'full' ? '/' : `/${appId}`
    return NextResponse.json({
      id: startUrl,
      name: detail.name,
      short_name: detail.shortName,
      lang: 'zh-Hant',
      start_url: startUrl,
      scope: '/',
      display: 'standalone',
      background_color: '#eef2f4',
      theme_color: '#15212b',
      description: '離線使用的地盤工程記錄工具',
      icons: [{ src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any maskable' }],
    })
  })
}
