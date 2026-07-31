'use client'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const SPORTEN = [
  { naam: 'Padel', emoji: '🎾', duur: 90, intensiteit: 'gemiddeld' as const },
  { naam: 'Hockey', emoji: '🏑', duur: 90, intensiteit: 'zwaar' as const },
  { naam: 'Voetbal', emoji: '⚽', duur: 90, intensiteit: 'zwaar' as const },
  { naam: 'Tennis', emoji: '🎾', duur: 60, intensiteit: 'gemiddeld' as const },
  { naam: 'Fietsen', emoji: '🚴', duur: 60, intensiteit: 'gemiddeld' as const },
  { naam: 'Zwemmen', emoji: '🏊', duur: 45, intensiteit: 'gemiddeld' as const },
  { naam: 'Kracht', emoji: '🏋️', duur: 45, intensiteit: 'gemiddeld' as const },
  { naam: 'Wandelen', emoji: '🚶', duur: 60, intensiteit: 'licht' as const },
  { naam: 'Skiën', emoji: '⛷️', duur: 180, intensiteit: 'zwaar' as const },
  { naam: 'Anders', emoji: '🤸', duur: 60, intensiteit: 'gemiddeld' as const },
]

const INTENSITEITEN = [
  { v: 'licht', l: 'Licht', uitleg: 'Kon makkelijk praten' },
  { v: 'gemiddeld', l: 'Gemiddeld', uitleg: 'Flink gezweet' },
  { v: 'zwaar', l: 'Zwaar', uitleg: 'Vol gas, kapot na afloop' },
] as const

interface Props {
  vandaag: string
  onSluiten: (opgeslagen?: boolean) => void
}

export function SportActiviteitModal({ vandaag, onSluiten }: Props) {
  const supabase = createClient()
  const [sport, setSport] = useState<string>('')
  const [eigenNaam, setEigenNaam] = useState('')
  const [datum, setDatum] = useState(vandaag)
  const [duur, setDuur] = useState('')
  const [intensiteit, setIntensiteit] = useState<'licht' | 'gemiddeld' | 'zwaar'>('gemiddeld')
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  function kiesSport(s: typeof SPORTEN[number]) {
    setSport(s.naam)
    // Voorinvullen met een realistische standaard, maar altijd aanpasbaar —
    // zo is loggen meestal twee tikken werk.
    if (!duur) setDuur(String(s.duur))
    setIntensiteit(s.intensiteit)
  }

  const naam = sport === 'Anders' ? eigenNaam.trim() : sport
  const geldig = naam.length > 0 && Number(duur) > 0

  async function opslaan() {
    if (!geldig) return
    setLaden(true)
    setFout(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFout('Niet ingelogd'); setLaden(false); return }

    const { error } = await supabase.from('sport_activities').insert({
      user_id: user.id,
      datum,
      sport: naam,
      duur_minuten: Number(duur),
      intensiteit,
      notitie: null,
    })
    if (error) { setFout(error.message); setLaden(false); return }
    onSluiten(true)
  }

  // Schermvullend i.p.v. bottom sheet: geen dvh/scroll-lock-trucs nodig.
  return (
    <div className="fixed inset-0 z-50 bg-[#111118] flex flex-col">
      <div
        className="flex items-center gap-3 px-4 pb-3 shrink-0 border-b border-[#2d2d3e]"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <button onClick={() => onSluiten()} className="p-1.5 -ml-1.5 text-white" aria-label="Terug">
          <ArrowLeft size={22} />
        </button>
        <p className="text-xs font-semibold text-[#f97316] uppercase tracking-wide">Andere sport loggen</p>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide mb-2">Sport</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {SPORTEN.map(s => (
            <button
              key={s.naam}
              onClick={() => kiesSport(s)}
              className={cn(
                'flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all',
                sport === s.naam
                  ? 'bg-[#f97316]/10 border-[#f97316] text-white'
                  : 'bg-[#1b1b27] border-[#2d2d3e] text-[#8888a8]'
              )}
            >
              <span className="text-xl">{s.emoji}</span>
              <span className="text-xs font-medium">{s.naam}</span>
            </button>
          ))}
        </div>

        {sport === 'Anders' && (
          <input
            value={eigenNaam}
            onChange={e => setEigenNaam(e.target.value)}
            placeholder="Welke sport?"
            className="w-full bg-[#222230] border border-[#2d2d3e] rounded-2xl px-4 py-3 text-white placeholder:text-[#55556a] focus:outline-none focus:border-[#f97316] mb-5"
          />
        )}

        <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide mb-2">Wanneer</p>
        <input
          type="date"
          value={datum}
          max={vandaag}
          onChange={e => setDatum(e.target.value)}
          className="w-full bg-[#222230] border border-[#2d2d3e] rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-[#f97316] mb-5"
        />

        <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide mb-2">Duur</p>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            inputMode="numeric"
            value={duur}
            onChange={e => setDuur(e.target.value)}
            placeholder="60"
            className="flex-1 bg-[#222230] border border-[#2d2d3e] rounded-2xl px-4 py-3 text-white placeholder:text-[#55556a] focus:outline-none focus:border-[#f97316]"
          />
          <span className="text-sm text-[#8888a8]">minuten</span>
        </div>
        <div className="flex gap-2 mb-5">
          {[45, 60, 90, 120].map(m => (
            <button key={m} onClick={() => setDuur(String(m))}
              className="flex-1 py-2 rounded-xl text-xs font-medium bg-[#1b1b27] border border-[#2d2d3e] text-[#8888a8]">
              {m}m
            </button>
          ))}
        </div>

        <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide mb-2">Hoe zwaar was het</p>
        <div className="flex flex-col gap-2 mb-6">
          {INTENSITEITEN.map(i => (
            <button
              key={i.v}
              onClick={() => setIntensiteit(i.v)}
              className={cn(
                'flex items-baseline gap-2 px-4 py-3 rounded-2xl border text-left transition-all',
                intensiteit === i.v
                  ? 'bg-[#f97316]/10 border-[#f97316] text-white'
                  : 'bg-[#1b1b27] border-[#2d2d3e] text-[#8888a8]'
              )}
            >
              <span className="text-sm font-semibold">{i.l}</span>
              <span className="text-xs text-[#55556a]">{i.uitleg}</span>
            </button>
          ))}
        </div>

        {fout && <p className="text-xs text-red-400 mb-3">⚠️ {fout}</p>}

        <button
          onClick={opslaan}
          disabled={!geldig || laden}
          className={cn('w-full py-3.5 rounded-2xl text-sm font-bold transition-all',
            geldig && !laden ? 'bg-[#f97316] text-white' : 'bg-[#2d2d3e] text-[#55556a]'
          )}
        >
          {laden ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}
