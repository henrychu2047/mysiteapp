'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GoogleDriveSync, Photo } from '@/lib/photo-storage'
import type { Project } from '@/lib/project-settings'

const GOOGLE_CLIENT_SCRIPT = 'https://accounts.google.com/gsi/client'
const DRIVE_SCOPE = 'openid email https://www.googleapis.com/auth/drive.file'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const SESSION_KEY = 'worksite-google-drive-session'
// This is a public browser OAuth client ID. Keep the fallback so a missing
// CI build variable cannot silently remove the Google Drive controls.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID?.trim() || '176157429212-ivkkkubuh05hhnrjgait5knehremqvhu.apps.googleusercontent.com'

type DriveSession = { accessToken: string; email: string; expiresAt: number }
type DriveStatus = { configured: boolean; connected: boolean; email?: string }
type SyncProgress = { current: number; total: number; uploaded: number; failed: number }
type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string }
type GoogleFile = { id: string; name: string }

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void }) => { requestAccessToken: (options?: { prompt?: string }) => void }
        }
      }
    }
  }
}

type GoogleDriveSyncProps = {
  photos: Photo[]
  projects: Project[]
  onUpdatePhoto: (photoId: string, sync: GoogleDriveSync) => void
}

function readableError(value: unknown) {
  return value instanceof Error && value.message ? value.message : '同步失敗，請稍後再試'
}

function isAuthError(value: unknown) {
  return typeof value === 'object' && value !== null && 'status' in value && (value as { status?: unknown }).status === 401
}

function storedSession(): DriveSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY)
    if (!value) return null
    const session = JSON.parse(value) as Partial<DriveSession>
    if (!session.accessToken || !session.email || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now() + 60_000) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return { accessToken: session.accessToken, email: session.email, expiresAt: session.expiresAt }
  } catch {
    return null
  }
}

function saveSession(session: DriveSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function googleJson<T>(url: string, token: string, init?: RequestInit, fallback = 'Google Drive 請求失敗'): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, {
    ...init,
    headers,
  })
  const body = await response.text()
  let data: T & { error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> } | string; error_description?: string } = {} as T & { error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> } | string; error_description?: string }
  try { data = JSON.parse(body) as typeof data } catch { /* Google may return plain text. */ }
  if (!response.ok) {
    const detail = typeof data.error === 'string'
      ? data.error_description || data.error
      : data.error?.errors?.[0]?.reason || data.error?.errors?.[0]?.message || data.error?.message
    const error = new Error(`${detail || fallback}（HTTP ${response.status}）`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data
}

async function findFile(token: string, query: string) {
  const params = new URLSearchParams({ q: query, spaces: 'drive', pageSize: '1', fields: 'files(id,name)' })
  const result = await googleJson<{ files?: GoogleFile[] }>(`${DRIVE_API}/files?${params}`, token, undefined, '無法讀取 Google Drive')
  return result.files?.[0] || null
}

async function ensureFolder(token: string, name: string, parentId?: string) {
  const parentQuery = parentId ? ` and '${escapeQuery(parentId)}' in parents` : " and 'root' in parents"
  const query = `mimeType='${DRIVE_FOLDER_MIME}' and trashed=false and name='${escapeQuery(name)}'${parentQuery}`
  const existing = await findFile(token, query)
  if (existing) return existing
  return googleJson<GoogleFile>(`${DRIVE_API}/files`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  }, '無法建立 Google Drive 資料夾')
}

function safeName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 120)
}

async function uploadPhoto(token: string, input: { rootFolderId: string; projectName: string; projectId: string; photoId: string; createdAt: string; file: Blob; fileId?: string }) {
  const projectFolder = await ensureFolder(token, safeName(input.projectName) || safeName(input.projectId) || 'Project', input.rootFolderId)
  const photosFolder = await ensureFolder(token, 'Photos', projectFolder.id)
  const month = Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt.slice(0, 7) : new Date().toISOString().slice(0, 7)
  const monthFolder = await ensureFolder(token, month, photosFolder.id)
  const extension = input.file.type === 'image/png' ? 'png' : input.file.type === 'image/webp' ? 'webp' : 'jpg'
  const datePart = Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt.replace(/[:.]/g, '-').replace(/Z$/, '') : new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  const metadata = {
    name: `${datePart}-${input.photoId}.${extension}`,
    mimeType: input.file.type || 'image/jpeg',
    parents: [monthFolder.id],
    appProperties: { worksitePhotoId: input.photoId, worksiteProjectId: input.projectId, source: 'worksite-app' },
  }
  const boundary = `worksite-${crypto.randomUUID().replaceAll('-', '')}`
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    input.file,
    `\r\n--${boundary}--`,
  ])
  const endpoint = input.fileId
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(input.fileId)}?uploadType=multipart&fields=id,name`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`
  return googleJson<GoogleFile>(endpoint, token, {
    method: input.fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }, '相片上傳 Google Drive 失敗')
}

