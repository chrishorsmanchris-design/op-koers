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

    const geblokkeerdeRegel = activiteiten && activiteiten.length > 0
      ? activiteiten
          .filter(a => a.blokkeert_hardlopen)
          .map(a => `${DAGEN[a.dag_van_week]}${a.tijdstip ? ` ${a.tijdstip}` : ''}`)
          .join(', ')
      : 'geen'

    const toegestaneTypes = ['hardlopen', 'krachttraining', 'rust']
    if (profiel?.wil_cross) toegestaneTypes.push('cross')

    const prompt = `Je bent een ervaren atletiekcoach. Maak een professioneel marathon trainingsschema gebaseerd op Hal Higdon / Jack Daniels methode.

VANDAAG: ${vandaag}
ATLEET: huidig volume ${profiel?.km_per_week ?? '?'} km/week
DOEL: ${doel.naam} op ${doel.datum} | tijdsdoel: ${doel.tijdsdoel ?? 'finishen'}
PERIODE: ${wekenTotDoel} weken
BLESSURE: ${profiel?.physio_klacht || 'geen bekende klachten'}
VAKANTIES: ${vakanties?.map(v => `${v.start_datum} t/m ${v.eind_datum} (kan trainen: ${v.kan_trainen})`).join('; ') || 'geen'}

VRIJE DAGEN — genereer op deze weekdagen GEEN enkele trainingssessie (laat ze volledig weg):
${geblokkeerdeRegel || 'geen'}

SCHEMA-OPBOUW:
- Weken 1-4: basisfase (duurlopen, herstel, volume opbouwen)
- Weken 5-10: opbouwfase (langere runs, interval toevoegen)
- Weken 11-14: specificatiefase (marathon-tempo, peak week)
- Laatste 2 weken: tapering (volume afbouwen, intensiteit bewaren)
- Max 4 sessies/week. Minimaal 1 lange duurloop/week op weekend.
- Beschrijving max 55 tekens.

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

    // Verwijder bestaande toekomstige sessies voor dit doel
    await supabase.from('training_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('goal_id', doel.id)
      .gte('datum', vandaag)

    const TOEGESTANE_VELDEN = new Set(['datum', 'type', 'beschrijving', 'duur_minuten', 'afstand_km', 'intensiteit', 'week_nummer', 'volgorde'])
    const GELDIGE_TYPES = new Set(['hardlopen', 'rust', 'krachttraining', 'cross', 'core'])
    const GELDIGE_INTENSITEITEN = new Set(['herstel', 'makkelijk', 'gemiddeld', 'zwaar', 'interval'])

    const sessiesOmOpslaan = schema.sessies
      .filter((s: { datum: string }) => s.datum >= vandaag)
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
