'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Stap = 'profiel' | 'niveau' | 'resultaten' | 'doel' | 'vakanties' | 'klaar'

interface Resultaat {
  type: string
  datum: string
  tijd: string
  notitie: string
}

interface Vakantie {
  naam: string
  start_datum: string
  eind_datum: string
  kan_trainen: 'ja' | 'nee' | 'beperkt'
}

const STAPPEN: Stap[] = ['profiel', 'niveau', 'resultaten', 'doel', 'vakanties', 'klaar']

const SPORT_TYPES = [
  { value: 'marathon', label: 'Marathon' },
  { value: 'halve_marathon', label: 'Halve marathon' },
  { value: 'triathlon_heel', label: 'Triathlon (heel)' },
  { value: 'triathlon_half', label: 'Triathlon (half)' },
  { value: 'anders', label: 'Anders' },
]

const KAN_TRAINEN_OPTIES = [
  { value: 'ja', label: 'Ja', kleur: 'bg-green-600' },
  { value: 'beperkt', label: 'Beperkt', kleur: 'bg-yellow-600' },
  { value: 'nee', label: 'Nee', kleur: 'bg-red-600' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [stap, setStap] = useState<Stap>('profiel')
  const [laden, setLaden] = useState(false)

  // Profiel
  const [geboortedatum, setGeboortedatum] = useState('')

  // Niveau
  const [kmPerWeek, setKmPerWeek] = useState('')
  const [runsPerWeek, setRunsPerWeek] = useState('')

  // Resultaten
  const [resultaten, setResultaten] = useState<Resultaat[]>([])
  const [nieuwResultaat, setNieuwResultaat] = useState<Resultaat>({ type: 'marathon', datum: '', tijd: '', notitie: '' })

  // Doel
  const [doelType, setDoelType] = useState('marathon')
  const [doelNaam, setDoelNaam] = useState('Amsterdam Marathon 2026')
  const [doelDatum, setDoelDatum] = useState('2026-10-18')
  const [doelTijd, setDoelTijd] = useState('')

  // Vakanties
  const [vakanties, setVakanties] = useState<Vakantie[]>([
    { naam: 'Namibië', start_datum: '2026-07-01', eind_datum: '2026-07-14', kan_trainen: 'nee' },
    { naam: 'Kenia', start_datum: '2026-09-01', eind_datum: '2026-09-10', kan_trainen: 'nee' },
    { naam: 'Italië', start_datum: '2026-09-14', eind_datum: '2026-09-21', kan_trainen: 'ja' },
  ])
  const [nieuweVakantie, setNieuweVakantie] = useState<Vakantie>({ naam: '', start_datum: '', eind_datum: '', kan_trainen: 'ja' })

  const stapIndex = STAPPEN.indexOf(stap)

  function volgende() {
    const idx = STAPPEN.indexOf(stap)
    if (idx < STAPPEN.length - 1) setStap(STAPPEN[idx + 1])
  }

  function vorige() {
    const idx = STAPPEN.indexOf(stap)
    if (idx > 0) setStap(STAPPEN[idx - 1])
  }

  function resultaatToevoegen() {
    if (!nieuwResultaat.datum || !nieuwResultaat.tijd) return
    setResultaten([...resultaten, nieuwResultaat])
    setNieuwResultaat({ type: 'marathon', datum: '', tijd: '', notitie: '' })
  }

  function vakantieToevoegen() {
    if (!nieuweVakantie.naam || !nieuweVakantie.start_datum || !nieuweVakantie.eind_datum) return
    setVakanties([...vakanties, nieuweVakantie])
    setNieuweVakantie({ naam: '', start_datum: '', eind_datum: '', kan_trainen: 'ja' })
  }

  async function afronden() {
    setLaden(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({
      geboortedatum: geboortedatum || null,
      km_per_week: kmPerWeek ? parseFloat(kmPerWeek) : null,
      runs_per_week: runsPerWeek ? parseInt(runsPerWeek) : null,
      onboarding_voltooid: true,
    } as never).eq('id', user.id)

    if (resultaten.length > 0) {
      await supabase.from('previous_results').insert(
        resultaten.map(r => ({ ...r, user_id: user.id }))
      )
    }

    await supabase.from('goals').insert({
      user_id: user.id,
      type: doelType as never,
      naam: doelNaam,
      datum: doelDatum,
      tijdsdoel: doelTijd || null,
      actief: true,
    })

    if (vakanties.length > 0) {
      await supabase.from('vacations').insert(
        vakanties.map(v => ({ ...v, user_id: user.id }))
      )
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col p-6">
      {/* Progress */}
      <div className="flex gap-1.5 mb-8 mt-4">
        {STAPPEN.filter(s => s !== 'klaar').map((s, i) => (
          <div
            key={s}
            className={cn('h-1 flex-1 rounded-full transition-all', i <= stapIndex ? 'bg-[#f97316]' : 'bg-[#333]')}
          />
        ))}
      </div>

      <div className="flex-1">
        {/* Stap: Profiel */}
        {stap === 'profiel' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Jouw profiel</h2>
              <p className="text-[#6b7280] mt-1">Optioneel — voor hartslagnormen</p>
            </div>
            <Input
              id="geboortedatum"
              type="date"
              label="Geboortedatum"
              value={geboortedatum}
              onChange={e => setGeboortedatum(e.target.value)}
            />
          </div>
        )}

        {/* Stap: Niveau */}
        {stap === 'niveau' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Jouw loopniveau</h2>
              <p className="text-[#6b7280] mt-1">Zodat we een passend schema kunnen maken</p>
            </div>
            <Input
              id="km"
              type="number"
              label="Gemiddeld km per week (voor blessure)"
              value={kmPerWeek}
              onChange={e => setKmPerWeek(e.target.value)}
              placeholder="bijv. 30"
              min="0"
              max="200"
            />
            <Input
              id="runs"
              type="number"
              label="Aantal runs per week"
              value={runsPerWeek}
              onChange={e => setRunsPerWeek(e.target.value)}
              placeholder="bijv. 4"
              min="1"
              max="14"
            />
          </div>
        )}

        {/* Stap: Resultaten */}
        {stap === 'resultaten' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Eerdere resultaten</h2>
              <p className="text-[#6b7280] mt-1">Optioneel — helpt bij het bepalen van je tijdsdoel</p>
            </div>

            {resultaten.map((r, i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-white">{SPORT_TYPES.find(s => s.value === r.type)?.label}</p>
                  <p className="text-sm text-[#6b7280]">{r.datum} · {r.tijd}</p>
                </div>
                <button onClick={() => setResultaten(resultaten.filter((_, j) => j !== i))} className="text-[#6b7280]">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            <div className="bg-[#1a1a1a] rounded-3xl p-4 flex flex-col gap-3">
              <select
                value={nieuwResultaat.type}
                onChange={e => setNieuwResultaat({ ...nieuwResultaat, type: e.target.value })}
                className="bg-[#242424] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-[#f97316] border border-[#333]"
              >
                {SPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <Input id="r-datum" type="date" label="Datum" value={nieuwResultaat.datum}
                onChange={e => setNieuwResultaat({ ...nieuwResultaat, datum: e.target.value })} />
              <Input id="r-tijd" type="text" label="Tijd (uu:mm:ss)" value={nieuwResultaat.tijd}
                onChange={e => setNieuwResultaat({ ...nieuwResultaat, tijd: e.target.value })}
                placeholder="bijv. 3:45:00" />
              <Button variant="secondary" onClick={resultaatToevoegen}>
                <Plus size={16} className="mr-2" /> Resultaat toevoegen
              </Button>
            </div>
          </div>
        )}

        {/* Stap: Doel */}
        {stap === 'doel' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Jouw doel</h2>
              <p className="text-[#6b7280] mt-1">Waar train je naartoe?</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#9ca3af]">Type</label>
              <select
                value={doelType}
                onChange={e => setDoelType(e.target.value)}
                className="bg-[#242424] text-white rounded-2xl px-4 py-3 focus:outline-none border border-[#333] focus:border-[#f97316]"
              >
                {SPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <Input id="doel-naam" type="text" label="Naam van het evenement" value={doelNaam}
              onChange={e => setDoelNaam(e.target.value)} placeholder="bijv. Amsterdam Marathon 2026" />
            <Input id="doel-datum" type="date" label="Datum" value={doelDatum}
              onChange={e => setDoelDatum(e.target.value)} />
            <Input id="doel-tijd" type="text" label="Tijdsdoel (optioneel)" value={doelTijd}
              onChange={e => setDoelTijd(e.target.value)} placeholder="bijv. 3:45:00" />
          </div>
        )}

        {/* Stap: Vakanties */}
        {stap === 'vakanties' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Vakanties</h2>
              <p className="text-[#6b7280] mt-1">We houden hier rekening mee in je schema</p>
            </div>

            {vakanties.map((v, i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-white">{v.naam}</p>
                  <p className="text-sm text-[#6b7280]">{v.start_datum} → {v.eind_datum}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full mt-1 inline-block',
                    v.kan_trainen === 'ja' ? 'bg-green-900 text-green-300' :
                    v.kan_trainen === 'beperkt' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'
                  )}>
                    {v.kan_trainen === 'ja' ? 'Kan trainen' : v.kan_trainen === 'beperkt' ? 'Beperkt trainen' : 'Niet trainen'}
                  </span>
                </div>
                <button onClick={() => setVakanties(vakanties.filter((_, j) => j !== i))} className="text-[#6b7280]">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            <div className="bg-[#1a1a1a] rounded-3xl p-4 flex flex-col gap-3">
              <Input id="v-naam" type="text" label="Bestemming" value={nieuweVakantie.naam}
                onChange={e => setNieuweVakantie({ ...nieuweVakantie, naam: e.target.value })} placeholder="bijv. Spanje" />
              <Input id="v-start" type="date" label="Van" value={nieuweVakantie.start_datum}
                onChange={e => setNieuweVakantie({ ...nieuweVakantie, start_datum: e.target.value })} />
              <Input id="v-eind" type="date" label="Tot en met" value={nieuweVakantie.eind_datum}
                onChange={e => setNieuweVakantie({ ...nieuweVakantie, eind_datum: e.target.value })} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#9ca3af]">Kan je daar trainen?</label>
                <div className="flex gap-2">
                  {KAN_TRAINEN_OPTIES.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setNieuweVakantie({ ...nieuweVakantie, kan_trainen: o.value as 'ja' | 'nee' | 'beperkt' })}
                      className={cn('flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                        nieuweVakantie.kan_trainen === o.value ? `${o.kleur} text-white` : 'bg-[#242424] text-[#6b7280]'
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="secondary" onClick={vakantieToevoegen}>
                <Plus size={16} className="mr-2" /> Vakantie toevoegen
              </Button>
            </div>
          </div>
        )}

        {/* Stap: Klaar */}
        {stap === 'klaar' && (
          <div className="flex flex-col items-center text-center gap-6 pt-8">
            <div className="text-7xl">🎯</div>
            <div>
              <h2 className="text-3xl font-bold text-white">Je bent er klaar voor!</h2>
              <p className="text-[#6b7280] mt-2">We maken nu jouw persoonlijke trainingsschema. Dit duurt even.</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigatie */}
      <div className="flex gap-3 mt-8">
        {stapIndex > 0 && stap !== 'klaar' && (
          <Button variant="secondary" onClick={vorige} className="flex-1">
            <ChevronLeft size={20} />
          </Button>
        )}
        {stap !== 'klaar' ? (
          <Button onClick={volgende} className="flex-1">
            {stapIndex === STAPPEN.indexOf('vakanties') ? 'Bijna klaar' : 'Volgende'}
            <ChevronRight size={20} className="ml-1" />
          </Button>
        ) : (
          <Button onClick={afronden} size="lg" loading={laden} className="flex-1">
            Schema genereren
          </Button>
        )}
      </div>
    </div>
  )
}
