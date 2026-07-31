import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import { analyseerBelasting } from '@/lib/belasting'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const vandaag = new Date()
  const vandaagStr = vandaag.toISOString().split('T')[0]

  const dag = vandaag.getDay()
  const maandag = new Date(vandaag)
  maandag.setDate(vandaag.getDate() - (dag === 0 ? 6 : dag - 1))
  const maandagStr = maandag.toISOString().split('T')[0]

  const drieWekenLater = new Date(maandag)
  drieWekenLater.setDate(maandag.getDate() + 21)
  const eindStr = drieWekenLater.toISOString().split('T')[0]

  // Voor de belasting-/herstelanalyse: 28 dagen historie van álle inspanning.
  const achtentwintigTerug = new Date(vandaag)
  achtentwintigTerug.setDate(vandaag.getDate() - 27)
  const belastingStart = achtentwintigTerug.toISOString().split('T')[0]

  const [{ data: profiel }, { data: sessies }, { data: fysioOefeningen }, { data: doelen }, { data: activiteiten }, { data: alleSessies }, { data: fysioSessies }, { data: belastingSessies }, { data: sportActiviteiten }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('training_sessions')
      .select('*, session_feedback(*)')
      .eq('user_id', user.id)
      .gte('datum', maandagStr)
      .lte('datum', eindStr)
      .order('datum', { ascending: true }),
    supabase.from('physio_exercises')
      .select('*')
      .eq('user_id', user.id)
      .eq('actief', true),
    supabase.from('goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('actief', true)
      .order('datum', { ascending: true })
      .limit(1),
    supabase.from('recurring_activities')
      .select('*')
      .eq('user_id', user.id),
    // Alle sessies voor het actieve doel (voortgangsbalk + weekoverzicht)
    supabase.from('training_sessions')
      .select('datum, voltooid, overgeslagen')
      .eq('user_id', user.id)
      .order('datum', { ascending: true }),
    // Fysio sessies voor de huidige 3-weeks periode
    supabase.from('physio_sessions')
      .select('id, datum, voltooid')
      .eq('user_id', user.id)
      .gte('datum', maandagStr)
      .lte('datum', eindStr)
      .eq('voltooid', true),
    supabase.from('training_sessions')
      .select('datum, type, duur_minuten, afstand_km, intensiteit, voltooid')
      .eq('user_id', user.id)
      .eq('voltooid', true)
      .gte('datum', belastingStart)
      .lte('datum', vandaagStr),
    supabase.from('sport_activities')
      .select('id, datum, sport, duur_minuten, intensiteit')
      .eq('user_id', user.id)
      .gte('datum', belastingStart)
      .lte('datum', vandaagStr),
  ])

  if (profiel && !(profiel as Record<string, unknown>).onboarding_voltooid) {
    redirect('/onboarding')
  }

  return (
    <DashboardClient
      profiel={profiel}
      sessies={sessies ?? []}
      alleSessies={alleSessies ?? []}
      fysioOefeningen={fysioOefeningen ?? []}
      fysioSessies={fysioSessies ?? []}
      doel={doelen?.[0] ?? null}
      vandaag={vandaagStr}
      weekStart={maandagStr}
      activiteiten={activiteiten ?? []}
      belasting={analyseerBelasting(belastingSessies ?? [], sportActiviteiten ?? [], vandaagStr)}
    />
  )
}
