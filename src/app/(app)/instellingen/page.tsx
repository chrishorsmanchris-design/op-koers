import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InstellingenClient } from './InstellingenClient'
import { AnalyticsClient } from './AnalyticsClient'
import { Suspense } from 'react'
import { TabLayout } from './TabLayout'
import { analyseerHerstel } from '@/lib/herstel'
import { analyseerEfficientie, type EfficientieRun } from '@/lib/efficientie'

/**
 * Zet voltooide hardloopsessies om naar de vorm die de efficiëntie-analyse wil.
 * Strava's gemeten afstand en duur gaan vóór de geplande waarden: het gaat om
 * wat je werkelijk liep, niet om wat er in het schema stond.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loopRuns(sessies: any[]): EfficientieRun[] {
  return sessies
    .filter(s => s.type === 'hardlopen' && s.voltooid)
    .map(s => {
      const fb = s.session_feedback?.[0]
      return {
        datum: s.datum,
        intensiteit: s.intensiteit,
        afstand_km: fb?.werkelijke_afstand ?? s.afstand_km,
        duur_minuten: fb?.werkelijke_duur ?? s.duur_minuten,
        hartslag_gem: fb?.hartslag_gem ?? null,
      }
    })
}

async function InstellingenData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const zesMandenGeleden = new Date()
  zesMandenGeleden.setMonth(zesMandenGeleden.getMonth() - 6)
  const vanafDatum = zesMandenGeleden.toISOString().split('T')[0]

  const vandaagStr = new Date().toISOString().split('T')[0]
  const vierWeken = new Date()
  vierWeken.setDate(vierWeken.getDate() - 28)
  const herstelVanaf = vierWeken.toISOString().split('T')[0]

  const [
    { data: profiel },
    { data: doelen },
    { data: vakanties },
    { data: resultaten },
    { data: activiteiten },
    { data: sessies },
    { data: fysioSessies },
    { data: herstelMetingen },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('goals').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
    supabase.from('vacations').select('*').eq('user_id', user.id).order('start_datum', { ascending: true }),
    supabase.from('previous_results').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
    supabase.from('recurring_activities').select('*').eq('user_id', user.id).order('dag_van_week', { ascending: true }),
    supabase.from('training_sessions')
      .select('*, session_feedback(*)')
      .eq('user_id', user.id)
      .gte('datum', vanafDatum)
      .lte('datum', new Date().toISOString().split('T')[0])
      .order('datum', { ascending: true }),
    supabase.from('physio_sessions')
      .select('datum, voltooid')
      .eq('user_id', user.id)
      .gte('datum', vanafDatum)
      .order('datum', { ascending: true }),
    supabase.from('daily_health')
      .select('datum, rusthartslag, hrv_ms, slaapuren')
      .eq('user_id', user.id)
      .gte('datum', herstelVanaf)
      .order('datum', { ascending: true }),
  ])

  return (
    <TabLayout
      instellingen={
        <InstellingenClient
          profiel={profiel}
          doelen={doelen ?? []}
          vakanties={vakanties ?? []}
          resultaten={resultaten ?? []}
          activiteiten={activiteiten ?? []}
        />
      }
      analytics={
        <AnalyticsClient
          sessies={sessies ?? []}
          fysioSessies={fysioSessies ?? []}
          profiel={profiel}
          doel={doelen?.find(d => d.actief) ?? null}
          herstel={analyseerHerstel(herstelMetingen ?? [], vandaagStr)}
          efficientie={analyseerEfficientie(loopRuns(sessies ?? []), vandaagStr)}
        />
      }
    />
  )
}

export default function InstellingenPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[#8888a8]">Laden...</div>}>
      <InstellingenData />
    </Suspense>
  )
}
