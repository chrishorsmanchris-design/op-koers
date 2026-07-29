import { useEffect } from 'react'

/**
 * Vergrendelt scrollen van de achterliggende pagina terwijl een bottom-sheet/modal
 * open staat, zodat een touch-scroll niet "doorlekt" naar de pagina erachter.
 * Zet alleen overflow:hidden op html/body (geen position:fixed-truc), want die
 * laatste blijkt in de PWA/WKWebView-omgeving scrollen binnen de sheet zelf ook
 * te blokkeren.
 */
export function useLockBodyScroll() {
  useEffect(() => {
    const { documentElement: html, body } = document
    const vorigeHtml = html.style.overflow
    const vorigeBody = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = vorigeHtml
      body.style.overflow = vorigeBody
    }
  }, [])
}
