'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import type { Goal, Profile, Vacation, PreviousResult, RecurringActivity } from '@/types/database'
import { cn } from '@/lib/utils'
import { Plus, Trash2, LogOut, Link } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  profiel: Profile | null
  doelen: Goal[]
  vakanties: Vacation[]
  resultaten: PreviousResult[]
  activiteiten: RecurringActivity[]
}

const KAN_TRAINEN_OPTIES = [
  { value: 'ja', label: 'Ja', kleur: 'border-green-500 bg-green-500/10 text-green-600' },
  { value: 'beperkt', label: 'Beperkt', kleur: 'border-yellow-500 bg-yellow-500/10 text-yellow-600' },
  { value: 'nee', label: 'Nee', kleur: 'border-red-500 bg-red-500/10 text-red-600' },
]

const DAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
const TIJDSTIPPEN = [
  { value: 'ochtend', label: 'Ochtend' },
  { value: 'middag', label: 'Middag' },
  { value: 'avond', label: 'Avond' },
]

type NieuweActiviteit = {
  naam: string
  dag_van_week: number
  tijdstip: 'ochtend' | 'middag' | 'avond'
  blokkeert_hardlopen: boolean
  blokkeert_fysio: boolean
}

export function InstellingenClient({ profiel, doelen, vakanties: initVakanties, activiteiten: initActiviteiten }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const stravaStatus = searchParams.get('strava')
  const [vakanties, setVakanties] = useState(initVakanties)
  const [activiteiten, setActiviteiten] = useState(initActiviteiten)
  const [naam, setNaam] = useState(profiel?.naam ?? '')
  const [kmPerWeek, setKmPerWeek] = useState(String(profiel?.km_per_week ?? ''))
  const [maxHartslag, setMaxHartslag] = useState(String((profiel as Record<string, unknown>)?.max_hartslag as number | null ?? ''))
  const [wilCore, setWilCore] = useState(profiel?.wil_core ?? false)
  const [corePerWeek, setCorePerWeek] = useState(profiel?.core_per_week ?? 2)
  const [fysioPerWeek, setFysioPerWeek] = useState(profiel?.fysio_per_week ?? 3)
  const [wilCross, setWilCross] = useState(profiel?.wil_cross ?? false)
  const [laden, setLaden] = useState(false)
  const [opgeslagen, setOpgeslagen] = useState(false)

  const [nieuwV, setNieuwV] = useState<{ naam: string; start_datum: string; eind_datum: string; kan_trainen: 'ja' | 'nee' | 'beperkt' }>({ naam: '', start_datum: '', eind_datum: '', kan_trainen: 'ja' })
  const [nieuwA, setNieuwA] = useState<NieuweActiviteit>({ naam: '', dag_van_week: 1, tijdstip: 'avond', blokkeert_hardlopen: true, blokkeert_fysio: false })

  async function profielOpslaan() {
    setLaden(true)
    const { error } = await supabase.from('profiles').update({
      naam,
      km_per_week: parseFloat(kmPerWeek) || null,
      max_hartslag: parseInt(maxHartslag) || null,
      wil_core: wilCore,
      core_per_week: wilCore ? corePerWeek : 0,
      fysio_per_week: fysioPerWeek,
      wil_cross: wilCross,
    } as never).eq('id', profiel?.id ?? '')
    if (error) {
      console.error('Supabase update error:', error)
      alert(`Opslaan mislukt: ${error.message}`)
      setLaden(false)
      return
    }
    setOpgeslagen(true)
    setTimeout(() => setOpgeslagen(false), 2000)
    setLaden(false)
  }

  async function vakantieToevoegen() {
    if (!nieuwV.naam || !nieuwV.start_datum || !nieuwV.eind_datum) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await supabase.from('vacations').insert({ ...nieuwV, user_id: user.id } as any).select().single()
    if (data) setVakanties(prev => [...prev, data as unknown as Vacation])
    setNieuwV({ naam: '', start_datum: '', eind_datum: '', kan_trainen: 'ja' })
  }

  async function vakantieVerwijderen(id: string) {
    await supabase.from('vacations').delete().eq('id', id)
    setVakanties(prev => prev.filter(v => v.id !== id))
  }

  async function activiteitToevoegen() {
    if (!nieuwA.naam) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await supabase.from('recurring_activities').insert({ ...nieuwA, user_id: user.id } as any).select().single()
    if (data) setActiviteiten(prev => [...prev, data as unknown as RecurringActivity])
    setNieuwA({ naam: '', dag_van_week: 1, tijdstip: 'avond', blokkeert_hardlopen: true, blokkeert_fysio: false })
  }

  async function activiteitVerwijderen(id: string) {
    await supabase.from('recurring_activities').delete().eq('id', id)
    setActiviteiten(prev => prev.filter(a => a.id !== id))
  }

  async function uitloggen() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex flex-col gap-6 p-4 pt-4 pb-24">

      {stravaStatus === 'gekoppeld' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700">
          ✓ Strava succesvol gekoppeld! Runs worden automatisch gesynchroniseerd.
        </div>
      )}
      {stravaStatus === 'geweigerd' && (
        <div className="bg-[#f5f3f0] border border-[#e8e3dc] rounded-2xl px-4 py-3 text-sm text-[#6b6560]">
          Strava koppeling geannuleerd.
        </div>
      )}

      {/* Profiel */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Profiel</h2>
        <Card>
          <div className="flex flex-col gap-4">
            <Input id="naam" label="Naam" value={naam} onChange={e => setNaam(e.target.value)} />
            <Input id="km" type="number" label="Km per week (huidig)" value={kmPerWeek}
              onChange={e => setKmPerWeek(e.target.value)} placeholder="bijv. 25" />
            <Input id="max-hartslag" type="number" label="Max hartslag (bpm)" value={maxHartslag}
              onChange={e => setMaxHartslag(e.target.value)} placeholder="180" />

            {/* Cross-training toggle */}
            <button
              onClick={() => setWilCross(v => !v)}
              className={cn(
                'flex items-center justify-between p-3 rounded-2xl border-2 transition-all text-left',
                wilCross ? 'border-[#10b981] bg-[#10b981]/10' : 'border-[#e8e3dc] bg-[#f5f3f0]'
              )}
            >
              <div>
                <p className={cn('font-medium text-sm', wilCross ? 'text-[#10b981]' : 'text-[#1a1612]')}>
                  🚴 Cross-training
                </p>
                <p className="text-xs text-[#6b6560] mt-0.5">
                  Fietsen, zwemmen of andere cardio als aanvulling op je loopschema
                </p>
              </div>
              <div className={cn('w-10 h-6 rounded-full transition-all shrink-0 ml-3 relative', wilCross ? 'bg-[#10b981]' : 'bg-[#d0cbc4]')}>
                <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all', wilCross ? 'left-5' : 'left-1')} />
              </div>
            </button>

            <Button onClick={profielOpslaan} loading={laden}>
              {opgeslagen ? '✓ Opgeslagen' : 'Opslaan'}
            </Button>
          </div>
        </Card>
      </section>

      {/* Fysio & Core — los van trainingsschema */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-1">Fysio & core</h2>
        <p className="text-xs text-[#a09990] mb-3">Staat los van je trainingsschema — reminders op het dashboard</p>
        <Card className="mb-3">
          <p className="text-sm font-medium text-[#1a1612] mb-1">🩺 Fysio-oefeningen</p>
          <p className="text-xs text-[#6b6560] mb-3">Hoe vaak per week wil je je fysio-oefeningen doen?</p>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setFysioPerWeek(n)}
                className={cn('flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                  fysioPerWeek === n
                    ? 'border-[#f97316] bg-[#f97316]/10 text-[#f97316]'
                    : 'border-[#e8e3dc] text-[#6b6560]')}>
                {n}×
              </button>
            ))}
          </div>
          <Button onClick={profielOpslaan} loading={laden} className="mt-3">
            {opgeslagen ? '✓ Opgeslagen' : 'Opslaan'}
          </Button>
        </Card>
        <Card>
          <button
            onClick={() => setWilCore(v => !v)}
            className={cn(
              'flex items-center justify-between w-full p-0 mb-3 text-left',
            )}
          >
            <div>
              <p className={cn('font-medium text-sm', wilCore ? 'text-[#06b6d4]' : 'text-[#1a1612]')}>
                🧘 Core stability
              </p>
              <p className="text-xs text-[#6b6560] mt-0.5">
                Onderrug, rompkracht en lenigheid — apart van je hardloopschema
              </p>
            </div>
            <div className={cn('w-10 h-6 rounded-full transition-all shrink-0 ml-3 relative', wilCore ? 'bg-[#06b6d4]' : 'bg-[#d0cbc4]')}>
              <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all', wilCore ? 'left-5' : 'left-1')} />
            </div>
          </button>

          {wilCore && (
            <div className="border-t border-[#f0ede8] pt-3">
              <p className="text-xs font-medium text-[#6b6560] mb-2">Hoe vaak per week?</p>
              <div className="flex gap-2">
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    onClick={() => setCorePerWeek(n)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                      corePerWeek === n
                        ? 'border-[#06b6d4] bg-[#06b6d4]/10 text-[#06b6d4]'
                        : 'border-[#e8e3dc] text-[#6b6560]'
                    )}
                  >
                    {n}×
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button onClick={profielOpslaan} loading={laden} className="mt-3">
            {opgeslagen ? '✓ Opgeslagen' : 'Opslaan'}
          </Button>
        </Card>
      </section>

      {/* Doelen */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Doelen</h2>
        {doelen.map(doel => (
          <Card key={doel.id} className="mb-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-[#1a1612]">{doel.naam}</h3>
                  {doel.actief && <span className="text-xs bg-[#f97316]/20 text-[#f97316] px-2 py-0.5 rounded-full">Actief</span>}
                </div>
                <p className="text-sm text-[#6b6560]">{doel.datum}</p>
                {doel.tijdsdoel && <p className="text-sm text-[#a09990]">Doel: {doel.tijdsdoel}</p>}
              </div>
            </div>
          </Card>
        ))}
      </section>

      {/* Vaste activiteiten */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Vaste activiteiten</h2>
        <p className="text-xs text-[#a09990] mb-3">Momenten die je trainingsschema beïnvloeden, bijv. hockeywedstrijd op dinsdag.</p>

        {activiteiten.map(a => (
          <Card key={a.id} className="mb-2">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-[#1a1612]">{a.naam}</h3>
                <p className="text-sm text-[#6b6560]">
                  {DAGEN[a.dag_van_week]}{a.tijdstip ? ` · ${a.tijdstip}` : ''}
                </p>
                <div className="flex gap-1.5 mt-1">
                  {a.blokkeert_hardlopen && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Geen hardlopen</span>
                  )}
                  {a.blokkeert_fysio && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Geen fysio</span>
                  )}
                </div>
              </div>
              <button onClick={() => activiteitVerwijderen(a.id)} className="text-[#a09990]">
                <Trash2 size={18} />
              </button>
            </div>
          </Card>
        ))}

        <Card className="mt-2">
          <div className="flex flex-col gap-3">
            <Input id="a-naam" label="Activiteit" value={nieuwA.naam}
              onChange={e => setNieuwA({ ...nieuwA, naam: e.target.value })} placeholder="bijv. Hockey" />

            <div>
              <p className="text-xs font-medium text-[#6b6560] mb-1.5">Dag</p>
              <div className="grid grid-cols-4 gap-1.5">
                {DAGEN.map((dag, i) => (
                  <button key={i} onClick={() => setNieuwA({ ...nieuwA, dag_van_week: i })}
                    className={cn('py-1.5 rounded-xl text-xs font-medium border-2 transition-all',
                      nieuwA.dag_van_week === i
                        ? 'border-[#f97316] bg-[#f97316]/10 text-[#f97316]'
                        : 'border-[#e8e3dc] text-[#6b6560]'
                    )}>
                    {dag.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-[#6b6560] mb-1.5">Tijdstip</p>
              <div className="flex gap-2">
                {TIJDSTIPPEN.map(t => (
                  <button key={t.value} onClick={() => setNieuwA({ ...nieuwA, tijdstip: t.value as NieuweActiviteit['tijdstip'] })}
                    className={cn('flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                      nieuwA.tijdstip === t.value
                        ? 'border-[#f97316] bg-[#f97316]/10 text-[#f97316]'
                        : 'border-[#e8e3dc] text-[#6b6560]'
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-[#6b6560] mb-1.5">Blokkeert</p>
              <div className="flex gap-2">
                <button onClick={() => setNieuwA({ ...nieuwA, blokkeert_hardlopen: !nieuwA.blokkeert_hardlopen })}
                  className={cn('flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                    nieuwA.blokkeert_hardlopen
                      ? 'border-orange-500 bg-orange-500/10 text-orange-600'
                      : 'border-[#e8e3dc] text-[#6b6560]'
                  )}>
                  🏃 Hardlopen
                </button>
                <button onClick={() => setNieuwA({ ...nieuwA, blokkeert_fysio: !nieuwA.blokkeert_fysio })}
                  className={cn('flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                    nieuwA.blokkeert_fysio
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                      : 'border-[#e8e3dc] text-[#6b6560]'
                  )}>
                  💪 Fysio
                </button>
              </div>
            </div>

            <Button variant="secondary" onClick={activiteitToevoegen} disabled={!nieuwA.naam}>
              <Plus size={16} className="mr-2" /> Toevoegen
            </Button>
          </div>
        </Card>
      </section>

      {/* Vakanties */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Vakanties</h2>
        {vakanties.map(v => (
          <Card key={v.id} className="mb-2">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-[#1a1612]">{v.naam}</h3>
                <p className="text-sm text-[#6b6560]">{v.start_datum} → {v.eind_datum}</p>
                <span className={cn('text-xs px-2 py-0.5 rounded-full',
                  v.kan_trainen === 'ja' ? 'bg-green-100 text-green-700' :
                  v.kan_trainen === 'beperkt' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                )}>
                  {v.kan_trainen === 'ja' ? 'Kan trainen' : v.kan_trainen === 'beperkt' ? 'Beperkt' : 'Niet trainen'}
                </span>
              </div>
              <button onClick={() => vakantieVerwijderen(v.id)} className="text-[#a09990]">
                <Trash2 size={18} />
              </button>
            </div>
          </Card>
        ))}

        <Card className="mt-2">
          <div className="flex flex-col gap-3">
            <Input id="v-naam" label="Bestemming" value={nieuwV.naam}
              onChange={e => setNieuwV({ ...nieuwV, naam: e.target.value })} placeholder="bijv. Spanje" />
            <Input id="v-start" type="date" label="Van" value={nieuwV.start_datum}
              onChange={e => setNieuwV({ ...nieuwV, start_datum: e.target.value })} />
            <Input id="v-eind" type="date" label="Tot en met" value={nieuwV.eind_datum}
              onChange={e => setNieuwV({ ...nieuwV, eind_datum: e.target.value })} />
            <div className="flex gap-2">
              {KAN_TRAINEN_OPTIES.map(o => (
                <button key={o.value}
                  onClick={() => setNieuwV({ ...nieuwV, kan_trainen: o.value as 'ja' | 'nee' | 'beperkt' })}
                  className={cn('flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                    nieuwV.kan_trainen === o.value ? o.kleur : 'border-[#e8e3dc] text-[#6b6560]')}>
                  {o.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={vakantieToevoegen}>
              <Plus size={16} className="mr-2" /> Toevoegen
            </Button>
          </div>
        </Card>
      </section>

      {/* Koppelingen */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Koppelingen</h2>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#1a1612]">Strava</h3>
              <p className="text-sm text-[#6b6560]">
                {profiel?.strava_refresh_token ? '✓ Gekoppeld — looptrainingen worden automatisch gesynchroniseerd' : 'Koppel om runs automatisch te markeren als gedaan'}
              </p>
            </div>
            {profiel?.strava_refresh_token ? (
              <Button variant="secondary" size="sm" onClick={async () => {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) await supabase.from('profiles').update({ strava_refresh_token: null, strava_athlete_id: null } as never).eq('id', user.id)
                window.location.reload()
              }}>
                Ontkoppelen
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => window.location.href = '/api/strava/auth'}>
                <Link size={14} className="mr-2" /> Koppelen
              </Button>
            )}
          </div>
        </Card>
      </section>

      {/* Uitloggen */}
      <Button variant="danger" onClick={uitloggen} className="mt-2">
        <LogOut size={16} className="mr-2" /> Uitloggen
      </Button>
    </div>
  )
}
