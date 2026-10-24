import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { guardar, leer } from '@/lib/dispositivo';
import { esquemaDe, sombra as sombraClara, sombraOscura, temaClaro, temaOscuro, type Colores, type Esquema, type ModoTema, type Sombras } from '@/theme';


const CLAVE_TEMA = 'smarttraffic.tema';

export interface Tema {
  c: Colores;
  sombra: Sombras;
  modo: ModoTema;
  esquema: Esquema;
  setModo: (m: ModoTema) => void;
}

const esModo = (v: string | null): v is ModoTema => v === 'claro' || v === 'oscuro' || v === 'sistema';
export const leerModoTema = async (): Promise<ModoTema> => {
  const v = await leer(CLAVE_TEMA);
  return esModo(v) ? v : 'sistema';
};

const Ctx = createContext<Tema | null>(null);

export function TemaProvider({ inicial, children }: { inicial: ModoTema; children: ReactNode }) {
  const [modo, setModoEstado] = useState<ModoTema>(inicial);
  const sistema = useColorScheme();
  const esquema = esquemaDe(modo, sistema);
  const setModo = useCallback((m: ModoTema) => {
    setModoEstado(m);
    guardar(CLAVE_TEMA, m);
  }, []);
  const valor = useMemo<Tema>(
    () => ({ c: esquema === 'oscuro' ? temaOscuro : temaClaro, sombra: esquema === 'oscuro' ? sombraOscura : sombraClara, modo, esquema, setModo }),
    [modo, esquema, setModo],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useTema(): Tema {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTema fuera de TemaProvider');
  return t;
}

// Estilos que dependen del tema: `crear` vive a nivel de módulo y se recalcula solo al cambiar de esquema.
export function useEstilos<T>(crear: (t: Tema) => T): T {
  const t = useTema();
  return useMemo(() => crear(t), [crear, t]);
}
