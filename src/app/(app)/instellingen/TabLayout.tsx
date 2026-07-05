'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Settings, BarChart2 } from 'lucide-react'

interface Props {
  instellingen: React.ReactNode
  analytics: React.ReactNode
}

export function TabLayout({ instellingen, analytics }: Props) {
  const [tab, setTab] = useState<'instellingen' | 'analytics'>('instellingen')

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-[#111118] px-4 pt-8 pb-0">
        <h1 className="text-2xl font-bold text-white mb-4">Profiel</h1>
        <div className="flex bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-1">
          <button
            onClick={() => setTab('instellingen')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
              tab === 'instellingen'
                ? 'bg-[#f97316] text-white'
                : 'text-[#8888a8]'
            )}
          >
            <Settings size={15} />
            Instellingen
          </button>
          <button
            onClick={() => setTab('analytics')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
              tab === 'analytics'
                ? 'bg-[#f97316] text-white'
                : 'text-[#8888a8]'
            )}
          >
            <BarChart2 size={15} />
            Analytics
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {tab === 'instellingen' ? instellingen : analytics}
      </div>
    </div>
  )
}
