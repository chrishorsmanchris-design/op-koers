'use client'
import { useState } from 'react'
import { ChevronDown, Target } from 'lucide-react'
import { paceNaarTekst, secondenNaarTijd, type DoelAnalyse } from '@/lib/doeltempo'
import { cn } from '@/lib/utils'

interface Props {
  analyse: DoelAnalyse
}

/**
 * De realiteitscheck bij je tijdsdoel.
 *
 * Tot nu toe stond je doeltijd alleen als tekst op het scherm — mooi, maar het
 * beantwoordde niet de enige vraag die je erover hebt. Deze kaart zet je doel
 * naast wat je eigen runs voorspellen, en laat zien waar dat op gebaseerd is,
 * zodat je het kunt narekenen in plaats van te moeten geloven.
 */

const KLEUR: Record<DoelAnalyse['haalbaarheid'], { rand: string; tekst: string; label: string }> = {
  op_koers: { rand: 'border-emerald-500/30', tekst: 'text-emerald-400', label: 'Op koers' },
  ambitieus: { rand: 'border-amber-500/30', tekst: 'text-amber-400', label: 'Ambitieus' },
  onrealistisch: { rand: 'border-red-500/30', tekst: 'text-red-400', label: 'Nog te ver weg' },
  te_weinig_data: { rand: 'border-[#2d2d3e]', tekst: 'text-[#8888a8]', label: 'Nog geen zicht op' },
}

export function DoeltempoKaart({ analyse }: Props) {
  const [open, setOpen] = useState(false)
  const kleur = KLEUR[analyse.haalbaarheid]

  return (
    <div className={cn('rounded-2xl bg-[#1b1b27] border overflow-hidden', kleur.rand)}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 p-3.5">
        <div className="w-8 h-8 rounded-xl bg-[#f97316]/10 flex items-center justify-center shrink-0">
          <Target size={15} className="text-[#f97316]" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-white">
            Je tijdsdoel
            {analyse.doelSeconden ? ` · ${secondenNaarTijd(analyse.doelSeconden)}` : ''}
          </p>
          <p className={cn('text-[11px] font-semibold', kleur.tekst)}>{kleur.label}</p>
        </div>
        {analyse.voorspeldSeconden && (
          <span className="text-xs font-bold text-white shrink-0">
            {secondenNaarTijd(analyse.voorspeldSeconden)}
          </span>
        )}
        <ChevronDown size={16} className={cn('text-[#55556a] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
          <p className="text-xs text-[#c5c5d8] leading-relaxed">{analyse.samenvatting}</p>

          <div className="grid grid-cols-2 gap-1.5">
            {analyse.doelPace !== null && (
              <Cel label="Doeltempo" waarde={`${paceNaarTekst(analyse.doelPace)}/km`} />
            )}
            {analyse.voorspeldePace !== null && (
              <Cel label="Huidig tempo" waarde={`${paceNaarTekst(analyse.voorspeldePace)}/km`} />
            )}
            <Cel label="Langste duurloop" waarde={`${Math.round(analyse.langsteRunKm)} km`} />
            <Cel label="Volume" waarde={`${analyse.weekKmGemiddeld} km/week`} />
          </div>

          {analyse.basis && (
            <p className="text-[11px] text-[#55556a]">
              Gebaseerd op je scherpste run: {analyse.basis.afstand_km} km in{' '}
              {analyse.basis.duur_minuten} min op{' '}
              {new Date(analyse.basis.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })},
              omgerekend naar 42,195 km.
            </p>
          )}

          {analyse.waarschuwingen.map(w => (
            <p key={w} className="text-[11px] text-amber-300/80 leading-relaxed">{w}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function Cel({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-[#222230]">
      <p className="text-[10px] text-[#8888a8]">{label}</p>
      <p className="text-sm font-bold text-white">{waarde}</p>
    </div>
  )
}
