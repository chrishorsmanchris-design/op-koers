/**
 * Pasfrequentie: hoeveel passen je per minuut zet.
 *
 * Waarom dit de moeite waard is om bij te houden, en waarom niet:
 *
 * NIET om zuiniger te lopen. Cavanagh & Williams lieten in 1982 zien dat
 * hardlopers hun paslengte vanzelf binnen ongeveer 3% van het metabool optimum
 * kiezen, en dat elke opgelegde verandering — korter én langer — méér zuurstof
 * kostte (Med Sci Sports Exerc 1982;14(1):30-35). Je lichaam heeft dit al
 * opgelost. Wie je cadans verandert om energie te besparen, maakt het slechter.
 *
 * WEL om je gewrichten te ontzien. Heiderscheit et al. verhoogden de
 * pasfrequentie met 5% en 10% en zagen de energie-absorptie in knie en heup fors
 * dalen, samen met minder verticale beweging van het zwaartepunt en minder
 * afremmen per pas (Med Sci Sports Exerc 2011;43(2):296-302). De systematische
 * review van Schubert, Kempf & Heiderscheit bevestigt dat beeld (Sports Health
 * 2014;6(3):210-217).
 *
 * Cadans is dus een blessure-instrument, geen zuinigheidsinstrument. Daarom
 * rekent dit bestand alles af tegen jóuw eigen basislijn en nergens tegen 180.
 * Dat getal komt uit een telling van Jack Daniels bij olympische finalisten op
 * wedstrijdtempo in 1984; het is een waarneming aan de top, geen norm voor een
 * rustige duurloop.
 */

/** Onder dit aantal metingen zegt een mediaan niets. */
export const MIN_METINGEN = 5

/**
 * Strava levert cadans voor hardlopen als "steps per minute of one foot" — dus
 * per been, ongeveer 80 tot 95. Wij rekenen in passen per minuut en verdubbelen.
 *
 * De ondergrens is er omdat niet elk horloge zich aan die afspraak houdt: komt
 * er al een waarde boven de 120 binnen, dan is dat allebei de benen en zou
 * verdubbelen op 340 uitkomen. Dat bestaat niet, dus dan laten we hem staan.
 */
export function cadansUitStrava(ruw: number | null | undefined): number | null {
  if (typeof ruw !== 'number' || !Number.isFinite(ruw) || ruw <= 0) return null
  const spm = Math.round(ruw < 120 ? ruw * 2 : ruw)
  // Buiten dit bereik loopt niemand. Liever geen getal dan een verzonnen getal.
  if (spm < 120 || spm > 240) return null
  return spm
}

export interface CadansRun {
  datum: string
  afstand_km: number | null
  duur_minuten: number | null
  cadans_spm: number | null
}

export interface CadansPunt {
  datum: string
  cadans: number
  /** Seconden per kilometer; cadans loopt op met tempo, dus dit hoort erbij. */
  tempoSec: number
}

export interface CadansAnalyse {
  punten: CadansPunt[]
  /** Mediaan over je rustige lopen — de basislijn waar een doel op slaat. */
  basis: number
  /** Mediaan over je snelste lopen, om het verband met tempo te laten zien. */
  snel: number | null
  /** +5% tot +10% ten opzichte van je eigen rustige cadans. */
  doel: { min: number; max: number }
  uitleg: string
}

function mediaan(getallen: number[]): number {
  const g = [...getallen].sort((a, b) => a - b)
  const m = Math.floor(g.length / 2)
  return g.length % 2 ? g[m] : Math.round((g[m - 1] + g[m]) / 2)
}

export function analyseerCadans(runs: CadansRun[]): CadansAnalyse | null {
  const punten: CadansPunt[] = []
  for (const r of runs) {
    if (!r.cadans_spm || !r.afstand_km || !r.duur_minuten) continue
    // Te kort om een stabiele cadans op te leveren: de eerste minuten loop je
    // je tred nog te zoeken.
    if (r.afstand_km < 2 || r.duur_minuten < 10) continue
    punten.push({
      datum: r.datum,
      cadans: r.cadans_spm,
      tempoSec: (r.duur_minuten * 60) / r.afstand_km,
    })
  }

  if (punten.length < MIN_METINGEN) return null

  // Cadans loopt op met tempo, dus één getal over alle sessies is misleidend.
  // De basislijn komt daarom uit je langzaamste helft: dáár loop je je
  // duurlopen, en dáár valt met een hogere cadans belasting te besparen.
  const opTempo = [...punten].sort((a, b) => b.tempoSec - a.tempoSec)
  const helft = Math.max(1, Math.floor(opTempo.length / 2))
  const rustig = opTempo.slice(0, helft)
  const hard = opTempo.slice(-helft)

  const basis = mediaan(rustig.map(p => p.cadans))
  const snel = punten.length >= MIN_METINGEN * 2 ? mediaan(hard.map(p => p.cadans)) : null

  const doel = {
    min: Math.round(basis * 1.05),
    max: Math.round(basis * 1.10),
  }

  const verschil = snel !== null ? snel - basis : 0
  const tempoNoot =
    snel !== null && verschil >= 3
      ? ` Op je snelle lopen zit je op ${snel} — dat cadans meestijgt met je tempo is normaal en hoef je niet te corrigeren.`
      : ''

  return {
    punten,
    basis,
    snel,
    doel,
    uitleg:
      `Op je rustige lopen zit je rond ${basis} passen per minuut.${tempoNoot} ` +
      `Wil je je knieën en heupen ontzien, dan is ${doel.min}–${doel.max} het doel: vijf tot tien procent boven je eigen basislijn. ` +
      'Niet omdat je dan zuiniger loopt — dat word je er eerder minder van — maar omdat je per pas minder hard landt en minder afremt. ' +
      'Bouw het op in korte stukken van een paar minuten binnen een rustige loop; in één keer een hele duurloop op een vreemde cadans houdt niemand vol.',
  }
}
