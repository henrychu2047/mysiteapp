'use client'

import { Building2, Home, Images, Info } from 'lucide-react'

type NavigationMode = 'home' | 'photo' | 'handover' | 'about'

type BottomNavProps = {
  active?: NavigationMode
  onNavigate: (mode: NavigationMode) => void
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav main-nav">
      <button className={active === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}><span><Home size={20} /></span>首頁</button>
      <button className={active === 'photo' ? 'active' : ''} onClick={() => onNavigate('photo')}><span><Images size={20} /></span>相簿</button>
      <button className={active === 'handover' ? 'active' : ''} onClick={() => onNavigate('handover')}><span><Building2 size={20} /></span>設定</button>
      <button className={active === 'about' ? 'active' : ''} onClick={() => onNavigate('about')}><span><Info size={20} /></span>資料</button>
    </nav>
  )
}
