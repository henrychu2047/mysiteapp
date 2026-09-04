// ============ 制房移交 資料層 ============
// 座 → 樓層 → 機房 三層階層，每間機房內含移交記錄、相片與 Defect。
// 資料按 projectId 分開儲存在 IndexedDB。

export const ROOM_STATUSES = ['未收', '拒絕簽收(有Defect)', '已完成', '已收(有Defect)'] as const
export type RoomStatus = (typeof ROOM_STATUSES)[number]

// 狀態顏色（配合現有設計 token）
export const ROOM_STATUS_COLOR: Record<RoomStatus, string> = {
  未收: '#687681',
  '已收(有Defect)': '#f26b38',
  '拒絕簽收(有Defect)': '#c0392b',
  已完成: '#2f9e56',
}

export type HandoverPhoto = { id: string; src?: string; photoId?: string; createdAt: string }

export type ResponsiblePerson = {
  name: string
  company: string
  email: string
  department: string
  position: string
}

export type Defect = {
  id: string
  description: string
  createdAt: string
  photos: HandoverPhoto[]
}

export type HandoverHistoryEntry = {
  id: string
  at: string
  action: string
  detail: string
  from?: string
  to?: string
}

export type RoomHandover = {
  date: string
  personName: string
  personCompany: string
  personDepartment: string
  personPosition: string
  personContractor: string
  status: RoomStatus
  note: string
  photos: HandoverPhoto[]
  defects: Defect[]
  updatedAt: string
  history: HandoverHistoryEntry[]
}

export type Room = { id: string; name: string; handover: RoomHandover }
export type Floor = { id: string; name: string; rooms: Room[] }
export type Tower = { id: string; name: string; floors: Floor[] }
export type HandoverProjectData = { towers: Tower[]; responsiblePerson: ResponsiblePerson }

function normalizeRoomStatus(status: unknown): RoomStatus {
  if (ROOM_STATUSES.includes(status as RoomStatus)) return status as RoomStatus
  if (status === '已開始' || status === '準備移交' || status === '檢查中' || status === '有 Defect') return '已收(有Defect)'
  return '未收'
}

function normalizeTowers(towers: Tower[]): Tower[] {
  return towers.map(tower => ({
    ...tower,
    floors: tower.floors.map(floor => ({
      ...floor,
      rooms: floor.rooms.map(room => ({
        ...room,
        handover: { ...createRoomHandover(), ...room.handover, photos: Array.isArray(room.handover.photos) ? room.handover.photos.map(photo => ({ ...photo, src: typeof photo.src === 'string' ? photo.src : undefined, photoId: typeof photo.photoId === 'string' ? photo.photoId : undefined })) : [], status: normalizeRoomStatus(room.handover.status), history: Array.isArray(room.handover.history) ? room.handover.history : [] },
      })),
    })),
  }))
}

export function createResponsiblePerson(): ResponsiblePerson {
  return { name: '', company: '', email: '', department: '', position: '' }
}

export function createRoomHandover(): RoomHandover {
  return {
    date: '',
    personName: '',
    personCompany: '',
    personDepartment: '',
    personPosition: '',
    personContractor: '',
    status: '未收',
    note: '',
    photos: [],
    defects: [],
    updatedAt: '',
    history: [],
  }
}

// 快速選項（可直接點按填入）
export const ROOM_NAME_SUGGESTIONS = [
  'Pump Room',
  'FS Pump Room',
  'Fire Control Room',
  'Elect Room',
  'AHU Room',
  'Water Tank Room',
  'TX Room',
  'Generator Room',
  'Lift Machine Room',
]
export const FLOOR_SUGGESTIONS = ['LG/F', 'G/F', '1/F', '2/F', '3/F', 'Podium', 'Roof']
export const DEFECT_SUGGESTIONS = [
  '未有門',
  '油漆未完',
  '未開牆身吼',
  '未開地台吼',
  '安全問題',
  '其它',
]

// ---------- 批量產生輔助 ----------
// 依樓層數產生樓層名稱。startWithGF=true 時由 G/F 起（G/F, 1/F, 2/F …）；否則由 1/F 起。
export function buildFloorNames(count: number, startWithGF: boolean, prefix = '', suffix = '', compact = false): string[] {
  const names: string[] = []
  const n = Math.max(0, Math.floor(count))
  const format = (value: string, number: number) => `${prefix}${compact ? String(number).padStart(2, '0') : value}${suffix}`
  if (compact) {
    for (let i = 0; i < n; i++) names.push(format(String(i), i))
  } else if (startWithGF && n > 0) {
    names.push(format('G/F', 0))
    for (let i = 1; i < n; i++) names.push(format(`${i}/F`, i))
  } else {
    for (let i = 1; i <= n; i++) names.push(format(`${i}/F`, i))
  }
  return names
}

