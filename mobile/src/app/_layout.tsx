import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { leerSesion } from '@/lib/dispositivo';
import { TemaProvider, leerModoTema, useTema } from '@/lib/tema';
import type { ModoTema } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [listas, error] = useFonts({
    BricolageGrotesque_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  // La guardia de rutas (lib/guardia) necesita la sesión leída antes de montar los grupos; el tema, antes del primer pintado.
  const [modoTema, setModoTema] = useState<ModoTema | null>(null);
  useEffect(() => {
    Promise.all([leerSesion().catch(() => null), leerModoTema()]).then(([, modo]) => setModoTema(modo));
  }, []);

  useEffect(() => {
    if ((listas || error) && modoTema) SplashScreen.hideAsync().catch(() => {});
  }, [listas, error, modoTema]);

  useEffect(() => {
    // Ciudadano y policía van en vertical; la pantalla de cámara fija su propia orientación.
    if (Platform.OS !== 'web') ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  if ((!listas && !error) || !modoTema) return null;

  return (
    <TemaProvider inicial={modoTema}>
      <Raiz />
    </TemaProvider>
  );
}

function Raiz() {
  const { c, esquema } = useTema();
  return (
    <>
      <StatusBar style={esquema === 'oscuro' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.fondo } }}>
        <Stack.Screen name="camara" options={{ contentStyle: { backgroundColor: '#0A0F18' }, animation: 'fade' }} />
      </Stack>
    </>
  );
}
