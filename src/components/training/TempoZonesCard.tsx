'use client'
import { useState } from 'react'
import { ChevronDown, Gauge } from 'lucide-react'
import { TEMPO_ZONES } from '@/lib/tempo-zones'
import { cn } from '@/lib/utils'

/**
 * Compacte, inklapbare referentiekaart met de looptempo-zones (H/D1/D2/D3/W)
 * waarop het volledige trainingsschema is gebaseerd. Handig naslagwerk zodat
 * de gebruiker altijd weet welk tempo bij welke zone-letter hoort.
 */
export function TempoZonesCard() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 p-3.5"
      >
        <div className="w-8 h-8 rounded-xl bg-[#f97316]/10 flex items-center justify-center shrink-0">
          <Gauge size={15} className="text-[#f97316]" />
        </div>
        <p className="flex-1 text-left text-sm font-semibold text-white">Jouw tempozones</p>
        <ChevronDown size={16} className={cn('text-[#55556a] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-1.5">
          {TEMPO_ZONES.map(z => (
            <div key={z.label} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#222230]">
              <span className="text-[11px] font-bold text-[#f97316] w-7 shrink-0">{z.label}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">{z.naam}</p>
                <p className="text-[11px] text-[#8888a8] truncate">{z.omschrijving}</p>
              </div>
              <span className="text-xs font-bold text-white shrink-0">{z.pace}/km</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
