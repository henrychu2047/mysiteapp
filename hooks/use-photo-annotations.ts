'use client'

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Photo, PhotoAnnotation } from '@/lib/photo-storage'

type DrawingPoint = { x: number; y: number }
type EditMode = 'text' | 'marker' | 'draw' | null

export function usePhotoAnnotations() {
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false)
  const [photoEditMode, setPhotoEditMode] = useState<EditMode>(null)
  const [photoDrawing, setPhotoDrawing] = useState<DrawingPoint[]>([])
  const drawingRef = useRef<DrawingPoint[]>([])

  const resetEditor = () => {
    drawingRef.current = []
    setPhotoEditorOpen(false)
    setPhotoEditMode(null)
    setPhotoDrawing([])
  }

  const openPhotoEditor = () => {
    setPhotoEditorOpen(true)
    setPhotoEditMode(null)
    setPhotoDrawing([])
  }

  const photoPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
  }

  const photoPointerDown = (event: ReactPointerEvent<HTMLDivElement>, detail: Photo | null, setDetail: (photo: Photo) => void) => {
    if (!photoEditorOpen || !detail) return
    const point = photoPoint(event)
    const annotations = Array.isArray(detail.annotations) ? detail.annotations : []
    if (photoEditMode === 'marker') { event.preventDefault(); setDetail({ ...detail, annotations: [...annotations, { kind: 'marker', x: point.x, y: point.y }] }); return }
    if (photoEditMode === 'text') {
      event.preventDefault()
      const text = prompt('輸入相片註記文字')
      if (text?.trim()) setDetail({ ...detail, annotations: [...annotations, { kind: 'text', x: point.x, y: point.y, text: text.trim() }] })
      setPhotoEditMode(null)
      return
    }
    if (photoEditMode !== 'draw') return
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
    drawingRef.current = [point]
    setPhotoDrawing([point])
  }

  const photoPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (photoEditMode !== 'draw' || !drawingRef.current.length) return
    event.preventDefault()
    if (drawingRef.current.length >= 800) return
    const next = [...drawingRef.current, photoPoint(event)]
    drawingRef.current = next
    setPhotoDrawing(next)
  }

  const photoPointerUp = (event: ReactPointerEvent<HTMLDivElement>, detail: Photo | null, setDetail: (photo: Photo) => void) => {
    if (photoEditMode === 'draw' && detail && drawingRef.current.length > 1) {
      const annotation: PhotoAnnotation = { kind: 'draw', x: 0, y: 0, points: drawingRef.current }
      setDetail({ ...detail, annotations: [...(Array.isArray(detail.annotations) ? detail.annotations : []), annotation] })
    }
    drawingRef.current = []
    setPhotoDrawing([])
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }

  const cancelDrawing = () => { drawingRef.current = []; setPhotoDrawing([]) }

  return { photoEditorOpen, photoEditMode, photoDrawing, setPhotoEditMode, openPhotoEditor, resetEditor, photoPointerDown, photoPointerMove, photoPointerUp, cancelDrawing }
}
