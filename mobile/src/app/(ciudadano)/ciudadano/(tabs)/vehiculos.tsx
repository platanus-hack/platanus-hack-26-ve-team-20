import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Pantalla } from '@/components/extra';
import { Boton, Chip, Entrada, Placa, T } from '@/components/ui';
import { VEHICULOS, esPendiente, useCiudadano } from '@/demo/ciudadano';
import { color, radio, tipo } from '@/theme';

export default function Vehiculos() {
  const { multas } = useCiudadano();
  return (
    <Pantalla style={{ gap: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
      <View style={{ gap: 2 }}>
        <T accessibilityRole="header" style={tipo.h1}>
          Vehículos
        </T>
        <T style={{ color: color.texto2 }}>A su nombre según el registro (ejemplo).</T>
      </View>
      {VEHICULOS.map((v, i) => {
        const deEste = multas.filter((m) => m.placa === v.placa);
        const pp = deEste.filter(esPendiente).length;
        return (
          <Entrada key={v.placa} i={i} style={s.bisel}>
            <View style={s.tarjeta}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <Placa placa={v.placa} />
                {pp ? <Chip texto={`${pp} por pagar`} bg={color.rojoFondo} fg={color.rojoTexto} /> : <Chip texto="Al día" bg={color.verdeFondo} fg={color.verdeTexto} />}
              </View>
              <View>
                <T style={tipo.h3}>{v.modelo}</T>
                <T style={[tipo.pequeno, { color: color.texto2 }]}>{v.detalle}</T>
              </View>
              <View style={s.pie}>
                <T style={[tipo.pequeno, { flex: 1, color: color.texto2 }]}>
                  <T style={[tipo.mono, { fontSize: 14 }]}>{deEste.length}</T> multas registradas
                </T>
                <Boton
                  titulo="Ver sus multas"
                  variante="borde"
                  alto={44}
                  onPress={() => router.navigate({ pathname: '/ciudadano/multas', params: { filtro: v.placa, tab: pp ? '0' : '1' } })}
                />
              </View>
            </View>
          </Entrada>
        );
      })}
    </Pantalla>
  );
}

const s = StyleSheet.create({
  bisel: { padding: 6, backgroundColor: color.suave, borderRadius: radio.tarjeta },
  tarjeta: { gap: 16, padding: 20, backgroundColor: color.tarjeta, borderRadius: 12, boxShadow: '0 1px 2px rgba(14,23,38,.06)' },
  pie: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.borde },
});
