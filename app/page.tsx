'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { Camera, PenLine, ClipboardList, Building2, Info } from 'lucide-react'
import { SiteMemo } from '@/components/site-memo/site-memo'
import { Handover } from '@/components/handover/handover'
import { loadAllHandover, saveAllHandover, type Tower } from '@/components/handover/handover-data'

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
const tagOptions: Record<string, string[]> = {
  樓層: ['B02', 'B01', 'L00', 'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L19', 'MR/F', 'UR1/F', 'UR2/F'],
  機房: ['電制房', '總制房', '發電機房', 'AHU房', 'ELV房', 'TR房'],
  房間名稱: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S8', 'ELV1', 'ELV2', 'ELV3', 'ELV4', 'TR1', 'TR2', 'TR3', 'TR4', '1', '2', '3', '4'],
  事項: ['Defect', '未做喉', '未做糟', '未補明喉', '未穿線', '未裝燈', '未裝膠器', '未起鐵架', '未封板', '未開吼', '未塞吼', '未裝門', '進度慢', '被破壞', '受其它行頭阻礙', '受建築阻礙', '建築漏水', '其它行頭無跟CSD做'],
  安全: ['無圍欄', '不正規高空工作', '無安全帶', '無帶安全帽', '無安全繩', '地坑無鐵板', '吸煙'],
  收貨相關: ['已收待驗', '已入貨倉', '已交判頭', '來貨有問題', '來貨破爛'],
}

const createProjectSettings = (): ProjectSettings => ({
  categories: defaultCategories,
  tags: {},
  note: '',
  settingsOptions: tagOptions,
})

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

