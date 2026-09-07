import { NextRequest, NextResponse } from 'next/server'
import { accessToken, clearOAuthState, ensureRootFolder, exchangeCode, googleDriveConfig, googleEmail, readOAuthState, writeDriveSession } from '@/lib/google-drive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redirect(config: NonNullable<ReturnType<typeof googleDriveConfig>>, result: string) {
  return NextResponse.redirect(`${config.appOrigin}/?googleDrive=${result}`)
}

export async function GET(request: NextRequest) {
  const config = googleDriveConfig()
  if (!config) return NextResponse.json({ error: 'Google Drive 尚未完成伺服器設定' }, { status: 503 })
  const code = request.nextUrl.searchParams.get('code') || ''
  const state = request.nextUrl.searchParams.get('state') || ''
  if (!code || !state || state !== readOAuthState(request)) {
    const response = redirect(config, 'failed')
    clearOAuthState(response)
    return response
  }
  try {
    const tokens = await exchangeCode(config, code)
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('Google 未返回可保存的授權資料，請重新連接')
    const email = await googleEmail(tokens.access_token)
    const root = await ensureRootFolder(tokens.access_token)
    const response = redirect(config, 'connected')
    clearOAuthState(response)
    writeDriveSession(response, { refreshToken: tokens.refresh_token, email, rootFolderId: root.id }, config)
    return response
  } catch (error) {
    console.error('Google Drive OAuth failed:', error)
    const response = redirect(config, 'failed')
    clearOAuthState(response)
    return response
  }
}
