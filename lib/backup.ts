import JSZip from 'jszip'
import { loadAllHandover, saveAllHandover, type HandoverProjectData, type Tower } from '@/components/handover/handover-data'
import { loadAllMemos, saveAllMemos } from '@/components/site-memo/memo-data'
import { normalizeCategoryName, normalizeProject, type Project } from '@/lib/project-settings'
import type { Photo } from '@/lib/photo-storage'

type BackupData = {
  currentProjectId: string
  projects: Project[]
  photos: Photo[]
}

const dataUrlFromBlob = (blob: Blob) => new Promise<string>(resolve => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.readAsDataURL(blob)
})

export async function exportLocalBackup({ currentProjectId, projects, photos }: BackupData): Promise<boolean> {
  try {
    const zip = new JSZip()
    zip.file('projects.json', JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), currentProjectId, projects }, null, 2))
    try { const handover = await loadAllHandover(); zip.file('handover.json', JSON.stringify(handover, null, 2)) } catch (error) { console.warn('Handover backup skipped', error) }
    try { const memos = await loadAllMemos(); zip.file('site-memo.json', JSON.stringify(memos, null, 2)) } catch (error) { console.warn('Site Memo backup skipped', error) }
    for (const project of projects) {
      const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}`
      zip.file(`${prefix}/settings.json`, JSON.stringify(project.settings || {}, null, 2))
      for (const photo of photos.filter(item => item.projectId === project.id)) {
        const response = await fetch(photo.src)
        if (!response.ok) throw new Error(`相片讀取失敗 (${response.status})`)
        zip.file(`${prefix}/photos/${photo.id}.jpg`, await response.blob())
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], `project-camera-backup-${new Date().toISOString().slice(0, 10)}.zip`, { type: 'application/zip' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Project Camera ZIP 備份' }); return true } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return false
        console.warn('Share backup failed, falling back to download', error)
      }
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 3000)
    alert('完整備份已開始下載')
    return true
  } catch (error) {
    console.error('Complete backup export failed:', error)
    alert(`完整備份匯出失敗：${error instanceof Error ? error.message : '請稍後再試'}`)
    return false
  }
}

export async function importLocalBackup(file: File, createRecoveryBackup: () => Promise<boolean>): Promise<BackupData | null> {
  try {
    const zip = await JSZip.loadAsync(file)
    const manifest = zip.file('projects.json')
    if (!manifest) throw new Error('找不到 projects.json')
    const raw = JSON.parse(await manifest.async('text')) as { version?: unknown; projects?: unknown; currentProjectId?: unknown }
    const version = typeof raw.version === 'number' ? raw.version : 1
    if (version > 2) throw new Error(`不支援的備份版本：${version}`)
    if (!Array.isArray(raw.projects) || !raw.projects.length) throw new Error('備份沒有有效 Project')
    const projects = raw.projects.map((value, index) => {
      if (!value || typeof value !== 'object') throw new Error(`Project ${index + 1} 格式不正確`)
      const project = value as Partial<Project>
      if (typeof project.id !== 'string' || !project.id.trim() || typeof project.name !== 'string' || !project.name.trim()) throw new Error(`Project ${index + 1} 缺少有效名稱或 ID`)
      return normalizeProject({ ...project, id: project.id.trim(), name: project.name.trim() } as Project)
    })
    const currentProjectId = typeof raw.currentProjectId === 'string' && projects.some(project => project.id === raw.currentProjectId) ? raw.currentProjectId : projects[0].id
    const photoCount = Object.values(zip.files).filter(entry => !entry.dir && /\/photos\/[^/]+\.jpg$/i.test(entry.name)).length
    const memoFile = zip.file('site-memo.json')
    const handoverFile = zip.file('handover.json')
    if (!confirm(`確認匯入此備份？\nProject：${projects.length} 個\n相片：${photoCount} 張\nSite Memo：${memoFile ? '有' : '無'}\n制房移交：${handoverFile ? '有' : '無'}\n\n匯入前會先下載目前資料作為復原備份。`)) return null
    await createRecoveryBackup()
    const photos: Photo[] = []
    for (const project of projects) {
      const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}/photos/`
      const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith(prefix)) as JSZip.JSZipObject[]
      for (const entry of entries) {
        const blob = await entry.async('blob')
        const src = await dataUrlFromBlob(blob)
        photos.push({ id: entry.name.split('/').pop()!.replace(/\.jpg$/, ''), src, cleanSrc: src, category: normalizeCategoryName(project.settings?.categories?.[0]?.name || '其它'), tags: {}, note: '', createdAt: new Date().toISOString(), projectId: project.id })
      }
    }
    if (handoverFile) {
      const handoverData = JSON.parse(await handoverFile.async('text'))
      if (!handoverData || typeof handoverData !== 'object') throw new Error('制房移交資料格式不正確')
      await saveAllHandover(handoverData as Record<string, HandoverProjectData | Tower[]>)
    }
    if (memoFile) {
      const memoData = JSON.parse(await memoFile.async('text'))
      if (!memoData || typeof memoData !== 'object' || Array.isArray(memoData)) throw new Error('Site Memo 資料格式不正確')
      await saveAllMemos(memoData)
    }
    return { projects, currentProjectId, photos }
  } catch {
    alert('ZIP 備份檔案無法讀取')
    return null
  }
}
