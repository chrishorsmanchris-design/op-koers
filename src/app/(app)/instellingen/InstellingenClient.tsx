'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import type { Goal, Profile, Vacation, PreviousResult } from '@/types/database'
import { cn } from '@/lib/utils'
import { Plus, Trash2, LogOut, Link } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  profiel: Profile | null
  doelen: Goal[]
  vakanties: Vacation[]
  resultaten: PreviousResult[]
}

const KAN_TRAINEN_OPTIES = [
  { value: 'ja', label: 'Ja', kleur: 'border-green-500 bg-green-500/10 text-green-400' },
  { value: 'beperkt', label: 'Beperkt', kleur: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
  { value: 'nee', label: 'Nee', kleur: 'border-red-500 bg-red-500/10 text-red-400' },
]

export function InstellingenClient({ profiel, doelen, vakanties: initVakanties }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [vakanties, setVakanties] = useState(initVakanties)
  const [naam, setNaam] = useState(profiel?.naam ?? '')
  const [kmPerWeek, setKmPerWeek] = useState(String(profiel?.km_per_week ?? ''))
  const [laden, setLaden] = useState(false)
  const [opgeslagen, setOpgeslagen] = useState(false)

  // Nieuwe vakantie
  const [nieuwV, setNieuwV] = useState<{ naam: string; start_datum: string; eind_datum: string; kan_trainen: 'ja' | 'nee' | 'beperkt' }>({ naam: '', start_datum: '', eind_datum: '', kan_trainen: 'ja' })

  async function profielOpslaan() {
    setLaden(true)
    await supabase.from('profiles').update({
      naam,
      km_per_week: parseFloat(kmPerWeek) || null,
    } as never).eq('id', profiel?.id ?? '')
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

  async function uitloggen() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex flex-col gap-6 p-4 pt-8">
      <h1 className="text-2xl font-bold text-[#1a1612]">Instellingen</h1>

      {/* Profiel */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Profiel</h2>
        <Card>
          <div className="flex flex-col gap-4">
            <Input id="naam" label="Naam" value={naam} onChange={e => setNaam(e.target.value)} />
            <Input id="km" type="number" label="Km per week (huidig)" value={kmPerWeek}
              onChange={e => setKmPerWeek(e.target.value)} placeholder="bijv. 25" />
            <Button onClick={profielOpslaan} loading={laden}>
              {opgeslagen ? '✓ Opgeslagen' : 'Opslaan'}
            </Button>
          </div>
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
                  v.kan_trainen === 'ja' ? 'bg-green-900/50 text-green-300' :
                  v.kan_trainen === 'beperkt' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-red-900/50 text-red-300'
                )}>
                  {v.kan_trainen === 'ja' ? 'Kan trainen' : v.kan_trainen === 'beperkt' ? 'Beperkt' : 'Niet trainen'}
                </span>
              </div>
              <button onClick={() => vakantieVerwijderen(v.id)} className="text-[#6b6560]">
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
                    nieuwV.kan_trainen === o.value ? o.kleur : 'border-[#e8e3dc] text-[#6b6560]'
                  )}>
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

      {/* Runkeeper koppelen */}
      <section>
        <h2 className="text-sm font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Koppelingen</h2>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#1a1612]">Runkeeper</h3>
              <p className="text-sm text-[#6b6560]">{profiel?.runkeeper_token ? 'Gekoppeld' : 'Nog niet gekoppeld'}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.href = '/api/runkeeper/auth'}>
              <Link size={14} className="mr-2" />
              {profiel?.runkeeper_token ? 'Ontkoppelen' : 'Koppelen'}
            </Button>
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
