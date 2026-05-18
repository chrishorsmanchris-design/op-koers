import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const claude = new Anthropic()

export async function POST(req: NextRequest) {
  const { sessie_id, rating } = await req.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const vandaag = new Date().toISOString().split('T')[0]

  // Haal voltooide sessie op
  const { data: voltooide } = await supabase
    .from('training_sessions')
    .select('beschrijving, duur_minuten, afstand_km, intensiteit, type, week_nummer')
    .eq('id', sessie_id)
    .single()

  // Alleen hardloopsessies aanpassen; neutrale feedback → geen actie
  if (!voltooide || voltooide.type !== 'hardlopen' || rating === 'goed') {
    return NextResponse.json({ aangepast: false })
  }

  // Haal het actieve doel op
  const { data: doel } = await supabase
    .from('goals')
    .select('naam, datum, tijdsdoel')
    .eq('user_id', user.id)
    .eq('actief', true)
    .single()

  if (!doel) return NextResponse.json({ aangepast: false })

  // Haal het VOLLEDIGE resterende schema op (alle toekomstige hardloopsessies)
  const { data: komendeSessies } = await supabase
    .from('training_sessions')
    .select('id, datum, beschrijving, duur_minuten, afstand_km, intensiteit, type, week_nummer, volgorde')
    .eq('user_id', user.id)
    .gt('datum', vandaag)
    .eq('voltooid', false)
    .in('type', ['hardlopen', 'krachttraining', 'cross'])
    .order('datum', { ascending: true })

  if (!komendeSessies || komendeSessies.length === 0) {
    return NextResponse.json({ aangepast: false })
  }

  // Haal recente feedback op (patroonherkenning)
  const { data: recenteFeedback } = await supabase
    .from('session_feedback')
    .select('rating, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(8)

  const feedbackHistorie = recenteFeedback?.map(f => f.rating).join(', ') ?? 'geen'

  // Bereken weken en fase
  const dagenTotDoel = Math.ceil(
    (new Date(doel.datum).getTime() - new Date(vandaag).getTime()) / (1000 * 60 * 60 * 24)
  )
  const wekenTotDoel = Math.ceil(dagenTotDoel / 7)
  const huidigWeek = voltooide.week_nummer ?? 1
  const totaalWeken = huidigWeek + wekenTotDoel

  // Bepaal huidige fase
  let fase = 'opbouw'
  if (wekenTotDoel <= 2) fase = 'tapering'
  else if (wekenTotDoel <= 6) fase = 'specificatie (marathon-tempo)'
  else if (wekenTotDoel <= 10) fase = 'opbouw (langere runs + interval)'
  else fase = 'basis (duurlopen, volume opbouwen)'

  // Bereken totaal gepland volume resterende schema
  const totaalGeplandKm = komendeSessies
    .filter(s => s.type === 'hardlopen')
    .reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)

  const prompt = `Je bent een professionele atletiekcoach met expertise in marathontraining (Hal Higdon / Jack Daniels methode).

Een atleet geeft feedback op een voltooide training. Jouw taak: pas het schema INTELLIGENT aan zodat het doel bereikbaar blijft.

## CONTEXT
- Doel: ${doel.naam} op ${doel.datum} (tijdsdoel: ${doel.tijdsdoel ?? 'finishen'})
- Weken tot doel: ${wekenTotDoel} weken
- Huidige fase: ${fase}
- Huidige week in schema: week ${huidigWeek} van ~${totaalWeken}
- Totaal gepland volume resterend schema: ${totaalGeplandKm.toFixed(1)} km

## VOLTOOIDE SESSIE
${voltooide.beschrijving} | ${voltooide.duur_minuten}min | ${voltooide.afstand_km}km | ${voltooide.intensiteit}

## FEEDBACK VANDAAG: "${rating}"
## RECENTE FEEDBACK (nieuwste eerst): ${feedbackHistorie}

## AANPASSINGSSTRATEGIE (VERPLICHT VOLGEN)

${rating === 'te_zwaar' ? `OVERBELASTING GEDETECTEERD:
- Verlaag de komende 2-3 sessies significant (15-20% minder km/duur, intensiteit verlagen)
- Voeg indien mogelijk een herstelsessie in
- Compenseer het verloren volume in weken 4-6 vanaf nu door die sessies 5-10% te verhogen
- Bewaar de piekmijl (long run) in de piekweek — verplaats indien nodig maar verwijder niet
- Als het patroon "te_zwaar" vaker voorkomt: heroverweeg het totale volumeopbouw
- Tapering (laatste 2 weken) NOOIT verhogen` : ''}

${rating === 'zwaar' ? `VERMOEIDHEID SIGNAAL:
- Verlaag de komende 2 sessies licht (8-12% minder km/duur)
- Houd de totale weekkilometers intact door de overige sessies van die weken iets te verhogen
- Bewaar intervaltraining en lange duurlopen — verlaag liever herstelsessies` : ''}

${rating === 'beter_dan_verwacht' ? `GOEDE VORM SIGNAAL:
- Verhoog de komende 2-3 sessies licht (5-8% meer km of hogere intensiteit)
- Pas op voor te snelle progressie (10%-regel)
- Maak de verhoging geleidelijk: eerste week +5%, volgende week +8%` : ''}

${rating === 'topdag' ? `UITSTEKENDE VORM:
- Verhoog de komende 3-4 sessies (8-12% meer km of intensiteit een niveau hoger)
- Let op: tapering sessies NOOIT verhogen
- Controleer dat de 10%-progressieregel niet wordt overschreden per week
- Mogelijkheid om eerder marathon-tempo runs in te voegen als fase het toelaat` : ''}

ALGEMENE REGELS:
- Bewaar altijd de lange duurloop (long run) in de planning
- Tapering (laatste 2 weken voor doel) NOOIT verzwaren
- Beschrijving max 55 tekens
- Verander ALLEEN sessies die aanpassing vereisen (min=0, max=6 sessies)
- Het totale resterende volume mag maximaal 5% afwijken van ${totaalGeplandKm.toFixed(1)} km

## KOMENDE SESSIES (volledig schema, pas maximaal 6 aan):
${komendeSessies.map(s =>
  `{"id":"${s.id}","datum":"${s.datum}","week":${s.week_nummer},"beschrijving":"${s.beschrijving}","duur_minuten":${s.duur_minuten},"afstand_km":${s.afstand_km},"intensiteit":"${s.intensiteit}","type":"${s.type}"}`
).join('\n')}

Geef ALLEEN geldige JSON terug:
{"aanpassingen":[{"id":"<exact id>","duur_minuten":40,"afstand_km":7.0,"intensiteit":"makkelijk","beschrijving":"..."}],"uitleg":"Korte uitleg van de aanpassing en compensatiestrategie (max 150 tekens)"}`

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: 'Je bent een atletiekcoach. Geef altijd geldige JSON terug. Denk na over de periodisering en het totale trainingsvolume.',
    messages: [{ role: 'user', content: prompt }],
  })

  const tekst = response.content[0].type === 'text' ? response.content[0].text : '{}'

  let aanpassingen
  try {
    const match = tekst.match(/\{[\s\S]*\}/)
    aanpassingen = JSON.parse(match?.[0] ?? '{}')
  } catch {
    return NextResponse.json({ aangepast: false })
  }

  if (!aanpassingen.aanpassingen?.length) {
    return NextResponse.json({ aangepast: false })
  }

  // Valideer dat IDs bestaan in het echte schema (voorkomt hallucinaties)
  const geldigeIds = new Set(komendeSessies.map(s => s.id))
  const valideAanpassingen = (aanpassingen.aanpassingen as Array<{
    id: string; duur_minuten: number; afstand_km: number;
    intensiteit: string; beschrijving: string
  }>).filter(a => geldigeIds.has(a.id))

  const GELDIGE_INTENSITEITEN = new Set(['herstel', 'makkelijk', 'gemiddeld', 'zwaar', 'interval'])

  for (const aanpassing of valideAanpassingen) {
    await supabase
      .from('training_sessions')
      .update({
        duur_minuten: aanpassing.duur_minuten,
        afstand_km: aanpassing.afstand_km,
        beschrijving: aanpassing.beschrijving,
        intensiteit: GELDIGE_INTENSITEITEN.has(aanpassing.intensiteit)
          ? aanpassing.intensiteit
          : undefined,
      } as never)
      .eq('id', aanpassing.id)
      .eq('user_id', user.id)
  }

  // Stuur push notificatie als er aanpassingen zijn
  if (valideAanpassingen.length > 0) {
    const { data: profiel } = await supabase
      .from('profiles')
      .select('push_subscription')
      .eq('id', user.id)
      .single()

    if (profiel?.push_subscription) {
      try {
        const webpush = (await import('web-push')).default
        webpush.setVapidDetails(
          process.env.VAPID_EMAIL!,
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!
        )
        await webpush.sendNotification(
          profiel.push_subscription as Parameters<typeof webpush.sendNotification>[0],
          JSON.stringify({
            title: '📅 Schema bijgewerkt',
            body: aanpassingen.uitleg ?? `${valideAanpassingen.length} sessies aangepast op basis van je feedback`,
            url: '/schema'
          })
        )
      } catch { /* push errors don't fail the request */ }
    }
  }

  return NextResponse.json({
    aangepast: true,
    aantalSessies: valideAanpassingen.length,
    uitleg: aanpassingen.uitleg,
  })
}
