'use client'
import { X, Timer, MapPin } from 'lucide-react'
import { formatDuur } from '@/lib/utils'
import { parseWorkout } from '@/lib/workout-parser'
import type { TempoZone } from '@/lib/tempo-zones'

interface Props {
  beschrijving: string
  duur_minuten: number | null
  afstand_km: number | null
  intensiteit?: string | null
  onSluiten: () => void
}

function ZoneBadge({ zone }: { zone: TempoZone }) {
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f97316]/10 text-[#f97316]">
      {zone.label} · {zone.pace}/km
    </span>
  )
}

export function WorkoutModal({ beschrijving, duur_minuten, afstand_km, intensiteit, onSluiten }: Props) {
  const workout = parseWorkout(beschrijving, duur_minuten)

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onSluiten} />
      <div className="relative w-full max-h-[85vh] overflow-y-auto bg-[#1b1b27] rounded-t-3xl shadow-2xl border-t border-[#2d2d3e]">
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-[#1b1b27]">
          <div className="w-10 h-1 bg-[#2d2d3e] rounded-full" />
        </div>

        <div className="px-5 pb-safe-or-8 pb-8">
          <div className="flex justify-between items-start mt-1 mb-3">
            <div>
              <p className="text-xs font-semibold text-[#f97316] uppercase tracking-wide">{workout.soort}</p>
              <h3 className="font-bold text-white text-lg leading-snug mt-0.5">{beschrijving}</h3>
            </div>
            <button onClick={onSluiten} className="p-1.5 text-[#55556a] -mt-0.5 shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4 mb-5 text-sm text-[#8888a8]">
            {duur_minuten != null && (
              <span className="flex items-center gap-1"><Timer size={13} />{formatDuur(duur_minuten)}</span>
            )}
            {afstand_km != null && afstand_km > 0 && (
              <span className="flex items-center gap-1"><MapPin size={13} />{afstand_km} km</span>
            )}
            {intensiteit && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#222230] font-semibold uppercase">
                {intensiteit}
              </span>
            )}
          </div>

          <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide mb-2">Opbouw</p>
          <div className="flex flex-col gap-2">
            {workout.blokken.map((blok, i) => (
              <div key={i} className="rounded-2xl bg-[#222230] border border-[#2d2d3e] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{blok.titel}</p>
                  {blok.duur_minuten != null && (
                    <span className="text-xs text-[#8888a8] shrink-0">{formatDuur(blok.duur_minuten)}</span>
                  )}
                </div>
                {blok.detail && <p className="text-xs text-[#8888a8] mt-1">{blok.detail}</p>}
                {blok.zones.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {blok.zones.map(z => <ZoneBadge key={z.label} zone={z} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
