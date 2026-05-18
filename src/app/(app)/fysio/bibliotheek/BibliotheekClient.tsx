'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ArrowLeft, Check, Plus, Search } from 'lucide-react'
import Link from 'next/link'

interface LibraireOefening {
  id: string
  naam: string
  categorie: 'heup' | 'knie' | 'enkel' | 'rug' | 'kuit' | 'bil' | 'core'
  sets?: number
  reps?: number
  duur_seconden?: number
  beschrijving: string
  emoji: string
}

const BIBLIOTHEEK: LibraireOefening[] = [
  {
    id: 'heupbuiger-stretch',
    naam: 'Heupbuiger stretch',
    categorie: 'heup',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Lig op je rug, trek één knie naar je borst en houd de andere been gestrekt op de grond. Voel de rek in de heupbuiger van het gestrekte been. Wissel na 30 seconden.',
    emoji: '🦵',
  },
  {
    id: 'it-band-massage',
    naam: 'IT-band massage',
    categorie: 'knie',
    sets: 1,
    duur_seconden: 60,
    beschrijving: 'Rol met een foam roller over de buitenzijde van je bovenbeen, van knie tot heup. Pauzeer op gevoelige punten. Dit verlicht spanning in het IT-band die kniepijn veroorzaakt.',
    emoji: '🔄',
  },
  {
    id: 'kuitversteviging',
    naam: 'Kuitversteviging',
    categorie: 'kuit',
    sets: 3,
    reps: 15,
    beschrijving: 'Sta op je tenen op een traptreden met je hielen over de rand. Laat je hielen langzaam zakken tot onder het niveau van de trede en kom dan omhoog op je tenen. Gebruik een reling voor balans.',
    emoji: '⬆️',
  },
  {
    id: 'glutebrug',
    naam: 'Glutebrug',
    categorie: 'bil',
    sets: 3,
    reps: 15,
    beschrijving: 'Lig op je rug met je knieën gebogen en voeten plat op de grond. Duw je heupen omhoog zodat je lichaam een rechte lijn vormt van schouders tot knieën. Houd 2 seconden vast bovenaan.',
    emoji: '🍑',
  },
  {
    id: 'enkelmobiliteit',
    naam: 'Enkelmobiliteit cirkels',
    categorie: 'enkel',
    sets: 2,
    reps: 20,
    beschrijving: 'Zit op een stoel en til één voet op. Maak langzame cirkels met je enkel, eerst 10x met de klok mee en 10x tegen de klok in. Dit verbetert de mobiliteit en doorbloeiding in de enkel.',
    emoji: '🔃',
  },
  {
    id: 'piriformis-stretch',
    naam: 'Piriformis stretch',
    categorie: 'bil',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Lig op je rug, leg je rechterenkel op je linkerknie en trek beide benen naar je borst. Voel de diepe rek in je bil. Goed voor heup- en bilspieren die verantwoordelijk zijn voor veel hardloopblessures.',
    emoji: '🧘',
  },
  {
    id: 'quadriceps-stretch',
    naam: 'Quadriceps stretch',
    categorie: 'heup',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Sta op één been en trek je andere voet naar je bil. Houd je knieën naast elkaar en je rug recht. Voel de rek aan de voorkant van je bovenbeen. Gebruik een muur voor balans indien nodig.',
    emoji: '🦿',
  },
  {
    id: 'enkel-alphabet',
    naam: 'Enkel alfabet',
    categorie: 'enkel',
    sets: 1,
    reps: 1,
    beschrijving: 'Teken met je teen het volledige alfabet in de lucht. Dit activeert alle kleine spiertjes en banden rondom de enkel op een speelse manier. Doe dit langzaam en gecontroleerd.',
    emoji: '🔤',
  },
  {
    id: 'clamshell',
    naam: 'Clamshell oefening',
    categorie: 'heup',
    sets: 3,
    reps: 15,
    beschrijving: 'Lig op je zij met je knieën gebogen in een hoek van 90 graden. Houd je voeten op elkaar en til je bovenste knie omhoog als een schelp die opengaat. Versterkt de heupabductoren.',
    emoji: '🐚',
  },
  {
    id: 'knie-mobiliteit',
    naam: 'Knie cirkels',
    categorie: 'knie',
    sets: 2,
    reps: 15,
    beschrijving: 'Sta rechtop met licht gebogen knieën, handen op je knieën. Maak langzame cirkels met je knieën terwijl je lichte druk uitoefent. Dit smeert het kniegewricht en verbetert de mobiliteit.',
    emoji: '🔁',
  },
  {
    id: 'rugstretch-cat-cow',
    naam: 'Kat-koe stretch',
    categorie: 'rug',
    sets: 3,
    reps: 10,
    beschrijving: 'Ga op handen en knieën. Bol je rug omhoog (kat) terwijl je uitademt, laat je rug dan inzakken en kijk omhoog (koe) terwijl je inademt. Mobiliseert de gehele wervelkolom.',
    emoji: '🐱',
  },
  {
    id: 'hamstring-stretch',
    naam: 'Hamstring stretch',
    categorie: 'knie',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Lig op je rug, til één been omhoog en houd het met beide handen vast achter de knie. Strek het been zo ver als mogelijk. Voel de rek aan de achterkant van je bovenbeen.',
    emoji: '🦵',
  },
  {
    id: 'enkel-letters',
    naam: 'Enkel versteviging',
    categorie: 'enkel',
    sets: 3,
    reps: 12,
    beschrijving: 'Sta op één been op een oneven oppervlak (bijv. een kussen). Houd 30 seconden balans. Dit versterkt alle kleine stabilisatiespieren rondom de enkel en verbetert proprioceptie.',
    emoji: '⚖️',
  },
  {
    id: 'bekkenbodem-core',
    naam: 'Dead bug',
    categorie: 'core',
    sets: 3,
    reps: 10,
    beschrijving: 'Lig op je rug, armen recht omhoog en knieën in 90 graden. Laat tegelijkertijd één arm naar achteren en het tegenoverliggende been zakken zonder je rug van de grond te tillen. Wissel zijden.',
    emoji: '🦂',
  },
  {
    id: 'plank',
    naam: 'Plank',
    categorie: 'core',
    sets: 3,
    duur_seconden: 45,
    beschrijving: 'Steun op je onderarmen en tenen, houd je lichaam in een rechte lijn. Span je buikspieren en billen aan. Zorg dat je heupen niet te hoog of te laag hangen. Fundament voor loopstabiliteit.',
    emoji: '💪',
  },
  {
    id: 'zijplank',
    naam: 'Zijplank',
    categorie: 'core',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Steun op één onderarm met je lichaam zijdelings gestrekt. Houd je heupen omhoog en je lichaam in een rechte lijn. Versterkt de zijdelingse rompspieren die essentieel zijn voor een stabiele loopstap.',
    emoji: '⬛',
  },
  {
    id: 'onderrug-stretch',
    naam: 'Kindshouding',
    categorie: 'rug',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Knie op de grond, strek je armen voor je uit en laat je voorhoofd op de grond zakken. Voel de rek in je onderrug en heupen. Herstelt spanning in de rug na lange loopsessies.',
    emoji: '🙇',
  },
  {
    id: 'hip-flexor-lunge',
    naam: 'Heupbuiger lunge stretch',
    categorie: 'heup',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Stap naar voren in een lunge positie met je achterste knie op de grond. Duw je heupen naar voren en houd je romp rechtop. Voel de diepe rek in de heupbuiger van het achterste been.',
    emoji: '🚶',
  },
  {
    id: 'kuitstretch-muur',
    naam: 'Kuitstretch aan muur',
    categorie: 'kuit',
    sets: 3,
    duur_seconden: 30,
    beschrijving: 'Sta voor een muur, zet één voet voor de andere. Houd het achterste been gestrekt en hak op de grond, leun dan naar voren richting de muur. Voel de diepe rek in de kuit. Voorkomt achillespeesblessures.',
    emoji: '🧱',
  },
  {
    id: 'single-leg-deadlift',
    naam: 'Eenbeen deadlift',
    categorie: 'bil',
    sets: 3,
    reps: 10,
    beschrijving: 'Sta op één been, kantel je romp naar voren terwijl je het vrije been naar achteren strekt. Houd je rug recht. Versterkt de bilspieren en hamstrings terwijl je balans traint. Essentieel voor hardlopers.',
    emoji: '🏋️',
  },
]

