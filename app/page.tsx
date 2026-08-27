'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ExcelJS from 'exceljs'

type Photo = { id: string; src: string; cleanSrc: string; category: string; tags: Record<string, string>; note: string; createdAt: string; projectId: string }
type Category = { name: string; icon: string }
type ProjectSettings = { categories: Category[]; tags: Record<string, string>; note: string; settingsOptions: Record<string, string[]> }
type Project = { id: string; name: string; settings?: ProjectSettings }

const DEFAULT_PROJECT: Project = { id: 'default-project', name: '我的 Project' }
const PROJECTS_KEY = 'site-photo-projects'
const CURRENT_PROJECT_KEY = 'site-photo-current-project'

const defaultCategories: Category[] = [
  { name: '電器', icon: '⌁' },
  { name: '冷氣', icon: '◇' },
  { name: '消防', icon: '△' },
  { name: '制櫃', icon: '▤' },
  { name: '發電機', icon: '◈' },
]
const createProjectSettings = (): ProjectSettings => ({ categories: defaultCategories, tags: {}, note: '', settingsOptions: tagOptions })

const tagOptions: Record<string, string[]> = {
  樓層: ['B2', 'B1', 'G/F', '1/F', '2/F', '3/F', '天台'],
  機房: ['A區機房', 'B區機房', '泵房', '電房', '消防泵房'],
  事項: ['施工進度', '品質檢查', '材料驗收', '工序記錄', '完成確認'],
  安全: ['個人防護', '臨邊防護', '開口防護', '消防設備', '安全通道'],
  其它: ['日常巡查', '材料到場', '環境記錄', '問題跟進'],
}

const PHOTO_DB = 'site-photo-db'
const PHOTO_STORE = 'photos'

function openPhotoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function loadStoredPhotos() {
  return openPhotoDb().then(db => new Promise<Photo[]>((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE).getAll()
    request.onsuccess = () => resolve(request.result as Photo[])
    request.onerror = () => reject(request.error)
  }))
}

function saveStoredPhotos(photos: Photo[]) {
  return openPhotoDb().then(db => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, 'readwrite')
    const store = transaction.objectStore(PHOTO_STORE)
    store.clear()
    photos.forEach(photo => store.put(photo))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  }))
}

function loadBrowserLibrary(src: string, globalName: string) {
  return new Promise<any>((resolve, reject) => {
    if ((window as any)[globalName]) return resolve((window as any)[globalName])
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve((window as any)[globalName] || null)
    script.onerror = () => reject(new Error('匯出套件載入失敗'))
    document.head.appendChild(script)
  })
}

function imageAsJpeg(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('無法建立圖片轉換器'))
      ctx.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    image.onerror = () => reject(new Error('無法轉換原圖'))
    image.src = dataUrl
  })
}

function stampImage(file: File, category: string) {
  return new Promise<{ stamped: string; clean: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('無法建立圖片處理器'))
          return
        }
        ctx.drawImage(image, 0, 0)
        const cleanDataUrl = canvas.toDataURL('image/jpeg', 0.92)
        const text = `${category} | ${new Date().toLocaleString('zh-HK', { hour12: false })}`
        const size = Math.max(18, Math.round(image.width / 48))
        ctx.font = `600 ${size}px Arial, sans-serif`
        const width = ctx.measureText(text).width + size * 1.4
        const height = size * 2.1
        ctx.fillStyle = 'rgba(10, 17, 24, .72)'
        ctx.fillRect(image.width - width, image.height - height, width, height)
        ctx.fillStyle = '#fff'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, image.width - width + size * 0.7, image.height - height / 2)
        resolve({ stamped: canvas.toDataURL('image/jpeg', 0.88), clean: cleanDataUrl })
      }
      image.onerror = () => reject(new Error('無法讀取相片'))
      image.src = reader.result as string
    }
    reader.onerror = () => reject(reader.error || new Error('無法讀取檔案'))
    reader.readAsDataURL(file)
  })
}

