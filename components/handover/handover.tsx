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
  BarChart3,
  DatabaseBackup,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Image as ImageIcon,
  AlertTriangle,
  Wand2,
  Check,
} from 'lucide-react'
import {
  ROOM_STATUSES,
  DEFECT_STATUSES,
  ROOM_STATUS_COLOR,
  DEFECT_STATUS_COLOR,
  FLOOR_SUGGESTIONS,
  ROOM_NAME_SUGGESTIONS,
  DEFECT_SUGGESTIONS,
  buildFloorNames,
  createRoomHandover,
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
  type Defect,
  type RoomStatus,
  type DefectStatus,
  type RoomHandover,
} from './handover-data'

type AppMode = 'photo' | 'memo' | 'handover' | 'reserve' | 'about'

type Props = {
  onBack: () => void
  onNavigate: (mode: AppMode) => void
  initialView?: 'home' | 'manage'
  projectId: string
  projectName: string
  onExportBackup: () => void | Promise<void>
  onImportBackup: (file: File | undefined) => void | Promise<void>
}

type View = 'home' | 'manage' | 'flow-tower' | 'flow-floor' | 'flow-room' | 'detail' | 'stats' | 'backup'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

export function Handover({ onBack, onNavigate, projectId, projectName, initialView = 'home', onExportBackup, onImportBackup }: Props) {
  const [towers, setTowers] = useState<Tower[]>([])
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<View>(initialView)
  const [toast, setToast] = useState('')

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
  const [edit, setEdit] = useState<{ type: 'tower' | 'floor' | 'room'; towerId: string; floorId?: string; roomId?: string; name: string } | null>(null)

  // 批量產生
  const [showGen, setShowGen] = useState(false)
  const [genTowers, setGenTowers] = useState('3')
  const [genPrefix, setGenPrefix] = useState('Tower')
  const [genFloors, setGenFloors] = useState('20')
  const [genStartGF, setGenStartGF] = useState(true)
  const [genRooms, setGenRooms] = useState<string[]>([])
  const [genCustom, setGenCustom] = useState('')

  // 移交詳細頁草稿（文字欄位）
  const [draft, setDraft] = useState<RoomHandover | null>(null)

  // Defect 編輯
  const [defectModal, setDefectModal] = useState<{ id: string | null; description: string; status: DefectStatus; note: string } | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  const roomPhotoRef = useRef<HTMLInputElement>(null)
  const defectPhotoRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoaded(false)
    loadHandover(projectId)
      .then(t => {
        setTowers(t)
        setLoaded(true)
      })
      .catch(() => {
        setTowers([])
        setLoaded(true)
      })
    setView('home')
    setSelTower(null)
    setSelFloor(null)
    setSelRoom(null)
  }, [projectId])

  useEffect(() => {
    if (!loaded) return
    saveHandover(projectId, towers).catch(() => undefined)
  }, [towers, loaded, projectId])

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
  const genTotalRooms = genTCount * genFCount * genRooms.length
  const runGenerate = () => {
    const prefix = genPrefix.trim() || 'Tower'
    if (genTCount < 1) return flash('請輸入座數')
    if (genFCount < 1) return flash('請輸入樓層數')
    if (!genRooms.length) return flash('請至少選擇一個機房')
    const base = towers.length
      ? `將在現有資料後方新增 ${genTCount} 座 × ${genFCount} 層 × ${genRooms.length} 機房（共 ${genTotalRooms} 間機房）。是否繼續？`
      : `將產生 ${genTCount} 座 × ${genFCount} 層 × ${genRooms.length} 機房（共 ${genTotalRooms} 間機房）。是否繼續？`
    if (!confirm(base)) return
    const floorNames = buildFloorNames(genFCount, genStartGF)
    const newTowers: Tower[] = Array.from({ length: genTCount }, (_, ti) => ({
      id: uid(),
      name: `${prefix} ${ti + 1}`,
      floors: floorNames.map(fn => ({
        id: uid(),
        name: fn,
        rooms: genRooms.map(rn => ({ id: uid(), name: rn, handover: createRoomHandover() })),
      })),
    }))
    setTowers(prev => [...prev, ...newTowers])
    setShowGen(false)
    flash(`已產生 ${genTCount} 座、共 ${genTotalRooms} 間機房`)
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
    updateRoom(selTower, selFloor, selRoom, r => ({
      ...r,
      handover: {
        ...r.handover,
        date: draft.date,
        personName: draft.personName,
        personCompany: draft.personCompany,
        personDepartment: draft.personDepartment,
        personPosition: draft.personPosition,
        personContractor: draft.personContractor,
        status: draft.status,
        note: draft.note,
        updatedAt: nowIso(),
      },
    }))
    flash('已儲存')
  }
  const addRoomPhotos = async (files: FileList | null) => {
    if (!files || !files.length || !tower || !floor || !room || !selTower || !selFloor || !selRoom) return
    const lines = [projectName, `${tower.name} ＞ ${floor.name} ＞ ${room.name}`, new Date().toLocaleString('zh-HK', { hour12: false })]
    const added = await Promise.all(
      Array.from(files).map(async file => ({ id: uid(), src: await stampHandoverImage(file, lines), createdAt: nowIso() })),
    )
    updateRoom(selTower, selFloor, selRoom, r => ({ ...r, handover: { ...r.handover, photos: [...r.handover.photos, ...added], updatedAt: nowIso() } }))
    flash('已加入相片')
  }
  const deleteRoomPhoto = (photoId: string) => {
    if (!selTower || !selFloor || !selRoom) return
    if (!confirm('確定刪除此相片嗎？')) return
    updateRoom(selTower, selFloor, selRoom, r => ({ ...r, handover: { ...r.handover, photos: r.handover.photos.filter(p => p.id !== photoId) } }))
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
        return {
          ...r,
          handover: {
            ...r.handover,
            defects: r.handover.defects.map(d =>
              d.id !== defectModal.id ? d : { ...d, description: desc, status: defectModal.status, note: defectModal.note },
            ),
          },
        }
      }
      const d: Defect = { id: uid(), description: desc, status: defectModal.status, note: defectModal.note, createdAt: nowIso(), photos: [] }
      return { ...r, handover: { ...r.handover, defects: [...r.handover.defects, d] } }
    })
    setDefectModal(null)
    flash('已儲存 Defect')
  }
  const deleteDefect = (defectId: string) => {
    if (!selTower || !selFloor || !selRoom) return
    if (!confirm('確定要刪除此 Defect 嗎？相關相片亦會被刪除。')) return
    updateRoom(selTower, selFloor, selRoom, r => ({ ...r, handover: { ...r.handover, defects: r.handover.defects.filter(d => d.id !== defectId) } }))
    flash('已刪除 Defect')
  }
  const changeDefectStatus = (defectId: string, status: DefectStatus) => {
    if (!selTower || !selFloor || !selRoom) return
    updateRoom(selTower, selFloor, selRoom, r => ({
      ...r,
      handover: { ...r.handover, defects: r.handover.defects.map(d => (d.id !== defectId ? d : { ...d, status })) },
    }))
  }
  const [defectPhotoTarget, setDefectPhotoTarget] = useState<string | null>(null)
  const addDefectPhotos = async (files: FileList | null) => {
    if (!files || !files.length || !defectPhotoTarget || !tower || !floor || !room || !selTower || !selFloor || !selRoom) return
    const lines = [projectName, `${tower.name} ＞ ${floor.name} ＞ ${room.name}`, 'Defect', new Date().toLocaleString('zh-HK', { hour12: false })]
    const added = await Promise.all(
      Array.from(files).map(async file => ({ id: uid(), src: await stampHandoverImage(file, lines), createdAt: nowIso() })),
    )
    updateRoom(selTower, selFloor, selRoom, r => ({
      ...r,
      handover: { ...r.handover, defects: r.handover.defects.map(d => (d.id !== defectPhotoTarget ? d : { ...d, photos: [...d.photos, ...added] })) },
    }))
    setDefectPhotoTarget(null)
    flash('已加入相片')
  }
  const deleteDefectPhoto = (defectId: string, photoId: string) => {
    if (!selTower || !selFloor || !selRoom) return
    if (!confirm('確定刪除此相片嗎？')) return
    updateRoom(selTower, selFloor, selRoom, r => ({
      ...r,
      handover: {
        ...r.handover,
        defects: r.handover.defects.map(d => (d.id !== defectId ? d : { ...d, photos: d.photos.filter(p => p.id !== photoId) })),
      },
    }))
  }

  // ---------- 備用 ----------
  const clearAll = async () => {
    if (!confirm('你確定要清除所有制房移交資料嗎？')) return
    if (!confirm('此操作無法復原。請再次確認是否清除全部資料。')) return
    await clearAllHandover().catch(() => undefined)
    setTowers([])
    flash('已清除全部資料')
  }

  // ---------- 麵包屑 ----------
  const crumbs = () => {
    const parts = ['制房移交']
    if ((view === 'flow-floor' || view === 'flow-room' || view === 'detail') && tower) parts.push(tower.name)
    if ((view === 'flow-room' || view === 'detail') && floor) parts.push(floor.name)
    if (view === 'detail' && room) parts.push(room.name)
    return parts.join(' ＞ ')
  }

  const goBack = () => {
    if (view === 'home') return onBack()
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
  const allDefects: Defect[] = towers.flatMap(t => t.floors.flatMap(f => f.rooms.flatMap(r => r.handover.defects)))
  const defectCounts = DEFECT_STATUSES.map(s => ({ s, n: allDefects.filter(d => d.status === s).length }))

  return (
    <div className="ho-app">
      <header className="ho-topbar">
        <div className="brand-mark" aria-hidden="true">▦</div>
        <button className="project-trigger" onClick={goBack} aria-label="返回並選擇 Project">
          <strong>{projectName}</strong><span>⌄</span>
        </button>
      </header>

      <main className="ho-body">
        {view !== 'home' && <p className="ho-crumb">{crumbs()}</p>}

        {/* ===== 首頁 4 卡 ===== */}
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
                <span>日期、責任人、狀態、相片、Defect</span>
              </button>
              <button className="ho-home-card" onClick={() => setView('stats')}>
                <BarChart3 size={30} className="ho-home-icon" />
                <strong>統計</strong>
                <span>移交比率</span>
              </button>
              <button className="ho-home-card" onClick={() => setView('backup')}>
                <DatabaseBackup size={30} className="ho-home-icon" />
                <strong>備用</strong>
                <span>資料備份及設定</span>
              </button>
            </div>
          </>
        )}

        {/* ===== 機房資料 CRUD ===== */}
        {view === 'manage' && (
          <div className="ho-manage">
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
                {genTCount > 0 && (
                  <p className="ho-gen-hint">
                    產生：{(genPrefix.trim() || 'Tower')} 1{genTCount > 1 ? ` … ${genPrefix.trim() || 'Tower'} ${genTCount}` : ''}
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
                {genFCount > 0 && (
                  <p className="ho-gen-hint">樓層：{buildFloorNames(genFCount, genStartGF).slice(0, 4).join('、')}{genFCount > 4 ? ' …' : ''}（共 {genFCount} 層）</p>
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
                      {r.handover.updatedAt && <small>更新：{new Date(r.handover.updatedAt).toLocaleString('zh-HK', { hour12: false })}</small>}
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

            <div className="ho-field-group">
              <p className="ho-group-label">責任人</p>
              <label className="ho-field">
                <span>姓名</span>
                <input value={draft.personName} onChange={e => setDraft({ ...draft, personName: e.target.value })} placeholder="陳大文" />
              </label>
              <label className="ho-field">
                <span>公司名稱</span>
                <input value={draft.personCompany} onChange={e => setDraft({ ...draft, personCompany: e.target.value })} placeholder="ABC Engineering" />
              </label>
              <label className="ho-field">
                <span>承辦商名稱</span>
                <input value={draft.personContractor} onChange={e => setDraft({ ...draft, personContractor: e.target.value })} placeholder="機電承辦商" />
              </label>
              <div className="ho-field-two">
                <label className="ho-field">
                  <span>部門</span>
                  <input value={draft.personDepartment} onChange={e => setDraft({ ...draft, personDepartment: e.target.value })} />
                </label>
                <label className="ho-field">
                  <span>職位</span>
                  <input value={draft.personPosition} onChange={e => setDraft({ ...draft, personPosition: e.target.value })} />
                </label>
              </div>
            </div>

            <div className="ho-field">
              <span>移交狀態</span>
              <div className="ho-status-picker">
                {ROOM_STATUSES.map(s => (
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

            <label className="ho-field">
              <span>備註</span>
              <textarea rows={3} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="例如：等待測試報告、承辦商已安排跟進…" />
            </label>

            <button className="ho-save-btn" onClick={saveDetail}>
              儲存
            </button>

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

            {/* Defect 管理 */}
            <div className="ho-section">
              <div className="ho-section-head">
                <strong>Defect</strong>
                <button className="ho-add-photo" onClick={() => setDefectModal({ id: null, description: '', status: '未完成', note: '' })}>
                  <Plus size={16} />新增 Defect
                </button>
              </div>
              {!room.handover.defects.length && <p className="ho-empty small">未有 Defect。</p>}
              <div className="ho-defect-list">
                {room.handover.defects.map(d => (
                  <div className="ho-defect-card" key={d.id}>
                    <div className="ho-defect-top">
                      <span className="ho-badge" style={{ background: DEFECT_STATUS_COLOR[d.status] }}>
                        {d.status}
                      </span>
                      <div className="ho-defect-ops">
                        <button aria-label="編輯 Defect" onClick={() => setDefectModal({ id: d.id, description: d.description, status: d.status, note: d.note })}>
                          <Pencil size={15} />
                        </button>
                        <button className="danger" aria-label="刪除 Defect" onClick={() => deleteDefect(d.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <p className="ho-defect-desc">{d.description}</p>
                    <small className="ho-defect-date">建立：{new Date(d.createdAt).toLocaleString('zh-HK', { hour12: false })}</small>
                    {d.note && <p className="ho-defect-note">{d.note}</p>}
                    <div className="ho-defect-status-row">
                      {DEFECT_STATUSES.map(s => (
                        <button key={s} className={`ho-mini-status ${d.status === s ? 'active' : ''}`} onClick={() => changeDefectStatus(d.id, s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="ho-defect-photos">
                      {d.photos.map(p => (
                        <div className="ho-thumb small" key={p.id}>
                          <button onClick={() => setZoom(p.src)}>
                            <img src={p.src || '/placeholder.svg'} alt="Defect 相片" />
                          </button>
                          <button className="ho-thumb-del" aria-label="刪除相片" onClick={() => deleteDefectPhoto(d.id, p.id)}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        className="ho-defect-add-photo"
                        onClick={() => {
                          setDefectPhotoTarget(d.id)
                          defectPhotoRef.current?.click()
                        }}
                      >
                        <ImageIcon size={16} />
                        <span>相片 {d.photos.length}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <input ref={defectPhotoRef} hidden type="file" accept="image/*" multiple onChange={e => { addDefectPhotos(e.target.files); e.target.value = '' }} />
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
              {statusCounts.map(({ s, n }) => (
                <div className="ho-count-item" key={s}>
                  <span className="ho-dot" style={{ background: ROOM_STATUS_COLOR[s] }} />
                  <span className="ho-count-label">{s}</span>
                  <b>{n}</b>
                </div>
              ))}
            </div>

            <p className="ho-group-label">Defect 統計</p>
            <div className="ho-count-grid">
              <div className="ho-count-item">
                <span className="ho-count-label">Defect 總數</span>
                <b>{allDefects.length}</b>
              </div>
              {defectCounts.map(({ s, n }) => (
                <div className="ho-count-item" key={s}>
                  <span className="ho-dot" style={{ background: DEFECT_STATUS_COLOR[s] }} />
                  <span className="ho-count-label">{s}</span>
                  <b>{n}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 備用 ===== */}
        {view === 'backup' && (
          <div className="ho-backup">
            <div className="ho-backup-card">
              <strong>資料備份</strong>
              <span>制房移交資料會併入整個 App 的 ZIP 備份一起匯出／匯入。</span>
              <div className="ho-backup-actions">
                <button onClick={() => onExportBackup()}>匯出資料</button>
                <button onClick={() => importRef.current?.click()}>匯入資料</button>
                <input
                  ref={importRef}
                  hidden
                  type="file"
                  accept="application/zip,.zip"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    if (!confirm('匯入資料會取代目前 App 的全部資料。是否繼續？')) return
                    await onImportBackup(file)
                    const t = await loadHandover(projectId).catch(() => [])
                    setTowers(t)
                    flash('資料已成功匯入。')
                  }}
                />
              </div>
            </div>

            <div className="ho-backup-card danger">
              <strong>清除所有資料</strong>
              <span>移除目前 App 內所有座數、樓層、機房、移交記錄、Defect 及相片。</span>
              <button className="ho-clear-btn" onClick={clearAll}>
                清除所有制房移交資料
              </button>
            </div>

            <div className="ho-note-card">
              資料儲存在目前裝置及瀏覽器內。若清除瀏覽器資料、更換裝置、使用無痕模式或重設手機，紀錄可能會遺失。請定期匯出資料作備份。
            </div>
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
            <label className="ho-field">
              <span>Defect 描述</span>
              <textarea
                rows={2}
                value={defectModal.description}
                onChange={e => setDefectModal({ ...defectModal, description: e.target.value })}
                placeholder="例如：控制箱標示缺失"
              />
            </label>
            <div className="ho-chip-row">
              {DEFECT_SUGGESTIONS.map(s => (
                <button key={s} className="ho-suggest" onClick={() => setDefectModal({ ...defectModal, description: s })}>
                  {s}
                </button>
              ))}
            </div>
            <div className="ho-field">
              <span>Defect 狀態</span>
              <div className="ho-status-picker">
                {DEFECT_STATUSES.map(s => (
                  <button
                    key={s}
                    className={`ho-status-opt ${defectModal.status === s ? 'active' : ''}`}
                    style={defectModal.status === s ? { background: DEFECT_STATUS_COLOR[s], borderColor: DEFECT_STATUS_COLOR[s], color: '#fff' } : {}}
                    onClick={() => setDefectModal({ ...defectModal, status: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <label className="ho-field">
              <span>備註</span>
              <textarea
                rows={2}
                value={defectModal.note}
                onChange={e => setDefectModal({ ...defectModal, note: e.target.value })}
                placeholder="例如：已通知承辦商、預計下星期完成…"
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
        <button onClick={() => onNavigate('photo')}>
          <span>
            <Camera size={20} />
          </span>
          拍照記錄
        </button>
        <button onClick={() => onNavigate('memo')}>
          <span>
            <PenLine size={20} />
          </span>
          Site Memo
        </button>
        <button className="active" onClick={() => setView('home')}>
          <span>
            <ClipboardList size={20} />
          </span>
          制房移交
        </button>
        <button className="active" onClick={() => setView('manage')}>
          <span>
            <Building2 size={20} />
          </span>
          機房資料
        </button>
        <button onClick={() => onNavigate('about')}>
          <span>
            <Info size={20} />
          </span>
          資料
        </button>
      </nav>
    </div>
  )
}
