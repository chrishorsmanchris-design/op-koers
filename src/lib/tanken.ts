/**
 * Wat je onderweg nodig hebt: koolhydraten en vocht.
 *
 * Je glycogeenvoorraad is goed voor ruwweg anderhalf uur hardlopen. Daarna loop
 * je op vet, en dat gaat trager en kost meer hartslag voor hetzelfde tempo. Een
 * lange duurloop zonder iets te eten is daarom geen "harder trainen" maar een
 * andere training: je oefent leeglopen in plaats van doorlopen.
 *
 * Het tweede argument is belangrijker dan het eerste. Je darmen moeten leren
 * gels te verwerken terwijl je loopt, en dat leren ze alleen door het te doen.
 * Wie op de wedstrijddag voor het eerst tankt, krijgt het er vaak niet in. Elke
 * lange duurloop is dus ook een oefensessie voor je maag — vandaar dat dit plan
 * bij de training staat en niet bij de wedstrijd.
 *
 * De getallen hieronder zijn bewust bereiken en geen precieze doelen. Wat een
 * maag verdraagt verschilt sterk per persoon, en de enige manier om jouw getal
 * te vinden is onderaan het bereik beginnen en opbouwen.
 */

/** Onder dit aantal minuten heb je onderweg niets nodig; water volstaat. */
const DREMPEL_DRINKEN = 60
/** Vanaf hier raakt de voorraad op en gaan koolhydraten meetellen. */
const DREMPEL_TANKEN = 90

/**
 * Eerste gel na 45 minuten: ruim vóórdat je iets merkt. Wachten tot je leegloopt
 * is te laat, want het duurt 15 à 20 minuten voordat suiker in je bloed staat.
 */
const EERSTE_GEL_MIN = 45
const GEL_INTERVAL_MIN = 30
/** De laatste minuten hoef je niet meer te tanken; dat komt niet meer aan. */
const STOP_VOOR_EINDE_MIN = 10
/** Een standaard sportgel. Merken variëren van 20 tot 30 gram. */
const GRAM_PER_GEL = 22

export type Tankniveau = 'geen' | 'drinken' | 'tanken'

export interface Tankplan {
  niveau: Tankniveau
  duurMin: number
  /** Verwachte maximumtemperatuur, of null als het weer onbekend is. */
  tempC: number | null
  /** Milliliter per uur, als bereik. */
  vochtPerUur: [number, number]
  vochtTotaalMl: [number, number]
  /** Aantal gels, en wat dat aan koolhydraten oplevert. */
  gels: number
  koolhydratenGram: number
  koolhydratenPerUur: number
  /** Minuten waarop je een gel neemt. */
  momenten: number[]
  vooraf: string
  achteraf: string
  waarschuwing: string | null
}

/**
 * Warmte kost vocht, en vochtverlies kost hartslag: vanaf zo'n 2% van je
 * lichaamsgewicht loopt je hartslag meetbaar op bij hetzelfde tempo. Zonder
 * weersverwachting nemen we het gematigde midden — liever iets te weinig
 * adviseren dan iemand op een koude dag laten overdrinken.
 */
function vochtPerUurBijTemp(tempC: number | null): [number, number] {
  if (tempC === null) return [500, 700]
  if (tempC <= 10) return [400, 600]
  if (tempC <= 18) return [500, 700]
  if (tempC <= 24) return [600, 900]
  return [700, 1000]
}

function gelMomenten(duurMin: number): number[] {
  const momenten: number[] = []
  const laatste = duurMin - STOP_VOOR_EINDE_MIN
  for (let m = EERSTE_GEL_MIN; m <= laatste; m += GEL_INTERVAL_MIN) momenten.push(m)
  return momenten
}

export function tijdTekst(minuten: number): string {
  const u = Math.floor(minuten / 60)
  const m = minuten % 60
  return u > 0 ? `${u}:${String(m).padStart(2, '0')}` : `${m} min`
}

/**
 * @param duurMin  Geplande duur van de sessie.
 * @param tempC    Verwachte maximumtemperatuur, of null als die er niet is.
 */
export function maakTankplan(duurMin: number | null, tempC: number | null): Tankplan | null {
  if (!duurMin || duurMin < DREMPEL_DRINKEN) return null

  const vochtPerUur = vochtPerUurBijTemp(tempC)
  const uren = duurMin / 60
  const vochtTotaalMl: [number, number] = [
    Math.round((vochtPerUur[0] * uren) / 50) * 50,
    Math.round((vochtPerUur[1] * uren) / 50) * 50,
  ]

  const heet = tempC !== null && tempC >= 25
  const warm = tempC !== null && tempC >= 20

  if (duurMin < DREMPEL_TANKEN) {
    return {
      niveau: 'drinken',
      duurMin,
      tempC,
      vochtPerUur,
      vochtTotaalMl,
      gels: 0,
      koolhydratenGram: 0,
      koolhydratenPerUur: 0,
      momenten: [],
      vooraf: 'Een normale maaltijd 2 tot 3 uur van tevoren is genoeg. Drink een glas water vlak voor vertrek.',
      achteraf: 'Drink na afloop rustig door tot je urine weer licht is.',
      waarschuwing: warm
        ? `Bij ${tempC}° graden telt drinken zwaarder dan eten: neem water mee of plan een route langs een kraan.`
        : null,
    }
  }

  const momenten = gelMomenten(duurMin)
  const koolhydratenGram = momenten.length * GRAM_PER_GEL
  const koolhydratenPerUur = Math.round(koolhydratenGram / uren)

  return {
    niveau: 'tanken',
    duurMin,
    tempC,
    vochtPerUur,
    vochtTotaalMl,
    gels: momenten.length,
    koolhydratenGram,
    koolhydratenPerUur,
    momenten,
    vooraf:
      'Eet 2 tot 3 uur van tevoren koolhydraten — brood, pap, rijst. Laat vezels en vet weg: die blijven in je maag zitten en geven onderweg last.',
    achteraf:
      'Binnen het uur na afloop koolhydraten plus 20 tot 30 gram eiwit. Dat uur is geen magie, maar eerder eten betekent eerder herstellen.',
    waarschuwing: heet
      ? `Bij ${tempC}° graden verlies je fors meer vocht dan je kunt drinken. Overweeg vroeg te vertrekken en het tempo een tandje in te leveren — je hartslag ligt bij deze temperatuur toch al hoger.`
      : warm
        ? `Bij ${tempC}° graden loopt het vochtverlies op. Plan waar je onderweg kunt bijvullen.`
        : null,
  }
}
