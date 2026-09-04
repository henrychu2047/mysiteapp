'use client'

import { useEffect, useState } from 'react'

export function useAppStatus() {
  const [isOffline, setIsOffline] = useState(false)
  const [storageStatus, setStorageStatus] = useState('本機保存中')
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    navigator.storage?.persist?.().then(persisted => setStorageStatus(persisted ? '本機持久保存' : '本機保存中')).catch(() => undefined)
    const refreshStorage = () => navigator.storage?.estimate?.().then(result => {
      if (typeof result.usage === 'number' && typeof result.quota === 'number') setStorageUsage({ usage: result.usage, quota: result.quota })
    }).catch(() => undefined)
    refreshStorage()
    const timer = window.setInterval(refreshStorage, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js?v=22', { updateViaCache: 'none' }).then(registration => {
        const markUpdate = () => setUpdateAvailable(true)
        if (registration.waiting) markUpdate()
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (worker) worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) markUpdate() })
        })
      }).catch(() => undefined)
    }
    const updateOnlineState = () => setIsOffline(!navigator.onLine)
    updateOnlineState()
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => { window.removeEventListener('online', updateOnlineState); window.removeEventListener('offline', updateOnlineState) }
  }, [])

  const updateApp = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/sw.js')
      if (!registration) { alert('程式已更新'); window.location.reload(); return }
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
      if (registration.waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', () => { alert('程式已更新'); window.location.reload() }, { once: true })
      } else {
        await registration.update()
        alert('程式已更新')
        window.location.reload()
      }
    } catch (error) {
      alert(`更新失敗：${error instanceof Error ? error.message : '請稍後再試'}`)
    }
  }

  return { isOffline, storageStatus, storageUsage, updateAvailable, updateApp }
}
