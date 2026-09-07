'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GoogleDriveSync, Photo } from '@/lib/photo-storage'
import type { Project } from '@/lib/project-settings'

type DriveStatus = { configured: boolean; connected: boolean; email?: string }

type GoogleDriveSyncProps = {
  photos: Photo[]
  projects: Project[]
  onUpdatePhoto: (photoId: string, sync: GoogleDriveSync) => void
}

const defaultStatus: DriveStatus = { configured: false, connected: false }

function readableError(value: unknown) {
  return value instanceof Error && value.message ? value.message : '同步失敗，請稍後再試'
}

export function GoogleDriveSyncPanel({ photos, projects, onUpdatePhoto }: GoogleDriveSyncProps) {
  const [drive, setDrive] = useState<DriveStatus>(defaultStatus)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const syncingRef = useRef(false)
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects])
  const unsyncedPhotos = useMemo(() => photos.filter(photo => photo.googleDrive?.status !== 'synced'), [photos])

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/google-drive/status', { cache: 'no-store' })
      if (!response.ok) throw new Error('無法讀取 Google Drive 連線狀態')
      setDrive(await response.json() as DriveStatus)
    } catch (error) {
      setMessage(readableError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const result = new URLSearchParams(window.location.search).get('googleDrive')
    if (result) {
      setMessage(result === 'connected' ? 'Google Drive 已連接。按「同步相片」開始上傳。' : 'Google Drive 連接未完成，請再試一次。')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [refreshStatus])

  const syncPhotos = useCallback(async () => {
    if (syncingRef.current || !drive.connected || !unsyncedPhotos.length) return
    syncingRef.current = true
    setSyncing(true)
    setMessage('')
    let uploaded = 0
    try {
      for (const photo of unsyncedPhotos) {
        onUpdatePhoto(photo.id, { status: 'syncing', fileId: photo.googleDrive?.fileId })
        try {
          const blob = photo.originalBlob || await (await fetch(photo.cleanSrc || photo.src)).blob()
          const form = new FormData()
          form.append('photo', blob, `${photo.id}.jpg`)
          form.set('photoId', photo.id)
          form.set('projectId', photo.projectId)
          form.set('projectName', projectNames.get(photo.projectId) || photo.projectId)
          form.set('createdAt', photo.createdAt)
          const response = await fetch('/api/google-drive/upload', { method: 'POST', body: form })
          const payload = await response.json() as { fileId?: string; error?: string }
          if (!response.ok || !payload.fileId) {
            if (response.status === 401) {
              setDrive(current => ({ ...current, connected: false }))
              throw new Error('Google Drive 授權已失效，請重新連接')
            }
            throw new Error(payload.error || '上傳失敗')
          }
          uploaded += 1
          onUpdatePhoto(photo.id, { status: 'synced', fileId: payload.fileId, syncedAt: new Date().toISOString() })
        } catch (error) {
          onUpdatePhoto(photo.id, { status: 'error', fileId: photo.googleDrive?.fileId, error: readableError(error) })
        }
      }
      setMessage(uploaded ? `已同步 ${uploaded} 張相片到私人 Google Drive。` : '沒有新相片需要同步。')
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [drive.connected, onUpdatePhoto, projectNames, unsyncedPhotos])

  const disconnect = async () => {
    await fetch('/api/google-drive/disconnect', { method: 'POST' })
    setDrive(current => ({ ...current, connected: false, email: undefined }))
    setMessage('此裝置已中斷 Google Drive。已上傳的相片會保留在 Drive。')
  }

  return <div className="about-block">
    <h3>私人 Google Drive 相片同步</h3>
    {loading ? <p>正在檢查 Google Drive 設定…</p> : !drive.configured ? <p>尚未設定 Google Drive。完成 Google Cloud OAuth 設定並加入伺服器環境變數後，才可連接私人 Drive。</p> : !drive.connected ? <><p>相片會先保留在本機；連接後由你手動開始上傳，檔案不會公開分享。</p><button type="button" onClick={() => { window.location.assign('/api/google-drive/connect') }}>連接私人 Google Drive</button></> : <><p>已連接：{drive.email}。未同步 {unsyncedPhotos.length} 張相片。</p><div className="backup-actions"><button type="button" onClick={() => void syncPhotos()} disabled={syncing || !unsyncedPhotos.length}>{syncing ? '正在同步…' : unsyncedPhotos.length ? `同步 ${unsyncedPhotos.length} 張相片` : '全部相片已同步'}</button><button type="button" onClick={() => void disconnect()} disabled={syncing}>中斷此裝置連接</button></div></>}
    {message && <p role="status">{message}</p>}
  </div>
}
