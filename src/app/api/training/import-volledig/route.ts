import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { planWeek, getMaandag, volgendeMaandag, type PlanSessie, type Vakantie } from '@/lib/schema-planning'
import { PDF_PLAN } from '@/lib/pdf-plan'

export const maxDuration = 300

const claude = new Anthropic()

// ─── Saniteer AI-output: zorg dat alleen geldige DB-waarden worden ingevoegd ──

const GELDIGE_TYPES = new Set(['hardlopen', 'rust', 'cross'])
const GELDIGE_INTENSITEITEN = new Set(['herstel', 'makkelijk', 'gemiddeld', 'zwaar', 'interval'])

// AI gebruikt soms D1/D2/D3/W of andere varianten — map ze naar DB-waarden
const INTENSITEIT_MAP: Record<string, PlanSessie['intensiteit']> = {
  h: 'herstel', herstel: 'herstel', recovery: 'herstel', rustig: 'herstel',
  d1: 'makkelijk', makkelijk: 'makkelijk', easy: 'makkelijk', aerobisch: 'makkelijk', licht: 'makkelijk',
  d2: 'gemiddeld', gemiddeld: 'gemiddeld', tempo: 'gemiddeld', moderate: 'gemiddeld', pittig: 'gemiddeld',
  d3: 'zwaar', zwaar: 'zwaar', hard: 'zwaar', drempel: 'zwaar', threshold: 'zwaar',
  w: 'interval', interval: 'interval', weerstand: 'interval', maximaal: 'interval', sprint: 'interval',
}

function sanitizeSessie(s: Record<string, unknown>): PlanSessie {
  const rawType = String(s.type ?? 'hardlopen').toLowerCase()
  const rawInt  = String(s.intensiteit ?? 'makkelijk').toLowerCase()

  const type = GELDIGE_TYPES.has(rawType) ? rawType as PlanSessie['type'] : 'hardlopen'
  const intensiteit = GELDIGE_INTENSITEITEN.has(rawInt)
    ? rawInt as PlanSessie['intensiteit']
    : (INTENSITEIT_MAP[rawInt] ?? 'makkelijk')

  return {
    dag: Math.max(0, Math.min(6, Number(s.dag ?? 0))),
    type,
    intensiteit,
    beschrijving: String(s.beschrijving ?? ''),
    duur_minuten: s.duur_minuten != null ? Number(s.duur_minuten) || null : null,
    afstand_km:   s.afstand_km   != null ? Number(s.afstand_km)   || null : null,
  }
}

// ─── Fase 1: AI pre-plan genereren ────────────────────────────────────────────

