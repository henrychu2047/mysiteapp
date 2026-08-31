'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  PenLine,
  ClipboardList,
  Circle,
  Info,
  Building2,
  ClipboardCheck,
  UserRound,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  AlertTriangle,
  Wand2,
  Check,
  Download,
} from 'lucide-react'
import {
  ROOM_STATUSES,
  ROOM_STATUS_COLOR,
  FLOOR_SUGGESTIONS,
  ROOM_NAME_SUGGESTIONS,
  DEFECT_SUGGESTIONS,
  buildFloorNames,
  createRoomHandover,
  createResponsiblePerson,
  loadHandover,
  saveHandover,
  clearAllHandover,
  stampHandoverImage,
  nowIso,
  countRooms,
  countCompleted,
  towerRooms,
  towerCompleted,
  openDefectCount,
  type Tower,
  type Room,
  type RoomStatus,
  type RoomHandover,
  type ResponsiblePerson,
} from './handover-data'

type AppMode = 'home' | 'photo' | 'memo' | 'handover' | 'reserve' | 'about' | 'backup'

type Props = {
  onBack: () => void
  onNavigate: (mode: AppMode) => void
  initialView?: 'home' | 'settings' | 'manage'
  projectId: string
  projectName: string
  onOpenPhotoSettings?: (label?: string) => void
  onPhotoSettingsBack?: () => void
  onStructureChange?: (options: Record<string, string[]>) => void
  onResponsibleEmailChange?: (email: string) => void
  isRegistered?: boolean
  onUpdateApp?: () => void
}

type View = 'home' | 'settings' | 'manage' | 'responsible-person' | 'flow-tower' | 'flow-floor' | 'flow-room' | 'detail' | 'stats' | 'status-list'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const normalizeName = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
const expandRoomSuffixRange = (start: string, end: string) => {
  const first = start.trim()
  const last = end.trim()
  if (!first && !last) return ['']
  if (!first || !last) return [first || last]
  const startMatch = first.match(/^(.*?)(-?\d+)$/)
  const endMatch = last.match(/^(.*?)(-?\d+)$/)
  if (!startMatch || !endMatch || startMatch[1] !== endMatch[1]) return [first]
  const from = Number(startMatch[2])
  const to = Number(endMatch[2])
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) return [first]
  const width = Math.max(startMatch[2].replace('-', '').length, endMatch[2].replace('-', '').length)
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const number = from + index
    const sign = number < 0 ? '-' : ''
    return `${startMatch[1]}${sign}${String(Math.abs(number)).padStart(width, '0')}`
  })
}

