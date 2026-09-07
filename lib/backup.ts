import JSZip from 'jszip'
import { loadAllHandover, saveAllHandover, type HandoverProjectData, type Tower } from '@/components/handover/handover-data'
import { loadAllMemos, saveAllMemos, type MemoBackup } from '@/components/site-memo/memo-data'
import { loadAllNotebooks, saveAllNotebooks } from '@/lib/notebook-storage'
import { loadAllDatabaseFiles, normalizeDatabaseFile, saveAllDatabaseFiles, type DatabaseFile } from '@/lib/database-storage'
import { normalizeCategoryName, normalizeProject, type Project } from '@/lib/project-settings'
import { saveStoredPhotos, type Photo } from '@/lib/photo-storage'

type BackupData = { currentProjectId: string; projects: Project[]; photos: Photo[] }
type ImportOptions = { createRecoveryBackup: () => Promise<boolean>; currentPhotos: Photo[]; currentProjectIds: string[] }
type PreparedBackup = BackupData & { handover?: Record<string, HandoverProjectData | Tower[]>; memos?: Record<string, MemoBackup>; notebooks?: Record<string, unknown>; database?: Record<string, DatabaseFile[]> }
const MAX_BACKUP_ARCHIVE_BYTES = 500 * 1024 * 1024
const MAX_BACKUP_FILE_COUNT = 2_000

const dataUrlFromBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error || new Error('無法讀取備份相片'))
  reader.readAsDataURL(blob)
})

type PhotoMetadata = Pick<Photo, 'id' | 'category' | 'tags' | 'note' | 'createdAt' | 'projectId' | 'annotations' | 'googleDrive'>
const photoMetadata = (photo: Photo): PhotoMetadata => ({ id: photo.id, category: photo.category, tags: photo.tags, note: photo.note, createdAt: photo.createdAt, projectId: photo.projectId, annotations: photo.annotations, googleDrive: photo.googleDrive })

export async function exportLocalBackup({ currentProjectId, projects, photos }: BackupData): Promise<boolean> {
  try {
    const zip = new JSZip()
    zip.file('projects.json', JSON.stringify({ version: 4, exportedAt: new Date().toISOString(), currentProjectId, projects }, null, 2))
    zip.file('handover.json', JSON.stringify(await loadAllHandover(), null, 2))
    zip.file('site-memo.json', JSON.stringify(await loadAllMemos(), null, 2))
    zip.file('notebooks.json', JSON.stringify(loadAllNotebooks(projects.map(project => project.id)), null, 2))
    zip.file('database.json', JSON.stringify(await loadAllDatabaseFiles(), null, 2))
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
    const output = new File([blob], `project-camera-backup-${new Date().toISOString().slice(0, 10)}.zip`, { type: 'application/zip' })
    if (navigator.share && navigator.canShare?.({ files: [output] })) {
      try { await navigator.share({ files: [output], title: 'Project Camera ZIP 備份' }); return true } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return false
        console.warn('Share backup failed, falling back to download', error)
      }
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = output.name; link.style.display = 'none'
    document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 3000)
    alert('完整備份已開始下載')
    return true
  } catch (error) {
    console.error('Complete backup export failed:', error)
    alert(`完整備份匯出失敗：${error instanceof Error ? error.message : '請稍後再試'}`)
    return false
  }
}

function parseDatabaseBackup(value: unknown): Record<string, DatabaseFile[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('資料庫檔案格式不正確')
  return Object.fromEntries(Object.entries(value).map(([projectId, files]) => {
    if (!Array.isArray(files)) throw new Error(`資料庫 Project ${projectId} 格式不正確`)
    return [projectId, files.map(file => {
      if (!file || typeof file !== 'object') throw new Error(`資料庫 Project ${projectId} 有無效檔案`)
      return normalizeDatabaseFile({ ...(file as DatabaseFile), projectId })
    })]
  }))
}

