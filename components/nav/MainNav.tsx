'use client'

import { Home, Images, Building2, Info } from 'lucide-react'

export default function MainNav({ navMode, onNavigate }: { navMode: string; onNavigate: (mode: string) => void }) {
  return (
    <nav className="bottom-nav main-nav">
      <button className={navMode === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}>
        <span><Home size={20} /></span>
        首頁
      </button>
      <button className={navMode === 'photo' ? 'active' : ''} onClick={() => onNavigate('photo')}>
        <span><Images size={20} /></span>
        相簿
      </button>
      <button className={navMode === 'handover' ? 'active' : ''} onClick={() => onNavigate('handover')}>
        <span><Building2 size={20} /></span>
        設定
      </button>
      <button className={navMode === 'about' ? 'active' : ''} onClick={() => onNavigate('about')}>
        <span><Info size={20} /></span>
        資料
      </button>
    </nav>
  )
}
