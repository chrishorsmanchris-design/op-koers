import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const claude = new Anthropic()

const DAGEN_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

function getMaandag(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay()
  d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const vandaag = new Date().toISOString().split('T')[0]
  const vandaagJsDag = new Date(vandaag + 'T12:00:00').getDay() // 0=zo..6=za
  const veertienDagenGeleden = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]

  const [
    { data: profiel },
    { data: doel },
    { data: vandaagSessies },
    { data: recenteSessies },
    { data: fysioOefeningen },
    { data: activiteiten },
    { data: recenteFysio },
  ] = await Promise.all([
    supabase.from('profiles').select('naam, wil_core, fysio_per_week, core_per_week').eq('id', user.id).single(),
    supabase.from('goals').select('naam, datum, tijdsdoel').eq('user_id', user.id).eq('actief', true).single(),
    supabase.from('training_sessions')
      .select('type, beschrijving, duur_minuten, afstand_km, intensiteit, voltooid')
      .eq('user_id', user.id).eq('datum', vandaag).eq('overgeslagen', false),
    supabase.from('training_sessions')
      .select('datum, type, voltooid, overgeslagen, afstand_km, duur_minuten, intensiteit')
      .eq('user_id', user.id).gte('datum', veertienDagenGeleden).lte('datum', vandaag)
      .order('datum', { ascending: false }),
    supabase.from('physio_exercises').select('id').eq('user_id', user.id).eq('actief', true),
    supabase.from('recurring_activities').select('naam, dag_van_week, tijdstip').eq('user_id', user.id),
    supabase.from('physio_sessions').select('datum').eq('user_id', user.id)
      .gte('datum', getMaandag(vandaag)).order('datum', { ascending: false }),
  ])

  const naam = profiel?.naam?.split(' ')[0] ?? 'Atleet'
  const voltooid = recenteSessies?.filter(s => s.voltooid) ?? []
  const overgeslagen = recenteSessies?.filter(s => s.overgeslagen) ?? []
  const kmDezeWeek = voltooid
    .filter(s => s.datum >= getMaandag(vandaag))
    .reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
  const dagenTotDoel = doel
    ? Math.ceil((new Date(doel.datum).getTime() - Date.now()) / 86400000)
    : null

  // Vandaag geplande looptraining
  const vandaagLoop = vandaagSessies?.find(s =>
    ['hardlopen', 'krachttraining', 'cross'].includes(s.type) && !s.voltooid
  )
  const vandaagAlVoltooid = vandaagSessies?.filter(s => s.voltooid) ?? []

  // Vandaag recurring activiteit (hockey etc)
  // App-dag: ma=0..zo=6; JS: zo=0..za=6
  const appDagVandaag = vandaagJsDag === 0 ? 6 : vandaagJsDag - 1
  const activiteitVandaag = activiteiten?.find(a => a.dag_van_week === appDagVandaag)

  // Heeft vandaag fysio?
  const heeftFysioVandaag = (fysioOefeningen?.length ?? 0) > 0
  const fysioDezeWeek = recenteFysio?.length ?? 0

  const context = [
    `Naam: ${naam}`,
    doel ? `Doel: ${doel.naam} over ${dagenTotDoel} dagen (tijdsdoel: ${doel.tijdsdoel ?? 'finishen'})` : '',
    `Laatste 14 dagen: ${voltooid.length} trainingen voltooid, ${overgeslagen.length} overgeslagen`,
    `Km deze week: ${kmDezeWeek.toFixed(1)} km`,
    vandaagLoop
      ? `Geplande training vandaag: ${vandaagLoop.beschrijving} (${vandaagLoop.duur_minuten}min${vandaagLoop.afstand_km ? `, ${vandaagLoop.afstand_km}km` : ''}, ${vandaagLoop.intensiteit})`
      : 'Geen looptraining gepland vandaag',
    vandaagAlVoltooid.length > 0
      ? `Al voltooid vandaag: ${vandaagAlVoltooid.map(s => s.type).join(', ')}`
      : '',
    heeftFysioVandaag
      ? `Heeft ${fysioOefeningen?.length} actieve fysio-oefeningen · ${fysioDezeWeek}× gedaan deze week`
      : '',
    profiel?.wil_core ? `Core stability actief (${profiel.core_per_week ?? 2}× per week)` : '',
    activiteitVandaag
      ? `Vaste activiteit vandaag: ${activiteitVandaag.naam} ${activiteitVandaag.tijdstip ?? ''} — geen hardlopen`
      : '',
  ].filter(Boolean).join('\n')

  // Proactieve alerts (pure berekening, geen extra DB queries)
  const alerts: string[] = []

  // 1. Geen lange run in 14+ dagen (run > 14km)
  const langeLopen = recenteSessies?.filter(s => s.voltooid && s.type === 'hardlopen' && (s.afstand_km ?? 0) >= 14) ?? []
  const dagsSindsCLangeRun = langeLopen.length > 0
    ? Math.floor((Date.now() - new Date(langeLopen[0].datum + 'T12:00:00').getTime()) / 86400000)
    : 99
  if (dagsSindsCLangeRun >= 14 && (doel !== null)) {
    alerts.push('⚠️ Je hebt al ' + dagsSindsCLangeRun + ' dagen geen lange duurloop gedaan')
  }

  // 2. >40% sessies overgeslagen in laatste 14 dagen
  const totaleSessies14d = recenteSessies?.filter(s => s.datum >= veertienDagenGeleden) ?? []
  const overgeslagen14d = totaleSessies14d.filter(s => s.overgeslagen).length
  if (totaleSessies14d.length >= 5 && overgeslagen14d / totaleSessies14d.length > 0.4) {
    alerts.push('📉 Je slaat de laatste 2 weken veel trainingen over (' + overgeslagen14d + '/' + totaleSessies14d.length + ')')
  }

  // 3. Geen training deze week (woensdag of later, nog niets gedaan)
  const vandaagDag = new Date(vandaag + 'T12:00:00').getDay()
  const maandagDezeWeek = getMaandag(vandaag)
  const sessiesDezeWeek = recenteSessies?.filter(s => s.datum >= maandagDezeWeek && s.voltooid) ?? []
  if (vandaagDag >= 3 && sessiesDezeWeek.length === 0) {
    alerts.push('💤 Je hebt deze week nog geen training gedaan')
  }

  // Max 2 alerts
  alerts.splice(2)

  try {
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Je bent een persoonlijke atletiekcoach. Schrijf een kort, persoonlijk bericht (2-3 zinnen, max 200 tekens) voor vandaag. Wees motiverend maar realistisch en accuraat. Refereer aan WERKELIJKE data — verzin niets. Als er een vaste activiteit is (hockey etc), houd daar rekening mee. Taal: Nederlands. Geen emoji tenzij het echt past.

Atleetinfo:
${context}

Geef ALLEEN het bericht terug, geen aanhalingstekens of uitleg.`
      }]
    })

    const bericht = response.content[0].type === 'text' ? response.content[0].text.trim() : null
    return NextResponse.json({ bericht, datum: vandaag, alerts })
  } catch {
    return NextResponse.json({ bericht: null, alerts })
  }
}
