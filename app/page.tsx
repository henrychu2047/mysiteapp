'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { Camera, PenLine, ClipboardList, Building2, Info, Home, Images, Database, BookOpen, ShieldCheck } from 'lucide-react'
import { SiteMemo } from '@/components/site-memo/site-memo'
import { Handover } from '@/components/handover/handover'
import { Notebook } from '@/components/notebook/notebook'
import { loadAllMemos, saveAllMemos } from '@/components/site-memo/memo-data'
import { buildFloorNames, createRoomHandover, loadAllHandover, ROOM_NAME_SUGGESTIONS, saveAllHandover, type HandoverProjectData, type Tower } from '@/components/handover/handover-data'

type Photo = { id: string; src: string; cleanSrc: string; originalBlob?: Blob; thumbnailBlob?: Blob; stampedBlob?: Blob; category: string; tags: Record<string, string>; note: string; createdAt: string; projectId: string }
type Category = { name: string; icon: string }
type ProjectSettings = { categories: Category[]; tags: Record<string, string>; note: string; settingsOptions: Record<string, string[]>; noteHistory: string[] }
type Project = { id: string; name: string; settings?: ProjectSettings }

const DEFAULT_PROJECT: Project = { id: 'default-project', name: '我的 Project' }
const PROJECTS_KEY = 'site-photo-projects'
const CURRENT_PROJECT_KEY = 'site-photo-current-project'

