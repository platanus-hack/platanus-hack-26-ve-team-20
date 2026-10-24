import { Stack } from 'expo-router';
import { useSyncExternalStore } from 'react';

import { sesionEnMemoria, suscribirSesion, type Modo } from '@/lib/dispositivo';
import { useTema } from '@/lib/tema';

/**
 * Stack de un rol. Las pantallas `protegidas` exigen una sesión de ese rol; sin ella (enlace profundo,
 * URL en web o sesión del otro rol) Expo Router redirige al login del rol. El layout raíz lee la
 * sesión guardada antes de montar; login y logout la actualizan en memoria al instante.
 */
export function StackDeRol({ modo, protegidas }: { modo: Modo; protegidas: string[] }) {
  const { c } = useTema();
  const sesion = useSyncExternalStore(suscribirSesion, sesionEnMemoria);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.fondo } }}>
      <Stack.Protected guard={sesion === modo} redirectTo={modo === 'ciudadano' ? '/ciudadano/login' : '/policia/login'}>
        {protegidas.map((name) => <Stack.Screen key={name} name={name} />)}
      </Stack.Protected>
    </Stack>
  );
}
