import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: profiel } = await supabase.from('profiles').select('runkeeper_token').eq('id', user.id).single()
  if (!profiel?.runkeeper_token) return NextResponse.json({ error: 'Runkeeper niet gekoppeld' }, { status: 400 })

  const res = await fetch('https://api.runkeeper.com/fitnessActivities?pageSize=10', {
    headers: {
      Authorization: `Bearer ${profiel.runkeeper_token}`,
      Accept: 'application/vnd.com.runkeeper.FitnessActivityFeed+json',
    },
  })

  if (!res.ok) return NextResponse.json({ error: 'Runkeeper API fout' }, { status: 502 })
  const data = await res.json()

  // Match Runkeeper activiteiten aan trainingsessies
  const activiteiten = data.items ?? []
  const vandaag = new Date().toISOString().split('T')[0]
  const wekenGeleden = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: sessies } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('user_id', user.id)
    .gte('datum', wekenGeleden)
    .lte('datum', vandaag)

  let gekoppeld = 0
  for (const act of activiteiten) {
    const actDatum = act.start_time?.split('T')[0]
    if (!actDatum) continue
    const sessie = sessies?.find(s => s.datum === actDatum && s.type === 'hardlopen' && !s.runkeeper_id)
    if (!sessie) continue

    await supabase.from('training_sessions').update({
      voltooid: true,
      runkeeper_id: act.uri,
    } as never).eq('id', sessie.id)

    // Feedback aanmaken met Runkeeper data
    await supabase.from('session_feedback').upsert({
      session_id: sessie.id,
      user_id: user.id,
      rating: 'goed',
      werkelijke_duur: Math.round((act.duration ?? 0) / 60),
      werkelijke_afstand: act.total_distance ? Math.round(act.total_distance / 10) / 100 : null,
      hartslag_gem: act.average_heart_rate ?? null,
      hartslag_max: act.heart_rate ? Math.max(...(Object.values(act.heart_rate) as number[])) : null,
    } as never)
    gekoppeld++
  }

  return NextResponse.json({ gekoppeld, totaal: activiteiten.length })
}
