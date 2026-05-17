'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { datumNaarNederlands, formatDuur, cn } from '@/lib/utils'
import { CheckCircle2, ChevronRight, Dumbbell, Timer, MapPin, Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Goal, PhysioExercise, TrainingSession, Profile } from '@/types/database'
import { FeedbackModal } from '@/components/training/FeedbackModal'

interface Props {
  profiel: Profile | null
  sessies: (TrainingSession & { session_feedback: unknown[] })[]
  fysioOefeningen: PhysioExercise[]
  doel: Goal | null
  vandaag: string
}

const INTENSITEIT_KLEUR = {
  herstel: 'bg-blue-900 text-blue-300',
  makkelijk: 'bg-green-900 text-green-300',
  gemiddeld: 'bg-yellow-900 text-yellow-300',
  zwaar: 'bg-orange-900 text-orange-300',
  interval: 'bg-red-900 text-red-300',
}

export function DashboardClient({ profiel, sessies, fysioOefeningen, doel, vandaag }: Props) {
  const supabase = createClient()
  const [feedbackSessie, setFeedbackSessie] = useState<TrainingSession | null>(null)
  const [lokaaleSessies, setLokaaleSessies] = useState(sessies)

  const vandaagSessie = lokaaleSessies.find(s => s.datum === vandaag)
  const komendeSessies = lokaaleSessies.filter(s => s.datum > vandaag).slice(0, 4)
  const heeftFysio = fysioOefeningen.length > 0

  const dagenTotDoel = doel
    ? Math.ceil((new Date(doel.datum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null

  async function sessieAfronden(sessieId: string) {
    await supabase.from('training_sessions').update({ voltooid: true } as never).eq('id', sessieId)
    setLokaaleSessies(prev => prev.map(s => s.id === sessieId ? { ...s, voltooid: true } : s))
    const sessie = lokaaleSessies.find(s => s.id === sessieId)
    if (sessie) setFeedbackSessie(sessie)
  }

  async function sessieOvergeslagen(sessieId: string) {
    await supabase.from('training_sessions').update({ overgeslagen: true } as never).eq('id', sessieId)
    setLokaaleSessies(prev => prev.map(s => s.id === sessieId ? { ...s, overgeslagen: true } : s))
  }

  const naam = profiel?.naam?.split(' ')[0] ?? 'atleet'
  const uur = new Date().getHours()
  const begroeting = uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond'

  return (
    <div className="flex flex-col gap-5 p-4 pt-8">
      {/* Header */}
      <div>
        <p className="text-[#6b7280] text-sm">{begroeting}</p>
        <h1 className="text-2xl font-bold text-white">{naam} 👋</h1>
      </div>

      {/* Doel teller of CTA */}
      {doel ? (
        <Card className="bg-gradient-to-br from-[#f97316]/20 to-[#1a1a1a] border border-[#f97316]/20">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-[#f97316] font-medium">{doel.naam}</p>
              <p className="text-3xl font-bold text-white mt-1">{dagenTotDoel} <span className="text-lg font-normal text-[#9ca3af]">dagen</span></p>
            </div>
            <div className="text-4xl">🏁</div>
          </div>
          {doel.tijdsdoel && (
            <p className="text-sm text-[#6b7280] mt-2">Tijdsdoel: <span className="text-white font-medium">{doel.tijdsdoel}</span></p>
          )}
        </Card>
      ) : (
        <Card onClick={() => window.location.href = '/doel'} className="border border-dashed border-[#333] text-center py-6">
          <div className="text-4xl mb-2">🎯</div>
          <p className="font-semibold text-white">Stel een doel in</p>
          <p className="text-sm text-[#6b7280] mt-1">Marathon, triathlon of alleen fysio</p>
          <div className="mt-4">
            <Button size="sm">Doel toevoegen</Button>
          </div>
        </Card>
      )}

      {/* Vandaag */}
      <div>
        <h2 className="text-sm font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Vandaag</h2>
        {vandaagSessie ? (
          <Card className={cn(vandaagSessie.voltooid && 'opacity-60')}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {vandaagSessie.intensiteit && (
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', INTENSITEIT_KLEUR[vandaagSessie.intensiteit])}>
                      {vandaagSessie.intensiteit}
                    </span>
                  )}
                  {vandaagSessie.voltooid && <CheckCircle2 size={16} className="text-green-400" />}
                </div>
                <h3 className="font-semibold text-white">{vandaagSessie.beschrijving}</h3>
              </div>
              <Flame size={22} className="text-[#f97316] mt-1" />
            </div>

            <div className="flex gap-4 text-sm text-[#9ca3af] mb-4">
              {vandaagSessie.duur_minuten && (
                <span className="flex items-center gap-1"><Timer size={14} /> {formatDuur(vandaagSessie.duur_minuten)}</span>
              )}
              {vandaagSessie.afstand_km && (
                <span className="flex items-center gap-1"><MapPin size={14} /> {vandaagSessie.afstand_km} km</span>
              )}
            </div>

            {!vandaagSessie.voltooid && !vandaagSessie.overgeslagen && (
              <div className="flex gap-2">
                <Button onClick={() => sessieAfronden(vandaagSessie.id)} className="flex-1">
                  Afgerond
                </Button>
                <Button variant="ghost" onClick={() => sessieOvergeslagen(vandaagSessie.id)} size="sm">
                  Sla over
                </Button>
              </div>
            )}
            {vandaagSessie.voltooid && (
              <p className="text-green-400 text-sm font-medium flex items-center gap-1">
                <CheckCircle2 size={14} /> Gelukt!
              </p>
            )}
          </Card>
        ) : (
          <Card>
            <p className="text-[#6b7280]">Geen training gepland vandaag. Rust en herstel!</p>
          </Card>
        )}

        {/* Fysio */}
        {heeftFysio && (
          <Card className="mt-3" onClick={() => window.location.href = '/fysio'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#242424] rounded-2xl flex items-center justify-center">
                  <Dumbbell size={18} className="text-[#f97316]" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Fysio-oefeningen</h3>
                  <p className="text-sm text-[#6b7280]">{fysioOefeningen.length} oefeningen</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-[#6b7280]" />
            </div>
          </Card>
        )}
      </div>

      {/* Komende trainingen */}
      {komendeSessies.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Komende trainingen</h2>
          <div className="flex flex-col gap-2">
            {komendeSessies.map(sessie => (
              <Card key={sessie.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#6b7280] capitalize">{datumNaarNederlands(sessie.datum)}</p>
                    <p className="text-sm font-medium text-white mt-0.5">{sessie.beschrijving}</p>
                  </div>
                  <div className="text-right text-xs text-[#6b7280]">
                    {sessie.duur_minuten && <p>{formatDuur(sessie.duur_minuten)}</p>}
                    {sessie.afstand_km && <p>{sessie.afstand_km} km</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Feedback modal */}
      {feedbackSessie && (
        <FeedbackModal
          sessie={feedbackSessie}
          onSluit={() => setFeedbackSessie(null)}
        />
      )}
    </div>
  )
}
