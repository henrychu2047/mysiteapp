import { NextResponse } from 'next/server'
import { clearDriveSession } from '@/lib/google-drive'

export const runtime = 'nodejs'

export async function POST() {
  const response = NextResponse.json({ connected: false })
  clearDriveSession(response)
  return response
}
