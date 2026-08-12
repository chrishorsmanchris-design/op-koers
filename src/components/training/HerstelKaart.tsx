'use client'
import { cn } from '@/lib/utils'
import type { HerstelAnalyse } from '@/lib/herstel'
import { HeartPulse, Moon, Activity } from 'lucide-react'

const STIJL = {
  onbekend: { rand: 'border-[#2d2d3e]',    accent: 'text-[#8888a8]', titel: 'Herstel meten' },
  goed:     { rand: 'border-[#2d2d3e]',    accent: 'text-[#22c55e]', titel: 'Hersteld' },
  let_op:   { rand: 'border-amber-800/60', accent: 'text-amber-400', titel: 'Herstel loopt achter' },
  slecht:   { rand: 'border-red-800/60',   accent: 'text-red-400',   titel: 'Nog niet hersteld' },
}

function Meter({
  icoon, label, waarde, eenheid, basis, accent,
}: {
  icoon: React.ReactNode
  label: string
  waarde: number | null
  eenheid: string
  basis: string | null
  accent: string
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1 mb-0.5">
        <span className={cn('shrink-0', waarde === null ? 'text-[#55556a]' : accent)}>{icoon}</span>
        <span className="text-[10px] text-[#55556a] uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className="text-lg font-bold text-white leading-none">
        {waarde === null ? '–' : waarde}
        {waarde !== null && <span className="text-[11px] font-normal text-[#8888a8] ml-0.5">{eenheid}</span>}
      </p>
      <p className="text-[10px] text-[#55556a] mt-0.5 truncate">{basis ?? 'geen basislijn'}</p>
    </div>
  )
}

export function HerstelKaart({ analyse, compact = false }: { analyse: HerstelAnalyse; compact?: boolean }) {
  const stijl = STIJL[analyse.niveau]

  // Op het dashboard alleen opduiken als er iets te melden is. Een groene kaart
  // die elke dag hetzelfde zegt leert je niets en kost alleen schermruimte.
  if (compact && (analyse.niveau === 'goed' || analyse.niveau === 'onbekend')) return null

  // Nog geen enkele meting: dan is het geen analyse maar een uitnodiging.
  if (analyse.metingen === 0) {
    if (compact) return null
    return (
      <div className="bg-[#1b1b27] rounded-3xl border border-[#2d2d3e] p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-[#8888a8] mb-2">Herstel meten</p>
        <p className="text-xs text-[#8888a8] leading-relaxed">
          Nog geen metingen ontvangen. Koppel Apple Health via Profiel → Instellingen
          om je rusthartslag, HRV en slaap mee te laten wegen.
        </p>
      </div>
    )
  }

  const delta = analyse.rusthartslagDelta
  const deltaTekst = delta === null || analyse.rusthartslagBasis === null
    ? null
    : `normaal ${analyse.rusthartslagBasis}${delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : ''}`

  return (
    <div className={cn('bg-[#1b1b27] rounded-3xl border p-4', stijl.rand)}>
      <div className="flex items-center justify-between mb-3">
        <p className={cn('text-xs font-bold uppercase tracking-widest', stijl.accent)}>{stijl.titel}</p>
        <p className="text-[11px] text-[#55556a]">
          {analyse.metingen} meetdag{analyse.metingen === 1 ? '' : 'en'}
        </p>
      </div>

      <div className="flex gap-3 mb-3">
        <Meter
          icoon={<HeartPulse size={12} />}
          label="Rusthartslag"
          waarde={analyse.rusthartslag}
          eenheid=" bpm"
          basis={deltaTekst}
          accent={stijl.accent}
        />
        <Meter
          icoon={<Activity size={12} />}
          label="HRV"
          waarde={analyse.hrv}
          eenheid=" ms"
          basis={analyse.hrvBasis !== null ? `normaal ${analyse.hrvBasis}` : null}
          accent={stijl.accent}
        />
        <Meter
          icoon={<Moon size={12} />}
          label="Slaap"
          waarde={analyse.slaapuren}
          eenheid=" u"
          basis={analyse.slaapschuld !== null && analyse.slaapschuld < 0
            ? `${Math.abs(analyse.slaapschuld)} u tekort`
            : 'laatste 3 nachten'}
          accent={stijl.accent}
        />
      </div>

      {analyse.signalen.length > 0 && (
        <ul className="flex flex-col gap-1 mb-2">
          {analyse.signalen.map(s => (
            <li key={s} className="text-xs text-[#8888a8] flex gap-1.5">
              <span className={stijl.accent}>•</span>{s}
            </li>
          ))}
        </ul>
      )}

      {analyse.advies && (
        <p className="text-xs text-white leading-relaxed">{analyse.advies}</p>
      )}

      {!compact && analyse.niveau === 'onbekend' && (
        <p className="text-[10px] text-[#55556a] leading-relaxed">
          Er zijn nog te weinig dagen om een basislijn te bepalen. Vanaf ongeveer
          twee weken metingen kan de app zien wat voor jou normaal is.
        </p>
      )}

      {!compact && (
        <p className="text-[10px] text-[#55556a] mt-3 leading-relaxed">
          Alles wordt vergeleken met jouw eigen gemiddelde over de afgelopen vier
          weken, niet met een norm. De laatste dagen tellen niet mee in die
          basislijn — anders verdwijnt een slechte week erin.
        </p>
      )}
    </div>
  )
}
