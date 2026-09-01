'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Users,
  FileText,
  Camera,
  Paperclip,
  Boxes,
  PenLine,
  Eye,
  Download,
  History,
  Sparkles,
  Trash2,
  Printer,
  Copy,
  Upload,
  Pencil,
  ClipboardList,
  Home,
  Images,
  Building2,
  Info,
} from 'lucide-react'
import {
  type Memo,
  type HistoryRecord,
  type MemoPhoto,
  type MemoPdfAttachment,
  type MemoLetterhead,
  PHOTO_QUICK_TAGS,
  createDefaultMemo,
  loadMemo,
  saveMemo,
  loadHistory,
  saveHistory,
  loadLetterheads,
  saveLetterheads,
  clone,
  readFileAsDataUrl,
  formatBytes,
  nowStamp,
  renderPdfToPages,
} from './memo-data'
import { MemoDocument } from './memo-document'

type ModalId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | null

type AppMode = 'home' | 'photo' | 'memo' | 'handover' | 'reserve' | 'about' | 'backup'

type PhraseGroup = '動態變數' | '角色對象' | '事由依據' | '現場狀況與問題' | '要求行動' | '影響與後果預警' | '索償與免責聲明' | '附件與結語'

const FIXED_LIABILITY_PHRASE = /若因\s*貴司\s*或\s*貴司之分判\s*[,，]?\s*疏忽而導致任何索償\s*[,，、]?\s*損失\s*[,，、]?\s*工程延誤或其他後果\s*[,，、]?\s*以及設備損壞所引致之維修或更換費用\s*[,，、]?\s*本公司保留追究權利\s*[。.]?/g
const removeFixedLiabilityPhrase = (value: string) => value.replace(new RegExp(FIXED_LIABILITY_PHRASE.source, 'g'), '').replace(/\n{3,}/g, '\n\n').trim()

const SITE_MEMO_PHRASES: Record<PhraseGroup, string[]> = {
  動態變數: ['📍 地點名', '⚙️ 設備名', '📅 日期', '⏳ 限期日期', '合約/項目編號', '圖則編號', '樓層/區域'],
  角色對象: ['本公司', '本司', '我司', '貴司', '貴公司', '貴司之分判', '判頭', '打理', '駐地盤員工', '總承建商(大判)', '建築師(側師)', '設計師', '機電顧問', '駐地盤工程師(RE)'],
  事由依據: ['根據', '近日', '收到', '發出', '電郵', '口頭通知', '書面指示', '地盤協調會議紀錄', '日常巡查時', '聯合巡查發現', '經檢查後', '經測試後', '最新批核圖則', '協調圖(CSD/CBWD)', '合約規格要求', '相關資料/文件'],
  現場狀況與問題: ['現場環境', '已安裝的', '額外的', '與設計不符', '與設計有差異', '與批核圖則不一致', '資料錯誤', '尺寸不合', '受到阻礙', '受到破壞', '遭受撞毀', '設備損壞', '保護層被擅自拆除', '結構開窿偏差', '預埋管受阻', '未能安裝', '未能移交', '通道受阻', '現場堆放雜物/廢料', '天花未完工', '牆身未交場', '現場積水/滲水', '缺乏工作平台', '未預留維修空間', '進度緩慢', '工序重疊衝突', '疏忽'],
  要求行動: ['謹通知', '特此通知', '懇請', '要求', '指示', '請貴司', '盡快', '即時', '限於日期前', '立即停止相關工序', '完成相關事項', '完成上述工作', '移交相關位置給我司', '重新開放工作面', '妥善清理現場雜物', '修復受損部分', '補做保護措施', '提交補救方案', '安排聯合驗收', '重新覆核尺寸', '積極配合'],
  影響與後果預警: ['以免延誤', '延誤機電安裝進度', '影響整體交付時間', '嚴重拖延總工程進度', '未能按照進度進行測試', '未能按照計劃完工', '影響其後的測試及調試工作(T&C)', '影響法定驗收進度(FSD/OP)', '造成本司工人窩工', '衍生額外吊運/倉存成本', '造成後續工種連鎖延誤'],
  索償與免責聲明: ['本公司保留追究權利', '保留申請工期延長(EOT)', '保留追討直接及間接經濟損失', '若因貴司或分判疏忽', '若因非本司原因引致', '本公司不會負上相關責任', '貴司全權承擔一切責任', '設備損壞引致之維修更換費用', '相關款項將於貴司期款中全數扣除'],
  附件與結語: ['現附上相關相片以作參考及記錄', '隨函附上位置圖則', '相關資料供貴司施工', '如有疑問請與本司員工聯絡', '敬請儘速回覆並回簽確認', '耑此函達', '敬請垂注'],
}