export default function Page() {
  const [categories, setCategories] = useState(defaultCategories)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [projects, setProjects] = useState<Project[]>([{ ...DEFAULT_PROJECT, settings: createProjectSettings() }])
  const [currentProjectId, setCurrentProjectId] = useState(DEFAULT_PROJECT.id)
  const [projectPanel, setProjectPanel] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [tab, setTab] = useState<'home' | 'photos' | 'settings'>('home')
  const [settingsOptions, setSettingsOptions] = useState<Record<string, string[]>>(tagOptions)
  const [newOption, setNewOption] = useState<Record<string, string>>({})
  const [settingsReady, setSettingsReady] = useState(false)
  const [tags, setTags] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [picker, setPicker] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<Photo | null>(null)
  const [newCategory, setNewCategory] = useState(false)
  const [continuousCamera, setContinuousCamera] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [captureBusy, setCaptureBusy] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [flashEnabled, setFlashEnabled] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const cameraRef = useRef<HTMLInputElement>(null); const albumRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loadedProjectRef = useRef('')

  const [isOffline, setIsOffline] = useState(false)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => { if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' }); window.setTimeout(() => { const urls = performance.getEntriesByType('resource').map((entry) => new URL((entry as PerformanceResourceTiming).name, location.href)).filter((url) => url.origin === location.origin).map((url) => `${url.pathname}${url.search}`); registration.active?.postMessage({ type: 'CACHE_RESOURCES', urls: [...new Set(['/', '/manifest.webmanifest', ...urls])] }) }, 1000); return registration.update() }).catch(() => undefined)
    }
    const updateOnlineState = () => setIsOffline(!navigator.onLine)
    updateOnlineState()
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => { window.removeEventListener('online', updateOnlineState); window.removeEventListener('offline', updateOnlineState) }
  }, [])
  useEffect(() => {
    loadStoredPhotos().then((stored) => {
      const migrated = stored.map((photo) => ({ ...photo, projectId: photo.projectId || DEFAULT_PROJECT.id }))
      setPhotos(migrated)
      saveStoredPhotos(migrated).catch(() => undefined)
    }).catch(() => setPhotos([]))
    try {
      const savedProjects = localStorage.getItem(PROJECTS_KEY)
      const savedCurrent = localStorage.getItem(CURRENT_PROJECT_KEY)
      if (savedProjects) {
        const parsed = JSON.parse(savedProjects) as Project[]
        if (Array.isArray(parsed) && parsed.length) setProjects(parsed.map(project => ({ ...project, settings: { ...createProjectSettings(), ...(project.settings || {}) } })))
      }
      if (savedCurrent) setCurrentProjectId(savedCurrent)
      localStorage.removeItem('site-photo-records')
      const memory = localStorage.getItem('site-photo-memory')
      const savedOptions = localStorage.getItem('site-photo-options')
      if (memory) { const m = JSON.parse(memory); setTags(m.tags || {}); setNote(m.note || '') }
      if (savedOptions) setSettingsOptions({ ...tagOptions, ...JSON.parse(savedOptions) })
    } catch { /* 儲存空間不可用時仍可繼續拍攝 */ }
    setSettingsReady(true)
  }, [])
  useEffect(() => {
    if (!settingsReady || loadedProjectRef.current === currentProjectId) return
    const projectSettings = projects.find(project => project.id === currentProjectId)?.settings
    if (projectSettings) { setCategories(projectSettings.categories); setTags(projectSettings.tags); setNote(projectSettings.note); setSettingsOptions(projectSettings.settingsOptions) }
    loadedProjectRef.current = currentProjectId
  }, [settingsReady, currentProjectId, projects])
  useEffect(() => {
    if (!settingsReady) return
    setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, settings: { categories, tags, note, settingsOptions } } : project))
  }, [settingsReady, currentProjectId, categories, tags, note, settingsOptions])
  useEffect(() => {
    if (!settingsReady) return
    try {
      localStorage.setItem('site-photo-memory', JSON.stringify({ tags, note }))
      localStorage.setItem('site-photo-options', JSON.stringify(settingsOptions))
    } catch { /* 記憶不可用不影響拍攝 */ }
  }, [settingsReady, tags, note, settingsOptions])
  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
      localStorage.setItem(CURRENT_PROJECT_KEY, currentProjectId)
    } catch { /* 儲存空間不可用時仍可使用目前狀態 */ }
  }, [projects, currentProjectId])

  const currentProject = projects.find(project => project.id === currentProjectId) || DEFAULT_PROJECT
  const projectPhotos = useMemo(() => photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === currentProject.id), [currentProject.id, photos])
  const currentPhotos = useMemo(() => active ? projectPhotos.filter(p => p.category === active) : projectPhotos, [active, projectPhotos])
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()) }, [])
  const startContinuousCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('此瀏覽器不支援連續相機，請使用立即拍照'); return }
    try {
      setCameraError('')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      streamRef.current = stream
      setContinuousCamera(true)
    } catch (error) { console.error('[v0] camera start failed:', error); setCameraError('無法開啟鏡頭，請允許相機權限或改用立即拍照') }
  }
  useEffect(() => {
    if (!continuousCamera || !videoRef.current || !streamRef.current) return
    const video = videoRef.current
    video.srcObject = streamRef.current
    video.play().catch(error => console.error('[v0] video play failed:', error))
    return () => { video.pause(); video.srcObject = null }
  }, [continuousCamera])
  const applyCameraSettings = async (nextFlash: boolean, nextZoom: number) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; zoom?: { min: number; max: number } }
    const constraints: MediaTrackConstraintSet & { torch?: boolean; focusMode?: string; zoom?: number } = {}
    if (typeof capabilities.torch === 'boolean') constraints.torch = nextFlash
    if (capabilities.zoom) constraints.zoom = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, nextZoom))
    try { await track.applyConstraints({ advanced: [constraints] }) } catch (error) { console.error('[v0] camera settings failed:', error) }
  }
  const toggleFlash = async () => { const next = !flashEnabled; setFlashEnabled(next); await applyCameraSettings(next, zoomLevel) }
  const changeZoom = async (next: number) => { setZoomLevel(next); await applyCameraSettings(flashEnabled, next) }
  const stopContinuousCamera = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; setContinuousCamera(false) }
  const captureContinuousPhoto = async () => {
    if (captureBusy || !videoRef.current || !active) return
    setCaptureBusy(true)
    setCaptureMessage('正在處理相片…')
    const video = videoRef.current
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) { setCameraError('鏡頭尚未準備好，請稍候再按快門'); return }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('無法建立畫��')
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('無法擷取相片')), 'image/jpeg', 0.92))
      const result = await stampImage(new File([blob], 'camera.jpg', { type: 'image/jpeg' }), active)
      setPhotos(p => [{ id: crypto.randomUUID(), src: result.stamped, cleanSrc: result.clean, category: active, tags, note, createdAt: new Date().toISOString(), projectId: currentProject.id }, ...p])
      setCameraError('')
      setCaptureMessage('已拍攝並儲存，可繼續拍攝')
      window.setTimeout(() => setCaptureMessage(''), 1800)
    } catch (error) { console.error('[v0] capture failed:', error); setCameraError('拍攝失敗，請稍候再試'); setCaptureMessage('') }
    finally { setCaptureBusy(false) }
  }
  const importFiles = async (files: FileList | null) => {
    if (!files || !active) return
    const added = await Promise.all(Array.from(files).map(async file => { const result = await stampImage(file, active); return { id: crypto.randomUUID(), src: result.stamped, cleanSrc: result.clean, category: active, tags, note, createdAt: new Date().toISOString(), projectId: currentProject.id } }))
    setPhotos(p => [...added, ...p]); setTab('photos')
  }
  const addProject = () => {
    const name = newProjectName.trim()
    if (!name) return
    if (projects.some(project => project.name === name)) { alert('Project 名稱已存在'); return }
    const project = { id: crypto.randomUUID(), name }
    setProjects(current => [...current, project])
    setCurrentProjectId(project.id)
    const projectSettings = project.settings || createProjectSettings()
    setCategories(projectSettings.categories)
    setTags(projectSettings.tags)
    setNote(projectSettings.note)
    setSettingsOptions(projectSettings.settingsOptions)
    setNewProjectName('')
    setProjectPanel(false)
    setActive(null)
    setSelected([])
  }
  const addCategory = (name: string) => { if (name.trim()) setCategories(c => [...c, { name: name.trim(), icon: '＋' }]); setNewCategory(false) }
  const removeCategory = (name: string) => { if (confirm(`確定刪除「${name}」及其相片？`)) { setCategories(c => c.filter(x => x.name !== name)); setPhotos(p => p.filter(x => x.category !== name)) } }
  const exportExcel = async () => {
    const chosen = photos.filter(x => selected.includes(x.id))
    if (!chosen.length) { alert('請先勾選要匯出���相片'); return }
    try {
      const book = new ExcelJS.Workbook()
      const sheet = book.addWorksheet('相片記錄')
      sheet.columns = [{ header: '日期', key: 'date', width: 16 }, { header: '時間', key: 'time', width: 14 }, { header: '類別', key: 'category', width: 18 }, { header: '細項說明', key: 'detail', width: 34 }, { header: '備註', key: 'note', width: 28 }, { header: '照片', key: 'photo', width: 28 }]
      for (const p of chosen) {
        const capturedAt = new Date(p.createdAt)
        const row = sheet.addRow({ date: capturedAt.toLocaleDateString('zh-HK'), time: capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }), category: p.category, detail: Object.entries(p.tags).filter(([key, value]) => key !== '備註' && value).map(([key, value]) => `${key}: ${value}`).join('\n'), note: p.note || p.tags['備註'] || '' })
        const cleanDataUrl = await imageAsJpeg(p.cleanSrc)
        const imageId = book.addImage({ base64: cleanDataUrl, extension: 'jpeg' })
        sheet.addImage(imageId, { tl: { col: 5, row: row.number - 1 }, ext: { width: 165, height: 165 } })
        row.height = 130
      }
      const buffer = await book.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = '地盤相片記錄.xlsx'
      document.body.appendChild(link)
      link.click()
      setTimeout(() => { link.remove(); URL.revokeObjectURL(url) }, 3000)
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share && typeof File !== 'undefined') {
        const file = new File([buffer], '地盤相片記錄.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '地盤相片記錄.xlsx' })
      }
    } catch (error) {
      console.error('[v0] ExcelJS export failed:', error)
      alert(`Excel 匯出失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }
  const exportPdf = async () => {
    const chosen = photos.filter(x => selected.includes(x.id))
    if (!chosen.length) { alert('請先勾選要匯出的相片'); return }
  const report = document.createElement('div')
  report.className = 'export-preview-overlay'
  report.innerHTML = `<div class="export-backdrop"></div><div class="export-report-preview"><h1>地盤相片記錄報表（A3 橫向排版）</h1><div class="export-report-head"><b>日期</b><b>時間</b><b>類別</b><b>細項說明</b><b>備註</b><b>照片</b></div>${chosen.map(p => { const capturedAt = new Date(p.createdAt); const detail = Object.entries(p.tags).filter(([key, value]) => key !== '備註' && value).map(([key, value]) => `${key}: ${value}`).join('<br>'); return `<article><div>${capturedAt.toLocaleDateString('zh-HK')}</div><div>${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div>${p.category}</div><div>${detail || '—'}</div><div>${p.note || p.tags['備註'] || '—'}</div><img src="${p.src}" alt="${p.category}相片"></article>` }).join('')}</div><div class="export-sheet"><div class="sheet-handle"></div><button class="export-back" id="close-report" aria-label="返回上一頁">‹</button><h2>地盤相片記錄報表預覽（A3 橫向）</h2><div class="export-sheet-actions"><button id="excel-report">下載 Excel（含相片）</button><button id="print-report">下載 A3 橫向 PDF</button><button class="export-close" id="close-report-2">關閉</button></div></div>`
  document.body.appendChild(report)
  report.querySelector('#close-report')?.addEventListener('click', () => report.remove())
  report.querySelector('#close-report-2')?.addEventListener('click', () => report.remove())
  report.querySelector('#excel-report')?.addEventListener('click', () => exportExcel())
  report.querySelector('#print-report')?.addEventListener('click', () => exportPdfLegacy())
  return
  }
  const exportPdfLegacy = async () => {
    const chosen = photos.filter(x => selected.includes(x.id))
  if (!chosen.length) return alert('請先勾選要匯出的相片')
  let html2canvas: any
  let JsPDF: any
  try {
    const [canvasModule, pdfModule] = await Promise.all([import('html2canvas'), import('jspdf')])
    html2canvas = (canvasModule as any).default || canvasModule
    JsPDF = (pdfModule as any).jsPDF
    if (typeof html2canvas !== 'function' || typeof JsPDF !== 'function') throw new Error('PDF 模組格式不正確')
  } catch (error) {
    console.error('[v0] PDF module load failed:', error)
    alert('PDF 模組載入失敗，請重新整理頁面後再試')
    return
  }
  const report = document.createElement('div')
    report.style.cssText = `position:absolute;left:0;top:0;width:1120px;min-height:${Math.max(520, chosen.length * 180 + 100)}px;display:block;visibility:visible;opacity:1;overflow:visible;background:#fff;color:#15212b;padding:24px;z-index:999999;pointer-events:none;`
    report.innerHTML = `<h1 style="font-size:22px;margin:0 0 18px">地盤相片記錄報表（A3 橫向排版）</h1><div style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;background:#e5e9ee;font-weight:700;padding:12px">${['日期','時間','類別','細項說明','備註','照片'].map(label => `<div style="padding:10px;border-right:1px solid #ccd4db">${label}</div>`).join('')}</div>` + chosen.map(p => { const capturedAt = new Date(p.createdAt); const detail = Object.entries(p.tags).filter(([key, value]) => key !== '備註' && value).map(([key, value]) => `${key}: ${value}`).join('<br>'); return `<article style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;align-items:center;border-top:1px solid #d8e0e5;padding:14px 0;break-inside:avoid;min-height:150px"><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleDateString('zh-HK')}</div><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div style="padding:10px;overflow-wrap:anywhere">${p.category}</div><div style="padding:10px;overflow-wrap:anywhere">${detail || '—'}</div><div style="padding:10px;overflow-wrap:anywhere">${p.note || p.tags['備註'] || '—'}</div><img src="${p.src}" width="165" height="125" style="display:block;width:165px;height:125px;object-fit:cover"/></article>` }).join('')
    document.body.appendChild(report)
    await Promise.all(Array.from(report.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    try { const canvas = await html2canvas(report, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', windowWidth: 1120 }); const pdfDocument = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' }); const pageWidth = pdfDocument.internal.pageSize.getWidth(); const pageHeight = pdfDocument.internal.pageSize.getHeight(); const imageHeight = canvas.height * pageWidth / canvas.width; let offset = 0; while (offset < imageHeight) { if (offset > 0) pdfDocument.addPage(); pdfDocument.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 8, 8 - offset, pageWidth - 16, imageHeight); offset += pageHeight - 16; } const pdfBlob = pdfDocument.output('blob'); const pdfUrl = URL.createObjectURL(pdfBlob); const downloadLink = document.createElement('a'); downloadLink.href = pdfUrl; downloadLink.download = '地盤相片報表.pdf'; downloadLink.rel = 'noopener'; document.body.appendChild(downloadLink); downloadLink.click(); downloadLink.remove(); if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share && typeof File !== 'undefined') { const pdfFile = new File([pdfBlob], '地盤相片報表.pdf', { type: 'application/pdf' }); if (navigator.canShare?.({ files: [pdfFile] })) { await navigator.share({ files: [pdfFile], title: '地盤相片報表.pdf' }); } } window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000); }
    catch (error) { console.error('[v0] PDF export failed:', error); alert(`PDF 匯出失敗：${error instanceof Error ? error.message : '請稍後再試'}`) }
    finally { window.setTimeout(() => report.remove(), 1000) }
  }

  return <>
    {isOffline && <div className="offline-banner" role="status">目前為離線模式，資料會儲存在本機</div>}
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark">▦</div><button className="project-trigger" onClick={() => setProjectPanel(true)} aria-label="選擇 Project"><strong>{currentProject.name}</strong><span>⌄</span></button><button className="icon-button" onClick={() => setNewCategory(true)} aria-label="新增類別">＋</button></header>
      {tab === 'home' && !active && <section className="content"><div className="section-heading"><div><p className="eyebrow">PROJECT ARCHIVE</p><h2>工程類別</h2></div><span className="photo-total">{projectPhotos.length} 張相片</span></div><div className="category-grid">{categories.map(c => <button key={c.name} className="category-card" onClick={() => setActive(c.name)} onContextMenu={e => { e.preventDefault(); removeCategory(c.name) }}><span className="category-icon">{c.icon}</span><strong>{c.name}</strong><span>{projectPhotos.filter(p => p.category === c.name).length} 張記錄</span></button>)}<button className="category-card add-card" onClick={() => setNewCategory(true)}><span className="category-icon">＋</span><strong>新增類別</strong><span>自訂工程分類</span></button></div><div className="hint">長按類別卡片可刪除分類</div></section>}
      {tab === 'home' && active && <section className="content"><button className="back-link" onClick={() => setActive(null)}>‹ 所有類別</button><div className="section-heading"><div><p className="eyebrow">CURRENT CATEGORY</p><h2>{active}</h2></div><span className="photo-total">{currentPhotos.length} 張</span></div><div className="capture-actions"><button className="capture-button camera" onClick={startContinuousCamera}><span>▣</span><div><strong>連續拍攝</strong><small>拍完可立即拍下一張</small></div></button><button className="capture-button secondary-camera" onClick={() => cameraRef.current?.click()}><span>□</span><div><strong>立即拍照</strong><small>使用 iPhone 原生相機</small></div></button><button className="capture-button album" onClick={() => albumRef.current?.click()}><span>▧</span><div><strong>選擇相簿</strong><small>可一��匯入多張</small></div></button><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e => importFiles(e.target.files)} /><input ref={albumRef} hidden type="file" accept="image/*" multiple onChange={e => importFiles(e.target.files)} /></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>拍攝資訊</h3></div><span className="memory-dot">● 已記憶</span></div><div className="tag-grid">{['樓層', '機房', '事項', '安全', '其它', '備註'].map(label => <button className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} onClick={() => setPicker(label)}><span>{label}</span><b>{tags[label] || '選擇'}</b></button>)}</div><label className="note-field"><span>文字備註</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="輸入本次拍攝的補充說明..." /></label></div></section>}
      {tab === 'settings' && <section className="content settings-page"><div className="section-heading"><div><p className="eyebrow">APP SETTINGS</p><h2>設定</h2></div></div><p className="settings-intro">自訂六個標籤類別的選項，之後拍攝時會自動提供。</p>{['樓層', '機房', '事項', '安全', '其它', '備註'].map(label => <div className="settings-group" key={label}><div className="settings-group-title"><strong>{label}</strong><span>{(settingsOptions[label] || []).length} 個選項</span></div><div className="settings-options">{(settingsOptions[label] || []).map(option => <button key={option} onClick={() => setSettingsOptions(current => ({ ...current, [label]: current[label].filter(item => item !== option) }))}>{option}<span>×</span></button>)}</div><div className="settings-add"><input value={newOption[label] || ''} onChange={e => setNewOption(current => ({ ...current, [label]: e.target.value }))} placeholder={`新增${label}選項`} /><button onClick={() => { const value = (newOption[label] || '').trim(); if (!value) return; setSettingsOptions(current => ({ ...current, [label]: [...(current[label] || []), value] })); setNewOption(current => ({ ...current, [label]: '' })) }}>新增</button></div></div>)}</section>}
      {tab === 'photos' && <section className="content"><div className="section-heading photo-heading"><div><p className="eyebrow">PHOTO ARCHIVE</p><h2>相片集</h2></div><div className="photo-actions"><span className="photo-total">已選 {selected.length} 張</span><div className="export-bar"><button onClick={exportExcel}>匯出 Excel</button><button onClick={exportPdf}>匯出 A3 PDF</button></div></div></div><div className="photo-grid">{projectPhotos.map(p => <div className="photo-card" key={p.id}><button className="photo-open" onClick={() => setDetail(p)}><img src={p.src} alt={`${p.category} ${p.createdAt}`} /></button><label className="check"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /><span /></label></div>)}{!projectPhotos.length && <div className="empty-state">尚未有相片記錄<br /><small>進入工程類別開始拍攝</small></div>}</div><div id="pdf-report" className="pdf-report" aria-hidden="true"><h1>地盤相片記錄報表</h1>{photos.filter(p => selected.includes(p.id)).map(p => <article key={p.id}><img src={p.src} alt="" /><div><b>{p.category}</b><p>{Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ')}</p><p>{p.note}</p><small>{new Date(p.createdAt).toLocaleString('zh-HK')}</small></div></article>)}</div></section>}
      <nav className="bottom-nav"><button className={tab === 'home' ? 'active' : ''} onClick={() => { setTab('home'); setActive(null) }}><span>⌂</span>工程類別</button><button className={tab === 'photos' ? 'active' : ''} onClick={() => { setTab('photos'); setActive(null) }}><span>▧</span>相片集<em>{projectPhotos.length}</em></button><button className={tab === 'settings' ? 'active' : ''} onClick={() => { setTab('settings'); setActive(null) }}><span>⚙</span>設定</button></nav>
    </main>
    {continuousCamera && <div className="overlay dark-overlay camera-overlay"><div className="camera-sheet"><div className="camera-topline"><span className="camera-spacer" aria-hidden="true" /><button className={`camera-flash ${flashEnabled ? 'selected' : ''}`} onClick={toggleFlash} aria-label="切換閃光燈">ϟ<span>{flashEnabled ? 'ON' : 'A'}</span></button><div className="camera-status"><i /> LIVE · {currentPhotos.length} 張</div></div>{captureMessage && <p className="capture-message" role="status">{captureMessage}</p>}<div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted /><span className="frame-corner top-left" /><span className="frame-corner top-right" /><span className="frame-corner bottom-left" /><span className="frame-corner bottom-right" /><div className="zoom-controls" aria-label="縮放倍率"><button onClick={() => changeZoom(.5)} className={zoomLevel === .5 ? 'selected' : ''}>0.5</button><button onClick={() => changeZoom(1)} className={zoomLevel === 1 ? 'selected' : ''}>1×</button><button onClick={() => changeZoom(2)} className={zoomLevel === 2 ? 'selected' : ''}>2</button><button onClick={() => changeZoom(5)} className={zoomLevel === 5 ? 'selected' : ''}>5</button></div></div>{cameraError && <p className="camera-error">{cameraError}</p>}<div className="camera-toolbar"><button className="camera-control" onClick={stopContinuousCamera} aria-label="取消拍攝">×</button><button className={`shutter ${captureBusy ? 'is-busy' : ''}`} onClick={captureContinuousPhoto} disabled={captureBusy} aria-label="拍攝相片">{captureBusy ? '…' : ''}</button><button className="camera-control" aria-label="切換鏡頭">↻</button></div></div></div>}
    {cameraError && !continuousCamera && <div className="camera-error-banner">{cameraError}</div>}
    {picker && <div className="overlay" onClick={() => setPicker(null)}><div className="sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SELECT OPTION</p><h3>{picker}</h3></div><button className="close" onClick={() => setPicker(null)}>×</button></div>{(settingsOptions[picker] || []).map(option => <button className="option" key={option} onClick={() => { setTags(t => ({ ...t, [picker]: option })); setPicker(null) }}>{option}<span>{tags[picker] === option ? '✓' : '›'}</span></button>)}<div className="custom-option"><input id="custom" placeholder="新增自訂項目" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.value.trim()) { setTags(t => ({ ...t, [picker]: e.currentTarget.value.trim() })); setPicker(null) } }} /><button onClick={() => { const input = document.getElementById('custom') as HTMLInputElement; if (input.value.trim()) { setTags(t => ({ ...t, [picker]: input.value.trim() })); setPicker(null) } }}>新增</button></div></div></div>}
    {detail && <div className="overlay dark-overlay" onClick={() => setDetail(null)}><div className="detail-modal" onClick={e => e.stopPropagation()}><button className="close light" onClick={() => setDetail(null)}>×</button><img src={detail.src} alt="相片詳情" /><div className="detail-copy"><b>{detail.category}</b><p>{Object.entries(detail.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ') || '未設定標籤'}</p><p>{detail.note || '沒有備註'}</p><small>{new Date(detail.createdAt).toLocaleString('zh-HK')}</small></div></div></div>}
    {projectPanel && <div className="overlay" onClick={() => setProjectPanel(false)}><div className="sheet project-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">PROJECTS</p><h3>選擇 Project</h3></div><button className="close" onClick={() => setProjectPanel(false)} aria-label="關閉">×</button></div>{projects.map(project => <button className={`option ${project.id === currentProject.id ? 'chosen' : ''}`} key={project.id} onClick={() => { const projectSettings = project.settings || createProjectSettings(); setCurrentProjectId(project.id); setCategories(projectSettings.categories); setTags(projectSettings.tags); setNote(projectSettings.note); setSettingsOptions(projectSettings.settingsOptions); setProjectPanel(false); setActive(null); setSelected([]) }}><span>{project.name}<small>{photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === project.id).length} 張相片</small></span><b>{project.id === currentProject.id ? '✓' : '›'}</b></button>)}<div className="project-add"><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="輸入新 Project 名稱" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addProject() }} /><button onClick={addProject}>新增</button></div></div></div>}
    {newCategory && <div className="overlay" onClick={() => setNewCategory(false)}><div className="sheet small-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">NEW CATEGORY</p><h3>新增工程類別</h3></div><button className="close" onClick={() => setNewCategory(false)}>×</button></div><input className="category-input" autoFocus placeholder="例如：外牆工程" onKeyDown={e => { if (e.key === 'Enter') addCategory(e.currentTarget.value) }} /><button className="primary-button" onClick={() => addCategory((document.querySelector('.category-input') as HTMLInputElement).value)}>建立類別</button></div></div>}
  </>
}