// ---------- 統計輔助 ----------
export function countRooms(towers: Tower[]) {
  return towers.reduce((sum, t) => sum + t.floors.reduce((s, f) => s + f.rooms.length, 0), 0)
}
export function countCompleted(towers: Tower[]) {
  return towers.reduce(
    (sum, t) => sum + t.floors.reduce((s, f) => s + f.rooms.filter(r => r.handover.status === '已完成').length, 0),
    0,
  )
}
export function towerRooms(tower: Tower) {
  return tower.floors.reduce((s, f) => s + f.rooms.length, 0)
}
export function towerCompleted(tower: Tower) {
  return tower.floors.reduce((s, f) => s + f.rooms.filter(r => r.handover.status === '已完成').length, 0)
}
export function openDefectCount(room: Room) {
  return room.handover.defects.length
}

// ---------- IndexedDB ----------
const HO_DB = 'site-handover-db'
const HO_STORE = 'projects'

function openHandoverDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HO_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(HO_STORE, { keyPath: 'projectId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function responsiblePersonFromLegacyRooms(towers: Tower[]): ResponsiblePerson {
  for (const tower of towers) {
    for (const floor of tower.floors) {
      for (const room of floor.rooms) {
        const handover = room.handover
        if (handover.personName || handover.personCompany || handover.personContractor || handover.personDepartment || handover.personPosition) {
          return {
            name: handover.personName || '',
            company: handover.personCompany || '',
            email: '',
            department: handover.personDepartment || '',
            position: handover.personPosition || '',
          }
        }
      }
    }
  }
  return createResponsiblePerson()
}

function normalizeProjectData(row: { towers?: Tower[]; responsiblePerson?: ResponsiblePerson } | undefined): HandoverProjectData {
  const towers = Array.isArray(row?.towers) ? normalizeTowers(row.towers) : []
  const responsiblePerson = row?.responsiblePerson || responsiblePersonFromLegacyRooms(towers)
  return {
    towers,
    responsiblePerson: { ...createResponsiblePerson(), ...responsiblePerson },
  }
}

export function loadHandover(projectId: string): Promise<HandoverProjectData> {
  return openHandoverDb().then(
    db =>
      new Promise<HandoverProjectData>((resolve, reject) => {
        const request = db.transaction(HO_STORE, 'readonly').objectStore(HO_STORE).get(projectId)
        request.onsuccess = () => resolve(normalizeProjectData(request.result))
        request.onerror = () => reject(request.error)
      }),
  )
}

export function saveHandover(projectId: string, data: HandoverProjectData): Promise<void> {
  return openHandoverDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(HO_STORE, 'readwrite')
        transaction.objectStore(HO_STORE).put({ projectId, ...data })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      }),
  )
}

// 跨所有 Project 的資料（供 ZIP 備份使用）
export function loadAllHandover(): Promise<Record<string, HandoverProjectData>> {
  return openHandoverDb().then(
    db =>
      new Promise<Record<string, HandoverProjectData>>((resolve, reject) => {
        const request = db.transaction(HO_STORE, 'readonly').objectStore(HO_STORE).getAll()
        request.onsuccess = () => {
          const map: Record<string, HandoverProjectData> = {}
          for (const row of request.result as { projectId: string; towers?: Tower[]; responsiblePerson?: ResponsiblePerson }[]) {
            map[row.projectId] = normalizeProjectData(row)
          }
          resolve(map)
        }
        request.onerror = () => reject(request.error)
      }),
  )
}

export function saveAllHandover(map: Record<string, HandoverProjectData | Tower[]>): Promise<void> {
  return openHandoverDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(HO_STORE, 'readwrite')
        const store = transaction.objectStore(HO_STORE)
        store.clear()
        for (const [projectId, value] of Object.entries(map)) {
          const data = Array.isArray(value) ? normalizeProjectData({ towers: value }) : normalizeProjectData(value)
          store.put({ projectId, ...data })
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      }),
  )
}

export function clearAllHandover(): Promise<void> {
  return saveAllHandover({})
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function nowIso() {
  return new Date().toISOString()
}
