'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CheckCircle2, Timer, Play, Pause, RotateCcw, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface CoreOefening {
  naam: string
  beschrijving: string
  sets: number
  reps?: number
  duur_seconden?: number
  emoji: string
  tip: string
}

// Basis oefeningen — worden eventueel aangepast op basis van moeilijkheid
const CORE_OEFENINGEN_BASIS: CoreOefening[] = [
  {
    naam: 'Plank',
    beschrijving: 'Steun op onderarmen en tenen. Houd rug recht, billen niet omhoog. Adem rustig door.',
    sets: 3,
    duur_seconden: 40,
    emoji: '💪',
    tip: 'Focus op een neutrale ruggengraat — geen holle rug.',
  },
  {
    naam: 'Dead Bug',
    beschrijving: 'Lig op rug. Armen omhoog, knieën 90°. Strek afwisselend arm + tegenoverliggende been naar de grond.',
    sets: 3,
    reps: 10,
    emoji: '🐛',
    tip: 'Houd onderrug op de grond gedurende de hele beweging.',
  },
  {
    naam: 'Bird Dog',
    beschrijving: 'Viervoeters. Strek tegelijk rechterarm en linkerbeeen. Wissel per herhaling.',
    sets: 3,
    reps: 10,
    emoji: '🐦',
    tip: 'Beweeg langzaam en gecontroleerd — geen kanteling van het bekken.',
  },
  {
    naam: 'Glute Bridge',
    beschrijving: 'Lig op rug, voeten plat op de grond. Duw heupen omhoog tot een rechte lijn. Knijp billen samen bovenin.',
    sets: 3,
    reps: 15,
    emoji: '🌉',
    tip: 'Houd de bovenpositie 2 seconden vast voor meer activatie.',
  },
  {
    naam: 'Side Plank',
    beschrijving: 'Steun op één onderarm, voeten op elkaar. Houd heupen omhoog. Wissel van zijde na elke set.',
    sets: 2,
    duur_seconden: 30,
    emoji: '↔️',
    tip: 'Beide kanten doen telt als 1 set — links én rechts.',
  },
  {
    naam: 'Superman',
    beschrijving: 'Lig op buik, armen gestrekt voor je. Til gelijktijdig armen en benen op van de grond. Houd 2 sec vast.',
    sets: 3,
    reps: 12,
    emoji: '🦸',
    tip: 'Goed voor de onderrug — lage belasting, hoog effect.',
  },
]

// Pas oefening aan op basis van vorige moeilijkheidsrating
function pasoefening(basis: CoreOefening, moeilijkheid: number | undefined): CoreOefening {
  if (moeilijkheid === undefined) return basis
  if (moeilijkheid === 0) {
    // Was makkelijk → verhoog
    return {
      ...basis,
      sets: Math.min(basis.sets + 1, 5),
      reps: basis.reps ? Math.min(basis.reps + 2, 20) : undefined,
      duur_seconden: basis.duur_seconden ? Math.min(basis.duur_seconden + 10, 90) : undefined,
    }
  }
  if (moeilijkheid === 2) {
    // Was zwaar → verlaag
    return {
      ...basis,
      sets: Math.max(basis.sets - 1, 2),
      reps: basis.reps ? Math.max(basis.reps - 2, 6) : undefined,
      duur_seconden: basis.duur_seconden ? Math.max(basis.duur_seconden - 10, 20) : undefined,
    }
  }
  return basis
}

function isoWeeknummer(datum: string): number {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dag)
  const jaarStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7)
}

