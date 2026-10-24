import { router } from 'expo-router';
import { Bell, Camera, Car, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hoja } from '@/components/extra';
import { Isotipo } from '@/components/Isotipo';
import { Boton, Campo, DemoBanner, Pressy, SW, T } from '@/components/ui';
import { CLAVE_CAMARA, guardar, leerSesion, type Modo } from '@/lib/dispositivo';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';


export default function Selector() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const [hoja, setHoja] = useState(false);
  const [clave, setClave] = useState('');
  const valida = clave.length >= 6;

  async function entrar(modo: Modo) {
    const sesion = await leerSesion();
    if (modo === 'ciudadano') router.push(sesion === 'ciudadano' ? '/ciudadano' : '/ciudadano/login');
    else router.push(sesion === 'policia' ? '/policia' : '/policia/login');
  }

  async function abrirCamara() {
    await guardar(CLAVE_CAMARA, clave);
    setHoja(false);
    setClave('');
    router.push('/camara');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.fondo }}>
      <DemoBanner />
      <View style={s.hero}>
        <Isotipo size={72} color={c.tintaTexto} />
        <T accessibilityRole="header" style={[tipo.display, { color: c.tintaTexto }]}>
          ¿Cómo va a usar SmartTraffic?
        </T>
        <T style={{ color: c.sobreTinta }}>Elija una opción. Puede cambiarla luego desde su perfil.</T>
      </View>
      <View style={s.opciones}>
        <Opcion icono={Car} titulo="Soy ciudadano" sub="Vea y pague sus multas con su cédula" destacada onPress={() => entrar('ciudadano')} />
        <Opcion icono={Bell} titulo="Soy policía" sub="Reciba alertas de vehículos con deuda" tinta onPress={() => entrar('policia')} />
        <Pressable accessibilityRole="button" onPress={() => setHoja(true)} style={s.camara}>
          <Camera size={16} color={c.texto2} strokeWidth={SW} />
          <T style={[tipo.pequeno, { fontFamily: 'Geist_500Medium', color: c.texto2 }]}>Modo cámara (operador)</T>
        </Pressable>
      </View>

      <Hoja abierta={hoja} onCerrar={() => setHoja(false)} etiqueta="Modo cámara">
        <T accessibilityRole="header" style={{ fontFamily: 'Geist_600SemiBold', fontSize: 24, lineHeight: 30 }}>
          Modo cámara
        </T>
        <T style={{ color: c.texto2 }}>Solo para el operador del equipo. Escriba la clave de cámara.</T>
        <Campo etiqueta="Clave de cámara" clave mono value={clave} onChangeText={setClave} placeholder="Al menos 6 caracteres" autoCapitalize="none" />
        <Boton titulo="Abrir cámara" disabled={!valida} onPress={abrirCamara} />
      </Hoja>
    </SafeAreaView>
  );
}

function Opcion({ icono: I, titulo, sub, onPress, destacada, tinta }: { icono: LucideIcon; titulo: string; sub: string; onPress: () => void; destacada?: boolean; tinta?: boolean }) {
  const { c, sombra } = useTema();
  const s = useEstilos(estilos);
  return (
    <Pressy accessibilityRole="button" accessibilityLabel={`${titulo}. ${sub}`} onPress={onPress} style={[s.opcion, { boxShadow: destacada ? sombra.flotante : sombra.tarjeta }]}>
      <View style={[s.opcionIcono, { backgroundColor: tinta ? c.tinta : c.suave }]}>
        <I size={26} color={tinta ? c.lima : c.texto} strokeWidth={SW} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={[tipo.h3]}>{titulo}</T>
        <T style={[tipo.pequeno, { color: c.texto2 }]}>{sub}</T>
      </View>
      <ChevronRight size={20} color={c.texto} strokeWidth={2} />
    </Pressy>
  );
}

const estilos = ({ c }: Tema) =>
  StyleSheet.create({
  hero: { gap: 20, paddingTop: 40, paddingHorizontal: 24, paddingBottom: 64, backgroundColor: c.tinta },
  opciones: { flex: 1, gap: 12, paddingHorizontal: 16, marginTop: -36 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 96, paddingVertical: 16, paddingHorizontal: 20, backgroundColor: c.tarjeta, borderRadius: radio.tarjeta },
  opcionIcono: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  camara: { marginTop: 'auto', marginBottom: 24, alignSelf: 'center', minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
