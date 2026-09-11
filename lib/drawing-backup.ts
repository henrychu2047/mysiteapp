import type { DrawingAnnotation, DrawingDocument, DrawingMarker, DrawingRoomLabel } from './drawing-types'
import type { Photo } from './photo-storage'
import { createId } from './photo-storage'

const BACKUP_VERSION = 1
const MAX_BACKUP_BYTES = 750 * 1024 * 1024
const MAX_FILE_COUNT = 10_000

type DrawingBackupManifest = {
  kind: 'site-drawing-backup'
  version: 1
  createdAt: string
  projectId: string
  drawings: Array<Omit<DrawingDocument, 'pdf'> & { pdfPath: string }>
  photos: Array<Omit<Photo, 'src' | 'cleanSrc' | 'originalBlob' | 'thumbnailBlob' | 'stampedBlob'> & {
    originalPath?: string
    thumbnailPath?: string
    stampedPath?: string
  }>
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) || 'drawing'
}

async function blobFromPhoto(photo: Photo, kind: 'original' | 'thumbnail' | 'stamped') {
  const direct = kind === 'original' ? photo.originalBlob : kind === 'thumbnail' ? photo.thumbnailBlob : photo.stampedBlob
  if (direct) return direct
  const source = kind === 'original' ? photo.cleanSrc : photo.src
  if (!source) return undefined
  try {
    const response = await fetch(source)
    return response.ok ? await response.blob() : undefined
  } catch {
    return undefined
  }
}

async function deliverFile(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: blob.type })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '圖紙標記備份' })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function exportDrawingBackup(
  drawings: DrawingDocument[],
  photos: Photo[],
  projectId: string,
  projectName: string,
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const linkedPhotoIds = new Set(drawings.flatMap(drawing => drawing.markers.flatMap(marker => marker.photoIds)))
  const linkedPhotos = photos.filter(photo => linkedPhotoIds.has(photo.id))
  const manifest: DrawingBackupManifest = {
    kind: 'site-drawing-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    projectId,
    drawings: drawings.map(({ pdf: _pdf, ...drawing }) => ({ ...drawing, pdfPath: `drawings/${drawing.id}.pdf` })),
    photos: [],
  }

  drawings.forEach(drawing => zip.file(`drawings/${drawing.id}.pdf`, drawing.pdf))
  for (const photo of linkedPhotos) {
    const { src: _src, cleanSrc: _cleanSrc, originalBlob: _originalBlob, thumbnailBlob: _thumbnailBlob, stampedBlob: _stampedBlob, ...metadata } = photo
    const original = await blobFromPhoto(photo, 'original')
    const thumbnail = await blobFromPhoto(photo, 'thumbnail')
    const stamped = await blobFromPhoto(photo, 'stamped')
    const originalPath = original ? `photos/${photo.id}/original.bin` : undefined
    const thumbnailPath = thumbnail ? `photos/${photo.id}/thumbnail.bin` : undefined
    const stampedPath = stamped ? `photos/${photo.id}/stamped.bin` : undefined
    if (original && originalPath) zip.file(originalPath, original)
    if (thumbnail && thumbnailPath) zip.file(thumbnailPath, thumbnail)
    if (stamped && stampedPath) zip.file(stampedPath, stamped)
    manifest.photos.push({ ...metadata, originalPath, thumbnailPath, stampedPath })
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  const output = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })
  const date = new Date().toISOString().slice(0, 10)
  await deliverFile(output, `${safeName(projectName)}-圖紙標記-${date}.zip`)
}

function isFinitePoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false
  const point = value as { x?: unknown; y?: unknown }
  return typeof point.x === 'number' && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && typeof point.y === 'number' && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1
}

function validMarker(value: unknown): value is DrawingMarker {
  if (!isFinitePoint(value)) return false
  const marker = value as Partial<DrawingMarker>
  return typeof marker.id === 'string' && Number.isInteger(marker.number) && Number(marker.number) > 0
    && Number.isInteger(marker.page) && Number(marker.page) > 0 && typeof marker.roomName === 'string'
    && typeof marker.category === 'string' && Boolean(marker.tags) && typeof marker.tags === 'object' && Object.values(marker.tags).every(tag => typeof tag === 'string')
    && typeof marker.note === 'string' && Array.isArray(marker.photoIds) && marker.photoIds.every(id => typeof id === 'string')
}

function validAnnotation(value: unknown): value is DrawingAnnotation {
  if (!isFinitePoint(value)) return false
  const annotation = value as Partial<DrawingAnnotation>
  return typeof annotation.id === 'string' && Number.isInteger(annotation.page) && Number(annotation.page) > 0
    && ['cloud', 'line', 'arrow', 'text', 'rectangle', 'ellipse', 'callout'].includes(String(annotation.kind))
    && typeof annotation.endX === 'number' && Number.isFinite(annotation.endX) && annotation.endX >= 0 && annotation.endX <= 1
    && typeof annotation.endY === 'number' && Number.isFinite(annotation.endY) && annotation.endY >= 0 && annotation.endY <= 1
    && typeof annotation.color === 'string' && typeof annotation.lineWidth === 'number' && typeof annotation.fontSize === 'number'
}

function validRoom(value: unknown): value is DrawingRoomLabel {
  if (!isFinitePoint(value)) return false
  const room = value as Partial<DrawingRoomLabel>
  return typeof room.id === 'string' && Number.isInteger(room.page) && Number(room.page) > 0
    && typeof room.text === 'string' && typeof room.width === 'number' && Number.isFinite(room.width) && room.width >= 0
    && typeof room.height === 'number' && Number.isFinite(room.height) && room.height >= 0
    && (room.source === 'pdf-text' || room.source === 'ocr')
}

