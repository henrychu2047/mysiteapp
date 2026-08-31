'use client'

import { Component, useEffect, useRef, useState, type ErrorInfo, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowLeft, Building2, ChevronRight, FileText, Folder, Home, Images, Info, Trash2, Upload, X } from 'lucide-react'
import { loadAllHandover, type Tower } from '@/components/handover/handover-data'
import { renderPdfToPages } from '@/components/site-memo/memo-data'

type FileAnnotation = { page?: number; kind: 'text' | 'marker' | 'draw'; x: number; y: number; text?: string; points?: Array<{ x: number; y: number }> }
type DatabaseFile = { id: string; projectId: string; folder: string; path: string; name: string; type: string; size: number; dataUrl: string; createdAt: string; annotations?: FileAnnotation[] }

function normalizeAnnotations(value: unknown): FileAnnotation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const source = item as Partial<FileAnnotation>
    if (source.kind !== 'text' && source.kind !== 'marker' && source.kind !== 'draw') return []
    const x = typeof source.x === 'number' && Number.isFinite(source.x) ? Math.max(0, Math.min(1, source.x)) : 0.5
    const y = typeof source.y === 'number' && Number.isFinite(source.y) ? Math.max(0, Math.min(1, source.y)) : 0.5
    const points = Array.isArray(source.points) ? source.points.flatMap(point => {
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return []
      return [{ x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) }]
    }) : undefined
    if (source.kind === 'text' && (typeof source.text !== 'string' || !source.text.trim())) return []
    return [{ page: typeof source.page === 'number' && Number.isFinite(source.page) ? Math.max(1, Math.floor(source.page)) : undefined, kind: source.kind, x, y, text: typeof source.text === 'string' ? source.text : undefined, points }]
  })
}

