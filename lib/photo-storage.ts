export type PhotoAnnotation = {
  kind: 'text' | 'marker' | 'draw'
  x: number
  y: number
  text?: string
  points?: Array<{ x: number; y: number }>
}

export type Photo = {
  id: string
  src: string
  cleanSrc: string
  originalBlob?: Blob
  thumbnailBlob?: Blob
  stampedBlob?: Blob
  category: string
  tags: Record<string, string>
  note: string
  createdAt: string
  projectId: string
  annotations?: PhotoAnnotation[]
}

const PHOTO_DB = 'site-photo-db'
const PHOTO_STORE = 'photos'
const PHOTO_DB_VERSION = 2

function openPhotoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, PHOTO_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PHOTO_STORE)) {
        request.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new DOMException('本機資料庫正被舊版本使用，請關閉其他 App 分頁後重試', 'InvalidStateError'))
  })
}

function photoForStorage(photo: Photo): Photo {
  if (!photo.originalBlob && !photo.thumbnailBlob && !photo.stampedBlob) return photo
  return {
    ...photo,
    src: '',
    cleanSrc: '',
    stampedBlob: undefined,
    thumbnailBlob: photo.thumbnailBlob || photo.stampedBlob,
  }
}

export function describePhotoStorageError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') return '裝置的 App 儲存空間不足，請匯出備份後刪除部分相片'
    if (error.name === 'InvalidStateError' || error.name === 'VersionError') return '本機資料庫暫時無法使用，請關閉其他 App 分頁後重新開啟'
    if (error.name === 'SecurityError') return '瀏覽器禁止本機資料保存；請退出私密瀏覽模式後重試'
  }
  return error instanceof Error && error.message ? `本機相簿保存失敗：${error.message}` : '本機相簿保存失敗，請稍後重試'
}

export function loadStoredPhotos() {
  return openPhotoDb().then(db => new Promise<Photo[]>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(PHOTO_STORE, 'readonly')
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    const request = transaction.objectStore(PHOTO_STORE).getAll()
    request.onsuccess = () => { db.close(); resolve(request.result as Photo[]) }
    request.onerror = () => { db.close(); reject(request.error) }
    transaction.onabort = () => { db.close(); reject(transaction.error || request.error) }
  }))
}

export function hydratePhoto(photo: Photo): Photo {
  const rawTags = photo.tags && typeof photo.tags === 'object' ? photo.tags : {}
  const tags = Object.fromEntries(Object.entries(rawTags).filter(([key]) => typeof key === 'string').map(([key, value]) => [key, typeof value === 'string' ? value : value == null ? '' : String(value)]))
  const annotations = Array.isArray(photo.annotations)
    ? photo.annotations.filter(annotation => annotation && (annotation.kind === 'text' || annotation.kind === 'marker' || annotation.kind === 'draw')).map(annotation => ({
      kind: annotation.kind,
      x: Number.isFinite(annotation.x) ? Math.max(0, Math.min(1, annotation.x)) : 0.5,
      y: Number.isFinite(annotation.y) ? Math.max(0, Math.min(1, annotation.y)) : 0.5,
      text: typeof annotation.text === 'string' ? annotation.text : undefined,
      points: Array.isArray(annotation.points) ? annotation.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).map(point => ({ x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) })) : undefined,
    })).filter(annotation => annotation.kind !== 'text' || Boolean(annotation.text)) : []
  photo = { ...photo, category: typeof photo.category === 'string' ? photo.category : '其它', tags, note: typeof photo.note === 'string' ? photo.note : '', annotations }
  if (!photo.originalBlob && !photo.thumbnailBlob) return photo
  const stampedUrl = photo.stampedBlob ? URL.createObjectURL(photo.stampedBlob) : photo.src
  const originalUrl = photo.originalBlob ? URL.createObjectURL(photo.originalBlob) : photo.cleanSrc
  const thumbnailUrl = photo.thumbnailBlob ? URL.createObjectURL(photo.thumbnailBlob) : stampedUrl
  return { ...photo, src: thumbnailUrl, cleanSrc: originalUrl }
}

export function releasePhotoUrls(photos: Photo[]) {
  photos.forEach(photo => {
    if (photo.src.startsWith('blob:')) URL.revokeObjectURL(photo.src)
    if (photo.cleanSrc.startsWith('blob:') && photo.cleanSrc !== photo.src) URL.revokeObjectURL(photo.cleanSrc)
  })
}

export function saveStoredPhotos(photos: Photo[]) {
  return openPhotoDb().then(db => new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(PHOTO_STORE, 'readwrite')
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    const store = transaction.objectStore(PHOTO_STORE)
    const currentIds = new Set(photos.map(photo => photo.id))
    const existingRequest = store.getAllKeys()
    existingRequest.onsuccess = () => {
      ;(existingRequest.result as IDBValidKey[]).forEach(id => {
        if (typeof id === 'string' && !currentIds.has(id)) store.delete(id)
      })
      photos.forEach(photo => store.put(photoForStorage(photo)))
    }
    existingRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error || existingRequest.error) }
    transaction.onabort = () => { db.close(); reject(transaction.error || existingRequest.error) }
  }))
}

export function saveStoredPhoto(photo: Photo) {
  return openPhotoDb().then(db => new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(PHOTO_STORE, 'readwrite')
      transaction.objectStore(PHOTO_STORE).put(photoForStorage(photo))
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
    transaction.onabort = () => { db.close(); reject(transaction.error) }
  }))
}

export function createId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
