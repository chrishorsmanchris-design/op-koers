'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react'

type Stap = 'type' | 'details' | 'niveau' | 'resultaten' | 'vakanties' | 'klaar'

const DOEL_TYPES = [
  { value: 'marathon', label: 'Marathon', emoji: '🏅', beschrijving: 'Volledig trainingsschema op jouw niveau' },
  { value: 'halve_marathon', label: 'Halve marathon', emoji: '🥈', beschrijving: 'Opbouwen naar 21,1 km' },
  { value: 'triathlon_heel', label: 'Triathlon', emoji: '🚴', beschrijving: 'Zwemmen, fietsen én lopen' },
  { value: 'triathlon_half', label: 'Halve triathlon', emoji: '🏊', beschrijving: 'Half Ironman afstand' },
  { value: 'fysio', label: 'Alleen fysio', emoji: '💪', beschrijving: 'Geen trainingsschema, wel oefenroutine' },
  { value: 'anders', label: 'Anders', emoji: '🎯', beschrijving: 'Eigen doel instellen' },
]

const KAN_TRAINEN = [
  { value: 'ja', label: 'Ja', kleur: 'border-green-500 bg-green-500/10 text-green-400' },
  { value: 'beperkt', label: 'Beperkt', kleur: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
  { value: 'nee', label: 'Nee', kleur: 'border-red-500 bg-red-500/10 text-red-400' },
]

interface Resultaat { type: string; datum: string; tijd: string; notitie: string }
interface Vakantie { naam: string; start_datum: string; eind_datum: string; kan_trainen: 'ja' | 'nee' | 'beperkt' }

export default function DoelPage() {
  const router = useRouter()
  const [stap, setStap] = useState<Stap>('type')
  const [laden, setLaden] = useState(false)

  const [doelType, setDoelType] = useState('')
  const [doelNaam, setDoelNaam] = useState('')
  const [doelDatum, setDoelDatum] = useState('')
  const [doelTijd, setDoelTijd] = useState('')
  const [kmPerWeek, setKmPerWeek] = useState('')
  const [runsPerWeek, setRunsPerWeek] = useState('')
  const [resultaten, setResultaten] = useState<Resultaat[]>([])
  const [nieuwR, setNieuwR] = useState<Resultaat>({ type: 'marathon', datum: '', tijd: '', notitie: '' })
  const [vakanties, setVakanties] = useState<Vakantie[]>([])
  const [nieuwV, setNieuwV] = useState<Vakantie>({ naam: '', start_datum: '', eind_datum: '', kan_trainen: 'ja' })

  const isFysio = doelType === 'fysio'

  const STAPPEN: Stap[] = isFysio
    ? ['type', 'klaar']
    : ['type', 'details', 'niveau', 'resultaten', 'vakanties', 'klaar']

  const stapIndex = STAPPEN.indexOf(stap)

  function volgende() {
    const idx = STAPPEN.indexOf(stap)
    if (idx < STAPPEN.length - 1) setStap(STAPPEN[idx + 1])
  }

  function vorige() {
    const idx = STAPPEN.indexOf(stap)
    if (idx > 0) setStap(STAPPEN[idx - 1])
  }

  async function opslaan() {
    setLaden(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (kmPerWeek || runsPerWeek) {
      await supabase.from('profiles').update({
        km_per_week: kmPerWeek ? parseFloat(kmPerWeek) : null,
        runs_per_week: runsPerWeek ? parseInt(runsPerWeek) : null,
      } as never).eq('id', user.id)
    }

    if (!isFysio) {
      await supabase.from('goals').insert({
        user_id: user.id,
        type: doelType,
        naam: doelNaam || doelType,
        datum: doelDatum,
        tijdsdoel: doelTijd || null,
        actief: true,
      } as never)
    }

    if (resultaten.length > 0) {
      await supabase.from('previous_results').insert(
        resultaten.map(r => ({ ...r, user_id: user.id })) as never
      )
    }

    if (vakanties.length > 0) {
      await supabase.from('vacations').insert(
        vakanties.map(v => ({ ...v, user_id: user.id })) as never
      )
    }

    if (!isFysio && doelDatum) {
      await fetch('/api/training/genereer', { method: 'POST' })
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0] flex flex-col p-4 pt-8 pb-24">
      {/* Progress */}
      {stap !== 'klaar' && (
        <div className="flex gap-1.5 mb-8">
          {STAPPEN.filter(s => s !== 'klaar').map((s, i) => (
            <div key={s} className={cn('h-1 flex-1 rounded-full transition-all',
              i <= stapIndex ? 'bg-[#f97316]' : 'bg-[#333]')} />
          ))}
        </div>
      )}

      <div className="flex-1 max-w-sm mx-auto w-full">

        {/* Type kiezen */}
        {stap === 'type' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#1a1612]">Wat is je doel?</h2>
              <p className="text-[#6b6560] mt-1">Kies wat je wilt gaan bereiken</p>
            </div>
            <div className="flex flex-col gap-2">
              {DOEL_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setDoelType(t.value)}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                    doelType === t.value
                      ? 'border-[#f97316] bg-[#f97316]/10'
                      : 'border-[#e8e3dc] bg-white'
                  )}
                >
                  <span className="text-3xl">{t.emoji}</span>
                  <div>
                    <p className="font-semibold text-[#1a1612]">{t.label}</p>
                    <p className="text-sm text-[#6b6560]">{t.beschrijving}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Details */}
        {stap === 'details' && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-bold text-[#1a1612]">Details</h2>
              <p className="text-[#6b6560] mt-1">Wanneer en wat is je doel?</p>
            </div>
            <Input id="naam" label="Naam van het evenement" value={doelNaam}
              onChange={e => setDoelNaam(e.target.value)}
              placeholder={doelType === 'marathon' ? 'bijv. Amsterdam Marathon 2026' : 'bijv. mijn doel'} />
            <Input id="datum" type="date" label="Datum" value={doelDatum}
              onChange={e => setDoelDatum(e.target.value)} />
            <Input id="tijd" label="Tijdsdoel (optioneel)" value={doelTijd}
              onChange={e => setDoelTijd(e.target.value)} placeholder="bijv. 3:45:00" />
          </div>
        )}

        {/* Niveau */}
        {stap === 'niveau' && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-bold text-[#1a1612]">Jouw niveau</h2>
              <p className="text-[#6b6560] mt-1">Helpt ons het schema goed te kalibreren</p>
            </div>
            <Input id="km" type="number" label="Km per week (huidig of voor blessure)" value={kmPerWeek}
              onChange={e => setKmPerWeek(e.target.value)} placeholder="bijv. 30" />
            <Input id="runs" type="number" label="Runs per week" value={runsPerWeek}
              onChange={e => setRunsPerWeek(e.target.value)} placeholder="bijv. 4" />
          </div>
        )}

        {/* Eerdere resultaten */}
        {stap === 'resultaten' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#1a1612]">Eerdere resultaten</h2>
              <p className="text-[#6b6560] mt-1">Optioneel — helpt bij je tijdsdoel</p>
            </div>
            {resultaten.map((r, i) => (
              <Card key={i} className="flex justify-between items-center py-3">
                <div>
                  <p className="font-medium text-[#1a1612] text-sm">{r.type} · {r.tijd}</p>
                  <p className="text-xs text-[#6b6560]">{r.datum}</p>
                </div>
                <button onClick={() => setResultaten(resultaten.filter((_, j) => j !== i))}>
                  <Trash2 size={16} className="text-[#6b6560]" />
                </button>
              </Card>
            ))}
            <Card>
              <div className="flex flex-col gap-3">
                <select value={nieuwR.type} onChange={e => setNieuwR({ ...nieuwR, type: e.target.value })}
                  className="bg-[#f0ede8] text-[#1a1612] rounded-xl px-3 py-2.5 border border-[#e8e3dc] focus:outline-none text-sm">
                  {DOEL_TYPES.filter(t => t.value !== 'fysio' && t.value !== 'anders').map(t =>
                    <option key={t.value} value={t.value}>{t.label}</option>
                  )}
                </select>
                <Input id="r-datum" type="date" label="Datum" value={nieuwR.datum}
                  onChange={e => setNieuwR({ ...nieuwR, datum: e.target.value })} />
                <Input id="r-tijd" label="Tijd (uu:mm:ss)" value={nieuwR.tijd}
                  onChange={e => setNieuwR({ ...nieuwR, tijd: e.target.value })} placeholder="3:45:00" />
                <Button variant="secondary" size="sm"
                  onClick={() => { if (nieuwR.datum && nieuwR.tijd) { setResultaten([...resultaten, nieuwR]); setNieuwR({ type: 'marathon', datum: '', tijd: '', notitie: '' }) } }}>
                  <Plus size={14} className="mr-1" /> Toevoegen
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Vakanties */}
        {stap === 'vakanties' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#1a1612]">Vakanties</h2>
              <p className="text-[#6b6560] mt-1">We houden hier rekening mee in je schema</p>
            </div>
            {vakanties.map((v, i) => (
              <Card key={i} className="flex justify-between items-center py-3">
                <div>
                  <p className="font-medium text-[#1a1612] text-sm">{v.naam}</p>
                  <p className="text-xs text-[#6b6560]">{v.start_datum} → {v.eind_datum}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full mt-1 inline-block',
                    v.kan_trainen === 'ja' ? 'bg-green-900/50 text-green-300' :
                    v.kan_trainen === 'beperkt' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-red-900/50 text-red-300'
                  )}>
                    {v.kan_trainen === 'ja' ? 'Kan trainen' : v.kan_trainen === 'beperkt' ? 'Beperkt' : 'Niet trainen'}
                  </span>
                </div>
                <button onClick={() => setVakanties(vakanties.filter((_, j) => j !== i))}>
                  <Trash2 size={16} className="text-[#6b6560]" />
                </button>
              </Card>
            ))}
            <Card>
              <div className="flex flex-col gap-3">
                <Input id="v-naam" label="Bestemming" value={nieuwV.naam}
                  onChange={e => setNieuwV({ ...nieuwV, naam: e.target.value })} placeholder="bijv. Italië" />
                <Input id="v-start" type="date" label="Van" value={nieuwV.start_datum}
                  onChange={e => setNieuwV({ ...nieuwV, start_datum: e.target.value })} />
                <Input id="v-eind" type="date" label="Tot en met" value={nieuwV.eind_datum}
                  onChange={e => setNieuwV({ ...nieuwV, eind_datum: e.target.value })} />
                <div className="flex gap-2">
                  {KAN_TRAINEN.map(o => (
                    <button key={o.value}
                      onClick={() => setNieuwV({ ...nieuwV, kan_trainen: o.value as 'ja' | 'nee' | 'beperkt' })}
                      className={cn('flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                        nieuwV.kan_trainen === o.value ? o.kleur : 'border-[#e8e3dc] text-[#6b6560]')}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <Button variant="secondary" size="sm"
                  onClick={() => { if (nieuwV.naam && nieuwV.start_datum) { setVakanties([...vakanties, nieuwV]); setNieuwV({ naam: '', start_datum: '', eind_datum: '', kan_trainen: 'ja' }) } }}>
                  <Plus size={14} className="mr-1" /> Toevoegen
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Klaar */}
        {stap === 'klaar' && (
          <div className="flex flex-col items-center text-center gap-6 pt-8">
            <div className="text-7xl">{isFysio ? '💪' : '🎯'}</div>
            <div>
              <h2 className="text-3xl font-bold text-[#1a1612]">
                {isFysio ? 'Klaar om te oefenen!' : 'Schema wordt gemaakt!'}
              </h2>
              <p className="text-[#6b6560] mt-2">
                {isFysio
                  ? 'Je kunt fysio-oefeningen toevoegen via de Fysio tab.'
                  : 'Claude maakt nu jouw persoonlijke trainingsschema op basis van de informatie.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigatie */}
      <div className="max-w-sm mx-auto w-full flex gap-3 mt-8">
        {stapIndex > 0 && stap !== 'klaar' && (
          <Button variant="secondary" onClick={vorige}>
            <ChevronLeft size={20} />
          </Button>
        )}
        {stap !== 'klaar' ? (
          <Button onClick={volgende} className="flex-1" disabled={stap === 'type' && !doelType}>
            {stap === 'vakanties' || (isFysio && stap === 'type') ? 'Afronden' : 'Volgende'}
            <ChevronRight size={18} className="ml-1" />
          </Button>
        ) : (
          <Button onClick={opslaan} size="lg" loading={laden} className="flex-1">
            {isFysio ? 'Naar de app' : 'Schema genereren'}
          </Button>
        )}
      </div>
    </div>
  )
}
