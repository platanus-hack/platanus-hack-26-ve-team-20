import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Pantalla } from '@/components/extra';
import { Boton, Campo, Interruptor, SW, T, Tarjeta } from '@/components/ui';
import { CIUDADANO, reiniciarCiudadano } from '@/demo/ciudadano';
import { guardarSesion } from '@/lib/dispositivo';
import { color, tipo } from '@/theme';

export default function PerfilCiudadano() {
  const [avisos, setAvisos] = useState(true);
  const [abrirClave, setAbrirClave] = useState(false);

  async function salir() {
    await guardarSesion(null);
    reiniciarCiudadano();
    router.replace('/ciudadano/login');
  }

  return (
    <Pantalla style={{ gap: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
      <T accessibilityRole="header" style={tipo.h1}>
        Perfil
      </T>
      <Tarjeta>
        <Fila primera etiqueta="Cédula">
          <T style={tipo.mono}>{CIUDADANO.cedula}</T>
        </Fila>
        <Fila etiqueta="Teléfono para avisos">
          <T style={tipo.mono}>{CIUDADANO.telefono}</T>
        </Fila>
        <Fila etiqueta="Correo">
          <T style={{ color: color.texto2 }}>Sin correo</T>
        </Fila>
        <View style={[s.fila, s.borde]}>
          <T>Avisos por WhatsApp</T>
          <Interruptor valor={avisos} onCambio={setAvisos} etiqueta="Avisos por WhatsApp" />
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: abrirClave }} onPress={() => setAbrirClave(!abrirClave)} style={[s.fila, s.borde]}>
          <T style={tipo.cuerpoFuerte}>Cambiar contraseña</T>
          <ChevronDown size={20} color={color.tinta} strokeWidth={SW} style={{ transform: [{ rotate: abrirClave ? '180deg' : '0deg' }] }} />
        </Pressable>
        {abrirClave ? (
          <View style={{ gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
            <Campo etiqueta="Contraseña actual" secureTextEntry />
            <Campo etiqueta="Nueva contraseña" secureTextEntry />
            <Boton titulo="Guardar" onPress={() => setAbrirClave(false)} style={{ alignSelf: 'flex-start', paddingHorizontal: 20 }} />
          </View>
        ) : null}
      </Tarjeta>
      <Boton titulo="Cerrar sesión" variante="peligro" onPress={salir} style={{ alignSelf: 'flex-start', paddingHorizontal: 20 }} />
    </Pantalla>
  );
}

function Fila({ etiqueta, children, primera }: { etiqueta: string; children: ReactNode; primera?: boolean }) {
  return (
    <View style={[s.fila, primera ? null : s.borde]}>
      <T style={{ color: color.texto2 }}>{etiqueta}</T>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  borde: { borderTopWidth: 1, borderTopColor: color.borde },
});
