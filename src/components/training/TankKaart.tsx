'use client'
import { useState, useEffect } from 'react'
import { maakTankplan, tijdTekst, type Tankplan } from '@/lib/tanken'
import { Droplets, Zap, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  sessie: { datum: string; beschrijving: string; duur_minuten: number | null } | null
}

/**
 * Geen geolocatie-toestemming vragen voor één getal. Binnen Nederland scheelt de
 * maximumtemperatuur zelden meer dan een graad of twee, en dat verschuift geen
 * enkel advies naar een andere categorie.
 */
const LAT = 52.3676
const LON = 4.9041

export function TankKaart({ sessie }: Props) {
  const [tempC, setTempC] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  const datum = sessie?.datum ?? null

  useEffect(() => {
    if (!datum) return
    let afgebroken = false

    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&daily=temperature_2m_max&timezone=Europe/Amsterdam&forecast_days=16`
    )
      .then(r => r.json())
      .then((data: { daily?: { time?: string[]; temperature_2m_max?: number[] } }) => {
        if (afgebroken) return
        const i = data.daily?.time?.indexOf(datum) ?? -1
        const t = i >= 0 ? data.daily?.temperature_2m_max?.[i] : undefined
        // Zonder verwachting blijft het plan gewoon staan, alleen zonder
        // temperatuurcorrectie. Een mislukte weeroproep mag geen kaart wissen.
        if (typeof t === 'number') setTempC(Math.round(t))
      })
      .catch(() => {})

    return () => { afgebroken = true }
  }, [datum])

  if (!sessie) return null

  const plan = maakTankplan(sessie.duur_minuten, tempC)
  if (!plan) return null

  return (
    <div className="bg-[#1b1b27] rounded-3xl border border-[#2d2d3e] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-[#38bdf8]">
          {plan.niveau === 'tanken' ? 'Tankplan' : 'Drinkplan'}
        </p>
        <p className="text-[10px] text-[#55556a]">
          {sessie.beschrijving} · {tijdTekst(plan.duurMin)}
          {plan.tempC !== null && ` · ${plan.tempC}°`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Vak
          icon={<Droplets size={14} className="text-[#38bdf8]" />}
          waarde={`${plan.vochtTotaalMl[0]}–${plan.vochtTotaalMl[1]} ml`}
          label={`${plan.vochtPerUur[0]}–${plan.vochtPerUur[1]} ml per uur`}
        />
        {plan.niveau === 'tanken' ? (
          <Vak
            icon={<Zap size={14} className="text-[#f97316]" />}
            waarde={`${plan.gels} gels`}
            label={`${plan.koolhydratenGram} g · ${plan.koolhydratenPerUur} g per uur`}
          />
        ) : (
          <Vak
            icon={<Zap size={14} className="text-[#55556a]" />}
            waarde="Niets nodig"
            label="Onder 90 minuten"
          />
        )}
      </div>

      {plan.momenten.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {plan.momenten.map(m => (
            <span
              key={m}
              className="px-2 py-1 rounded-lg bg-[#f97316]/10 text-[#f97316] text-xs font-bold tabular-nums"
            >
              {tijdTekst(m)}
            </span>
          ))}
          <span className="text-[10px] text-[#55556a] ml-1">na start</span>
        </div>
      )}

      {plan.waarschuwing && (
        <p className="text-xs text-amber-400 leading-relaxed mb-2">{plan.waarschuwing}</p>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[10px] text-[#55556a] uppercase tracking-widest font-bold"
      >
        Voor en na
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-[#8888a8] leading-relaxed">{plan.vooraf}</p>
          <p className="text-xs text-[#8888a8] leading-relaxed">{plan.achteraf}</p>
          <p className="text-[10px] text-[#55556a] leading-relaxed">
            Bereiken, geen doelen: wat je maag verdraagt verschilt per persoon. Begin
            onderaan en bouw op. Dit is óók waarom je in training tankt en niet pas op
            de wedstrijddag — je darmen moeten het leren.
          </p>
        </div>
      )}
    </div>
  )
}

function Vak({ icon, waarde, label }: { icon: React.ReactNode; waarde: string; label: string }) {
  return (
    <div className="bg-[#222230] rounded-2xl p-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}</div>
      <p className="text-sm font-bold text-white leading-tight">{waarde}</p>
      <p className="text-[10px] text-[#55556a] leading-tight mt-0.5">{label}</p>
    </div>
  )
}
