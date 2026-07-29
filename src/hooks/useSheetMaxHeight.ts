import { useEffect, useState } from 'react'

/**
 * Berekent de maximale hoogte voor een bottom sheet als percentage van de
 * werkelijke viewport-hoogte, in pixels (i.p.v. de CSS-eenheid `dvh`).
 *
 * `dvh` wordt niet overal betrouwbaar ondersteund/berekend in een PWA die
 * standalone draait in WKWebView — als de eenheid daar ongeldig blijkt,
 * valt `max-height` weg en groeit de sheet tot zijn volledige inhoud, die
 * dan van boven het scherm afloopt zonder scrollmogelijkheid. Door de
 * hoogte zelf in JS te meten (window.visualViewport, met fallback op
 * window.innerHeight) omzeilen we dat probleem volledig.
 */
export function useSheetMaxHeight(fractie = 0.85): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    function bereken() {
      const hoogte = window.visualViewport?.height ?? window.innerHeight
      setMaxHeight(Math.round(hoogte * fractie))
    }
    bereken()
    window.addEventListener('resize', bereken)
    window.visualViewport?.addEventListener('resize', bereken)
    return () => {
      window.removeEventListener('resize', bereken)
      window.visualViewport?.removeEventListener('resize', bereken)
    }
  }, [fractie])

  return maxHeight
}
