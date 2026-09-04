'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, PenLine, ClipboardList, Database as DatabaseIcon, BookOpen, ShieldCheck, Settings2 } from 'lucide-react'
import { SiteMemo } from '@/components/site-memo/site-memo'
import { Database } from '@/components/database/database'
import { Handover } from '@/components/handover/handover'
import { Notebook } from '@/components/notebook/notebook'
import { BottomNav } from '@/components/ui/bottom-nav'
import { ProjectPicker, RenameProjectDialog } from '@/components/project/project-dialogs'
import { FirstProjectSetup } from '@/components/project/first-project-setup'
import { useAppStatus } from '@/hooks/use-app-status'
import { usePhotoAnnotations } from '@/hooks/use-photo-annotations'
import { buildFloorNames, createRoomHandover, loadAllHandover, saveAllHandover, type Tower } from '@/components/handover/handover-data'
import { exportLocalBackup as createLocalBackup, importLocalBackup as restoreLocalBackup } from '@/lib/backup'
import { exportPhotoExcel, openPhotoPdfPreview } from '@/lib/photo-reports'
import {
  CURRENT_PROJECT_KEY,
  DEFAULT_PROJECT,
  PROJECTS_KEY,
  SMART_TAG_KEYS,
  createProjectSettings,
  defaultCategories,
  ensureDefaultCategories,
  mergeTagOptions,
  normalizeProject,
  normalizeCategoryName,
  tagOptions,
  type Project,
} from '@/lib/project-settings'
import { stampImage } from '@/lib/photo-image'
import {
  createId,
  hydratePhoto,
  loadStoredPhotos,
  releasePhotoUrls,
  saveStoredPhotos,
  type Photo,
} from '@/lib/photo-storage'
import { photoSourceMap } from '@/lib/photo-attachments'
import { PhotoPicker } from '@/components/photo/photo-picker'
import { ContinuousCameraModal } from '@/components/photo/continuous-camera-modal'

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
  const [setupProjectName, setSetupProjectName] = useState('Project')
  const [setupTowers, setSetupTowers] = useState('1')
  const [setupTowerPrefix, setSetupTowerPrefix] = useState('')
  const [setupFloors, setSetupFloors] = useState('5')
  const [setupFloorPrefix, setSetupFloorPrefix] = useState('')
  const [setupFloorSuffix, setSetupFloorSuffix] = useState('')
  const [setupCompactFloors, setSetupCompactFloors] = useState(false)
  const [setupRooms, setSetupRooms] = useState('Elect Room')
  const [setupRoomSuffixStart, setSetupRoomSuffixStart] = useState('')
  const [setupRoomSuffixEnd, setSetupRoomSuffixEnd] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [appMode, setAppMode] = useState<'home' | 'photo' | 'memo' | 'notebook' | 'handover' | 'reserve' | 'database' | 'about' | 'backup'>('home')
  const [tab, setTab] = useState<'home' | 'photos' | 'settings'>('home')
  const [settingsOptions, setSettingsOptions] = useState<Record<string, string[]>>(tagOptions)
  const [structureOptions, setStructureOptions] = useState<Record<string, string[]>>({ 座數: [], 樓層: [], 位置: [] })
  const [settingsLabel, setSettingsLabel] = useState<string | null>(null)
  const [visibleTags, setVisibleTags] = useState<string[]>([...SMART_TAG_KEYS])
  const [showTagDisplaySettings, setShowTagDisplaySettings] = useState(false)
  const [responsibleEmail, setResponsibleEmail] = useState('')
  const [newOption, setNewOption] = useState<Record<string, string>>({})
  const [settingsReady, setSettingsReady] = useState(false)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [tags, setTags] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [noteHistory, setNoteHistory] = useState<string[]>([])
  const [selectedNotes, setSelectedNotes] = useState<string[]>([])
  const [picker, setPicker] = useState<string | null>(null)
  const [categoryPickerRequest, setCategoryPickerRequest] = useState<((category: string) => void) | null>(null)
  const [categoryPickerSelected, setCategoryPickerSelected] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<Photo | null>(null)
  const [handoverView, setHandoverView] = useState<'home' | 'settings' | 'manage'>('home')
  const loadedProjectRef = useRef('')
  const saveQueueRef = useRef(Promise.resolve())
  const switchingProjectRef = useRef(false)
  const folderHandleRef = useRef<any>(null)
  const [folderConnected, setFolderConnected] = useState(false)
  const backupRef = useRef<HTMLInputElement>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const { isOffline, storageStatus, storageUsage, updateAvailable, updateApp } = useAppStatus()
  const { photoEditorOpen, photoEditMode, photoDrawing, setPhotoEditMode, openPhotoEditor, resetEditor, photoPointerDown, photoPointerMove, photoPointerUp, cancelDrawing } = usePhotoAnnotations()
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saveToast, setSaveToast] = useState('')
  const [photoPickerRequest, setPhotoPickerRequest] = useState<((photoIds: string[]) => void) | null>(null)
  const [cameraRequest, setCameraRequest] = useState<((photoId: string) => void) | null>(null)
  const [cameraInitialCategory, setCameraInitialCategory] = useState<string | undefined>()
  const [cameraAutoStart, setCameraAutoStart] = useState(false)
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
        if (Array.isArray(parsed) && parsed.length) setProjects(parsed.map(normalizeProject))
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
      await saveStoredPhotos(photos, currentProjectId)
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
    setVisibleTags(projectSettings.visibleTags?.filter(tag => SMART_TAG_KEYS.includes(tag)) || [...SMART_TAG_KEYS])
    setSettingsOptions(mergeTagOptions(projectSettings.settingsOptions))
    setSelectedNotes([])
    loadedProjectRef.current = currentProjectId
    switchingProjectRef.current = false
  }, [settingsReady, currentProjectId, projects])
  useEffect(() => {
    if (!settingsReady || switchingProjectRef.current) return
    setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, settings: { ...createProjectSettings(), ...project.settings, categories, tags, note, settingsOptions, noteHistory, visibleTags } } : project))
  }, [settingsReady, currentProjectId, categories, tags, note, settingsOptions, noteHistory, visibleTags])
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
    await saveAllHandover({ [project.id]: { towers, responsiblePerson: { name: '', company: '', email: '', department: '', position: '' } } })
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
  const isRegistered = /@(southa\.com|veolia\.com)$/i.test(responsibleEmail.trim())
  useEffect(() => {
    if (!isRegistered) {
      setShowTagDisplaySettings(false)
      if (tab === 'settings') setTab('home')
    }
  }, [isRegistered, tab])
  const structureKeys = ['座數', '樓層', '位置']
  const handleStructureChange = useCallback((options: Record<string, string[]>) => {
    setStructureOptions(options)
  }, [])
  const effectiveSettingsOptions = useMemo(() => ({ ...settingsOptions, ...structureOptions }), [settingsOptions, structureOptions])
  const pickerOptions = picker === '位置' && tags['樓層']
    ? (structureOptions[`位置:${tags['樓層']}`] || effectiveSettingsOptions['位置'] || [])
    : (effectiveSettingsOptions[picker || ''] || [])
  const removeSettingOption = (label: string, option: string) => {
    if (structureKeys.includes(label)) return
    setSettingsOptions(current => ({ ...current, [label]: (current[label] || []).filter(value => value !== option) }))
  }
  useEffect(() => {
    loadAllHandover().then(data => {
      const projectHandover = data[currentProjectId]
      setResponsibleEmail(projectHandover?.responsiblePerson?.email || '')
      const towers = projectHandover?.towers || []
      const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
      const rooms = towers.flatMap(tower => tower.floors.flatMap(floor => floor.rooms.map(room => room.name)))
      const floorLocations = Object.fromEntries(towers.flatMap(tower => tower.floors.map(floor => [`位置:${floor.name}`, unique(floor.rooms.map(room => room.name))])))
      const options = {
       座數: unique(towers.map(tower => tower.name)),
       樓層: unique(towers.flatMap(tower => tower.floors.map(floor => floor.name))),
       位置: unique(rooms),
       ...floorLocations,
      }
      handleStructureChange(options)
    }).catch(() => handleStructureChange({ 座數: [], 樓層: [], 位置: [] }))
  }, [currentProjectId, handleStructureChange])
  const projectPhotos = useMemo(() => photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === currentProject.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [currentProject.id, photos])
  const projectPhotoSources = useMemo(() => photoSourceMap(projectPhotos), [projectPhotos])
  const selectedPhotoCategory = active && categories.some(category => category.name === active) ? active : categories[0]?.name
  const currentPhotos = useMemo(() => selectedPhotoCategory ? projectPhotos.filter(photo => photo.category === selectedPhotoCategory) : [], [projectPhotos, selectedPhotoCategory])
  const connectProjectFolder = async () => {
    const picker = (window as any).showDirectoryPicker
    if (!picker) { setProjectPanel(true); return }
    try {
      const root = await picker({ mode: 'readwrite' })
      folderHandleRef.current = root
      setFolderConnected(true)
      setSaveToast('已連接本機 Project Camera 資料夾')
    } catch { setSaveToast('未選擇資料夾') }
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
  const createProjectPhoto = async (file: File, category: string): Promise<Photo> => {
    const result = await stampImage(file, category, tags, note, currentProject.name)
    const photo: Photo = { id: createId(), src: result.stamped, cleanSrc: result.clean, originalBlob: result.originalBlob, thumbnailBlob: result.thumbnailBlob, stampedBlob: result.stampedBlob, category, tags: { ...tags }, note, createdAt: new Date().toISOString(), projectId: currentProject.id }
    setPhotos(current => [photo, ...current])
    await saveToProjectFolder(photo)
    return photo
  }
  const openPhotoPicker = (onSelect: (photoIds: string[]) => void) => setPhotoPickerRequest(() => onSelect)
  const rememberCameraCategory = (category: string) => setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, settings: { ...createProjectSettings(), ...project.settings, lastCameraCategory: category } } : project))
  const openSharedCamera = (onCapture: (photoId: string) => void, initialCategory?: string, autoStart = false) => {
    setCameraInitialCategory(initialCategory)
    setCameraAutoStart(autoStart)
    setCameraRequest(() => onCapture)
  }
  const sharedMediaOverlays = <>
    {photoPickerRequest && <PhotoPicker photos={projectPhotos} onConfirm={photoIds => { photoPickerRequest(photoIds); setPhotoPickerRequest(null) }} onClose={() => setPhotoPickerRequest(null)} />}
    {cameraRequest && <ContinuousCameraModal categories={categories.map(category => category.name)} initialCategory={cameraInitialCategory} tags={tags} visibleTags={visibleTags} tagOptions={{ ...effectiveSettingsOptions, ...structureOptions }} note={note} noteHistory={noteHistory} selectedNotes={selectedNotes} autoStart={cameraAutoStart} onCategorySelected={rememberCameraCategory} onSelectTag={(label, value) => setTags(current => ({ ...current, [label]: value }))} onNoteChange={setNote} onRememberNote={rememberNote} onToggleRecentNote={item => setSelectedNotes(current => { const next = current.includes(item) ? current.filter(value => value !== item) : [...current, item]; setNote(next.join(' / ')); return next })} onToggleVisibleTag={label => setVisibleTags(current => current.includes(label) ? current.filter(item => item !== label) : [...current, label])} onCapture={async (file, category) => { const photo = await createProjectPhoto(file, category); cameraRequest(photo.id) }} onClose={() => { setPicker(null); setCategoryPickerRequest(null); setCameraRequest(null); setCameraAutoStart(false) }} />}
  </>
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
  const savePhotoEdit = () => { if (!detail) return; setPhotos(current => current.map(photo => photo.id === detail.id ? detail : photo)); resetEditor(); setSaveToast('相片註記已保存'); window.setTimeout(() => setSaveToast(''), 2500) }
  const closePhotoDetail = () => { setDetail(null); resetEditor() }
  const deleteSelectedPhotos = () => {
    if (!selected.length) return
    if (!confirm(`確定刪除已選的 ${selected.length} 張相片？此操作無法復原。`)) return
    setPhotos(current => current.filter(photo => !selected.includes(photo.id)))
    setSelected([])
    setDetail(null)
  }
  const exportExcel = async () => {
    await exportPhotoExcel(photos, selected)
  }
  const exportPdf = async () => {
    openPhotoPdfPreview(photos, selected)
  }

  const exportLocalBackup = async (): Promise<boolean> => {
    if (backupBusy) return false
    setBackupBusy(true)
    try {
      return await createLocalBackup({ currentProjectId, projects, photos })
    } finally {
      setBackupBusy(false)
    }
  }
  const importLocalBackup = async (file: File | undefined) => {
    if (!file) return
    const restored = await restoreLocalBackup(file, exportLocalBackup)
    if (!restored) return
    setProjects(restored.projects); setCurrentProjectId(restored.currentProjectId); setPhotos(restored.photos); alert('ZIP 備份已還原')
  }

  if (appMode === 'notebook') return <><Notebook projectId={currentProject.id} projectName={currentProject.name} photoSources={projectPhotoSources} onSelectAlbumPhotos={openPhotoPicker} onOpenCamera={onCapture => openSharedCamera(onCapture)} onBack={() => setAppMode('home')} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('photos'); setActive(null) } if (mode === 'handover') setHandoverView('settings') }} />{sharedMediaOverlays}</>

  if (appMode === 'database') return <Database projectId={currentProject.id} projectName={currentProject.name} onBack={() => setAppMode('home')} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('photos'); setActive(null) } if (mode === 'handover') setHandoverView('settings') }} />

  if (appMode === 'memo') return <><SiteMemo generalPhotoTags={effectiveSettingsOptions['事項'] || []} isRegistered={isRegistered} projectId={currentProject.id} projectName={currentProject.name} photoSources={projectPhotoSources} onSelectAlbumPhotos={openPhotoPicker} onOpenCamera={onCapture => openSharedCamera(onCapture)} onBack={() => setAppMode('home')} onOpenMachineData={() => { setHandoverView('home'); setAppMode('handover') }} onOpenMachineDataManage={() => { setHandoverView('settings'); setAppMode('handover') }} onNavigate={mode => { if (mode === 'handover') setHandoverView('settings'); setAppMode(mode); if (mode === 'photo') { setTab('photos'); setActive(null) } }} />{sharedMediaOverlays}</>

  if (appMode === 'handover') return <><Handover initialView={handoverView} projectId={currentProject.id} projectName={currentProject.name} photoSources={projectPhotoSources} onSelectAlbumPhotos={openPhotoPicker} onOpenCamera={onCapture => openSharedCamera(onCapture)} onBack={() => setAppMode('home')} onOpenPhotoSettings={label => { setSettingsLabel(label || null); setAppMode('photo'); setTab('settings'); setActive(null) }} onPhotoSettingsBack={() => { setSettingsLabel(null); setHandoverView('settings'); setAppMode('handover') }} onStructureChange={handleStructureChange} onResponsibleEmailChange={setResponsibleEmail} isRegistered={isRegistered} onUpdateApp={updateApp} onNavigate={mode => { setAppMode(mode); if (mode === 'photo') { setTab('photos'); setActive(null) } if (mode === 'handover') { setHandoverView('manage') } }} />{sharedMediaOverlays}</>

  const navMode = appMode as string

  return <>
    {renameProjectId && <RenameProjectDialog name={renameProjectName} onNameChange={setRenameProjectName} onClose={() => setRenameProjectId(null)} onSave={renameCurrentProject} />}
    {firstLaunch && <FirstProjectSetup projectName={setupProjectName} towers={setupTowers} towerPrefix={setupTowerPrefix} floors={setupFloors} floorPrefix={setupFloorPrefix} floorSuffix={setupFloorSuffix} compactFloors={setupCompactFloors} rooms={setupRooms} roomSuffixStart={setupRoomSuffixStart} roomSuffixEnd={setupRoomSuffixEnd} onProjectNameChange={setSetupProjectName} onTowersChange={setSetupTowers} onTowerPrefixChange={setSetupTowerPrefix} onFloorsChange={setSetupFloors} onFloorPrefixChange={setSetupFloorPrefix} onFloorSuffixChange={setSetupFloorSuffix} onCompactFloorsChange={setSetupCompactFloors} onRoomsChange={setSetupRooms} onRoomSuffixStartChange={setSetupRoomSuffixStart} onRoomSuffixEndChange={setSetupRoomSuffixEnd} onComplete={() => void completeFirstLaunch()} />}
    {isOffline && <div className="offline-banner" role="status">目前為離線模式，資料會儲存在本機</div>}
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">▦</div><button className="project-trigger" onClick={() => setProjectPanel(true)} aria-label="選擇 Project"><strong>{currentProject.name}</strong><span>⌄</span></button>
      </header>
      {appMode === 'home' && <section className="content home-page"><div className="section-heading"><div><p className="eyebrow">WORKSITE TOOLS</p></div></div><div className="app-card-grid"><button className="app-card app-card-photo" onClick={() => { const categoryNames = categories.map(category => category.name); const rememberedCategory = currentProject.settings?.lastCameraCategory; openSharedCamera(() => setSaveToast('相片已加入相簿'), rememberedCategory && categoryNames.includes(rememberedCategory) ? rememberedCategory : categoryNames[0], true) }}><Camera /><strong>拍照記錄</strong><small>{projectPhotos.length} 張相片</small></button><button className="app-card" onClick={() => setAppMode('memo')}><PenLine /><strong>Site Memo</strong><small>現場備忘及報告(進行中)</small></button><button className="app-card" onClick={() => { setHandoverView('home'); setAppMode('handover') }}><ClipboardList /><strong>機房移交</strong><small>移交檢查記錄</small></button><button className="app-card" onClick={() => setAppMode('notebook')}><BookOpen /><strong>記事簿</strong><small>快速記錄現場事項</small></button><button className="app-card" onClick={() => setAppMode('reserve')}><ShieldCheck /><strong>Permit to Work</strong><small>開發中</small></button><button className="app-card" onClick={() => setAppMode('database')}><DatabaseIcon /><strong>資料庫</strong><small>圖紙、Spec 及檔案管理</small></button></div></section>}
      {appMode === 'reserve' && <section className="content info-page"><div className="section-heading"><div><p className="eyebrow">COMING SOON</p><h2>功能開發中</h2></div></div><div className="info-empty"><span>⚒</span><strong>此功能正在開發</strong><p>Permit to Work、記事簿及資料庫功能將於稍後加入。</p><button className="primary-button" onClick={() => setAppMode('home')}>返回首頁</button></div></section>}
      {appMode === 'photo' && tab === 'home' && <section className="content"><div className="section-heading"><div><p className="eyebrow">PHOTO SETTINGS</p><h2>相片標記設定</h2></div><span className="photo-total">{currentPhotos.length} 張相片</span></div><div className="capture-actions"><button className="capture-button camera" disabled={!selectedPhotoCategory} onClick={() => selectedPhotoCategory && openSharedCamera(() => setSaveToast('相片已加入相簿'), selectedPhotoCategory)}><span>▣</span><div><strong>連續拍攝</strong><small>拍完可立即拍下一張</small></div></button></div><div className="tag-panel"><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>拍攝資訊</h3></div><span className="memory-dot">● 已記憶</span></div><div className="tag-grid"><button className="tag-chip category-tag-chip chosen" onClick={() => setPicker('__category__')}><span>工程類別</span><b>{selectedPhotoCategory || '選擇'}</b></button>{visibleTags.map(label => { const disabled = label === '位置' && !tags['樓層']; return <button className={`tag-chip ${tags[label] ? 'chosen' : ''}`} key={label} disabled={disabled} onClick={() => { if (!disabled) setPicker(label) }}><span>{label}</span><b>{disabled ? '請先選樓層' : (tags[label] || '選擇')}</b></button> })}</div><label className="note-field"><span>文字備註</span><input value={note} onChange={event => setNote(event.target.value)} onBlur={rememberNote} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { rememberNote(); event.currentTarget.blur() } }} placeholder="輸入本次拍攝的補充說明..." /></label>{noteHistory.length > 0 && <div className="note-history"><small>最近使用</small><div>{noteHistory.map(item => <button type="button" key={item} onClick={() => setSelectedNotes(current => { const next = current.includes(item) ? current.filter(value => value !== item) : [...current, item]; setNote(next.join(' / ')); return next })} className={selectedNotes.includes(item) ? 'selected' : ''} aria-pressed={selectedNotes.includes(item)}>{item}</button>)}</div></div>}</div></section>}
      {appMode === 'photo' && tab === 'settings' && <section className="content settings-page"><button className="back-link" onClick={() => { setSettingsLabel(null); setHandoverView('settings'); setAppMode('handover'); setActive(null) }}>‹ 返回設定</button><div className="section-heading"><div><p className="eyebrow">APP SETTINGS</p><h2>設定{settingsLabel ? ` · ${settingsLabel === '事項' ? '一般' : settingsLabel === '安全' ? '安全事項' : settingsLabel}` : ''}</h2></div></div><div className="project-name-setting"><label htmlFor="project-name">Project 名稱</label><input id="project-name" value={currentProject.name} onChange={e => { const name = e.target.value; setProjects(current => current.map(project => project.id === currentProjectId ? { ...project, name } : project)) }} placeholder="輸入 Project 名稱" /></div><p className="settings-intro">自訂六個標籤類別的選項，之後拍攝時會自動提供。</p><div className="local-storage-card"><strong>{saveState === 'saving' ? '正在保存…' : saveState === 'error' ? '保存失敗' : '已保存'}</strong><span>{lastSavedAt ? `最後保存：${new Date(lastSavedAt).toLocaleString('zh-HK', { hour12: false })}` : storageStatus}</span>{storageUsage && <small>儲存空間：{(storageUsage.usage / 1048576).toFixed(1)} MB / {(storageUsage.quota / 1048576).toFixed(0)} MB{storageUsage.usage / storageUsage.quota > 0.8 ? '（接近上限，建議匯出備份）' : ''}</small>}</div><div className="settings-group"><div className="settings-group-title"><strong>SMART TAG 顯示設定</strong></div><div className="tag-display-card-grid">{SMART_TAG_KEYS.map(label => <button type="button" className={`tag-display-card ${visibleTags.includes(label) ? 'chosen' : ''}`} key={label} onClick={() => setVisibleTags(current => current.includes(label) ? current.filter(item => item !== label) : [...current, label])}><strong>{label}</strong><span>{visibleTags.includes(label) ? '已顯示' : '已隱藏'}</span><b>{visibleTags.includes(label) ? '✓' : '＋'}</b></button>)}</div></div>{(settingsLabel ? [settingsLabel] : structureKeys).map(label => <div className="settings-group" key={label}><div className="settings-group-title"><strong>{label === '事項' ? '一般' : label === '安全' ? '安全事項' : label}</strong><span>{(effectiveSettingsOptions[label] || []).length} 個選項</span></div><div className="settings-options">{(effectiveSettingsOptions[label] || []).map(option => structureKeys.includes(label) ? <span className="option" key={option}>{option}</span> : <button type="button" className="option option-removable" key={option} onClick={() => removeSettingOption(label, option)} title={`刪除${option}`}>{option}<b aria-hidden="true">×</b></button>)}</div>{!structureKeys.includes(label) && <div className="settings-add"><input value={newOption[label] || ''} onChange={e => setNewOption(current => ({ ...current, [label]: e.target.value }))} placeholder={`新增${label}選項`} /><button onClick={() => { const value = (newOption[label] || '').trim(); if (!value) return; setSettingsOptions(current => ({ ...current, [label]: [...(current[label] || []), value] })); setNewOption(current => ({ ...current, [label]: '' })) }}>新增</button></div>}</div>)}</section>}
      {appMode === 'photo' && tab === 'photos' && <section className="content"><div className="section-heading photo-heading"><div><p className="eyebrow">PHOTO ARCHIVE</p><h2>相片集</h2></div><div className="photo-actions"><span className="photo-total">已選 {selected.length} 張</span><button className="select-all-button" onClick={() => setSelected(selected.length === projectPhotos.length ? [] : projectPhotos.map(photo => photo.id))} disabled={!projectPhotos.length}>{selected.length === projectPhotos.length && projectPhotos.length ? '取消全選' : '全選'}</button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>一小時內</button><button className="quick-select-button" onClick={() => { const cutoff = Date.now() - 24 * 60 * 60 * 1000; setSelected(projectPhotos.filter(photo => new Date(photo.createdAt).getTime() >= cutoff).map(photo => photo.id)) }} disabled={!projectPhotos.length}>一日內</button><button className="quick-select-button danger-button" onClick={deleteSelectedPhotos} disabled={!selected.length}>刪除</button><div className="export-bar"><button onClick={exportExcel}>匯出 Excel</button><button onClick={exportPdf}>匯出 PDF</button></div></div></div><div className="photo-grid">{projectPhotos.map(p => <div className="photo-card" key={p.id}><button className="photo-open" onClick={() => setDetail(p)}><img src={p.src} alt={`${p.category} ${p.createdAt}`} /></button><label className="check"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /><span /></label></div>)}{!projectPhotos.length && <div className="empty-state">尚未有相片記錄<br /><small>進入工程類別開始拍攝</small></div>}</div><div id="pdf-report" className="pdf-report" aria-hidden="true"><h1>地盤相片記錄報表</h1>{photos.filter(p => selected.includes(p.id)).map(p => <article key={p.id}><img src={p.src} alt="" /><div><b>{p.category}</b><p>{Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' / ')}</p><p>{p.note}</p><small>{new Date(p.createdAt).toLocaleString('zh-HK')}</small></div></article>)}</div></section>}
      {updateAvailable && <div className="camera-error-banner" role="status">已有新版本可用，請按「更新 App」套用。</div>}
      {appMode === 'backup' && <section className="content info-page"><button className="back-link" onClick={() => { setHandoverView('settings'); setAppMode('handover') }}>‹ 返回設定</button><div className="section-heading"><div><p className="eyebrow">BACKUP</p><h2>備份</h2></div></div><div className="about-block"><h3>完整資料備份</h3><p>備份整個 App 的 Project、相片、Site Memo 及機房移交資料。</p><div className="backup-actions"><button type="button" onClick={exportLocalBackup} disabled={backupBusy}>{backupBusy ? '正在準備備份…' : '匯出完整備份'}</button><button type="button" onClick={() => backupRef.current?.click()} disabled={backupBusy}>匯入完整備份</button><input ref={backupRef} hidden type="file" accept="application/zip,.zip" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !confirm('匯入資料會取代目前 App 的全部資料。是否繼續？')) return; await importLocalBackup(file) }} /></div></div></section>}
      {appMode === 'about' && <section className="content info-page"><div className="section-heading"><div><p className="eyebrow">ABOUT</p></div></div><div className="about-block"><h3 className="about-title">關於此 App</h3><p>這是一個為地盤工程而設的流動記錄工具，支援離線使用，所有相片與資料均保存在本機裝置。主要功能包括：拍照記錄（自動加上工程類別、樓層、機房等智能標籤並生成 Excel／PDF 報表）、Site Memo（一鍵生成 A4 Site Meno）及制房移交。</p></div><div className="about-block profile-block"><h3>開發及使用者資料</h3><div className="profile-card"><div className="profile-avatar" aria-hidden="true">HC</div><div className="profile-meta"><strong>Henry Chu</strong><span>Project Manager</span><span>Southa Technical Ltd</span><a href="mailto:chuwing134538@gmail.com" className="profile-email">chuwing134538@gmail.com</a></div></div></div></section>}
      <BottomNav active={navMode === 'home' ? 'home' : navMode === 'photo' ? 'photo' : navMode === 'handover' ? 'handover' : navMode === 'about' ? 'about' : undefined} onNavigate={mode => { setAppMode(mode); if (mode === 'home') { setTab('home'); setActive(null) } if (mode === 'photo') { setTab('photos'); setActive(null) } if (mode === 'handover') setHandoverView('settings') }} />
    </main>
    {saveToast && <div className="camera-error-banner" role="alert">{saveToast}</div>}
    {sharedMediaOverlays}
    {showTagDisplaySettings && <div className="overlay" onClick={() => setShowTagDisplaySettings(false)}><div className="sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SMART TAGS</p><h3>選擇顯示的 SMART TAG</h3></div><button className="close" onClick={() => setShowTagDisplaySettings(false)} aria-label="關閉">×</button></div><p className="settings-intro">選擇拍照記錄頁要顯示的標籤，設定會按目前 Project 記憶。</p><div className="tag-display-card-grid">{SMART_TAG_KEYS.map(label => <button type="button" className={`tag-display-card ${visibleTags.includes(label) ? 'chosen' : ''}`} key={label} onClick={() => setVisibleTags(current => current.includes(label) ? current.filter(item => item !== label) : [...current, label])}><strong>{label}</strong><span>{visibleTags.includes(label) ? '已顯示' : '已隱藏'}</span><b>{visibleTags.includes(label) ? '✓' : '＋'}</b></button>)}</div><button className="primary-button" onClick={() => setShowTagDisplaySettings(false)}>完成</button></div></div>}
    {picker && <div className="overlay" onClick={() => { setPicker(null); setCategoryPickerRequest(null) }}><div className="sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="section-heading compact"><div><p className="eyebrow">SELECT OPTION</p><h3>{picker === '__category__' ? '工程類別' : picker}</h3></div><button className="close" onClick={() => { setPicker(null); setCategoryPickerRequest(null) }}>×</button></div>{picker === '__category__' ? categories.map(category => <button className="option" key={category.name} onClick={() => { if (categoryPickerRequest) categoryPickerRequest(category.name); else { setActive(category.name); rememberCameraCategory(category.name) }; setPicker(null); setCategoryPickerRequest(null) }}>{category.name}<span>{(categoryPickerRequest ? categoryPickerSelected : selectedPhotoCategory) === category.name ? '✓' : '›'}</span></button>) : <><button className="option option-na" key="__NA__" onClick={() => { setTags(t => ({ ...t, [picker]: 'N/A' })); setPicker(null) }}>N/A（不適用）<span>{tags[picker] === 'N/A' ? '✓' : '›'}</span></button>{pickerOptions.map(option => <button className="option" key={option} onClick={() => { setTags(t => ({ ...t, [picker]: option })); setPicker(null) }}>{option}<span>{tags[picker] === option ? '✓' : '›'}</span></button>)}<div className="custom-option"><input id="custom" placeholder="新增自訂項目" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.value.trim()) { setTags(t => ({ ...t, [picker]: e.currentTarget.value.trim() })); setPicker(null) } }} /><button onClick={() => { const input = document.getElementById('custom') as HTMLInputElement; if (input.value.trim()) { setTags(t => ({ ...t, [picker]: input.value.trim() })); setPicker(null) } }}>新增</button></div></>}</div></div>}
    {detail && <div className="overlay dark-overlay" onClick={closePhotoDetail}><div className="detail-modal" onClick={e => e.stopPropagation()}><button className="detail-back" onClick={closePhotoDetail} aria-label="返回相片集">‹ 返回</button><button className="close light" onClick={closePhotoDetail} aria-label="關閉相片詳情">×</button>{!photoEditorOpen && <button className="photo-edit-open" onClick={openPhotoEditor}>編輯相片</button>}{photoEditorOpen && <div className="photo-edit-toolbar"><button className={photoEditMode === 'text' ? 'active' : ''} onClick={() => setPhotoEditMode(photoEditMode === 'text' ? null : 'text')}>＋文字</button><button className={photoEditMode === 'marker' ? 'active' : ''} onClick={() => setPhotoEditMode(photoEditMode === 'marker' ? null : 'marker')}>◉ 標記</button><button className={photoEditMode === 'draw' ? 'active' : ''} onClick={() => setPhotoEditMode(photoEditMode === 'draw' ? null : 'draw')}>✎ 手寫</button><button onClick={() => setDetail({ ...detail, annotations: (detail.annotations || []).slice(0, -1) })} disabled={!detail.annotations?.length}>清除</button><button onClick={savePhotoEdit}>保存</button></div>}<div className={`photo-edit-canvas ${photoEditorOpen ? 'editing' : ''}`} onPointerDown={event => photoPointerDown(event, detail, setDetail)} onPointerMove={photoPointerMove} onPointerUp={event => photoPointerUp(event, detail, setDetail)} onPointerCancel={cancelDrawing}><img src={detail.src} alt="相片詳情" />{(detail.annotations || []).map((annotation, index) => annotation.kind === 'text' ? <span className="photo-text-annotation" key={index} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}>{annotation.text}</span> : annotation.kind === 'marker' ? <span className="photo-marker-annotation" key={index} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}>●</span> : <svg className="photo-draw-annotation" key={index} viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={(annotation.points || []).map(point => `${point.x},${point.y}`).join(' ')} /></svg>)}{photoEditMode === 'draw' && photoDrawing.length > 1 && <svg className="photo-draw-annotation photo-draw-preview" viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={photoDrawing.map(point => `${point.x},${point.y}`).join(' ')} /></svg>}</div><div className="detail-copy"><b>{detail.category}</b><p className="detail-tags">{Object.entries(detail.tags && typeof detail.tags === 'object' ? detail.tags : {}).filter(([,v]) => typeof v === 'string' && v && v !== 'N/A').map(([k,v]) => <span key={k}>{k}: {v}</span>)}{!Object.values(detail.tags && typeof detail.tags === 'object' ? detail.tags : {}).some(v => typeof v === 'string' && v && v !== 'N/A') && <span>未設定標籤</span>}</p><p>{detail.note || '沒有備註'}</p><small>{new Date(detail.createdAt).toLocaleString('zh-HK')}</small></div></div></div>}
    {projectPanel && <ProjectPicker projects={projects} currentProjectId={currentProject.id} newProjectName={newProjectName} onNewProjectNameChange={setNewProjectName} onClose={() => setProjectPanel(false)} onSelect={project => { const projectSettings = project.settings || createProjectSettings(); switchingProjectRef.current = true; setCurrentProjectId(project.id); setCategories(projectSettings.categories); setTags(projectSettings.tags); setNote(projectSettings.note); setNoteHistory(projectSettings.noteHistory || []); setVisibleTags(projectSettings.visibleTags?.filter(tag => SMART_TAG_KEYS.includes(tag)) || [...SMART_TAG_KEYS]); setSettingsOptions(mergeTagOptions(projectSettings.settingsOptions)); setSelectedNotes([]); setProjectPanel(false); setActive(null); setSelected([]) }} onRename={project => { setProjectPanel(false); setRenameProjectId(project.id); setRenameProjectName(project.name) }} onAdd={addProject} getPhotoCount={projectId => photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === projectId).length} />}
  </>
}