const defaultCategories: Category[] = [
  { name: '電器', icon: '⌁' },
  { name: '冷氣', icon: '◇' },
  { name: '消防', icon: '△' },
  { name: '安全', icon: '◈' },
  { name: '制櫃/發電機', icon: '▤' },
  { name: '建築', icon: '▥' },
  { name: '物料', icon: '▦' },
  { name: '機房移交', icon: '☑' },
]
const normalizeCategoryName = (name: string) => {
  if (name === '發電機') return '安全'
  if (name === '制櫃') return '制櫃/發電機'
  return name
}
const ensureDefaultCategories = (categories: Category[] | undefined) => {
  const existing = (categories || [])
    .filter(category => category.name !== '建築物料')
    .map(category => ({ ...category, name: normalizeCategoryName(category.name) }))
    .filter((category, index, all) => all.findIndex(item => item.name === category.name) === index)
  return [...existing, ...defaultCategories.filter(category => !existing.some(item => item.name === category.name))]
}
const tagOptions: Record<string, string[]> = {
  樓層: ['B02', 'B01', 'L00', 'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L19', 'MR/F', 'UR1/F', 'UR2/F'],
  機房: ['電制房', '總制房', '發電機房', 'AHU房', 'ELV房', 'TR房'],
  房間名稱: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S8', 'ELV1', 'ELV2', 'ELV3', 'ELV4', 'TR1', 'TR2', 'TR3', 'TR4', '1', '2', '3', '4'],
  事項: ['Defect', '未做喉', '未做糟', '未補明喉', '未穿線', '未裝燈', '未裝膠器', '未起鐵架', '未封板', '未開吼', '未塞吼', '未裝門', '進度慢', '被破壞', '受其它行頭阻礙', '受建築阻礙', '建築漏水', '其它行頭無跟CSD做'],
  安全: ['無圍欄', '不正規高空工作', '無安全帶', '無帶安全帽', '無安全繩', '地坑無鐵板', '吸煙'],
  收貨相關: ['已收待驗', '已入貨倉', '已交判頭', '來貨有問題', '來貨破爛'],
  座數: [],
  備用: ['備用'],
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
    script.onerror = () => reject(new Error('匯出套件載入失敗'))
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
      if (!ctx) return reject(new Error('無法建立圖片轉換器'))
      ctx.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    image.onerror = () => reject(new Error('無法轉換原圖'))
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
          reject(new Error('無法建立圖片處理器'))
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
        const stamped = canvas.toDataURL('image/jpeg', 0.78)
        const stampedBlob = dataUrlToBlob(stamped)
        resolve({ stamped, clean: cleanDataUrl, originalBlob, thumbnailBlob, stampedBlob })
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
  const [photosReady, setPhotosReady] = useState(false)
  const [projects, setProjects] = useState<Project[]>([{ ...DEFAULT_PROJECT, settings: createProjectSettings() }])
  const [currentProjectId, setCurrentProjectId] = useState(DEFAULT_PROJECT.id)
  const [projectPanel, setProjectPanel] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [renameProjectName, setRenameProjectName] = useState('')
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null)
  const [firstLaunch, setFirstLaunch] = useState(false)
  const [setupProjectName, setSetupProjectName] = useState('')
  const [setupTowers, setSetupTowers] = useState('1')
  const [setupTowerPrefix, setSetupTowerPrefix] = useState('')
  const [setupFloors, setSetupFloors] = useState('1')
  const [setupFloorPrefix, setSetupFloorPrefix] = useState('')
  const [setupFloorSuffix, setSetupFloorSuffix] = useState('')
  const [setupCompactFloors, setSetupCompactFloors] = useState(false)
  const [setupRooms, setSetupRooms] = useState('')
  const [setupRoomSuffixStart, setSetupRoomSuffixStart] = useState('')
  const [setupRoomSuffixEnd, setSetupRoomSuffixEnd] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [appMode, setAppMode] = useState<'home' | 'photo' | 'memo' | 'notebook' | 'handover' | 'reserve' | 'about' | 'backup'>('home')
  const [tab, setTab] = useState<'home' | 'photos' | 'settings'>('home')
  const [settingsOptions, setSettingsOptions] = useState<Record<string, string[]>>(tagOptions)
  const [structureOptions, setStructureOptions] = useState<Record<string, string[]>>({ 座數: [], 樓層: [], 機房: [], 房間名稱: [] })
  const [settingsLabel, setSettingsLabel] = useState<string | null>(null)
  const [newOption, setNewOption] = useState<Record<string, string>>({})
  const [settingsReady, setSettingsReady] = useState(false)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
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
  const [storageStatus, setStorageStatus] = useState('本機保存中')
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saveToast, setSaveToast] = useState('')
  useEffect(() => {
    navigator.storage?.persist?.().then((persisted) => setStorageStatus(persisted ? '本機持久保存' : '本機保存中')).catch(() => undefined)
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
        if (saved['其它'] && !saved['收貨相關']) { saved['收貨相關'] = saved['其它']; delete saved['其它'] }
        if (saved['備註'] && !saved['房間名稱']) { saved['房間名稱'] = saved['備註']; delete saved['備註'] }
        const migratedSettings = { ...fallbackSettings, tags: memory.tags || {}, note: memory.note || '', settingsOptions: mergeTagOptions({ ...tagOptions, ...saved }), noteHistory: legacyNoteHistory ? JSON.parse(legacyNoteHistory).slice(0, 10) : [] }
        const migratedProjects = (savedProjectList.length ? savedProjectList : [{ ...DEFAULT_PROJECT }]).map(project => ({ ...project, settings: project.settings || { ...migratedSettings, categories: ensureDefaultCategories(migratedSettings.categories).map(category => ({ ...category })), tags: { ...migratedSettings.tags }, settingsOptions: Object.fromEntries(Object.entries(migratedSettings.settingsOptions).map(([key, values]) => [key, [...(values as string[])]])), noteHistory: [...migratedSettings.noteHistory] } }))
        setProjects(migratedProjects)
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(migratedProjects))
        localStorage.removeItem('site-photo-memory'); localStorage.removeItem('site-photo-options'); localStorage.removeItem('site-photo-note-history')
      }
      if (!localStorage.getItem(PROJECTS_KEY)) setFirstLaunch(true)
    } catch { /* 儲存空間不可用時仍可繼續拍攝 */ }
    setProjectsLoaded(true)
    setSettingsReady(true)
  }, [])
  useEffect(() => {
    if (!settingsReady || !photosReady || !projectsLoaded) return
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
      console.error('資料保存失敗:', error)
      setSaveState('error')
      setSaveToast('資料保存失敗，請檢查裝置儲存空間')
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
  const completeFirstLaunch = async () => {
    const name = setupProjectName.trim()
    const towerCount = Math.max(1, Math.floor(Number(setupTowers) || 0))
    const floorCount = Math.max(1, Math.floor(Number(setupFloors) || 0))
    if (!name) return
    const roomNames = setupRooms.split(/[,，\n]/).map(room => room.trim()).filter(Boolean)
    const suffixPattern = /^(.*?)(\d+)$/
    const expandSuffixes = (start: string, end: string) => {
      const first = start.trim()
      const last = end.trim() || first
      if (!first) return ['']
      const a = first.match(suffixPattern); const b = last.match(suffixPattern)
      if (!a || !b || a[1] !== b[1]) return [first]
      const from = Number(a[2]); const to = Number(b[2]); if (from > to || to - from > 100) return [first]
      const width = Math.max(a[2].length, b[2].length)
      return Array.from({ length: to - from + 1 }, (_, index) => `${a[1]}${String(from + index).padStart(width, '0')}`)
    }
    const floors = buildFloorNames(floorCount, true, setupFloorPrefix.trim(), setupFloorSuffix.trim(), setupCompactFloors)
    const roomSuffixes = expandSuffixes(setupRoomSuffixStart, setupRoomSuffixEnd)
    const finalRoomNames = roomNames.flatMap(room => roomSuffixes.map(suffix => `${room}${suffix ? ` ${suffix}` : ''}`))
    const towers: Tower[] = Array.from({ length: towerCount }, (_, towerIndex) => ({
      id: createId(), name: `${setupTowerPrefix.trim()}${towerIndex + 1}`, floors: floors.map(floorName => ({ id: createId(), name: floorName, rooms: finalRoomNames.map(roomName => ({ id: createId(), name: roomName, handover: createRoomHandover() })) })),
    }))
    const project: Project = { id: createId(), name, settings: createProjectSettings() }
    setProjects([project])
    setCurrentProjectId(project.id)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([project]))
    localStorage.setItem(CURRENT_PROJECT_KEY, project.id)
    await saveAllHandover({ [project.id]: { towers, responsiblePerson: { name: '', company: '', contractor: '', department: '', position: '' } } })
    setFirstLaunch(false)
  }
  const renameCurrentProject = () => {
    const name = renameProjectName.trim()
    if (!name || !renameProjectId) return
    if (projects.some(project => project.id !== renameProjectId && project.name === name)) { alert('Project 名稱已存在'); return }
    setProjects(current => current.map(project => project.id === renameProjectId ? { ...project, name } : project))
    setRenameProjectName('')
    setRenameProjectId(null)
  }
  const rememberNote = () => {
    const value = note.trim()
    if (!value) return
    setNoteHistory(current => [value, ...current.filter(item => item !== value)].slice(0, 10))
  }
  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (saveState !== 'saved') {
        event.preventDefault()
        event.returnValue = '資料尚未保存，確定要離開嗎？'
      }
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [saveState])
  const currentProject = projects.find(project => project.id === currentProjectId) || DEFAULT_PROJECT
  const structureKeys = ['座數', '樓層', '機房', '房間名稱']
  const handleStructureChange = useCallback((options: Record<string, string[]>) => {
    setStructureOptions(options)
  }, [])
  const effectiveSettingsOptions = useMemo(() => ({ ...settingsOptions, ...structureOptions }), [settingsOptions, structureOptions])
  useEffect(() => {
    loadAllHandover().then(data => {
      const towers = data[currentProjectId]?.towers || []
      const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
      const rooms = towers.flatMap(tower => tower.floors.flatMap(floor => floor.rooms.map(room => room.name)))
      const options = {
        座數: unique(towers.map(tower => tower.name)),
        樓層: unique(towers.flatMap(tower => tower.floors.map(floor => floor.name))),
        機房: unique(rooms),
        房間名稱: unique(rooms),
      }
      handleStructureChange(options)
    }).catch(() => handleStructureChange({ 座數: [], 樓層: [], 機房: [], 房間名稱: [] }))
  }, [currentProjectId, handleStructureChange])
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
    if (!window.isSecureContext) {
      setCameraError('連續拍攝需要 HTTPS；目前網址不安全，請改用立即拍照或設定 HTTPS')
      return
    }
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
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setCameraError('鏡頭尚未準備好，請稍候再按快門')
      setCaptureMessage('')
      setCaptureBusy(false)
      return
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('無法建立畫布')
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('無法擷取相片')), 'image/jpeg', 0.92))
      const result = await stampImage(new File([blob], 'camera.jpg', { type: 'image/jpeg' }), active, tags, note, currentProject.name)
      const photo = { id: createId(), src: result.stamped, cleanSrc: result.clean, originalBlob: result.originalBlob, thumbnailBlob: result.thumbnailBlob, stampedBlob: result.stampedBlob, category: active, tags, note, createdAt: new Date().toISOString(), projectId: currentProject.id }
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
        const reason = error instanceof Error ? error.message : '未知錯誤'
        setCameraError(`${file.name} 處理失敗：${reason}`)
      }
    }
    if (added.length) {
      setCaptureMessage(failures.length ? `已加入 ${added.length} 張；${failures.length} 張失敗` : `已加入 ${added.length} 張相片`)
      setTab('photos')
    } else if (failures.length) {
      setCameraError('相片處理失敗，請確認檔案格式及裝置儲存空間')
    }
  }
  const addProject = () => {
    const name = newProjectName.trim()
    if (!name) return
    if (projects.some(project => project.name === name)) { alert('Project 名稱已存在'); return }
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
  const addCategory = (name: string) => { if (name.trim()) setCategories(c => [...c, { name: name.trim(), icon: '＋' }]); setNewCategory(false) }
  const removeCategory = (name: string) => { if (confirm(`確定刪除「${name}」及其相片？`)) { setCategories(c => c.filter(x => x.name !== name)); setPhotos(p => p.filter(x => x.category !== name)) } }
  const deleteSelectedPhotos = () => {
    if (!selected.length) return
    if (!confirm(`確定刪除已選的 ${selected.length} 張相片？此操作無法復原。`)) return
    setPhotos(current => current.filter(photo => !selected.includes(photo.id)))
    setSelected([])
    setDetail(null)
  }
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
    } finally {
      setBackupBusy(false)
    }
  }
  const updateApp = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/sw.js')
      if (!registration) { alert('程式已更新'); window.location.reload(); return }
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
      if (registration.waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', () => { alert('程式已更新'); window.location.reload() }, { once: true })
      } else {
        await registration.update()
        alert('程式已更新')
        window.location.reload()
      }
    } catch (error) {
      alert(`更新失敗：${error instanceof Error ? error.message : '請稍後再試'}`)
    }
  }

  const importLocalBackup = async (file: File | undefined) => {
    if (!file) return
    try {
      const zip = await JSZip.loadAsync(file)
      const manifest = zip.file('projects.json'); if (!manifest) throw new Error('找不到 projects.json')
      const raw = JSON.parse(await manifest.async('text')) as { version?: unknown; projects?: unknown; currentProjectId?: unknown }
      const version = typeof raw.version === 'number' ? raw.version : 1
      if (version > 2) throw new Error(`不支援的備份版本：${version}`)
      if (!Array.isArray(raw.projects) || !raw.projects.length) throw new Error('備份沒有有效 Project')
      const projectsToRestore = raw.projects.map((value, index) => {
        if (!value || typeof value !== 'object') throw new Error(`Project ${index + 1} 格式不正確`)
        const project = value as Partial<Project>
        if (typeof project.id !== 'string' || !project.id.trim() || typeof project.name !== 'string' || !project.name.trim()) throw new Error(`Project ${index + 1} 缺少有效名稱或 ID`)
        return { ...project, id: project.id.trim(), name: project.name.trim(), settings: { ...createProjectSettings(), ...(project.settings || {}), categories: ensureDefaultCategories(project.settings?.categories), tags: project.settings?.tags || {}, note: project.settings?.note || '', settingsOptions: mergeTagOptions(project.settings?.settingsOptions), noteHistory: project.settings?.noteHistory || [] } } as Project
      })
      const selectedProjectId = typeof raw.currentProjectId === 'string' && projectsToRestore.some(project => project.id === raw.currentProjectId) ? raw.currentProjectId : projectsToRestore[0].id
      const photoCount = Object.values(zip.files).filter(entry => !entry.dir && /\/photos\/[^/]+\.jpg$/i.test(entry.name)).length
      const memoFile = zip.file('site-memo.json')
      const handoverFile = zip.file('handover.json')
      if (!confirm(`確認匯入此備份？\nProject：${projectsToRestore.length} 個\n相片：${photoCount} 張\nSite Memo：${memoFile ? '有' : '無'}\n制房移交：${handoverFile ? '有' : '無'}\n\n匯入前會先下載目前資料作為復原備份。`)) return
      await exportLocalBackup()
      const restored: Photo[] = []
      for (const project of projectsToRestore) {
        const prefix = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${project.id}/photos/`
        const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith(prefix)) as JSZip.JSZipObject[]
        for (const entry of entries) { const blob = await entry.async('blob'); const src = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) }); restored.push({ id: entry.name.split('/').pop()!.replace(/\\.jpg$/, ''), src, cleanSrc: src, category: normalizeCategoryName(project.settings?.categories?.[0]?.name || '其它'), tags: {}, note: '', createdAt: new Date().toISOString(), projectId: project.id }) }
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
      setProjects(projectsToRestore); setCurrentProjectId(selectedProjectId); setPhotos(restored); alert('ZIP 備份已還原')
    } catch { alert('ZIP 備份檔案無法讀取') }
  }

  if (appMode === 'notebook') return <Notebook projectId={currentProject.id} projectName={currentProject.name} onBack={() => setAppMode('home')} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('photos'); setActive(null) } if (mode === 'handover') setHandoverView('settings') }} />

  if (appMode === 'memo') return <SiteMemo projectId={currentProject.id} projectName={currentProject.name} onBack={() => setAppMode('home')} onOpenMachineData={() => { setHandoverView('home'); setAppMode('handover') }} onOpenMachineDataManage={() => { setHandoverView('settings'); setAppMode('handover') }} onNavigate={mode => { if (mode === 'handover') setHandoverView('settings'); setAppMode(mode); if (mode === 'photo') { setTab('home'); setActive(null) } }} />

  if (appMode === 'handover') return <Handover initialView={handoverView} projectId={currentProject.id} projectName={currentProject.name} onBack={() => setAppMode('home')} onOpenPhotoSettings={label => { setSettingsLabel(label || null); setAppMode('photo'); setTab('settings'); setActive(null) }} onPhotoSettingsBack={() => { setSettingsLabel(null); setHandoverView('settings'); setAppMode('handover') }} onStructureChange={handleStructureChange} onUpdateApp={updateApp} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('home'); setActive(null) } if (mode === 'handover') { setHandoverView('manage') } }} />

  const navMode = appMode as string

  return <>
    {renameProjectId && <div className="overlay" role="dialog" aria-modal="true" onClick={() => setRenameProjectId(null)}><div className="sheet small-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">RENAME PROJECT</p><h3>重新命名 Project</h3></div><button className="close" onClick={() => setRenameProjectId(null)} aria-label="關閉">×</button></div><label className="ho-field"><span>Project 名稱</span><input autoFocus value={renameProjectName} onChange={e => setRenameProjectName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) renameCurrentProject() }} /></label><button className="primary-button" disabled={!renameProjectName.trim()} onClick={renameCurrentProject}>保存名稱</button></div></div>}
    {firstLaunch && <div className="overlay" role="dialog" aria-modal="true"><div className="sheet first-launch-sheet"><div className="sheet-header"><div><p className="eyebrow">FIRST PROJECT SETUP</p><h2>建立第一個 Project</h2></div></div><p className="settings-intro">首次使用請輸入 Project 名稱，以及目前批量產生的座數／樓層／機房資料。</p><label className="ho-field"><span>Project 名稱</span><input autoFocus value={setupProjectName} onChange={e => setSetupProjectName(e.target.value)} placeholder="例如：Tower A 工程" /></label><div className="setup-grid"><label className="ho-field"><span>座數</span><input type="number" min="1" value={setupTowers} onChange={e => setSetupTowers(e.target.value)} /></label><label className="ho-field"><span>座數前綴</span><input value={setupTowerPrefix} onChange={e => setSetupTowerPrefix(e.target.value)} placeholder="例如：座" /></label><label className="ho-field"><span>樓層數</span><input type="number" min="1" value={setupFloors} onChange={e => setSetupFloors(e.target.value)} /></label><label className="ho-field"><span>樓層前綴</span><input value={setupFloorPrefix} onChange={e => setSetupFloorPrefix(e.target.value)} placeholder="例如：L" /></label><label className="ho-field"><span>樓層後綴</span><input value={setupFloorSuffix} onChange={e => setSetupFloorSuffix(e.target.value)} placeholder="例如：/F" /></label></div><label className="check-row"><input type="checkbox" checked={setupCompactFloors} onChange={e => setSetupCompactFloors(e.target.checked)} /><span>樓層使用兩位數編號（L00、L01…）</span></label><label className="ho-field"><span>機房名稱</span><textarea rows={3} value={setupRooms} onChange={e => setSetupRooms(e.target.value)} placeholder="可輸入自訂名稱，每行一個" /></label><div className="ho-suggest-list">{ROOM_NAME_SUGGESTIONS.map(name => { const selected = setupRooms.split(/[,，\n]/).map(value => value.trim()).filter(Boolean).includes(name); return <button type="button" key={name} className={`ho-suggest ${selected ? 'on' : ''}`} onClick={() => { const names = setupRooms.split(/[,，\n]/).map(value => value.trim()).filter(Boolean); const next = selected ? names.filter(value => value !== name) : [...names, name]; setSetupRooms(next.join(', ')) }}>{selected && '✓ '}{name}</button> })}</div><div className="setup-grid"><label className="ho-field"><span>機房後綴開始</span><input value={setupRoomSuffixStart} onChange={e => setSetupRoomSuffixStart(e.target.value)} placeholder="例如：1 或 N1" /></label><label className="ho-field"><span>機房後綴完結</span><input value={setupRoomSuffixEnd} onChange={e => setSetupRoomSuffixEnd(e.target.value)} placeholder="例如：4 或 N4" /></label></div><button className="primary-button" disabled={!setupProjectName.trim()} onClick={() => void completeFirstLaunch()}>建立 Project 並開始使用</button></div></div>}
    {isOffline && <div className="offline-banner" role="status">目前為離線模式，資料會儲存在本機</div>}
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">▦</div><button className="project-trigger" onClick={() => setProjectPanel(true)} aria-label="選擇 Project"><strong>{currentProject.name}</strong><span>⌄</span></button>
      </header>
      {appMode === 'home' && <section className="content home-page"><div className="section-heading"><div><p className="eyebrow">WORKSITE TOOLS</p></div></div><div className="app-card-grid"><button className="app-card app-card-photo" onClick={() => { setAppMode('photo'); setTab('home'); setActive(null) }}><Camera /><strong>拍照記錄</strong><small>{projectPhotos.length} 張相片</small></button><button className="app-card" onClick={() => setAppMode('memo')}><PenLine /><strong>Site Memo</strong><small>現場備忘及報告</small></button><button className="app-card" onClick={() => { setHandoverView('home'); setAppMode('handover') }}><ClipboardList /><strong>機房移交</strong><small>移交檢查記錄</small></button><button className="app-card" onClick={() => setAppMode('notebook')}><BookOpen /><strong>記事簿</strong><small>快速記錄現場事項</small></button><button className="app-card" onClick={() => setAppMode('reserve')}><ShieldCheck /><strong>Permit to Work</strong><small>開發中</small></button><button className="app-card" onClick={() => setAppMode('reserve')}><Database /><strong>資料庫</strong><small>開發中</small></button></div></section>}
      {appMode === 'reserve' && <section className="content info-page"><div className="section-heading"><div><p className="eyebrow">COMING SOON</p><h2>功能開發中</h2></div></div><div className="info-empty"><span>⚒</span><strong>此功能正在開發</strong><p>Permit to Work、記事簿及資料庫功能將於稍後加入。</p><button className="primary-button" onClick={() => setAppMode('home')}>返回首頁</button></div></section>}
      {appMode === 'photo' && tab === 'home' && !active && <section className="content"><div className="section-heading"><div><p className="eyebrow">PROJECT ARCHIVE</p><h2>工程類別</h2></div><span className="photo-total">{projectPhotos.length} 張相片</span></div><div className="category-grid">{categories.map(c => <button key={c.name} className="category-card" onClick={() => setActive(c.name)} onContextMenu={e => { e.preventDefault(); removeCategory(c.name) }}><span className="category-icon">{c.icon}</span><strong>{c.name}</strong><span>{projectPhotos.filter(p => p.category === c.name).length} 張記錄</span></button>)}<button className="category-card add-card" onClick={() => setNewCategory(true)}><span className="category-icon">＋</span><strong>新增類別</strong><span>自訂工程分類</span></button></div><div className="hint">長按類別卡片可刪除分類</div></section>}
      {appMode === 'photo' && tab === 'home' && active && <section className="content"><button className="back-link" onClick={() => setActive(null)}>‹ 返回</button><div className="section-heading"><div><p className="eyebrow">CURRENT CATEGORY</p><h2>{active}</h2></div><span className="photo-total">{currentPhotos.length} 張</span></div><div className="capture-actions"><button className="capture-button camera" onClick={startContinuousCamera}><span>▣</span><div><strong>連續拍攝</strong><small>拍完可立即拍下一張</small></div></button><button className="capture-button secondary-camera" onClick={() => cameraRef.current?.click()}><span>□</span><div><strong>立即拍照</strong><small>使用 iPhone 原生相機</small></div></button><button className="capture-button album" onClick={() => albumRef.current?.click()}><span>▧</span><div><strong>選擇相簿</strong><small>可一次匯入多張</small></div></button><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={async e => { await importFiles(e.target.files); e.currentTarget.value = '' }} /><input ref={albumRef} hidden type="file" accept="image/*" multiple onChange={async e => { await importFiles(e.target.files); e.currentTarget.value = '' }} /></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>拍攝資訊</h3></div><span className="memory-dot">● 已記憶</span></div><div className="tag-grid">{['座數', '樓層', '機房', '房間名稱', '安全', '收貨相關', '事項', '備用'].map(label => <button className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} onClick={() => setPicker(label)}><span>{label}</span><b>{tags[label] || '選擇'}</b></button>)}</div><label className="note-field"><span>文字備註</span><input value={note} onChange={e => setNote(e.target.value)} onBlur={rememberNote} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { rememberNote(); e.currentTarget.blur() } }} placeholder="輸入本次拍攝的補充說明..." /></label>{noteHistory.length > 0 && <div className="note-history"><small>最近使用</small><div>{noteHistory.map(item => <button type="button" key={item} onClick={() => setSelectedNotes(current => { const next = current.includes(item) ? current.filter(value => value !== item) : [...current, item]; setNote(next.join(' / ')); return next })} className={selectedNotes.includes(item) ? 'selected' : ''} aria-pressed={selectedNotes.includes(item)}>{item}</button>)}</div></div>}</div></section>}
      {appMode === 'photo' && tab === 'settings' && <section className="content settings-page"><button className="back-link" onClick={() => { setSettingsLabel(null); setHandoverView('settings'); setAppMode('handover'); setActive(null) }}>‹ 返回設定</button><div className="section-heading"><div><p className="eyebrow">APP SETTINGS</p><h2>設定{settingsLabel ? ` · ${settingsLabel === '事項' ? '一般' : settingsLabel === '安全' ? '安全事項' : settingsLabel}` : ''}</h2></div></div><div className="project-name-setting"><label htmlFor="project-name">Project 名稱</label><input id="project-name" value={currentProject.name} onChange={e => { const name = e.target.value; setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, name } : project)) }} placeholder="輸入 Project 名稱" /></div><p className="settings-intro">自訂六個標籤類別的選項，之後拍攝時會自動提供。</p><div className="local-storage-card"><strong>{saveState === 'saving' ? '正在保存…' : saveState === 'error' ? '保存失敗' : '已保存'}</strong><span>{lastSavedAt ? `最後保存：${new Date(lastSavedAt).toLocaleString('zh-HK', { hour12: false })}` : storageStatus}</span>{storageUsage && <small>儲存空間：{(storageUsage.usage / 1048576).toFixed(1)} MB / {(storageUsage.quota / 1048576).toFixed(0)} MB{storageUsage.usage / storageUsage.quota > 0.8 ? '（接近上限，建議匯出備份）' : ''}</small>}</div>{(settingsLabel ? [settingsLabel] : structureKeys).map(label => <div className="settings-group" key={label}><div className="settings-group-title"><strong>{label === '事項' ? '一般' : label === '安全' ? '安全事項' : label}</strong><span>{(effectiveSettingsOptions[label] || []).length} 個選項</span></div><div className="settings-options">{(effectiveSettingsOptions[label] || []).map(option => <span className="option" key={option}>{option}</span>)}</div>{!structureKeys.includes(label) && <div className="settings-add"><input value={newOption[label] || ''} onChange={e => setNewOption(current => ({ ...current, [label]: e.target.value }))} placeholder={`新增${label}選項`} /><button onClick={() => { const value = (newOption[label] || '').trim(); if (!value) return; setSettingsOptions(current => ({ ...current, [label]: [...(current[label] || []), value] })); setNewOption(current => ({ ...current, [label]: '' })) }}>新增</button></div>}</div>)}</section>}
      {appMode === 'photo' && tab === 'photos' && <section className="content"><div className="section-heading photo-heading"><div><p className="eyebrow">PHOTO ARCHIVE</p><h2>相片集</h2></div><div className="photo-actions"><span className="photo-total">已選 {selected.length} 張</span><button className="select-all-button" onClick={() => setSelected(selected.length === projectPhotos.length ? [] : projectPhotos.map(photo => photo.id))} disabled={!projectPhotos.length}>{selected.length === projectPhotos.length && projectPhotos.length ? '取消全選' : '全選'}</button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>一小時內</button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 24 * 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>一日內</button><button className="quick-select-button danger-button" onClick={deleteSelectedPhotos} disabled={!selected.length}>刪除</button><div className="export-bar"><button onClick={exportExcel}>匯出 Excel</button><button onClick={exportPdf}>匯出 PDF</button></div></div></div><div className="photo-grid">{projectPhotos.map(p => <div className="photo-card" key={p.id}><button className="photo-open" onClick={() => setDetail(p)}><img src={p.src} alt={`${p.category} ${p.createdAt}`} /></button><label className="check"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /><span /></label></div>)}{!projectPhotos.length && <div className="empty-state">尚未有相片記錄<br /><small>進入工程類別開始拍攝</small></div>}</div><div id="pdf-report" className="pdf-report" aria-hidden="true"><h1>地盤相片記錄報表</h1>{photos.filter(p => selected.includes(p.id)).map(p => <article key={p.id}><img src={p.src} alt="" /><div><b>{p.category}</b><p>{Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ')}</p><p>{p.note}</p><small>{new Date(p.createdAt).toLocaleString('zh-HK')}</small></div></article>)}</div></section>}
      {updateAvailable && <div className="camera-error-banner" role="status">已有新版本可用，請按「更新 App」套用。</div>}
      {appMode === 'backup' && <section className="content info-page"><button className="back-link" onClick={() => { setHandoverView('settings'); setAppMode('handover') }}>‹ 返回設定</button><div className="section-heading"><div><p className="eyebrow">BACKUP</p><h2>備份</h2></div></div><div className="about-block"><h3>完整資料備份</h3><p>備份整個 App 的 Project、相片、Site Memo 及機房移交資料。</p><div className="backup-actions"><button type="button" onClick={exportLocalBackup} disabled={backupBusy}>{backupBusy ? '正在準備備份…' : '匯出完整備份'}</button><button type="button" onClick={() => backupRef.current?.click()} disabled={backupBusy}>匯入完整備份</button><input ref={backupRef} hidden type="file" accept="application/zip,.zip" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !confirm('匯入資料會取代目前 App 的全部資料。是否繼續？')) return; await importLocalBackup(file) }} /></div></div></section>}
      {appMode === 'about' && <section className="content info-page"><div className="section-heading"><div><p className="eyebrow">ABOUT</p></div></div><div className="about-block"><h3 className="about-title">關於此 App</h3><p>這是一個為地盤工程而設的流動記錄工具，支援離線使用，所有相片與資料均保存在本機裝置。主要功能包括：拍照記錄（自動加上工程類別、樓層、機房等智能標籤並生成 Excel／PDF 報表）、Site Memo（一鍵生成 A4 Site Meno）及制房移交。</p></div><div className="about-block profile-block"><h3>開發及使用者資料</h3><div className="profile-card"><div className="profile-avatar" aria-hidden="true">HC</div><div className="profile-meta"><strong>Henry Chu</strong><span>Project Manager</span><span>Southa Technical Ltd</span><a href="mailto:chuwing134538@gmail.com" className="profile-email">chuwing134538@gmail.com</a></div></div></div></section>}
      <nav className="bottom-nav main-nav"><button className={navMode === 'home' ? 'active' : ''} onClick={() => { setAppMode('home'); setTab('home'); setActive(null) }}><span><Home size={20} /></span>首頁</button><button className={navMode === 'photo' && tab === 'photos' ? 'active' : ''} onClick={() => { setAppMode('photo'); setTab('photos'); setActive(null) }}><span><Images size={20} /></span>相簿</button><button className={navMode === 'handover' ? 'active' : ''} onClick={() => { setHandoverView('settings'); setAppMode('handover') }}><span><Building2 size={20} /></span>設定</button><button className={navMode === 'about' ? 'active' : ''} onClick={() => setAppMode('about')}><span><Info size={20} /></span>資料</button></nav>
    </main>
    {continuousCamera && <div className="overlay dark-overlay camera-overlay"><div className="camera-sheet"><div className="camera-topline"><span className="camera-spacer" aria-hidden="true" /><button className={`camera-flash ${flashEnabled ? 'selected' : ''}`} onClick={toggleFlash} aria-label="切換閃光燈">ϟ<span>{flashEnabled ? 'ON' : 'A'}</span></button><div className="camera-status"><i /> LIVE · {currentPhotos.length} 張</div></div>{captureMessage && <p className="capture-message" role="status">{captureMessage}</p>}<div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted /><span className="frame-corner top-left" /><span className="frame-corner top-right" /><span className="frame-corner bottom-left" /><span className="frame-corner bottom-right" /><div className="zoom-controls" aria-label="縮放倍率"><button onClick={() => changeZoom(.5)} className={zoomLevel === .5 ? 'selected' : ''}>0.5</button><button onClick={() => changeZoom(1)} className={zoomLevel === 1 ? 'selected' : ''}>1×</button><button onClick={() => changeZoom(2)} className={zoomLevel === 2 ? 'selected' : ''}>2</button><button onClick={() => changeZoom(5)} className={zoomLevel === 5 ? 'selected' : ''}>5</button></div></div>{cameraError && <p className="camera-error">{cameraError}</p>}<div className="camera-toolbar"><button className="camera-control" onClick={stopContinuousCamera} aria-label="取消拍攝">×</button><button className={`shutter ${captureBusy ? 'is-busy' : ''}`} onClick={captureContinuousPhoto} disabled={captureBusy} aria-label="拍攝相片">{captureBusy ? '…' : ''}</button><button className="camera-control" aria-label="切換鏡頭">↻</button></div></div></div>}
    {saveToast && <div className="camera-error-banner" role="alert">{saveToast}</div>}
    {cameraError && !continuousCamera && <div className="camera-error-banner">{cameraError}</div>}
    {picker && <div className="overlay" onClick={() => setPicker(null)}><div className="sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SELECT OPTION</p><h3>{picker}</h3></div><button className="close" onClick={() => setPicker(null)}>×</button></div><button className="option option-na" key="__NA__" onClick={() => { setTags(t => ({ ...t, [picker]: 'N/A' })); setPicker(null) }}>N/A（不適用）<span>{tags[picker] === 'N/A' ? '✓' : '›'}</span></button>{(effectiveSettingsOptions[picker] || []).map(option => <button className="option" key={option} onClick={() => { setTags(t => ({ ...t, [picker]: option })); setPicker(null) }}>{option}<span>{tags[picker] === option ? '✓' : '›'}</span></button>)}<div className="custom-option"><input id="custom" placeholder="新增自訂項目" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.value.trim()) { setTags(t => ({ ...t, [picker]: e.currentTarget.value.trim() })); setPicker(null) } }} /><button onClick={() => { const input = document.getElementById('custom') as HTMLInputElement; if (input.value.trim()) { setTags(t => ({ ...t, [picker]: input.value.trim() })); setPicker(null) } }}>新增</button></div></div></div>}
    {detail && <div className="overlay dark-overlay" onClick={() => setDetail(null)}><div className="detail-modal" onClick={e => e.stopPropagation()}><button className="detail-back" onClick={() => setDetail(null)} aria-label="返回相片集">‹ 返回</button><button className="close light" onClick={() => setDetail(null)} aria-label="關閉相片詳情">×</button><img src={detail.src} alt="相片詳情" /><div className="detail-copy"><b>{detail.category}</b><p className="detail-tags">{Object.entries(detail.tags).filter(([,v]) => v && v !== 'N/A').map(([k,v]) => <span key={k}>{k}: {v}</span>)}{!Object.values(detail.tags).some(v => v && v !== 'N/A') && <span>未設定標籤</span>}</p><p>{detail.note || '沒有備註'}</p><small>{new Date(detail.createdAt).toLocaleString('zh-HK')}</small></div></div></div>}
    {projectPanel && <div className="overlay" onClick={() => setProjectPanel(false)}><div className="sheet project-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">PROJECTS</p><h3>選擇 Project</h3></div><button className="close" onClick={() => setProjectPanel(false)} aria-label="關閉">×</button></div>{projects.map(project => <button className={`option ${project.id === currentProject.id ? 'chosen' : ''}`} key={project.id} onClick={() => { const projectSettings = project.settings || createProjectSettings(); switchingProjectRef.current = true; setCurrentProjectId(project.id); setCategories(projectSettings.categories); setTags(projectSettings.tags); setNote(projectSettings.note); setNoteHistory(projectSettings.noteHistory || []); setSettingsOptions(mergeTagOptions(projectSettings.settingsOptions)); setSelectedNotes([]); setProjectPanel(false); setActive(null); setSelected([]) }}><span>{project.name}<small>{photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === project.id).length} 張相片</small></span><b>{project.id === currentProject.id ? '✓' : '›'}</b><span className="project-row-rename" onClick={e => { e.stopPropagation(); setRenameProjectId(project.id); setRenameProjectName(project.name) }}>改名</span></button>)}<div className="project-add"><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="輸入新 Project 名稱" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addProject() }} /><button onClick={addProject}>新增</button></div></div></div>}
    {newCategory && <div className="overlay" onClick={() => setNewCategory(false)}><div className="sheet small-sheet" onClick={e => e.stopPropagation()}><div className="section-heading compact"><div><p className="eyebrow">NEW CATEGORY</p><h3>新增工程類別</h3></div><button className="close" onClick={() => setNewCategory(false)}>×</button></div><input className="category-input" autoFocus placeholder="例如：外牆工程" onKeyDown={e => { if (e.key === 'Enter') addCategory(e.currentTarget.value) }} /><button className="primary-button" onClick={() => addCategory((document.querySelector('.category-input') as HTMLInputElement).value)}>建立類別</button></div></div>}
  </>
}
