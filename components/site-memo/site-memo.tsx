'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomNav } from '@/components/ui/bottom-nav'
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
type MemoTemplateId = 'handover-delay' | 'damage-backcharge' | 'design-conflict' | 'progress-warning' | 'completion-handover'

type AppMode = 'home' | 'photo' | 'memo' | 'handover' | 'reserve' | 'about' | 'backup'

const FIXED_LIABILITY_PHRASE = /若因\s*貴司\s*或\s*貴司之分判\s*[,，]?\s*疏忽而導致任何索償\s*[,，、]?\s*損失\s*[,，、]?\s*工程延誤或其他後果\s*[,，、]?\s*以及設備損壞所引致之維修或更換費用\s*[,，、]?\s*本公司保留追究權利\s*[。.]?/g
const removeFixedLiabilityPhrase = (value: string) => value.replace(new RegExp(FIXED_LIABILITY_PHRASE.source, 'g'), '').replace(/\n{3,}/g, '\n\n').trim()

const SITE_MEMO_TEMPLATES: Array<{ id: MemoTemplateId; title: string; subtitle: string; body: string }> = [
  { id: 'handover-delay', title: '交場延誤', subtitle: 'Site Handover Delay', body: '1. 根據本司於 [事發/巡查日期] 之現場巡查，發現位於 [地點/樓層] [現場狀況]，導致本司無法進場展開 [涉及設備/系統] 之安裝工序。\n2. 為免拖延整體機電安裝進度及後續之測試及調試（T&C）工作，特此懇請貴司即時督促相關分判商清理及交場，並限於 [要求限期/時間] 前完成移交。\n3. 若因是次延遲交場導致本司工人窩工或影響總工期，本司將保留申請工期延長（EOT）及追討經濟損失之合約權利。\n[附件段落]' },
  { id: 'damage-backcharge', title: '設備損壞', subtitle: 'Damage & Backcharge', body: '1. 本司駐地盤員工於 [事發/巡查日期] 在 [地點/樓層] 巡查時，發現本司已安裝完成並設有保護之 [涉及設備/系統] 遭受[損壞情況]。\n2. 經現場查核，該損壞乃因貴司或貴司之分判商施工期間操作不當所致，相關重造、更換及人工物料費用將全數由貴司承擔。\n3. 相關款項將直接於貴司之中期糧款（Interim Payment）中全數扣除（Backcharge）；請貴司於 [要求限期/時間] 前書面確認更換安排。\n[附件段落]' },
  { id: 'design-conflict', title: '圖則衝突', subtitle: 'Design Conflict', body: '1. 根據最新批核之協調圖則（CSD/CBWD），本司原定於 [地點/樓層] 進行 [涉及設備/系統] 之穿越結構及安裝工程。\n2. 經本司於 [事發/巡查日期] 現場覆核尺寸後，發現現場 [衝突情況]，導致相關工序被迫暫停。\n3. 特此通知貴司及顧問團隊盡快協調，並限於 [要求限期/時間] 前發出正式修改指示或補救方案，以便本司配合落實施工。\n[附件段落]' },
  { id: 'progress-warning', title: '進度預警', subtitle: 'Progress Warning', body: '1. 謹此發出進度預警，根據本司於 [事發/巡查日期] 之現場評估，[地點/樓層] 之相關工序進度持續滯後或配合人手嚴重不足，已直接阻礙本司後續 [涉及設備/系統] 之正常施工流程。\n2. 若相關配合工序未能於 [要求限期/時間] 前完成並交出場地，將直接延誤關鍵施工節點，並嚴重威脅後續之測試及調試（T&C）及法定驗收進度。\n3. 請貴司高度重視上述情況，即時加派人手追趕工期，確保後續工序能如期銜接。\n4. 耑此函達，敬請貴司儘速回覆具體追趕施工時間表。\n[附件段落]' },
  { id: 'completion-handover', title: '完工通知', subtitle: 'Completion & Handover', body: '1. 本司謹此通知，位於 [地點/樓層] 之 [設備／系統] 安裝工程及相關之 [驗收項目] 已於 [事發/巡查日期] 順利完成，並符合批核圖則及規格要求。\n2. 現特此邀請貴司及駐地盤代表（BSI）於 [要求限期/時間] 進行驗收並辦理交場手續，以便安排下一工種進場。\n3. 驗收移交後，若上述設施因後續其他工種施工而遭受任何損壞，相關修復費用及工期責任概由責任方全權承擔。\n[附件段落]' },
]

