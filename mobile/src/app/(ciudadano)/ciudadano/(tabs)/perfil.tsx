import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Pantalla } from '@/components/extra';
import { Boton, Campo, Interruptor, SW, SelectorTema, T, Tarjeta } from '@/components/ui';
import { CIUDADANO, reiniciarCiudadano } from '@/demo/ciudadano';
import { guardarSesion } from '@/lib/dispositivo';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { tipo } from '@/theme';

export default function PerfilCiudadano() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const [avisos, setAvisos] = useState(true);
  const [abrirClave, setAbrirClave] = useState(false);

  async function salir() {
    await guardarSesion(null);
    reiniciarCiudadano();
    router.replace('/ciudadano/login');
  }

  return (
    <Pantalla style={{ gap: 12, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
      <T accessibilityRole="header" style={[tipo.h1, { marginBottom: 12 }]}>
        Perfil
      </T>
      <Seccion titulo="Cuenta" />
      <Tarjeta>
        <Fila primera etiqueta="Cédula">
          <T style={tipo.mono}>{CIUDADANO.cedula}</T>
        </Fila>
        <Fila etiqueta="Teléfono">
          <T style={tipo.mono}>{CIUDADANO.telefono}</T>
        </Fila>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: abrirClave }} onPress={() => setAbrirClave(!abrirClave)} style={[s.fila, s.borde]}>
          <T>Cambiar contraseña</T>
          <ChevronDown size={20} color={c.texto2} strokeWidth={SW} style={{ transform: [{ rotate: abrirClave ? '180deg' : '0deg' }] }} />
        </Pressable>
        {abrirClave ? (
          <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 16 }}>
            <Campo etiqueta="Contraseña actual" secureTextEntry />
            <Campo etiqueta="Nueva contraseña" secureTextEntry />
            <Boton titulo="Guardar" onPress={() => setAbrirClave(false)} />
          </View>
        ) : null}
      </Tarjeta>
      <Seccion titulo="Preferencias" />
      <Tarjeta>
        <View style={s.fila}>
          <View style={{ flex: 1 }}>
            <T>Avisos por WhatsApp</T>
            <T style={[tipo.caption, { color: c.texto2 }]}>Le escribimos cuando llegue una multa.</T>
          </View>
          <Interruptor valor={avisos} onCambio={setAvisos} etiqueta="Avisos por WhatsApp" />
        </View>
        <View style={[s.borde, { gap: 10, padding: 16 }]}>
          <T>Apariencia</T>
          <SelectorTema />
        </View>
      </Tarjeta>
      <Boton titulo="Cerrar sesión" variante="peligro" onPress={salir} style={{ marginTop: 20 }} />
    </Pantalla>
  );
}

function Seccion({ titulo }: { titulo: string }) {
  const { c } = useTema();
  return <T style={[tipo.captionFuerte, { color: c.texto2, marginTop: 8, paddingHorizontal: 4 }]}>{titulo.toUpperCase()}</T>;
}

function Fila({ etiqueta, children, primera }: { etiqueta: string; children: ReactNode; primera?: boolean }) {
  const { c } = useTema();
  const s = useEstilos(estilos);
  return (
    <View style={[s.fila, primera ? null : s.borde]}>
      <T style={{ color: c.texto2 }}>{etiqueta}</T>
      {children}
    </View>
  );
}

const estilos = ({ c }: Tema) =>
  StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  borde: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borde },
});
