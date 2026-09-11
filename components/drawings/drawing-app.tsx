'use client'

import {
  ArrowLeft, Camera, Circle, Cloud, Download, Ellipsis,
  FileArchive, FileDown, FilePlus2, Grab, Images, Minus, MousePointer2,
  PencilLine, Plus, Redo2, RotateCw, Save, ScanText, Search, Square, Tags, Trash2, Type,
  Undo2, ListChecks,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import type { DrawingAnnotation, DrawingDocument, DrawingMarker, DrawingPoint, DrawingRoomLabel } from '@/lib/drawing-types'
import { createId, hydratePhoto, saveStoredPhoto, type Photo } from '@/lib/photo-storage'
import type { PhotoSource } from '@/lib/photo-attachments'
import { deleteDrawing, describeDrawingStorageError, loadProjectDrawings, saveDrawing, saveDrawings } from '@/lib/drawing-storage'
import { SMART_TAG_KEYS } from '@/lib/project-settings'
import styles from './drawing.module.css'

type DrawingTool = 'pan' | 'select' | 'marker' | DrawingAnnotation['kind']
type SaveState = 'loading' | 'saving' | 'saved' | 'error'

type Props = {
  projectId: string
  projectName: string
  categories: string[]
  smartTagOptions: Record<string, string[]>
  defaultTags: Record<string, string>
  photos: Photo[]
  onSelectAlbumPhotos: (onSelect: (photoIds: string[]) => void) => void
  onOpenCamera: (onCapture: (photo: PhotoSource) => void, initialCategory?: string) => void
  onRestorePhotos: (photos: Photo[]) => void
  onBack: () => void
}

type MarkerDraft = Pick<DrawingMarker, 'x' | 'y' | 'page' | 'roomName' | 'category' | 'tags' | 'note' | 'photoIds' | 'cropScale'> & { id?: string }
type DragState = {
  kind: 'draw' | 'move' | 'resize-start' | 'resize-end' | 'pan' | 'marker-tap' | 'marker-move'
  start: DrawingPoint
  latest: DrawingPoint
  clientX: number
  clientY: number
  annotation?: DrawingAnnotation
  marker?: DrawingMarker
  moved: boolean
}

const annotationTools: Array<{ id: DrawingAnnotation['kind']; label: string; icon: typeof PencilLine }> = [
  { id: 'cloud', label: '雲線', icon: Cloud },
  { id: 'line', label: '直線', icon: Minus },
  { id: 'arrow', label: '箭咀', icon: PencilLine },
  { id: 'text', label: '文字', icon: Type },
  { id: 'rectangle', label: '方框', icon: Square },
  { id: 'ellipse', label: '橢圓', icon: Circle },
]

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const normalizeRotation = (value: number) => ((value % 360) + 360) % 360

function canonicalToDisplay(point: DrawingPoint, rotation: number): DrawingPoint {
  if (rotation === 90) return { x: 1 - point.y, y: point.x }
  if (rotation === 180) return { x: 1 - point.x, y: 1 - point.y }
  if (rotation === 270) return { x: point.y, y: 1 - point.x }
  return point
}

function displayToCanonical(point: DrawingPoint, rotation: number): DrawingPoint {
  if (rotation === 90) return { x: point.y, y: 1 - point.x }
  if (rotation === 180) return { x: 1 - point.x, y: 1 - point.y }
  if (rotation === 270) return { x: 1 - point.y, y: point.x }
  return point
}

function cloudPath(x: number, y: number, width: number, height: number) {
  const w = Math.max(width, 0.001)
  const h = Math.max(height, 0.001)
  return `M ${x} ${y + h * .36} C ${x - w * .08} ${y + h * .1} ${x + w * .07} ${y - h * .02} ${x + w * .2} ${y + h * .12} C ${x + w * .24} ${y - h * .1} ${x + w * .43} ${y - h * .08} ${x + w * .47} ${y + h * .1} C ${x + w * .66} ${y - h * .08} ${x + w * .85} ${y + h * .01} ${x + w * .78} ${y + h * .2} C ${x + w * 1.04} ${y + h * .12} ${x + w * 1.04} ${y + h * .46} ${x + w * .84} ${y + h * .52} C ${x + w * 1.02} ${y + h * .67} ${x + w * .9} ${y + h * .94} ${x + w * .7} ${y + h * .82} C ${x + w * .6} ${y + h * 1.04} ${x + w * .42} ${y + h * 1.02} ${x + w * .37} ${y + h * .84} C ${x + w * .2} ${y + h * 1.02} ${x + w * .03} ${y + h * .9} ${x + w * .13} ${y + h * .7} C ${x - w * .08} ${y + h * .7} ${x - w * .08} ${y + h * .47} ${x} ${y + h * .36} Z`
}

function snapshot(annotations: DrawingAnnotation[]) {
  return structuredClone(annotations)
}

function maxCanvasDimension() {
  if (typeof navigator === 'undefined') return 2048
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (memory && memory <= 4) ? 1536 : 2560
}

function drawingImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/password|encrypted/i.test(message)) return 'PDF 已加密，請先移除密碼後再匯入。'
  if (/invalid|format|header|xref|damaged/i.test(message)) return 'PDF 已損壞或格式不完整，請用 PDF 閱讀器重新另存後再試。'
  return `無法讀取 PDF：${message}`
}

