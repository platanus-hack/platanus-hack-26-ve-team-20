import { useCallback, useEffect, useState } from 'react'
import { DemoError } from '@/lib/demo/api.ts'

interface Carga<T> { data: T | null; error: DemoError | null; cargando: boolean }

/** Carga asíncrona con estados de carga/error y `recargar` (botón "Reintentar"). */
export function useCarga<T>(cargar: () => Promise<T>, deps: readonly unknown[]) {
  const [estado, setEstado] = useState<Carga<T>>({ data: null, error: null, cargando: true })
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    setEstado((e) => ({ ...e, cargando: true, error: null }))
    cargar().then(
      (data) => { if (vivo) setEstado({ data, error: null, cargando: false }) },
      (e: unknown) => {
        if (vivo) setEstado({ data: null, error: e instanceof DemoError ? e : new DemoError('RED', String(e)), cargando: false })
      },
    )
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` decide cuándo recargar
  }, [...deps, vuelta])

  const recargar = useCallback(() => setVuelta((v) => v + 1), [])
  return { ...estado, recargar }
}
