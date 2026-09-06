export type FileAnnotation = { page?: number; kind: 'text' | 'marker' | 'draw'; x: number; y: number; text?: string; points?: Array<{ x: number; y: number }> }

export type DatabaseFile = {
  id: string
  projectId: string
  folder: string
  path: string
  name: string
  type: string
  size: number
  dataUrl: string
  createdAt: string
  annotations?: FileAnnotation[]
}

const DB_NAME = 'site-database-db'
const STORE = 'files'

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

export function normalizeDatabaseFile(file: DatabaseFile): DatabaseFile {
  const source = file && typeof file === 'object' ? file as Partial<DatabaseFile> : {}
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `DB-invalid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })
}

function transactionError(transaction: IDBTransaction, requestError?: DOMException | null) {
  return requestError || transaction.error || new DOMException('資料庫交易被中止', 'AbortError')
}

export function readDatabaseFiles(projectId: string) {
  return openDatabase().then(db => new Promise<DatabaseFile[]>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(STORE, 'readonly')
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    const request = transaction.objectStore(STORE).getAll()
    let files: DatabaseFile[] = []
    request.onsuccess = () => { files = (request.result as unknown[]).filter(file => file && typeof file === 'object' && (file as DatabaseFile).projectId === projectId).map(file => normalizeDatabaseFile(file as DatabaseFile)) }
    transaction.oncomplete = () => { db.close(); resolve(files) }
    transaction.onerror = () => { db.close(); reject(transactionError(transaction, request.error)) }
    transaction.onabort = () => { db.close(); reject(transactionError(transaction, request.error)) }
  }))
}

export function writeDatabaseFiles(files: DatabaseFile[], projectId: string) {
  return openDatabase().then(db => new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(STORE, 'readwrite')
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    const store = transaction.objectStore(STORE)
    const request = store.getAll()
    let operationError: DOMException | null = null
    request.onsuccess = () => {
      ;(request.result as DatabaseFile[]).filter(file => file.projectId === projectId).forEach(file => {
        const deleteRequest = store.delete(file.id)
        deleteRequest.onerror = () => { operationError = deleteRequest.error }
      })
      files.filter(file => file.projectId === projectId).forEach(file => {
        const putRequest = store.put(normalizeDatabaseFile(file))
        putRequest.onerror = () => { operationError = putRequest.error }
      })
    }
    request.onerror = () => { operationError = request.error }
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transactionError(transaction, operationError || request.error)) }
    transaction.onabort = () => { db.close(); reject(transactionError(transaction, operationError || request.error)) }
  }))
}

export function loadAllDatabaseFiles() {
  return openDatabase().then(db => new Promise<Record<string, DatabaseFile[]>>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(STORE, 'readonly')
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    const request = transaction.objectStore(STORE).getAll()
    let rows: DatabaseFile[] = []
    request.onsuccess = () => { rows = (request.result as DatabaseFile[]).map(normalizeDatabaseFile) }
    transaction.oncomplete = () => {
      db.close()
      resolve(rows.reduce<Record<string, DatabaseFile[]>>((map, file) => {
        if (!file.projectId) return map
        map[file.projectId] ||= []
        map[file.projectId].push(file)
        return map
      }, {}))
    }
    transaction.onerror = () => { db.close(); reject(transactionError(transaction, request.error)) }
    transaction.onabort = () => { db.close(); reject(transactionError(transaction, request.error)) }
  }))
}

export function saveAllDatabaseFiles(map: Record<string, DatabaseFile[]>) {
  return openDatabase().then(db => new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(STORE, 'readwrite')
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    const store = transaction.objectStore(STORE)
    const clearRequest = store.clear()
    let operationError: DOMException | null = null
    clearRequest.onerror = () => { operationError = clearRequest.error }
    clearRequest.onsuccess = () => {
      Object.values(map).flat().forEach(file => {
        const putRequest = store.put(normalizeDatabaseFile(file))
        putRequest.onerror = () => { operationError = putRequest.error }
      })
    }
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transactionError(transaction, operationError || clearRequest.error)) }
    transaction.onabort = () => { db.close(); reject(transactionError(transaction, operationError || clearRequest.error)) }
  }))
}
