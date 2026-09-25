'use client'
import { useState } from 'react'
import { ChevronDown, Gauge } from 'lucide-react'
import { TEMPO_ZONES, hartslagBereik, TempoZone } from '@/lib/tempo-zones'
import { cn } from '@/lib/utils'

interface Props {
  zones?: TempoZone[]
  bijgewerktOp?: string | null
  /** Zonder dit blijft de kaart bij tempo; een verzonnen bovengrens is erger dan geen. */
  maxHartslag?: number | null
}

/**
 * Compacte, inklapbare referentiekaart met de looptempo-zones (H/D1/D2/D3/W)
 * waarop het volledige trainingsschema is gebaseerd. Handig naslagwerk zodat
 * de gebruiker altijd weet welk tempo bij welke zone-letter hoort.
 * Toont de per-gebruiker gekalibreerde zones indien beschikbaar, anders het
 * standaardschema.
 */
export function TempoZonesCard({ zones, bijgewerktOp, maxHartslag }: Props) {
  const [open, setOpen] = useState(false)
  const actueleZones = zones?.length ? zones : TEMPO_ZONES
  const isGekalibreerd = !!zones?.length

  return (
    <div className="rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 p-3.5"
      >
        <div className="w-8 h-8 rounded-xl bg-[#f97316]/10 flex items-center justify-center shrink-0">
          <Gauge size={15} className="text-[#f97316]" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-white">Jouw tempozones</p>
          {isGekalibreerd && bijgewerktOp && (
            <p className="text-[10px] text-[#55556a]">
              Bijgewerkt op basis van je activiteiten · {new Date(bijgewerktOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
        <ChevronDown size={16} className={cn('text-[#55556a] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-1.5">
          {actueleZones.map(z => {
            const hr = hartslagBereik(z, maxHartslag)
            return (
              <div key={z.label} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#222230]">
                <span className="text-[11px] font-bold text-[#f97316] w-7 shrink-0">{z.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white">{z.naam}</p>
                  {/* Het gevoel boven de omschrijving: dat is de controle die ook
                      werkt als je hartslagband afgaat of het 28 graden is. */}
                  <p className="text-[11px] text-[#8888a8]">{z.gevoel}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-white">{z.pace}/km</p>
                  {hr && <p className="text-[11px] text-red-400 tabular-nums">{hr.min}–{hr.max} bpm</p>}
                </div>
              </div>
            )
          })}
          <p className="text-[10px] text-[#55556a] leading-relaxed mt-1">
            {maxHartslag
              ? `Hartslag berekend vanaf ${maxHartslag} bpm maximaal. Staat er in je eigen schema-PDF een zonetabel met andere percentages, dan gaat die vóór deze.`
              : 'Vul je maximale hartslag in bij Instellingen, dan staat hier ook het aantal slagen per minuut per zone.'}
          </p>
        </div>
      )}
    </div>
  )
}