function stampImage(file: File, category: string, tags: Record<string, string> = {}, note = '', projectName = '') {
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
        const detailLines = Object.entries(tags).filter(([, value]) => value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`)
        if (note.trim()) detailLines.push(`文字備註: ${note.trim()}`)
        const lines = [`${projectName ? `${projectName} | ` : ''}${category} | ${new Date().toLocaleString('zh-HK', { hour12: false })}`, ...detailLines]
        const size = Math.max(18, Math.round(image.width / 48))
        const lineHeight = size * 1.35
        ctx.font = `600 ${size}px Arial, sans-serif`
        const width = Math.min(image.width * 0.92, Math.max(...lines.map(line => ctx.measureText(line).width)) + size * 1.4)
        const height = lineHeight * lines.length + size * 0.8
        ctx.fillStyle = 'rgba(10, 17, 24, .78)'
        ctx.fillRect(image.width - width, image.height - height, width, height)
        ctx.fillStyle = '#fff'
        ctx.textBaseline = 'top'
        lines.forEach((line, index) => ctx.fillText(line, image.width - width + size * 0.7, image.height - height + size * 0.4 + index * lineHeight, width - size))
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
  const [appMode, setAppMode] = useState<'photo' | 'memo' | 'handover' | 'reserve' | 'about'>('photo')
  const [tab, setTab] = useState<'home' | 'photos' | 'settings'>('home')
  const [settingsOptions, setSettingsOptions] = useState<Record<string, string[]>>(tagOptions)
  const [newOption, setNewOption] = useState<Record<string, string>>({})
  const [settingsReady, setSettingsReady] = useState(false)
  const [tags, setTags] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [noteHistory, setNoteHistory] = useState<string[]>([])
  const [selectedNotes, setSelectedNotes] = useState<string[]>([])
  const [picker, setPicker] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<Photo | null>(null)
  const [newCategory, setNewCategory] = useState(false)
  const [handoverView, setHandoverView] = useState<'home' | 'manage'>('home')
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
  const folderHandleRef = useRef<any>(null)
  const [folderConnected, setFolderConnected] = useState(false)

  const [isOffline, setIsOffline] = useState(false)
  const [storageStatus, setStorageStatus] = useState('本機保存中')
  useEffect(() => {
    navigator.storage?.persist?.().then((persisted) => setStorageStatus(persisted ? '本機持久保存' : '本機保存中')).catch(() => undefined)
  }, [])
  useEffect(() => {
  if ('serviceWorker' in navigator) {
  const workerResetKey = 'site-photo-worker-reset-v9'
  const resetOldWorker = async () => {
    if (sessionStorage.getItem(workerResetKey)) return false
    sessionStorage.setItem(workerResetKey, '1')
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
    return true
  }
  resetOldWorker().then((wasReset) => {
    if (wasReset) { window.location.reload(); return }
    navigator.serviceWorker.register('/sw.js?v=9', { updateViaCache: 'none' }).then((registration) => { if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' }); window.setTimeout(() => { const urls = performance.getEntriesByType('resource').map((entry) => new URL((entry as PerformanceResourceTiming).name, location.href)).filter((url) => url.origin === location.origin).map((url) => `${url.pathname}${url.search}`); registration.active?.postMessage({ type: 'CACHE_RESOURCES', urls: [...new Set(['/', '/manifest.webmanifest', ...urls])] }) }, 1000); return registration.update() }).catch(() => undefined)
  }).catch(() => undefined)
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
      const savedNoteHistory = localStorage.getItem('site-photo-note-history')
      if (savedNoteHistory) setNoteHistory(JSON.parse(savedNoteHistory).slice(0, 10))
      if (savedOptions) { const saved = JSON.parse(savedOptions); if (saved['其它'] && !saved['收貨相關']) { saved['收貨相關'] = saved['其它']; delete saved['其它'] } if (saved['備註'] && !saved['房間名稱']) { saved['房間名稱'] = saved['備註']; delete saved['備註'] } setSettingsOptions({ ...tagOptions, ...saved }) }
    } catch { /* 儲存空間不可用時仍可繼續拍攝 */ }
    setSettingsReady(true)
  }, [])
  useEffect(() => {
    if (!settingsReady) return
    saveStoredPhotos(photos).catch(() => undefined)
  }, [settingsReady, photos])
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
      localStorage.setItem('site-photo-memory', JSON.stringify({ tags: Object.fromEntries(Object.entries(tags).filter(([, value]) => value && value !== 'N/A')), note }))
      localStorage.setItem('site-photo-options', JSON.stringify(settingsOptions))
    } catch { /* 記憶不可用不影響拍攝 */ }
  }, [settingsReady, tags, note, settingsOptions])
  useEffect(() => { try { localStorage.setItem('site-photo-note-history', JSON.stringify(noteHistory)) } catch { /* ignore */ } }, [noteHistory])
  const rememberNote = () => {
    const value = note.trim()
    if (!value) return
    setNoteHistory(current => [value, ...current.filter(item => item !== value)].slice(0, 10))
  }
  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
      localStorage.setItem(CURRENT_PROJECT_KEY, currentProjectId)
    } catch { /* 儲存空間不可用時仍可使用暫存狀態 */ }
  }, [projects, currentProjectId])

  const currentProject = projects.find(project => project.id === currentProjectId) || DEFAULT_PROJECT
  const projectPhotos = useMemo(() => photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === currentProject.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [currentProject.id, photos])
  const currentPhotos = useMemo(() => active ? projectPhotos.filter(p => p.category === active) : projectPhotos, [active, projectPhotos])
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()) }, [])
  const connectProjectFolder = async () => {
    const picker = (window as any).showDirectoryPicker
    if (!picker) { setProjectPanel(true); return }
    try {
      const root = await picker({ mode: 'readwrite' })
      folderHandleRef.current = root
      setFolderConnected(true)
      setCaptureMessage('已連接本機 Project Camera 資料夾')
    } catch { setCaptureMessage('未選擇資料夾') }
  }
  const saveToProjectFolder = async (photo: Photo) => {
    const root = folderHandleRef.current
    if (!root) return
    try {
      const projectDir = await root.getDirectoryHandle(currentProject.name.replace(/[\\/:*?"<>|]/g, '_'), { create: true })
      const photosDir = await projectDir.getDirectoryHandle('photos', { create: true })
      const blob = await (await fetch(photo.src)).blob()
      const file = await photosDir.getFileHandle(`${photo.id}.jpg`, { create: true })
      const writable = await file.createWritable(); await writable.write(blob); await writable.close()
      const settings = await projectDir.getFileHandle('settings.json', { create: true })
      const settingsWritable = await settings.createWritable(); await settingsWritable.write(JSON.stringify({ project: currentProject, categories, settingsOptions, tags, note }, null, 2)); await settingsWritable.close()
    } catch (error) { console.error('[v0] folder save failed:', error) }
  }
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
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('無法建立畫布')
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('無法擷取相片')), 'image/jpeg', 0.92))
      const result = await stampImage(new File([blob], 'camera.jpg', { type: 'image/jpeg' }), active, tags, note, currentProject.name)
      const photo = { id: crypto.randomUUID(), src: result.stamped, cleanSrc: result.clean, category: active, tags, note, createdAt: new Date().toISOString(), projectId: currentProject.id }
      setPhotos(p => [photo, ...p])
      await saveToProjectFolder(photo)
      setCameraError('')
      setCaptureMessage('已拍攝並儲存，可繼續拍攝')
      window.setTimeout(() => setCaptureMessage(''), 1800)
    } catch (error) { console.error('[v0] capture failed:', error); setCameraError('拍攝失敗，請稍候再試'); setCaptureMessage('') }
    finally { setCaptureBusy(false) }
  }
  const importFiles = async (files: FileList | null) => {
    if (!files || !active) return
    const added = await Promise.all(Array.from(files).map(async file => { const result = await stampImage(file, active, tags, note, currentProject.name); return { id: crypto.randomUUID(), src: result.stamped, cleanSrc: result.clean, category: active, tags, note, createdAt: new Date().toISOString(), projectId: currentProject.id } }))
    setPhotos(p => [...added, ...p]); await Promise.all(added.map(saveToProjectFolder)); setTab('photos')
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
    const chosen = photos.filter(x => selected.includes(x.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (!chosen.length) { alert('請先勾選要匯出的相片'); return }
    try {
      const book = new ExcelJS.Workbook()
      const sheet = book.addWorksheet('相片記錄')
      sheet.columns = [{ header: '日期', key: 'date', width: 16 }, { header: '時間', key: 'time', width: 14 }, { header: '類別', key: 'category', width: 18 }, { header: '細項說明', key: 'detail', width: 34 }, { header: '備註', key: 'note', width: 28 }, { header: '照片', key: 'photo', width: 28 }]
      for (const p of chosen) {
        const capturedAt = new Date(p.createdAt)
        const row = sheet.addRow({ date: capturedAt.toLocaleDateString('zh-HK'), time: capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }), category: p.category, detail: Object.entries(p.tags).filter(([key, value]) => key !== '備註' && value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('\n'), note: p.note || (p.tags['備註'] === 'N/A' ? '' : p.tags['備註']) || '' })
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
    const chosen = photos.filter(x => selected.includes(x.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (!chosen.length) { alert('請先勾選要匯出的相片'); return }
  const report = document.createElement('div')
  report.className = 'export-preview-overlay'
  report.innerHTML = `<div class="export-backdrop"></div><div class="export-report-preview"><h1>地盤相片記錄報表（A3 橫向排版）</h1><div class="export-report-head"><b>日期</b><b>時間</b><b>類別</b><b>細項說明</b><b>備註</b><b>照片</b></div>${chosen.map(p => { const capturedAt = new Date(p.createdAt); const detail = Object.entries(p.tags).filter(([key, value]) => key !== '備註' && value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('<br>'); return `<article><div>${capturedAt.toLocaleDateString('zh-HK')}</div><div>${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div>${p.category}</div><div>${detail || '—'}</div><div>${p.note || p.tags['備註'] || '—'}</div><img src="${p.src}" alt="${p.category}相片"></article>` }).join('')}</div><div class="export-sheet"><div class="sheet-handle"></div><button class="export-back" id="close-report" aria-label="返回上一頁">‹</button><h2>地盤相片記錄報表預覽（A3 橫向）</h2><div class="export-sheet-actions"><button id="print-report">匯出報告</button><button class="export-close" id="close-report-2">關閉</button></div></div>`
  document.body.appendChild(report)
  report.querySelector('#close-report')?.addEventListener('click', () => report.remove())
  report.querySelector('#close-report-2')?.addEventListener('click', () => report.remove())
  report.querySelector('#print-report')?.addEventListener('click', () => exportPdfLegacy())
  return
  }
  const exportPdfLegacy = async () => {
    const chosen = photos.filter(x => selected.includes(x.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
    report.innerHTML = `<div style="height:64px"></div><div style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;background:#e5e9ee;font-weight:700;padding:12px">${['日期','時間','類別','細項說明','備註','照片'].map(label => `<div style="padding:10px;border-right:1px solid #ccd4db">${label}</div>`).join('')}</div>` + chosen.map(p => { const capturedAt = new Date(p.createdAt); const detail = Object.entries(p.tags).filter(([key, value]) => key !== '備註' && value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('<br>'); const memoValue = p.tags['備註'] === 'N/A' ? '' : p.tags['備註']; return `<article style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;align-items:center;border-top:1px solid #d8e0e5;padding:14px 0;break-inside:avoid;min-height:150px"><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleDateString('zh-HK')}</div><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div style="padding:10px;overflow-wrap:anywhere">${p.category}</div><div style="padding:10px;overflow-wrap:anywhere">${detail || '—'}</div><div style="padding:10px;overflow-wrap:anywhere">${p.note || memoValue || '—'}</div><img src="${p.src}" width="165" height="125" style="display:block;width:165px;height:125px;object-fit:cover"/></article>` }).join('')
    document.body.appendChild(report)
    await Promise.all(Array.from(report.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    try { const headingElement = document.createElement('div'); headingElement.style.cssText = 'position:absolute;left:0;top:0;width:1120px;height:64px;background:#fff;color:#15212b;padding:20px 24px;font-size:22px;font-weight:700;box-sizing:border-box;z-index:1000000;'; headingElement.textContent = '地盤相片記錄報表（A3 橫向排版）'; document.body.appendChild(headingElement); const headingCanvas = await html2canvas(headingElement, { scale: 1.5, backgroundColor: '#ffffff', windowWidth: 1120 }); headingElement.remove(); const canvas = await html2canvas(report, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', windowWidth: 1120 }); const pdfDocument = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' }); const pageWidth = pdfDocument.internal.pageSize.getWidth(); const pageHeight = pdfDocument.internal.pageSize.getHeight(); const margin = 8; const headingHeight = 12; const printableWidth = pageWidth - margin * 2; const printableHeight = pageHeight - margin * 2 - headingHeight; const pixelsPerMm = canvas.width / printableWidth; const pagePixels = Math.floor(printableHeight * pixelsPerMm); let sourceY = 0; let pageIndex = 0; while (sourceY < canvas.height) { if (pageIndex > 0) pdfDocument.addPage(); const sliceHeight = Math.min(pagePixels, canvas.height - sourceY); const pageCanvas = document.createElement('canvas'); pageCanvas.width = canvas.width; pageCanvas.height = sliceHeight; const pageContext = pageCanvas.getContext('2d'); if (!pageContext) throw new Error('PDF page canvas unavailable'); pageContext.fillStyle = '#fff'; pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height); pageContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight); const renderedHeight = sliceHeight / pixelsPerMm; pdfDocument.addImage(headingCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, printableWidth, headingHeight); pdfDocument.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin + headingHeight, printableWidth, renderedHeight); sourceY += sliceHeight; pageIndex += 1; } const pdfBlob = pdfDocument.output('blob'); const pdfUrl = URL.createObjectURL(pdfBlob); const downloadLink = document.createElement('a'); downloadLink.href = pdfUrl; downloadLink.download = '地盤相片報表.pdf'; downloadLink.rel = 'noopener'; document.body.appendChild(downloadLink); downloadLink.click(); downloadLink.remove(); if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share && typeof File !== 'undefined') { const pdfFile = new File([pdfBlob], '地盤相片報表.pdf', { type: 'application/pdf' }); if (navigator.canShare?.({ files: [pdfFile] })) { await navigator.share({ files: [pdfFile], title: '地盤相片報表.pdf' }); } } window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000); }
    catch (error) { console.error('[v0] PDF export failed:', error); alert(`PDF 匯出失敗：${error instanceof Error ? error.message : '請稍後再試'}`) }
    finally { window.setTimeout(() => report.remove(), 1000) }
  }

  const exportLocalBackup = async () => {
    const zip = new JSZip()
    zip.file('projects.json', JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), currentProjectId, projects }, null, 2))
    try { const handover = await loadAllHandover(); zip.file('handover.json', JSON.stringify(handover, null, 2)) } catch { /* 制房移交資料不可用時仍可匯出相片 */ }
    for (const project of projects) {
      const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}`
      zip.file(`${prefix}/settings.json`, JSON.stringify(project.settings || {}, null, 2))
      for (const photo of photos.filter(item => item.projectId === project.id)) {
        const image = await fetch(photo.src).then(response => response.blob())
        zip.file(`${prefix}/photos/${photo.id}.jpg`, image)
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], `project-camera-backup-${new Date().toISOString().slice(0, 10)}.zip`, { type: 'application/zip' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Project Camera ZIP 備份' }); return }
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000)
  }
  const importLocalBackup = async (file: File | undefined) => {
    if (!file) return
    try {
      const zip = await JSZip.loadAsync(file)
      const manifest = zip.file('projects.json'); if (!manifest) throw new Error('找不到 projects.json')
      const data = JSON.parse(await manifest.async('text'))
      if (!Array.isArray(data.projects)) throw new Error('格式不正確')
      const restored: Photo[] = []
      for (const project of data.projects) {
        const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}/photos/`
        const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith(prefix)) as JSZip.JSZipObject[]
        for (const entry of entries) { const blob = await entry.async('blob'); const src = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) }); restored.push({ id: entry.name.split('/').pop()!.replace(/\\.jpg$/, ''), src, cleanSrc: src, category: project.settings?.categories?.[0]?.name || '其它', tags: {}, note: '', createdAt: new Date().toISOString(), projectId: project.id }) }
      }
      const handoverFile = zip.file('handover.json')
      if (handoverFile) { try { await saveAllHandover(JSON.parse(await handoverFile.async('text')) as Record<string, Tower[]>) } catch { /* 制房移交資料格式不正確時略過 */ } }
      setProjects(data.projects); setCurrentProjectId(data.currentProjectId || data.projects[0]?.id || DEFAULT_PROJECT.id); setPhotos(restored); alert('ZIP 備份已還原')
    } catch { alert('ZIP 備份檔案無法讀取') }
  }

  if (appMode === 'memo') return <SiteMemo projectName={currentProject.name} onBack={() => setAppMode('photo')} onNavigate={mode => { if (mode === 'handover') setHandoverView('manage'); setAppMode(mode); if (mode === 'photo') { setTab('home'); setActive(null) } }} />

  if (appMode === 'handover') return <Handover initialView={handoverView} projectId={currentProject.id} projectName={currentProject.name} onBack={() => { setAppMode('photo'); setTab('home'); setActive(null) }} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('home'); setActive(null) } }} onExportBackup={exportLocalBackup} onImportBackup={importLocalBackup} />

  return <>
    {isOffline && <div className="offline-banner" role="status">目前為離線模式，資料會儲存在本機</div>}
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark" aria-hidden="true">▦</div><button className="project-trigger" onClick={() => setProjectPanel(true)} aria-label="選擇 Project"><strong>{currentProject.name}</strong><span>⌄</span></button></header>
      {appMode === 'photo' && tab === 'home' && !active && <section className="content"><div className="quick-card-grid"><button className="quick-card" onClick={() => { setTab('photos'); setActive(null) }}><span>▧</span><div><strong>相片集</strong><small>{projectPhotos.length} 張相片</small></div></button><button className="quick-card" onClick={() => { setTab('settings'); setActive(null) }}><span>⚙</span><div><strong>設定</strong><small>類別與備份</small></div></button></div><div className="section-heading"><div><p className="eyebrow">PROJECT ARCHIVE</p><h2>工程類別</h2></div><span className="photo-total">{projectPhotos.length} 張相片</span></div><div className="category-grid">{categories.map(c => <button key={c.name} className="category-card" onClick={() => setActive(c.name)} onContextMenu={e => { e.preventDefault(); removeCategory(c.name) }}><span className="category-icon">{c.icon}</span><strong>{c.name}</strong><span>{projectPhotos.filter(p => p.category === c.name).length} 張記錄</span></button>)}<button className="category-card add-card" onClick={() => setNewCategory(true)}><span className="category-icon">＋</span><strong>新增類別</strong><span>自訂工程分類</span></button></div><div className="hint">長按類別卡片可刪除分類</div></section>}
      {appMode === 'photo' && tab === 'home' && active && <section className="content"><button className="back-link" onClick={() => setActive(null)}>‹ 所有類別</button><div className="section-heading"><div><p className="eyebrow">CURRENT CATEGORY</p><h2>{active}</h2></div><span className="photo-total">{currentPhotos.length} 張</span></div><div className="capture-actions"><button className="capture-button camera" onClick={startContinuousCamera}><span>▣</span><div><strong>連續拍攝</strong><small>拍完可立即拍下一張</small></div></button><button className="capture-button secondary-camera" onClick={() => cameraRef.current?.click()}><span>□</span><div><strong>立即拍照</strong><small>使用 iPhone 原生相機</small></div></button><button className="capture-button album" onClick={() => albumRef.current?.click()}><span>▧</span><div><strong>選擇相簿</strong><small>可一次匯入多張</small></div></button><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e => importFiles(e.target.files)} /><input ref={albumRef} hidden type="file" accept="image/*" multiple onChange={e => importFiles(e.target.files)} /></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>拍攝資訊</h3></div><span className="memory-dot">● 已記憶</span></div><div className="tag-grid">{['樓層', '機房', '房間名稱', '安全', '收貨相關', '事項'].map(label => <button className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} onClick={() => setPicker(label)}><span>{label}</span><b>{tags[label] || '選擇'}</b></button>)}</div><label className="note-field"><span>文字備註</span><input value={note} onChange={e => setNote(e.target.value)} onBlur={rememberNote} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { rememberNote(); e.currentTarget.blur() } }} placeholder="輸入本次拍攝的補充說明..." /></label>{noteHistory.length > 0 && <div className="note-history"><small>最近使用</small><div>{noteHistory.map(item => <button type="button" key={item} onClick={() => setSelectedNotes(current => { const next = current.includes(item) ? current.filter(value => value !== item) : [...current, item]; setNote(next.join(' / ')); return next })} className={selectedNotes.includes(item) ? 'selected' : ''} aria-pressed={selectedNotes.includes(item)}>{item}</button>)}</div></div>}</div></section>}
      {appMode === 'photo' && tab === 'settings' && <section className="content settings-page"><button className="back-link" onClick={() => { setTab('home'); setActive(null) }}>‹ 工程類別</button><div className="section-heading"><div><p className="eyebrow">APP SETTINGS</p><h2>設定</h2></div></div><div className="project-name-setting"><label htmlFor="project-name">Project 名稱</label><input id="project-name" value={currentProject.name} onChange={e => { const name = e.target.value; setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, name } : project)) }} placeholder="輸入 Project 名稱" /></div><p className="settings-intro">自訂六個標籤類別的選項，之後拍攝時會自動提供。</p><div className="local-storage-card"><strong>{storageStatus}</strong><span>照片、Project 及設定會保存在此裝置</span><div className="backup-actions"><button onClick={exportLocalBackup}>匯出 ZIP 備份</button><label>匯入備份<input type="file" accept="application/zip,.zip" hidden onChange={e => importLocalBackup(e.target.files?.[0])} /></label></div></div>{['樓層', '機房', '事項', '安全', '收貨相關', '房間名稱'].map(label => <div className="settings-group" key={label}><div className="settings-group-title"><strong>{label}</strong><span>{(settingsOptions[label] || []).length} 個選項</span></div><div className="settings-options">{(settingsOptions[label] || []).map(option => <button key={option} onClick={() => setSettingsOptions(current => ({ ...current, [label]: current[label].filter(item => item !== option) }))}>{option}<span>×</span></button>)}</div><div className="settings-add"><input value={newOption[label] || ''} onChange={e => setNewOption(current => ({ ...current, [label]: e.target.value }))} placeholder={`新增${label}選項`} /><button onClick={() => { const value = (newOption[label] || '').trim(); if (!value) return; setSettingsOptions(current => ({ ...current, [label]: [...(current[label] || []), value] })); setNewOption(current => ({ ...current, [label]: '' })) }}>新增</button></div></div>)}</section>}
      {appMode === 'photo' && tab === 'photos' && <section className="content"><button className="back-link" onClick={() => { setTab('home'); setActive(null) }}>‹ 工程類別</button><div className="section-heading photo-heading"><div><p className="eyebrow">PHOTO ARCHIVE</p><h2>相片集</h2></div><div className="photo-actions"><span className="photo-total">已選 {selected.length} 張</span><button className="select-all-button" onClick={() => setSelected(selected.length === projectPhotos.length ? [] : projectPhotos.map(photo => photo.id))} disabled={!projectPhotos.length}>{selected.length === projectPhotos.length && projectPhotos.length ? '取消全選' : '全選'}</button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>一小時內</button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 24 * 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>一日內</button><div className="export-bar"><button onClick={exportExcel}>匯出 Excel</button><button onClick={exportPdf}>匯出 PDF</button></div></div></div><div className="photo-grid">{projectPhotos.map(p => <div className="photo-card" key={p.id}><button className="photo-open" onClick={() => setDetail(p)}><img src={p.src} alt={`${p.category} ${p.createdAt}`} /></button><label className="check"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /><span /></label></div>)}{!projectPhotos.length && <div className="empty-state">尚未有相片記錄<br /><small>進入工程類別開始拍攝</small></div>}</div><div id="pdf-report" className="pdf-report" aria-hidden="true"><h1>地盤相片記錄報表</h1>{photos.filter(p => selected.includes(p.id)).map(p => <article key={p.id}><img src={p.src} alt="" /><div><b>{p.category}</b><p>{Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ')}</p><p>{p.note}</p><small>{new Date(p.createdAt).toLocaleString('zh-HK')}</small></div></article>)}</div></section>}
      {appMode === 'about' && <section className="content info-page"><div className="section-heading"><div><p className="eyebrow">ABOUT</p><h2>資料</h2></div></div><div className="about-block"><h3>關於此 App</h3><p>這是一個為地盤工程而設的流動記錄工具，支援離線使用，所有相片與資料均保存在本機裝置。主要功能包括：拍照記錄（自動加上工程類別、樓層、機房等智能標籤並生成 Excel／PDF 報表）、Site Memo（一鍵生成 A4 Site Meno）及制房移交。</p></div><div className="about-block profile-block"><h3>開發及使用者資料</h3><div className="profile-card"><div className="profile-avatar" aria-hidden="true">HC</div><div className="profile-meta"><strong>Henry Chu</strong><span>Project Manager</span><span>Southa Technical Ltd</span><a href="mailto:chuwing134538@gmail.com" className="profile-email">chuwing134538@gmail.com</a></div></div></div></section>}
      <nav className="bottom-nav main-nav"><button className={appMode === 'photo' ? 'active' : ''} onClick={() => { setAppMode('photo'); setTab('home'); setActive(null) }}><span><Camera size={20} /></span>拍照記錄</button><button className={appMode === 'memo' ? 'active' : ''} onClick={() => setAppMode('memo')}><span><PenLine size={20} /></span>Site Memo</button><button className={appMode === 'handover' ? 'active' : ''} onClick={() => { setHandoverView('home'); setAppMode('handover') }}><span><ClipboardList size={20} /></span>制房移交</button><button className={appMode === 'handover' ? 'active' : ''} onClick={() => { setHandoverView('manage'); setAppMode('handover') }}><span><Building2 size={20} /></span>機房資料</button><button className={appMode === 'about' ? 'active' : ''} onClick={() => setAppMode('about')}><span><Info size={20} /></span>資料</button></nav>
    </main>
    {continuousCamera && <div className="overlay dark-overlay camera-overlay"><div className="camera-sheet"><div className="camera-topline"><span className="camera-spacer" aria-hidden="true" /><button className={`camera-flash ${flashEnabled ? 'selected' : ''}`} onClick={toggleFlash} aria-label="切換閃光燈">ϟ<span>{flashEnabled ? 'ON' : 'A'}</span></button><div className="camera-status"><i /> LIVE · {currentPhotos.length} 張</div></div>{captureMessage && <p className="capture-message" role="status">{captureMessage}</p>}<div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted /><span className="frame-corner top-left" /><span className="frame-corner top-right" /><span className="frame-corner bottom-left" /><span className="frame-corner bottom-right" /><div className="zoom-controls" aria-label="縮放倍率"><button onClick={() => changeZoom(.5)} className={zoomLevel === .5 ? 'selected' : ''}>0.5</button><button onClick={() => changeZoom(1)} className={zoomLevel === 1 ? 'selected' : ''}>1×</button><button onClick={() => changeZoom(2)} className={zoomLevel === 2 ? 'selected' : ''}>2</button><button onClick={() => changeZoom(5)} className={zoomLevel === 5 ? 'selected' : ''}>5</button></div></div>{cameraError && <p className="camera-error">{cameraError}</p>}<div className="camera-toolbar"><button className="camera-control" onClick={stopContinuousCamera} aria-label="取消拍攝">×</button><button className={`shutter ${captureBusy ? 'is-busy' : ''}`} onClick={captureContinuousPhoto} disabled={captureBusy} aria-label="拍攝相片">{captureBusy ? '…' : ''}</button><button className="camera-control" aria-label="切換鏡頭">↻</button></div></div></div>}
    {cameraError && !continuousCamera && <div className="camera-error-banner">{cameraError}</div>}
    {picker && <div className="overlay" onClick={() => setPicker(null)}><div className="sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SELECT OPTION</p><h3>{picker}</h3></div><button className="close" onClick={() => setPicker(null)}>×</button></div><button className="option option-na" key="__NA__" onClick={() => { setTags(t => ({ ...t, [picker]: 'N/A' })); setPicker(null) }}>N/A（不適用）<span>{tags[picker] === 'N/A' ? '✓' : '›'}</span></button>{(settingsOptions[picker] || []).map(option => <button className="option" key={option} onClick={() => { setTags(t => ({ ...t, [picker]: option })); setPicker(null) }}>{option}<span>{tags[picker] === option ? '✓' : '›'}</span></button>)}<div className="custom-option"><input id="custom" placeholder="新增自訂項目" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.value.trim()) { setTags(t => ({ ...t, [picker]: e.currentTarget.value.trim() })); setPicker(null) } }} /><button onClick={() => { const input = document.getElementById('custom') as HTMLInputElement; if (input.value.trim()) { setTags(t => ({ ...t, [picker]: input.value.trim() })); setPicker(null) } }}>新增</button></div></div></div>}
    {detail && <div className="overlay dark-overlay" onClick={() => setDetail(null)}><div className="detail-modal" onClick={e => e.stopPropagation()}><button className="detail-back" onClick={() => setDetail(null)} aria-label="返回相片集">‹ 返回</button><button className="close light" onClick={() => setDetail(null)} aria-label="關閉相片詳情">×</button><img src={detail.src} alt="相片詳情" /><div className="detail-copy"><b>{detail.category}</b><p className="detail-tags">{Object.entries(detail.tags).filter(([,v]) => v && v !== 'N/A').map(([k,v]) => <span key={k}>{k}: {v}</span>)}{!Object.values(detail.tags).some(v => v && v !== 'N/A') && <span>未設定標籤</span>}</p><p>{detail.note || '沒有備註'}</p><small>{new Date(detail.createdAt).toLocaleString('zh-HK')}</small></div></div></div>}
    {projectPanel && <div className="overlay" onClick={() => setProjectPanel(false)}><div className="sheet project-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">PROJECTS</p><h3>選擇 Project</h3></div><button className="close" onClick={() => setProjectPanel(false)} aria-label="關閉">×</button></div>{projects.map(project => <button className={`option ${project.id === currentProject.id ? 'chosen' : ''}`} key={project.id} onClick={() => { const projectSettings = project.settings || createProjectSettings(); setCurrentProjectId(project.id); setCategories(projectSettings.categories); setTags(projectSettings.tags); setNote(projectSettings.note); setSettingsOptions(projectSettings.settingsOptions); setProjectPanel(false); setActive(null); setSelected([]) }}><span>{project.name}<small>{photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === project.id).length} 張相片</small></span><b>{project.id === currentProject.id ? '✓' : '›'}</b></button>)}<div className="project-add"><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="輸入新 Project 名稱" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addProject() }} /><button onClick={addProject}>新增</button></div></div></div>}
    {newCategory && <div className="overlay" onClick={() => setNewCategory(false)}><div className="sheet small-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">NEW CATEGORY</p><h3>新增工程類別</h3></div><button className="close" onClick={() => setNewCategory(false)}>×</button></div><input className="category-input" autoFocus placeholder="例如：外牆工程" onKeyDown={e => { if (e.key === 'Enter') addCategory(e.currentTarget.value) }} /><button className="primary-button" onClick={() => addCategory((document.querySelector('.category-input') as HTMLInputElement).value)}>建立類別</button></div></div>}
  </>
}
