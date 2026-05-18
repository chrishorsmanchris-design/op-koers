import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CoachChatClient } from './CoachChatClient'

export default async function CoachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const veertienDagenGeleden = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
  const vandaag = new Date().toISOString().split('T')[0]

  const [{ data: profiel }, { data: doel }, { data: sessies }] = await Promise.all([
    supabase
      .from('profiles')
      .select('naam, km_per_week, physio_klacht')
      .eq('id', user.id)
      .single(),
    supabase
      .from('goals')
      .select('naam, datum, tijdsdoel')
      .eq('user_id', user.id)
      .eq('actief', true)
      .single(),
    supabase
      .from('training_sessions')
      .select('datum, type, voltooid, afstand_km, duur_minuten, intensiteit, beschrijving')
      .eq('user_id', user.id)
      .gte('datum', veertienDagenGeleden)
      .lte('datum', vandaag)
      .order('datum', { ascending: false }),
  ])

  // Fetch weekreview from API route
  let weekreview: string | null = null
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/coach/weekreview`, {
      cache: 'no-store',
      headers: { cookie: '' }, // server-side; auth is handled inside the route
    })
    if (res.ok) {
      const json = await res.json() as { weekreview: string | null }
      weekreview = json.weekreview ?? null
    }
  } catch {
    // weekreview is non-critical — silently ignore
  }

  return (
    <CoachChatClient
      profiel={profiel ?? null}
      doel={doel ?? null}
      recente_sessies={sessies ?? []}
      weekreview={weekreview}
    />
  )
}