function Thumbnail({ pdf, page, active, onClick }: { pdf: PDFDocumentProxy; page: number; active: boolean; onClick: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    void import('@/lib/drawing-pdf').then(async ({ renderDrawingPage }) => {
      const pdfPage = await pdf.getPage(page)
      const canvas = await renderDrawingPage(pdf, page, { maxDimension: 240, rotation: normalizeRotation(pdfPage.rotate), signal: controller.signal })
      if (!controller.signal.aborted) hostRef.current?.replaceChildren(canvas)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [page, pdf])
  return <button className={`${styles.thumbnail} ${active ? styles.activeThumbnail : ''}`} onClick={onClick} aria-label={`前往第 ${page} 頁`}><div ref={hostRef} /><span>{page}</span></button>
}

export function DrawingApp({ projectId, projectName, categories, smartTagOptions, defaultTags, photos, onSelectAlbumPhotos, onOpenCamera, onRestorePhotos, onBack }: Props) {
  const [drawings, setDrawings] = useState<DrawingDocument[]>([])
  const [drawingId, setDrawingId] = useState<string | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [intrinsicRotation, setIntrinsicRotation] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState(true)
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 })
  const [tool, setTool] = useState<DrawingTool>('select')
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [draftAnnotation, setDraftAnnotation] = useState<DrawingAnnotation | null>(null)
  const [markerDraft, setMarkerDraft] = useState<MarkerDraft | null>(null)
  const [nearbyRooms, setNearbyRooms] = useState<DrawingRoomLabel[]>([])
  const [query, setQuery] = useState('')
  const [filterPage, setFilterPage] = useState<number | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [markerListOpen, setMarkerListOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [annotationColor, setAnnotationColor] = useState('#ef4444')
  const [annotationWidth, setAnnotationWidth] = useState(3)
  const [annotationFontSize, setAnnotationFontSize] = useState(18)
  const [toolSettingsOpen, setToolSettingsOpen] = useState(false)
  const [markerMode, setMarkerMode] = useState<'camera' | 'smart'>('camera')
  const [openToolGroup, setOpenToolGroup] = useState<1 | 2 | 3 | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef<DrawingDocument | null>(null)
  const loadedProjectRef = useRef('')
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const historyRef = useRef<DrawingAnnotation[][]>([])
  const redoRef = useRef<DrawingAnnotation[][]>([])
  const dragRef = useRef<DragState | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number; focusX: number; focusY: number; localX: number; localY: number } | null>(null)
  const ocrAbortRef = useRef<AbortController | null>(null)

  const current = drawings.find(drawing => drawing.id === drawingId) || null
  const viewRotation = normalizeRotation(intrinsicRotation + rotation)
  const currentAnnotations = useMemo(() => current?.annotations.filter(annotation => annotation.page === page) || [], [current, page])
  const currentMarkers = useMemo(() => current?.markers.filter(marker => marker.page === page) || [], [current, page])
  const selectedAnnotation = current?.annotations.find(annotation => annotation.id === selectedAnnotationId) || null

  useEffect(() => { currentRef.current = current }, [current])

  const flushSave = useCallback(async () => {
    const drawing = currentRef.current
    if (!drawing || !dirtyRef.current) return
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    try {
      await saveDrawing(drawing)
      dirtyRef.current = false
      setSaveState('saved')
    } catch (error) {
      setSaveState('error')
      setNotice(describeDrawingStorageError(error))
      throw error
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const changeProject = async () => {
      if (loadedProjectRef.current && loadedProjectRef.current !== projectId) {
        try { await flushSave() } catch { return }
      }
      setSaveState('loading')
      try {
        const stored = await loadProjectDrawings(projectId)
        if (cancelled) return
        loadedProjectRef.current = projectId
        setDrawings(stored)
        setDrawingId(stored[0]?.id || null)
        setPage(1)
        setSaveState('saved')
      } catch (error) {
        if (!cancelled) {
          setSaveState('error')
          setNotice(describeDrawingStorageError(error))
        }
      }
    }
    void changeProject()
    return () => { cancelled = true }
  }, [flushSave, projectId])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || saveState === 'saving' || saveState === 'error') {
        event.preventDefault()
        event.returnValue = '圖紙修改尚未保存。'
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [saveState])

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    ocrAbortRef.current?.abort()
  }, [])

  const updateCurrent = useCallback((change: (drawing: DrawingDocument) => DrawingDocument, withAnnotationHistory = false) => {
    setDrawings(items => items.map(item => {
      if (item.id !== drawingId) return item
      if (withAnnotationHistory) {
        historyRef.current.push(snapshot(item.annotations))
        historyRef.current = historyRef.current.slice(-50)
        redoRef.current = []
      }
      const next = { ...change(item), updatedAt: new Date().toISOString() }
      currentRef.current = next
      return next
    }))
    dirtyRef.current = true
    setSaveState('saving')
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => void flushSave().catch(() => undefined), 700)
  }, [drawingId, flushSave])

  useEffect(() => {
    let cancelled = false
    let loadedProxy: PDFDocumentProxy | null = null
    if (!current) {
      setPdf(null)
      return
    }
    setBusy('正在開啟圖紙…')
    void import('@/lib/drawing-pdf').then(({ loadDrawingPdf }) => loadDrawingPdf(current.pdf)).then(proxy => {
      if (cancelled) {
        void proxy.loadingTask.destroy()
        return
      }
      loadedProxy = proxy
      setPdf(proxy)
      setPage(value => clamp(value, 1, proxy.numPages))
      setBusy('')
    }).catch(error => {
      if (!cancelled) {
        setBusy('')
        setNotice(drawingImportError(error))
      }
    })
    return () => {
      cancelled = true
      if (loadedProxy) void loadedProxy.loadingTask.destroy()
    }
  }, [current?.id, current?.pdf])

  useEffect(() => {
    if (!pdf || !canvasHostRef.current) return
    const controller = new AbortController()
    setBusy('正在繪製頁面…')
    void pdf.getPage(page).then(pdfPage => {
      const nativeRotation = normalizeRotation(pdfPage.rotate)
      setIntrinsicRotation(nativeRotation)
      return import('@/lib/drawing-pdf').then(({ renderDrawingPage }) => renderDrawingPage(pdf, page, {
        maxDimension: maxCanvasDimension(),
        rotation: normalizeRotation(nativeRotation + rotation),
        signal: controller.signal,
      }))
    }).then(canvas => {
      if (controller.signal.aborted) return
      canvasHostRef.current?.replaceChildren(canvas)
      setCanvasSize({ width: canvas.width, height: canvas.height })
      setBusy('')
    }).catch(error => {
      if (!controller.signal.aborted) {
        setBusy('')
        setNotice(`頁面繪製失敗：${error instanceof Error ? error.message : String(error)}`)
      }
    })
    return () => controller.abort()
  }, [page, pdf, rotation])

  useEffect(() => {
    if (!fitMode || !viewportRef.current) return
    const available = Math.max(260, viewportRef.current.clientWidth - 32)
    setZoom(clamp(available / Math.max(canvasSize.width, 1), 0.25, 3))
  }, [canvasSize, fitMode, sidebarOpen, markerListOpen])

  const importPdfs = async (files: File[] | null) => {
    if (!files?.length) return
    setBusy('正在驗證 PDF…')
    const imported: DrawingDocument[] = []
    try {
      const { loadDrawingPdf } = await import('@/lib/drawing-pdf')
      for (const file of files) {
        const fileNameLooksPdf = /\.pdf$/i.test(file.name)
        const fileTypeLooksPdf = ['application/pdf', 'application/x-pdf', 'application/octet-stream', ''].includes(file.type)
        if (!fileNameLooksPdf && !fileTypeLooksPdf) throw new Error(`「${file.name}」不是 PDF 檔案`)
        const immutablePdf = new Blob([await file.arrayBuffer()], { type: 'application/pdf' })
        const proxy = await loadDrawingPdf(immutablePdf)
        if (!proxy.numPages) throw new Error(`「${file.name}」沒有可用頁面`)
        const now = new Date().toISOString()
        imported.push({
          version: 1,
          id: createId(),
          projectId,
          name: file.name.replace(/\.pdf$/i, ''),
          fileName: file.name,
          pdf: immutablePdf,
          pageCount: proxy.numPages,
          createdAt: now,
          updatedAt: now,
          nextMarkerNumber: 1,
          markers: [],
          annotations: [],
          roomLabels: [],
        })
        await proxy.loadingTask.destroy()
      }
      await saveDrawings(imported)
      setDrawings(items => [...imported, ...items])
      setDrawingId(imported[0]?.id || drawingId)
      setPage(1)
      setImportOpen(false)
      setNotice(`已匯入 ${imported.length} 份圖紙`)
      setSaveState('saved')
    } catch (error) {
      setNotice(drawingImportError(error))
    } finally {
      setBusy('')
    }
  }

  const removeDrawing = async (drawing: DrawingDocument) => {
    if (!confirm(`確定刪除「${drawing.name}」及其標記？原始 PDF 及圖紙資料會從此裝置移除，相簿相片不會刪除。`)) return
    try {
      await deleteDrawing(drawing.id)
      setDrawings(items => items.filter(item => item.id !== drawing.id))
      if (drawingId === drawing.id) {
        const replacement = drawings.find(item => item.id !== drawing.id)
        setDrawingId(replacement?.id || null)
        setPage(1)
      }
    } catch (error) {
      setNotice(describeDrawingStorageError(error))
    }
  }

  const chooseDrawing = async (id: string) => {
    try { await flushSave() } catch { return }
    setDrawingId(id)
    setPage(1)
    setRotation(0)
    setSelectedAnnotationId(null)
    historyRef.current = []
    redoRef.current = []
    setManagerOpen(false)
  }

  const pointFromEvent = (event: ReactPointerEvent): DrawingPoint => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0.5, y: 0.5 }
    return displayToCanonical({ x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }, viewRotation)
  }

  const openNewMarker = async (point: DrawingPoint, mode = markerMode) => {
    if (!current) return
    let suggestions: DrawingRoomLabel[] = []
    try {
      const { suggestDrawingRooms } = await import('@/lib/drawing-pdf')
      suggestions = suggestDrawingRooms(current.roomLabels, page, point, 5)
    } catch { /* marker creation remains available without suggestions */ }
    setNearbyRooms(suggestions)
    const draft: MarkerDraft = {
      ...point,
      page,
      roomName: suggestions[0]?.text || '',
      category: categories[0] || '',
      tags: Object.fromEntries(SMART_TAG_KEYS.map(key => [key, defaultTags[key] || ''])),
      note: '',
      photoIds: [],
      cropScale: 1,
    }
    if (mode === 'camera') {
      onOpenCamera(photo => setMarkerDraft(currentDraft => ({
        ...(currentDraft || draft),
        photoIds: Array.from(new Set([...(currentDraft?.photoIds || draft.photoIds), photo.id])),
        category: photo.category || draft.category,
        tags: { ...draft.tags, ...photo.tags },
        note: photo.note || draft.note,
      })), draft.category)
      return
    }
    setMarkerDraft(draft)
  }

  const openExistingMarker = (marker: DrawingMarker) => {
    const suggestions = current?.roomLabels.filter(room => room.page === marker.page).sort((a, b) => Math.hypot(a.x - marker.x, a.y - marker.y) - Math.hypot(b.x - marker.x, b.y - marker.y)).slice(0, 5) || []
    setNearbyRooms(suggestions)
    setMarkerDraft({ ...structuredClone(marker), id: marker.id })
  }

  const saveMarker = () => {
    if (!markerDraft || !current) return
    const now = new Date().toISOString()
    updateCurrent(drawing => {
      if (markerDraft.id) {
        return { ...drawing, markers: drawing.markers.map(marker => marker.id === markerDraft.id ? { ...marker, ...markerDraft, id: marker.id, updatedAt: now } : marker) }
      }
      const marker: DrawingMarker = { ...markerDraft, id: createId(), number: drawing.nextMarkerNumber, createdAt: now, updatedAt: now }
      return { ...drawing, nextMarkerNumber: drawing.nextMarkerNumber + 1, markers: [...drawing.markers, marker] }
    })
    setMarkerDraft(null)
  }

  const deleteMarkerRecord = () => {
    if (!markerDraft?.id || !confirm('確定刪除此標記？已連結的相片仍會保留在 Project 相簿。')) return
    updateCurrent(drawing => ({ ...drawing, markers: drawing.markers.filter(marker => marker.id !== markerDraft.id) }))
    setMarkerDraft(null)
  }

  const updateAnnotation = (id: string, change: Partial<DrawingAnnotation>, addHistory = true) => {
    updateCurrent(drawing => ({ ...drawing, annotations: drawing.annotations.map(annotation => annotation.id === id ? { ...annotation, ...change } : annotation) }), addHistory)
  }

  const removeSelectedAnnotation = () => {
    if (!selectedAnnotationId) return
    updateCurrent(drawing => ({ ...drawing, annotations: drawing.annotations.filter(annotation => annotation.id !== selectedAnnotationId) }), true)
    setSelectedAnnotationId(null)
  }

  const undo = () => {
    if (!current || !historyRef.current.length) return
    const previous = historyRef.current.pop()!
    redoRef.current.push(snapshot(current.annotations))
    updateCurrent(drawing => ({ ...drawing, annotations: previous }))
    setSelectedAnnotationId(null)
  }

  const redo = () => {
    if (!current || !redoRef.current.length) return
    const next = redoRef.current.pop()!
    historyRef.current.push(snapshot(current.annotations))
    updateCurrent(drawing => ({ ...drawing, annotations: next }))
    setSelectedAnnotationId(null)
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      dragRef.current = null
      setDraftAnnotation(null)
      const [a, b] = [...pointersRef.current.values()]
      const viewport = viewportRef.current
      const rect = viewport?.getBoundingClientRect()
      const localX = (a.x + b.x) / 2 - (rect?.left || 0)
      const localY = (a.y + b.y) / 2 - (rect?.top || 0)
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        focusX: ((viewport?.scrollLeft || 0) + localX) / Math.max(scaledWidth, 1),
        focusY: ((viewport?.scrollTop || 0) + localY) / Math.max(scaledHeight, 1),
        localX,
        localY,
      }
      return
    }
    const start = pointFromEvent(event)
    const target = (event.target as Element).closest<SVGElement>('[data-annotation-id]')
    const markerTarget = (event.target as Element).closest<SVGElement>('[data-marker-id]')
    if (markerTarget?.dataset.markerId) {
      const marker = current.markers.find(item => item.id === markerTarget.dataset.markerId)
      if (marker && tool === 'select') dragRef.current = { kind: 'marker-move', start, latest: start, clientX: event.clientX, clientY: event.clientY, marker: structuredClone(marker), moved: false }
      else if (marker) openExistingMarker(marker)
      return
    }
    if (tool === 'pan' || (event.pointerType === 'touch' && (tool === 'select' || tool === 'marker') && !target)) {
      dragRef.current = { kind: tool === 'marker' ? 'marker-tap' : 'pan', start, latest: start, clientX: event.clientX, clientY: event.clientY, moved: false }
      return
    }
    if (tool === 'select') {
      const id = target?.dataset.annotationId
      if (!id) {
        setSelectedAnnotationId(null)
        return
      }
      const annotation = current.annotations.find(item => item.id === id)
      if (!annotation) return
      setSelectedAnnotationId(id)
      const handle = target.dataset.handle
      dragRef.current = { kind: handle === 'start' ? 'resize-start' : handle === 'end' ? 'resize-end' : 'move', start, latest: start, clientX: event.clientX, clientY: event.clientY, annotation: structuredClone(annotation), moved: false }
      return
    }
    if (tool === 'marker') {
      dragRef.current = { kind: 'marker-tap', start, latest: start, clientX: event.clientX, clientY: event.clientY, moved: false }
      return
    }
    const annotation: DrawingAnnotation = {
      id: createId(), page, kind: tool, x: start.x, y: start.y, endX: start.x, endY: start.y,
      text: tool === 'text' ? '文字' : undefined, color: annotationColor, lineWidth: annotationWidth, fontSize: annotationFontSize,
    }
    dragRef.current = { kind: 'draw', start, latest: start, clientX: event.clientX, clientY: event.clientY, annotation, moved: false }
    setDraftAnnotation(annotation)
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const nextZoom = clamp(pinchRef.current.zoom * distance / pinchRef.current.distance, 0.25, 4)
      setFitMode(false)
      setZoom(nextZoom)
      const pinch = pinchRef.current
      requestAnimationFrame(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        viewport.scrollLeft = pinch.focusX * canvasSize.width * nextZoom - pinch.localX
        viewport.scrollTop = pinch.focusY * canvasSize.height * nextZoom - pinch.localY
      })
      return
    }
    const drag = dragRef.current
    if (!drag) return
    const point = pointFromEvent(event)
    const pixelDistance = Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY)
    drag.latest = point
    drag.moved ||= pixelDistance > 6
    if (drag.kind === 'pan' || (drag.kind === 'marker-tap' && drag.moved && event.pointerType === 'touch')) {
      const viewport = viewportRef.current
      if (viewport) {
        viewport.scrollLeft -= event.movementX
        viewport.scrollTop -= event.movementY
      }
      return
    }
    if (drag.kind === 'draw' && drag.annotation) {
      setDraftAnnotation({ ...drag.annotation, endX: point.x, endY: point.y })
      return
    }
    if (drag.kind === 'marker-move' && drag.marker) {
      updateCurrent(drawing => ({ ...drawing, markers: drawing.markers.map(marker => marker.id === drag.marker?.id ? { ...marker, x: point.x, y: point.y, updatedAt: new Date().toISOString() } : marker) }))
      return
    }
    if (!drag.annotation) return
    const dx = point.x - drag.start.x
    const dy = point.y - drag.start.y
    if (drag.kind === 'move') {
      const width = drag.annotation.endX - drag.annotation.x
      const height = drag.annotation.endY - drag.annotation.y
      const x = clamp(drag.annotation.x + dx, 0, 1 - Math.max(0, width))
      const y = clamp(drag.annotation.y + dy, 0, 1 - Math.max(0, height))
      updateCurrent(drawing => ({ ...drawing, annotations: drawing.annotations.map(annotation => annotation.id === drag.annotation?.id ? { ...annotation, x, y, endX: clamp(x + width), endY: clamp(y + height) } : annotation) }))
    } else if (drag.kind === 'resize-start') {
      updateCurrent(drawing => ({ ...drawing, annotations: drawing.annotations.map(annotation => annotation.id === drag.annotation?.id ? { ...annotation, x: point.x, y: point.y } : annotation) }))
    } else if (drag.kind === 'resize-end') {
      updateCurrent(drawing => ({ ...drawing, annotations: drawing.annotations.map(annotation => annotation.id === drag.annotation?.id ? { ...annotation, endX: point.x, endY: point.y } : annotation) }))
    }
  }

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (drag.kind === 'draw' && drag.annotation) {
      const completedAnnotation = draftAnnotation || { ...drag.annotation, endX: drag.latest.x, endY: drag.latest.y }
      const size = Math.hypot(completedAnnotation.endX - completedAnnotation.x, completedAnnotation.endY - completedAnnotation.y)
      if (size > 0.006 || completedAnnotation.kind === 'text') {
        updateCurrent(drawing => ({ ...drawing, annotations: [...drawing.annotations, completedAnnotation] }), true)
        setSelectedAnnotationId(completedAnnotation.id)
        setTool('select')
      }
      setDraftAnnotation(null)
    } else if (drag.kind === 'marker-tap' && !drag.moved) {
      void openNewMarker(drag.start)
    } else if (drag.kind === 'marker-move' && drag.marker && !drag.moved) {
      openExistingMarker(drag.marker)
    } else if ((drag.kind === 'move' || drag.kind.startsWith('resize')) && drag.annotation && drag.moved) {
      historyRef.current.push(current ? snapshot(current.annotations.map(annotation => annotation.id === drag.annotation?.id ? drag.annotation : annotation)) : [])
      historyRef.current = historyRef.current.slice(-50)
      redoRef.current = []
    }
  }

  const cancelPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    pinchRef.current = null
    dragRef.current = null
    setDraftAnnotation(null)
  }

  const extractRooms = async (ocr: boolean) => {
    if (!current || !pdf) return
    const controller = new AbortController()
    ocrAbortRef.current?.abort()
    ocrAbortRef.current = controller
    setBusy(ocr ? '正在辨識中英文房間文字…' : '正在讀取 PDF 文字…')
    setOcrProgress(ocr ? 0 : null)
    try {
      const helpers = await import('@/lib/drawing-pdf')
      const labels = ocr
        ? await helpers.recognizeDrawingRooms(pdf, page, { signal: controller.signal, onProgress: (value: number) => setOcrProgress(value) })
        : await helpers.extractDrawingRoomLabels(pdf, page)
      if (controller.signal.aborted) return
      updateCurrent(drawing => ({
        ...drawing,
        roomLabels: [...drawing.roomLabels.filter(label => !(label.page === page && label.source === (ocr ? 'ocr' : 'pdf-text'))), ...labels],
      }))
      setNotice(`第 ${page} 頁已找到 ${labels.length} 個房間文字候選`)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice(`文字辨識失敗：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy('')
      setOcrProgress(null)
      ocrAbortRef.current = null
    }
  }

  const filteredMarkers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-HK')
    return (current?.markers || []).filter(marker => {
      if (filterPage !== 'all' && marker.page !== filterPage) return false
      if (filterCategory && marker.category !== filterCategory) return false
      if (!normalized) return true
      return [marker.number, marker.roomName, marker.category, marker.note, ...Object.entries(marker.tags).flat()].join(' ').toLocaleLowerCase('zh-HK').includes(normalized)
    }).sort((a, b) => a.number - b.number)
  }, [current, filterCategory, filterPage, query])

  const jumpToMarker = (marker: DrawingMarker) => {
    setMarkerListOpen(false)
    setPage(marker.page)
    setTool('marker')
    window.setTimeout(() => openExistingMarker(marker), 100)
  }

  const openIssueReport = async () => {
    if (!current) return
    try {
      const { openDrawingReportPreview } = await import('@/lib/drawing-reports')
      await openDrawingReportPreview(current, filteredMarkers, photos, projectName)
    } catch (error) {
      setNotice(`問題報告開啟失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const exportMarkedPdf = async () => {
    if (!current) return
    try {
      const { exportMarkedDrawingPdf } = await import('@/lib/drawing-reports')
      await exportMarkedDrawingPdf(current)
    } catch (error) {
      setNotice(`標記 PDF 匯出失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const exportBackup = async () => {
    try {
      await flushSave()
      const { exportDrawingBackup } = await import('@/lib/drawing-backup')
      await exportDrawingBackup(drawings, photos, projectId, projectName)
    } catch (error) {
      setNotice(`圖紙備份匯出失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const restoreBackup = async (file: File | undefined) => {
    if (!file) return
    setBusy('正在驗證並還原備份…')
    try {
      const { importDrawingBackup } = await import('@/lib/drawing-backup')
      const restored = await importDrawingBackup(file, projectId)
      const { loadDrawingPdf } = await import('@/lib/drawing-pdf')
      for (const drawing of restored.drawings) {
        const restoredPdf = await loadDrawingPdf(drawing.pdf)
        if (restoredPdf.numPages !== drawing.pageCount) {
          await restoredPdf.loadingTask.destroy()
          throw new Error(`「${drawing.name}」的頁數與備份清單不一致`)
        }
        await restoredPdf.loadingTask.destroy()
      }
      await saveDrawings(restored.drawings)
      for (const photo of restored.photos) await saveStoredPhoto(photo)
      onRestorePhotos(restored.photos.map(hydratePhoto))
      setDrawings(items => [...restored.drawings, ...items])
      setDrawingId(restored.drawings[0]?.id || drawingId)
      setNotice(`已新增還原 ${restored.drawings.length} 份圖紙及 ${restored.photos.length} 張相片，現有資料沒有被覆蓋`)
    } catch (error) {
      setNotice(`備份還原失敗：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy('')
    }
  }

  const renderedAnnotations = [...currentAnnotations, ...(draftAnnotation ? [draftAnnotation] : [])]
  const scaledWidth = Math.max(1, canvasSize.width * zoom)
  const scaledHeight = Math.max(1, canvasSize.height * zoom)

  return <main className={styles.app}>
    <header className={styles.header}>
      <div className={styles.headerIdentity}>
      <button className={styles.iconButton} onClick={() => void flushSave().then(onBack).catch(() => undefined)} aria-label="返回首頁"><ArrowLeft /></button>
      <div><p>DRAWING MARKUP</p><h1>圖紙標記</h1><span>{projectName}</span></div>
      </div>
      <output className={styles.zoomReadout} aria-label="圖紙縮放比例">{current ? `${Math.round(zoom * 100)}%` : ''}</output>
      <div className={styles.headerActions}>
        {current && <button className={styles.markerToggle} aria-label="問題標記" title="問題標記" aria-expanded={markerListOpen} onClick={() => { setMarkerListOpen(value => !value); setSidebarOpen(false) }}><ListChecks /></button>}
        <button className={`${styles.saveState} ${saveState === 'error' ? styles.error : ''}`} onClick={() => void flushSave().catch(() => undefined)} disabled={!dirtyRef.current || saveState === 'saving' || saveState === 'loading'} title={saveState === 'error' ? '按此重試保存' : undefined}><Save />{saveState === 'loading' ? '載入中' : saveState === 'saving' ? '保存中' : saveState === 'error' ? '保存失敗（重試）' : '已保存'}</button>
        <button onClick={() => setManagerOpen(true)}>管理圖紙</button>
        <button className={styles.primary} onClick={() => fileInputRef.current?.click()}><FilePlus2 />匯入 PDF</button>
        <input ref={fileInputRef} hidden type="file" accept="application/pdf,.pdf" multiple onChange={event => { const files = event.target.files ? Array.from(event.target.files) : []; event.target.value = ''; void importPdfs(files) }} />
      </div>
    </header>

    {!current ? <section className={styles.empty}>
      <FilePlus2 />
      <h2>匯入第一份圖紙</h2>
      <p>原始 PDF 會按 Project 保存在此裝置；標記與註記另行保存，不會改寫原檔。</p>
      <button className={styles.primary} onClick={() => fileInputRef.current?.click()}>選擇 PDF</button>
      <div><button onClick={() => restoreInputRef.current?.click()}><FileArchive />從圖紙 ZIP 還原</button></div>
    </section> : <div className={styles.workspace}>
      <section className={styles.editor}>
        <button className={styles.pageBadge} aria-label={`第 ${page} 頁，共 ${current.pageCount} 頁；開啟頁面預覽`} aria-expanded={sidebarOpen} onClick={() => { setSidebarOpen(true); setMarkerListOpen(false) }}>{page} / {current.pageCount}</button>
        <div className={styles.toolbar}>
          {openToolGroup !== null && <button className={styles.toolGroupToggle} onClick={() => setOpenToolGroup(null)} title="返回工具組" aria-label="返回工具組"><ArrowLeft /></button>}
          {openToolGroup === null && <>
            <button className={`${styles.toolGroupToggle} ${tool === 'pan' ? styles.active : ''}`} onClick={() => setTool('pan')} title="平移"><Grab /></button>
            <button className={styles.toolGroupToggle} onClick={() => setOpenToolGroup(1)} title="標記工具組"><MousePointer2 /></button>
            <button className={styles.toolGroupToggle} onClick={() => setOpenToolGroup(2)} title="編輯工具組"><Undo2 /></button>
            <button className={styles.toolGroupToggle} onClick={() => setOpenToolGroup(3)} title="OCR 及匯出工具組"><ScanText /></button>
          </>}
          {openToolGroup === 1 && <div className={styles.toolGroup}>
            <button className={tool === 'select' ? styles.active : ''} onClick={() => setTool('select')} title="選取"><MousePointer2 /></button>
            <button className={tool === 'marker' && markerMode === 'camera' ? styles.active : ''} onClick={() => { setTool('marker'); setMarkerMode('camera') }} title="相機問題標記" aria-label="相機問題標記" aria-pressed={tool === 'marker' && markerMode === 'camera'}><Camera /></button>
            <button className={tool === 'marker' && markerMode === 'smart' ? styles.active : ''} onClick={() => { setTool('marker'); setMarkerMode('smart') }} title="Smart Tag 問題標記" aria-label="Smart Tag 問題標記" aria-pressed={tool === 'marker' && markerMode === 'smart'}><Tags /></button>
            {annotationTools.map(({ id, label, icon: Icon }) => <span key={id} className={styles.toolPair}><button className={tool === id ? styles.active : ''} onClick={() => { setTool(id); setSelectedAnnotationId(null); setToolSettingsOpen(false) }} title={label} aria-label={label} aria-pressed={tool === id}><Icon /></button>{tool === id && <button title={label + '設定'} aria-label={label + '設定'} aria-expanded={toolSettingsOpen} onClick={() => setToolSettingsOpen(true)}><span className={styles.colorDot} style={{ backgroundColor: selectedAnnotation?.color || annotationColor }} /></button>}</span>)}
            {selectedAnnotation && !annotationTools.some(item => item.id === tool) && <button aria-label="註記設定" title="註記設定" onClick={() => setToolSettingsOpen(true)}><span className={styles.colorDot} style={{ backgroundColor: selectedAnnotation.color }} /></button>}
          </div>}
          {openToolGroup === 2 && <div className={styles.toolGroup}>
            <button onClick={undo} disabled={!historyRef.current.length} title="復原"><Undo2 /></button>
            <button onClick={redo} disabled={!redoRef.current.length} title="重做"><Redo2 /></button>
            <button onClick={() => setRotation(value => normalizeRotation(value + 90))} title="順時針旋轉"><RotateCw /></button>
          </div>}
          {openToolGroup === 3 && <div className={styles.toolGroup}>
            <button onClick={() => void extractRooms(false)}><ScanText />讀取文字</button>
            <button onClick={() => void extractRooms(true)}><ScanText />OCR</button>
            <button onClick={exportMarkedPdf}><FileDown />標記 PDF</button>
            <button onClick={openIssueReport}><Download />問題報告</button>
            <button onClick={() => setImportOpen(true)}><Ellipsis /></button>
          </div>}
        </div>

        <div className={styles.viewport} ref={viewportRef}>
          <div className={styles.surface} ref={surfaceRef} style={{ width: scaledWidth, height: scaledHeight }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelPointer}>
            <div className={styles.canvasHost} ref={canvasHostRef} />
            <svg className={styles.overlay} viewBox="0 0 1 1" preserveAspectRatio="none" aria-label={`第 ${page} 頁標記層`}>
              <defs><marker id="drawing-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker></defs>
              {renderedAnnotations.map(annotation => {
                const start = canonicalToDisplay(annotation, viewRotation)
                const end = canonicalToDisplay({ x: annotation.endX, y: annotation.endY }, viewRotation)
                const x = Math.min(start.x, end.x); const y = Math.min(start.y, end.y)
                const width = Math.abs(end.x - start.x); const height = Math.abs(end.y - start.y)
                const selected = annotation.id === selectedAnnotationId
                const common = { stroke: annotation.color, strokeWidth: annotation.lineWidth, vectorEffect: 'non-scaling-stroke' as const, fill: 'none', 'data-annotation-id': annotation.id, className: selected ? styles.selectedShape : undefined }
                return <g key={annotation.id}>
                  {(annotation.kind === 'line' || annotation.kind === 'arrow') && <line {...common} x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={annotation.kind === 'arrow' ? 'url(#drawing-arrow)' : undefined} />}
                  {annotation.kind === 'rectangle' && <rect {...common} x={x} y={y} width={width} height={height} />}
                  {annotation.kind === 'cloud' && <path {...common} d={cloudPath(x, y, width, height)} strokeLinecap="round" strokeLinejoin="round" />}
                  {annotation.kind === 'ellipse' && <ellipse {...common} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} />}
                  {annotation.kind === 'text' && <text data-annotation-id={annotation.id} x={start.x} y={start.y} fill={annotation.color} fontSize={annotation.fontSize / Math.max(canvasSize.height, 1)} dominantBaseline="hanging" className={selected ? styles.selectedText : undefined}>{annotation.text}</text>}
                  {selected && <><circle data-annotation-id={annotation.id} data-handle="start" cx={start.x} cy={start.y} r={7 / Math.max(scaledWidth, scaledHeight) * 2} className={styles.handle} /><circle data-annotation-id={annotation.id} data-handle="end" cx={end.x} cy={end.y} r={7 / Math.max(scaledWidth, scaledHeight) * 2} className={styles.handle} /></>}
                </g>
              })}
              {currentMarkers.map(marker => {
                const point = canonicalToDisplay(marker, viewRotation)
                return <g key={marker.id} data-marker-id={marker.id} className={styles.marker} transform={`translate(${point.x} ${point.y})`}><circle r={15 / Math.max(scaledWidth, scaledHeight) * 2} /><text textAnchor="middle" dominantBaseline="central" fontSize={12 / Math.max(scaledHeight, 1)}>{marker.number}</text></g>
              })}
            </svg>
          </div>
          {busy && <div className={styles.busy} role="status"><span />{busy}{ocrProgress !== null && ` ${Math.round(ocrProgress <= 1 ? ocrProgress * 100 : ocrProgress)}%`}{ocrProgress !== null && <button onClick={() => ocrAbortRef.current?.abort()}>取消</button>}</div>}
        </div>
      </section>

      {markerListOpen && <button className={styles.panelDismiss} aria-label="關閉問題標記" onClick={() => setMarkerListOpen(false)} />}
      <aside className={`${styles.markers} ${markerListOpen ? '' : styles.collapsed}`} aria-label="問題標記列表">
        <button className={styles.collapse} aria-label="關閉問題標記" onClick={() => setMarkerListOpen(false)}>×</button>
        {markerListOpen && <><div className={styles.markerHeading}><div><strong>問題標記</strong><small>{filteredMarkers.length} / {current.markers.length}</small></div><button onClick={() => setTool('marker')}><Plus /></button></div><label className={styles.search}><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋房間、標籤、備註" /></label><div className={styles.filters}><select value={filterPage} onChange={event => setFilterPage(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">全部頁面</option>{Array.from({ length: current.pageCount }, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} 頁</option>)}</select><select value={filterCategory} onChange={event => setFilterCategory(event.target.value)}><option value="">全部類別</option>{categories.map(category => <option key={category}>{category}</option>)}</select></div><div className={styles.markerList}>{filteredMarkers.map(marker => <button key={marker.id} onClick={() => jumpToMarker(marker)}><b>{marker.number}</b><span><strong>{marker.roomName || '未指定房間'}</strong><small>第 {marker.page} 頁 · {marker.category || '未分類'} · {marker.photoIds.length} 張相片</small></span></button>)}{!filteredMarkers.length && <p>未找到標記。選擇圖釘工具後點按圖紙即可新增。</p>}</div></>}
      </aside>
    </div>}

    {toolSettingsOpen && <div className={styles.modalBackdrop} onClick={() => setToolSettingsOpen(false)}><section className={styles.toolSettings} role="dialog" aria-modal="true" aria-label="工具設定" onClick={event => event.stopPropagation()}>
      <header><h2>工具設定</h2><button aria-label="關閉工具設定" onClick={() => setToolSettingsOpen(false)}>×</button></header>
      <svg viewBox="0 0 300 70" className={styles.stylePreview} aria-label="樣式預覽"><path d="M20 45 Q85 0 150 35 T280 25" fill="none" stroke={selectedAnnotation?.color || annotationColor} strokeWidth={selectedAnnotation?.lineWidth ?? annotationWidth} /></svg>
      <label>線粗 <output>{selectedAnnotation?.lineWidth ?? annotationWidth}</output><input aria-label="線粗" type="range" min="1" max="12" value={selectedAnnotation?.lineWidth ?? annotationWidth} onChange={event => { const value = Number(event.target.value); setAnnotationWidth(value); if (selectedAnnotation) updateAnnotation(selectedAnnotation.id, { lineWidth: value }) }} /></label>
      <label>顏色<input aria-label="顏色" type="color" value={selectedAnnotation?.color || annotationColor} onChange={event => { setAnnotationColor(event.target.value); if (selectedAnnotation) updateAnnotation(selectedAnnotation.id, { color: event.target.value }) }} /></label>
      {(selectedAnnotation?.kind || tool) === 'text' && <label>文字大小<input aria-label="文字大小" type="range" min="10" max="72" value={selectedAnnotation?.fontSize ?? annotationFontSize} onChange={event => { const value = Number(event.target.value); setAnnotationFontSize(value); if (selectedAnnotation) updateAnnotation(selectedAnnotation.id, { fontSize: value }) }} /><output>{selectedAnnotation?.fontSize ?? annotationFontSize}</output></label>}
      {selectedAnnotation?.kind === 'text' && <label>文字<input value={selectedAnnotation.text || ''} onChange={event => updateAnnotation(selectedAnnotation.id, { text: event.target.value })} /></label>}
      {selectedAnnotation && <button className={styles.danger} onClick={() => { removeSelectedAnnotation(); setToolSettingsOpen(false) }}>刪除註記</button>}
    </section></div>}

    {sidebarOpen && current && <div className={styles.modalBackdrop} onClick={() => setSidebarOpen(false)}><section className={`${styles.manager} ${styles.pagePicker}`} role="dialog" aria-modal="true" aria-label="頁面快選與預覽" onClick={event => event.stopPropagation()}>
      <header><h2>頁面預覽</h2><button aria-label="關閉頁面預覽" onClick={() => setSidebarOpen(false)}>×</button></header>
      <form className={styles.pageJump} onSubmit={event => { event.preventDefault(); const value = Number(new FormData(event.currentTarget).get('page')); if (Number.isInteger(value) && value >= 1 && value <= current.pageCount) { setPage(value); setSidebarOpen(false) } }}>
        <label>前往頁數<input name="page" type="number" inputMode="numeric" min="1" max={current.pageCount} defaultValue={page} required /></label><span>/ {current.pageCount}</span><button className={styles.primary} type="submit">前往</button>
      </form>
      <div className={styles.previewGrid}>{pdf && Array.from({ length: current.pageCount }, (_, index) => <Thumbnail key={index + 1} pdf={pdf} page={index + 1} active={page === index + 1} onClick={() => { setPage(index + 1); setSidebarOpen(false) }} />)}</div>
    </section></div>}

    {markerDraft && <div className={styles.modalBackdrop} onClick={() => setMarkerDraft(null)}><section className={styles.markerEditor} onClick={event => event.stopPropagation()}>
      <header><div><p>ISSUE MARKER</p><h2>{markerDraft.id ? '編輯問題標記' : '新增問題標記'}</h2></div><button onClick={() => setMarkerDraft(null)}>×</button></header>
      <div className={styles.formGrid}>
        <label className={styles.full}>房間名稱<input value={markerDraft.roomName} onChange={event => setMarkerDraft(value => value && ({ ...value, roomName: event.target.value }))} placeholder="可留空或自行修正" /></label>
        {nearbyRooms.length > 0 && <div className={`${styles.roomSuggestions} ${styles.full}`}><small>附近文字（只作建議）</small>{nearbyRooms.map(room => <button key={room.id} onClick={() => setMarkerDraft(value => value && ({ ...value, roomName: room.text }))}>{room.text}</button>)}</div>}
        <label>工程類別<input list="drawing-categories" value={markerDraft.category} onChange={event => setMarkerDraft(value => value && ({ ...value, category: event.target.value }))} /><datalist id="drawing-categories">{categories.map(category => <option key={category} value={category} />)}</datalist></label>
        <label>報告裁剪範圍<input type="range" min="0.5" max="3" step="0.1" value={markerDraft.cropScale || 1} onChange={event => setMarkerDraft(value => value && ({ ...value, cropScale: Number(event.target.value) }))} /></label>
        {SMART_TAG_KEYS.map(key => <label key={key}>{key}<input list={`drawing-tag-${key}`} value={markerDraft.tags[key] || ''} onChange={event => setMarkerDraft(value => value && ({ ...value, tags: { ...value.tags, [key]: event.target.value } }))} placeholder="選擇或輸入自訂項目" /><datalist id={`drawing-tag-${key}`}>{(key === '位置' && markerDraft.tags['樓層'] ? smartTagOptions[`位置:${markerDraft.tags['樓層']}`] || smartTagOptions[key] : smartTagOptions[key] || []).map(option => <option key={option} value={option} />)}<option value="N/A" /></datalist></label>)}
        <label className={styles.full}>文字備註<textarea value={markerDraft.note} onChange={event => setMarkerDraft(value => value && ({ ...value, note: event.target.value }))} rows={3} /></label>
      </div>
      <div className={styles.photoLinks}><div><strong>已連結相片</strong><span>{markerDraft.photoIds.length} 張</span></div><div className={styles.linkedPhotos}>{markerDraft.photoIds.map(id => { const photo = photos.find(item => item.id === id); return <figure key={id}>{photo ? <img src={photo.src} alt={photo.category} /> : <span>相片遺失</span>}<button onClick={() => setMarkerDraft(value => value && ({ ...value, photoIds: value.photoIds.filter(photoId => photoId !== id) }))}>×</button></figure> })}</div><div className={styles.photoActions}><button onClick={() => onOpenCamera(photo => setMarkerDraft(value => value && ({ ...value, photoIds: value.photoIds.includes(photo.id) ? value.photoIds : [...value.photoIds, photo.id], category: photo.category || value.category, tags: { ...value.tags, ...photo.tags }, note: photo.note || value.note })), markerDraft.category)}><Camera />拍攝補充</button><button onClick={() => onSelectAlbumPhotos(ids => setMarkerDraft(value => value && ({ ...value, photoIds: [...new Set([...value.photoIds, ...ids])] })))}><Images />從相簿選取</button></div></div>
      <footer>{markerDraft.id ? <button className={styles.danger} onClick={deleteMarkerRecord}><Trash2 />刪除標記</button> : <span />}<div><button onClick={() => setMarkerDraft(null)}>取消</button><button className={styles.primary} onClick={saveMarker}>保存標記</button></div></footer>
    </section></div>}

    {managerOpen && <div className={styles.modalBackdrop} onClick={() => setManagerOpen(false)}><section className={styles.manager} onClick={event => event.stopPropagation()}><header><div><p>DRAWING LIBRARY</p><h2>管理圖紙</h2></div><button onClick={() => setManagerOpen(false)}>×</button></header><div className={styles.drawingList}>{drawings.map(drawing => <article key={drawing.id}><button onClick={() => void chooseDrawing(drawing.id)}><strong>{drawing.name}</strong><small>{drawing.fileName} · {drawing.pageCount} 頁 · {drawing.markers.length} 個標記</small></button><button className={styles.danger} onClick={() => void removeDrawing(drawing)}><Trash2 /></button></article>)}</div><button className={styles.primary} onClick={() => fileInputRef.current?.click()}><FilePlus2 />匯入新修訂版</button></section></div>}

    {importOpen && <div className={styles.modalBackdrop} onClick={() => setImportOpen(false)}><section className={styles.actionSheet} onClick={event => event.stopPropagation()}><header><h2>匯出與備份</h2><button onClick={() => setImportOpen(false)}>×</button></header><button onClick={exportMarkedPdf}><FileDown />匯出整份標記 PDF</button><button onClick={openIssueReport}><Download />預覽／匯出問題報告</button><button onClick={exportBackup}><FileArchive />匯出此 Project 圖紙 ZIP</button><button onClick={() => restoreInputRef.current?.click()}><FileArchive />新增還原圖紙 ZIP</button></section></div>}
    <input ref={restoreInputRef} hidden type="file" accept="application/zip,.zip" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void restoreBackup(file) }} />
    {notice && <div className={styles.notice} role="alert">{notice}<button onClick={() => setNotice('')}>×</button></div>}
  </main>
}
