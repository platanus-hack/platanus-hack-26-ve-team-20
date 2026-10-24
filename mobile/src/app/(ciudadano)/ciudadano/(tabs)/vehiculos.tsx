import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Pantalla } from '@/components/extra';
import { Boton, Chip, Entrada, Placa, T } from '@/components/ui';
import { VEHICULOS, esPendiente, useCiudadano } from '@/demo/ciudadano';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';

export default function Vehiculos() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const { multas } = useCiudadano();
  return (
    <Pantalla style={{ gap: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
      <View style={{ gap: 2 }}>
        <T accessibilityRole="header" style={tipo.h1}>
          Vehículos
        </T>
        <T style={{ color: c.texto2 }}>A su nombre según el registro (ejemplo).</T>
      </View>
      {VEHICULOS.map((v, i) => {
        const deEste = multas.filter((m) => m.placa === v.placa);
        const pp = deEste.filter(esPendiente).length;
        return (
          <Entrada key={v.placa} i={i} style={s.bisel}>
            <View style={s.tarjeta}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <Placa placa={v.placa} />
                {pp ? <Chip texto={`${pp} por pagar`} bg={c.rojoFondo} fg={c.rojoTexto} /> : <Chip texto="Al día" bg={c.verdeFondo} fg={c.verdeTexto} />}
              </View>
              <View>
                <T style={tipo.h3}>{v.modelo}</T>
                <T style={[tipo.pequeno, { color: c.texto2 }]}>{v.detalle}</T>
              </View>
              <View style={s.pie}>
                <T style={[tipo.pequeno, { flex: 1, color: c.texto2 }]}>
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

const estilos = ({ c, sombra }: Tema) =>
  StyleSheet.create({
  bisel: { padding: 6, backgroundColor: c.suave, borderRadius: radio.tarjeta },
  tarjeta: { gap: 16, padding: 20, backgroundColor: c.tarjeta, borderRadius: 12, boxShadow: sombra.tarjeta },
  pie: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borde },
});