async function genereerPrePlan(
  aantalWeken: number,
  beschikbareDagen: number[],   // 0=ma..6=zo
  kmPerWeek: number,
  maxHartslag: number | null,
): Promise<PlanSessie[][]> {
  const DAGEN_NAMEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
  const dagNamen = beschikbareDagen.map(d => DAGEN_NAMEN[d]).join(', ')

  const hartslagInfo = maxHartslag ? `
MAX HARTSLAG: ${maxHartslag} bpm
Zones: H=${Math.round(maxHartslag*0.5)}-${Math.round(maxHartslag*0.6)} | D1=${Math.round(maxHartslag*0.6)}-${Math.round(maxHartslag*0.7)} | D2=${Math.round(maxHartslag*0.7)}-${Math.round(maxHartslag*0.8)} | D3=${Math.round(maxHartslag*0.8)}-${Math.round(maxHartslag*0.9)} | W=${Math.round(maxHartslag*0.9)}-${maxHartslag} bpm` : ''

  const prompt = `Je bent een marathoncoach. Genereer een opbouwfase van ${aantalWeken} weken die aansluit op het PDF-marathonschema.

METHODIEK: 80/20 polarized training (zelfde als het PDF-schema)
- 80% van volume in lage intensiteit (H en D1)
- 20% in hoge intensiteit (D2, D3, W/interval)
- Trainingszones: H (herstel/rustig), D1 (makkelijk/aerobisch), D2 (gemiddeld/pittig), D3 (zwaar), W (interval/maximaal)
- Looptempos: H=6:41/km, D1=5:51/km, D2=5:12/km, D3=4:41/km, W=4:27/km${hartslagInfo}

HUIDIGE BELASTING: ${kmPerWeek} km/week
BESCHIKBARE TRAININGSDAGEN: ${dagNamen} (alleen deze dagen gebruiken!)

DOELSTELLING WEEK ${aantalWeken}: aansloten op dit niveau (= PDF-week 1):
- 1 intervaltraining: 16 × 400m (W-tempo)
- 1 duurloop D2: 50 min
- 1 duurloop D1: 45-50 min
- 1 lange duurloop D1+D2: 80 min
- Totaal ~48 km/week

PROGRESSIE:
- Week 1: lager dan huidig niveau, rustig starten
- Weken 1-3: basisopbouw met D1 en korte intervals (6-8 × 400m)
- Weken 4-6: volume en intensiteit verhogen (10-14 × 400m of 4-6 × 800m)
- Week ${aantalWeken}: PDF-week 1 niveau

REGELS:
- Gebruik ALLEEN de beschikbare dagen (${dagNamen})
- Wissel zwaar/licht af (nooit 2 zware sessies op aansluitende dagen)
- 3-5 trainingen per week
- Elk week heeft rustdagen (type: "rust")
- Bouw wekelijks volume op met max 10% per week

Geef ALLEEN dit JSON object, geen uitleg:
{
  "weken": [
    {
      "sessies": [
        {"dag": 0, "type": "hardlopen", "intensiteit": "makkelijk", "beschrijving": "Duurloop 35 min in D1", "duur_minuten": 35, "afstand_km": 6.0},
        {"dag": 2, "type": "rust", "intensiteit": "herstel", "beschrijving": "Rust – geen training", "duur_minuten": null, "afstand_km": null}
      ]
    }
  ]
}`

  const res = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    system: 'Geef ALLEEN een geldig JSON object terug. Geen markdown. Geen tekst buiten de JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const tekst = res.content[0].type === 'text' ? res.content[0].text : ''

  // Extraheer JSON (Claude geeft soms markdown om)
  const match = tekst.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI gaf geen geldige JSON terug')

  const parsed = JSON.parse(match[0]) as { weken: Array<{ sessies: Record<string, unknown>[] }> }
  return parsed.weken.map(w => w.sessies.map(sanitizeSessie))
}

