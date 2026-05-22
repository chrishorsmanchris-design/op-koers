import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

const claude = new Anthropic()

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const [
      { data: profiel },
      { data: doel },
      { data: vakanties },
      { data: resultaten },
      { data: activiteiten },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('actief', true).single(),
      supabase.from('vacations').select('*').eq('user_id', user.id),
      supabase.from('previous_results').select('*').eq('user_id', user.id),
      supabase.from('recurring_activities').select('*').eq('user_id', user.id),
    ])

    if (!doel) return NextResponse.json({ error: 'Geen actief doel gevonden' }, { status: 400 })

    const vandaag = new Date().toISOString().split('T')[0]
    // Max 16 weken per generatie (past binnen Sonnet output limiet)
    const wekenTotDoel = Math.min(
      Math.ceil((new Date(doel.datum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)),
      16
    )

    // Geblokkeerde dagen (0=ma..6=zo in app, maar prompt gebruikt maandag..zondag)
    const geblokkeerdeActiviteiten = activiteiten?.filter(a => a.blokkeert_hardlopen) ?? []
    const geblokkeerdeRegel = geblokkeerdeActiviteiten.length > 0
      ? geblokkeerdeActiviteiten
          .map(a => `${DAGEN[a.dag_van_week]}${a.tijdstip ? ` (${a.tijdstip})` : ''}`)
          .join(', ')
      : 'geen'

    // Geblokkeerde dag-indices voor post-generatie validatie (0=ma..6=zo)
    const geblokkeerdeIndices = new Set(geblokkeerdeActiviteiten.map(a => a.dag_van_week))

    const toegestaneTypes = ['hardlopen', 'krachttraining', 'rust']
    if (profiel?.wil_cross) toegestaneTypes.push('cross')

    const maxHR = (profiel as Record<string, unknown>)?.max_hartslag as number | null
    const hartslagInfo = maxHR ? `
MAX HARTSLAG ATLEET: ${maxHR} bpm
HARTSLAGZONES (gebruik deze als trainingsrichtlijn):
- Z1 Herstel (intensiteit: herstel): ${Math.round(maxHR * 0.50)}–${Math.round(maxHR * 0.60)} bpm
- Z2 Aerobisch (intensiteit: makkelijk): ${Math.round(maxHR * 0.60)}–${Math.round(maxHR * 0.70)} bpm
- Z3 Tempo (intensiteit: gemiddeld): ${Math.round(maxHR * 0.70)}–${Math.round(maxHR * 0.80)} bpm
- Z4 Drempel (intensiteit: zwaar): ${Math.round(maxHR * 0.80)}–${Math.round(maxHR * 0.90)} bpm
- Z5 Interval (intensiteit: interval): ${Math.round(maxHR * 0.90)}–${maxHR} bpm
80% van het trainingsvolume hoort in Z1-Z2 (herstel + makkelijk).` : ''

    // Beschikbaarheid per dag — bepaal trainbare dagen en aanbevolen sessies/week
    const beschikbaarheid = (profiel as Record<string, unknown>)?.beschikbaarheid as
      Record<string, number> | null ?? { ma: 2, di: 0, wo: 2, do: 3, vr: 2, za: 3, zo: 0 }
    const DAGMAP: Record<string, string> = { ma: 'maandag', di: 'dinsdag', wo: 'woensdag', do: 'donderdag', vr: 'vrijdag', za: 'zaterdag', zo: 'zondag' }
    const beschikbaarheidRegel = Object.entries(beschikbaarheid)
      .map(([dag, uur]) => `${DAGMAP[dag]}: ${uur === 0 ? 'niet beschikbaar' : `${uur}u`}`)
      .join(', ')

    // Trainbare dagen = uur > 0 én niet geblokkeerd
    const geblokkeerdeNamen = new Set(geblokkeerdeActiviteiten.map(a => DAGEN[a.dag_van_week]))
    const trainbareDagen = Object.entries(beschikbaarheid)
      .filter(([dag, uur]) => uur > 0 && !geblokkeerdeNamen.has(DAGMAP[dag]))
      .map(([dag]) => DAGMAP[dag])

    const kmPerWeek = profiel?.km_per_week ?? 30
    // Richtlijn: minimale en maximale sessies/week op basis van volume
    const minSessies = kmPerWeek <= 25 ? 3 : kmPerWeek <= 40 ? 3 : 4
    const maxSessies = Math.min(trainbareDagen.length, kmPerWeek <= 25 ? 4 : kmPerWeek <= 40 ? 5 : 6)

    const opbouwtempo = (profiel as Record<string, unknown>)?.opbouwtempo as string | null ?? 'stabiel'

    const prompt = `Je bent een ervaren atletiekcoach. Maak een professioneel marathon trainingsschema gebaseerd op Hal Higdon / Jack Daniels methode.

VANDAAG (startdatum schema): ${vandaag}
EERSTE SESSIE: moet op ${vandaag} of de eerstvolgende dag zijn — begin DIRECT, geen weken overslaan.
ATLEET: huidig volume ${kmPerWeek} km/week | opbouwtempo: ${opbouwtempo}${hartslagInfo}
DOEL: ${doel.naam} op ${doel.datum} | tijdsdoel: ${doel.tijdsdoel ?? 'finishen'}
PERIODE: ${wekenTotDoel} weken VANAF VANDAAG (${vandaag} t/m ${new Date(new Date(vandaag).getTime() + wekenTotDoel * 7 * 86400000).toISOString().split('T')[0]})
BLESSURE: ${profiel?.physio_klacht || 'geen bekende klachten'}
VAKANTIES: ${vakanties?.map(v => `${v.start_datum} t/m ${v.eind_datum} (kan trainen: ${v.kan_trainen})`).join('; ') || 'geen'}

BESCHIKBAARHEID PER DAG (verplicht respecteren):
${beschikbaarheidRegel}
Trainbare dagen deze week: ${trainbareDagen.join(', ') || 'zie beschikbaarheid'}

GEBLOKKEERDE WEEKDAGEN — absoluut GEEN hardloopsessie:
${geblokkeerdeRegel}

SESSIES PER WEEK: minimaal ${minSessies}, maximaal ${maxSessies}
Gebruik ALLEEN de trainbare dagen hierboven. Plaats NOOIT een sessie op een dag met 0u beschikbaarheid.
Spread de sessies goed over de week — nooit 2 zware sessies op opeenvolgende dagen.

SCHEMA-OPBOUW:
- Weken 1-4: basisfase (duurlopen, herstel, volume opbouwen)
- Weken 5-10: opbouwfase (langere runs, interval toevoegen)
- Weken 11-14: specificatiefase (marathon-tempo, peak week)
- Laatste 2 weken: tapering (volume afbouwen, intensiteit bewaren)
- Minimaal 1 lange duurloop/week (weekend of rustige dag)
- 80% van trainingen Z1-Z2 (herstel/makkelijk), 20% kwaliteit
- Beschrijving max 55 tekens.
${maxHR ? `- Verwerk de hartslagzone in de beschrijving, bijv. "Z2 duurloop" of "Z4 drempeltraining"` : ''}

TOEGESTANE TYPES: ${toegestaneTypes.join(' | ')}
TOEGESTANE INTENSITEITEN: herstel | makkelijk | gemiddeld | zwaar | interval

Geef ALLEEN geldig JSON, geen markdown, geen extra tekst:
{"sessies":[{"datum":"YYYY-MM-DD","type":"hardlopen","beschrijving":"Tekst","duur_minuten":45,"afstand_km":8.0,"intensiteit":"makkelijk","week_nummer":1,"volgorde":1}],"uitleg":"Korte uitleg van het schema"}`

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: 'Geef ALLEEN een geldig JSON object terug. Geen markdown codeblokken. Geen tekst buiten de JSON.',
      messages: [{ role: 'user', content: prompt }],
    })

    const tekst = response.content[0].type === 'text' ? response.content[0].text : ''

    let schema
    try { schema = JSON.parse(tekst.trim()) } catch { /* probeer extractie */ }
    if (!schema) {
      const start = tekst.indexOf('{')
      const end = tekst.lastIndexOf('}')
      if (start !== -1 && end > start) {
        try { schema = JSON.parse(tekst.slice(start, end + 1)) } catch { /* valt door */ }
      }
    }
    if (!schema) return NextResponse.json({ error: 'Schema kon niet worden geparsed', tekst: tekst.slice(0, 500) }, { status: 500 })

    if (!schema.sessies || !Array.isArray(schema.sessies)) {
      return NextResponse.json({ error: 'Geen sessies in schema', schema }, { status: 500 })
    }

    // Verwijder alleen NIET-voltooide toekomstige sessies (bewaar voltooide trainingen!)
    await supabase.from('training_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('goal_id', doel.id)
      .eq('voltooid', false)
      .gte('datum', vandaag)

    const TOEGESTANE_VELDEN = new Set(['datum', 'type', 'beschrijving', 'duur_minuten', 'afstand_km', 'intensiteit', 'week_nummer', 'volgorde'])
    const GELDIGE_TYPES = new Set(['hardlopen', 'rust', 'krachttraining', 'cross', 'core'])
    const GELDIGE_INTENSITEITEN = new Set(['herstel', 'makkelijk', 'gemiddeld', 'zwaar', 'interval'])

    const sessiesOmOpslaan = schema.sessies
      .filter((s: { datum: string; type: string }) => {
        if (s.datum < vandaag) return false
        // Verwijder hardloopsessies op geblokkeerde weekdagen
        if (s.type === 'hardlopen' && geblokkeerdeIndices.size > 0) {
          const d = new Date(s.datum + 'T12:00:00')
          const jsDag = d.getDay() // 0=zo..6=za
          const appDag = jsDag === 0 ? 6 : jsDag - 1 // 0=ma..6=zo
          if (geblokkeerdeIndices.has(appDag)) return false
        }
        return true
      })
      .map((s: Record<string, unknown>) => {
        const schoon: Record<string, unknown> = { user_id: user.id, goal_id: doel.id }
        for (const k of TOEGESTANE_VELDEN) {
          if (k in s) schoon[k] = s[k]
        }
        // Zorg dat type en intensiteit geldige waarden hebben
        if (!GELDIGE_TYPES.has(String(schoon.type))) schoon.type = 'rust'
        if (schoon.intensiteit && !GELDIGE_INTENSITEITEN.has(String(schoon.intensiteit))) schoon.intensiteit = 'makkelijk'
        // Core als type is toegestaan maar valt terug op krachttraining bij DB constraint fout
        return schoon
      })

    const { error: insertError } = await supabase.from('training_sessions').insert(sessiesOmOpslaan)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    return NextResponse.json({ uitleg: schema.uitleg, aantalSessies: sessiesOmOpslaan.length })
  } catch (e) {
    console.error('Genereer fout:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