function CountdownTimer({ seconden, onKlaar }: { seconden: number; onKlaar?: () => void }) {
  const [resterend, setResterend] = useState(seconden)
  const [actief, setActief] = useState(false)
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setResterend(seconden); setActief(false) }, [seconden])

  useEffect(() => {
    if (actief) {
      interval.current = setInterval(() => {
        setResterend(r => {
          if (r <= 1) { clearInterval(interval.current!); setActief(false); onKlaar?.(); return 0 }
          return r - 1
        })
      }, 1000)
    } else if (interval.current) clearInterval(interval.current)
    return () => { if (interval.current) clearInterval(interval.current) }
  }, [actief, onKlaar])

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="text-5xl font-bold tabular-nums text-white">{resterend}s</div>
      <div className="flex gap-2">
        <button onClick={() => setActief(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#06b6d4] text-white font-medium">
          {actief ? <Pause size={16} /> : <Play size={16} />}
          {actief ? 'Pauze' : resterend === seconden ? 'Start' : 'Hervat'}
        </button>
        <button onClick={() => { setResterend(seconden); setActief(false) }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#222230] text-[#8888a8] border border-[#2d2d3e]">
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}

const MOEILIJKHEID_OPTIES = [
  { label: 'Was makkelijk', icon: TrendingUp, kleur: 'bg-blue-950 text-blue-400 border-blue-800', waarde: 0 },
  { label: 'Ging goed', icon: Minus, kleur: 'bg-green-950 text-green-400 border-green-800', waarde: 1 },
  { label: 'Was zwaar', icon: TrendingDown, kleur: 'bg-orange-950 text-orange-300 border-orange-800', waarde: 2 },
]

export function CoreSessieClient() {
  const router = useRouter()
  const supabase = createClient()
  const [huidig, setHuidig] = useState(0)
  const [beoordelingen, setBeoordelingen] = useState<Record<number, number>>({})
  const [keuze, setKeuze] = useState<number | null>(null)
  const [afgerond, setAfgerond] = useState(false)
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  // Laad vorige moeilijkheidsratings uit localStorage
  const vorigeRatings: Record<string, number> = (() => {
    try { return JSON.parse(localStorage.getItem('core-moeilijkheid') ?? '{}') } catch { return {} }
  })()

  const oefeningen = CORE_OEFENINGEN_BASIS.map((o, i) =>
    pasoefening(o, vorigeRatings[i])
  )

  const oefening = oefeningen[huidig]
  const totaal = oefeningen.length
  const isLaatste = huidig === totaal - 1

  async function markeerGedaan() {
    if (keuze === null) return
    const nieuweBeoordelingen = { ...beoordelingen, [huidig]: keuze }
    setBeoordelingen(nieuweBeoordelingen)

    if (isLaatste) {
      setOpslaan(true)
      setFout(null)

      // Sla moeilijkheid op voor aanpassing volgende keer
      const nieuweRatings: Record<string, number> = {}
      oefeningen.forEach((_, i) => {
        if (nieuweBeoordelingen[i] !== undefined) nieuweRatings[i] = nieuweBeoordelingen[i]
      })
      try { localStorage.setItem('core-moeilijkheid', JSON.stringify(nieuweRatings)) } catch { /* ok */ }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setFout('Niet ingelogd — sessie kon niet worden opgeslagen.'); setOpslaan(false); return }

      const vandaag = new Date().toISOString().split('T')[0]
      const gemMoeilijkheid = Object.values(nieuweBeoordelingen).reduce((a, b) => a + b, 0) / totaal
      const beschrijving = gemMoeilijkheid <= 0.5 ? 'Core stability — makkelijk'
        : gemMoeilijkheid <= 1.2 ? 'Core stability — goed niveau'
        : 'Core stability — intensief'

      const { error } = await supabase.from('training_sessions').insert({
        user_id: user.id,
        datum: vandaag,
        type: 'core',
        beschrijving,
        duur_minuten: Math.round(totaal * 4),
        afstand_km: 0,
        intensiteit: 'gemiddeld',
        voltooid: true,
        overgeslagen: false,
        week_nummer: isoWeeknummer(vandaag),
      } as never)

      setOpslaan(false)
      if (error) { setFout(`Opslaan mislukt: ${error.message}`); return }
      setAfgerond(true)
    } else {
      setKeuze(null)
      setHuidig(h => h + 1)
    }
  }

  if (afgerond) {
    const makkelijk = Object.values(beoordelingen).filter(v => v === 0).length
    const goed = Object.values(beoordelingen).filter(v => v === 1).length
    const zwaar = Object.values(beoordelingen).filter(v => v === 2).length
    return (
      <div className="min-h-screen bg-[#111118] flex flex-col items-center justify-center p-6 gap-6">
        <div className="w-16 h-16 rounded-full bg-cyan-950 flex items-center justify-center text-3xl">🧘</div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Core sessie klaar!</h2>
          <p className="text-[#8888a8]">{totaal} oefeningen · sterker onderrug</p>
        </div>
        {/* Samenvatting */}
        <div className="w-full max-w-xs bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-4 flex justify-around">
          {makkelijk > 0 && <div className="text-center"><p className="text-lg font-bold text-blue-400">{makkelijk}</p><p className="text-xs text-[#55556a]">makkelijk</p></div>}
          {goed > 0 && <div className="text-center"><p className="text-lg font-bold text-green-400">{goed}</p><p className="text-xs text-[#55556a]">goed</p></div>}
          {zwaar > 0 && <div className="text-center"><p className="text-lg font-bold text-orange-400">{zwaar}</p><p className="text-xs text-[#55556a]">zwaar</p></div>}
        </div>
        {makkelijk > 0 && (
          <p className="text-sm text-[#8888a8] text-center max-w-xs">
            Volgende sessie worden de makkelijke oefeningen iets intensiever. 💪
          </p>
        )}
        <button onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs py-3 rounded-2xl bg-[#06b6d4] text-white font-semibold text-center">
          Terug naar dashboard
        </button>
      </div>
    )
  }

  const huidigVorigeRating = vorigeRatings[huidig]

  return (
    <div className="min-h-screen bg-[#111118] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/dashboard')} className="text-[#8888a8]"><X size={22} /></button>
          <div className="flex-1">
            <p className="text-xs text-[#8888a8]">Core stability</p>
            <p className="text-sm font-medium text-white">{huidig + 1} van {totaal}</p>
          </div>
        </div>
        <div className="flex gap-1">
          {oefeningen.map((_, i) => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors',
              i in beoordelingen ? 'bg-[#06b6d4]' : i === huidig ? 'bg-[#06b6d4]/50' : 'bg-[#2d2d3e]')} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Oefening info */}
        <div className="bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{oefening.emoji}</span>
            <div>
              <h1 className="text-xl font-bold text-white">{oefening.naam}</h1>
              {huidigVorigeRating === 0 && (
                <span className="text-xs text-blue-400 font-medium">↑ Intensiteit verhoogd</span>
              )}
              {huidigVorigeRating === 2 && (
                <span className="text-xs text-orange-400 font-medium">↓ Intensiteit verlaagd</span>
              )}
            </div>
          </div>
          <p className="text-sm text-[#8888a8] leading-relaxed mb-3">{oefening.beschrijving}</p>
          <div className="flex items-center gap-2 bg-[#06b6d4]/10 rounded-xl px-3 py-2">
            <span className="text-xs text-[#06b6d4] font-medium">💡 {oefening.tip}</span>
          </div>
        </div>

        {/* Sets / timer */}
        <div className="bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-4 mb-4">
          {oefening.duur_seconden ? (
            <>
              <div className="flex items-center gap-2 mb-1 text-sm text-[#8888a8]">
                <Timer size={16} className="text-[#06b6d4]" />
                <span>{oefening.sets} sets van {oefening.duur_seconden}s</span>
              </div>
              <CountdownTimer seconden={oefening.duur_seconden} />
            </>
          ) : (
            <div className="flex items-center justify-center gap-6 py-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{oefening.sets}</p>
                <p className="text-xs text-[#8888a8] mt-1">sets</p>
              </div>
              <div className="text-[#2d2d3e] text-2xl">×</div>
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{oefening.reps}</p>
                <p className="text-xs text-[#8888a8] mt-1">herhalingen</p>
              </div>
            </div>
          )}
        </div>

        {/* Moeilijkheid */}
        <div className="bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-4 mb-4">
          <p className="text-sm font-medium text-white mb-3">Hoe ging het?</p>
          <div className="flex gap-2">
            {MOEILIJKHEID_OPTIES.map(opt => {
              const Icon = opt.icon
              return (
                <button key={opt.waarde} onClick={() => setKeuze(opt.waarde)}
                  className={cn('flex-1 py-2.5 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-1',
                    keuze === opt.waarde ? opt.kleur : 'bg-[#222230] text-[#8888a8] border-[#2d2d3e]')}>
                  <Icon size={14} />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="px-4 pb-8 pt-2 bg-[#111118] border-t border-[#2d2d3e]">
        {fout && (
          <div className="mb-3 px-3 py-2 bg-red-950 border border-red-800 rounded-xl text-xs text-red-400">{fout}</div>
        )}
        <div className="flex gap-3">
          {huidig > 0 && (
            <button onClick={() => { setKeuze(null); setHuidig(h => h - 1) }}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] text-[#8888a8]">
              <ChevronLeft size={18} />
            </button>
          )}
          <button onClick={markeerGedaan} disabled={keuze === null || opslaan}
            className={cn('flex-1 py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all',
              keuze !== null && !opslaan ? 'bg-[#06b6d4] text-white' : 'bg-[#2d2d3e] text-[#55556a] cursor-not-allowed')}>
            <CheckCircle2 size={18} />
            {opslaan ? 'Opslaan…' : isLaatste ? 'Sessie afronden' : 'Volgende oefening'}
          </button>
          {!isLaatste && (
            <button onClick={() => { setKeuze(null); setHuidig(h => Math.min(h + 1, totaal - 1)) }}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] text-[#8888a8]">
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
