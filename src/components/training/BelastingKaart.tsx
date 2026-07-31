'use client'
import { cn } from '@/lib/utils'
import type { BelastingAnalyse } from '@/lib/belasting'

const STIJL = {
  ok:     { rand: 'border-[#2d2d3e]',   accent: 'text-[#22c55e]', balk: 'bg-[#22c55e]', titel: 'Belasting in balans' },
  let_op: { rand: 'border-amber-800/60', accent: 'text-amber-400', balk: 'bg-amber-400', titel: 'Let op je herstel' },
  hoog:   { rand: 'border-red-800/60',   accent: 'text-red-400',   balk: 'bg-red-400',   titel: 'Risico op overbelasting' },
}

const DAGLETTER = ['Z', 'M', 'D', 'W', 'D', 'V', 'Z']

export function BelastingKaart({ analyse, compact = false }: { analyse: BelastingAnalyse; compact?: boolean }) {
  const stijl = STIJL[analyse.niveau]
  const laatste14 = analyse.dagen.slice(-14)
  const maxPunten = Math.max(...laatste14.map(d => d.punten), 100)

  // Bij 'ok' en compact (dashboard) niet zeuren: geen kaart tonen.
  if (compact && analyse.niveau === 'ok') return null

  return (
    <div className={cn('bg-[#1b1b27] rounded-3xl border p-4', stijl.rand)}>
      <div className="flex items-center justify-between mb-3">
        <p className={cn('text-xs font-bold uppercase tracking-widest', stijl.accent)}>{stijl.titel}</p>
        <p className="text-[11px] text-[#55556a]">
          {analyse.rustdagen} rustdag{analyse.rustdagen === 1 ? '' : 'en'} / 7
        </p>
      </div>

      {/* Belasting per dag, laatste 2 weken */}
      <div className="flex items-end gap-1 h-14 mb-1">
        {laatste14.map(d => {
          const hoogte = Math.max(3, Math.round((d.punten / maxPunten) * 100))
          return (
            <div key={d.datum} className="flex-1 flex flex-col justify-end h-full">
              <div
                className={cn('w-full rounded-sm', d.isRustdag ? 'bg-[#2d2d3e]' : stijl.balk)}
                style={{ height: `${hoogte}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1 mb-3">
        {laatste14.map(d => (
          <span key={d.datum} className="flex-1 text-center text-[9px] text-[#55556a]">
            {DAGLETTER[new Date(d.datum + 'T12:00:00').getDay()]}
          </span>
        ))}
      </div>

      {analyse.waarschuwingen.length > 0 && (
        <ul className="flex flex-col gap-1 mb-2">
          {analyse.waarschuwingen.map(w => (
            <li key={w} className="text-xs text-[#8888a8] flex gap-1.5">
              <span className={stijl.accent}>•</span>{w}
            </li>
          ))}
        </ul>
      )}

      {analyse.advies && (
        <p className="text-xs text-white leading-relaxed">{analyse.advies}</p>
      )}

      {!compact && (
        <p className="text-[10px] text-[#55556a] mt-3 leading-relaxed">
          Belastingpunten = duur × intensiteit, over al je sporten samen.
          Deze week {analyse.acuut}, gemiddeld {analyse.chronisch} per week
          {analyse.ratio !== null && ` (${analyse.ratio}×)`}.
        </p>
      )}
    </div>
  )
}
