'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { Camera, PenLine, ClipboardList, Building2, Info, Home, Images, Database, BookOpen, ShieldCheck } from 'lucide-react'
import { SiteMemo } from '@/components/site-memo/site-memo'
import { Handover } from '@/components/handover/handover'
import { Notebook } from '@/components/notebook/notebook'
import { loadAllMemos, saveAllMemos } from '@/components/site-memo/memo-data'
import { loadAllHandover, saveAllHandover, type HandoverProjectData, type Tower } from '@/components/handover/handover-data'

type Photo = { id: string; src: string; cleanSrc: string; originalBlob?: Blob; thumbnailBlob?: Blob; stampedBlob?: Blob; category: string; tags: Record<string, string>; note: string; createdAt: string; projectId: string }
type Category = { name: string; icon: string }
type ProjectSettings = { categories: Category[]; tags: Record<string, string>; note: string; settingsOptions: Record<string, string[]>; noteHistory: string[] }
type Project = { id: string; name: string; settings?: ProjectSettings }

const DEFAULT_PROJECT: Project = { id: 'default-project', name: '?‘ç? Project' }
const PROJECTS_KEY = 'site-photo-projects'
const CURRENT_PROJECT_KEY = 'site-photo-current-project'

const defaultCategories: Category[] = [
  { name: '?»å™¨', icon: '?? },
  { name: '?·æ°£', icon: '?? },
  { name: 'æ¶ˆé˜²', icon: '?? },
  { name: 'å®‰å…¨', icon: '?? },
  { name: '?¶æ?/?¼é›»æ©?, icon: '?? },
  { name: 'å»ºç?', icon: '?? },
  { name: '?©æ?', icon: '?? },
  { name: 'æ©Ÿæˆ¿ç§»äº¤', icon: '?? },
]
const normalizeCategoryName = (name: string) => {
  if (name === '?¼é›»æ©?) return 'å®‰å…¨'
  if (name === '?¶æ?') return '?¶æ?/?¼é›»æ©?
  return name
}
const ensureDefaultCategories = (categories: Category[] | undefined) => {
  const existing = (categories || [])
    .filter(category => category.name !== 'å»ºç??©æ?')
    .map(category => ({ ...category, name: normalizeCategoryName(category.name) }))
    .filter((category, index, all) => all.findIndex(item => item.name === category.name) === index)
  return [...existing, ...defaultCategories.filter(category => !existing.some(item => item.name === category.name))]
}
const tagOptions: Record<string, string[]> = {
  æ¨“å±¤: ['B02', 'B01', 'L00', 'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L19', 'MR/F', 'UR1/F', 'UR2/F'],
  æ©Ÿæˆ¿: ['?»åˆ¶??, 'ç¸½åˆ¶??, '?¼é›»æ©Ÿæˆ¿', 'AHU??, 'ELV??, 'TR??],
  ?¿é??ç¨±: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S8', 'ELV1', 'ELV2', 'ELV3', 'ELV4', 'TR1', 'TR2', 'TR3', 'TR4', '1', '2', '3', '4'],
  äº‹é?: ['Defect', '?ªå???, '?ªå?ç³?, '?ªè??å?', '?ªç©¿ç·?, '?ªè???, '?ªè?? å™¨', '?ªèµ·?µæ¶', '?ªå???, '?ªé???, '?ªå???, '?ªè??€', '?²åº¦??, 'è¢«ç ´å£?, '?—å…¶å®ƒè??­é˜»ç¤?, '?—å»ºç¯‰é˜»ç¤?, 'å»ºç?æ¼æ°´', '?¶å?è¡Œé ­?¡è?CSD??],
  å®‰å…¨: ['?¡å?æ¬?, 'ä¸æ­£è¦é?ç©ºå·¥ä½?, '?¡å??¨å¸¶', '?¡å¸¶å®‰å…¨å¸?, '?¡å??¨ç¹©', '?°å??¡éµ??, '?¸ç?'],
  ?¶è²¨?¸é?: ['å·²æ”¶å¾…é?', 'å·²å…¥è²¨å€?, 'å·²äº¤?¤é ­', 'ä¾†è²¨?‰å?é¡?, 'ä¾†è²¨?´ç?'],
  åº§æ•¸: ['Tower 1', 'Tower 2', 'Tower 3'],
  ?™ç”¨: ['?™ç”¨'],
}
const mergeTagOptions = (saved?: Record<string, string[]>) => Object.fromEntries(Object.entries(tagOptions).map(([key, defaults]) => [key, [...new Set([...(saved?.[key] || []), ...defaults])]]))

const createProjectSettings = (): ProjectSettings => ({
  categories: defaultCategories,
  tags: {},
  note: '',
  settingsOptions: tagOptions,
  noteHistory: [],
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

function hydratePhoto(photo: Photo): Photo {
  if (!photo.originalBlob && !photo.thumbnailBlob) return photo
  const stampedUrl = photo.stampedBlob ? URL.createObjectURL(photo.stampedBlob) : photo.src
    const originalUrl = photo.originalBlob ? URL.createObjectURL(photo.originalBlob) : photo.cleanSrc
    const thumbnailUrl = photo.thumbnailBlob ? URL.createObjectURL(photo.thumbnailBlob) : stampedUrl
    return { ...photo, src: thumbnailUrl, cleanSrc: originalUrl }
}

function releasePhotoUrls(photos: Photo[]) {
  photos.forEach(photo => {
    if (photo.src.startsWith('blob:')) URL.revokeObjectURL(photo.src)
    if (photo.cleanSrc.startsWith('blob:') && photo.cleanSrc !== photo.src) URL.revokeObjectURL(photo.cleanSrc)
  })
}

function saveStoredPhotos(photos: Photo[]) {
  return openPhotoDb().then(db => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, 'readwrite')
    const store = transaction.objectStore(PHOTO_STORE)
    store.clear()
    photos.forEach(photo => store.put(photo.originalBlob || photo.stampedBlob ? { ...photo, src: '', cleanSrc: '' } : photo))
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
    script.onerror = () => reject(new Error('?¯å‡ºå¥—ä»¶è¼‰å…¥å¤±æ?'))
    document.head.appendChild(script)
  })
}

function createId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(',')
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: header.match(/data:([^;]+)/)?.[1] || 'image/jpeg' })
}

function imageAsJpeg(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('?¡æ?å»ºç??–ç?è½‰æ???))
      ctx.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    image.onerror = () => reject(new Error('?¡æ?è½‰æ??Ÿå?'))
    image.src = dataUrl
  })
}

function stampImage(file: File, category: string, tags: Record<string, string> = {}, note = '', projectName = '') {
  return new Promise<{ stamped: string; clean: string; originalBlob: Blob; thumbnailBlob: Blob; stampedBlob: Blob }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const sourceWidth = image.naturalWidth || image.width
        const sourceHeight = image.naturalHeight || image.height
        const scale = Math.min(1, 4096 / Math.max(sourceWidth, sourceHeight))
        canvas.width = Math.max(1, Math.round(sourceWidth * scale))
        canvas.height = Math.max(1, Math.round(sourceHeight * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('?¡æ?å»ºç??–ç??•ç???))
          return
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        const cleanDataUrl = canvas.toDataURL('image/jpeg', 0.82)
        const originalBlob = dataUrlToBlob(canvas.toDataURL('image/jpeg', 0.78))
        const thumbnailCanvas = document.createElement('canvas')
        const thumbnailWidth = Math.min(960, image.width)
        thumbnailCanvas.width = thumbnailWidth
        thumbnailCanvas.height = Math.max(1, Math.round(image.height * thumbnailWidth / image.width))
        thumbnailCanvas.getContext('2d')?.drawImage(image, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
        const thumbnailBlob = dataUrlToBlob(thumbnailCanvas.toDataURL('image/webp', 0.72))
        const detailLines = Object.entries(tags).filter(([, value]) => value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`)
        if (note.trim()) detailLines.push(`?‡å??™è¨»: ${note.trim()}`)
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
        const stamped = canvas.toDataURL('image/jpeg', 0.78)
        const stampedBlob = dataUrlToBlob(stamped)
        resolve({ stamped, clean: cleanDataUrl, originalBlob, thumbnailBlob, stampedBlob })
      }
      image.onerror = () => reject(new Error('?¡æ?è®€?–ç›¸??))
      image.src = reader.result as string
    }
    reader.onerror = () => reject(reader.error || new Error('?¡æ?è®€?–æ?æ¡?))
    reader.readAsDataURL(file)
  })
}

export default function Page() {
  const [categories, setCategories] = useState(defaultCategories)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photosReady, setPhotosReady] = useState(false)
  const [projects, setProjects] = useState<Project[]>([{ ...DEFAULT_PROJECT, settings: createProjectSettings() }])
  const [currentProjectId, setCurrentProjectId] = useState(DEFAULT_PROJECT.id)
  const [projectPanel, setProjectPanel] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [appMode, setAppMode] = useState<'home' | 'photo' | 'memo' | 'notebook' | 'handover' | 'reserve' | 'about' | 'backup'>('home')
  const [tab, setTab] = useState<'home' | 'photos' | 'settings'>('home')
  const [settingsOptions, setSettingsOptions] = useState<Record<string, string[]>>(tagOptions)
  const [settingsLabel, setSettingsLabel] = useState<string | null>(null)
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
  const [handoverView, setHandoverView] = useState<'home' | 'settings' | 'manage'>('home')
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
  const saveQueueRef = useRef(Promise.resolve())
  const switchingProjectRef = useRef(false)
  const folderHandleRef = useRef<any>(null)
  const [folderConnected, setFolderConnected] = useState(false)
  const backupRef = useRef<HTMLInputElement>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null)

  const [isOffline, setIsOffline] = useState(false)
  const [storageStatus, setStorageStatus] = useState('?¬æ?ä¿å?ä¸?)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saveToast, setSaveToast] = useState('')
  useEffect(() => {
    navigator.storage?.persist?.().then((persisted) => setStorageStatus(persisted ? '?¬æ??ä?ä¿å?' : '?¬æ?ä¿å?ä¸?)).catch(() => undefined)
    const refreshStorage = () => navigator.storage?.estimate?.().then(result => {
      if (typeof result.usage === 'number' && typeof result.quota === 'number') setStorageUsage({ usage: result.usage, quota: result.quota })
    }).catch(() => undefined)
    refreshStorage()
    const timer = window.setInterval(refreshStorage, 30000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js?v=21', { updateViaCache: 'none' }).then((registration) => {
        const markUpdate = () => setUpdateAvailable(true)
        if (registration.waiting) markUpdate()
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (worker) worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) markUpdate() })
        })
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
      const migrated = stored.map((photo) => hydratePhoto({ ...photo, category: normalizeCategoryName(photo.category), projectId: photo.projectId || DEFAULT_PROJECT.id }))
      setPhotos(migrated)
      setPhotosReady(true)
    }).catch(() => { setPhotos([]); setPhotosReady(true) })
    try {
      const savedProjects = localStorage.getItem(PROJECTS_KEY)
      const savedCurrent = localStorage.getItem(CURRENT_PROJECT_KEY)
      if (savedProjects) {
        const parsed = JSON.parse(savedProjects) as Project[]
        if (Array.isArray(parsed) && parsed.length) setProjects(parsed.map(project => ({ ...project, settings: { ...createProjectSettings(), ...(project.settings || {}), categories: ensureDefaultCategories(project.settings?.categories), tags: project.settings?.tags || {}, note: project.settings?.note || '', settingsOptions: mergeTagOptions(project.settings?.settingsOptions), noteHistory: project.settings?.noteHistory || [] } })))
      }
      if (savedCurrent) setCurrentProjectId(savedCurrent)
      localStorage.removeItem('site-photo-records')
      const legacyMemory = localStorage.getItem('site-photo-memory')
      const legacyOptions = localStorage.getItem('site-photo-options')
      const legacyNoteHistory = localStorage.getItem('site-photo-note-history')
      const savedProjectList = savedProjects ? JSON.parse(savedProjects) as Project[] : []
      const fallbackSettings = createProjectSettings()
      if (legacyMemory || legacyOptions || legacyNoteHistory) {
        const memory = legacyMemory ? JSON.parse(legacyMemory) : {}
        const saved = legacyOptions ? JSON.parse(legacyOptions) : {}
        if (saved['?¶å?'] && !saved['?¶è²¨?¸é?']) { saved['?¶è²¨?¸é?'] = saved['?¶å?']; delete saved['?¶å?'] }
        if (saved['?™è¨»'] && !saved['?¿é??ç¨±']) { saved['?¿é??ç¨±'] = saved['?™è¨»']; delete saved['?™è¨»'] }
        const migratedSettings = { ...fallbackSettings, tags: memory.tags || {}, note: memory.note || '', settingsOptions: mergeTagOptions({ ...tagOptions, ...saved }), noteHistory: legacyNoteHistory ? JSON.parse(legacyNoteHistory).slice(0, 10) : [] }
        const migratedProjects = (savedProjectList.length ? savedProjectList : [{ ...DEFAULT_PROJECT }]).map(project => ({ ...project, settings: project.settings || { ...migratedSettings, categories: ensureDefaultCategories(migratedSettings.categories).map(category => ({ ...category })), tags: { ...migratedSettings.tags }, settingsOptions: Object.fromEntries(Object.entries(migratedSettings.settingsOptions).map(([key, values]) => [key, [...(values as string[])]])), noteHistory: [...migratedSettings.noteHistory] } }))
        setProjects(migratedProjects)
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(migratedProjects))
        localStorage.removeItem('site-photo-memory'); localStorage.removeItem('site-photo-options'); localStorage.removeItem('site-photo-note-history')
      }
    } catch { /* ?²å?ç©ºé?ä¸å¯?¨æ?ä»å¯ç¹¼ç??æ? */ }
    setSettingsReady(true)
  }, [])
  useEffect(() => {
    if (!settingsReady || !photosReady) return
    setSaveState('saving')
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      await saveStoredPhotos(photos)
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
      localStorage.setItem(CURRENT_PROJECT_KEY, currentProjectId)
    }).then(() => {
      const savedAt = new Date()
      setSaveState('saved')
      setLastSavedAt(savedAt.toISOString())
    }).catch(error => {
      console.error('è³‡æ?ä¿å?å¤±æ?:', error)
      setSaveState('error')
      setSaveToast('è³‡æ?ä¿å?å¤±æ?ï¼Œè?æª¢æŸ¥è£ç½®?²å?ç©ºé?')
      window.setTimeout(() => setSaveToast(''), 4000)
    })
  }, [settingsReady, photos, projects, currentProjectId])
  useEffect(() => {
    if (!settingsReady || loadedProjectRef.current === currentProjectId) return
    const projectSettings = projects.find(project => project.id === currentProjectId)?.settings || createProjectSettings()
    setCategories(projectSettings.categories)
    setTags(projectSettings.tags)
    setNote(projectSettings.note)
    setNoteHistory(projectSettings.noteHistory || [])
    setSettingsOptions(mergeTagOptions(projectSettings.settingsOptions))
    setSelectedNotes([])
    loadedProjectRef.current = currentProjectId
    switchingProjectRef.current = false
  }, [settingsReady, currentProjectId, projects])
  useEffect(() => {
    if (!settingsReady || switchingProjectRef.current) return
    setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, settings: { categories, tags, note, settingsOptions, noteHistory } } : project))
  }, [settingsReady, currentProjectId, categories, tags, note, settingsOptions, noteHistory])
  const rememberNote = () => {
    const value = note.trim()
    if (!value) return
    setNoteHistory(current => [value, ...current.filter(item => item !== value)].slice(0, 10))
  }
  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (saveState !== 'saved') {
        event.preventDefault()
        event.returnValue = 'è³‡æ?å°šæœªä¿å?ï¼Œç¢ºå®šè??¢é??ï?'
      }
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [saveState])
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
      setCaptureMessage('å·²é€?¥?¬æ? Project Camera è³‡æ?å¤?)
    } catch { setCaptureMessage('?ªé¸?‡è??™å¤¾') }
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
    if (!window.isSecureContext) {
      setCameraError('????æ??€è¦?HTTPSï¼›ç›®?ç¶²?€ä¸å??¨ï?è«‹æ”¹?¨ç??³æ??§æ?è¨­å? HTTPS')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('æ­¤ç€è¦½?¨ä??¯æ´????¸æ?ï¼Œè?ä½¿ç”¨ç«‹å³?ç…§'); return }
    try {
      setCameraError('')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      streamRef.current = stream
      setContinuousCamera(true)
    } catch (error) { console.error('[v0] camera start failed:', error); setCameraError('?¡æ??‹å??¡é ­ï¼Œè??è¨±?¸æ?æ¬Šé??–æ”¹?¨ç??³æ???) }
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
    setCaptureMessage('æ­?œ¨?•ç??¸ç???)
    const video = videoRef.current
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setCameraError('?¡é ­å°šæœªæº–å?å¥½ï?è«‹ç??™å??‰å¿«?€')
      setCaptureMessage('')
      setCaptureBusy(false)
      return
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('?¡æ?å»ºç??«å?')
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('?¡æ??·å??¸ç?')), 'image/jpeg', 0.92))
      const result = await stampImage(new File([blob], 'camera.jpg', { type: 'image/jpeg' }), active, tags, note, currentProject.name)
      const photo = { id: createId(), src: result.stamped, cleanSrc: result.clean, originalBlob: result.originalBlob, thumbnailBlob: result.thumbnailBlob, stampedBlob: result.stampedBlob, category: active, tags, note, createdAt: new Date().toISOString(), projectId: currentProject.id }
      setPhotos(p => [photo, ...p])
      await saveToProjectFolder(photo)
      setCameraError('')
      setCaptureMessage('å·²æ??ä¸¦?²å?ï¼Œå¯ç¹¼ç??æ?')
      window.setTimeout(() => setCaptureMessage(''), 1800)
    } catch (error) { console.error('[v0] capture failed:', error); setCameraError('?æ?å¤±æ?ï¼Œè?ç¨å€™å?è©?); setCaptureMessage('') }
    finally { setCaptureBusy(false) }
  }
  const importFiles = async (files: FileList | null) => {
    if (!files || !active) return
    const added: Photo[] = []
    const failures: string[] = []
    for (const file of Array.from(files)) {
      try {
        const result = await stampImage(file, active, tags, note, currentProject.name)
        const photo: Photo = { id: createId(), src: result.stamped, cleanSrc: result.clean, originalBlob: result.originalBlob, thumbnailBlob: result.thumbnailBlob, stampedBlob: result.stampedBlob, category: active, tags: { ...tags }, note, createdAt: new Date().toISOString(), projectId: currentProject.id }
        added.push(photo)
        setPhotos(current => [photo, ...current])
        await saveToProjectFolder(photo)
      } catch (error) {
        console.error('[v0] photo import failed:', error)
        failures.push(file.name)
        const reason = error instanceof Error ? error.message : '?ªçŸ¥?¯èª¤'
        setCameraError(`${file.name} ?•ç?å¤±æ?ï¼?{reason}`)
      }
    }
    if (added.length) {
      setCaptureMessage(failures.length ? `å·²å???${added.length} å¼µï?${failures.length} å¼µå¤±?—` : `å·²å???${added.length} å¼µç›¸?‡`)
      setTab('photos')
    } else if (failures.length) {
      setCameraError('?¸ç??•ç?å¤±æ?ï¼Œè?ç¢ºè?æª”æ??¼å??Šè?ç½®å„²å­˜ç©º??)
    }
  }
  const addProject = () => {
    const name = newProjectName.trim()
    if (!name) return
    if (projects.some(project => project.name === name)) { alert('Project ?ç¨±å·²å???); return }
    const project = { id: createId(), name, settings: createProjectSettings() }
    switchingProjectRef.current = true
    setProjects(current => [...current, project])
    setCurrentProjectId(project.id)
    const projectSettings = project.settings
    setCategories(projectSettings.categories)
    setTags(projectSettings.tags)
    setNote(projectSettings.note)
    setNoteHistory(projectSettings.noteHistory || [])
    setSettingsOptions(mergeTagOptions(projectSettings.settingsOptions))
    setNewProjectName('')
    setProjectPanel(false)
    setActive(null)
    setSelected([])
  }
  const addCategory = (name: string) => { if (name.trim()) setCategories(c => [...c, { name: name.trim(), icon: 'ï¼? }]); setNewCategory(false) }
  const removeCategory = (name: string) => { if (confirm(`ç¢ºå??ªé™¤??{name}?å??¶ç›¸?‡ï?`)) { setCategories(c => c.filter(x => x.name !== name)); setPhotos(p => p.filter(x => x.category !== name)) } }
  const deleteSelectedPhotos = () => {
    if (!selected.length) return
    if (!confirm(`ç¢ºå??ªé™¤å·²é¸??${selected.length} å¼µç›¸?‡ï?æ­¤æ?ä½œç„¡æ³•å¾©?Ÿã€‚`)) return
    setPhotos(current => current.filter(photo => !selected.includes(photo.id)))
    setSelected([])
    setDetail(null)
  }
  const exportExcel = async () => {
    const chosen = photos.filter(x => selected.includes(x.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (!chosen.length) { alert('è«‹å??¾é¸è¦åŒ¯?ºç??¸ç?'); return }
    try {
      const book = new ExcelJS.Workbook()
      const sheet = book.addWorksheet('?¸ç?è¨˜é?')
      sheet.columns = [{ header: '?¥æ?', key: 'date', width: 16 }, { header: '?‚é?', key: 'time', width: 14 }, { header: 'é¡åˆ¥', key: 'category', width: 18 }, { header: 'ç´°é?èªªæ?', key: 'detail', width: 34 }, { header: '?™è¨»', key: 'note', width: 28 }, { header: '?§ç?', key: 'photo', width: 28 }]
      for (const p of chosen) {
        const capturedAt = new Date(p.createdAt)
        const row = sheet.addRow({ date: capturedAt.toLocaleDateString('zh-HK'), time: capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }), category: p.category, detail: Object.entries(p.tags).filter(([key, value]) => key !== '?™è¨»' && value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('\n'), note: p.note || (p.tags['?™è¨»'] === 'N/A' ? '' : p.tags['?™è¨»']) || '' })
        const cleanDataUrl = await imageAsJpeg(p.cleanSrc)
        const imageId = book.addImage({ base64: cleanDataUrl, extension: 'jpeg' })
        sheet.addImage(imageId, { tl: { col: 5, row: row.number - 1 }, ext: { width: 165, height: 165 } })
        row.height = 130
      }
      const buffer = await book.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = '?°ç›¤?¸ç?è¨˜é?.xlsx'
      document.body.appendChild(link)
      link.click()
      setTimeout(() => { link.remove(); URL.revokeObjectURL(url) }, 3000)
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share && typeof File !== 'undefined') {
        const file = new File([buffer], '?°ç›¤?¸ç?è¨˜é?.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '?°ç›¤?¸ç?è¨˜é?.xlsx' })
      }
    } catch (error) {
      console.error('[v0] ExcelJS export failed:', error)
      alert(`Excel ?¯å‡ºå¤±æ?ï¼?{error instanceof Error ? error.message : '?ªçŸ¥?¯èª¤'}`)
    }
  }
  const exportPdf = async () => {
    const chosen = photos.filter(x => selected.includes(x.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (!chosen.length) { alert('è«‹å??¾é¸è¦åŒ¯?ºç??¸ç?'); return }
  const report = document.createElement('div')
  report.className = 'export-preview-overlay'
  report.innerHTML = `<div class="export-backdrop"></div><div class="export-report-preview"><h1>?°ç›¤?¸ç?è¨˜é??±è¡¨ï¼ˆA3 æ©«å??’ç?ï¼?/h1><div class="export-report-head"><b>?¥æ?</b><b>?‚é?</b><b>é¡åˆ¥</b><b>ç´°é?èªªæ?</b><b>?™è¨»</b><b>?§ç?</b></div>${chosen.map(p => { const capturedAt = new Date(p.createdAt); const detail = Object.entries(p.tags).filter(([key, value]) => key !== '?™è¨»' && value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('<br>'); return `<article><div>${capturedAt.toLocaleDateString('zh-HK')}</div><div>${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div>${p.category}</div><div>${detail || '??}</div><div>${p.note || p.tags['?™è¨»'] || '??}</div><img src="${p.src}" alt="${p.category}?¸ç?"></article>` }).join('')}</div><div class="export-sheet"><div class="sheet-handle"></div><button class="export-back" id="close-report" aria-label="è¿”å?ä¸Šä???>??/button><h2>?°ç›¤?¸ç?è¨˜é??±è¡¨?è¦½ï¼ˆA3 æ©«å?ï¼?/h2><div class="export-sheet-actions"><button id="print-report">?¯å‡º?±å?</button><button class="export-close" id="close-report-2">?œé?</button></div></div>`
  document.body.appendChild(report)
  report.querySelector('#close-report')?.addEventListener('click', () => report.remove())
  report.querySelector('#close-report-2')?.addEventListener('click', () => report.remove())
  report.querySelector('#print-report')?.addEventListener('click', () => exportPdfLegacy())
  return
  }
  const exportPdfLegacy = async () => {
    const chosen = photos.filter(x => selected.includes(x.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  if (!chosen.length) return alert('è«‹å??¾é¸è¦åŒ¯?ºç??¸ç?')
  let html2canvas: any
  let JsPDF: any
  try {
    const [canvasModule, pdfModule] = await Promise.all([import('html2canvas'), import('jspdf')])
    html2canvas = (canvasModule as any).default || canvasModule
    JsPDF = (pdfModule as any).jsPDF
    if (typeof html2canvas !== 'function' || typeof JsPDF !== 'function') throw new Error('PDF æ¨¡ç??¼å?ä¸æ­£ç¢?)
  } catch (error) {
    console.error('[v0] PDF module load failed:', error)
    alert('PDF æ¨¡ç?è¼‰å…¥å¤±æ?ï¼Œè??æ–°?´ç??é¢å¾Œå?è©?)
    return
  }
  const report = document.createElement('div')
    report.style.cssText = `position:absolute;left:0;top:0;width:1120px;min-height:${Math.max(520, chosen.length * 180 + 100)}px;display:block;visibility:visible;opacity:1;overflow:visible;background:#fff;color:#15212b;padding:24px;z-index:999999;pointer-events:none;`
    report.innerHTML = `<div style="height:64px"></div><div style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;background:#e5e9ee;font-weight:700;padding:12px">${['?¥æ?','?‚é?','é¡åˆ¥','ç´°é?èªªæ?','?™è¨»','?§ç?'].map(label => `<div style="padding:10px;border-right:1px solid #ccd4db">${label}</div>`).join('')}</div>` + chosen.map(p => { const capturedAt = new Date(p.createdAt); const detail = Object.entries(p.tags).filter(([key, value]) => key !== '?™è¨»' && value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('<br>'); const memoValue = p.tags['?™è¨»'] === 'N/A' ? '' : p.tags['?™è¨»']; return `<article style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;align-items:center;border-top:1px solid #d8e0e5;padding:14px 0;break-inside:avoid;min-height:150px"><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleDateString('zh-HK')}</div><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div style="padding:10px;overflow-wrap:anywhere">${p.category}</div><div style="padding:10px;overflow-wrap:anywhere">${detail || '??}</div><div style="padding:10px;overflow-wrap:anywhere">${p.note || memoValue || '??}</div><img src="${p.src}" width="165" height="125" style="display:block;width:165px;height:125px;object-fit:cover"/></article>` }).join('')
    document.body.appendChild(report)
    await Promise.all(Array.from(report.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    try { const headingElement = document.createElement('div'); headingElement.style.cssText = 'position:absolute;left:0;top:0;width:1120px;height:64px;background:#fff;color:#15212b;padding:20px 24px;font-size:22px;font-weight:700;box-sizing:border-box;z-index:1000000;'; headingElement.textContent = '?°ç›¤?¸ç?è¨˜é??±è¡¨ï¼ˆA3 æ©«å??’ç?ï¼?; document.body.appendChild(headingElement); const headingCanvas = await html2canvas(headingElement, { scale: 1.5, backgroundColor: '#ffffff', windowWidth: 1120 }); headingElement.remove(); const canvas = await html2canvas(report, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', windowWidth: 1120 }); const pdfDocument = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' }); const pageWidth = pdfDocument.internal.pageSize.getWidth(); const pageHeight = pdfDocument.internal.pageSize.getHeight(); const margin = 8; const headingHeight = 12; const printableWidth = pageWidth - margin * 2; const printableHeight = pageHeight - margin * 2 - headingHeight; const pixelsPerMm = canvas.width / printableWidth; const pagePixels = Math.floor(printableHeight * pixelsPerMm); let sourceY = 0; let pageIndex = 0; while (sourceY < canvas.height) { if (pageIndex > 0) pdfDocument.addPage(); const sliceHeight = Math.min(pagePixels, canvas.height - sourceY); const pageCanvas = document.createElement('canvas'); pageCanvas.width = canvas.width; pageCanvas.height = sliceHeight; const pageContext = pageCanvas.getContext('2d'); if (!pageContext) throw new Error('PDF page canvas unavailable'); pageContext.fillStyle = '#fff'; pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height); pageContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight); const renderedHeight = sliceHeight / pixelsPerMm; pdfDocument.addImage(headingCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, printableWidth, headingHeight); pdfDocument.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin + headingHeight, printableWidth, renderedHeight); sourceY += sliceHeight; pageIndex += 1; } const pdfBlob = pdfDocument.output('blob'); const pdfUrl = URL.createObjectURL(pdfBlob); const downloadLink = document.createElement('a'); downloadLink.href = pdfUrl; downloadLink.download = '?°ç›¤?¸ç??±è¡¨.pdf'; downloadLink.rel = 'noopener'; document.body.appendChild(downloadLink); downloadLink.click(); downloadLink.remove(); if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share && typeof File !== 'undefined') { const pdfFile = new File([pdfBlob], '?°ç›¤?¸ç??±è¡¨.pdf', { type: 'application/pdf' }); if (navigator.canShare?.({ files: [pdfFile] })) { await navigator.share({ files: [pdfFile], title: '?°ç›¤?¸ç??±è¡¨.pdf' }); } } window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000); }
    catch (error) { console.error('[v0] PDF export failed:', error); alert(`PDF ?¯å‡ºå¤±æ?ï¼?{error instanceof Error ? error.message : 'è«‹ç?å¾Œå?è©?}`) }
    finally { window.setTimeout(() => report.remove(), 1000) }
  }

  const exportLocalBackup = async (): Promise<boolean> => {
    if (backupBusy) return false
    setBackupBusy(true)
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
          if (!response.ok) throw new Error(`?¸ç?è®€?–å¤±??(${response.status})`)
          zip.file(`${prefix}/photos/${photo.id}.jpg`, await response.blob())
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const file = new File([blob], `project-camera-backup-${new Date().toISOString().slice(0, 10)}.zip`, { type: 'application/zip' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Project Camera ZIP ?™ä»½' }); return true } catch (error) {
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
      alert('å®Œæ•´?™ä»½å·²é?å§‹ä?è¼?)
      return true
    } catch (error) {
      console.error('Complete backup export failed:', error)
      alert(`å®Œæ•´?™ä»½?¯å‡ºå¤±æ?ï¼?{error instanceof Error ? error.message : 'è«‹ç?å¾Œå?è©?}`)
      return false
    } finally {
      setBackupBusy(false)
    }
  }
  const updateApp = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/sw.js')
      if (!registration) { alert('ç¨‹å?å·²æ›´??); window.location.reload(); return }
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
      if (registration.waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', () => { alert('ç¨‹å?å·²æ›´??); window.location.reload() }, { once: true })
      } else {
        await registration.update()
        alert('ç¨‹å?å·²æ›´??)
        window.location.reload()
      }
    } catch (error) {
      alert(`?´æ–°å¤±æ?ï¼?{error instanceof Error ? error.message : 'è«‹ç?å¾Œå?è©?}`)
    }
  }

  const importLocalBackup = async (file: File | undefined) => {
    if (!file) return
    try {
      const zip = await JSZip.loadAsync(file)
      const manifest = zip.file('projects.json'); if (!manifest) throw new Error('?¾ä???projects.json')
      const raw = JSON.parse(await manifest.async('text')) as { version?: unknown; projects?: unknown; currentProjectId?: unknown }
      const version = typeof raw.version === 'number' ? raw.version : 1
      if (version > 2) throw new Error(`ä¸æ”¯?´ç??™ä»½?ˆæœ¬ï¼?{version}`)
      if (!Array.isArray(raw.projects) || !raw.projects.length) throw new Error('?™ä»½æ²’æ??‰æ? Project')
      const projectsToRestore = raw.projects.map((value, index) => {
        if (!value || typeof value !== 'object') throw new Error(`Project ${index + 1} ?¼å?ä¸æ­£ç¢º`)
        const project = value as Partial<Project>
        if (typeof project.id !== 'string' || !project.id.trim() || typeof project.name !== 'string' || !project.name.trim()) throw new Error(`Project ${index + 1} ç¼ºå??‰æ??ç¨±??ID`)
        return { ...project, id: project.id.trim(), name: project.name.trim(), settings: { ...createProjectSettings(), ...(project.settings || {}), categories: ensureDefaultCategories(project.settings?.categories), tags: project.settings?.tags || {}, note: project.settings?.note || '', settingsOptions: mergeTagOptions(project.settings?.settingsOptions), noteHistory: project.settings?.noteHistory || [] } } as Project
      })
      const selectedProjectId = typeof raw.currentProjectId === 'string' && projectsToRestore.some(project => project.id === raw.currentProjectId) ? raw.currentProjectId : projectsToRestore[0].id
      const photoCount = Object.values(zip.files).filter(entry => !entry.dir && /\/photos\/[^/]+\.jpg$/i.test(entry.name)).length
      const memoFile = zip.file('site-memo.json')
      const handoverFile = zip.file('handover.json')
      if (!confirm(`ç¢ºè??¯å…¥æ­¤å?ä»½ï?\nProjectï¼?{projectsToRestore.length} ?‹\n?¸ç?ï¼?{photoCount} å¼µ\nSite Memoï¼?{memoFile ? '?? : '??}\n?¶æˆ¿ç§»äº¤ï¼?{handoverFile ? '?? : '??}\n\n?¯å…¥?æ??ˆä?è¼‰ç›®?è??™ä??ºå¾©?Ÿå?ä»½ã€‚`)) return
      await exportLocalBackup()
      const restored: Photo[] = []
      for (const project of projectsToRestore) {
        const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}/photos/`
        const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith(prefix)) as JSZip.JSZipObject[]
        for (const entry of entries) { const blob = await entry.async('blob'); const src = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) }); restored.push({ id: entry.name.split('/').pop()!.replace(/\\.jpg$/, ''), src, cleanSrc: src, category: normalizeCategoryName(project.settings?.categories?.[0]?.name || '?¶å?'), tags: {}, note: '', createdAt: new Date().toISOString(), projectId: project.id }) }
      }
      if (handoverFile) {
        const handoverData = JSON.parse(await handoverFile.async('text'))
        if (!handoverData || typeof handoverData !== 'object') throw new Error('?¶æˆ¿ç§»äº¤è³‡æ??¼å?ä¸æ­£ç¢?)
        await saveAllHandover(handoverData as Record<string, HandoverProjectData | Tower[]>)
      }
      if (memoFile) {
        const memoData = JSON.parse(await memoFile.async('text'))
        if (!memoData || typeof memoData !== 'object' || Array.isArray(memoData)) throw new Error('Site Memo è³‡æ??¼å?ä¸æ­£ç¢?)
        await saveAllMemos(memoData)
      }
      setProjects(projectsToRestore); setCurrentProjectId(selectedProjectId); setPhotos(restored); alert('ZIP ?™ä»½å·²é???)
    } catch { alert('ZIP ?™ä»½æª”æ??¡æ?è®€??) }
  }

  if (appMode === 'notebook') return <Notebook projectId={currentProject.id} projectName={currentProject.name} onBack={() => setAppMode('home')} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('photos'); setActive(null) } if (mode === 'handover') setHandoverView('settings') }} />

  if (appMode === 'memo') return <SiteMemo projectId={currentProject.id} projectName={currentProject.name} onBack={() => setAppMode('home')} onOpenMachineData={() => { setHandoverView('home'); setAppMode('handover') }} onOpenMachineDataManage={() => { setHandoverView('settings'); setAppMode('handover') }} onNavigate={mode => { if (mode === 'handover') setHandoverView('settings'); setAppMode(mode); if (mode === 'photo') { setTab('home'); setActive(null) } }} />

  if (appMode === 'handover') return <Handover initialView={handoverView} projectId={currentProject.id} projectName={currentProject.name} onBack={() => setAppMode('home')} onOpenPhotoSettings={label => { setSettingsLabel(label || null); setAppMode('photo'); setTab('settings'); setActive(null) }} onPhotoSettingsBack={() => { setSettingsLabel(null); setHandoverView('settings'); setAppMode('handover') }} onUpdateApp={updateApp} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('home'); setActive(null) } if (mode === 'handover') { setHandoverView('manage') } }} />

  const navMode = appMode as string

  return <>
    {isOffline && <div className="offline-banner" role="status">?®å??ºé›¢ç·šæ¨¡å¼ï?è³‡æ??ƒå„²å­˜åœ¨?¬æ?</div>}
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">??/div><button className="project-trigger" onClick={() => setProjectPanel(true)} aria-label="?¸æ? Project"><strong>{currentProject.name}</strong><span>??/span></button>
      </header>
      {appMode === 'home' && <section className="content home-page"><div className="section-heading"><div><p className="eyebrow">WORKSITE TOOLS</p></div></div><div className="app-card-grid"><button className="app-card app-card-photo" onClick={() => { setAppMode('photo'); setTab('home'); setActive(null) }}><Camera /><strong>?ç…§è¨˜é?</strong><small>{projectPhotos.length} å¼µç›¸??/small></button><button className="app-card" onClick={() => setAppMode('memo')}><PenLine /><strong>Site Memo</strong><small>?¾å ´?™å??Šå ±??/small></button><button className="app-card" onClick={() => { setHandoverView('home'); setAppMode('handover') }}><ClipboardList /><strong>æ©Ÿæˆ¿ç§»äº¤</strong><small>ç§»äº¤æª¢æŸ¥è¨˜é?</small></button><button className="app-card" onClick={() => setAppMode('reserve')}><ShieldCheck /><strong>Permit to Work</strong><small>?‹ç™¼ä¸?/small></button><button className="app-card" onClick={() => setAppMode('notebook')}><BookOpen /><strong>è¨˜ä?ç°?/strong><small>å¿«é€Ÿè??„ç¾?´ä???/small></button><button className="app-card" onClick={() => setAppMode('reserve')}><Database /><strong>è³‡æ?åº?/strong><small>?‹ç™¼ä¸?/small></button></div></section>}
      {appMode === 'reserve' && <section className="content info-page"><div className="section-heading"><div><p className="eyebrow">COMING SOON</p><h2>?Ÿèƒ½?‹ç™¼ä¸?/h2></div></div><div className="info-empty"><span>??/span><strong>æ­¤å??½æ­£?¨é???/strong><p>Permit to Work?è?äº‹ç°¿?Šè??™åº«?Ÿèƒ½å°‡æ–¼ç¨å?? å…¥??/p><button className="primary-button" onClick={() => setAppMode('home')}>è¿”å?é¦–é?</button></div></section>}
      {appMode === 'photo' && tab === 'home' && !active && <section className="content"><div className="section-heading"><div><p className="eyebrow">PROJECT ARCHIVE</p><h2>å·¥ç?é¡åˆ¥</h2></div><span className="photo-total">{projectPhotos.length} å¼µç›¸??/span></div><div className="category-grid">{categories.map(c => <button key={c.name} className="category-card" onClick={() => setActive(c.name)} onContextMenu={e => { e.preventDefault(); removeCategory(c.name) }}><span className="category-icon">{c.icon}</span><strong>{c.name}</strong><span>{projectPhotos.filter(p => p.category === c.name).length} å¼µè???/span></button>)}<button className="category-card add-card" onClick={() => setNewCategory(true)}><span className="category-icon">ï¼?/span><strong>?°å?é¡åˆ¥</strong><span>?ªè?å·¥ç??†é?</span></button></div><div className="hint">?·æ?é¡åˆ¥?¡ç??¯åˆª?¤å?é¡?/div></section>}
      {appMode === 'photo' && tab === 'home' && active && <section className="content"><button className="back-link" onClick={() => setActive(null)}>??è¿”å?</button><div className="section-heading"><div><p className="eyebrow">CURRENT CATEGORY</p><h2>{active}</h2></div><span className="photo-total">{currentPhotos.length} å¼?/span></div><div className="capture-actions"><button className="capture-button camera" onClick={startContinuousCamera}><span>??/span><div><strong>????æ?</strong><small>?å??¯ç??³æ?ä¸‹ä?å¼?/small></div></button><button className="capture-button secondary-camera" onClick={() => cameraRef.current?.click()}><span>??/span><div><strong>ç«‹å³?ç…§</strong><small>ä½¿ç”¨ iPhone ?Ÿç??¸æ?</small></div></button><button className="capture-button album" onClick={() => albumRef.current?.click()}><span>??/span><div><strong>?¸æ??¸ç°¿</strong><small>?¯ä?æ¬¡åŒ¯?¥å?å¼?/small></div></button><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={async e => { await importFiles(e.target.files); e.currentTarget.value = '' }} /><input ref={albumRef} hidden type="file" accept="image/*" multiple onChange={async e => { await importFiles(e.target.files); e.currentTarget.value = '' }} /></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>?æ?è³‡è?</h3></div><span className="memory-dot">??å·²è???/span></div><div className="tag-grid">{['åº§æ•¸', 'æ¨“å±¤', 'æ©Ÿæˆ¿', '?¿é??ç¨±', 'å®‰å…¨', '?¶è²¨?¸é?', 'äº‹é?', '?™ç”¨'].map(label => <button className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} onClick={() => setPicker(label)}><span>{label}</span><b>{tags[label] || '?¸æ?'}</b></button>)}</div><label className="note-field"><span>?‡å??™è¨»</span><input value={note} onChange={e => setNote(e.target.value)} onBlur={rememberNote} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { rememberNote(); e.currentTarget.blur() } }} placeholder="è¼¸å…¥?¬æ¬¡?æ??„è??…èªª??.." /></label>{noteHistory.length > 0 && <div className="note-history"><small>?€è¿‘ä½¿??/small><div>{noteHistory.map(item => <button type="button" key={item} onClick={() => setSelectedNotes(current => { const next = current.includes(item) ? current.filter(value => value !== item) : [...current, item]; setNote(next.join(' / ')); return next })} className={selectedNotes.includes(item) ? 'selected' : ''} aria-pressed={selectedNotes.includes(item)}>{item}</button>)}</div></div>}</div></section>}
      {appMode === 'photo' && tab === 'settings' && <section className="content settings-page"><button className="back-link" onClick={() => { setSettingsLabel(null); setHandoverView('settings'); setAppMode('handover'); setActive(null) }}>??è¿”å?è¨­å?</button><div className="section-heading"><div><p className="eyebrow">APP SETTINGS</p><h2>è¨­å?{settingsLabel ? ` Â· ${settingsLabel === 'äº‹é?' ? 'ä¸€?? : settingsLabel === 'å®‰å…¨' ? 'å®‰å…¨äº‹é?' : settingsLabel}` : ''}</h2></div></div><div className="project-name-setting"><label htmlFor="project-name">Project ?ç¨±</label><input id="project-name" value={currentProject.name} onChange={e => { const name = e.target.value; setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, name } : project)) }} placeholder="è¼¸å…¥ Project ?ç¨±" /></div><p className="settings-intro">?ªè??­å€‹æ?ç±¤é??¥ç??¸é?ï¼Œä?å¾Œæ??æ??ƒè‡ª?•æ?ä¾›ã€?/p><div className="local-storage-card"><strong>{saveState === 'saving' ? 'æ­?œ¨ä¿å??? : saveState === 'error' ? 'ä¿å?å¤±æ?' : 'å·²ä?å­?}</strong><span>{lastSavedAt ? `?€å¾Œä?å­˜ï?${new Date(lastSavedAt).toLocaleString('zh-HK', { hour12: false })}` : storageStatus}</span>{storageUsage && <small>?²å?ç©ºé?ï¼š{(storageUsage.usage / 1048576).toFixed(1)} MB / {(storageUsage.quota / 1048576).toFixed(0)} MB{storageUsage.usage / storageUsage.quota > 0.8 ? 'ï¼ˆæ¥è¿‘ä??ï?å»ºè­°?¯å‡º?™ä»½ï¼? : ''}</small>}</div>{(settingsLabel ? [settingsLabel] : ['æ¨“å±¤', 'æ©Ÿæˆ¿', '?¿é??ç¨±']).map(label => <div className="settings-group" key={label}><div className="settings-group-title"><strong>{label === 'äº‹é?' ? 'ä¸€?? : label === 'å®‰å…¨' ? 'å®‰å…¨äº‹é?' : label}</strong><span>{(settingsOptions[label] || []).length} ?‹é¸??/span></div><div className="settings-options">{(settingsOptions[label] || []).map(option => <button key={option} onClick={() => setSettingsOptions(current => ({ ...current, [label]: current[label].filter(item => item !== option) }))}>{option}<span>?</span></button>)}</div><div className="settings-add"><input value={newOption[label] || ''} onChange={e => setNewOption(current => ({ ...current, [label]: e.target.value }))} placeholder={`?°å?${label}?¸é?`} /><button onClick={() => { const value = (newOption[label] || '').trim(); if (!value) return; setSettingsOptions(current => ({ ...current, [label]: [...(current[label] || []), value] })); setNewOption(current => ({ ...current, [label]: '' })) }}>?°å?</button></div></div>)}</section>}
      {appMode === 'photo' && tab === 'photos' && <section className="content"><div className="section-heading photo-heading"><div><p className="eyebrow">PHOTO ARCHIVE</p><h2>?¸ç???/h2></div><div className="photo-actions"><span className="photo-total">å·²é¸ {selected.length} å¼?/span><button className="select-all-button" onClick={() => setSelected(selected.length === projectPhotos.length ? [] : projectPhotos.map(photo => photo.id))} disabled={!projectPhotos.length}>{selected.length === projectPhotos.length && projectPhotos.length ? '?–æ??¨é¸' : '?¨é¸'}</button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>ä¸€å°æ???/button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 24 * 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>ä¸€?¥å…§</button><button className="quick-select-button danger-button" onClick={deleteSelectedPhotos} disabled={!selected.length}>?ªé™¤</button><div className="export-bar"><button onClick={exportExcel}>?¯å‡º Excel</button><button onClick={exportPdf}>?¯å‡º PDF</button></div></div></div><div className="photo-grid">{projectPhotos.map(p => <div className="photo-card" key={p.id}><button className="photo-open" onClick={() => setDetail(p)}><img src={p.src} alt={`${p.category} ${p.createdAt}`} /></button><label className="check"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /><span /></label></div>)}{!projectPhotos.length && <div className="empty-state">å°šæœª?‰ç›¸?‡è???br /><small>?²å…¥å·¥ç?é¡åˆ¥?‹å??æ?</small></div>}</div><div id="pdf-report" className="pdf-report" aria-hidden="true"><h1>?°ç›¤?¸ç?è¨˜é??±è¡¨</h1>{photos.filter(p => selected.includes(p.id)).map(p => <article key={p.id}><img src={p.src} alt="" /><div><b>{p.category}</b><p>{Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ')}</p><p>{p.note}</p><small>{new Date(p.createdAt).toLocaleString('zh-HK')}</small></div></article>)}</div></section>}
      {updateAvailable && <div className="camera-error-banner" role="status">å·²æ??°ç??¬å¯?¨ï?è«‹æ??Œæ›´??App?å??¨ã€?/div>}
      {appMode === 'backup' && <section className="content info-page"><button className="back-link" onClick={() => { setHandoverView('settings'); setAppMode('handover') }}>??è¿”å?è¨­å?</button><div className="section-heading"><div><p className="eyebrow">BACKUP</p><h2>?™ä»½</h2></div></div><div className="about-block"><h3>å®Œæ•´è³‡æ??™ä»½</h3><p>?™ä»½?´å€?App ??Project?ç›¸?‡ã€Site Memo ?Šæ??¿ç§»äº¤è??™ã€?/p><div className="backup-actions"><button type="button" onClick={exportLocalBackup} disabled={backupBusy}>{backupBusy ? 'æ­?œ¨æº–å??™ä»½?? : '?¯å‡ºå®Œæ•´?™ä»½'}</button><button type="button" onClick={() => backupRef.current?.click()} disabled={backupBusy}>?¯å…¥å®Œæ•´?™ä»½</button><input ref={backupRef} hidden type="file" accept="application/zip,.zip" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !confirm('?¯å…¥è³‡æ??ƒå?ä»?›®??App ?„å…¨?¨è??™ã€‚æ˜¯?¦ç¹¼çºŒï?')) return; await importLocalBackup(file) }} /></div></div></section>}
      {appMode === 'about' && <section className="content info-page"><div className="section-heading"><div><p className="eyebrow">ABOUT</p></div></div><div className="about-block"><h3 className="about-title">?œæ–¼æ­?App</h3><p>?™æ˜¯ä¸€?‹ç‚º?°ç›¤å·¥ç??Œè¨­?„æ??•è??„å·¥?·ï??¯æ´?¢ç?ä½¿ç”¨ï¼Œæ??‰ç›¸?‡è?è³‡æ??‡ä?å­˜åœ¨?¬æ?è£ç½®?‚ä¸»è¦å??½å??¬ï??ç…§è¨˜é?ï¼ˆè‡ª?•å?ä¸Šå·¥ç¨‹é??¥ã€æ?å±¤ã€æ??¿ç??ºèƒ½æ¨™ç±¤ä¸¦ç???Excelï¼PDF ?±è¡¨ï¼‰ã€Site Memoï¼ˆä??µç???A4 Site Menoï¼‰å??¶æˆ¿ç§»äº¤??/p></div><div className="about-block profile-block"><h3>?‹ç™¼?Šä½¿?¨è€…è???/h3><div className="profile-card"><div className="profile-avatar" aria-hidden="true">HC</div><div className="profile-meta"><strong>Henry Chu</strong><span>Project Manager</span><span>Southa Technical Ltd</span><a href="mailto:chuwing134538@gmail.com" className="profile-email">chuwing134538@gmail.com</a></div></div></div></section>}
      <nav className="bottom-nav main-nav"><button className={navMode === 'home' ? 'active' : ''} onClick={() => { setAppMode('home'); setTab('home'); setActive(null) }}><span><Home size={20} /></span>é¦–é?</button><button className={navMode === 'photo' && tab === 'photos' ? 'active' : ''} onClick={() => { setAppMode('photo'); setTab('photos'); setActive(null) }}><span><Images size={20} /></span>?¸ç°¿</button><button className={navMode === 'handover' ? 'active' : ''} onClick={() => { setHandoverView('settings'); setAppMode('handover') }}><span><Building2 size={20} /></span>è¨­å?</button><button className={navMode === 'about' ? 'active' : ''} onClick={() => setAppMode('about')}><span><Info size={20} /></span>è³‡æ?</button></nav>
    </main>
    {continuousCamera && <div className="overlay dark-overlay camera-overlay"><div className="camera-sheet"><div className="camera-topline"><span className="camera-spacer" aria-hidden="true" /><button className={`camera-flash ${flashEnabled ? 'selected' : ''}`} onClick={toggleFlash} aria-label="?‡æ??ƒå???>?<span>{flashEnabled ? 'ON' : 'A'}</span></button><div className="camera-status"><i /> LIVE Â· {currentPhotos.length} å¼?/div></div>{captureMessage && <p className="capture-message" role="status">{captureMessage}</p>}<div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted /><span className="frame-corner top-left" /><span className="frame-corner top-right" /><span className="frame-corner bottom-left" /><span className="frame-corner bottom-right" /><div className="zoom-controls" aria-label="ç¸®æ”¾?ç?"><button onClick={() => changeZoom(.5)} className={zoomLevel === .5 ? 'selected' : ''}>0.5</button><button onClick={() => changeZoom(1)} className={zoomLevel === 1 ? 'selected' : ''}>1?</button><button onClick={() => changeZoom(2)} className={zoomLevel === 2 ? 'selected' : ''}>2</button><button onClick={() => changeZoom(5)} className={zoomLevel === 5 ? 'selected' : ''}>5</button></div></div>{cameraError && <p className="camera-error">{cameraError}</p>}<div className="camera-toolbar"><button className="camera-control" onClick={stopContinuousCamera} aria-label="?–æ??æ?">?</button><button className={`shutter ${captureBusy ? 'is-busy' : ''}`} onClick={captureContinuousPhoto} disabled={captureBusy} aria-label="?æ??¸ç?">{captureBusy ? '?? : ''}</button><button className="camera-control" aria-label="?‡æ??¡é ­">??/button></div></div></div>}
    {saveToast && <div className="camera-error-banner" role="alert">{saveToast}</div>}
    {cameraError && !continuousCamera && <div className="camera-error-banner">{cameraError}</div>}
    {picker && <div className="overlay" onClick={() => setPicker(null)}><div className="sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SELECT OPTION</p><h3>{picker}</h3></div><button className="close" onClick={() => setPicker(null)}>?</button></div><button className="option option-na" key="__NA__" onClick={() => { setTags(t => ({ ...t, [picker]: 'N/A' })); setPicker(null) }}>N/Aï¼ˆä??©ç”¨ï¼?span>{tags[picker] === 'N/A' ? '?? : '??}</span></button>{(settingsOptions[picker] || []).map(option => <button className="option" key={option} onClick={() => { setTags(t => ({ ...t, [picker]: option })); setPicker(null) }}>{option}<span>{tags[picker] === option ? '?? : '??}</span></button>)}<div className="custom-option"><input id="custom" placeholder="?°å??ªè??…ç›®" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.value.trim()) { setTags(t => ({ ...t, [picker]: e.currentTarget.value.trim() })); setPicker(null) } }} /><button onClick={() => { const input = document.getElementById('custom') as HTMLInputElement; if (input.value.trim()) { setTags(t => ({ ...t, [picker]: input.value.trim() })); setPicker(null) } }}>?°å?</button></div></div></div>}
    {detail && <div className="overlay dark-overlay" onClick={() => setDetail(null)}><div className="detail-modal" onClick={e => e.stopPropagation()}><button className="detail-back" onClick={() => setDetail(null)} aria-label="è¿”å??¸ç???>??è¿”å?</button><button className="close light" onClick={() => setDetail(null)} aria-label="?œé??¸ç?è©³æ?">?</button><img src={detail.src} alt="?¸ç?è©³æ?" /><div className="detail-copy"><b>{detail.category}</b><p className="detail-tags">{Object.entries(detail.tags).filter(([,v]) => v && v !== 'N/A').map(([k,v]) => <span key={k}>{k}: {v}</span>)}{!Object.values(detail.tags).some(v => v && v !== 'N/A') && <span>?ªè¨­å®šæ?ç±?/span>}</p><p>{detail.note || 'æ²’æ??™è¨»'}</p><small>{new Date(detail.createdAt).toLocaleString('zh-HK')}</small></div></div></div>}
    {projectPanel && <div className="overlay" onClick={() => setProjectPanel(false)}><div className="sheet project-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">PROJECTS</p><h3>?¸æ? Project</h3></div><button className="close" onClick={() => setProjectPanel(false)} aria-label="?œé?">?</button></div>{projects.map(project => <button className={`option ${project.id === currentProject.id ? 'chosen' : ''}`} key={project.id} onClick={() => { const projectSettings = project.settings || createProjectSettings(); switchingProjectRef.current = true; setCurrentProjectId(project.id); setCategories(projectSettings.categories); setTags(projectSettings.tags); setNote(projectSettings.note); setNoteHistory(projectSettings.noteHistory || []); setSettingsOptions(mergeTagOptions(projectSettings.settingsOptions)); setSelectedNotes([]); setProjectPanel(false); setActive(null); setSelected([]) }}><span>{project.name}<small>{photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === project.id).length} å¼µç›¸??/small></span><b>{project.id === currentProject.id ? '?? : '??}</b></button>)}<div className="project-add"><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="è¼¸å…¥??Project ?ç¨±" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addProject() }} /><button onClick={addProject}>?°å?</button></div></div></div>}
    {newCategory && <div className="overlay" onClick={() => setNewCategory(false)}><div className="sheet small-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">NEW CATEGORY</p><h3>?°å?å·¥ç?é¡åˆ¥</h3></div><button className="close" onClick={() => setNewCategory(false)}>?</button></div><input className="category-input" autoFocus placeholder="ä¾‹å?ï¼šå??†å·¥ç¨? onKeyDown={e => { if (e.key === 'Enter') addCategory(e.currentTarget.value) }} /><button className="primary-button" onClick={() => addCategory((document.querySelector('.category-input') as HTMLInputElement).value)}>å»ºç?é¡åˆ¥</button></div></div>}
  </>
}
