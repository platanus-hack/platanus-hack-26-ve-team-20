import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Pantalla } from '@/components/extra';
import { Boton, Interruptor, SelectorTema, T, Tarjeta } from '@/components/ui';
import { OFICIAL, POSICION_DEMO, reiniciarOficial, setOficial, useOficial } from '@/demo/policia';
import { guardarSesion } from '@/lib/dispositivo';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { tipo } from '@/theme';

export default function PerfilPolicia() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const { servicio, posicionDemo } = useOficial();

  async function salir() {
    await guardarSesion(null);
    reiniciarOficial();
    router.replace('/policia/login');
  }

  return (
    <Pantalla style={{ gap: 16, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
      <T accessibilityRole="header" style={tipo.display}>
        Perfil
      </T>
      <Tarjeta>
        <View style={[s.fila, { minHeight: 72, justifyContent: 'flex-start' }]}>
          <View style={s.avatar}>
            <T style={[tipo.mono, { fontSize: 14, color: c.lima }]}>{OFICIAL.iniciales}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T style={tipo.cuerpoFuerte}>{OFICIAL.nombre}</T>
            <T style={{ fontFamily: 'JetBrainsMono_500Medium', fontSize: 13, color: c.texto2 }}>
              {OFICIAL.placaOficial} · {OFICIAL.correo}
            </T>
          </View>
        </View>
        <View style={[s.fila, s.borde]}>
          <View style={{ flex: 1 }}>
            <T style={tipo.cuerpoFuerte}>En servicio</T>
            <T style={[tipo.caption, { color: c.texto2 }]}>Solo recibe alertas en servicio</T>
          </View>
          <Interruptor valor={servicio} onCambio={(v) => setOficial({ servicio: v })} etiqueta="En servicio" />
        </View>
        <View style={[s.fila, s.borde]}>
          <View style={{ flex: 1 }}>
            <T style={tipo.cuerpoFuerte}>Usar posición demo</T>
            <T style={[tipo.caption, { color: c.texto2 }]}>{POSICION_DEMO}</T>
          </View>
          <Interruptor valor={posicionDemo} onCambio={(v) => setOficial({ posicionDemo: v })} etiqueta="Usar posición demo" />
        </View>
      </Tarjeta>
      <Tarjeta style={{ gap: 10, padding: 16 }}>
        <T style={tipo.cuerpoFuerte}>Apariencia</T>
        <SelectorTema />
      </Tarjeta>
      <Boton titulo="Cerrar sesión" variante="peligro" onPress={salir} />
    </Pantalla>
  );
}

const estilos = ({ c }: Tema) =>
  StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 64, paddingHorizontal: 16 },
  borde: { borderTopWidth: 1, borderTopColor: c.borde },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.tinta, alignItems: 'center', justifyContent: 'center' },
});