export function SiteMemo({ onBack, onNavigate, onOpenMachineData, onOpenMachineDataManage, projectId, projectName, isRegistered }: { onBack: () => void; onNavigate: (mode: AppMode) => void; onOpenMachineData: () => void; onOpenMachineDataManage?: () => void; projectId: string; projectName: string; isRegistered: boolean }) {
  const [memo, setMemo] = useState<Memo>(createDefaultMemo)
  const [letterheads, setLetterheads] = useState<MemoLetterhead[]>([])
  const [letterheadName, setLetterheadName] = useState('')
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [letterheadBusy, setLetterheadBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [modal, setModal] = useState<ModalId>(null)
  const [overlay, setOverlay] = useState<'preview' | 'export' | 'history' | null>(null)
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [previewingHistory, setPreviewingHistory] = useState<HistoryRecord | null>(null)
  const [polishing, setPolishing] = useState(false)
  const [customPhrases, setCustomPhrases] = useState<Record<PhraseGroup, string[]>>({ 動態變數: [], 角色對象: [], 事由依據: [], 現場狀況與問題: [], 要求行動: [], 影響與後果預警: [], 索償與免責聲明: [], 附件與結語: [] })
  const [newPhrase, setNewPhrase] = useState('')
  const [newPhraseGroup, setNewPhraseGroup] = useState<PhraseGroup>('現場狀況與問題')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pendingExport, setPendingExport] = useState<{ memo: Memo; fileName: string } | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saveToast, setSaveToast] = useState('')
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setMemo(createDefaultMemo())
    setHistory([])
    setLetterheads([])
    Promise.all([loadMemo(projectId), loadHistory(projectId), loadLetterheads(projectId)]).then(([storedMemo, storedHistory, storedLetterheads]) => {
      if (cancelled) return
      if (storedMemo) {
        const cleanedLegalClause = removeFixedLiabilityPhrase((storedMemo.legalClause || '')
          .replace(/請貴司盡快完成上述工作\s*[,，]?\s*以免延誤相關機電安裝進度\s*[,，]?\s*更會影響整交付時間[。.]?/g, ''))
        setMemo({
          ...createDefaultMemo(),
          ...storedMemo,
          roughInput: removeFixedLiabilityPhrase(storedMemo.roughInput || ''),
          legalClause: cleanedLegalClause,
          letterheadId: storedMemo.letterheadId || '',
        })
      }
      setHistory(storedHistory)
      setLetterheads(storedLetterheads)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!ready) return
    setSaveState('saving')
    Promise.all([saveMemo(projectId, memo), saveHistory(projectId, history), saveLetterheads(projectId, letterheads)]).then(() => {
      setSaveState('saved')
      setLastSavedAt(new Date().toISOString())
    }).catch(error => {
      console.error('Site Memo 保存失敗:', error)
      setSaveState('error')
      setSaveToast('Site Memo 保存失敗，請檢查裝置儲存空間')
      window.setTimeout(() => setSaveToast(''), 4000)
    })
  }, [memo, history, letterheads, projectId, ready])

  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (saveState !== 'saved') {
        event.preventDefault()
        event.returnValue = '資料尚未保存，確定要離開嗎？'
      }
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [saveState])

  const update = (partial: Partial<Memo>) => setMemo(current => ({
    ...current,
    ...partial,
    roughInput: partial.roughInput === undefined ? current.roughInput : removeFixedLiabilityPhrase(partial.roughInput),
    legalClause: partial.legalClause === undefined ? current.legalClause : removeFixedLiabilityPhrase(partial.legalClause),
  }))
  const updateRecipient = (partial: Partial<Memo['recipient']>) =>
    setMemo(current => ({ ...current, recipient: { ...current.recipient, ...partial } }))
  const updateSender = (partial: Partial<Memo['sender']>) =>
    setMemo(current => ({ ...current, sender: { ...current.sender, ...partial } }))
  const updateSpare = (partial: Partial<Memo['spareModule']>) =>
    setMemo(current => ({ ...current, spareModule: { ...current.spareModule, ...partial } }))

  async function addLetterhead(files: FileList | null) {
    if (!files?.[0] || !isRegistered) return
    setLetterheadBusy(true)
    try {
      const file = files[0]
      const sourceDataUrl = await readFileAsDataUrl(file)
      const dataUrl = file.type === 'application/pdf' ? (await renderPdfToPages(sourceDataUrl))[0]?.imageUrl : sourceDataUrl
      if (!dataUrl) throw new Error('信紙 PDF 沒有可用頁面')
      const letterhead: MemoLetterhead = { id: `L-${Date.now()}`, name: letterheadName.trim() || file.name.replace(/\.pdf$/i, ''), dataUrl }
      setLetterheads(current => [...current, letterhead])
      setMemo(current => ({ ...current, letterheadId: letterhead.id }))
      setLetterheadName('')
    } catch {
      alert('信紙上載失敗，請確認檔案格式')
    } finally {
      setLetterheadBusy(false)
    }
  }

  const snapshot = (action: string) => {
    const record: HistoryRecord = { recordId: `H-${Date.now()}`, savedAt: nowStamp(), action, memo: clone(memo) }
    setHistory(current => [record, ...current])
  }

  const appendQuickPhrase = (phrase: string) => {
    update({ roughInput: memo.roughInput ? `${memo.roughInput.replace(/\s+$/, '')} ${phrase}` : phrase })
  }

  const addCustomPhrase = () => {
    const phrase = newPhrase.trim()
    if (!phrase) return
    setCustomPhrases(current => ({ ...current, [newPhraseGroup]: [...current[newPhraseGroup], phrase] }))
    setNewPhrase('')
  }

  const deleteCustomPhrase = (group: PhraseGroup, phrase: string) => {
    setCustomPhrases(current => ({ ...current, [group]: current[group].filter(item => item !== phrase) }))
  }

  const clearMemoInput = () => {
    update({ roughInput: '', items: [] })
  }

  const insertMemoLineBreak = () => update({ roughInput: `${memo.roughInput.replace(/\s+$/, '')}\n` })

  function localPolish(input: string) {
    const lines = input.split(/\n+/).map(line => line.trim()).filter(Boolean)
    const start = lines.find(line => /^(經近日|收到貴司|根據本司|經近日檢查)/.test(line)) || '經近日巡查發現，'
    const endings = lines.filter(line => /^(要求|供貴司|本公司保留|若因貴司|貴司盡快)/.test(line))
    const content = lines
      .filter(line => line !== start && !endings.includes(line))
      .map(line => line.replace(/^[\d.、\-\s]+/, '').replace(/[，。；]+$/, '').trim())
      .filter(Boolean)
    const body = content.length
      ? `現場${content.join('；')}。上述情況已對相關機電安裝工作造成阻礙，並可能影響後續測試、調試及整體交付進度。`
      : '現場相關工作仍未完成，已對機電安裝工作造成阻礙，並可能影響後續測試、調試及整體交付進度。'
    const closing = endings.length ? endings.map(line => line.replace(/[，。；]+$/, '') + '。') : ['請貴司盡快跟進及完成上述工作。']
    return [start.replace(/[，。；]+$/, '') + '，', body, ...closing].join('\n\n')
  }

  async function polishItems() {
    const input = memo.roughInput.trim()
    if (!input || polishing) return

    setPolishing(true)
    try {
      const response = await fetch('/api/memo-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roughInput: input }),
      })
      const data = await response.json()
      if (!response.ok || typeof data.text !== 'string' || !data.text.trim()) {
        throw new Error(data.error || 'AI 潤色失敗')
      }
      const serverResult = data.text.trim()
      update({ roughInput: serverResult, items: [serverResult] })
    } catch (error) {
      alert(error instanceof Error ? `AI 潤色失敗：${error.message}` : 'AI 潤色失敗，請檢查 AI 設定')
    } finally {
      setPolishing(false)
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const additions: MemoPhoto[] = []
    for (const file of Array.from(files)) {
      const previewUrl = await readFileAsDataUrl(file)
      additions.push({ id: `P-${Date.now()}-${additions.length}`, name: file.name, tag: '', time: nowStamp(), customNote: '', previewUrl })
    }
    setMemo(current => ({ ...current, photos: [...current.photos, ...additions] }))
  }

  async function addPdf(files: FileList | null) {
    if (!files || !files[0]) return
    const file = files[0]
    setPdfBusy(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const pages = await renderPdfToPages(dataUrl)
      const attachment: MemoPdfAttachment = {
        id: `A-${Date.now()}`,
        title: file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        dwgNo: '',
        size: formatBytes(file.size),
        dataUrl,
        pages,
        totalPages: pages.length,
        note: '',
      }
      setMemo(current => ({ ...current, pdfAttachments: [...current.pdfAttachments, attachment] }))
    } catch {
      alert('PDF 解析失敗，請確認檔案格式')
    } finally {
      setPdfBusy(false)
    }
  }

  // Export any memo to PDF via html2pdf.js using the hidden render target.
  useEffect(() => {
    if (!pendingExport || !exportRef.current) return
    const exportTarget = exportRef.current
    let cancelled = false
    const run = async () => {
      const html2pdf = (await import('html2pdf.js')).default
      await new Promise(resolve => setTimeout(resolve, 120))
      if (cancelled) return
      await html2pdf()
        .set({
          margin: 0,
          filename: pendingExport.fileName,
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(exportTarget)
        .save()
      if (!cancelled) setPendingExport(null)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pendingExport])

  const exportPdf = (target: Memo) => {
    snapshot('下載 PDF')
    setOverlay(null)
    setPendingExport({ memo: target, fileName: `Site_Memo_${target.refNo}.pdf` })
  }

  const memoAsText = (target: Memo) => {
    const lines = [
      `${target.sender.jvName}`,
      `Date: ${target.date}　Our Ref: ${target.refNo}　${target.delivery}`,
      '',
      `${target.recipient.company}`,
      ...target.recipient.addressLines,
      `Attn: ${target.recipient.attn}`,
      '',
      'Dear Sir/Madam,',
      `${target.sender.contractNo}`,
      `${target.sender.projectTitle}`,
      `${target.sender.substationTitle}`,
      '',
      target.subject,
      '',
      target.roughInput,
      '',
      target.legalClause,
      '',
      'Yours faithfully,',
      target.sender.jvName,
      target.sender.signerName,
      target.sender.signerRole,
    ]
    return lines.join('\n')
  }

  const copyText = (target: Memo) => {
    snapshot('複製文字')
    navigator.clipboard?.writeText(memoAsText(target)).then(
      () => alert('公函文字已複製'),
      () => alert('複製失敗'),
    )
    setOverlay(null)
  }

  const printMemo = () => {
    snapshot('列印')
    setOverlay(null)
    setOverlay('preview')
    setTimeout(() => window.print(), 200)
  }

  const selectedLetterhead = letterheads.find(item => item.id === memo.letterheadId)

  const cards = [
    { id: 1 as const, icon: Users, title: '收件人', hint: memo.recipient.company },
    { id: 2 as const, icon: FileText, title: '內容與事件', hint: memo.roughInput ? '已輸入 Site Memo 內容' : '尚未輸入內容' },
    { id: 3 as const, icon: Camera, title: '巡查照片', hint: `${memo.photos.length} 張` },
    { id: 4 as const, icon: Paperclip, title: '附件', hint: `${memo.pdfAttachments.length} 份圖紙` },
    { id: 5 as const, icon: Boxes, title: '備用槽', hint: `EOT ${memo.spareModule.delayDays} 日` },
    { id: 6 as const, icon: PenLine, title: '發件人資料', hint: memo.signature ? '已簽名' : '未簽名' },
    { id: 7 as const, icon: FileText, title: '信紙', hint: isRegistered ? (letterheads.find(item => item.id === memo.letterheadId)?.name || '未選擇') : '註冊版專有功能' },
  ]

  return (
    <div className="app-shell memo-app">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">▦</div>
        <button className="project-trigger" onClick={onBack} aria-label="返回並選擇 Project">
          <strong>{projectName}</strong><span>⌄</span>
        </button>
      </header>

      <main className="memo-body">
        <div className="memo-heading">
          <p className="eyebrow">SITE MEMO CONFIGURATION</p>
          <h2>公函六大方格配置</h2>
          <p className="memo-save-status" role="status">{saveState === 'saving' ? '正在保存…' : saveState === 'error' ? '保存失敗' : lastSavedAt ? `已保存 ${new Date(lastSavedAt).toLocaleString('zh-HK', { hour12: false })}` : '已保存'}</p>
        </div>

        <div className="memo-grid">
          {cards.map(card => {
            const Icon = card.icon
            return (
              <button key={card.id} className="memo-card" disabled={card.id === 7 && !isRegistered} onClick={() => setModal(card.id)}>
                <Icon size={26} className="memo-card-icon" />
                <strong>{card.title}</strong>
                <span>{card.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="memo-op-grid">
          <button className="memo-op-card" onClick={() => setOverlay('preview')}>
            <Eye size={24} className="memo-card-icon" />
            <strong>即時預覽</strong>
            <span>A4 直身公函</span>
          </button>
          <button className="memo-op-card" onClick={() => setOverlay('export')}>
            <Download size={24} className="memo-card-icon" />
            <strong>導出 PDF</strong>
            <span>列印或複製</span>
          </button>
          <button className="memo-op-card" onClick={() => setOverlay('history')}>
            <History size={24} className="memo-card-icon" />
            <strong>出函記錄</strong>
            <span>{history.length} 份快照</span>
          </button>
        </div>
      </main>
      {saveToast && <div className="memo-save-toast" role="alert">{saveToast}</div>}

      <nav className="bottom-nav main-nav">
        <button onClick={() => onNavigate('home')}><span><Home size={20} /></span>首頁</button>
        <button onClick={() => onNavigate('photo')}><span><Images size={20} /></span>相簿</button>
        <button onClick={() => (onOpenMachineDataManage ? onOpenMachineDataManage() : onNavigate('handover'))}><span><Building2 size={20} /></span>機房資料</button>
        <button onClick={() => onNavigate('about')}><span><Info size={20} /></span>資料</button>
      </nav>

      {modal === 1 && (
        <MemoModal title="收件人" onClose={() => setModal(null)}>
          <Field label="收件公司">
            <input value={memo.recipient.company} onChange={e => updateRecipient({ company: e.target.value })} />
          </Field>
          <Field label="分行地址 (每行一條)">
            <textarea
              rows={3}
              value={memo.recipient.addressLines.join('\n')}
              onChange={e => updateRecipient({ addressLines: e.target.value.split('\n') })}
            />
          </Field>
          <Field label="受文人 (Attn)">
            <input value={memo.recipient.attn} onChange={e => updateRecipient({ attn: e.target.value })} />
          </Field>
          <Field label="傳送方式">
            <input value={memo.delivery} onChange={e => update({ delivery: e.target.value })} />
          </Field>
          <Field label="電郵">
            <input value={memo.recipient.email} onChange={e => updateRecipient({ email: e.target.value })} />
          </Field>
        </MemoModal>
      )}

      {modal === 2 && (
        <MemoModal title="內容與事件" className="memo-quick-generator" onClose={() => setModal(null)}>
          <Field label="Site Memo 內容">
            <textarea className="memo-rough-input" rows={8} placeholder="按下方快選詞語快速輸入，按 Enter 換行" value={memo.roughInput} onChange={e => update({ roughInput: e.target.value })} />
          </Field>
          <div className="memo-quick-groups memo-quick-scroll">
            {(Object.keys(SITE_MEMO_PHRASES) as PhraseGroup[]).map(group => (
              <div className="memo-quick-group" key={group}>
                <strong>▼ {group}</strong>
                <div>{[...SITE_MEMO_PHRASES[group], ...customPhrases[group]].map((phrase, index) => <PhraseButton key={`${phrase}-${index}`} phrase={phrase} custom={index >= SITE_MEMO_PHRASES[group].length} onAdd={appendQuickPhrase} onDelete={() => deleteCustomPhrase(group, phrase)} />)}</div>
              </div>
            ))}
          </div>
          <div className="memo-custom-phrase-form">
            <select value={newPhraseGroup} onChange={e => setNewPhraseGroup(e.target.value as PhraseGroup)}>{(Object.keys(SITE_MEMO_PHRASES) as PhraseGroup[]).map(group => <option key={group} value={group}>{group}</option>)}</select>
            <input value={newPhrase} onChange={e => setNewPhrase(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPhrase() } }} placeholder="新增字詞或句子" />
            <button type="button" onClick={addCustomPhrase}>新增</button>
          </div>
          <div className="memo-action-row">
            <button className="memo-ai-btn" onClick={polishItems} disabled={polishing || !memo.roughInput.trim()}><Sparkles size={18} />{polishing ? 'AI 優化中…' : 'AI 優化'}</button>
            <button type="button" className="memo-enter-btn" onClick={insertMemoLineBreak}>隔行</button>
            <button type="button" className="memo-clear-btn" onClick={clearMemoInput}>清空</button>
          </div>
        </MemoModal>
      )}

      {modal === 3 && (
        <MemoModal title="巡查照片" onClose={() => setModal(null)}>
          <label className="memo-upload">
            <Upload size={18} />
            上載相片
            <input type="file" accept="image/*" multiple hidden onChange={e => addPhotos(e.target.files)} />
          </label>
          {memo.photos.map(photo => (
            <div className="memo-photo-edit" key={photo.id}>
              <img src={photo.previewUrl || '/placeholder.svg'} alt={photo.name} />
              <div className="memo-photo-tags">
                {PHOTO_QUICK_TAGS.map(tag => (
                  <button
                    key={tag}
                    className={photo.tag === tag ? 'active' : ''}
                    onClick={() => setMemo(c => ({ ...c, photos: c.photos.map(p => (p.id === photo.id ? { ...p, tag } : p)) }))}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <input
                placeholder="補充說明"
                value={photo.customNote}
                onChange={e => setMemo(c => ({ ...c, photos: c.photos.map(p => (p.id === photo.id ? { ...p, customNote: e.target.value } : p)) }))}
              />
              <button className="memo-photo-del" onClick={() => setMemo(c => ({ ...c, photos: c.photos.filter(p => p.id !== photo.id) }))}>
                <Trash2 size={15} />
                移除此相
              </button>
            </div>
          ))}
        </MemoModal>
      )}

      {modal === 4 && (
        <MemoModal title="附件圖紙" onClose={() => setModal(null)}>
          <label className="memo-upload">
            <Upload size={18} />
            {pdfBusy ? 'PDF 解析中…' : '上載 PDF 圖紙'}
            <input type="file" accept="application/pdf" hidden disabled={pdfBusy} onChange={e => addPdf(e.target.files)} />
          </label>
          {memo.pdfAttachments.map(attachment => (
            <div className="memo-attach-edit" key={attachment.id}>
              <div className="memo-attach-meta">
                <strong>{attachment.fileName}</strong>
                <span>
                  {attachment.size}・{attachment.totalPages} 頁
                </span>
              </div>
              <input
                placeholder="圖紙編號 (DWG No.)"
                value={attachment.dwgNo}
                onChange={e =>
                  setMemo(c => ({ ...c, pdfAttachments: c.pdfAttachments.map(a => (a.id === attachment.id ? { ...a, dwgNo: e.target.value } : a)) }))
                }
              />
              <div className="memo-attach-thumbs">
                {attachment.pages.map(page => (
                  <img key={page.pageNumber} src={page.imageUrl || '/placeholder.svg'} alt={`第 ${page.pageNumber} 頁`} onClick={() => setZoomImage(page.imageUrl)} />
                ))}
              </div>
              <button className="memo-photo-del" onClick={() => setMemo(c => ({ ...c, pdfAttachments: c.pdfAttachments.filter(a => a.id !== attachment.id) }))}>
                <Trash2 size={15} />
                移除此附件
              </button>
            </div>
          ))}
        </MemoModal>
      )}

      {modal === 5 && (
        <MemoModal title={memo.spareModule.title} onClose={() => setModal(null)}>
          <Field label="工期延誤天數 (EOT)">
            <input
              type="number"
              value={memo.spareModule.delayDays}
              onChange={e => updateSpare({ delayDays: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="關鍵路徑描述">
            <textarea rows={3} value={memo.spareModule.criticalPath} onChange={e => updateSpare({ criticalPath: e.target.value })} />
          </Field>
          <Field label="備註">
            <textarea rows={3} value={memo.spareModule.notes} onChange={e => updateSpare({ notes: e.target.value })} />
          </Field>
        </MemoModal>
      )}

      {modal === 7 && isRegistered && (
        <MemoModal title="信紙（註冊版專有功能）" onClose={() => setModal(null)}>
          <Field label="信紙名稱（可選）">
            <input value={letterheadName} onChange={e => setLetterheadName(e.target.value)} placeholder="例如：公司正式信紙" />
          </Field>
          <label className="memo-upload">
            <Upload size={18} />
            {letterheadBusy ? '上載中…' : '上載 A4 信紙（PDF 或圖片）'}
            <input type="file" accept="application/pdf,image/*" hidden disabled={letterheadBusy} onChange={e => addLetterhead(e.target.files)} />
          </label>
          <p className="memo-empty">如沒有上載信紙，請在「發件人資料」內手動輸入公司名稱、地址、電話、傳真及電郵，文件會自動顯示。</p>
          {letterheads.map(letterhead => (
            <div className="memo-letterhead-row" key={letterhead.id}>
              <button className={memo.letterheadId === letterhead.id ? 'active' : ''} onClick={() => update({ letterheadId: letterhead.id })}>
                <img src={letterhead.dataUrl} alt={letterhead.name} />
                <span>{letterhead.name}{memo.letterheadId === letterhead.id ? '（目前使用）' : ''}</span>
              </button>
              <button className="memo-photo-del" onClick={() => { setLetterheads(current => current.filter(item => item.id !== letterhead.id)); if (memo.letterheadId === letterhead.id) update({ letterheadId: '' }) }}>
                <Trash2 size={15} />
                刪除
              </button>
            </div>
          ))}
        </MemoModal>
      )}

      {modal === 6 && (
        <MemoModal title="發件人資料" onClose={() => setModal(null)}>
          <Field label="JV／公司名稱（沒有上載信紙時會顯示）">
            <input value={memo.sender.jvName} onChange={e => updateSender({ jvName: e.target.value })} />
          </Field>
          <Field label="公司地址（沒有上載信紙時會顯示）">
            <textarea rows={2} value={memo.sender.address} onChange={e => updateSender({ address: e.target.value })} />
          </Field>
          <Field label="電話">
            <input value={memo.sender.tel} onChange={e => updateSender({ tel: e.target.value })} />
          </Field>
          <Field label="傳真">
            <input value={memo.sender.fax} onChange={e => updateSender({ fax: e.target.value })} />
          </Field>
          <Field label="公司電郵">
            <input type="email" value={memo.sender.email} onChange={e => updateSender({ email: e.target.value })} />
          </Field>
          <Field label="項目經理姓名">
            <input value={memo.sender.signerName} onChange={e => updateSender({ signerName: e.target.value })} />
          </Field>
          <Field label="職位">
            <input value={memo.sender.signerRole} onChange={e => updateSender({ signerRole: e.target.value })} />
          </Field>
          <Field label="合約編號">
            <input value={memo.sender.contractNo} onChange={e => updateSender({ contractNo: e.target.value })} />
          </Field>
          <Field label="工程名稱">
            <input value={memo.sender.projectTitle} onChange={e => updateSender({ projectTitle: e.target.value })} />
          </Field>
          <Field label="變電站／工程位置">
            <input value={memo.sender.substationTitle} onChange={e => updateSender({ substationTitle: e.target.value })} />
          </Field>
          <Field label="電子手寫簽名">
            <SignaturePad value={memo.signature} onChange={signature => update({ signature })} />
          </Field>
        </MemoModal>
      )}

      {overlay === 'export' && (
        <MemoModal title="導出 PDF" onClose={() => setOverlay(null)}>
          <button className="memo-menu-btn" onClick={() => exportPdf(memo)}>
            <Download size={18} />
            一鍵下載標準 A4 直身 PDF
          </button>
          <button className="memo-menu-btn" onClick={printMemo}>
            <Printer size={18} />
            系統列印
          </button>
          <button className="memo-menu-btn" onClick={() => copyText(memo)}>
            <Copy size={18} />
            複製公函文字
          </button>
        </MemoModal>
      )}

      {overlay === 'history' && (
        <MemoModal title="出函記錄" onClose={() => setOverlay(null)}>
          {history.length === 0 && <p className="memo-empty">尚無出函記錄。下載、列印或複製公函時會自動存檔。</p>}
          {history.map(record => (
            <div className="memo-history-row" key={record.recordId}>
              <div className="memo-history-meta">
                <strong>{record.memo.refNo}</strong>
                <span>
                  {record.savedAt}・{record.action}
                </span>
              </div>
              <div className="memo-history-actions">
                <button onClick={() => setPreviewingHistory(record)} aria-label="預覽記錄">
                  <Eye size={16} />
                </button>
                <button onClick={() => exportPdf(record.memo)} aria-label="下載 PDF">
                  <Download size={16} />
                </button>
                <button
                  onClick={() => {
                    setMemo(clone(record.memo))
                    setOverlay(null)
                    alert('已載入此記錄至配置台')
                  }}
                  aria-label="載入"
                >
                  <Pencil size={16} />
                </button>
                <button onClick={() => setHistory(current => current.filter(r => r.recordId !== record.recordId))} aria-label="刪除">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </MemoModal>
      )}

      {overlay === 'preview' && (
        <div className="memo-preview-overlay">
          <div className="memo-preview-bar">
            <button onClick={() => setOverlay(null)}>
              <X size={20} />
            </button>
            <span>A4 直身預覽</span>
            <button onClick={() => exportPdf(memo)}>
              <Download size={18} />
            </button>
          </div>
          <div className="memo-preview-scroll">
            <MemoDocument memo={memo} letterhead={selectedLetterhead} onZoomImage={setZoomImage} />
          </div>
        </div>
      )}

      {previewingHistory && (
        <div className="memo-preview-overlay">
          <div className="memo-preview-bar">
            <button onClick={() => setPreviewingHistory(null)}>
              <X size={20} />
            </button>
            <span>記錄預覽・{previewingHistory.memo.refNo}</span>
            <button onClick={() => exportPdf(previewingHistory.memo)}>
              <Download size={18} />
            </button>
          </div>
          <div className="memo-preview-scroll">
            <MemoDocument memo={previewingHistory.memo} letterhead={letterheads.find(item => item.id === previewingHistory.memo.letterheadId)} onZoomImage={setZoomImage} />
          </div>
        </div>
      )}

      {zoomImage && (
        <div className="memo-zoom" onClick={() => setZoomImage(null)}>
          <img src={zoomImage || '/placeholder.svg'} alt="放大圖紙" />
        </div>
      )}

      <div className="memo-export-target" aria-hidden>
        <div ref={exportRef}>{pendingExport && <MemoDocument memo={pendingExport.memo} letterhead={letterheads.find(item => item.id === pendingExport.memo.letterheadId)} />}</div>
      </div>
    </div>
  )
}

function PhraseButton({ phrase, custom, onAdd, onDelete }: { phrase: string; custom: boolean; onAdd: (phrase: string) => void; onDelete: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  return (
    <button
      type="button"
      onClick={() => onAdd(phrase)}
      onPointerDown={() => { if (custom) timer.current = setTimeout(onDelete, 700) }}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onContextMenu={event => { if (custom) { event.preventDefault(); onDelete() } }}
      title={custom ? '點擊加入，長按刪除' : '點擊加入'}
    >{phrase}</button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="memo-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function MemoModal({ title, onClose, className = '', children }: { title: string; onClose: () => void; className?: string; children: React.ReactNode }) {
  return (
    <div className="memo-modal-layer">
      <div className={`memo-modal ${className}`}>
        <div className="memo-modal-bar">
          <button onClick={onClose}>返回</button>
          <strong>{title}</strong>
          <button onClick={onClose} aria-label="關閉">
            <X size={22} />
          </button>
        </div>
        <div className="memo-modal-body">{children}</div>
      </div>
    </div>
  )
}

function SignaturePad({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasStroke = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#15212b'
    if (value) {
      const image = new Image()
      image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      image.src = value
    }
  }, [value])

  const pos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(event)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(event)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasStroke.current = true
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    if (hasStroke.current && canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasStroke.current = false
    onChange(null)
  }

  return (
    <div className="memo-sign">
      <canvas
        ref={canvasRef}
        width={320}
        height={130}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{ touchAction: 'none' }}
      />
      <button type="button" onClick={clear}>
        清除重簽
      </button>
    </div>
  )
}
