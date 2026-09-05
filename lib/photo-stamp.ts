export const PHOTO_STAMP_TAG_ORDER = ['座數', '樓層', '位置', '收貨相關', '事項', '安全'] as const

export const PHOTO_STAMP_STYLE = {
  background: 'rgba(10, 17, 24, .78)',
  text: '#ffffff',
  label: '#ffd900',
} as const

type StampOptions = {
  category: string
  tags?: Record<string, string>
  visibleTags?: string[]
  note?: string
  projectName?: string
  createdAt?: Date
}

export type PhotoStampContent = {
  heading: string
  rows: Array<{ label: string; value: string }>
  note: string
}

export function createPhotoStampContent({ category, tags = {}, visibleTags = [...PHOTO_STAMP_TAG_ORDER], note = '', projectName = '', createdAt = new Date() }: StampOptions): PhotoStampContent {
  const rows = [{ label: '工程類別', value: category }]

  for (const label of PHOTO_STAMP_TAG_ORDER) {
    const value = tags[label]
    if (visibleTags.includes(label) && value && value !== 'N/A') rows.push({ label, value })
  }

  return {
    heading: [projectName, createdAt.toLocaleString('zh-HK', { hour12: false })].filter(Boolean).join(' | '),
    rows,
    note: note.trim(),
  }
}
