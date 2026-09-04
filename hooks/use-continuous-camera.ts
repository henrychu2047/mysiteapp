'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useContinuousCamera() {
  const [continuousCamera, setContinuousCamera] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [captureBusy, setCaptureBusy] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [flashEnabled, setFlashEnabled] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopContinuousCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setContinuousCamera(false)
  }, [])

  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()) }, [])

  useEffect(() => {
    if (!continuousCamera || !videoRef.current || !streamRef.current) return
    const video = videoRef.current
    video.srcObject = streamRef.current
    video.play().catch(error => console.error('[v0] video play failed:', error))
    return () => { video.pause(); video.srcObject = null }
  }, [continuousCamera])

  const startContinuousCamera = useCallback(async () => {
    if (!window.isSecureContext) { setCameraError('連續拍攝需要 HTTPS；目前網址不安全，請改用立即拍照或設定 HTTPS'); return }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('此瀏覽器不支援連續相機，請使用立即拍照'); return }
    try {
      setCameraError('')
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      setContinuousCamera(true)
    } catch (error) {
      console.error('[v0] camera start failed:', error)
      setCameraError('無法開啟鏡頭，請允許相機權限或改用立即拍照')
    }
  }, [])

  const applyCameraSettings = useCallback(async (nextFlash: boolean, nextZoom: number) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number } }
    const constraints: MediaTrackConstraintSet & { torch?: boolean; zoom?: number } = {}
    if (typeof capabilities.torch === 'boolean') constraints.torch = nextFlash
    if (capabilities.zoom) constraints.zoom = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, nextZoom))
    try { await track.applyConstraints({ advanced: [constraints] }) } catch (error) { console.error('[v0] camera settings failed:', error) }
  }, [])

  const toggleFlash = useCallback(async () => { const next = !flashEnabled; setFlashEnabled(next); await applyCameraSettings(next, zoomLevel) }, [applyCameraSettings, flashEnabled, zoomLevel])
  const changeZoom = useCallback(async (next: number) => { setZoomLevel(next); await applyCameraSettings(flashEnabled, next) }, [applyCameraSettings, flashEnabled])

  const capturePhoto = useCallback(async (onCapture: (file: File) => Promise<void>) => {
    if (captureBusy || !videoRef.current) return
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
      const context = canvas.getContext('2d'); if (!context) throw new Error('無法建立畫布')
      context.drawImage(video, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('無法擷取相片')), 'image/jpeg', 0.92))
      await onCapture(new File([blob], 'camera.jpg', { type: 'image/jpeg' }))
      setCameraError('')
      setCaptureMessage('已拍攝並儲存，可繼續拍攝')
      window.setTimeout(() => setCaptureMessage(''), 1800)
    } catch (error) {
      console.error('[v0] capture failed:', error)
      setCameraError('拍攝失敗，請稍候再試')
      setCaptureMessage('')
    } finally {
      setCaptureBusy(false)
    }
  }, [captureBusy])

  return { continuousCamera, cameraError, captureBusy, captureMessage, flashEnabled, zoomLevel, videoRef, startContinuousCamera, stopContinuousCamera, toggleFlash, changeZoom, capturePhoto, setCameraError, setCaptureMessage }
}