const CATEGORIEËN = ['alle', 'heup', 'knie', 'enkel', 'rug', 'kuit', 'bil', 'core'] as const

const CATEGORIE_LABELS: Record<string, string> = {
  alle: 'Alle',
  heup: 'Heup',
  knie: 'Knie',
  enkel: 'Enkel',
  rug: 'Rug',
  kuit: 'Kuit',
  bil: 'Bil',
  core: 'Core',
}

function formatDuur(sets?: number, reps?: number, duur_seconden?: number): string {
  if (sets && reps) return `${sets}×${reps} herh.`
  if (sets && duur_seconden) return `${sets}×${duur_seconden}s`
  if (duur_seconden) return `${duur_seconden}s`
  return ''
}

interface Props {
  actieveOefeningIds: string[]
}

export function BibliotheekClient({ actieveOefeningIds }: Props) {
  const router = useRouter()
  const [zoekterm, setZoekterm] = useState('')
  const [gefilterdeCategorie, setGefilterdeCategorie] = useState<typeof CATEGORIEËN[number]>('alle')
  const [toegevoegde, setToegevoegde] = useState<Set<string>>(new Set(actieveOefeningIds))
  const [laden, setLaden] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  const gefilterd = BIBLIOTHEEK.filter(o => {
    const matchCategorie = gefilterdeCategorie === 'alle' || o.categorie === gefilterdeCategorie
    const matchZoek = zoekterm === '' || o.naam.toLowerCase().includes(zoekterm.toLowerCase())
    return matchCategorie && matchZoek
  })

  async function oefenToevoegen(oefening: LibraireOefening) {
    if (toegevoegde.has(oefening.id) || laden.has(oefening.id)) return

    setLaden(prev => new Set(prev).add(oefening.id))
    try {
      const res = await fetch('/api/fysio/oefening-toevoegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naam: oefening.naam,
          categorie: oefening.categorie,
          sets: oefening.sets,
          reps: oefening.reps,
          duur_seconden: oefening.duur_seconden,
          beschrijving: oefening.beschrijving,
        }),
      })

      if (res.ok) {
        setToegevoegde(prev => new Set(prev).add(oefening.id))
        setToast(`${oefening.naam} toegevoegd!`)
        setTimeout(() => setToast(null), 2500)
        router.refresh()
      }
    } finally {
      setLaden(prev => {
        const next = new Set(prev)
        next.delete(oefening.id)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f5f3f0]">
      {/* Header */}
      <div className="bg-white border-b border-[#e8e3dc] px-4 pt-safe pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/fysio" className="text-[#6b6560] p-1 -ml-1">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-[#1a1612]">Oefeningen bibliotheek</h1>
        </div>

        {/* Zoekbalk */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a09990]" />
          <input
            type="text"
            value={zoekterm}
            onChange={e => setZoekterm(e.target.value)}
            placeholder="Zoek oefening..."
            className="w-full pl-9 pr-4 py-2.5 bg-[#f5f3f0] rounded-xl text-sm text-[#1a1612] placeholder-[#a09990] border border-[#e8e3dc] focus:outline-none focus:border-[#f97316]"
          />
        </div>

        {/* Categorie chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIEËN.map(cat => (
            <button
              key={cat}
              onClick={() => setGefilterdeCategorie(cat)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                gefilterdeCategorie === cat
                  ? 'bg-[#f97316] border-[#f97316] text-white'
                  : 'bg-white border-[#e8e3dc] text-[#6b6560]'
              )}
            >
              {CATEGORIE_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Lijst */}
      <div className="flex flex-col gap-3 p-4 pb-24">
        {gefilterd.length === 0 && (
          <p className="text-center text-[#a09990] text-sm mt-8">Geen oefeningen gevonden</p>
        )}

        {CATEGORIEËN.filter(c => c !== 'alle').map(cat => {
          const oefeningenInCat = gefilterd.filter(o => o.categorie === cat)
          if (oefeningenInCat.length === 0) return null
          if (gefilterdeCategorie !== 'alle' && gefilterdeCategorie !== cat) return null

          return (
            <div key={cat}>
              <h2 className="text-xs font-semibold text-[#6b6560] uppercase tracking-wider mb-2">
                {CATEGORIE_LABELS[cat]}
              </h2>
              <div className="flex flex-col gap-2">
                {oefeningenInCat.map(oefening => {
                  const isActief = toegevoegde.has(oefening.id)
                  const isLaden = laden.has(oefening.id)

                  return (
                    <div
                      key={oefening.id}
                      className="bg-white rounded-2xl p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl shrink-0">{oefening.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-[#1a1612] text-sm">{oefening.naam}</h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs bg-[#f5f3f0] text-[#6b6560] px-2 py-0.5 rounded-full">
                                  {CATEGORIE_LABELS[oefening.categorie]}
                                </span>
                                <span className="text-xs text-[#a09990]">
                                  {formatDuur(oefening.sets, oefening.reps, oefening.duur_seconden)}
                                </span>
                              </div>
                              <p className="text-xs text-[#6b6560] mt-1.5 leading-relaxed line-clamp-2">
                                {oefening.beschrijving}
                              </p>
                            </div>
                            <button
                              onClick={() => oefenToevoegen(oefening)}
                              disabled={isActief || isLaden}
                              className={cn(
                                'shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all',
                                isActief
                                  ? 'bg-green-100 text-green-600'
                                  : isLaden
                                    ? 'bg-[#f5f3f0] text-[#a09990]'
                                    : 'bg-[#f97316] text-white active:scale-95'
                              )}
                            >
                              {isActief ? <Check size={16} /> : <Plus size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1a1612] text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
