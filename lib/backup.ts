import JSZip from 'jszip'
import { loadAllHandover, saveAllHandover, type HandoverProjectData, type Tower } from '@/components/handover/handover-data'
import { loadAllMemos, saveAllMemos } from '@/components/site-memo/memo-data'
import { loadAllNotebooks, saveAllNotebooks } from '@/lib/notebook-storage'
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

type PhotoMetadata = Pick<Photo, 'id' | 'category' | 'tags' | 'note' | 'createdAt' | 'projectId' | 'annotations'>

const photoMetadata = (photo: Photo): PhotoMetadata => ({
  id: photo.id,
  category: photo.category,
  tags: photo.tags,
  note: photo.note,
  createdAt: photo.createdAt,
  projectId: photo.projectId,
  annotations: photo.annotations,
})

export async function exportLocalBackup({ currentProjectId, projects, photos }: BackupData): Promise<boolean> {
  try {
    const zip = new JSZip()
    zip.file('projects.json', JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), currentProjectId, projects }, null, 2))
    try { const handover = await loadAllHandover(); zip.file('handover.json', JSON.stringify(handover, null, 2)) } catch (error) { console.warn('Handover backup skipped', error) }
    try { const memos = await loadAllMemos(); zip.file('site-memo.json', JSON.stringify(memos, null, 2)) } catch (error) { console.warn('Site Memo backup skipped', error) }
    try { zip.file('notebooks.json', JSON.stringify(loadAllNotebooks(projects.map(project => project.id)), null, 2)) } catch (error) { console.warn('Notebook backup skipped', error) }
    const photosByProject = new Map<string, Photo[]>()
    for (const photo of photos) photosByProject.set(photo.projectId, [...(photosByProject.get(photo.projectId) || []), photo])
    for (const project of projects) {
      const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}`
      zip.file(`${prefix}/settings.json`, JSON.stringify(project.settings || {}, null, 2))
      const projectPhotos = photosByProject.get(project.id) || []
      zip.file(`${prefix}/photos/metadata.json`, JSON.stringify(projectPhotos.map(photoMetadata), null, 2))
      for (const photo of projectPhotos) {
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
    if (version > 3) throw new Error(`不支援的備份版本：${version}`)
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
    const notebooksFile = zip.file('notebooks.json')
    if (!confirm(`確認匯入此備份？\nProject：${projects.length} 個\n相片：${photoCount} 張\nSite Memo：${memoFile ? '有' : '無'}\n制房移交：${handoverFile ? '有' : '無'}\n\n匯入前會先下載目前資料作為復原備份。`)) return null
    await createRecoveryBackup()
    const photos: Photo[] = []
    for (const project of projects) {
      const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}/photos/`
      const metadataFile = zip.file(`${prefix}metadata.json`)
      const metadataRows = metadataFile ? JSON.parse(await metadataFile.async('text')) as unknown : []
      const metadataMap = new Map<string, Partial<PhotoMetadata>>()
      if (Array.isArray(metadataRows)) {
        for (const value of metadataRows) {
          if (!value || typeof value !== 'object') continue
          const metadata = value as Partial<PhotoMetadata>
          if (typeof metadata.id === 'string') metadataMap.set(metadata.id, metadata)
        }
      }
      const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith(prefix) && /\.jpg$/i.test(entry.name)) as JSZip.JSZipObject[]
      for (const entry of entries) {
        const blob = await entry.async('blob')
        const src = await dataUrlFromBlob(blob)
        const id = entry.name.split('/').pop()!.replace(/\.jpg$/, '')
        const metadata = metadataMap.get(id)
        photos.push({
          id,
          src,
          cleanSrc: src,
          originalBlob: blob,
          category: normalizeCategoryName(typeof metadata?.category === 'string' ? metadata.category : project.settings?.categories?.[0]?.name || '其它'),
          tags: metadata?.tags && typeof metadata.tags === 'object' ? metadata.tags : {},
          note: typeof metadata?.note === 'string' ? metadata.note : '',
          createdAt: typeof metadata?.createdAt === 'string' ? metadata.createdAt : new Date().toISOString(),
          projectId: project.id,
          annotations: Array.isArray(metadata?.annotations) ? metadata.annotations : [],
        })
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
    if (notebooksFile) {
      const notebooks = JSON.parse(await notebooksFile.async('text'))
      if (!notebooks || typeof notebooks !== 'object' || Array.isArray(notebooks)) throw new Error('記事簿資料格式不正確')
      saveAllNotebooks(notebooks as Record<string, unknown>)
    }
    return { projects, currentProjectId, photos }
  } catch (error) {
    console.error('Complete backup import failed:', error)
    alert(`ZIP 備份檔案無法讀取：${error instanceof Error ? error.message : '格式不正確'}`)
    return null
  }
}