async function uploadPhotoWithRetry(token: string, input: Parameters<typeof uploadPhoto>[1]) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await uploadPhoto(token, input)
    } catch (error) {
      lastError = error
      const detail = readableError(error)
      const hasStatus = typeof error === 'object' && error !== null && 'status' in error
      const retryable = !hasStatus || /HTTP (408|429|500|502|503|504)/i.test(detail)
      if (attempt === 2 || !retryable) throw error
      await new Promise(resolve => window.setTimeout(resolve, 800 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('相片上傳 Google Drive 失敗')
}

function loadGoogleClient() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_CLIENT_SCRIPT}"]`)
    const script = existing || document.createElement('script')
    const complete = () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error('Google 登入元件未能載入'))
    script.addEventListener('load', complete, { once: true })
    script.addEventListener('error', () => reject(new Error('無法載入 Google 登入元件')), { once: true })
    if (!existing) {
      script.src = GOOGLE_CLIENT_SCRIPT
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })
}

export function GoogleDriveSyncPanel({ photos, projects, onUpdatePhoto }: GoogleDriveSyncProps) {
  const [drive, setDrive] = useState<DriveStatus>({ configured: Boolean(GOOGLE_CLIENT_ID), connected: false })
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [message, setMessage] = useState('')
  const syncingRef = useRef(false)
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects])
  const unsyncedPhotos = useMemo(() => photos.filter(photo => photo.googleDrive?.status !== 'synced'), [photos])

  useEffect(() => {
    const session = storedSession()
    setDrive({ configured: Boolean(GOOGLE_CLIENT_ID), connected: Boolean(session), email: session?.email })
  }, [])

  const connect = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) return
    setLoading(true)
    setMessage('')
    try {
      await loadGoogleClient()
      const client = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: async response => {
          if (!response.access_token) {
            setMessage(response.error_description || response.error || 'Google Drive 連接未完成，請再試一次。')
            setLoading(false)
            return
          }
          try {
            const profile = await googleJson<{ email?: string; email_verified?: boolean }>('https://openidconnect.googleapis.com/v1/userinfo', response.access_token, undefined, '無法確認 Google 帳戶')
            if (!profile.email || !profile.email_verified) throw new Error('Google 帳戶電郵未驗證')
            const session = { accessToken: response.access_token, email: profile.email.toLowerCase(), expiresAt: Date.now() + (response.expires_in || 3600) * 1000 }
            saveSession(session)
            setDrive({ configured: true, connected: true, email: session.email })
            setMessage('Google Drive 已連接。按「同步相片」開始上傳。')
          } catch (error) {
            setMessage(readableError(error))
          } finally {
            setLoading(false)
          }
        },
      })
      if (!client) throw new Error('無法開始 Google 登入')
      client.requestAccessToken({ prompt: 'consent' })
    } catch (error) {
      setMessage(readableError(error))
      setLoading(false)
    }
  }, [])

  const syncPhotos = useCallback(async (force = false) => {
    const session = storedSession()
    const candidates = force ? photos : unsyncedPhotos
    if (syncingRef.current || !session || !candidates.length) return
    syncingRef.current = true
    setSyncing(true)
    setResyncing(force)
    setMessage('')
    setSyncProgress({ current: 0, total: candidates.length, uploaded: 0, failed: 0 })
    let uploaded = 0
    let failed = 0
    let firstError = ''
    let authExpired = false
    try {
      const rootFolder = await ensureFolder(session.accessToken, 'Worksite App')
      for (const [index, photo] of candidates.entries()) {
        onUpdatePhoto(photo.id, { status: 'syncing', fileId: photo.googleDrive?.fileId })
        try {
          // Drive backup should contain the same Smart Tag-stamped image shown
          // in the app. Older photos may only have the stamped thumbnail after
          // being rehydrated from IndexedDB, so keep that as the second choice.
          const blob = photo.stampedBlob || photo.thumbnailBlob || (photo.src && await (await fetch(photo.src)).blob()) || photo.originalBlob || await (await fetch(photo.cleanSrc || photo.src)).blob()
          if (!blob.type.startsWith('image/')) throw new Error('只可上傳相片檔案')
          if (blob.size > 25 * 1024 * 1024) throw new Error('單張相片不可超過 25 MB')
          const file = await uploadPhotoWithRetry(session.accessToken, { rootFolderId: rootFolder.id, projectName: projectNames.get(photo.projectId) || photo.projectId, projectId: photo.projectId, photoId: photo.id, createdAt: photo.createdAt, file: blob, fileId: force ? photo.googleDrive?.fileId : undefined })
          uploaded += 1
          onUpdatePhoto(photo.id, { status: 'synced', fileId: file.id, syncedAt: new Date().toISOString() })
        } catch (error) {
          if (isAuthError(error)) {
            authExpired = true
            sessionStorage.removeItem(SESSION_KEY)
            setDrive({ configured: Boolean(GOOGLE_CLIENT_ID), connected: false })
            break
          }
          failed += 1
          if (!firstError) firstError = readableError(error)
          onUpdatePhoto(photo.id, { status: 'error', fileId: photo.googleDrive?.fileId, error: readableError(error) })
        } finally {
          setSyncProgress({ current: index + 1, total: candidates.length, uploaded, failed })
        }
      }
      setMessage(authExpired ? 'Google Drive 授權已失效，請重新連接後再同步。' : uploaded ? `已同步 ${uploaded} 張相片到私人 Google Drive。${failed ? ` ${failed} 張失敗，可再試一次。原因：${firstError}` : ''}` : failed ? `${failed} 張相片同步失敗，可再試一次。原因：${firstError}` : '沒有新相片需要同步。')
    } catch (error) {
      const errorMessage = readableError(error)
      if (/unauthenticated|invalid credentials|token|401/i.test(errorMessage)) {
        sessionStorage.removeItem(SESSION_KEY)
        setDrive({ configured: Boolean(GOOGLE_CLIENT_ID), connected: false })
        setMessage('Google Drive 授權已失效，請重新連接。')
      } else {
        setMessage(errorMessage)
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setResyncing(false)
    }
  }, [onUpdatePhoto, photos, projectNames, unsyncedPhotos])

  const disconnect = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setDrive({ configured: Boolean(GOOGLE_CLIENT_ID), connected: false })
    setMessage('此瀏覽器已中斷 Google Drive。已上傳的相片會保留在 Drive。')
  }

  return <div className="about-block">
    <h3>私人 Google Drive 相片同步</h3>
    {!drive.configured ? <p>Google Drive 尚未啟用。管理員只需在建置 App 時加入公開的 Google Client ID；不需要在伺服器保存 Google 密碼、Client Secret 或任何使用者帳戶資料。</p> : !drive.connected ? <><p>相片會先保留在本機；按連接後會開啟 Google 官方登入／授權視窗。App 看不到你的 Google 密碼。</p><button type="button" onClick={() => void connect()} disabled={loading}>{loading ? '正在開啟 Google 登入…' : '連接私人 Google Drive'}</button></> : <><p>已連接：{drive.email}。未同步 {unsyncedPhotos.length} 張相片。授權只保留在此瀏覽器的暫存中，關閉瀏覽器或過期後按連接即可重新授權。</p><div className="backup-actions"><button type="button" onClick={() => void syncPhotos()} disabled={syncing || !unsyncedPhotos.length}>{syncing ? '正在同步…' : unsyncedPhotos.length ? `同步 ${unsyncedPhotos.length} 張相片` : '全部相片已同步'}</button><button type="button" onClick={() => void syncPhotos(true)} disabled={syncing || !photos.length}>{resyncing ? '正在重新同步…' : '重新同步全部相片'}</button><button type="button" onClick={disconnect} disabled={syncing}>中斷此瀏覽器連接</button></div>{syncProgress && <p role="status" aria-live="polite">同步中：{syncProgress.current}／{syncProgress.total} 張（成功 {syncProgress.uploaded}，失敗 {syncProgress.failed}）</p>}</>}
    {message && <p role="status">{message}</p>}
  </div>
}
