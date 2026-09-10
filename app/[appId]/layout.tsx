import type { Metadata } from 'next'

const APP_IDS = new Set(['camera', 'site-memo', 'handover', 'notebook', 'database', 'full'])

export async function generateMetadata({ params }: { params: Promise<{ appId: string }> }): Promise<Metadata> {
  const { appId } = await params
  const resolvedId = appId === 'memo' ? 'site-memo' : appId
  if (!APP_IDS.has(resolvedId)) return {}
  return { manifest: `/manifest/${resolvedId}` }
}

export default function AppIdLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
