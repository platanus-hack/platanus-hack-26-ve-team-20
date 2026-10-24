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
import { color } from '@/theme';

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

  // La guardia de rutas (lib/guardia) necesita la sesión leída antes de montar los grupos.
  const [sesionLista, setSesionLista] = useState(false);
  useEffect(() => {
    leerSesion().catch(() => null).finally(() => setSesionLista(true));
  }, []);

  useEffect(() => {
    if ((listas || error) && sesionLista) SplashScreen.hideAsync().catch(() => {});
  }, [listas, error, sesionLista]);

  useEffect(() => {
    // Ciudadano y policía van en vertical; la pantalla de cámara fija su propia orientación.
    if (Platform.OS !== 'web') ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  if ((!listas && !error) || !sesionLista) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }}>
        <Stack.Screen name="camara" options={{ contentStyle: { backgroundColor: '#0A0F18' }, animation: 'fade' }} />
      </Stack>
    </>
  );
}
