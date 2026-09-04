'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomNav } from '@/components/ui/bottom-nav'
import { resolveAttachmentPhoto, type PhotoSource } from '@/lib/photo-attachments'

type NotebookEntry = { id: string; text: string; category: string; done: boolean; pinned: boolean; createdAt: string; photo?: string; photoId?: string }
type Props = {
  projectId: string
  projectName: string
  onBack: () => void
  onNavigate: (mode: 'home' | 'photo' | 'handover' | 'about') => void
  photoSources: Record<string, PhotoSource>
  onSelectAlbumPhotos: (onSelect: (photoIds: string[]) => void) => void
  onOpenCamera: (onCapture: (photoId: string) => void) => void
}

const categories = ['待辦', '問題', '進度', '交辦']
const keyFor = (projectId: string) => `site-notebook:${projectId || 'default-project'}`

export function Notebook({ projectId, projectName, onBack, onNavigate, photoSources, onSelectAlbumPhotos, onOpenCamera }: Props) {
  const [entries, setEntries] = useState<NotebookEntry[]>([])
  const [text, setText] = useState('')
  const [category, setCategory] = useState('待辦')
  const [filter, setFilter] = useState('全部')
  const [query, setQuery] = useState('')
  const [photoId, setPhotoId] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const loadedProjectRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(keyFor(projectId)) || '[]')
      setEntries(Array.isArray(saved) ? saved.map((entry: NotebookEntry) => ({ ...entry, photoId: typeof entry.photoId === 'string' ? entry.photoId : undefined, photo: typeof entry.photo === 'string' ? entry.photo : undefined })) : [])
    } catch { setEntries([]) }
    loadedProjectRef.current = projectId
  }, [projectId])

  useEffect(() => {
    if (loadedProjectRef.current === projectId) localStorage.setItem(keyFor(projectId), JSON.stringify(entries))
  }, [entries, projectId])

  const addEntry = () => {
    const value = text.trim()
    if (!value) return
    setEntries(current => [{ id: `${Date.now()}-${Math.random()}`, text: value, category, done: false, pinned: false, createdAt: new Date().toISOString(), photoId: photoId || undefined }, ...current])
    setText(''); setPhotoId(''); setShowCompose(false)
  }
  const toggle = (id: string, field: 'done' | 'pinned') => setEntries(current => current.map(entry => entry.id === id ? { ...entry, [field]: !entry[field] } : entry))
  const remove = (id: string) => { if (confirm('確定刪除此記事？')) setEntries(current => current.filter(entry => entry.id !== id)) }
  const visible = useMemo(() => entries.filter(entry => filter === '全部' || entry.category === filter).filter(entry => !query.trim() || entry.text.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [entries, filter, query])
  const pendingPhoto = resolveAttachmentPhoto(photoId, undefined, photoSources)

  return <div className="app-shell notebook-app">
    <header className="topbar"><div className="brand-mark" aria-hidden="true">▦</div><button className="project-trigger" type="button" onClick={onBack} aria-label="返回並選擇 Project"><strong>{projectName}</strong><span>⌄</span></button></header>
    <main className="notebook-body">
      <div className="section-heading"><div><p className="eyebrow">SITE NOTEBOOK</p><h2>記事簿</h2></div></div>
      {showCompose && <div className="notebook-modal-backdrop" onClick={() => setShowCompose(false)}><section className="notebook-compose notebook-modal" onClick={event => event.stopPropagation()}>
        <div className="notebook-modal-heading"><h2>新增記事</h2><button type="button" onClick={() => setShowCompose(false)}>×</button></div>
        <textarea value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') addEntry() }} placeholder="快速記錄現場事項…" aria-label="記事內容" />
        <div className="notebook-compose-row"><div className="notebook-compose-tools"><div className="notebook-category-quick-select" role="group" aria-label="記事分類快選">{categories.map(item => <button type="button" key={item} className={category === item ? 'chosen' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="notebook-media-actions"><button type="button" onClick={() => onSelectAlbumPhotos(ids => setPhotoId(ids[0] || ''))}>📎 從相簿選取</button><button type="button" onClick={() => onOpenCamera(setPhotoId)}>▣ 連續拍攝</button></div></div><button className="primary-button" type="button" onClick={addEntry}>新增記事</button></div>
        {photoId && (pendingPhoto ? <div className="notebook-photo-preview"><img src={pendingPhoto} alt="待附加相片" /><button type="button" onClick={() => setPhotoId('')}>移除相片</button></div> : <div className="attachment-unavailable">相片已從相簿移除</div>)}
        <small className="notebook-hint">Ctrl / ⌘ + Enter 可快速新增</small>
      </section></div>}
      <div className="notebook-tools"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋記事…" aria-label="搜尋記事" /><div className="notebook-filters"><button className={filter === '全部' ? 'chosen' : ''} onClick={() => setFilter('全部')}>全部</button>{categories.map(item => <button key={item} className={filter === item ? 'chosen' : ''} onClick={() => setFilter(item)}>{item}</button>)}<div className="notebook-actions"><button className="notebook-add-button" type="button" onClick={() => setShowCompose(true)}>＋ 新增</button><button className="notebook-camera-button" type="button" onClick={() => { setShowCompose(true); onOpenCamera(setPhotoId) }} aria-label="拍照"><span>▣</span> 拍照</button></div></div></div>
      <section className="notebook-list">{visible.map(entry => { const source = resolveAttachmentPhoto(entry.photoId, entry.photo, photoSources); return <article className={`notebook-entry ${entry.done ? 'is-done' : ''}`} key={entry.id}><div className="notebook-entry-main"><button className="notebook-check" onClick={() => toggle(entry.id, 'done')} aria-label={entry.done ? '標記未完成' : '標記完成'}>{entry.done ? '✓' : '○'}</button><div><div className="notebook-entry-meta"><span>{entry.category}</span><time>{new Date(entry.createdAt).toLocaleString('zh-HK', { hour12: false })}</time></div><p>{entry.text}</p>{source ? <img className="notebook-entry-photo" src={source} alt="記事相片" /> : entry.photoId ? <div className="attachment-unavailable">相片已從相簿移除</div> : null}</div></div><div className="notebook-entry-actions"><button onClick={() => toggle(entry.id, 'pinned')} aria-label={entry.pinned ? '取消置頂' : '置頂'}>{entry.pinned ? '★' : '☆'}</button><button onClick={() => remove(entry.id)} aria-label="刪除記事">×</button></div></article> })}{!visible.length && <div className="empty-state">尚未有記事<br /><small>在上方輸入現場事項即可快速建立</small></div>}</section>
    </main><BottomNav onNavigate={onNavigate} />
  </div>
}
