import { useEffect } from 'react'

/**
 * Vergrendelt scrollen van de achterliggende pagina terwijl een bottom-sheet/modal
 * open staat. Zonder dit "lekt" een touch-scroll op mobiel door naar de pagina
 * erachter (in plaats van de inhoud van de sheet te scrollen), omdat de dimmende
 * overlay zelf geen scrollbare inhoud heeft.
 */
export function useLockBodyScroll() {
  useEffect(() => {
    const scrollY = window.scrollY
    const { body } = document
    const vorigeStijl = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = vorigeStijl.position
      body.style.top = vorigeStijl.top
      body.style.width = vorigeStijl.width
      body.style.overflow = vorigeStijl.overflow
      window.scrollTo(0, scrollY)
    }
  }, [])
}
