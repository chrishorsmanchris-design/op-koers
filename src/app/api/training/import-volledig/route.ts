import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { planWeek, getMaandag, isZwareSessie, type Vakantie, type GeplandeSessie } from '@/lib/schema-planning'
import { PDF_PLAN } from '@/lib/pdf-plan'
import { beperkOpbouw } from '@/lib/opbouw'
import { bepaalWerkelijkeWeken, type VoltooideSessie } from '@/lib/werkelijke-weken'

export const maxDuration = 120

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

    // Permanent geblokkeerde dagen (hockey etc.) — blokkeert alleen hardlopen
    const hockeyDagen = new Set<number>(activiteiten?.map(a => a.dag_van_week) ?? [])

    // Dagen met 0u beschikbaarheid — gebruiker heeft daar helemaal geen tijd om te trainen
    const dagSleutels = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
    const beschikbaarheidMap = (profiel as Record<string, unknown>)?.beschikbaarheid as Record<string, number> | null
      ?? { ma: 2, di: 0, wo: 2, do: 3, vr: 2, za: 3, zo: 0 }
    const geenTijdDagen = new Set<number>(
      [0, 1, 2, 3, 4, 5, 6].filter(d => (beschikbaarheidMap[dagSleutels[d]] ?? 0) <= 0)
    )

    // Alle dagen die volledig geblokkeerd zijn voor de hardloop-scheduler
    // (hockey blokkeert alleen hardlopen; 0u-beschikbaarheid blokkeert alles)
    const geblokkeerd = new Set<number>([...hockeyDagen, ...geenTijdDagen])

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

    // Fase 1 start: huidige maandag (niet de volgende, anders mist de huidige week)
    const fase1Start = getMaandag(vandaag)

    // Aantal pre-plan weken (fase 1)
    const prePlanWeken = Math.max(0, Math.round((fase2Start.getTime() - fase1Start.getTime()) / (7 * 86400000)))

    // Verwijder alleen toekomstige sessies waar je nog niets mee gedaan hebt.
    // Voltooid = je historie. Overgeslagen = een bewuste registratie dat je hem
    // gemist hebt; die hoort net zo goed bewaard te blijven.
    const vandaagStr = new Date().toISOString().split('T')[0]
    await supabase.from('training_sessions').delete()
      .eq('user_id', user.id)
      .eq('voltooid', false)
      .eq('overgeslagen', false)
      .gte('datum', vandaagStr)

    const alleSessies: object[] = []
    let volgorde = 1

    // De hersteldag na een zware zondag valt in de week erná. Zonder deze
    // doorgifte plant de planner elke maandag alsof er zondag niets gebeurd is.
    let vorigeDagZwaar = false
    let vorigeDagZwaarSchema = false

    // Eerst alle weken plannen, dan pas wegschrijven. De opbouwrem hieronder
    // kijkt naar de weken vóór een week om te bepalen of de sprong te groot is,
    // en dat kan alleen als het hele plan er in volgorde ligt.
    const weekPlannen: GeplandeSessie[][] = []
    // De maandag van elke week, op planvolgorde. Nodig om de weken naast je
    // werkelijke trainingen te kunnen leggen — óók voor een vakantieweek waarin
    // niets gepland stond en er dus geen enkele sessie is om de datum uit af te
    // leiden. Juist die week wil je kunnen meten.
    const weekMaandagen: string[] = []
    // Hetzelfde plan, maar zonder vakanties. Dit is de maatstaf voor de rem: hij
    // mag alleen ingrijpen waar je áchterloopt op wat het schema had opgebouwd.
    // Zonder deze schaduwversie kan de rem niet zien of een lage week een
    // vakantie was of gewoon een hersteldweek uit het schema zelf, en gaat hij
    // ook een ongestoord plan zitten bijschaven.
    const schemaPlannen: GeplandeSessie[][] = []

    const planBeide = (
      template: Parameters<typeof planWeek>[0],
      weekMaandag: Date, weekNr: number,
    ) => {
      const gepland = planWeek(template, weekMaandag, geblokkeerd, vakantieArray, weekNr, volgorde, { vorigeDagZwaar })
      const schema = planWeek(template, weekMaandag, geblokkeerd, [], weekNr, volgorde, { vorigeDagZwaar: vorigeDagZwaarSchema })
      volgorde += gepland.length
      // De hersteldag na een zware zondag valt in de week erná. Zonder deze
      // doorgifte plant de planner elke maandag alsof er zondag niets gebeurd is.
      vorigeDagZwaar = gepland.some(s => s.dag === 6 && isZwareSessie(s))
      vorigeDagZwaarSchema = schema.some(s => s.dag === 6 && isZwareSessie(s))
      weekPlannen.push(gepland)
      schemaPlannen.push(schema)
      weekMaandagen.push(weekMaandag.toISOString().split('T')[0])
    }

    // ── Fase 1: opbouwfase op basis van PDF week 1 (niet AI) ────────────────
    // Gebruik PDF week 1 als template zodat de methodiek consistent blijft met het plan.
    // Schaal het volume licht terug voor de eerste weken (85% → 92% → 100%).
    if (prePlanWeken > 0) {
      const schaalFactoren = [0.75, 0.85, 0.90, 0.95, 1.0]  // max 5 pre-plan weken

      for (let i = 0; i < prePlanWeken; i++) {
        const weekNr = i + 1
        const weekMaandag = new Date(fase1Start)
        weekMaandag.setDate(weekMaandag.getDate() + i * 7)
        const schaal = schaalFactoren[Math.min(i, schaalFactoren.length - 1)]

        // Gebruik PDF week 1 als basis, schaal duur en afstand
        const pdfWeek1 = PDF_PLAN[0].map(s => ({
          ...s,
          duur_minuten: s.duur_minuten ? Math.round(s.duur_minuten * schaal) : null,
          afstand_km: s.afstand_km ? Math.round(s.afstand_km * schaal * 10) / 10 : null,
          beschrijving: s.duur_minuten
            ? `${s.beschrijving} (opbouw ${Math.round(schaal * 100)}%)`
            : s.beschrijving,
        }))

        planBeide(pdfWeek1, weekMaandag, weekNr)
      }
    }

    // ── Fase 2: PDF-schema met constraint-aware scheduling ───────────────────
    for (let i = 0; i < PDF_PLAN.length; i++) {
      const weekNr = prePlanWeken + i + 1
      const weekMaandag = new Date(fase2Start)
      weekMaandag.setDate(weekMaandag.getDate() + i * 7)

      planBeide(PDF_PLAN[i], weekMaandag, weekNr)
    }

    // ── Opbouwrem ────────────────────────────────────────────────────────────
    // Vakanties knippen weken uit het plan, maar het PDF-schema loopt gewoon
    // door alsof je doorgetraind hebt. Zonder deze rem sta je na twee weken
    // Kenia meteen weer op 80 km met een duurloop van 28 km. Hier wordt dat
    // teruggebracht tot wat je lichaam op dat moment aankan.
    // Wat je werkelijk gedaan hebt in de weken die al voorbij zijn. Het plan
    // begint bij fase 2 vaak in het verleden, dus een deel van deze weken is al
    // gelopen — inclusief eventuele vakantieweken. Zonder deze meting neemt de
    // rem aan dat je gedaan hebt wat er gepland stond, en dat is precies de
    // aanname die na een vakantie niet klopt: in beide richtingen.
    const { data: gelopen } = await supabase
      .from('training_sessions')
      .select('datum, type, duur_minuten, afstand_km, intensiteit, session_feedback(rating, werkelijke_duur, werkelijke_afstand)')
      .eq('user_id', user.id)
      .eq('voltooid', true)
      .gte('datum', weekMaandagen[0] ?? vandaagStr)
      .lt('datum', vandaagStr)

    const voltooideSessies: VoltooideSessie[] = (gelopen ?? []).map(s => {
      const rij = s as Record<string, unknown>
      const fb = (rij.session_feedback as Record<string, unknown>[] | null)?.[0]
      return {
        datum: rij.datum as string,
        type: rij.type as string,
        duur_minuten: rij.duur_minuten as number | null,
        afstand_km: rij.afstand_km as number | null,
        intensiteit: rij.intensiteit as string | null,
        werkelijke_duur: fb?.werkelijke_duur as number | null,
        werkelijke_afstand: fb?.werkelijke_afstand as number | null,
        rating: fb?.rating as string | null,
      }
    })

    const werkelijk = bepaalWerkelijkeWeken(voltooideSessies, weekMaandagen, vandaagStr)

    const { weken: geremdeWeken, aanpassingen } = beperkOpbouw(weekPlannen, schemaPlannen, werkelijk)

    for (const week of geremdeWeken) {
      for (const s of week) {
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
        if (geenTijdDagen.has(d)) continue // geen tijd deze dag — ook geen fysio/core

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

    // Fase 1 begint op de maandag van de HUIDIGE week, dus een deel daarvan ligt
    // al in het verleden. De opruimactie hierboven raakt alleen datum >= vandaag,
    // want voltooide trainingen mogen nooit verdwijnen. Zonder deze filter voegde
    // elke her-import de al verstreken dagen van deze week er nóg een keer bij —
    // vandaar dat er dagen waren met twee, drie of vier identieke sessies.
    // Wat we invoegen moet exact hetzelfde bereik beslaan als wat we weggooien.
    const teBewaren = alleSessies.filter(
      s => ((s as Record<string, unknown>).datum as string) >= vandaagStr
    )

    // De opruimactie hierboven spaart voltooide en overgeslagen sessies. Zouden we
    // daarna klakkeloos de hele periode terugzetten, dan komt er op elke dag die je
    // al afgevinkt had een tweede, identieke sessie bij — precies wat er op 10
    // augustus gebeurde. Wat blijft staan moet dus uit de invoeglijst.
    const { data: blijftStaan } = await supabase
      .from('training_sessions')
      .select('datum, type, beschrijving')
      .eq('user_id', user.id)
      .gte('datum', vandaagStr)

    const bezetteLoopdagen = new Set<string>()
    const bezetteSessies = new Set<string>()
    for (const s of blijftStaan ?? []) {
      const rij = s as Record<string, unknown>
      if (rij.type === 'hardlopen') bezetteLoopdagen.add(rij.datum as string)
      bezetteSessies.add(`${rij.datum}|${rij.type}|${rij.beschrijving}`)
    }

    const nieuweSessies = teBewaren.filter(s => {
      const rij = s as Record<string, unknown>
      // Eén hardloopsessie per dag: staat er al een gelopen of gemiste run, dan
      // hoort daar geen geplande versie meer naast.
      if (rij.type === 'hardlopen' && bezetteLoopdagen.has(rij.datum as string)) return false
      // Core en fysio mogen wel meerdere per dag, dus die vergelijken we op naam.
      return !bezetteSessies.has(`${rij.datum}|${rij.type}|${rij.beschrijving}`)
    })

    // Invoegen in batches
    for (let i = 0; i < nieuweSessies.length; i += 100) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('training_sessions').insert(nieuweSessies.slice(i, i + 100) as any)
      if (error) return NextResponse.json({ error: `Invoegfout: ${error.message}` }, { status: 500 })
    }

    // Een teruggeschaalde week is geen detail dat je stilletjes doorvoert: als
    // er ineens 18 km staat waar het schema 28 km voorschrijft, wil je weten
    // waarom. Anders lijkt het een bug en zet je hem handmatig terug.
    const opbouwBericht = aanpassingen.length > 0
      ? ` ${aanpassingen.length} ${aanpassingen.length === 1 ? 'week is' : 'weken zijn'} teruggeschaald rond je vakanties, zodat je er niet te hard weer instapt.`
      : ''

    return NextResponse.json({
      success: true,
      aantalSessies: nieuweSessies.length,
      fase1Weken: prePlanWeken,
      fase2Weken: 14,
      startDatum: fase1Start.toISOString().split('T')[0],
      marathonDatum: doel.datum,
      opbouwAanpassingen: aanpassingen,
      bericht: (prePlanWeken > 0
        ? `${nieuweSessies.length} sessies aangemaakt: ${prePlanWeken} weken opbouwfase + 14 weken PDF-schema (${fase1Start.toISOString().split('T')[0]} t/m ${doel.datum}).`
        : `${nieuweSessies.length} sessies aangemaakt: 14 weken PDF-schema (${fase2Start.toISOString().split('T')[0]} t/m ${doel.datum}).`) + opbouwBericht,
    })

  } catch (err) {
    console.error('Import-volledig fout:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
