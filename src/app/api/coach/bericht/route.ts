import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { analyseerBelasting } from '@/lib/belasting'
import { haalUurWeer } from '@/lib/weer'
import { beoordeelLooptijd, urenVoorDatum, uurTekst, type Looptijden } from '@/lib/looptijd'
import { haalDoelAnalyse } from '@/lib/doeltempo-data'
import { doelVoorPrompt } from '@/lib/doeltempo'

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
  const achtentwintigDagenGeleden = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0]

  const [
    { data: profiel },
    { data: doel },
    { data: vandaagSessies },
    { data: recenteSessies },
    { data: fysioOefeningen },
    { data: activiteiten },
    { data: recenteFysio },
    { data: recenteCore },
    { data: belastingSessies },
    { data: sportActiviteiten },
  ] = await Promise.all([
    supabase.from('profiles').select('naam, wil_core, fysio_per_week, core_per_week, looptijden').eq('id', user.id).single(),
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
      .gte('datum', achtentwintigDagenGeleden).order('datum', { ascending: false }),
    supabase.from('training_sessions').select('datum').eq('user_id', user.id)
      .eq('type', 'core').eq('voltooid', true)
      .gte('datum', achtentwintigDagenGeleden).order('datum', { ascending: false }),
    // Voor de belasting-/herstelanalyse: alle voltooide inspanning van 28 dagen
    // Zonder voltooid-filter: de geplande rustdagen tellen mee in de analyse.
    supabase.from('training_sessions')
      .select('datum, type, duur_minuten, afstand_km, intensiteit, voltooid')
      .eq('user_id', user.id)
      .gte('datum', achtentwintigDagenGeleden).lte('datum', vandaag),
    supabase.from('sport_activities')
      .select('datum, sport, duur_minuten, intensiteit')
      .eq('user_id', user.id)
      .gte('datum', achtentwintigDagenGeleden).lte('datum', vandaag),
  ])

  const belasting = analyseerBelasting(belastingSessies ?? [], sportActiviteiten ?? [], vandaag)
  const sportenDezeWeek = (sportActiviteiten ?? []).filter(a => a.datum >= getMaandag(vandaag))

  const naam = profiel?.naam?.split(' ')[0] ?? 'Atleet'
  const voltooid = recenteSessies?.filter(s => s.voltooid) ?? []
  const overgeslagen = recenteSessies?.filter(s => s.overgeslagen) ?? []
  const kmDezeWeek = voltooid
    .filter(s => s.datum >= getMaandag(vandaag))
    .reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
  const dagenTotDoel = doel
    ? Math.ceil((new Date(doel.datum).getTime() - Date.now()) / 86400000)
    : null

  const vandaagLoop = vandaagSessies?.find(s =>
    ['hardlopen', 'krachttraining', 'cross'].includes(s.type) && !s.voltooid
  )
  const vandaagAlVoltooid = vandaagSessies?.filter(s => s.voltooid) ?? []

  const appDagVandaag = vandaagJsDag === 0 ? 6 : vandaagJsDag - 1
  const activiteitVandaag = activiteiten?.find(a => a.dag_van_week === appDagVandaag)

  // ── Core patroonanalyse ────────────────────────────────────────────────────
  const dagNamen = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
  function dagIndex(datum: string): number {
    const js = new Date(datum + 'T12:00:00').getDay()
    return js === 0 ? 6 : js - 1 // 0=ma..6=zo
  }
  function dagsSindsLaatste(data: { datum: string }[]): number {
    if (!data.length) return 99
    return Math.floor((Date.now() - new Date(data[0].datum + 'T12:00:00').getTime()) / 86400000)
  }
  function gebruikelijkeDagen(data: { datum: string }[]): string[] {
    const telling = Array(7).fill(0)
    data.forEach(s => telling[dagIndex(s.datum)]++)
    const max = Math.max(...telling)
    if (max < 2) return []
    return telling
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n >= max - 1 && n >= 2)
      .map(({ i }) => dagNamen[i])
  }

  const coreDagsSindslLaatste = dagsSindsLaatste(recenteCore ?? [])
  const fysioD28 = recenteFysio ?? []
  const coreD28 = recenteCore ?? []
  const fysioDagsSindsLaatste = dagsSindsLaatste(fysioD28)
  const coreGebruikelijkeDagen = gebruikelijkeDagen(coreD28)
  const fysioGebruikelijkeDagen = gebruikelijkeDagen(fysioD28)
  const coreAantalD28 = coreD28.length
  const fysioAantalD28 = fysioD28.length
  const fysioDezeWeek = fysioD28.filter(s => s.datum >= getMaandag(vandaag)).length
  const coreDezeWeek = coreD28.filter(s => s.datum >= getMaandag(vandaag)).length
  const heeftFysio = (fysioOefeningen?.length ?? 0) > 0

  // Het ochtendbericht wist wél de datum van de wedstrijd maar niet of de tijd
  // die eronder staat nog in beeld is. Dat is juist wat je 's ochtends wil horen.
  const doelAnalyse = doel ? await haalDoelAnalyse(supabase, user.id, doel, vandaag) : null

  // Wanneer het vandaag het aangenaamst is om te lopen — binnen de uren dat je
  // kúnt. Een advies om om 07:00 te gaan terwijl je dan op kantoor zit is geen
  // advies. Staat er niets gepland, dan valt er ook niets te adviseren.
  let looptip: string | null = null
  if (vandaagLoop?.type === 'hardlopen') {
    const uren = await haalUurWeer(vandaag)
    if (uren.length) {
      const toegestaan = urenVoorDatum(
        (profiel as Record<string, unknown>)?.looptijden as Looptijden | null, vandaag)
      const advies = beoordeelLooptijd(uren, vandaagLoop.duur_minuten, new Date().getHours(), toegestaan)
      if (advies) {
        const { beste, maaktUit, vensterTeKrap, waarschuwing } = advies
        looptip = [
          `Beste looptijd vandaag: ${uurTekst(beste.startUur)}–${uurTekst(beste.eindUur)}`,
          `${beste.gevoel}° gevoelstemperatuur, ${beste.regenKans}% kans op regen`,
          vensterTeKrap ? '(je beschikbare uren zijn krap, dus veel keus is er niet)' : '',
          maaktUit ? '' : '(het scheelt vandaag weinig welk moment je kiest)',
          waarschuwing ?? '',
        ].filter(Boolean).join(' · ')
      }
    }
  }

  const context = [
    `Naam: ${naam}`,
    doel ? `Doel: ${doel.naam} over ${dagenTotDoel} dagen` : '',
    doelAnalyse ? doelVoorPrompt(doelAnalyse) : '',
    `Laatste 14 dagen: ${voltooid.length} trainingen voltooid, ${overgeslagen.length} overgeslagen`,
    `Km deze week: ${kmDezeWeek.toFixed(1)} km`,
    sportenDezeWeek.length
      ? `Andere sporten deze week: ${sportenDezeWeek.map(a => `${a.sport} (${a.duur_minuten}min, ${a.intensiteit})`).join(', ')}`
      : '',
    `Totale belasting: ${belasting.acuut} punten deze week vs ${belasting.chronisch} gemiddeld${belasting.ratio !== null ? ` (${belasting.ratio}×)` : ''} · ${belasting.rustdagen} rustdagen in 7 dagen · ${belasting.streak} dagen op rij gesport${belasting.rustdagenGemist > 0 ? ` · ${belasting.rustdagenGemist} geplande rustdag(en) uit het schema gevuld met andere sport` : ''}${belasting.dubbeleDagen > 0 ? ` · ${belasting.dubbeleDagen} dag(en) met zowel een training als een andere sport` : ''}`,
    belasting.niveau !== 'ok'
      ? `Herstelrisico: ${belasting.niveau === 'hoog' ? 'HOOG' : 'verhoogd'} — ${belasting.waarschuwingen.join('; ')}`
      : '',
    vandaagLoop
      ? `Geplande training vandaag: ${vandaagLoop.beschrijving} (${vandaagLoop.duur_minuten}min${vandaagLoop.afstand_km ? `, ${vandaagLoop.afstand_km}km` : ''}, ${vandaagLoop.intensiteit})`
      : 'Geen looptraining gepland vandaag',
    looptip ?? '',
    vandaagAlVoltooid.length > 0
      ? `Al voltooid vandaag: ${vandaagAlVoltooid.map(s => s.type).join(', ')}`
      : '',
    activiteitVandaag
      ? `Vaste activiteit vandaag: ${activiteitVandaag.naam} ${activiteitVandaag.tijdstip ?? ''}`
      : '',
    // Core context
    profiel?.wil_core ? [
      `Core stability: ${coreAantalD28}× gedaan in afgelopen 28 dagen, ${coreDezeWeek}× deze week`,
      coreDagsSindslLaatste < 99 ? `Laatste core: ${coreDagsSindslLaatste} dagen geleden` : 'Nog nooit core gedaan',
      coreGebruikelijkeDagen.length ? `Gebruikelijk core-moment: ${coreGebruikelijkeDagen.join(' en ')}` : '',
    ].filter(Boolean).join(' · ') : '',
    // Fysio context
    heeftFysio ? [
      `Fysiotherapie: ${fysioAantalD28}× gedaan in afgelopen 28 dagen, ${fysioDezeWeek}× deze week (doel: ${profiel?.fysio_per_week ?? 3}×/week)`,
      fysioDagsSindsLaatste < 99 ? `Laatste fysio: ${fysioDagsSindsLaatste} dagen geleden` : 'Nog nooit fysio gedaan',
      fysioGebruikelijkeDagen.length ? `Gebruikelijk fysio-moment: ${fysioGebruikelijkeDagen.join(' en ')}` : '',
    ].filter(Boolean).join(' · ') : '',
  ].filter(Boolean).join('\n')

  const alerts: string[] = []

  // 0. Overbelasting — telt zwaarder dan alle andere signalen, want hier ligt
  //    het blessurerisico. Staat daarom vóór de rest in de lijst (max 2 alerts).
  if (belasting.niveau === 'hoog') {
    alerts.push(`🛑 Te weinig herstel: ${belasting.waarschuwingen[0]}`)
  } else if (belasting.niveau === 'let_op') {
    alerts.push(`⚖️ Let op je herstel: ${belasting.waarschuwingen[0]}`)
  }

  // 1. Geen lange run in 14+ dagen
  const langeLopen = recenteSessies?.filter(s => s.voltooid && s.type === 'hardlopen' && (s.afstand_km ?? 0) >= 14) ?? []
  const dagsSindsCLangeRun = langeLopen.length > 0
    ? Math.floor((Date.now() - new Date(langeLopen[0].datum + 'T12:00:00').getTime()) / 86400000)
    : 99
  if (dagsSindsCLangeRun >= 14 && doel !== null) {
    alerts.push('⚠️ Geen lange duurloop in ' + dagsSindsCLangeRun + ' dagen')
  }

  // 2. >40% sessies overgeslagen in laatste 14 dagen
  const totaleSessies14d = recenteSessies?.filter(s => s.datum >= veertienDagenGeleden) ?? []
  const overgeslagen14d = totaleSessies14d.filter(s => s.overgeslagen).length
  if (totaleSessies14d.length >= 5 && overgeslagen14d / totaleSessies14d.length > 0.4) {
    alerts.push('📉 Veel trainingen overgeslagen (' + overgeslagen14d + '/' + totaleSessies14d.length + ' in 2 weken)')
  }

  // 3. Geen training deze week (woensdag of later)
  const vandaagDag = new Date(vandaag + 'T12:00:00').getDay()
  const maandagDezeWeek = getMaandag(vandaag)
  const sessiesDezeWeek = recenteSessies?.filter(s => s.datum >= maandagDezeWeek && s.voltooid) ?? []
  if (vandaagDag >= 3 && sessiesDezeWeek.length === 0) {
    alerts.push('💤 Nog geen training gedaan deze week')
  }

  // 4. Core te lang niet gedaan (drempel = 7 / core_per_week * 1.5 dagen)
  if (profiel?.wil_core) {
    const coreDrempel = Math.round(7 / (profiel.core_per_week ?? 2) * 1.5)
    if (coreDagsSindslLaatste >= coreDrempel) {
      alerts.push(`🧘 Al ${coreDagsSindslLaatste} dagen geen core stability gedaan`)
    }
  }

  // 5. Fysio te lang niet gedaan
  if (heeftFysio) {
    const fysioDrempel = Math.round(7 / (profiel?.fysio_per_week ?? 3) * 1.5)
    if (fysioDagsSindsLaatste >= fysioDrempel) {
      alerts.push(`💊 Al ${fysioDagsSindsLaatste} dagen geen fysiotherapie gedaan`)
    }
  }

  // Max 2 alerts
  alerts.splice(2)

  try {
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: `Je bent de persoonlijke mental coach van deze hardloper. Schrijf het bericht waarmee hij vanochtend wakker wordt: 3-4 zinnen, maximaal 320 tekens.

TOON — dit is het belangrijkste:
- Positief, warm en opgewekt. Je bent blij hem te spreken.
- Geef een oprecht compliment. Er is altijd iets: een training die hij wél gedaan heeft, een week die hij is doorgekomen, een lange duurloop, een reeks dagen achter elkaar, of simpelweg dat hij eraan begint.
- Zie in alles de positieve kant. Een rustige week is herstel. Een gemiste training is ruimte die hij genomen heeft. Een zware training is bewijs dat hij het aandurft.
- Spreek hem aan met zijn voornaam en met "je".
- Eindig met iets wat hem de deur uit krijgt.

WAT ER VERDER IN MOET:
- Wat er vandaag op het programma staat, concreet (afstand, duur of soort training).
- Staat er een looptijd-advies in de gegevens? Noem het beste moment om te gaan lopen en waarom (temperatuur, regen). Dat is binnen zijn beschikbare uren berekend, dus je mag het gewoon aanraden.
- Is het herstelrisico HOOG: raad dan rust of een lichte sessie aan. Breng dat positief — herstel is training, en hij is slim genoeg om ernaar te luisteren. Dit is de enige reden om van het schema af te wijken.

NOOIT DOEN:
- Verwijten maken, teleurstelling uitspreken, of benoemen hoeveel hij heeft laten liggen. Geen "maar", geen "je moet", geen "helaas".
- Cijfers verzinnen. Gebruik alleen wat hieronder staat. Staat er niets over vandaag, schrijf dan over de dag zelf.
- Overdrijven tot het ongeloofwaardig wordt. Een compliment moet kloppen, anders werkt het averechts.

Taal: Nederlands. Hooguit één emoji, alleen als het echt past.

Gegevens over de atleet:
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
