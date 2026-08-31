'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, FileText, Folder, FolderOpen, Trash2, Upload, X } from 'lucide-react'
import { loadAllHandover, type Tower } from '@/components/handover/handover-data'

type DatabaseFile = { id: string; projectId: string; folder: string; path: string; name: string; type: string; size: number; dataUrl: string; createdAt: string }
const DB_NAME = 'site-database-db'
const STORE = 'files'
const FOLDERS = ['圖紙', 'Spec', '照片', '其他'] as const

type DatabaseProps = { projectId: string; projectName: string; onBack: () => void }

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function readFiles(projectId: string) {
  return openDb().then(db => new Promise<DatabaseFile[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result as DatabaseFile[]).filter(file => file.projectId === projectId))
    request.onerror = () => reject(request.error)
  }))
}
function writeFiles(files: DatabaseFile[]) {
  return openDb().then(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.clear()
    files.forEach(file => store.put(file))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}
function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
export function Database({ projectId, projectName, onBack }: DatabaseProps) {
  const [files, setFiles] = useState<DatabaseFile[]>([])
  const [towers, setTowers] = useState<Tower[]>([])
  const [ready, setReady] = useState(false)
  const [folder, setFolder] = useState<string>('圖紙')
  const [drawingTower, setDrawingTower] = useState('')
  const [drawingFloor, setDrawingFloor] = useState('')
  const [drawingPath, setDrawingPath] = useState('')
  const [subfolder, setSubfolder] = useState('')
  const [customFolders, setCustomFolders] = useState<Record<string, string[]>>({})
  const [viewer, setViewer] = useState<DatabaseFile | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    Promise.all([readFiles(projectId), loadAllHandover()]).then(([stored, handover]) => {
      if (cancelled) return
      setFiles(stored)
      setTowers(handover[projectId]?.towers || [])
      try { setCustomFolders(JSON.parse(localStorage.getItem(`database-folders:${projectId}`) || '{}')) } catch { setCustomFolders({}) }
      setReady(true)
    }).catch(() => setReady(true))
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    if (ready) void writeFiles(files)
  }, [files, ready])

  const selectedTower = towers.find(tower => tower.name === drawingTower)
  const selectedFloor = selectedTower?.floors.find(floor => floor.name === drawingFloor)
  const currentPath = folder === '圖紙' ? drawingPath : subfolder ? `${folder} / ${subfolder}` : folder
  const visibleFiles = files.filter(file => file.path === currentPath)
  const folderNames = customFolders[folder] || []
  const addFolder = () => {
    const name = window.prompt(`新增${folder}資料夾名稱`)
    if (!name?.trim()) return
    const trimmed = name.trim()
    if (folderNames.includes(trimmed)) return window.alert('資料夾名稱已存在')
    const next = { ...customFolders, [folder]: [...folderNames, trimmed] }
    setCustomFolders(next)
    localStorage.setItem(`database-folders:${projectId}`, JSON.stringify(next))
    setSubfolder(trimmed)
  }
  const deleteFolder = (name: string) => {
    if (!window.confirm(`確定刪除「${name}」資料夾及內裡檔案？`)) return
    const path = `${folder} / ${name}`
    setFiles(current => current.filter(file => file.path !== path))
    const next = { ...customFolders, [folder]: folderNames.filter(item => item !== name) }
    setCustomFolders(next)
    localStorage.setItem(`database-folders:${projectId}`, JSON.stringify(next))
    if (subfolder === name) setSubfolder('')
  }
  const upload = async (fileList: FileList | null) => {
    if (!fileList?.length || !currentPath) return
    setBusy(true)
    try {
      const additions: DatabaseFile[] = []
      for (const file of Array.from(fileList)) additions.push({ id: `DB-${Date.now()}-${additions.length}`, projectId, folder, path: currentPath, name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: await readAsDataUrl(file), createdAt: new Date().toISOString() })
      setFiles(current => [...current, ...additions])
    } finally { setBusy(false) }
  }
  const remove = (id: string) => setFiles(current => current.filter(file => file.id !== id))
  const openFile = (file: DatabaseFile) => setViewer(file)

  return <section className="content database-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> 返回首頁</button>
    <div className="section-heading"><div><p className="eyebrow">PROJECT DATABASE</p><h2>資料庫</h2></div><span className="photo-total">{projectName}</span></div>
    <p className="settings-intro">管理目前 Project 的圖紙、Spec、照片及其它檔案。圖紙資料夾會跟隨制房資料自動更新。</p>
    <div className="database-layout">
      <aside className="database-folders">
        <div className="database-panel-title"><strong>資料夾</strong><span>選擇一個分類</span></div>
        <div className="database-folder-menu">
          {FOLDERS.map(name => <button className={folder === name ? 'active' : ''} key={name} onClick={() => { setFolder(name); setSubfolder(''); setDrawingTower(''); setDrawingFloor(''); setDrawingPath('') }}><span className="database-folder-icon"><Folder size={20} /></span><span className="database-folder-label"><strong>{name}</strong><small>{name === '圖紙' ? `${towers.length} 個座名` : `${(customFolders[name] || []).length} 個子資料夾`}</small></span><ChevronRight size={16} /></button>)}
        </div>
      </aside>
      <div className="database-content">
        <div className="database-breadcrumb"><span>資料庫</span><ChevronRight size={14} /><strong>{folder}</strong>{drawingTower && <><ChevronRight size={14} /><strong>{drawingTower}</strong></>}{drawingFloor && <><ChevronRight size={14} /><strong>{drawingFloor}</strong></>}{drawingPath && <><ChevronRight size={14} /><strong>{drawingPath.split(' / ').pop()}</strong></>}{subfolder && <><ChevronRight size={14} /><strong>{subfolder}</strong></>}</div>
        {folder === '圖紙' && <div className="database-drawing-folders"><div className="database-subheading"><strong><FolderOpen size={17} />圖紙資料夾</strong><span>{towers.length} 個座名</span></div>{towers.length ? <>{!drawingTower && towers.map(tower => <button key={tower.name} onClick={() => { setDrawingTower(tower.name); setDrawingFloor(''); setDrawingPath('') }}><Folder size={17} />{tower.name}<ChevronRight size={15} /></button>)}{drawingTower && <><button className="database-folder-back" onClick={() => { setDrawingTower(''); setDrawingFloor(''); setDrawingPath('') }}><ArrowLeft size={16} />返回座名</button><div className="database-subheading"><strong><FolderOpen size={17} />{selectedTower?.name || drawingTower}</strong><span>{selectedTower?.floors.length || 0} 個樓數</span></div>{!drawingFloor && (selectedTower?.floors || []).map(floor => <button key={floor.name} onClick={() => { setDrawingFloor(floor.name); setDrawingPath('') }}><Folder size={17} />{floor.name}<ChevronRight size={15} /></button>)}{drawingFloor && <><button className="database-folder-back" onClick={() => { setDrawingFloor(''); setDrawingPath('') }}><ArrowLeft size={16} />返回樓數</button><div className="database-subheading"><strong><FolderOpen size={17} />{selectedFloor?.name || drawingFloor}</strong><span>{selectedFloor?.rooms.length || 0} 個機房</span></div>{!drawingPath && (selectedFloor?.rooms || []).map(room => { const path = `${drawingTower} / ${drawingFloor} / ${room.name}`; return <button className={drawingPath === path ? 'selected' : ''} key={room.name} onClick={() => setDrawingPath(path)}><Folder size={17} />{room.name}<ChevronRight size={15} /></button> })}</>}</>}</> : <p className="empty-state">尚未有制房資料，請先在設定建立座數、樓層及機房。</p>}</div>}
        {folder !== '圖紙' && <div className="database-drawing-folders database-custom-folders"><div className="database-subheading"><strong><FolderOpen size={17} />{folder}資料夾</strong><button type="button" className="database-add-folder" onClick={addFolder}>＋新增資料夾</button></div>{folderNames.map(name => { const path = `${folder} / ${name}`; const count = files.filter(file => file.path === path).length; return <div className="database-folder-row" key={name}><button className={subfolder === name ? 'selected' : ''} onClick={() => setSubfolder(name)}><Folder size={17} /><span className="database-folder-name"><strong>{name}</strong><small>{count} 個檔案</small></span><ChevronRight size={15} /></button><button type="button" className="database-delete" onClick={() => deleteFolder(name)} aria-label={`刪除${name}資料夾`}><Trash2 size={16} /></button></div> })}{!folderNames.length && <p className="empty-state">尚未有自訂資料夾，請新增資料夾。</p>}</div>}
        {(folder !== '圖紙' || drawingPath) && <><div className="database-toolbar"><strong>{currentPath}</strong><label className="database-upload"><Upload size={17} />{busy ? '上載中…' : '上載檔案'}<input hidden type="file" multiple accept="application/pdf,image/*" disabled={busy} onChange={e => { void upload(e.target.files); e.currentTarget.value = '' }} /></label></div><div className="database-files">{visibleFiles.map(file => <div className="database-file" key={file.id}><button onClick={() => openFile(file)}><FileText size={24} /><span><strong>{file.name}</strong><small>{formatSize(file.size)}・{new Date(file.createdAt).toLocaleString('zh-HK', { hour12: false })}</small></span></button><button className="database-delete" onClick={() => remove(file.id)} aria-label={`刪除${file.name}`}><Trash2 size={16} /></button></div>)}{!visibleFiles.length && <p className="empty-state">此資料夾尚未有檔案。</p>}</div></>}
      </div>
    </div>
    {viewer && <div className="database-viewer" role="dialog" aria-modal="true"><div className="database-viewer-bar"><strong>{viewer.name}</strong><button onClick={() => setViewer(null)} aria-label="關閉"><X size={21} /></button></div>{viewer.type === 'application/pdf' || viewer.name.toLowerCase().endsWith('.pdf') ? <iframe src={viewer.dataUrl} title={viewer.name} /> : <div className="database-image-preview"><img src={viewer.dataUrl} alt={viewer.name} /></div>}</div>}
  </section>
}