async function prepareImport(file: File): Promise<PreparedBackup> {
  if (file.size > MAX_BACKUP_ARCHIVE_BYTES) throw new Error('備份檔超過 500 MB 上限')
  const zip = await JSZip.loadAsync(file)
  const archiveFiles = Object.values(zip.files).filter(entry => !entry.dir)
  if (archiveFiles.length > MAX_BACKUP_FILE_COUNT) throw new Error(`備份檔包含超過 ${MAX_BACKUP_FILE_COUNT} 個檔案，已取消匯入`)
  const manifest = zip.file('projects.json')
  if (!manifest) throw new Error('找不到 projects.json')
  const raw = JSON.parse(await manifest.async('text')) as { version?: unknown; projects?: unknown; currentProjectId?: unknown }
  const version = typeof raw.version === 'number' ? raw.version : 1
  if (version > 4) throw new Error(`不支援的備份版本：${version}`)
  if (!Array.isArray(raw.projects) || !raw.projects.length) throw new Error('備份沒有有效 Project')
  const projects = raw.projects.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Project ${index + 1} 格式不正確`)
    const project = value as Partial<Project>
    if (typeof project.id !== 'string' || !project.id.trim() || typeof project.name !== 'string' || !project.name.trim()) throw new Error(`Project ${index + 1} 缺少有效名稱或 ID`)
    return normalizeProject({ ...project, id: project.id.trim(), name: project.name.trim() } as Project)
  })
  const projectIds = new Set<string>()
  for (const project of projects) {
    if (projectIds.has(project.id)) throw new Error(`Project ID 重複：${project.id}`)
    projectIds.add(project.id)
  }
  const currentProjectId = typeof raw.currentProjectId === 'string' && projectIds.has(raw.currentProjectId) ? raw.currentProjectId : projects[0].id
  const photos: Photo[] = []
  const photoIds = new Set<string>()
  for (const project of projects) {
    const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}/photos/`
    const metadataFile = zip.file(`${prefix}metadata.json`)
    const metadataRows = metadataFile ? JSON.parse(await metadataFile.async('text')) as unknown : []
    if (!Array.isArray(metadataRows)) throw new Error(`${project.name} 的相片 metadata 格式不正確`)
    const metadataMap = new Map<string, Partial<PhotoMetadata>>()
    for (const value of metadataRows) if (value && typeof value === 'object' && typeof (value as Partial<PhotoMetadata>).id === 'string') metadataMap.set((value as Partial<PhotoMetadata>).id!, value as Partial<PhotoMetadata>)
    const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith(prefix) && /\.jpg$/i.test(entry.name)) as JSZip.JSZipObject[]
    for (const entry of entries) {
      const id = entry.name.split('/').pop()!.replace(/\.jpg$/i, '')
      if (!id || photoIds.has(id)) throw new Error(`相片 ID 重複：${id || '未命名'}`)
      photoIds.add(id)
      const blob = await entry.async('blob')
      const metadata = metadataMap.get(id)
      const src = await dataUrlFromBlob(blob)
      photos.push({ id, src, cleanSrc: src, originalBlob: blob, category: normalizeCategoryName(typeof metadata?.category === 'string' ? metadata.category : project.settings?.categories?.[0]?.name || '其它'), tags: metadata?.tags && typeof metadata.tags === 'object' ? metadata.tags : {}, note: typeof metadata?.note === 'string' ? metadata.note : '', createdAt: typeof metadata?.createdAt === 'string' ? metadata.createdAt : new Date().toISOString(), projectId: project.id, annotations: Array.isArray(metadata?.annotations) ? metadata.annotations : [], googleDrive: metadata?.googleDrive })
    }
  }
  const readJson = async (name: string) => { const entry = zip.file(name); return entry ? JSON.parse(await entry.async('text')) as unknown : undefined }
  const [handoverRaw, memoRaw, notebookRaw, databaseRaw] = await Promise.all([readJson('handover.json'), readJson('site-memo.json'), readJson('notebooks.json'), readJson('database.json')])
  if (handoverRaw !== undefined && (!handoverRaw || typeof handoverRaw !== 'object' || Array.isArray(handoverRaw))) throw new Error('制房移交資料格式不正確')
  if (memoRaw !== undefined && (!memoRaw || typeof memoRaw !== 'object' || Array.isArray(memoRaw))) throw new Error('Site Memo 資料格式不正確')
  if (notebookRaw !== undefined && (!notebookRaw || typeof notebookRaw !== 'object' || Array.isArray(notebookRaw))) throw new Error('記事簿資料格式不正確')
  return { projects, currentProjectId, photos, handover: handoverRaw as Record<string, HandoverProjectData | Tower[]> | undefined, memos: memoRaw as Record<string, MemoBackup> | undefined, notebooks: notebookRaw as Record<string, unknown> | undefined, database: databaseRaw === undefined ? undefined : parseDatabaseBackup(databaseRaw) }
}

