import { notFound } from 'next/navigation'
import Page from '../page'
import { APP_MANIFESTS, type AppId } from '@/lib/app-architecture'

export default async function AppPathPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  if (appId !== 'memo' && !Object.prototype.hasOwnProperty.call(APP_MANIFESTS, appId)) notFound()
  return <Page />
}
