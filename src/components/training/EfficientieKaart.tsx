'use client'
import { cn } from '@/lib/utils'
import { tempoTekst, type EfficientieAnalyse } from '@/lib/efficientie'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const STIJL = {
  onbekend: { rand: 'border-[#2d2d3e]',    accent: 'text-[#8888a8]', titel: 'Hartslag vs tempo' },
  beter:    { rand: 'border-[#2d2d3e]',    accent: 'text-[#22c55e]', titel: 'Je wordt efficiënter' },
  stabiel:  { rand: 'border-[#2d2d3e]',    accent: 'text-[#8888a8]', titel: 'Stabiel' },
  slechter: { rand: 'border-amber-800/60', accent: 'text-amber-400', titel: 'Meer hartslag voor hetzelfde werk' },
  zorg:     { rand: 'border-red-800/60',   accent: 'text-red-400',   titel: 'Je betaalt te veel voor je tempo' },
}

export function EfficientieKaart({ analyse }: { analyse: EfficientieAnalyse }) {
  const stijl = STIJL[analyse.richting]
  const punten = analyse.punten

  const Pijl = analyse.richting === 'beter' ? TrendingUp
    : analyse.richting === 'stabiel' || analyse.richting === 'onbekend' ? Minus
      : TrendingDown

  // Grafiek: elke run een staafje, hoogte relatief aan de spreiding. Bewust niet
  // vanaf nul — de verschillen zijn een paar procent en zouden dan onzichtbaar zijn.
  const indexen = punten.map(p => p.index)
  const min = Math.min(...indexen)
  const max = Math.max(...indexen)
  const spreiding = max - min || 1

  return (
    <div className={cn('bg-[#1b1b27] rounded-3xl border p-4', stijl.rand)}>
      <div className="flex items-center justify-between mb-3">
        <p className={cn('text-xs font-bold uppercase tracking-widest', stijl.accent)}>{stijl.titel}</p>
        {analyse.veranderingPct !== null && (
          <div className={cn('flex items-center gap-1 text-sm font-bold', stijl.accent)}>
            <Pijl size={14} />
            {analyse.veranderingPct > 0 ? '+' : ''}{analyse.veranderingPct}%
          </div>
        )}
      </div>

      {punten.length > 0 && (
        <>
          <div className="flex items-end gap-1 h-16 mb-1">
            {punten.map(p => {
              const hoogte = 15 + Math.round(((p.index - min) / spreiding) * 85)
              const isRecent = p === punten[punten.length - 1]
              return (
                <div
                  key={p.datum + p.afstandKm}
                  title={`${p.datum} — ${p.afstandKm} km, ${tempoTekst(p.tempoSec)}/km, ${p.hartslag} slagen`}
                  className="flex-1 flex flex-col justify-end h-full min-w-[3px]"
                >
                  <div
                    className={cn('w-full rounded-sm', isRecent ? 'bg-[#f97316]' : 'bg-[#2d2d3e]')}
                    style={{ height: `${hoogte}%` }}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-[#55556a] mb-3">
            {punten.length} rustige duurlopen, oudste links. Hoger = meer tempo per hartslag.
          </p>
        </>
      )}

      <p className="text-xs text-[#8888a8] leading-relaxed">{analyse.uitleg}</p>

      {analyse.advies && (
        <p className="text-xs text-white leading-relaxed mt-2">{analyse.advies}</p>
      )}

      <p className="text-[10px] text-[#55556a] mt-3 leading-relaxed">
        Alleen rustige duurlopen vanaf 4 km tellen mee: bij intervallen hoort een
        gemiddelde hartslag bij geen enkel moment van de training. Warm weer en een
        slechte nacht kosten al snel een paar procent, dus kijk naar de trend en
        niet naar één run.
      </p>
    </div>
  )
}
