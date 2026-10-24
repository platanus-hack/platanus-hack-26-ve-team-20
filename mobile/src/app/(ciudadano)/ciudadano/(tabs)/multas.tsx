import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ListaMultas, Pantalla } from '@/components/extra';
import { Pressy, SW, T, Tarjeta } from '@/components/ui';
import { VEHICULOS, esPendiente, useCiudadano, type Multa } from '@/demo/ciudadano';
import { abrirMulta, irAPagar } from '@/lib/nav';
import { color, fuente, radio, tipo } from '@/theme';

const PESTANAS = ['Por pagar', 'Pagadas', 'Otras'] as const;

export default function Multas() {
  const params = useLocalSearchParams<{ tab?: string; filtro?: string }>();
  const { multas } = useCiudadano();
  const tab = Math.min(2, Math.max(0, Math.trunc(Number(params.tab)) || 0));
  const filtro = params.filtro ?? 'todos';

  const conjuntos: Multa[][] = [
    multas.filter(esPendiente),
    multas.filter((m) => m.estado === 'PAGADA'),
    multas.filter((m) => m.estado === 'APELADA' || m.estado === 'ANULADA'),
  ];
  const filtradas = conjuntos[tab].filter((m) => filtro === 'todos' || m.placa === filtro);
  const meses = [...new Set(filtradas.map((m) => m.mes))];

  // Encabezados de mes fijos: cada encabezado es hijo directo del ScrollView.
  const fijos = meses.map((_, i) => 3 + i * 2);

  return (
    <Pantalla style={{ gap: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }} fijos={fijos}>
      <T accessibilityRole="header" style={tipo.h1}>
        Multas
      </T>
      <Segmentado tab={tab} onCambio={(i) => router.setParams({ tab: String(i) })} cuentas={conjuntos.map((c) => c.length)} />
      <View accessibilityLabel="Filtrar por vehículo" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {['todos', ...VEHICULOS.map((v) => v.placa)].map((f) => {
          const on = filtro === f;
          return (
            <Pressy
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => router.setParams({ filtro: f })}
              style={[s.filtro, on ? { backgroundColor: color.tinta, borderColor: color.tinta } : null]}>
              <T style={[f === 'todos' ? tipo.pequenoFuerte : { fontFamily: fuente.monoFuerte, fontSize: 13 }, { color: on ? color.tarjeta : color.tinta }]}>{f === 'todos' ? 'Todos' : f}</T>
            </Pressy>
          );
        })}
      </View>
      {meses.flatMap((mes) => [
        <View key={`h-${mes}`} style={s.mes}>
          <T style={[tipo.captionFuerte, { color: color.texto2 }]}>{mes}</T>
        </View>,
        <View key={`l-${mes}`} style={{ marginTop: -20 }}>
          <ListaMultas multas={filtradas.filter((m) => m.mes === mes)} onAbrir={abrirMulta} onPagar={tab === 0 ? (m) => irAPagar([m.id]) : undefined} />
        </View>,
      ])}
      {meses.length === 0 ? (
        <Tarjeta style={{ gap: 10, padding: 24 }}>
          <View style={s.vacioIco}>
            <Check size={24} color={color.lima} strokeWidth={SW} />
          </View>
          <T style={tipo.h3}>{['Está al día', 'Aún no hay pagos', 'Nada por aquí'][tab]}</T>
          <T style={{ color: color.texto2 }}>
            {tab === 0
              ? `No tiene multas por pagar${filtro !== 'todos' ? ` para ${filtro}` : ''}. Siga así.`
              : tab === 1
                ? 'Cuando pague una multa, su comprobante aparecerá aquí.'
                : 'No tiene multas apeladas ni anuladas.'}
          </T>
        </Tarjeta>
      ) : null}
    </Pantalla>
  );
}

function Segmentado({ tab, onCambio, cuentas }: { tab: number; onCambio: (i: number) => void; cuentas: number[] }) {
  const rm = useReducedMotion();
  const [ancho, setAncho] = useState(0);
  const x = useSharedValue(0);
  const w = ancho / 3;
  useEffect(() => {
    x.set(withTiming(tab * w, { duration: rm ? 0 : 220, easing: Easing.bezier(0.32, 0.72, 0, 1) }));
  }, [tab, w, rm, x]);
  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <View accessibilityRole="tablist" onLayout={(e) => setAncho(e.nativeEvent.layout.width - 8)} style={s.seg}>
      {w ? <Animated.View style={[s.segInd, { width: w }, ind]} /> : null}
      {PESTANAS.map((n, i) => (
        <Pressable key={n} accessibilityRole="tab" accessibilityState={{ selected: tab === i }} onPress={() => onCambio(i)} style={s.segBtn}>
          <T style={[tipo.pequenoFuerte, { color: tab === i ? color.tarjeta : color.texto2 }]}>
            {n} <T style={{ fontFamily: fuente.mono, fontSize: 14, color: tab === i ? color.tarjeta : color.texto2 }}>{cuentas[i]}</T>
          </T>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', padding: 4, backgroundColor: color.suave, borderRadius: radio.control },
  segInd: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 10, backgroundColor: color.tinta },
  segBtn: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  filtro: { height: 36, minWidth: 44, paddingHorizontal: 14, borderRadius: radio.pastilla, borderWidth: 1, borderColor: color.bordeInput, backgroundColor: color.tarjeta, alignItems: 'center', justifyContent: 'center' },
  mes: { paddingVertical: 10, paddingHorizontal: 4, backgroundColor: color.fondo },
  vacioIco: { width: 48, height: 48, borderRadius: 12, backgroundColor: color.tinta, alignItems: 'center', justifyContent: 'center' },
});
