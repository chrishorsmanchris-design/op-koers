import { useEffect } from 'react'

/**
 * Vergrendelt scrollen van de achterliggende pagina terwijl een bottom-sheet/modal
 * open staat. Alleen `overflow: hidden` op html/body is op iOS niet voldoende —
 * de pagina blijft daar nog deels "rubber-banden" op een touch-gebaar, wat de
 * scroll binnenin de sheet trager/tegengehouden laat aanvoelen omdat het gebaar
 * ook nog gedeeltelijk naar de achterliggende pagina lekt. `position: fixed` op
 * body voorkomt dat volledig. (Dit werd eerder ten onrechte verdacht van het
 * bevriezen van de sheet zelf — dat kwam in werkelijkheid door een losstaande
 * dvh-berekeningsbug, inmiddels apart gefixed via useSheetMaxHeight.)
 */
export function useLockBodyScroll() {
  useEffect(() => {
    const scrollY = window.scrollY
    const { body } = document
    const vorigeStijl = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = vorigeStijl.position
      body.style.top = vorigeStijl.top
      body.style.left = vorigeStijl.left
      body.style.right = vorigeStijl.right
      body.style.width = vorigeStijl.width
      body.style.overflow = vorigeStijl.overflow
      window.scrollTo(0, scrollY)
    }
  }, [])
}