function normalizeFile(file: DatabaseFile): DatabaseFile {
  const source = file && typeof file === 'object' ? file as Partial<DatabaseFile> : {}
  return {
    id: typeof source.id === 'string' ? source.id : `DB-invalid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    folder: typeof source.folder === 'string' ? source.folder : '其他',
    path: typeof source.path === 'string' ? source.path : '',
    name: typeof source.name === 'string' && source.name.trim() ? source.name : '未命名檔案',
    type: typeof source.type === 'string' ? source.type : '',
    size: Number.isFinite(source.size) ? Math.max(0, source.size as number) : 0,
    dataUrl: typeof source.dataUrl === 'string' ? source.dataUrl : '',
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date(0).toISOString(),
    annotations: normalizeAnnotations(source.annotations),
  }
}

function annotationPoints(annotation: FileAnnotation) {
  return Array.isArray(annotation.points) ? annotation.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).map(point => `${point.x},${point.y}`).join(' ') : ''
}

const DB_NAME = 'site-database-db'
const STORE = 'files'
const FOLDERS = ['圖紙', 'Spec', '照片', '其他'] as const

type DatabaseProps = { projectId: string; projectName: string; onBack: () => void }

class DatabaseErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[database] render failed:', error, info) }
  render() { return this.state.hasError ? <div className="database-error"><strong>資料庫照片無法載入</strong><p>請關閉預覽後再試；如仍然失敗，請重新上載該圖片。</p><button type="button" onClick={() => this.setState({ hasError: false })}>重新載入</button></div> : this.props.children }
}

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
    request.onsuccess = () => resolve((request.result as unknown[]).filter(file => file && typeof file === 'object' && (file as DatabaseFile).projectId === projectId).map(file => normalizeFile(file as DatabaseFile)))
    request.onerror = () => reject(request.error)
  }))
}
function writeFiles(files: DatabaseFile[], projectId: string) {
  return openDb().then(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const request = store.getAll()
    request.onsuccess = () => {
      ;(request.result as DatabaseFile[]).filter(file => file.projectId === projectId).forEach(file => store.delete(file.id))
      files.filter(file => file.projectId === projectId).forEach(file => store.put(file))
    }
    request.onerror = () => reject(request.error)
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
function DatabaseContent({ projectId, projectName, onBack }: DatabaseProps) {
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
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [editingFile, setEditingFile] = useState(false)
  const [showPdfTools, setShowPdfTools] = useState(false)
  const [pdfEditMode, setPdfEditMode] = useState<'text' | 'draw' | null>(null)
  const [draftText, setDraftText] = useState('')
  const [fileEditMode, setFileEditMode] = useState<'text' | 'marker' | 'draw' | null>(null)
  const [imageLoadError, setImageLoadError] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([])
  const drawingPageRef = useRef<number | null>(null)
  const imageDrawingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    Promise.all([readFiles(projectId), loadAllHandover()]).then(([stored, handover]) => {
      if (cancelled) return
      setFiles(stored.map(normalizeFile))
      setTowers(handover[projectId]?.towers || [])
      try { setCustomFolders(JSON.parse(localStorage.getItem(`database-folders:${projectId}`) || '{}')) } catch { setCustomFolders({}) }
      setReady(true)
    }).catch(() => setReady(true))
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    if (ready) void writeFiles(files, projectId)
  }, [files, ready])

  const selectedTower = towers.find(tower => tower.name === drawingTower)
  const selectedFloor = selectedTower?.floors.find(floor => floor.name === drawingFloor)
  const customPrefix = subfolder ? `${subfolder} / ` : ''
  const currentPath = folder === '圖紙'
    ? drawingPath || (drawingFloor ? `${drawingTower} / ${drawingFloor}` : drawingTower)
    : subfolder ? `${folder} / ${subfolder}` : folder
  const visibleFiles = files.filter(file => file.path === currentPath)
  const breadcrumbParts = folder === '圖紙' ? (drawingPath || (drawingFloor ? `${drawingTower} / ${drawingFloor}` : drawingTower)).split(' / ').filter(Boolean) : subfolder.split(' / ').filter(Boolean)
  const folderNames = (customFolders[folder] || []).filter(name => name.startsWith(customPrefix) && !name.slice(customPrefix.length).includes(' / ')).map(name => name.slice(customPrefix.length))
  const addFolder = () => {
    const name = window.prompt(`新增${folder}資料夾名稱`)
    if (!name?.trim()) return
    const trimmed = name.trim()
    if (folderNames.includes(trimmed)) return window.alert('資料夾名稱已存在')
    const fullName = `${customPrefix}${trimmed}`
    const next = { ...customFolders, [folder]: [...(customFolders[folder] || []), fullName] }
    setCustomFolders(next)
    localStorage.setItem(`database-folders:${projectId}`, JSON.stringify(next))
    setSubfolder(fullName)
  }
  const deleteFolder = (name: string) => {
    if (!window.confirm(`確定刪除「${name}」資料夾及內裡檔案？`)) return
    const fullName = `${customPrefix}${name}`
    const path = `${folder} / ${fullName}`
    setFiles(current => current.filter(file => file.path !== path && !file.path.startsWith(`${path} / `)))
    const next = { ...customFolders, [folder]: (customFolders[folder] || []).filter(item => item !== fullName && !item.startsWith(`${fullName} / `)) }
    setCustomFolders(next)
    localStorage.setItem(`database-folders:${projectId}`, JSON.stringify(next))
    if (subfolder === fullName || subfolder.startsWith(`${fullName} / `)) setSubfolder(customPrefix.replace(/ \/ $/, ''))
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
  const openFile = async (file: DatabaseFile) => {
    const safeFile = normalizeFile(file)
    if (!safeFile.dataUrl) { window.alert('檔案資料無法讀取，請重新上載。'); return }
    setViewer(safeFile)
    setEditingFile(false)
    setShowPdfTools(false)
    setFileEditMode(null)
    setDrawingPoints([])
    setPdfPages([])
    setImageLoadError(false)
    if (safeFile.type === 'application/pdf' || safeFile.name.toLowerCase().endsWith('.pdf')) {
      try {
        const pages = await renderPdfToPages(safeFile.dataUrl)
        setPdfPages(pages.map(page => page.imageUrl))
      } catch {
        setPdfPages([])
      }
    }
  }
  const saveViewerEdit = () => {
    if (!viewer) return
    setFiles(current => current.map(file => file.id === viewer.id ? viewer : file))
    setEditingFile(false)
    setPdfEditMode(null)
    setFileEditMode(null)
  }
  const addPdfText = (page: number, x: number, y: number, value = draftText) => {
    if (!viewer || !value.trim()) return
    setViewer({ ...viewer, annotations: [...(viewer.annotations || []), { page, kind: 'text', x, y, text: value.trim() }] })
    setDraftText('')
    setPdfEditMode(null)
  }
  const finishPdfDrawing = (page: number) => {
    if (!viewer || drawingPoints.length < 2) return
    const points = drawingPoints.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    if (points.length < 2) return
    setViewer(current => current ? { ...current, annotations: [...(current.annotations || []), { page, kind: 'draw', x: 0, y: 0, points }] } : current)
    setDrawingPoints([])
    setPdfEditMode(null)
  }
  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return { x: 0, y: 0 }
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
  }
  const handlePdfPointerDown = (event: ReactPointerEvent<HTMLDivElement>, page: number) => {
    try {
      if (pdfEditMode === 'draw') {
        event.preventDefault()
        drawingPageRef.current = page
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is optional on older browsers. */ }
        setDrawingPoints([pointFromEvent(event)])
      } else if (pdfEditMode === 'text') {
        const point = pointFromEvent(event)
        const text = window.prompt('輸入 PDF 註記文字')
        if (text?.trim()) addPdfText(page, point.x, point.y, text)
      }
    } catch { drawingPageRef.current = null; setDrawingPoints([]) }
  }
  const handlePdfPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pdfEditMode !== 'draw' || drawingPageRef.current === null) return
    event.preventDefault()
    const point = pointFromEvent(event)
    setDrawingPoints(current => {
      if (!current.length) return [point]
      const previous = current[current.length - 1]
      if (Math.abs(previous.x - point.x) < 0.002 && Math.abs(previous.y - point.y) < 0.002) return current
      return current.length >= 1200 ? current : [...current, point]
    })
  }
  const handlePdfPointerUp = (page: number) => {
    if (pdfEditMode === 'draw' && drawingPageRef.current === page) finishPdfDrawing(page)
    drawingPageRef.current = null
  }
  const clearLastAnnotation = () => {
    if (!viewer?.annotations?.length) return
    setViewer({ ...viewer, annotations: viewer.annotations.slice(0, -1) })
  }
  const pointFromImageEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return rect.width && rect.height ? { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) } : { x: 0.5, y: 0.5 }
  }
  const handleImagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!fileEditMode || !viewer) return
    const point = pointFromImageEvent(event)
    event.preventDefault()
    if (fileEditMode === 'marker') {
      setViewer({ ...viewer, annotations: [...(viewer.annotations || []), { kind: 'marker', x: point.x, y: point.y }] })
    } else if (fileEditMode === 'text') {
      const text = window.prompt('輸入圖片註記文字')
      if (text?.trim()) setViewer({ ...viewer, annotations: [...(viewer.annotations || []), { kind: 'text', x: point.x, y: point.y, text: text.trim() }] })
      setFileEditMode(null)
    } else {
      imageDrawingRef.current = true
      setDrawingPoints([point])
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
    }
  }
  const handleImagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fileEditMode !== 'draw' || !imageDrawingRef.current) return
    event.preventDefault()
    setDrawingPoints(current => current.length >= 800 ? current : [...current, pointFromImageEvent(event)])
  }
  const handleImagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fileEditMode === 'draw' && viewer && imageDrawingRef.current && drawingPoints.length > 1) setViewer({ ...viewer, annotations: [...(viewer.annotations || []), { kind: 'draw', x: 0, y: 0, points: drawingPoints }] })
    imageDrawingRef.current = false
    setDrawingPoints([])
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }

  return <>
    <header className="topbar database-topbar"><div className="brand-mark" aria-hidden="true">▦</div><div className="project-trigger"><strong>{projectName}</strong></div></header>
    <section className="content database-page">
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
        <div className="database-breadcrumb"><span>資料庫</span>{breadcrumbParts.map((part, index) => <span className="database-breadcrumb-part" key={`${part}-${index}`}><ChevronRight size={14} /><strong>{part}</strong></span>)}</div>
        {folder === '圖紙' && !drawingPath && <div className="database-drawing-folders">{towers.length ? !drawingTower ? towers.map(tower => <button key={tower.name} onClick={() => { setDrawingTower(tower.name); setDrawingFloor(''); setDrawingPath('') }}><Folder size={17} />{tower.name}<ChevronRight size={15} /></button>) : !drawingFloor ? (selectedTower?.floors || []).map(floor => <button key={floor.name} onClick={() => { setDrawingFloor(floor.name); setDrawingPath('') }}><Folder size={17} />{floor.name}<ChevronRight size={15} /></button>) : (selectedFloor?.rooms || []).map(room => { const path = `${drawingTower} / ${drawingFloor} / ${room.name}`; return <button className={drawingPath === path ? 'selected' : ''} key={room.name} onClick={() => setDrawingPath(path)}><Folder size={17} />{room.name}<ChevronRight size={15} /></button> }) : <p className="empty-state">尚未有制房資料，請先在設定建立座數、樓層及機房。</p>}</div>}
        {folder !== '圖紙' && <div className="database-drawing-folders database-custom-folders">{folderNames.map(name => { const fullName = `${customPrefix}${name}`; const path = `${folder} / ${fullName}`; const count = files.filter(file => file.path === path || file.path.startsWith(`${path} / `)).length; return <div className="database-folder-row" key={fullName}><button className={subfolder === fullName ? 'selected' : ''} onClick={() => setSubfolder(fullName)}><Folder size={17} /><span className="database-folder-name"><strong>{name}</strong><small>{count} 個檔案</small></span><ChevronRight size={15} /></button><button type="button" className="database-delete" onClick={() => deleteFolder(name)} aria-label={`刪除${name}資料夾`}><Trash2 size={16} /></button></div> })}</div>}
        {currentPath && <><div className="database-files">{visibleFiles.map(file => <div className="database-file" key={file.id}><button onClick={() => openFile(file)}><FileText size={24} /><span><strong>{file.name}</strong><small>{formatSize(file.size)}・{new Date(file.createdAt).toLocaleString('zh-HK', { hour12: false })}</small></span></button><button className="database-delete" onClick={() => remove(file.id)} aria-label={`刪除${file.name}`}><Trash2 size={16} /></button></div>)}{!visibleFiles.length && <p className="empty-state">此資料夾尚未有檔案。</p>}</div><div className="database-panel-actions"><button type="button" className="database-add-folder" onClick={addFolder} hidden={folder === '圖紙'}>＋新增資料夾</button><label className="database-upload"><Upload size={17} />{busy ? '上載中…' : '上載檔案'}<input hidden type="file" multiple accept="application/pdf,image/*" disabled={busy} onChange={e => { void upload(e.target.files); e.currentTarget.value = '' }} /></label></div></>}
      </div>
    </div>
    {viewer && <div className="database-viewer" role="dialog" aria-modal="true"><div className="database-viewer-bar"><div>{editingFile ? <input value={viewer.name} onChange={event => setViewer({ ...viewer, name: event.target.value })} /> : <strong>{viewer.name}</strong>}</div><div className="database-viewer-actions">{editingFile ? <button onClick={saveViewerEdit}>保存</button> : <button onClick={() => { const isPdf = viewer.type === 'application/pdf' || viewer.name.toLowerCase().endsWith('.pdf'); setEditingFile(true); setShowPdfTools(isPdf); setFileEditMode(isPdf ? null : 'marker') }}>編輯</button>}<button onClick={() => { setViewer(null); setPdfPages([]); setPdfEditMode(null); setFileEditMode(null); setDrawingPoints([]); setShowPdfTools(false) }} aria-label="關閉"><X size={21} /></button></div></div>{(viewer.type === 'application/pdf' || viewer.name.toLowerCase().endsWith('.pdf')) && showPdfTools && <div className="database-pdf-toolbar"><strong>PDF 編輯工具</strong><button className={pdfEditMode === 'text' ? 'active' : ''} onClick={() => { setEditingFile(true); setShowPdfTools(true); setPdfEditMode(pdfEditMode === 'text' ? null : 'text') }}>＋文字</button><button className={pdfEditMode === 'draw' ? 'active' : ''} onClick={() => { setEditingFile(true); setShowPdfTools(true); setPdfEditMode(pdfEditMode === 'draw' ? null : 'draw') }}>✎ 手寫</button><button onClick={clearLastAnnotation} disabled={!viewer.annotations?.length}>清除最後註記</button><button className="save-annotation" onClick={saveViewerEdit}>保存註記</button><small>{pdfEditMode === 'text' ? '點擊頁面位置後輸入文字' : pdfEditMode === 'draw' ? '在頁面上拖曳手寫' : '按「＋文字」或「✎ 手寫」開始'}</small></div>}{viewer.type === 'application/pdf' || viewer.name.toLowerCase().endsWith('.pdf') ? <div className="database-pdf-pages">{pdfPages.length ? pdfPages.map((page, index) => <div className="database-pdf-page" key={index} onPointerDown={event => handlePdfPointerDown(event, index + 1)} onPointerMove={handlePdfPointerMove} onPointerUp={() => handlePdfPointerUp(index + 1)} onPointerCancel={() => { drawingPageRef.current = null; setDrawingPoints([]) }}>{<img src={page} alt={`${viewer.name} 第 ${index + 1} 頁`} />}{(Array.isArray(viewer.annotations) ? viewer.annotations : []).filter(annotation => annotation.page === index + 1).map((annotation, annotationIndex) => annotation.kind === 'text' ? <span className="database-pdf-text-annotation" key={annotationIndex} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}>{annotation.text || ''}</span> : <svg className="database-pdf-draw-annotation" key={annotationIndex} viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={annotationPoints(annotation)} /></svg>)}{pdfEditMode === 'draw' && drawingPageRef.current === index + 1 && drawingPoints.length > 1 && <svg className="database-pdf-draw-annotation database-pdf-draw-preview" viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={drawingPoints.map(point => `${point.x},${point.y}`).join(' ')} /></svg>}</div>) : <iframe src={viewer.dataUrl} title={viewer.name} />}</div> : <><div className="database-image-toolbar">{editingFile ? <><button className={fileEditMode === 'text' ? 'active' : ''} onClick={() => setFileEditMode(fileEditMode === 'text' ? null : 'text')}>＋文字</button><button className={fileEditMode === 'marker' ? 'active' : ''} onClick={() => setFileEditMode(fileEditMode === 'marker' ? null : 'marker')}>◉ 標記</button><button className={fileEditMode === 'draw' ? 'active' : ''} onClick={() => setFileEditMode(fileEditMode === 'draw' ? null : 'draw')}>✎ 手寫</button><button onClick={clearLastAnnotation} disabled={!viewer.annotations?.length}>清除</button><button className="save-annotation" onClick={saveViewerEdit}>保存</button></> : <button onClick={() => { setEditingFile(true); setFileEditMode(null) }}>編輯圖片</button>}</div><div className={`database-image-preview ${fileEditMode ? 'editing' : ''}`} onPointerDown={handleImagePointerDown} onPointerMove={handleImagePointerMove} onPointerUp={handleImagePointerUp} onPointerCancel={() => { imageDrawingRef.current = false; setDrawingPoints([]) }}>{imageLoadError ? <div className="database-image-fallback"><strong>資料庫照片無法載入</strong><span>請重新上載該圖片，或關閉後再試。</span></div> : <img src={viewer.dataUrl} alt={viewer.name} onError={() => setImageLoadError(true)} />}{(Array.isArray(viewer.annotations) ? viewer.annotations : []).map((annotation, index) => annotation.kind === 'text' ? <span className="database-image-text-annotation" key={index} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}>{annotation.text || ''}</span> : annotation.kind === 'marker' ? <span className="database-image-marker-annotation" key={index} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}>●</span> : <svg className="database-image-draw-annotation" key={index} viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={annotationPoints(annotation)} /></svg>)}{fileEditMode === 'draw' && drawingPoints.length > 1 && <svg className="database-image-draw-annotation database-image-draw-preview" viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={drawingPoints.map(point => `${point.x},${point.y}`).join(' ')} /></svg>}</div></>}</div>}
  </section>
  <nav className="bottom-nav main-nav database-bottom-nav"><button onClick={onBack}><span><Home size={20} /></span>首頁</button><button onClick={onBack}><span><Images size={20} /></span>相簿</button><button onClick={onBack}><span><Building2 size={20} /></span>設定</button><button onClick={onBack}><span><Info size={20} /></span>資料</button></nav>
 </>
}

export function Database(props: DatabaseProps) {
 return <DatabaseErrorBoundary><DatabaseContent {...props} /></DatabaseErrorBoundary>
}
