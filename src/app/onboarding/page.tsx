'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const RACE_TYPES = [
  { value: 'marathon', label: 'Marathon', icon: '🏅', sub: '42.2 km' },
  { value: 'halve_marathon', label: 'Halve marathon', icon: '🥈', sub: '21.1 km' },
  { value: 'triathlon_heel', label: 'Triathlon', icon: '🏊', sub: 'Heel' },
  { value: 'triathlon_half', label: 'Triathlon', icon: '🏊', sub: 'Half' },
  { value: '10km', label: '10 km', icon: '🎽', sub: 'Hardlopen' },
  { value: 'anders', label: 'Anders', icon: '🎯', sub: 'Eigen doel' },
]

const NIVEAUS = [
  { value: 20, label: 'Beginner', sub: 'Ik loop nog niet zo lang of ben herstellende van blessure', icon: '🌱' },
  { value: 40, label: 'Gevorderd', sub: 'Ik loop regelmatig en heb al wedstrijden gelopen', icon: '🔥' },
  { value: 60, label: 'Ervaren', sub: 'Ik loop hoge kilometrage en ken mijn lichaam goed', icon: '⚡' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [stap, setStap] = useState(0)
  const [laden, setLaden] = useState(false)

  // Stap 0: doel
  const [raceType, setRaceType] = useState('')
  const [raceNaam, setRaceNaam] = useState('')
  const [raceDatum, setRaceDatum] = useState('')
  const [tijdsdoel, setTijdsdoel] = useState('')

  // Stap 1: niveau
  const [kmPerWeek, setKmPerWeek] = useState(0)

  // Stap 2: finetuning
  const [geboortedatum, setGeboortedatum] = useState('')
  const [maxHartslag, setMaxHartslag] = useState('')

  async function afronden() {
    setLaden(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({
      km_per_week: kmPerWeek || 40,
      geboortedatum: geboortedatum || null,
      max_hartslag: maxHartslag ? parseInt(maxHartslag) : null,
      onboarding_voltooid: true,
    } as never).eq('id', user.id)

    if (raceType && raceDatum) {
      await supabase.from('goals').insert({
        user_id: user.id,
        naam: raceNaam || raceType,
        type: raceType,
        datum: raceDatum,
        tijdsdoel: tijdsdoel || null,
        actief: true,
      } as never)
    }

    router.push('/schema')
  }

  const stapTitels = ['Jouw doel', 'Jouw niveau', 'Laatste details']

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col">
      {/* Progress bar */}
      <div className="flex gap-1.5 p-5 pt-12">
        {stapTitels.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i <= stap ? 'bg-[#f97316]' : 'bg-[#e8e3dc]'
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col px-6 pb-8 max-w-sm mx-auto w-full">

        {/* Stap 0: Doel */}
        {stap === 0 && (
          <div className="flex-1 flex flex-col gap-6">
            <div>
              <p className="text-xs font-semibold text-[#f97316] uppercase tracking-widest mb-1">Stap 1 van 3</p>
              <h1 className="text-2xl font-bold text-[#1a1612]">Waar loop je naartoe?</h1>
              <p className="text-sm text-[#6b6560] mt-1">Kies je doel zodat we een passend schema kunnen maken.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {RACE_TYPES.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRaceType(t => t === r.value ? '' : r.value)}
                  className={cn(
                    'flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left',
                    raceType === r.value
                      ? 'border-[#f97316] bg-[#f97316]/8'
                      : 'border-[#e8e3dc] bg-white'
                  )}
                >
                  <span className="text-2xl mb-1">{r.icon}</span>
                  <span className={cn('font-semibold text-sm', raceType === r.value ? 'text-[#f97316]' : 'text-[#1a1612]')}>{r.label}</span>
                  <span className="text-xs text-[#a09990]">{r.sub}</span>
                </button>
              ))}
            </div>

            {raceType && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#6b6560] uppercase tracking-wide mb-1.5 block">Naam evenement</label>
                  <input
                    type="text"
                    placeholder="bijv. TCS Amsterdam Marathon"
                    value={raceNaam}
                    onChange={e => setRaceNaam(e.target.value)}
                    className="w-full bg-white border border-[#e8e3dc] rounded-2xl px-4 py-3 text-[#1a1612] placeholder:text-[#c0bab4] focus:outline-none focus:border-[#f97316] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6b6560] uppercase tracking-wide mb-1.5 block">Datum</label>
                  <input
                    type="date"
                    value={raceDatum}
                    onChange={e => setRaceDatum(e.target.value)}
                    className="w-full bg-white border border-[#e8e3dc] rounded-2xl px-4 py-3 text-[#1a1612] focus:outline-none focus:border-[#f97316] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6b6560] uppercase tracking-wide mb-1.5 block">Tijdsdoel (optioneel)</label>
                  <input
                    type="text"
                    placeholder="bijv. 3:30:00"
                    value={tijdsdoel}
                    onChange={e => setTijdsdoel(e.target.value)}
                    className="w-full bg-white border border-[#e8e3dc] rounded-2xl px-4 py-3 text-[#1a1612] placeholder:text-[#c0bab4] focus:outline-none focus:border-[#f97316] text-sm"
                  />
                </div>
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2">
              <Button size="lg" onClick={() => setStap(1)} disabled={!raceType}>
                Volgende
              </Button>
              <button onClick={() => setStap(1)} className="text-sm text-[#a09990] py-2 text-center">
                Sla over
              </button>
            </div>
          </div>
        )}

        {/* Stap 1: Niveau */}
        {stap === 1 && (
          <div className="flex-1 flex flex-col gap-6">
            <div>
              <p className="text-xs font-semibold text-[#f97316] uppercase tracking-widest mb-1">Stap 2 van 3</p>
              <h1 className="text-2xl font-bold text-[#1a1612]">Wat is jouw niveau?</h1>
              <p className="text-sm text-[#6b6560] mt-1">We passen het schema aan jouw conditie aan.</p>
            </div>

            <div className="flex flex-col gap-3">
              {NIVEAUS.map(n => (
                <button
                  key={n.value}
                  onClick={() => setKmPerWeek(n.value)}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-2xl border-2 transition-all text-left',
                    kmPerWeek === n.value
                      ? 'border-[#f97316] bg-[#f97316]/8'
                      : 'border-[#e8e3dc] bg-white'
                  )}
                >
                  <span className="text-3xl">{n.icon}</span>
                  <div>
                    <p className={cn('font-semibold', kmPerWeek === n.value ? 'text-[#f97316]' : 'text-[#1a1612]')}>{n.label}</p>
                    <p className="text-xs text-[#6b6560] mt-0.5 leading-relaxed">{n.sub}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <Button size="lg" onClick={() => setStap(2)} disabled={!kmPerWeek}>
                Volgende
              </Button>
              <button onClick={() => setStap(0)} className="text-sm text-[#a09990] py-2 text-center">
                Terug
              </button>
            </div>
          </div>
        )}

        {/* Stap 2: Finetuning */}
        {stap === 2 && (
          <div className="flex-1 flex flex-col gap-6">
            <div>
              <p className="text-xs font-semibold text-[#f97316] uppercase tracking-widest mb-1">Stap 3 van 3</p>
              <h1 className="text-2xl font-bold text-[#1a1612]">Laatste details</h1>
              <p className="text-sm text-[#6b6560] mt-1">Optioneel — helpt bij nauwkeurigere hartslagzones.</p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-[#6b6560] uppercase tracking-wide mb-1.5 block">Geboortedatum</label>
                <input
                  type="date"
                  value={geboortedatum}
                  onChange={e => setGeboortedatum(e.target.value)}
                  className="w-full bg-white border border-[#e8e3dc] rounded-2xl px-4 py-3 text-[#1a1612] focus:outline-none focus:border-[#f97316] text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6b6560] uppercase tracking-wide mb-1.5 block">Max hartslag</label>
                <p className="text-xs text-[#a09990] mb-2">Op je sporthorloge of hartslagmeter. Schatting: 220 − leeftijd.</p>
                <input
                  type="number"
                  placeholder="bijv. 182"
                  value={maxHartslag}
                  onChange={e => setMaxHartslag(e.target.value)}
                  className="w-full bg-white border border-[#e8e3dc] rounded-2xl px-4 py-3 text-[#1a1612] placeholder:text-[#c0bab4] focus:outline-none focus:border-[#f97316] text-sm"
                  min="100" max="220"
                />
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <Button size="lg" onClick={afronden} loading={laden}>
                Aan de slag 🚀
              </Button>
              <button onClick={() => setStap(1)} className="text-sm text-[#a09990] py-2 text-center">
                Terug
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