export function Handover({ onBack, onNavigate, projectId, projectName, initialView = 'home', onOpenPhotoSettings, onPhotoSettingsBack, onStructureChange, onResponsibleEmailChange, isRegistered = false, onUpdateApp }: Props) {
  const [towers, setTowers] = useState<Tower[]>([])
  const [responsiblePerson, setResponsiblePerson] = useState<ResponsiblePerson>(createResponsiblePerson)
  const [responsibleDraft, setResponsibleDraft] = useState<ResponsiblePerson>(createResponsiblePerson)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<View>(initialView)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<RoomStatus | null>(null)
  const [toast, setToast] = useState('')
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // 選擇路徑
  const [selTower, setSelTower] = useState<string | null>(null)
  const [selFloor, setSelFloor] = useState<string | null>(null)
  const [selRoom, setSelRoom] = useState<string | null>(null)

  // 機房資料管理：展開狀態與新增輸入
  const [openTowers, setOpenTowers] = useState<string[]>([])
  const [openFloors, setOpenFloors] = useState<string[]>([])
  const [newTower, setNewTower] = useState('')
  const [newFloor, setNewFloor] = useState<Record<string, string>>({})
  const [newRoom, setNewRoom] = useState<Record<string, string>>({})
  const [standaloneTowerId, setStandaloneTowerId] = useState('')
  const [standaloneFloorId, setStandaloneFloorId] = useState('')
  const [standaloneRoom, setStandaloneRoom] = useState('')
  const [standaloneRoomSuffixStart, setStandaloneRoomSuffixStart] = useState('')
  const [standaloneRoomSuffixEnd, setStandaloneRoomSuffixEnd] = useState('')
  const [showStandalone, setShowStandalone] = useState(false)
  const [standaloneMemoryLoaded, setStandaloneMemoryLoaded] = useState(false)
  const [edit, setEdit] = useState<{ type: 'tower' | 'floor' | 'room'; towerId: string; floorId?: string; roomId?: string; name: string } | null>(null)

  // 批量產生
  const [showGen, setShowGen] = useState(false)
  const [genTowers, setGenTowers] = useState('3')
  const [genPrefix, setGenPrefix] = useState('Tower')
  const [genFloors, setGenFloors] = useState('20')
  const [genStartGF, setGenStartGF] = useState(true)
  const [genFloorPrefix, setGenFloorPrefix] = useState('')
  const [genFloorSuffix, setGenFloorSuffix] = useState('')
  const [genFloorCompact, setGenFloorCompact] = useState(false)
  const [genTowerNA, setGenTowerNA] = useState(false)
  const [genRoomSuffixStart, setGenRoomSuffixStart] = useState('')
  const [genRoomSuffixEnd, setGenRoomSuffixEnd] = useState('')
  const [genRooms, setGenRooms] = useState<string[]>([])
  const [genCustom, setGenCustom] = useState('')

  // 移交詳細頁草稿（文字欄位）
  const [draft, setDraft] = useState<RoomHandover | null>(null)

  // Defect 編輯
  const [defectModal, setDefectModal] = useState<{ id: string | null; description: string } | null>(null)
  const [defectDraft, setDefectDraft] = useState<string[]>([])
  const [zoom, setZoom] = useState<string | null>(null)

  const roomPhotoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setStandaloneMemoryLoaded(false)
    try {
      const saved = localStorage.getItem(`handover-standalone-draft-${projectId}`)
      if (saved) {
        const draft = JSON.parse(saved) as Partial<{ towerId: string; floorId: string; room: string; suffixStart: string; suffixEnd: string }>
        setStandaloneTowerId(draft.towerId || '')
        setStandaloneFloorId(draft.floorId || '')
        setStandaloneRoom(draft.room || '')
        setStandaloneRoomSuffixStart(draft.suffixStart || '')
        setStandaloneRoomSuffixEnd(draft.suffixEnd || '')
      } else {
        setStandaloneTowerId('')
        setStandaloneFloorId('')
        setStandaloneRoom('')
        setStandaloneRoomSuffixStart('')
        setStandaloneRoomSuffixEnd('')
      }
    } catch {
      setStandaloneTowerId('')
      setStandaloneFloorId('')
      setStandaloneRoom('')
      setStandaloneRoomSuffixStart('')
      setStandaloneRoomSuffixEnd('')
    }
    setStandaloneMemoryLoaded(true)
    setLoaded(false)
    loadHandover(projectId)
      .then(data => {
        setTowers(data.towers)
        setResponsiblePerson(data.responsiblePerson)
        setResponsibleDraft(data.responsiblePerson)
        onResponsibleEmailChange?.(data.responsiblePerson.email)
        setLoaded(true)
      })
      .catch(() => {
        setTowers([])
        const emptyResponsible = createResponsiblePerson()
        setResponsiblePerson(emptyResponsible)
        setResponsibleDraft(emptyResponsible)
        onResponsibleEmailChange?.('')
        setLoaded(true)
      })
    setView(initialView)
    setSelTower(null)
    setSelFloor(null)
    setSelRoom(null)
  }, [projectId, initialView])

  useEffect(() => {
    if (!standaloneMemoryLoaded) return
    localStorage.setItem(`handover-standalone-draft-${projectId}`, JSON.stringify({
      towerId: standaloneTowerId,
      floorId: standaloneFloorId,
      room: standaloneRoom,
      suffixStart: standaloneRoomSuffixStart,
      suffixEnd: standaloneRoomSuffixEnd,
    }))
  }, [projectId, standaloneMemoryLoaded, standaloneTowerId, standaloneFloorId, standaloneRoom, standaloneRoomSuffixStart, standaloneRoomSuffixEnd])

  useEffect(() => {
    if (!onStructureChange) return
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
    const rooms = towers.flatMap(tower => tower.floors.flatMap(floor => floor.rooms.map(room => room.name)))
    const floorLocations = Object.fromEntries(towers.flatMap(tower => tower.floors.map(floor => [`位置:${floor.name}`, unique(floor.rooms.map(room => room.name))])))
    onStructureChange({
      座數: unique(towers.map(tower => tower.name)),
      樓層: unique(towers.flatMap(tower => tower.floors.map(floor => floor.name))),
      位置: unique(rooms),
      ...floorLocations,
    })
  }, [towers, onStructureChange])

  useEffect(() => {
    if (!loaded) return
    setSaveState('saving')
    saveHandover(projectId, { towers, responsiblePerson }).then(() => {
      setSaveState('saved')
      setLastSavedAt(new Date().toISOString())
    }).catch(error => {
      console.error('制房移交資料保存失敗:', error)
      setSaveState('error')
      flash('保存失敗，請檢查裝置儲存空間')
    })
  }, [towers, responsiblePerson, loaded, projectId])

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

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 1800)
  }

  // ---------- 讀取當前選擇 ----------
  const tower = towers.find(t => t.id === selTower) || null
  const floor = tower?.floors.find(f => f.id === selFloor) || null
  const room = floor?.rooms.find(r => r.id === selRoom) || null

  // ---------- 更新輔助 ----------
  const updateRoom = (towerId: string, floorId: string, roomId: string, updater: (r: Room) => Room) => {
    setTowers(prev =>
      prev.map(t =>
        t.id !== towerId
          ? t
          : { ...t, floors: t.floors.map(f => (f.id !== floorId ? f : { ...f, rooms: f.rooms.map(r => (r.id !== roomId ? r : updater(r))) })) },
      ),
    )
  }

  // ---------- 機房資料 CRUD ----------
  const addTower = () => {
    const name = newTower.trim()
    if (!name) return
    const t: Tower = { id: uid(), name, floors: [] }
    setTowers(prev => [...prev, t])
    setNewTower('')
    setOpenTowers(prev => [...prev, t.id])
    flash('已新增座數')
  }
  const addFloor = (towerId: string) => {
    const name = (newFloor[towerId] || '').trim()
    if (!name) return
    const f = { id: uid(), name, rooms: [] }
    setTowers(prev => prev.map(t => (t.id !== towerId ? t : { ...t, floors: [...t.floors, f] })))
    setNewFloor(s => ({ ...s, [towerId]: '' }))
    setOpenFloors(prev => [...prev, f.id])
    flash('已新增樓層')
  }
  const selectStandaloneTower = (towerId: string) => {
    if (towerId !== '__NA__') {
      setStandaloneTowerId(towerId)
      setStandaloneFloorId('')
      return
    }
    const existing = towers.find(tower => normalizeName(tower.name) === 'n/a')
    if (existing) {
      setStandaloneTowerId(existing.id)
      setStandaloneFloorId(existing.floors[0]?.id || '')
      return
    }
    const floor = { id: uid(), name: 'N/A', rooms: [] }
    const tower: Tower = { id: uid(), name: 'N/A', floors: [floor] }
    setTowers(prev => [...prev, tower])
    setStandaloneTowerId(tower.id)
    setStandaloneFloorId(floor.id)
    setOpenTowers(prev => [...prev, tower.id])
    flash('已新增 N/A 座數及樓層')
  }

  const addStandaloneRoom = () => {
    const baseName = standaloneRoom.trim()
    const suffixes = expandRoomSuffixRange(standaloneRoomSuffixStart, standaloneRoomSuffixEnd)
    if (!standaloneTowerId || !standaloneFloorId || !baseName) return flash('請選擇座數、樓層並輸入機房名稱')
    setTowers(prev => prev.map(t => t.id !== standaloneTowerId ? t : {
      ...t,
      floors: t.floors.map(f => f.id !== standaloneFloorId ? f : {
        ...f,
        rooms: [...f.rooms, ...suffixes
          .map(suffix => `${baseName}${suffix ? ` ${suffix}` : ''}`)
          .filter(name => !f.rooms.some(existing => normalizeName(existing.name) === normalizeName(name)))
          .map(name => ({ id: uid(), name, handover: createRoomHandover() }))],
      }),
    }))
    setStandaloneRoom('')
    setStandaloneRoomSuffixStart('')
    setStandaloneRoomSuffixEnd('')
    flash(`已新增 ${suffixes.length} 間機房`)
  }
  const addRoomTo = (towerId: string, floorId: string) => {
    const name = (newRoom[floorId] || '').trim()
    if (!name) return
    const r: Room = { id: uid(), name, handover: createRoomHandover() }
    setTowers(prev =>
      prev.map(t =>
        t.id !== towerId ? t : { ...t, floors: t.floors.map(f => (f.id !== floorId ? f : { ...f, rooms: [...f.rooms, r] })) },
      ),
    )
    setNewRoom(s => ({ ...s, [floorId]: '' }))
    flash('已新增機房')
  }
  const deleteTower = (towerId: string) => {
    if (!confirm('刪除座數後，該座所有樓層、機房、移交紀錄、Defect 和相片將一併刪除。是否繼續？')) return
    setTowers(prev => prev.filter(t => t.id !== towerId))
    flash('已刪除')
  }
  const deleteFloor = (towerId: string, floorId: string) => {
    if (!confirm('刪除樓層後，該層所有機房、移交紀錄、Defect 和相片將一併刪除。是否繼續？')) return
    setTowers(prev => prev.map(t => (t.id !== towerId ? t : { ...t, floors: t.floors.filter(f => f.id !== floorId) })))
    flash('已刪除')
  }
  const deleteRoom = (towerId: string, floorId: string, roomId: string) => {
    if (!confirm('刪除機房後，該機房所有移交資料、Defect 和相片將一併刪除。是否繼續？')) return
    setTowers(prev =>
      prev.map(t =>
        t.id !== towerId ? t : { ...t, floors: t.floors.map(f => (f.id !== floorId ? f : { ...f, rooms: f.rooms.filter(r => r.id !== roomId) })) },
      ),
    )
    flash('已刪除')
  }
  const commitEdit = () => {
    if (!edit) return
    const name = edit.name.trim()
    if (!name) return
    setTowers(prev =>
      prev.map(t => {
        if (t.id !== edit.towerId) return t
        if (edit.type === 'tower') return { ...t, name }
        return {
          ...t,
          floors: t.floors.map(f => {
            if (f.id !== edit.floorId) return f
            if (edit.type === 'floor') return { ...f, name }
            return { ...f, rooms: f.rooms.map(r => (r.id !== edit.roomId ? { ...r } : { ...r, name })) }
          }),
        }
      }),
    )
    setEdit(null)
    flash('已更新')
  }

  // ---------- 批量產生 ----------
  const toggleGenRoom = (name: string) =>
    setGenRooms(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))
  const addGenCustom = () => {
    const v = genCustom.trim()
    if (!v) return
    setGenRooms(prev => (prev.includes(v) ? prev : [...prev, v]))
    setGenCustom('')
  }
  const genTCount = Math.max(0, Math.floor(Number(genTowers) || 0))
  const genFCount = Math.max(0, Math.floor(Number(genFloors) || 0))
  const genRoomSuffixCount = expandRoomSuffixRange(genRoomSuffixStart, genRoomSuffixEnd).length
  const genTotalRooms = genTCount * genFCount * genRooms.length * genRoomSuffixCount
  const runGenerate = () => {
    const prefix = genPrefix.trim().replace(/\s+/g, ' ') || 'Tower'
    if (genTCount < 1) return flash('請輸入座數')
    if (genFCount < 1) return flash('請輸入樓層數')
    if (!genRooms.length) return flash('請至少選擇一個機房')
    const floorNames = buildFloorNames(genFCount, genStartGF, genFloorPrefix.trim(), genFloorSuffix.trim(), genFloorCompact).map(name => name.trim().replace(/\s+/g, ' '))
    const suffixes = expandRoomSuffixRange(genRoomSuffixStart, genRoomSuffixEnd)
    const roomNames = Array.from(new Map(genRooms.flatMap(name => suffixes.map(suffix => {
      const formatted = `${name.trim().replace(/\s+/g, ' ')}${suffix ? ` ${suffix}` : ''}`
      return [normalizeName(formatted), formatted] as const
    }))).values())
    const generatedNames = genTowerNA ? Array.from({ length: genTCount }, () => 'N/A') : Array.from({ length: genTCount }, (_, index) => `${prefix} ${index + 1}`)
    const existingTowerKeys = new Set(towers.map(t => normalizeName(t.name)))
    const duplicateTowerCount = generatedNames.filter(name => existingTowerKeys.has(normalizeName(name))).length
    const duplicateFloorCount = duplicateTowerCount * floorNames.length
    const duplicateRoomCount = duplicateFloorCount * roomNames.length
    const summary = `將產生 ${genTCount - duplicateTowerCount} 座新座，合併 ${duplicateTowerCount} 座；新增 ${genTCount * floorNames.length - duplicateFloorCount} 層，合併 ${duplicateFloorCount} 層；新增 ${genTCount * floorNames.length * roomNames.length - duplicateRoomCount} 間，合併 ${duplicateRoomCount} 間。是否繼續？`
    if (!confirm(summary)) return
    const newTowers: Tower[] = Array.from({ length: genTCount }, (_, ti) => ({
      id: uid(), name: generatedNames[ti], floors: floorNames.map(fn => ({
        id: uid(), name: fn, rooms: roomNames.map(rn => ({ id: uid(), name: rn, handover: createRoomHandover() })),
      })),
    }))
    setTowers(prev => {
      const merged = [...prev]
      const mergeTower = (target: Tower, source: Tower) => {
        for (const sourceFloor of source.floors) {
          const targetFloor = target.floors.find(f => normalizeName(f.name) === normalizeName(sourceFloor.name))
          if (!targetFloor) { target.floors.push(sourceFloor); continue }
          for (const sourceRoom of sourceFloor.rooms) {
            if (!targetFloor.rooms.some(r => normalizeName(r.name) === normalizeName(sourceRoom.name))) targetFloor.rooms.push(sourceRoom)
          }
        }
      }
      for (const sourceTower of newTowers) {
        const matchingTowers = merged.filter(t => normalizeName(t.name) === normalizeName(sourceTower.name))
        if (!matchingTowers.length) { merged.push(sourceTower); continue }
        const targetTower = matchingTowers[0]
        for (const duplicateTower of matchingTowers.slice(1)) { mergeTower(targetTower, duplicateTower); merged.splice(merged.indexOf(duplicateTower), 1) }
        mergeTower(targetTower, sourceTower)
      }
      return merged
    })
    setShowGen(false)
    flash(`已完成：合併 ${duplicateTowerCount} 座、${duplicateFloorCount} 層、${duplicateRoomCount} 間；新增 ${genTotalRooms - duplicateRoomCount} 間機房`)
  }

  // ---------- 移交詳細 ----------
  const openDetail = (towerId: string, floorId: string, roomId: string) => {
    const t = towers.find(x => x.id === towerId)
    const f = t?.floors.find(x => x.id === floorId)
    const r = f?.rooms.find(x => x.id === roomId)
    if (!r) return
    setSelTower(towerId)
    setSelFloor(floorId)
    setSelRoom(roomId)
    setDraft({ ...r.handover })
    setView('detail')
  }
  const saveDetail = () => {
    if (!selTower || !selFloor || !selRoom || !draft) return
    const defectDescriptions = defectDraft.map(description => description.trim()).filter(Boolean)
    updateRoom(selTower, selFloor, selRoom, r => {
      const defects = [...r.handover.defects, ...defectDescriptions.map(description => ({ id: uid(), description, status: '未完成' as const, note: '', createdAt: nowIso(), photos: [] }))]
      const hasDefect = defects.length > 0
      const status: RoomStatus = hasDefect
        ? (draft.status === '拒絕簽收(有Defect)' ? '拒絕簽收(有Defect)' : '已收(有Defect)')
        : draft.status
      const history = [...(r.handover.history || [])]
      if (r.handover.status !== status) history.unshift({ id: uid(), at: nowIso(), action: '狀態變更', detail: '房間狀態已更新', from: r.handover.status, to: status })
      defectDescriptions.forEach(description => history.unshift({ id: uid(), at: nowIso(), action: '新增 Defect', detail: description }))
      if (r.handover.date !== draft.date) history.unshift({ id: uid(), at: nowIso(), action: '修改移交日期', detail: '移交日期已更新', from: r.handover.date || '未設定', to: draft.date || '未設定' })
      return {
        ...r,
        handover: {
          ...r.handover,
          date: draft.date,
          status,
          defects,
          history: history.slice(0, 100),
          updatedAt: nowIso(),
        },
      }
    })
    setDefectDraft([])
    flash('已儲存')
  }
  const saveResponsiblePerson = () => {
    setResponsiblePerson(responsibleDraft)
    onResponsibleEmailChange?.(responsibleDraft.email)
    flash('負責人資料已儲存')
  }
  const addRoomPhotos = async (files: FileList | null) => {
    if (!files || !files.length || !tower || !floor || !room || !selTower || !selFloor || !selRoom) return
    const lines = [projectName, `${tower.name} ＞ ${floor.name} ＞ ${room.name}`, new Date().toLocaleString('zh-HK', { hour12: false })]
    const added = await Promise.all(
      Array.from(files).map(async file => ({ id: uid(), src: await stampHandoverImage(file, lines), createdAt: nowIso() })),
    )
    updateRoom(selTower, selFloor, selRoom, r => ({ ...r, handover: { ...r.handover, photos: [...r.handover.photos, ...added], history: [...(r.handover.history || []), { id: uid(), at: nowIso(), action: '新增相片', detail: `新增 ${added.length} 張相片` }].slice(-100), updatedAt: nowIso() } }))
    flash('已加入相片')
  }
  const deleteRoomPhoto = (photoId: string) => {
    if (!selTower || !selFloor || !selRoom) return
    if (!confirm('確定刪除此相片嗎？')) return
    updateRoom(selTower, selFloor, selRoom, r => ({ ...r, handover: { ...r.handover, photos: r.handover.photos.filter(p => p.id !== photoId), history: [...(r.handover.history || []), { id: uid(), at: nowIso(), action: '刪除相片', detail: `刪除相片 ${photoId}` }].slice(-100), updatedAt: nowIso() } }))
  }

  // ---------- Defect ----------
  const saveDefect = () => {
    if (!defectModal || !selTower || !selFloor || !selRoom) return
    const desc = defectModal.description.trim()
    if (!desc) {
      flash('請輸入 Defect 描述')
      return
    }
    updateRoom(selTower, selFloor, selRoom, r => {
      if (defectModal.id) {
        const previous = r.handover.defects.find(d => d.id === defectModal.id)
        if (!previous) return r
        return {
          ...r,
          handover: {
            ...r.handover,
            defects: r.handover.defects.map(d => d.id !== defectModal.id ? d : { ...d, description: desc }),
            history: previous.description === desc ? r.handover.history || [] : [...(r.handover.history || []), { id: uid(), at: nowIso(), action: '修改 Defect', detail: 'Defect 描述已更新', from: previous.description, to: desc }].slice(-100),
            updatedAt: nowIso(),
          },
        }
      }
      return r
    })
    setDefectModal(null)
    flash('已儲存 Defect')
  }
  const deleteDefect = (defectId: string) => {
    if (!selTower || !selFloor || !selRoom) return
    if (!confirm('確定要刪除此 Defect 嗎？相關相片亦會被刪除。')) return
    updateRoom(selTower, selFloor, selRoom, r => ({ ...r, handover: { ...r.handover, defects: r.handover.defects.filter(d => d.id !== defectId), history: [...(r.handover.history || []), { id: uid(), at: nowIso(), action: '刪除 Defect', detail: `刪除 Defect：${r.handover.defects.find(d => d.id === defectId)?.description || defectId}` }].slice(-100), updatedAt: nowIso() } }))
    flash('已刪除 Defect')
  }
  // ---------- 備用 ----------
  const clearAll = async () => {
    if (!confirm('你確定要清除所有制房移交資料嗎？')) return
    if (!confirm('此操作無法復原。請再次確認是否清除全部資料。')) return
    await clearAllHandover().catch(() => undefined)
    setTowers([])
    const emptyResponsible = createResponsiblePerson()
    setResponsiblePerson(emptyResponsible)
    setResponsibleDraft(emptyResponsible)
    onResponsibleEmailChange?.('')
    flash('已清除全部資料')
  }

  // ---------- 麵包屑 ----------
  const crumbs = () => {
    const parts = [view === 'settings' ? '設定' : view === 'manage' ? '機房資料' : '制房移交']
    if ((view === 'flow-floor' || view === 'flow-room' || view === 'detail') && tower) parts.push(tower.name)
    if ((view === 'flow-room' || view === 'detail') && floor) parts.push(floor.name)
    if (view === 'detail' && room) parts.push(room.name)
    return parts.join(' ＞ ')
  }

  const goBack = () => {
    if (view === 'home') return onBack()
        if (view === 'settings') return setView('home')
        if (view === 'manage') return setView('settings')
        if (view === 'status-list') return setView('stats')
    if (view === 'detail') return setView('flow-room')
    if (view === 'flow-room') return setView('flow-floor')
    if (view === 'flow-floor') return setView('flow-tower')
    return setView('home')
  }

  const toggle = (arr: string[], id: string, set: (v: string[]) => void) =>
    set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

  // ---------- 統計數字 ----------
  const total = countRooms(towers)
  const completed = countCompleted(towers)
  const pct = total ? Math.round((completed / total) * 100) : 0
  const statusCounts = ROOM_STATUSES.map(s => ({
    s,
    n: towers.reduce((sum, t) => sum + t.floors.reduce((a, f) => a + f.rooms.filter(r => r.handover.status === s).length, 0), 0),
  }))
  const statusCardOrder = ['未收', '拒絕簽收(有Defect)', '已完成', '已收(有Defect)'] as const
  const statusCards = statusCardOrder.reduce<(typeof statusCounts)[number][]>((cards, status) => {
    const card = statusCounts.find(item => item.s === status)
    if (card) cards.push(card)
    return cards
  }, [])
  const selectedStatus = statusCounts.find(({ s }) => s === selectedStatusFilter)?.s || null
  const statusGroups = selectedStatus
    ? towers
        .map(t => ({
          tower: t,
          floors: t.floors
            .map(f => ({ floor: f, rooms: f.rooms.filter(r => r.handover.status === selectedStatus) }))
            .filter(group => group.rooms.length > 0),
        }))
        .filter(group => group.floors.length > 0)
    : []
  const statusRoomCount = statusGroups.reduce((sum, group) => sum + group.floors.reduce((floorSum, floor) => floorSum + floor.rooms.length, 0), 0)

  return (
    <div className="app-shell ho-app">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">▦</div>
        <button className="project-trigger" onClick={goBack} aria-label="返回並選擇 Project">
          <strong>{projectName}</strong><span>⌄</span>
        </button>
      </header>

      <main className="ho-body">
      {view !== 'home' && view !== 'manage' && view !== 'settings' && <div className="ho-save-status" role="status">{saveState === 'saving' ? '正在保存…' : saveState === 'error' ? '保存失敗' : lastSavedAt ? `已保存 ${new Date(lastSavedAt).toLocaleString('zh-HK', { hour12: false })}` : '已保存'}</div>}
      {view !== 'home' && view !== 'manage' && view !== 'settings' && (
          <button className="back-link ho-page-back" onClick={goBack} aria-label="返回上一頁">‹ 返回</button>
        )}
        {view !== 'home' && view !== 'manage' && view !== 'settings' && <p className="ho-crumb">{crumbs()}</p>}

        {/* ===== 首頁卡片 ===== */}
        {view === 'home' && (
          <>
            <div className="ho-heading">
              <p className="eyebrow">HANDOVER MANAGEMENT</p>
              <h2>制房移交</h2>
            </div>
            <div className="ho-home-grid">
              <button
                className="ho-home-card"
                onClick={() => {
                  setView('flow-tower')
                }}
              >
                <ClipboardCheck size={30} className="ho-home-icon" />
                <strong>制房移交狀況</strong>
                <span>日期、移交狀態、相片、Defect</span>
              </button>
              <button className="ho-home-card" onClick={() => setView('stats')}>
                <BarChart3 size={30} className="ho-home-icon" />
                <strong>統計</strong>
                <span>移交比率</span>
              </button>
            </div>
          </>
        )}

        {view === 'responsible-person' && (
          <div className="ho-detail">
            <div className="ho-detail-title">
              <h3>負責人</h3>
            </div>
            <p className="ho-form-hint">此負責人資料適用於目前 Project 的所有機房。</p>
            <div className="ho-field-group">
              <label className="ho-field">
                <span>姓名</span>
                <input value={responsibleDraft.name} onChange={e => setResponsibleDraft({ ...responsibleDraft, name: e.target.value })} placeholder="陳大文" />
              </label>
              <label className="ho-field">
                <span>公司名稱</span>
                <input value={responsibleDraft.company} onChange={e => setResponsibleDraft({ ...responsibleDraft, company: e.target.value })} placeholder="ABC Engineering" />
              </label>
              <label className="ho-field">
                <span>電郵</span>
                <input type="email" value={responsibleDraft.email} onChange={e => setResponsibleDraft({ ...responsibleDraft, email: e.target.value })} placeholder="name@example.com" />
              </label>
              <div className="ho-field-two">
                <label className="ho-field">
                  <span>部門</span>
                  <input value={responsibleDraft.department} onChange={e => setResponsibleDraft({ ...responsibleDraft, department: e.target.value })} />
                </label>
                <label className="ho-field">
                  <span>職位</span>
                  <input value={responsibleDraft.position} onChange={e => setResponsibleDraft({ ...responsibleDraft, position: e.target.value })} />
                </label>
              </div>
            </div>
            <button className="ho-save-btn" onClick={saveResponsiblePerson}>儲存負責人資料</button>
          </div>
        )}

        {/* ===== 設定首頁 ===== */}
        {view === 'settings' && (
          <div className="ho-manage">
            <div className="ho-heading ho-manage-heading">
              <p className="eyebrow">APP SETTINGS</p>
              <h2>設定</h2>
            </div>
            <div className="ho-home-grid">
              <button className="ho-home-card" disabled={!isRegistered} onClick={() => isRegistered && onOpenPhotoSettings?.()}><Pencil size={30} className="ho-home-icon" /><strong>設定</strong><span>{isRegistered ? '標籤類別及選項' : '註冊版專有功能'}</span></button>
              <button className="ho-home-card" onClick={() => { setResponsibleDraft(responsiblePerson); setView('responsible-person') }}><UserRound size={30} className="ho-home-icon" /><strong>負責人</strong><span>Project 共用負責人資料</span></button>
              <button className="ho-home-card" onClick={() => setView('manage')}><Building2 size={30} className="ho-home-icon" /><strong>機房資料</strong><span>座數、樓層及機房</span></button>
              <button className="ho-home-card" disabled={!isRegistered} onClick={() => isRegistered && onOpenPhotoSettings?.('安全')}><AlertTriangle size={30} className="ho-home-icon" /><strong>安全事項</strong><span>{isRegistered ? '管理安全選項' : '註冊版專有功能'}</span></button>
              <button className="ho-home-card" disabled={!isRegistered} onClick={() => isRegistered && onOpenPhotoSettings?.('收貨相關')}><ClipboardList size={30} className="ho-home-icon" /><strong>收貨相關</strong><span>{isRegistered ? '管理收貨選項' : '註冊版專有功能'}</span></button>
              <button className="ho-home-card" disabled={!isRegistered} onClick={() => isRegistered && onOpenPhotoSettings?.('事項')}><Info size={30} className="ho-home-icon" /><strong>一般</strong><span>{isRegistered ? '管理事項選項' : '註冊版專有功能'}</span></button>
              <button className="ho-home-card" onClick={() => onNavigate('backup')}><Download size={30} className="ho-home-icon" /><strong>備份</strong><span>匯出或還原完整資料</span></button>
              <button className="ho-home-card" onClick={onUpdateApp}><Wand2 size={30} className="ho-home-icon" /><strong>更新 App</strong><span>檢查並套用最新版本</span></button>
            </div>
          </div>
        )}

        {/* ===== 機房資料 CRUD ===== */}
        {view === 'manage' && (
          <div className="ho-manage">
            <div className="ho-heading ho-manage-heading">
              <button className="back-link" onClick={() => setView('settings')}>‹ 返回設定</button>
              <p className="eyebrow">ROOM DATA</p>
              <h2>機房資料</h2>
            </div>
            {/* 批量產生 */}
            <button className="ho-gen-toggle" onClick={() => setShowGen(v => !v)}>
              <Wand2 size={18} />
              <span>批量產生座數／樓層／機房</span>
              {showGen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {showGen && (
              <div className="ho-gen-panel">
                <div className="ho-gen-row">
                  <label className="ho-field">
                    <span>座數</span>
                    <input type="number" inputMode="numeric" min={1} value={genTowers} onChange={e => setGenTowers(e.target.value)} />
                  </label>
                  <label className="ho-field">
                    <span>座名前綴</span>
                    <input value={genPrefix} onChange={e => setGenPrefix(e.target.value)} placeholder="Tower" />
                  </label>
                </div>
                <label className="ho-check-row"><input type="checkbox" checked={genTowerNA} onChange={e => setGenTowerNA(e.target.checked)} /><span>座數使用 N/A</span></label>
                {genTCount > 0 && (
                  <p className="ho-gen-hint">
                    產生：{genTowerNA ? 'N/A' : `${genPrefix.trim() || 'Tower'} 1`}{genTCount > 1 ? ` … ${genTowerNA ? 'N/A' : `${genPrefix.trim() || 'Tower'} ${genTCount}`}` : ''}
                  </p>
                )}

                <div className="ho-gen-row">
                  <label className="ho-field">
                    <span>樓層數</span>
                    <input type="number" inputMode="numeric" min={1} value={genFloors} onChange={e => setGenFloors(e.target.value)} />
                  </label>
                  <label className="ho-field">
                    <span>樓層由</span>
                    <div className="ho-seg">
                      <button className={genStartGF ? 'on' : ''} onClick={() => setGenStartGF(true)}>G/F 起</button>
                      <button className={!genStartGF ? 'on' : ''} onClick={() => setGenStartGF(false)}>1/F 起</button>
                    </div>
                  </label>
                </div>
                <div className="ho-gen-row">
                  <label className="ho-field"><span>樓層前綴</span><input value={genFloorPrefix} onChange={e => setGenFloorPrefix(e.target.value)} placeholder="例如 L" /></label>
                  <label className="ho-field"><span>樓層後綴</span><input value={genFloorSuffix} onChange={e => setGenFloorSuffix(e.target.value)} placeholder="例如 /F" /></label>
                </div>
                <label className="ho-check-row"><input type="checkbox" checked={genFloorCompact} onChange={e => setGenFloorCompact(e.target.checked)} /><span>使用兩位數編號（L00、L01、L02…）</span></label>
                {genFCount > 0 && (
                  <p className="ho-gen-hint">樓層：{buildFloorNames(genFCount, genStartGF, genFloorPrefix.trim(), genFloorSuffix.trim(), genFloorCompact).slice(0, 4).join('、')}{genFCount > 4 ? ' …' : ''}（共 {genFCount} 層）</p>
                )}

                <span className="ho-group-label">機房（可多選，或自訂）</span>
                <div className="ho-chip-row">
                  {Array.from(new Set([...ROOM_NAME_SUGGESTIONS, ...genRooms])).map(s => (
                    <button key={s} className={`ho-suggest ${genRooms.includes(s) ? 'on' : ''}`} onClick={() => toggleGenRoom(s)}>
                      {genRooms.includes(s) && <Check size={12} />}
                      {s}
                    </button>
                  ))}
                </div>
                <label className="ho-field">
                  <span>機房名稱後綴</span>
                  <input value={genRoomSuffixStart} onChange={e => setGenRoomSuffixStart(e.target.value)} placeholder="開始，例如 1 或 N1" />
                </label>
                <label className="ho-field"><span>機房名稱後綴結束</span><input value={genRoomSuffixEnd} onChange={e => setGenRoomSuffixEnd(e.target.value)} placeholder="結束，例如 4 或 N4" /></label>
                <p className="ho-gen-hint">最終名稱：{genRooms.length ? `${genRooms[0]}${expandRoomSuffixRange(genRoomSuffixStart, genRoomSuffixEnd).slice(0, 4).map(suffix => `${suffix ? ` ${suffix}` : ''}`).join(`、${genRooms[0]}`)}${expandRoomSuffixRange(genRoomSuffixStart, genRoomSuffixEnd).length > 4 ? ' …' : ''}` : '—'}</p>
                <div className="ho-add-row small">
                  <input
                    value={genCustom}
                    onChange={e => setGenCustom(e.target.value)}
                    placeholder="自訂機房名稱"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addGenCustom()
                    }}
                  />
                  <button onClick={addGenCustom}>
                    <Plus size={16} />
                  </button>
                </div>

                <button className="ho-save-btn" onClick={runGenerate} disabled={!genTotalRooms}>
                  產生{genTotalRooms ? ` ${genTotalRooms} 間機房` : ''}
                </button>
                <p className="ho-gen-note">產生後仍可在下方手動新增或刪除任何座數、樓層及機房。</p>
              </div>
            )}

            <button className="ho-gen-toggle" onClick={() => setShowStandalone(v => !v)}>
              <Plus size={18} />
              <span>獨立新增機房</span>
              {showStandalone ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {showStandalone && (
              <div className="ho-gen-panel">
                <div className="ho-gen-row">
                  <label className="ho-field"><span>座數</span><select value={standaloneTowerId} onChange={e => selectStandaloneTower(e.target.value)}><option value="">選擇座數</option><option value="__NA__">N/A</option>{towers.map(tower => <option key={tower.id} value={tower.id}>{tower.name}</option>)}</select></label>
                  <label className="ho-field"><span>樓層</span><select value={standaloneFloorId} onChange={e => setStandaloneFloorId(e.target.value)} disabled={!standaloneTowerId}><option value="">選擇樓層</option>{towers.find(tower => tower.id === standaloneTowerId)?.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
                </div>
                <div className="ho-gen-row">
                  <label className="ho-field"><span>機房名稱</span><input value={standaloneRoom} onChange={e => setStandaloneRoom(e.target.value)} placeholder="例如 Pump Room" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addStandaloneRoom() }} /></label>
                  <label className="ho-field"><span>名稱後綴開始</span><input value={standaloneRoomSuffixStart} onChange={e => setStandaloneRoomSuffixStart(e.target.value)} placeholder="例如 1 或 N1" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addStandaloneRoom() }} /></label>
                  <label className="ho-field"><span>名稱後綴結束</span><input value={standaloneRoomSuffixEnd} onChange={e => setStandaloneRoomSuffixEnd(e.target.value)} placeholder="例如 4 或 N4" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addStandaloneRoom() }} /></label>
                </div>
                <span className="ho-group-label">機房名稱快選</span>
                <div className="ho-chip-row">
                  {ROOM_NAME_SUGGESTIONS.map(name => <button type="button" key={name} className={`ho-suggest ${standaloneRoom === name ? 'on' : ''}`} onClick={() => setStandaloneRoom(name)}>{standaloneRoom === name && <Check size={12} />}{name}</button>)}
                </div>
                <p className="ho-gen-hint">最終名稱：{standaloneRoom.trim() ? expandRoomSuffixRange(standaloneRoomSuffixStart, standaloneRoomSuffixEnd).slice(0, 4).map(suffix => `${standaloneRoom.trim()}${suffix ? ` ${suffix}` : ''}`).join('、') : '—'}</p>
                <button className="ho-save-btn standalone-add-btn" onClick={addStandaloneRoom} disabled={!standaloneTowerId || !standaloneFloorId || !standaloneRoom.trim()}><Plus size={16} />新增機房</button>
                <p className="ho-gen-note">可指定機房所屬座數及樓層，不必使用批量產生；也可按上方快選直接填入名稱。</p>
              </div>
            )}

            <div className="ho-add-row">
              <input
                value={newTower}
                onChange={e => setNewTower(e.target.value)}
                placeholder="新增座數，例如 Tower 1"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addTower()
                }}
              />
              <button onClick={addTower}>
                <Plus size={18} />新增
              </button>
            </div>

            {!towers.length && <div className="ho-empty">尚未建立任何座數，請先新增座數。</div>}

            {towers.map(t => (
              <div className="ho-tree-tower" key={t.id}>
                <div className="ho-tree-row">
                  <button className="ho-tree-main" onClick={() => toggle(openTowers, t.id, setOpenTowers)}>
                    {openTowers.includes(t.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <strong>{t.name}</strong>
                    <em>{towerRooms(t)} 機房</em>
                  </button>
                  <button className="ho-mini" aria-label="編輯座數" onClick={() => setEdit({ type: 'tower', towerId: t.id, name: t.name })}>
                    <Pencil size={16} />
                  </button>
                  <button className="ho-mini danger" aria-label="刪除座數" onClick={() => deleteTower(t.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>

                {openTowers.includes(t.id) && (
                  <div className="ho-tree-children">
                    <div className="ho-add-row small">
                      <input
                        value={newFloor[t.id] || ''}
                        onChange={e => setNewFloor(s => ({ ...s, [t.id]: e.target.value }))}
                        placeholder="新增樓層，例如 G/F"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addFloor(t.id)
                        }}
                      />
                      <button onClick={() => addFloor(t.id)}>
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="ho-chip-row">
                      {FLOOR_SUGGESTIONS.map(s => (
                        <button key={s} className="ho-suggest" onClick={() => setNewFloor(cur => ({ ...cur, [t.id]: s }))}>
                          {s}
                        </button>
                      ))}
                    </div>

                    {!t.floors.length && <div className="ho-empty small">尚未新增樓層。</div>}

                    {t.floors.map(f => (
                      <div className="ho-tree-floor" key={f.id}>
                        <div className="ho-tree-row">
                          <button className="ho-tree-main" onClick={() => toggle(openFloors, f.id, setOpenFloors)}>
                            {openFloors.includes(f.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span>{f.name}</span>
                            <em>{f.rooms.length} 機房</em>
                          </button>
                          <button className="ho-mini" aria-label="編輯樓層" onClick={() => setEdit({ type: 'floor', towerId: t.id, floorId: f.id, name: f.name })}>
                            <Pencil size={15} />
                          </button>
                          <button className="ho-mini danger" aria-label="刪除樓層" onClick={() => deleteFloor(t.id, f.id)}>
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {openFloors.includes(f.id) && (
                          <div className="ho-tree-children">
                            <div className="ho-add-row small">
                              <input
                                value={newRoom[f.id] || ''}
                                onChange={e => setNewRoom(s => ({ ...s, [f.id]: e.target.value }))}
                                placeholder="新增機房，例如 Pump Room"
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addRoomTo(t.id, f.id)
                                }}
                              />
                              <button onClick={() => addRoomTo(t.id, f.id)}>
                                <Plus size={16} />
                              </button>
                            </div>
                            <div className="ho-chip-row">
                              {ROOM_NAME_SUGGESTIONS.map(s => (
                                <button key={s} className="ho-suggest" onClick={() => setNewRoom(cur => ({ ...cur, [f.id]: s }))}>
                                  {s}
                                </button>
                              ))}
                            </div>

                            {!f.rooms.length && <div className="ho-empty small">尚未新增機房。</div>}

                            {f.rooms.map(r => (
                              <div className="ho-tree-room" key={r.id}>
                                <span>{r.name}</span>
                                <button className="ho-mini" aria-label="編輯機房" onClick={() => setEdit({ type: 'room', towerId: t.id, floorId: f.id, roomId: r.id, name: r.name })}>
                                  <Pencil size={14} />
                                </button>
                                <button className="ho-mini danger" aria-label="刪除機房" onClick={() => deleteRoom(t.id, f.id, r.id)}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ===== 制房移交 第一步：選座 ===== */}
        {view === 'flow-tower' && (
          <div className="ho-flow">
            <h3 className="ho-step-title">選擇座數</h3>
            {!towers.length && <div className="ho-empty">尚未建立任何座數，請先到「機房資料」新增。</div>}
            <div className="ho-select-list">
              {towers.map(t => (
                <button
                  key={t.id}
                  className="ho-select-card"
                  onClick={() => {
                    setSelTower(t.id)
                    setView('flow-floor')
                  }}
                >
                  <div>
                    <strong>{t.name}</strong>
                    <span>
                      {towerCompleted(t)} / {towerRooms(t)} 已完成
                    </span>
                  </div>
                  <ChevronRight size={20} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== 第二步：選樓層 ===== */}
        {view === 'flow-floor' && tower && (
          <div className="ho-flow">
            <h3 className="ho-step-title">選擇樓層</h3>
            {!tower.floors.length && <div className="ho-empty">尚未新增樓層，請先到「機房資料」新增。</div>}
            <div className="ho-select-list">
              {tower.floors.map(f => (
                <button
                  key={f.id}
                  className="ho-select-card"
                  onClick={() => {
                    setSelFloor(f.id)
                    setView('flow-room')
                  }}
                >
                  <div>
                    <strong>{f.name}</strong>
                    <span>{f.rooms.length} 機房</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== 第三步：選機房 ===== */}
        {view === 'flow-room' && tower && floor && (
          <div className="ho-flow">
            <h3 className="ho-step-title">選擇機房</h3>
            {!floor.rooms.length && <div className="ho-empty">尚未新增機房，請先到「機房資料」新增。</div>}
            <div className="ho-select-list">
              {floor.rooms.map(r => {
                const open = openDefectCount(r)
                return (
                  <button key={r.id} className="ho-room-card" onClick={() => openDetail(tower.id, floor.id, r.id)}>
                    <div className="ho-room-main">
                      <strong>{r.name}</strong>
                      <div className="ho-room-meta">
                        <span className="ho-badge" style={{ background: ROOM_STATUS_COLOR[r.handover.status] }}>
                          {r.handover.status}
                        </span>
                        <span className={`ho-defect-count ${open ? 'has' : ''}`}>Defect：{r.handover.defects.length}</span>
                      </div>
                    </div>
                    <ChevronRight size={20} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ===== 第四步：機房移交詳細 ===== */}
        {view === 'detail' && room && draft && (
          <div className="ho-detail">
            <div className="ho-detail-title">
              <h3>{room.name}</h3>
              <span className="ho-badge" style={{ background: ROOM_STATUS_COLOR[draft.status] }}>
                {draft.status}
              </span>
            </div>

            {openDefectCount(room) > 0 && (
              <div className="ho-defect-warn">
                <AlertTriangle size={16} />此機房仍有 {openDefectCount(room)} 項未完成 Defect。
              </div>
            )}

            <label className="ho-field">
              <span>移交日期</span>
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
            </label>

            <div className="ho-field">
              <span>移交狀態</span>
              <div className="ho-status-picker">
                {(draft.defects.length > 0 || defectDraft.some(description => description.trim())
                  ? ROOM_STATUSES.filter(s => s === '已收(有Defect)' || s === '拒絕簽收(有Defect)')
                  : ROOM_STATUSES
                ).map(s => (
                  <button
                    key={s}
                    className={`ho-status-opt ${draft.status === s ? 'active' : ''}`}
                    style={draft.status === s ? { background: ROOM_STATUS_COLOR[s], borderColor: ROOM_STATUS_COLOR[s], color: '#fff' } : {}}
                    onClick={() => setDraft({ ...draft, status: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="ho-section ho-inline-defect">
              <div className="ho-section-head">
                <strong>Defect</strong>
              </div>
              <div className="ho-field">
                <span>Defect 描述（快選）</span>
                <div className="ho-chip-row">
                  {DEFECT_SUGGESTIONS.map(s => (
                    <button key={s} className={`ho-suggest ${defectDraft.includes(s) ? 'on' : ''}`} onClick={() => setDefectDraft(prev => prev.includes(s) ? prev.filter(item => item !== s) : [...prev, s])}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <label className="ho-field">
                <span>自訂 Defect 描述</span>
                <textarea rows={2} value={defectDraft.find(item => !DEFECT_SUGGESTIONS.includes(item)) || ''} onChange={e => setDefectDraft(prev => [...prev.filter(item => DEFECT_SUGGESTIONS.includes(item)), e.target.value])} placeholder="快選中沒有合適項目時，可自行輸入" />
              </label>
              {!room.handover.defects.length && <p className="ho-empty small">未有 Defect。</p>}
              <div className="ho-defect-list">
                {room.handover.defects.map(d => (
                  <div className="ho-defect-card" key={d.id}>
                    <div className="ho-defect-top">
                      <div className="ho-defect-ops">
                        <button aria-label="編輯 Defect" onClick={() => setDefectModal({ id: d.id, description: d.description })}>
                          <Pencil size={15} />
                        </button>
                        <button className="danger" aria-label="刪除 Defect" onClick={() => deleteDefect(d.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <p className="ho-defect-desc">{d.description}</p>
                    <small className="ho-defect-date">建立：{new Date(d.createdAt).toLocaleString('zh-HK', { hour12: false })}</small>
                  </div>
                ))}
              </div>
            </div>

            {/* 機房相片 */}
            <div className="ho-section">
              <div className="ho-section-head">
                <strong>機房相片</strong>
                <button className="ho-add-photo" onClick={() => roomPhotoRef.current?.click()}>
                  <Camera size={16} />加入相片
                </button>
                <input ref={roomPhotoRef} hidden type="file" accept="image/*" multiple onChange={e => { addRoomPhotos(e.target.files); e.target.value = '' }} />
              </div>
              {!room.handover.photos.length && <p className="ho-empty small">未有相片。</p>}
              <div className="ho-thumbs">
                {room.handover.photos.map(p => (
                  <div className="ho-thumb" key={p.id}>
                    <button onClick={() => setZoom(p.src)}>
                      <img src={p.src || '/placeholder.svg'} alt={`${room.name} 相片`} />
                    </button>
                    <small>{new Date(p.createdAt).toLocaleString('zh-HK', { hour12: false })}</small>
                    <button className="ho-thumb-del" aria-label="刪除相片" onClick={() => deleteRoomPhoto(p.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button className="ho-save-btn" onClick={saveDetail}>
              儲存
            </button>

            <div className="ho-section ho-history-section">
              <div className="ho-section-head"><strong>操作歷史</strong><span>{(room.handover.history || []).length} 筆</span></div>
              {!room.handover.history?.length && <p className="ho-empty small">尚未有操作記錄。</p>}
              <div className="ho-history-list">
                {(room.handover.history || []).map(entry => (
                  <div className="ho-history-item" key={entry.id}>
                    <strong>{entry.action}</strong><small>{new Date(entry.at).toLocaleString('zh-HK', { hour12: false })}</small>
                    <span>{entry.detail}</span>{entry.from && entry.to && <em>{entry.from} → {entry.to}</em>}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ===== 統計 ===== */}
        {view === 'stats' && (
          <div className="ho-stats">
            <div className="ho-stat-card">
              <div className="ho-stat-head">
                <strong>整體完成進度</strong>
                <span>
                  已完成：{completed} / {total}（{pct}%）
                </span>
              </div>
              <div className="ho-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>

            <p className="ho-group-label">每座完成進度</p>
            {!towers.length && <div className="ho-empty small">尚未有資料。</div>}
            {towers.map(t => {
              const tr = towerRooms(t)
              const tc = towerCompleted(t)
              const tp = tr ? Math.round((tc / tr) * 100) : 0
              return (
                <div className="ho-stat-card" key={t.id}>
                  <div className="ho-stat-head">
                    <strong>{t.name}</strong>
                    <span>
                      {tc} / {tr}（{tp}%）
                    </span>
                  </div>
                  <div className="ho-bar">
                    <i style={{ width: `${tp}%` }} />
                  </div>
                </div>
              )
            })}

            <p className="ho-group-label">機房狀態統計</p>
            <div className="ho-count-grid">
              {statusCards.map(({ s, n }) => (
                <button
                  className="ho-count-item"
                  key={s}
                  onClick={() => {
                    setSelectedStatusFilter(s)
                    setView('status-list')
                  }}
                >
                  <span className="ho-dot" style={{ background: ROOM_STATUS_COLOR[s] }} />
                  <span className="ho-count-label">{s}</span>
                  <b>{n}</b>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== 狀態房間清單 ===== */}
        {view === 'status-list' && selectedStatus && (
          <div className="ho-status-list">
            <div className="ho-section-head">
              <strong>{selectedStatus}</strong>
              <span>{statusRoomCount} 間</span>
            </div>
            {!statusGroups.length && <div className="ho-empty small">目前沒有符合此狀態的機房。</div>}
            {statusGroups.map(({ tower: t, floors }) => (
              <section className="ho-status-tower" key={t.id}>
                <h3>{t.name}</h3>
                {floors.map(({ floor: f, rooms }) => (
                  <div className="ho-status-floor" key={f.id}>
                    <h4>{f.name}</h4>
                    <div className="ho-status-rooms">
                      {rooms.map(r => (
                        <button
                          className="ho-status-room"
                          key={r.id}
                          onClick={() => openDetail(t.id, f.id, r.id)}
                        >
                          <strong>{r.name}</strong>
                          <span className="ho-badge" style={{ background: ROOM_STATUS_COLOR[selectedStatus] }}>{selectedStatus}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}

      </main>

      {toast && (
        <div className="ho-toast" role="status">
          {toast}
        </div>
      )}

      {/* 編輯名稱 modal */}
      {edit && (
        <div className="ho-overlay" onClick={() => setEdit(null)}>
          <div className="ho-sheet" onClick={e => e.stopPropagation()}>
            <div className="ho-sheet-head">
              <strong>{edit.type === 'tower' ? '編輯座數' : edit.type === 'floor' ? '編輯樓層' : '編輯機房'}</strong>
              <button onClick={() => setEdit(null)} aria-label="關閉">
                <X size={20} />
              </button>
            </div>
            <input
              className="ho-sheet-input"
              autoFocus
              value={edit.name}
              onChange={e => setEdit({ ...edit, name: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) commitEdit()
              }}
            />
            <button className="ho-save-btn" onClick={commitEdit}>
              儲存
            </button>
          </div>
        </div>
      )}

      {/* Defect 編輯 modal */}
      {defectModal && (
        <div className="ho-overlay" onClick={() => setDefectModal(null)}>
          <div className="ho-sheet" onClick={e => e.stopPropagation()}>
            <div className="ho-sheet-head">
              <strong>{defectModal.id ? '編輯 Defect' : '新增 Defect'}</strong>
              <button onClick={() => setDefectModal(null)} aria-label="關閉">
                <X size={20} />
              </button>
            </div>
            <div className="ho-field">
              <span>Defect 描述（快選）</span>
              <div className="ho-chip-row">
                {DEFECT_SUGGESTIONS.map(s => (
                  <button key={s} className="ho-suggest" onClick={() => setDefectModal({ ...defectModal, description: s })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <label className="ho-field">
              <span>自訂 Defect 描述</span>
              <textarea
                rows={2}
                value={defectModal.description}
                onChange={e => setDefectModal({ ...defectModal, description: e.target.value })}
                placeholder="快選中沒有合適項目時，可自行輸入"
              />
            </label>
            <button className="ho-save-btn" onClick={saveDefect}>
              儲存 Defect
            </button>
          </div>
        </div>
      )}

      {/* 相片放大 */}
      {zoom && (
        <div className="ho-zoom" onClick={() => setZoom(null)}>
          <img src={zoom || '/placeholder.svg'} alt="相片放大" />
        </div>
      )}

      <nav className="bottom-nav main-nav">
        <button onClick={() => onNavigate('home')}><span>⌂</span>首頁</button>
        <button onClick={() => onNavigate('photo')}><span>▧</span>相簿</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><span><Building2 size={20} /></span>設定</button>
        <button onClick={() => onNavigate('about')}><span><Info size={20} /></span>資料</button>
      </nav>
    </div>
  )
}
