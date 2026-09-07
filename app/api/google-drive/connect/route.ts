import { NextResponse } from 'next/server'
import { authorizeUrl, createOAuthState, googleDriveConfig, writeOAuthState } from '@/lib/google-drive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const config = googleDriveConfig()
  if (!config) return NextResponse.json({ error: 'Google Drive 尚未完成伺服器設定' }, { status: 503 })
  const state = createOAuthState()
  const response = NextResponse.redirect(authorizeUrl(config, state))
  writeOAuthState(response, state)
  return response
}
