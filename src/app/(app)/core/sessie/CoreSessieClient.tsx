'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CheckCircle2, Timer, Play, Pause, RotateCcw, X } from 'lucide-react'

interface CoreOefening {
  naam: string
  beschrijving: string
  sets: number
  reps?: number
  duur_seconden?: number
  emoji: string
  tip: string
}

const CORE_OEFENINGEN: CoreOefening[] = [
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
      <div className="text-5xl font-bold tabular-nums text-[#1a1612]">{resterend}s</div>
      <div className="flex gap-2">
        <button onClick={() => setActief(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#06b6d4] text-white font-medium">
          {actief ? <Pause size={16} /> : <Play size={16} />}
          {actief ? 'Pauze' : resterend === seconden ? 'Start' : 'Hervat'}
        </button>
        <button onClick={() => { setResterend(seconden); setActief(false) }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#f5f3f0] text-[#6b6560] border border-[#e8e3dc]">
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}

const PIJN_OPTIES = [
  { label: 'Geen pijn', waarde: 0, kleur: 'bg-green-100 text-green-700 border-green-300' },
  { label: 'Lichte pijn', waarde: 1, kleur: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { label: 'Veel pijn', waarde: 2, kleur: 'bg-red-100 text-red-700 border-red-300' },
]

export function CoreSessieClient() {
  const router = useRouter()
  const supabase = createClient()
  const [huidig, setHuidig] = useState(0)
  const [gedaan, setGedaan] = useState<Record<number, number>>({})
  const [pijnKeuze, setPijnKeuze] = useState<number | null>(null)
  const [afgerond, setAfgerond] = useState(false)

  const oefening = CORE_OEFENINGEN[huidig]
  const totaal = CORE_OEFENINGEN.length
  const isLaatste = huidig === totaal - 1

  async function markeerGedaan() {
    if (pijnKeuze === null) return
    const nieuwGedaan = { ...gedaan, [huidig]: pijnKeuze }
    setGedaan(nieuwGedaan)
    if (isLaatste) {
      // Sla core sessie op in training_sessions
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const vandaag = new Date().toISOString().split('T')[0]
        const gemPijn = Object.values(nieuwGedaan).reduce((a, b) => a + b, 0) / totaal
        const beschrijving = gemPijn === 0 ? 'Core stability — geen pijn' :
          gemPijn <= 1 ? 'Core stability — lichte pijn' : 'Core stability — pijn aanwezig'
        await supabase.from('training_sessions').insert({
          user_id: user.id,
          datum: vandaag,
          type: 'core',
          beschrijving,
          duur_minuten: Math.round(totaal * 4), // ~4 min per oefening
          afstand_km: 0,
          intensiteit: 'gemiddeld',
          voltooid: true,
          overgeslagen: false,
        } as never)
      }
      setAfgerond(true)
    } else {
      setPijnKeuze(null)
      setHuidig(h => h + 1)
    }
  }

  if (afgerond) {
    return (
      <div className="min-h-screen bg-[#f5f3f0] flex flex-col items-center justify-center p-6 gap-6">
        <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center text-3xl">🧘</div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1a1612] mb-2">Core sessie klaar!</h2>
          <p className="text-[#6b6560]">{totaal} oefeningen · sterker onderrug</p>
        </div>
        <button onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs py-3 rounded-2xl bg-[#06b6d4] text-white font-semibold text-center">
          Terug naar dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/dashboard')} className="text-[#6b6560]"><X size={22} /></button>
          <div className="flex-1">
            <p className="text-xs text-[#6b6560]">Core stability</p>
            <p className="text-sm font-medium text-[#1a1612]">{huidig + 1} van {totaal}</p>
          </div>
        </div>
        <div className="flex gap-1">
          {CORE_OEFENINGEN.map((_, i) => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors',
              i in gedaan ? 'bg-[#06b6d4]' : i === huidig ? 'bg-[#06b6d4]/50' : 'bg-[#e8e3dc]')} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Oefening info */}
        <div className="bg-white rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{oefening.emoji}</span>
            <h1 className="text-xl font-bold text-[#1a1612]">{oefening.naam}</h1>
          </div>
          <p className="text-sm text-[#6b6560] leading-relaxed mb-3">{oefening.beschrijving}</p>
          <div className="flex items-center gap-2 bg-[#06b6d4]/10 rounded-xl px-3 py-2">
            <span className="text-xs text-[#06b6d4] font-medium">💡 {oefening.tip}</span>
          </div>
        </div>

        {/* Sets / timer */}
        <div className="bg-white rounded-2xl p-4 mb-4">
          {oefening.duur_seconden ? (
            <>
              <div className="flex items-center gap-2 mb-1 text-sm text-[#6b6560]">
                <Timer size={16} className="text-[#06b6d4]" />
                <span>{oefening.sets} sets van {oefening.duur_seconden}s</span>
              </div>
              <CountdownTimer seconden={oefening.duur_seconden} />
            </>
          ) : (
            <div className="flex items-center justify-center gap-6 py-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-[#1a1612]">{oefening.sets}</p>
                <p className="text-xs text-[#6b6560] mt-1">sets</p>
              </div>
              <div className="text-[#e8e3dc] text-2xl">×</div>
              <div className="text-center">
                <p className="text-3xl font-bold text-[#1a1612]">{oefening.reps}</p>
                <p className="text-xs text-[#6b6560] mt-1">herhalingen</p>
              </div>
            </div>
          )}
        </div>

        {/* Pijn */}
        <div className="bg-white rounded-2xl p-4 mb-4">
          <p className="text-sm font-medium text-[#1a1612] mb-3">Hoe voelde dit?</p>
          <div className="flex gap-2">
            {PIJN_OPTIES.map(opt => (
              <button key={opt.waarde} onClick={() => setPijnKeuze(opt.waarde)}
                className={cn('flex-1 py-2 rounded-xl text-xs font-medium border transition-all',
                  pijnKeuze === opt.waarde ? opt.kleur : 'bg-[#f5f3f0] text-[#6b6560] border-[#e8e3dc]')}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="px-4 pb-8 pt-2 bg-[#f5f3f0] border-t border-[#e8e3dc]">
        <div className="flex gap-3">
          {huidig > 0 && (
            <button onClick={() => { setPijnKeuze(null); setHuidig(h => h - 1) }}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-white border border-[#e8e3dc] text-[#6b6560]">
              <ChevronLeft size={18} />
            </button>
          )}
          <button onClick={markeerGedaan} disabled={pijnKeuze === null}
            className={cn('flex-1 py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all',
              pijnKeuze !== null ? 'bg-[#06b6d4] text-white' : 'bg-[#e8e3dc] text-[#9ca3af] cursor-not-allowed')}>
            <CheckCircle2 size={18} />
            {isLaatste ? 'Sessie afronden' : 'Volgende oefening'}
          </button>
          {!isLaatste && (
            <button onClick={() => { setPijnKeuze(null); setHuidig(h => Math.min(h + 1, totaal - 1)) }}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-white border border-[#e8e3dc] text-[#6b6560]">
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