const MEMO_TONES = [
  { label: '正式客觀', text: '' },
  { label: '嚴正提醒', text: '請貴司立即正視上述情況並採取必要行動。' },
  { label: '保留合約權利', text: '本司明確保留根據合約追討相關工期及費用責任之權利。' },
]

const MEMO_CONTRACT_CLAUSES = [
  { label: '不加入條款', text: '' },
  { label: '工期延長（EOT）', text: '如上述事件影響關鍵工序或整體工期，本司保留按照合約申請工期延長（EOT）之權利。' },
  { label: '費用及損失追討', text: '如上述事件引致本司額外費用或損失，本司保留按照合約向責任方追討之權利。' },
  { label: '責任及費用一併保留', text: '本司保留按照合約申請工期延長（EOT）及追討相關費用、損失之全部權利。' },
]

export function SiteMemo({ onBack, onNavigate, onOpenMachineData, onOpenMachineDataManage, projectId, projectName, isRegistered }: { onBack: () => void; onNavigate: (mode: AppMode) => void; onOpenMachineData: () => void; onOpenMachineDataManage?: () => void; projectId: string; projectName: string; isRegistered: boolean }) {
  const [memo, setMemo] = useState<Memo>(createDefaultMemo)
  const [letterheads, setLetterheads] = useState<MemoLetterhead[]>([])
  const [letterheadName, setLetterheadName] = useState('')
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [letterheadBusy, setLetterheadBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [modal, setModal] = useState<ModalId>(null)
  const [templateId, setTemplateId] = useState<MemoTemplateId | null>(null)
  const [templateLocation, setTemplateLocation] = useState('')
  const [templateDate, setTemplateDate] = useState('')
  const [templateDeadline, setTemplateDeadline] = useState('')
  const [templateEquipment, setTemplateEquipment] = useState('電器設備')
  const [customEquipment, setCustomEquipment] = useState('')
  const [addingEquipment, setAddingEquipment] = useState(false)
  const [equipmentOptions, setEquipmentOptions] = useState(['電器設備', '冷氣設備', '消防設備'])
  const [templateOptions, setTemplateOptions] = useState<string[]>([])
  const [templateMode, setTemplateMode] = useState(false)
  const [attachmentOption, setAttachmentOption] = useState('')
  const [templateCustomOption, setTemplateCustomOption] = useState('')
  const [memoTone, setMemoTone] = useState('')
  const [contractClause, setContractClause] = useState('')
  const [overlay, setOverlay] = useState<'preview' | 'export' | 'history' | null>(null)
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [previewingHistory, setPreviewingHistory] = useState<HistoryRecord | null>(null)
  const [polishing, setPolishing] = useState(false)
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

  const clearMemoInput = () => {
    update({ roughInput: '', items: [] })
    setTemplateId(null)
    setTemplateMode(false)
    setTemplateOptions([])
    setTemplateCustomOption('')
    setAttachmentOption('')
    setMemoTone('')
    setContractClause('')
  }

  const formatTemplateDate = (value: string) => {
    if (!value) return ''
    const date = new Date(`${value}T00:00:00`)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const insertMemoLineBreak = () => update({ roughInput: `${memo.roughInput.replace(/\s+$/, '')}\n` })

  const selectTemplate = (id: MemoTemplateId) => {
    const template = SITE_MEMO_TEMPLATES.find(item => item.id === id)
    if (!template) return
    setTemplateId(id)
    setTemplateMode(true)
    setTemplateOptions([])
    setTemplateCustomOption('')
    setAttachmentOption('')
    setMemoTone('')
    setContractClause('')
    setAddingEquipment(false)
    setCustomEquipment('')
    update({ roughInput: template.body })
  }

  const buildTemplateBody = () => {
    const template = SITE_MEMO_TEMPLATES.find(item => item.id === templateId)
    if (!template) return ''
    const equipment = templateEquipment === '其他' ? customEquipment.trim() : templateEquipment
    const date = formatTemplateDate(templateDate) || '[事發／巡查日期]'
    const deadline = formatTemplateDate(templateDeadline) || '[要求限期／時間]'
    const custom = templateCustomOption.trim()
    const normalizedOptions = templateOptions.map(option => option.replace(/^且+/, ''))
    const optionText = normalizedOptions.length ? normalizedOptions.join(templateId === 'design-conflict' || templateId === 'completion-handover' ? '、' : templateId === 'damage-backcharge' ? '，' : '') : ''
    let body = template.body.replace(/\[地點[\/／]樓層\]/g, templateLocation.trim() || '[地點／樓層]').replace(/\[事發[\/／]巡查日期\]/g, date).replace(/\[要求限期[\/／]時間\]/g, deadline).replace(/\[(?:涉及)?設備[\/／]系統\]/g, equipment || '[設備／系統]')
    if (templateId === 'handover-delay') body = body.replace('[現場狀況]', optionText || custom || '[現場狀況]')
    if (templateId === 'damage-backcharge') body = body.replace('[損壞情況]', optionText || custom || '[損壞情況]')
    if (templateId === 'design-conflict') body = body.replace('[衝突情況]', optionText || custom || '[衝突情況]')
    if (templateId === 'completion-handover') body = body.replace('[驗收項目]', optionText || custom || '[驗收項目]')
    body = body.replace('[附件段落]', attachmentOption)
    return [body, memoTone, contractClause].filter(Boolean).join('\n\n')
  }

  const hasUnfilledPlaceholders = (target: Memo) => /\[[^\]]+\]/.test(target.roughInput)
  const openPreview = () => {
    if (hasUnfilledPlaceholders(memo)) return alert('請先填妥內容中的欄位佔位符，再預覽公函。')
    setOverlay('preview')
  }
  const openExport = () => {
    if (hasUnfilledPlaceholders(memo)) return alert('請先填妥內容中的欄位佔位符，再導出公函。')
    setOverlay('export')
  }

  useEffect(() => {
    if (templateId) update({ roughInput: buildTemplateBody(), items: [] })
  }, [templateId, templateLocation, templateDate, templateDeadline, templateEquipment, customEquipment, templateOptions, templateCustomOption, attachmentOption, memoTone, contractClause])

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
    if (hasUnfilledPlaceholders(target)) return alert('請先填妥內容中的欄位佔位符，再導出公函。')
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
          <button className="memo-op-card" onClick={openPreview}>
            <Eye size={24} className="memo-card-icon" />
            <strong>即時預覽</strong>
            <span>A4 直身公函</span>
          </button>
          <button className="memo-op-card" onClick={openExport}>
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

      <BottomNav onNavigate={onNavigate} />

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
        <MemoModal title="內容與事件" className="memo-quick-generator" onClose={() => setModal(null)} backLabel="← 更換範本" onBack={() => { setTemplateId(null); setTemplateMode(false); setTemplateOptions([]); setTemplateCustomOption(''); setAttachmentOption(''); setMemoTone(''); setContractClause('') }}>
          <Field label="Site Memo 內容">
            <textarea className="memo-rough-input" rows={8} placeholder="選擇下方 Site Memo 範本後，內容會即時顯示於此；亦可直接編輯文字" value={memo.roughInput} onChange={e => update({ roughInput: e.target.value })} />
          </Field>
          <div className="memo-quick-scroll">
            {templateId === null && <div className="memo-inline-templates"><strong>Site Memo 五類範本</strong><div className="memo-template-grid">{SITE_MEMO_TEMPLATES.map(template => <button type="button" key={template.id} className="memo-template-card" onClick={() => selectTemplate(template.id)}><strong>{template.title}</strong><span>{template.subtitle}</span></button>)}</div></div>}
            {templateId && <div className="memo-template-form">
              <Field label="地點／樓層"><input value={templateLocation} onChange={event => setTemplateLocation(event.target.value)} placeholder="請輸入地點／樓層" /></Field>
              <Field label="事發／巡查日期"><input type="date" value={templateDate} onChange={event => setTemplateDate(event.target.value)} /></Field>
              <Field label="要求限期／時間"><input type="date" value={templateDeadline} onChange={event => setTemplateDeadline(event.target.value)} /></Field>
              <div className="memo-equipment-picker">
                  <Field label="涉及設備／系統"><select value={templateEquipment} onChange={event => setTemplateEquipment(event.target.value)}>{equipmentOptions.map(option => <option key={option}>{option}</option>)}</select></Field>
                  <button type="button" className="memo-add-option-btn" onClick={() => setAddingEquipment(current => !current)}>＋新增</button>
                </div>
              {addingEquipment && <div className="memo-add-option-form"><input value={customEquipment} onChange={event => setCustomEquipment(event.target.value)} placeholder="輸入設備／系統名稱" /><button type="button" onClick={() => { const value = customEquipment.trim(); if (!value) return; setEquipmentOptions(current => current.includes(value) ? current : [...current, value]); setTemplateEquipment(value); setCustomEquipment(''); setAddingEquipment(false) }}>加入選單</button></div>}
              {templateId === 'handover-delay' && <TemplateOption label="現場狀況" options={['之相關工序尚未完工', '且現場受大量雜物阻塞']} selected={templateOptions} onToggle={value => setTemplateOptions(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} customValue={templateCustomOption} onCustomChange={setTemplateCustomOption} />}
              {templateId === 'damage-backcharge' && <TemplateOption label="損壞情況" options={['遭受外力嚴重撞毀及損壞', '原有保護層被擅自拆除', '遭受泥水及積水污染浸損']} selected={templateOptions} onToggle={value => setTemplateOptions(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} customValue={templateCustomOption} onCustomChange={setTemplateCustomOption} />}
              {templateId === 'design-conflict' && <TemplateOption label="衝突情況" options={['結構開窿位置／尺寸偏差', '缺乏足夠維修空間', '與其他工種管道空間衝突']} selected={templateOptions} onToggle={value => setTemplateOptions(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} customValue={templateCustomOption} onCustomChange={setTemplateCustomOption} />}
              {templateId === 'completion-handover' && <TemplateOption label="驗收項目" options={['水壓／氣密測試', '試通電測試', '運作調試']} selected={templateOptions} onToggle={value => setTemplateOptions(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} customValue={templateCustomOption} onCustomChange={setTemplateCustomOption} />}
              <TemplateOption label="附件段落" options={['4. 隨函附上相關記錄以供備案。', '4. 隨函附上相關相片以供備案。', '4. 隨函附上相關記錄及相片以供備案。']} selected={attachmentOption ? [attachmentOption] : []} onToggle={value => setAttachmentOption(current => current === value ? '' : value)} />
              <Field label="語氣">
                <select value={memoTone} onChange={event => setMemoTone(event.target.value)}>
                  <option value="">正式客觀</option>
                  {MEMO_TONES.filter(tone => tone.text).map(tone => <option key={tone.label} value={tone.text}>{tone.label}</option>)}
                </select>
              </Field>
              <Field label="合約條款">
                <select value={contractClause} onChange={event => setContractClause(event.target.value)}>
                  {MEMO_CONTRACT_CLAUSES.map(clause => <option key={clause.label} value={clause.text}>{clause.label}</option>)}
                </select>
              </Field>
            </div>}
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

function TemplateOption({ label, options, selected, onToggle, customValue, onCustomChange }: { label: string; options: string[]; selected: string[]; onToggle: (value: string) => void; customValue?: string; onCustomChange?: (value: string) => void }) {
  return <div className="memo-template-options"><span>{label}</span>{options.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />{option}</label>)}{onCustomChange && <input className="memo-template-custom-input" value={customValue || ''} onChange={event => onCustomChange(event.target.value)} placeholder={`其他${label}（可選）`} />}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="memo-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function MemoModal({ title, onClose, className = '', backLabel = '返回', onBack, children }: { title: string; onClose: () => void; className?: string; backLabel?: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="memo-modal-layer">
      <div className={`memo-modal ${className}`}>
        <div className="memo-modal-bar">
          <button className="memo-modal-back-btn" onClick={onBack || onClose}>{backLabel}</button>
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
