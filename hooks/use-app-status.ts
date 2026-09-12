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
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
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
      const hasWaitingWorker = await new Promise<boolean>((resolve, reject) => {
        let settled = false
        let timeout = 0
        const finish = (value: boolean, error?: unknown) => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          registration.removeEventListener('updatefound', onUpdateFound)
          if (error) reject(error)
          else resolve(value)
        }
        const inspect = () => {
          if (registration.waiting) finish(true)
          else if (registration.installing?.state === 'redundant') finish(false)
        }
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return
          worker.addEventListener('statechange', inspect)
          inspect()
        }
        const onUpdateFound = () => watch(registration.installing)
        registration.addEventListener('updatefound', onUpdateFound)
        if (registration.waiting) finish(true)
        else {
          watch(registration.installing)
          registration.update().then(() => {
            if (registration.waiting) finish(true)
            else if (!registration.installing) finish(false)
          }).catch(error => finish(false, error))
          timeout = window.setTimeout(() => finish(false), 20000)
        }
      })
      if (hasWaitingWorker && registration.waiting) {
        const controllerChanged = new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('新版本啟用逾時')), 10000)
          navigator.serviceWorker.addEventListener('controllerchange', () => { window.clearTimeout(timeout); resolve() }, { once: true })
        })
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        await controllerChanged
        alert('程式已更新')
        window.location.reload()
      } else alert('目前已是最新版本')
    } catch (error) {
      alert(`更新失敗：${error instanceof Error ? error.message : '請稍後再試'}`)
    }
  }

  return { isOffline, storageStatus, storageUsage, updateAvailable, updateApp }
}