export async function importLocalBackup(file: File, options: ImportOptions): Promise<BackupData | null> {
  try {
    const prepared = await prepareImport(file)
    if (!confirm(`確認匯入此備份？\nProject：${prepared.projects.length} 個\n相片：${prepared.photos.length} 張\nSite Memo：${prepared.memos ? '有' : '無'}\n制房移交：${prepared.handover ? '有' : '無'}\n資料庫檔案：${prepared.database ? '有' : '無'}\n\n匯入前會先下載目前資料作為復原備份。`)) return null
    if (!await options.createRecoveryBackup()) throw new Error('目前資料的 recovery backup 未能建立，已取消匯入')
    const [previousHandover, previousMemos, previousDatabase] = await Promise.all([loadAllHandover(), loadAllMemos(), loadAllDatabaseFiles()])
    const notebookIds = [...new Set([...options.currentProjectIds, ...prepared.projects.map(project => project.id), ...Object.keys(prepared.notebooks || {})])]
    const previousNotebooks = loadAllNotebooks(notebookIds)
    const importedNotebooks = prepared.notebooks
      ? Object.fromEntries(notebookIds.map(projectId => [projectId, prepared.notebooks![projectId] || []]))
      : undefined
    let photosWritten = false; let handoverWritten = false; let memosWritten = false; let notebooksWritten = false; let databaseWritten = false
    try {
      await saveStoredPhotos(prepared.photos); photosWritten = true
      if (prepared.handover) { await saveAllHandover(prepared.handover); handoverWritten = true }
      if (prepared.memos) { await saveAllMemos(prepared.memos); memosWritten = true }
      if (importedNotebooks) { notebooksWritten = true; saveAllNotebooks(importedNotebooks) }
      if (prepared.database) { await saveAllDatabaseFiles(prepared.database); databaseWritten = true }
    } catch (error) {
      const rollbackFailures: string[] = []
      const rollback = async (label: string, action: () => Promise<void> | void) => { try { await action() } catch (rollbackError) { console.error(`Rollback ${label} failed:`, rollbackError); rollbackFailures.push(label) } }
      if (databaseWritten) await rollback('資料庫檔案', () => saveAllDatabaseFiles(previousDatabase))
      if (notebooksWritten) await rollback('記事簿', () => saveAllNotebooks(previousNotebooks))
      if (memosWritten) await rollback('Site Memo', () => saveAllMemos(previousMemos))
      if (handoverWritten) await rollback('制房移交', () => saveAllHandover(previousHandover))
      if (photosWritten) await rollback('相片', () => saveStoredPhotos(options.currentPhotos))
      const suffix = rollbackFailures.length ? `；但 ${rollbackFailures.join('、')} 未能自動回復` : '，並已自動回復原有資料'
      throw new Error(`匯入未能完成${suffix}`, { cause: error })
    }
    return { projects: prepared.projects, currentProjectId: prepared.currentProjectId, photos: prepared.photos }
  } catch (error) {
    console.error('Complete backup import failed:', error)
    alert(`ZIP 備份檔案無法讀取或還原：${error instanceof Error ? error.message : '格式不正確'}`)
    return null
  }
}