// ─── Hoofdroute ───────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    // Haal alle benodigde data op
    const [
      { data: doel },
      { data: profiel },
      { data: vakanties },
      { data: activiteiten },
    ] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', user.id).eq('actief', true).single(),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('vacations').select('*').eq('user_id', user.id),
      supabase.from('recurring_activities').select('*').eq('user_id', user.id).eq('blokkeert_hardlopen', true),
    ])

    if (!doel) return NextResponse.json({ error: 'Geen actief doel gevonden' }, { status: 400 })

    // Permanent geblokkeerde dagen (hockey etc.)
    const geblokkeerd = new Set<number>(activiteiten?.map(a => a.dag_van_week) ?? [])

    // Beschikbare dagen: uren > 0 in beschikbaarheid EN niet geblokkeerd
    const dagSleutels = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
    const beschikbaarheidMap = (profiel as Record<string, unknown>)?.beschikbaarheid as Record<string, number> | null
      ?? { ma: 2, di: 0, wo: 2, do: 3, vr: 2, za: 3, zo: 0 }
    const beschikbaar = [0, 1, 2, 3, 4, 5, 6].filter(d =>
      !geblokkeerd.has(d) && (beschikbaarheidMap[dagSleutels[d]] ?? 0) > 0
    )

    // Vakanties als simpele array
    const vakantieArray: Vakantie[] = (vakanties ?? []).map(v => ({
      start_datum: v.start_datum,
      eind_datum: v.eind_datum,
      kan_trainen: v.kan_trainen,
    }))

    // Datumberekeningen
    const vandaag = new Date()
    const marathonDatum = new Date(doel.datum)

    // Fase 2 start: PDF week 1 maandag = marathonDatum - 97 dagen, afgerond naar maandag
    const fase2Start = getMaandag(new Date(marathonDatum.getTime() - 97 * 86400000))

    // Fase 1 start: volgende maandag vanaf vandaag
    const fase1Start = volgendeMaandag(vandaag)

    // Aantal pre-plan weken (fase 1)
    const prePlanWeken = Math.max(0, Math.round((fase2Start.getTime() - fase1Start.getTime()) / (7 * 86400000)))

    // Verwijder alleen niet-voltooide toekomstige sessies — bewaar trainingshistorie
    const vandaagStr = new Date().toISOString().split('T')[0]
    await supabase.from('training_sessions').delete()
      .eq('user_id', user.id)
      .eq('voltooid', false)
      .gte('datum', vandaagStr)

    const alleSessies: object[] = []
    let volgorde = 1

    // ── Fase 1: AI pre-plan ──────────────────────────────────────────────────
    if (prePlanWeken > 0) {
      const kmPerWeek = (profiel as Record<string, unknown>)?.km_per_week as number ?? 40
      const maxHR = (profiel as Record<string, unknown>)?.max_hartslag as number | null ?? null

      const prePlanWeken_data = await genereerPrePlan(prePlanWeken, beschikbaar, kmPerWeek, maxHR)

      for (let i = 0; i < Math.min(prePlanWeken_data.length, prePlanWeken); i++) {
        const weekNr = i + 1
        const weekMaandag = new Date(fase1Start)
        weekMaandag.setDate(weekMaandag.getDate() + i * 7)

        const gepland = planWeek(prePlanWeken_data[i], weekMaandag, geblokkeerd, vakantieArray, weekNr, volgorde)
        volgorde += gepland.length

        for (const s of gepland) {
          alleSessies.push({
            user_id: user.id,
            goal_id: doel.id,
            datum: s.datum,
            type: s.type,
            beschrijving: s.beschrijving,
            duur_minuten: s.duur_minuten,
            afstand_km: s.afstand_km,
            intensiteit: s.intensiteit,
            voltooid: false,
            overgeslagen: false,
            volgorde: s.volgorde,
            week_nummer: s.week_nummer,
          })
        }
      }
    }

    // ── Fase 2: PDF-schema met constraint-aware scheduling ───────────────────
    for (let i = 0; i < PDF_PLAN.length; i++) {
      const weekNr = prePlanWeken + i + 1
      const weekMaandag = new Date(fase2Start)
      weekMaandag.setDate(weekMaandag.getDate() + i * 7)

      const gepland = planWeek(PDF_PLAN[i], weekMaandag, geblokkeerd, vakantieArray, weekNr, volgorde)
      volgorde += gepland.length

      for (const s of gepland) {
        alleSessies.push({
          user_id: user.id,
          goal_id: doel.id,
          datum: s.datum,
          type: s.type,
          beschrijving: s.beschrijving,
          duur_minuten: s.duur_minuten,
          afstand_km: s.afstand_km,
          intensiteit: s.intensiteit,
          voltooid: false,
          overgeslagen: false,
          volgorde: s.volgorde,
          week_nummer: s.week_nummer,
        })
      }
    }

    // ── Core & Fysio sessies toevoegen ───────────────────────────────────────
    const wilCore = (profiel as Record<string, unknown>)?.wil_core as boolean ?? false
    const corePerWeek = (profiel as Record<string, unknown>)?.core_per_week as number ?? 2
    const fysioPerWeek = (profiel as Record<string, unknown>)?.fysio_per_week as number ?? 3

    // Groepeer ingeplande sessies per (datum) voor makkelijk opzoeken
    const datumNaarSessies = new Map<string, typeof alleSessies>()
    for (const s of alleSessies) {
      const datum = (s as Record<string, unknown>).datum as string
      if (!datumNaarSessies.has(datum)) datumNaarSessies.set(datum, [])
      datumNaarSessies.get(datum)!.push(s)
    }

    // Voor elke week: voeg core/fysio toe volgens de juiste regels:
    // - Fysio: uitsluitend op rustdagen (nooit samen met een duurloop of interval)
    // - Core: voorkeur rustdagen (krachtoefeningen); als er geen zijn: herstelloopdagen (nooit op duurloop/interval)
    const totaalWeken = prePlanWeken + 14
    for (let w = 0; w < totaalWeken; w++) {
      const weekNr = w + 1
      const weekMaandag = w < prePlanWeken
        ? new Date(fase1Start.getTime() + w * 7 * 86400000)
        : new Date(fase2Start.getTime() + (w - prePlanWeken) * 7 * 86400000)

      const rustDagen: string[] = []        // geen hardlopen → geschikt voor fysio én core
      const herstelloopDagen: string[] = [] // alleen herstel-intensiteit → geschikt voor core

      for (let d = 0; d < 7; d++) {
        const datum = new Date(weekMaandag)
        datum.setDate(datum.getDate() + d)
        const datumStr = datum.toISOString().split('T')[0]
        const sessiesOpDag = (datumNaarSessies.get(datumStr) ?? []) as Record<string, unknown>[]
        const loopSessies = sessiesOpDag.filter(s => s.type === 'hardlopen')

        if (loopSessies.length === 0) {
          // Rustdag of lege dag — ideaal voor fysio en core
          rustDagen.push(datumStr)
        } else if (loopSessies.every(s => s.intensiteit === 'herstel')) {
          // Uitsluitend herstelloop — acceptabel voor core, niet voor fysio
          herstelloopDagen.push(datumStr)
        }
        // Duurloop/gemiddeld/zwaar/interval → fysio én core worden hier nooit gepland
      }

      // Fysio: alleen op rustdagen
      if (fysioPerWeek > 0) {
        for (let i = 0; i < Math.min(fysioPerWeek, rustDagen.length); i++) {
          alleSessies.push({
            user_id: user.id, goal_id: doel.id,
            datum: rustDagen[i],
            type: 'core', intensiteit: 'herstel',
            beschrijving: 'Fysio oefeningen – 15-20 min',
            duur_minuten: 20, afstand_km: null,
            voltooid: false, overgeslagen: false,
            volgorde: volgorde++, week_nummer: weekNr,
          })
        }
      }

      // Core: voorkeur rustdagen, daarna herstelloopdagen
      if (wilCore && corePerWeek > 0) {
        const coreDagen = rustDagen.length > 0 ? rustDagen : herstelloopDagen
        for (let i = 0; i < Math.min(corePerWeek, coreDagen.length); i++) {
          alleSessies.push({
            user_id: user.id, goal_id: doel.id,
            datum: coreDagen[i],
            type: 'core', intensiteit: 'herstel',
            beschrijving: 'Core stability – 20-30 min',
            duur_minuten: 25, afstand_km: null,
            voltooid: false, overgeslagen: false,
            volgorde: volgorde++, week_nummer: weekNr,
          })
        }
      }
    }

    // Invoegen in batches
    for (let i = 0; i < alleSessies.length; i += 100) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('training_sessions').insert(alleSessies.slice(i, i + 100) as any)
      if (error) return NextResponse.json({ error: `Invoegfout: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      aantalSessies: alleSessies.length,
      fase1Weken: prePlanWeken,
      fase2Weken: 14,
      startDatum: fase1Start.toISOString().split('T')[0],
      marathonDatum: doel.datum,
      bericht: prePlanWeken > 0
        ? `${alleSessies.length} sessies aangemaakt: ${prePlanWeken} weken opbouwfase + 14 weken PDF-schema (${fase1Start.toISOString().split('T')[0]} t/m ${doel.datum})`
        : `${alleSessies.length} sessies aangemaakt: 14 weken PDF-schema (${fase2Start.toISOString().split('T')[0]} t/m ${doel.datum})`,
    })

  } catch (err) {
    console.error('Import-volledig fout:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