function assertManifest(value: unknown): asserts value is DrawingBackupManifest {
  if (!value || typeof value !== 'object') throw new Error('備份清單格式不正確')
  const manifest = value as Partial<DrawingBackupManifest>
  if (manifest.kind !== 'site-drawing-backup' || manifest.version !== BACKUP_VERSION) throw new Error('不支援此圖紙備份版本')
  if (!Array.isArray(manifest.drawings) || !Array.isArray(manifest.photos)) throw new Error('備份內容不完整')
  for (const drawing of manifest.drawings) {
    if (!drawing || drawing.version !== 1 || typeof drawing.id !== 'string' || typeof drawing.name !== 'string'
      || typeof drawing.pdfPath !== 'string' || !Number.isInteger(drawing.pageCount) || drawing.pageCount < 1
      || !Number.isInteger(drawing.nextMarkerNumber) || drawing.nextMarkerNumber < 1
      || !Array.isArray(drawing.markers) || !drawing.markers.every(validMarker)
      || !Array.isArray(drawing.annotations) || !drawing.annotations.every(validAnnotation)
      || !Array.isArray(drawing.roomLabels) || !drawing.roomLabels.every(validRoom)) throw new Error('備份內有損壞的圖紙資料')
    if (drawing.markers.some(marker => marker.page > drawing.pageCount)
      || drawing.annotations.some(annotation => annotation.page > drawing.pageCount)
      || drawing.roomLabels.some(room => room.page > drawing.pageCount)) throw new Error('備份內的圖紙頁碼超出範圍')
  }
  for (const photo of manifest.photos) {
    if (!photo || typeof photo.id !== 'string' || typeof photo.category !== 'string' || typeof photo.note !== 'string'
      || typeof photo.createdAt !== 'string' || !photo.tags || typeof photo.tags !== 'object'
      || !Object.values(photo.tags).every(tag => typeof tag === 'string')) throw new Error('備份內有損壞的相片資料')
  }
}

export type DrawingBackupImport = { drawings: DrawingDocument[]; photos: Photo[] }

/** Imports as new records. All document, annotation, marker and photo IDs are remapped. */
export async function importDrawingBackup(file: Blob, destinationProjectId: string): Promise<DrawingBackupImport> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('備份檔案超過 750 MB 上限')
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file, { checkCRC32: true })
  const entries = Object.values(zip.files)
  if (entries.length > MAX_FILE_COUNT) throw new Error('備份包含過多檔案')
  const expandedBytes = entries.reduce((total, entry) => total + Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0)
  if (expandedBytes > MAX_BACKUP_BYTES * 2) throw new Error('備份解壓後超過安全大小上限')
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) throw new Error('找不到圖紙備份清單')
  const manifest = JSON.parse(await manifestEntry.async('string')) as unknown
  assertManifest(manifest)

  const referencedPhotoIds = new Set(manifest.drawings.flatMap(drawing => drawing.markers.flatMap(marker => marker.photoIds)))
  const photoIdMap = new Map([...referencedPhotoIds].map(id => [id, createId()]))
  const photos: Photo[] = []
  for (const stored of manifest.photos) {
    if (!stored || typeof stored.id !== 'string') continue
    const newId = photoIdMap.get(stored.id) || createId()
    photoIdMap.set(stored.id, newId)
    const originalBlob = stored.originalPath ? await zip.file(stored.originalPath)?.async('blob') : undefined
    const thumbnailBlob = stored.thumbnailPath ? await zip.file(stored.thumbnailPath)?.async('blob') : undefined
    const stampedBlob = stored.stampedPath ? await zip.file(stored.stampedPath)?.async('blob') : undefined
    const { originalPath: _originalPath, thumbnailPath: _thumbnailPath, stampedPath: _stampedPath, ...metadata } = stored
    photos.push({
      ...metadata,
      id: newId,
      projectId: destinationProjectId,
      src: '',
      cleanSrc: '',
      tags: metadata.tags && typeof metadata.tags === 'object' ? metadata.tags : {},
      originalBlob,
      thumbnailBlob,
      stampedBlob,
    })
  }

  const drawings: DrawingDocument[] = []
  for (const stored of manifest.drawings) {
    const pdf = await zip.file(stored.pdfPath)?.async('blob')
    if (!pdf || !pdf.size) throw new Error(`找不到「${stored.name}」的原始 PDF`)
    const { pdfPath: _pdfPath, ...metadata } = stored
    const now = new Date().toISOString()
    drawings.push({
      ...metadata,
      id: createId(),
      projectId: destinationProjectId,
      pdf: new Blob([pdf], { type: 'application/pdf' }),
      createdAt: now,
      updatedAt: now,
      annotations: metadata.annotations.map(annotation => ({ ...annotation, id: createId() })),
      nextMarkerNumber: Math.max(metadata.nextMarkerNumber, ...metadata.markers.map(marker => marker.number + 1), 1),
      markers: metadata.markers.map(marker => ({
        ...marker,
        id: createId(),
        photoIds: marker.photoIds.map(id => photoIdMap.get(id)).filter((id): id is string => Boolean(id)),
      })),
      roomLabels: metadata.roomLabels.map(room => ({ ...room, id: createId() })),
    })
  }
  return { drawings, photos }
}
