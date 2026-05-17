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
      <div className="sticky top-0 z-10 bg-[#f5f3f0] px-4 pt-8 pb-0">
        <h1 className="text-2xl font-bold text-[#1a1612] mb-4">Profiel</h1>
        <div className="flex bg-white rounded-2xl p-1 shadow-sm">
          <button
            onClick={() => setTab('instellingen')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
              tab === 'instellingen'
                ? 'bg-[#f97316] text-white shadow-sm'
                : 'text-[#6b6560]'
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
                ? 'bg-[#f97316] text-white shadow-sm'
                : 'text-[#6b6560]'
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
