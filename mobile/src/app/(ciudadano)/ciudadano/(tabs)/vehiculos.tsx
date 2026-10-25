import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Pantalla } from '@/components/extra';
import { Entrada, Placa, Pressy, T } from '@/components/ui';
import { VEHICULOS, esPendiente, useCiudadano } from '@/demo/ciudadano';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';

export default function Vehiculos() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const { multas } = useCiudadano();
  return (
    <Pantalla style={{ gap: 12, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
      <View style={{ gap: 4, marginBottom: 12 }}>
        <T accessibilityRole="header" style={tipo.h1}>
          Vehículos
        </T>
        <T style={[tipo.pequeno, { color: c.texto2 }]}>A su nombre según el registro.</T>
      </View>
      {VEHICULOS.map((v, i) => {
        const pp = multas.filter((m) => m.placa === v.placa && esPendiente(m)).length;
        const estado = pp ? `${pp} por pagar` : 'Al día';
        return (
          <Entrada key={v.placa} i={i}>
            <Pressy
              accessibilityRole="button"
              accessibilityLabel={`${v.modelo}, placa ${v.placa}, ${estado}. Ver sus multas`}
              onPress={() => router.navigate({ pathname: '/ciudadano/multas', params: { filtro: v.placa, tab: pp ? '0' : '1' } })}
              style={s.tarjeta}>
              <Placa placa={v.placa} tam={20} />
              <View style={{ flex: 1, gap: 2 }}>
                <T style={tipo.cuerpoFuerte}>{v.modelo}</T>
                <T style={[tipo.caption, { color: c.texto2 }]}>{v.detalle}</T>
                <T style={[tipo.captionFuerte, { color: pp ? c.rojoTexto : c.verdeTexto }]}>{estado}</T>
              </View>
              <ChevronRight size={18} color={c.texto3} strokeWidth={2} />
            </Pressy>
          </Entrada>
        );
      })}
    </Pantalla>
  );
}

const estilos = ({ c, sombra }: Tema) =>
  StyleSheet.create({
    tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, backgroundColor: c.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.tarjeta },
  });
