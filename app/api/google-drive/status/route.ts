import { NextRequest, NextResponse } from 'next/server'
import { clearDriveSession, googleDriveConfig, readDriveSession } from '@/lib/google-drive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const config = googleDriveConfig()
  if (!config) return NextResponse.json({ configured: false, connected: false })
  const session = readDriveSession(request, config)
  const response = NextResponse.json({ configured: true, connected: Boolean(session), email: session?.email })
  if (!session && request.cookies.get('worksite_drive_session')) clearDriveSession(response)
  return response
}
