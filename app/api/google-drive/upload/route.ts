import { NextRequest, NextResponse } from 'next/server'
import { accessToken, clearDriveSession, googleDriveConfig, readDriveSession, uploadPhoto } from '@/lib/google-drive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PHOTO_BYTES = 25 * 1024 * 1024

function field(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  const config = googleDriveConfig()
  if (!config) return NextResponse.json({ error: 'Google Drive 尚未完成伺服器設定' }, { status: 503 })
  const session = readDriveSession(request, config)
  if (!session) return NextResponse.json({ error: '請先連接私人 Google Drive' }, { status: 401 })
  try {
    const form = await request.formData()
    const photo = form.get('photo')
    const photoId = field(form, 'photoId')
    const projectId = field(form, 'projectId')
    const projectName = field(form, 'projectName')
    const createdAt = field(form, 'createdAt')
    if (!(photo instanceof File) || !photoId || !projectId || !projectName) return NextResponse.json({ error: '相片同步資料不完整' }, { status: 400 })
    if (!photo.type.startsWith('image/')) return NextResponse.json({ error: '只可上傳相片檔案' }, { status: 415 })
    if (photo.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: '單張相片不可超過 25 MB' }, { status: 413 })
    const token = await accessToken(config, session)
    const file = await uploadPhoto(token, { rootFolderId: session.rootFolderId, projectName, projectId, photoId, createdAt, file: photo })
    return NextResponse.json({ fileId: file.id, name: file.name })
  } catch (error) {
    const message = error instanceof Error ? error.message : '相片上傳 Google Drive 失敗'
    const response = NextResponse.json({ error: message }, { status: /權杖|失效|unauthenticated|invalid_grant/i.test(message) ? 401 : 502 })
    if (response.status === 401) clearDriveSession(response)
    return response
  }
}
