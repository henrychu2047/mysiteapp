import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3'
const GOOGLE_DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const DRIVE_SCOPE = 'openid email https://www.googleapis.com/auth/drive.file'
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const SESSION_COOKIE = 'worksite_drive_session'
const STATE_COOKIE = 'worksite_drive_state'

export type GoogleDriveConfig = {
  clientId: string
  clientSecret: string
  appOrigin: string
  sessionSecret: string
}

export type DriveSession = {
  refreshToken: string
  email: string
  rootFolderId: string
}

type GoogleTokenResponse = { access_token?: string; refresh_token?: string; error?: string; error_description?: string }
type GoogleDriveFile = { id: string; name: string }

function env(name: string) {
  return process.env[name]?.trim() || ''
}

export function googleDriveConfig(): GoogleDriveConfig | null {
  const clientId = env('GOOGLE_DRIVE_CLIENT_ID')
  const clientSecret = env('GOOGLE_DRIVE_CLIENT_SECRET')
  const appOrigin = env('GOOGLE_DRIVE_APP_ORIGIN').replace(/\/$/, '')
  const sessionSecret = env('GOOGLE_DRIVE_SESSION_SECRET')
  if (!clientId || !clientSecret || !appOrigin || !sessionSecret) return null
  return { clientId, clientSecret, appOrigin, sessionSecret }
}

export function callbackUrl(config: GoogleDriveConfig) {
  return `${config.appOrigin}/api/google-drive/callback`
}

function encryptionKey(secret: string) {
  return createHash('sha256').update(secret).digest()
}

function seal(value: DriveSession, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

function unseal(value: string, secret: string): DriveSession | null {
  try {
    const payload = Buffer.from(value, 'base64url')
    if (payload.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), payload.subarray(0, 12))
    decipher.setAuthTag(payload.subarray(12, 28))
    const decoded = JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8')) as Partial<DriveSession>
    if (!decoded.refreshToken || !decoded.email || !decoded.rootFolderId) return null
    return { refreshToken: decoded.refreshToken, email: decoded.email, rootFolderId: decoded.rootFolderId }
  } catch {
    return null
  }
}

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/api/google-drive' }

export function readDriveSession(request: NextRequest, config: GoogleDriveConfig) {
  const session = request.cookies.get(SESSION_COOKIE)?.value
  return session ? unseal(session, config.sessionSecret) : null
}

export function writeDriveSession(response: NextResponse, session: DriveSession, config: GoogleDriveConfig) {
  response.cookies.set(SESSION_COOKIE, seal(session, config.sessionSecret), { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 })
}

export function clearDriveSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 })
}

export function writeOAuthState(response: NextResponse, state: string) {
  response.cookies.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 10 * 60 })
}

export function readOAuthState(request: NextRequest) {
  return request.cookies.get(STATE_COOKIE)?.value || ''
}

export function clearOAuthState(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, '', { ...cookieOptions, maxAge: 0 })
}

export function createOAuthState() {
  return randomBytes(24).toString('base64url')
}

export function authorizeUrl(config: GoogleDriveConfig, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(config),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

type GoogleErrorPayload = { error?: string | { message?: string }; error_description?: string }

async function googleJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const raw = await response.text()
  let data: T & GoogleErrorPayload = {} as T & GoogleErrorPayload
  try { data = JSON.parse(raw) as T & GoogleErrorPayload } catch { /* Google may return plain text. */ }
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error_description || data.error : data.error?.message
    throw new Error(message || fallback)
  }
  return data
}

export async function exchangeCode(config: GoogleDriveConfig, code: string) {
  return googleJson<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: callbackUrl(config),
      grant_type: 'authorization_code',
    }),
  }, 'Google 授權失敗')
}

export async function accessToken(config: GoogleDriveConfig, session: DriveSession) {
  const token = await googleJson<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: session.refreshToken,
      grant_type: 'refresh_token',
    }),
  }, 'Google Drive 連線已失效')
  if (!token.access_token) throw new Error('Google Drive 沒有返回存取權杖')
  return token.access_token
}

export async function googleEmail(token: string) {
  const profile = await googleJson<{ email?: string; email_verified?: boolean }>(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token}` },
  }, '無法確認 Google 帳戶')
  if (!profile.email || !profile.email_verified) throw new Error('Google 帳戶電郵未驗證')
  return profile.email.toLowerCase()
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findFile(token: string, query: string) {
  const params = new URLSearchParams({ q: query, spaces: 'drive', pageSize: '1', fields: 'files(id,name)' })
  const result = await googleJson<{ files?: GoogleDriveFile[] }>(`${GOOGLE_DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, '無法讀取 Google Drive')
  return result.files?.[0] || null
}

async function createFolder(token: string, name: string, parentId?: string) {
  return googleJson<GoogleDriveFile>(`${GOOGLE_DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  }, '無法建立 Google Drive 資料夾')
}

export async function ensureFolder(token: string, name: string, parentId?: string) {
  const parentQuery = parentId ? ` and '${escapeQuery(parentId)}' in parents` : " and 'root' in parents"
  const query = `mimeType='${DRIVE_FOLDER_MIME}' and trashed=false and name='${escapeQuery(name)}'${parentQuery}`
  return (await findFile(token, query)) || createFolder(token, name, parentId)
}

export async function ensureRootFolder(token: string) {
  return ensureFolder(token, 'Worksite App')
}

export async function uploadPhoto(token: string, input: { rootFolderId: string; projectName: string; projectId: string; photoId: string; createdAt: string; file: File }) {
  const existing = await findFile(token, `appProperties has { key='worksitePhotoId' and value='${escapeQuery(input.photoId)}' } and trashed=false`)
  if (existing) return existing

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
  const boundary = `worksite-${randomBytes(12).toString('hex')}`
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    input.file,
    `\r\n--${boundary}--`,
  ])
  return googleJson<GoogleDriveFile>(`${GOOGLE_DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }, '相片上傳 Google Drive 失敗')
}

function safeName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 120)
}
