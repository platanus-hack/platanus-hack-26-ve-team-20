import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { CabeceraTinta } from '@/components/auth';
import { Pantalla } from '@/components/extra';
import { Boton, Campo, Enlace, Pressy, T } from '@/components/ui';
import { OFICIAL, entrarConGoogle, entrarOficial } from '@/demo/policia';
import { guardarSesion } from '@/lib/dispositivo';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';

export default function LoginPolicia() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const [correo, setCorreo] = useState(OFICIAL.correo);
  const [clave, setClave] = useState('demo1234');
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [google, setGoogle] = useState(false);

  async function entrar() {
    setCargando(true);
    const ok = await entrarOficial(correo, clave);
    setCargando(false);
    setError(!ok);
    if (!ok) return;
    await guardarSesion('policia');
    router.replace('/policia');
  }

  async function conGoogle() {
    setGoogle(true);
    const r = await entrarConGoogle();
    setGoogle(false);
    if (r.primerAcceso) router.push('/policia/codigo');
  }

  return (
    <Pantalla>
      <CabeceraTinta
        grande
        marca="SmartTraffic · Policía"
        titulo={google ? 'Un momento' : 'Acceso policial'}
        sub={google ? 'Verificando su cuenta.' : 'Entre con su correo institucional o con Google.'}
      />
      <View style={{ gap: 16, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 32 }}>
        {google ? (
          <Conectando />
        ) : (
          <>
            <Campo etiqueta="Correo" keyboardType="email-address" autoCapitalize="none" autoComplete="username" value={correo} onChangeText={setCorreo} />
            <Campo etiqueta="Contraseña" clave autoComplete="current-password" value={clave} onChangeText={setClave} error={error ? 'Correo o contraseña incorrectos.' : null} />
            <Boton titulo="Entrar" cargando={cargando} onPress={entrar} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.linea} />
              <T style={[tipo.caption, { color: c.texto2 }]}>o</T>
              <View style={s.linea} />
            </View>
            {/* Botón según la guía de marca de Google: fondo blanco, borde #747775, texto #1F1F1F. El logotipo oficial va desde el kit de Google. */}
            <Pressy accessibilityRole="button" accessibilityLabel="Continuar con Google" onPress={conGoogle} style={s.google}>
              <View style={s.logo}>
                <T style={{ fontSize: 8, lineHeight: 18, color: c.texto2, fontFamily: tipo.caption.fontFamily }}>logo</T>
              </View>
              <T style={{ fontFamily: 'Geist_500Medium', fontSize: 15, color: '#1F1F1F' }}>Continuar con Google</T>
            </Pressy>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <T style={[tipo.pequeno, { color: c.texto2 }]}>¿Primera vez?</T>
              <Enlace titulo="Registrarse" onPress={() => router.push('/policia/registro')} />
            </View>
          </>
        )}
      </View>
    </Pantalla>
  );
}

function Conectando() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const rm = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: rm ? 120 : 1200, easing: Easing.linear }));
  }, [rm, p]);
  const barra = useAnimatedStyle(() => ({ transform: [{ scaleX: p.get() }] }));
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 16, paddingVertical: 48 }}>
      <View style={[s.logo, { width: 56, height: 56, borderRadius: 12 }]}>
        <T style={{ fontSize: 11, color: c.texto2, fontFamily: tipo.caption.fontFamily }}>logo</T>
      </View>
      <T style={tipo.cuerpoFuerte}>Conectando con su cuenta de Google…</T>
      <View style={s.pista}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.texto, borderRadius: 999, transformOrigin: 'left' }, barra]} />
      </View>
    </View>
  );
}

const estilos = ({ c }: Tema) =>
  StyleSheet.create({
  linea: { flex: 1, height: 1, backgroundColor: c.borde },
  google: { height: 48, borderWidth: 1, borderColor: '#747775', borderRadius: radio.control, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  logo: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: '#747775', alignItems: 'center', justifyContent: 'center' },
  pista: { width: 200, height: 6, borderRadius: 999, backgroundColor: c.suave, overflow: 'hidden' },
});
