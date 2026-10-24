import { useEffect, useState } from 'react'
import { loadFine, type FineLoad } from './api.ts'

/** Carga la multa del token; `null` mientras carga. */
export function useFine(token: string | undefined): FineLoad | null {
  const [state, setState] = useState<{ token: string; load: FineLoad } | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void loadFine(token).then((load) => {
      if (!cancelled) setState({ token, load })
    })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!token) return { kind: 'not_found' }
  return state?.token === token ? state.load : null
}
