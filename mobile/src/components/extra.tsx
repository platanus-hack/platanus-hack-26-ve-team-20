import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { esPendiente, type Multa } from '@/demo/ciudadano';
import { bs } from '@/demo/format';
import { color, radio, sombra, tipo } from '@/theme';
import { Badge, DemoBanner, ESTADO, Entrada, PlacaChip, Pressy, SW, T } from './ui';

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

// Contenedor de pantalla vertical (ciudadano y policía): franja de demo arriba.
export function Pantalla({ children, scroll = true, pie, style, fijos }: { children: ReactNode; scroll?: boolean; pie?: ReactNode; style?: StyleProp<ViewStyle>; fijos?: number[] }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.fondo }}>
      <DemoBanner />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={[{ flexGrow: 1 }, style]} keyboardShouldPersistTaps="handled" stickyHeaderIndices={fijos}>
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, style]}>{children}</View>
        )}
        {pie}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Barra fija inferior con una sola acción (detalle y pago).
export function Pie({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[st.pie, { paddingBottom: Math.max(16, insets.bottom) }]}>{children}</View>;
}

// Sheet inferior: 280 ms (.32,.72,0,1); con movimiento reducido, 120 ms.
export function Hoja({ abierta, onCerrar, children, etiqueta }: { abierta: boolean; onCerrar: () => void; children: ReactNode; etiqueta: string }) {
  const rm = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [alto, setAlto] = useState(600);
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(abierta ? 1 : 0, { duration: rm ? 120 : 280, easing: EASE_SHEET }));
  }, [abierta, rm, p]);
  const velo = useAnimatedStyle(() => ({ opacity: p.get() * 0.4 }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * (alto + 40) }] }));
  return (
    <View pointerEvents={abierta ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.tinta }, velo]}>
        <Pressable accessibilityLabel="Cerrar" style={{ flex: 1 }} onPress={onCerrar} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.hojaWrap} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={etiqueta}
          onLayout={(e) => setAlto(e.nativeEvent.layout.height)}
          style={[st.hoja, { paddingBottom: Math.max(24, insets.bottom + 12) }, panel]}>
          <View style={st.asa} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

export interface ItemTab {
  name: string;
  label: string;
  icono: LucideIcon;
  punto?: boolean;
}

// Tab bar clara con pastilla tinta e ícono lima que se desliza en 220 ms.
export function BarraTabs({ state, navigateToTab, insets, items }: BottomTabBarProps & { items: ItemTab[] }) {
  const rm = useReducedMotion();
  const [ancho, setAncho] = useState(0);
  const x = useSharedValue(0);
  const tabW = ancho / items.length;
  const idx = items.findIndex((it) => it.name === state.routes[state.index]?.name);
  useEffect(() => {
    if (tabW) x.set(withTiming(Math.max(0, idx) * tabW, { duration: rm ? 0 : 220, easing: EASE_SHEET }));
  }, [idx, tabW, rm, x]);
  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setAncho(e.nativeEvent.layout.width - 8)}
      style={[st.tabs, { paddingBottom: Math.max(14, insets.bottom) }]}>
      {tabW ? (
        <Animated.View pointerEvents="none" style={[st.indWrap, { width: tabW }, ind]}>
          <View style={st.ind} />
        </Animated.View>
      ) : null}
      {items.map((it) => {
        const ruta = state.routes.find((r) => r.name === it.name);
        const on = state.routes[state.index]?.name === it.name;
        const I = it.icono;
        return (
          <Pressable
            key={it.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            onPress={() => ruta && navigateToTab(ruta.key)}
            style={st.tab}>
            <View style={st.tabIcono}>
              <I size={22} color={on ? color.lima : color.texto2} strokeWidth={SW} />
              {it.punto && !on ? <View style={st.punto} /> : null}
            </View>
            <T style={[tipo.caption, { fontSize: 12, lineHeight: 16, fontFamily: on ? 'Geist_600SemiBold' : 'Geist_500Medium', color: on ? color.tinta : color.texto2 }]}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilaMulta({ m, i, onAbrir, onPagar }: { m: Multa; i: number; onAbrir: () => void; onPagar?: () => void }) {
  const e = ESTADO[m.estado];
  const I = e.icono;
  const pagar = onPagar && esPendiente(m);
  return (
    <Entrada i={i} style={[i ? { borderTopWidth: 1, borderTopColor: color.borde } : null]}>
      <Pressy
        accessibilityRole="button"
        accessibilityLabel={`${m.tipo}, ${m.placa}, ${m.fecha}, ${m.estado}, ${bs(m.amountCents)}. Ver detalle`}
        onPress={onAbrir}
        style={st.fila}>
        <View style={[st.tileIcono, { backgroundColor: e.bg }]}>
          <I size={20} color={e.fg} strokeWidth={SW} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <PlacaChip placa={m.placa} />
            <T style={tipo.cuerpoFuerte}>{m.tipo}</T>
          </View>
          <T style={[tipo.caption, { color: color.texto2 }]}>
            {m.fecha} · {m.hora} · {m.lugar}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <T style={[tipo.mono, m.estado === 'ANULADA' ? { textDecorationLine: 'line-through', color: color.texto2 } : null]}>{bs(m.amountCents)}</T>
          <Badge estado={m.estado} />
        </View>
      </Pressy>
      {pagar ? (
        <Pressy accessibilityRole="button" accessibilityLabel={`Pagar ${m.tipo} de ${m.placa}`} onPress={onPagar} style={st.pagarFila}>
          <T style={[tipo.pequenoFuerte, { color: color.tarjeta }]}>Pagar</T>
        </Pressy>
      ) : null}
    </Entrada>
  );
}

export function ListaMultas({ multas, onAbrir, onPagar }: { multas: Multa[]; onAbrir: (m: Multa) => void; onPagar?: (m: Multa) => void }) {
  return (
    <View style={st.lista}>
      {multas.map((m, i) => (
        <FilaMulta key={m.id} m={m} i={i} onAbrir={() => onAbrir(m)} onPagar={onPagar ? () => onPagar(m) : undefined} />
      ))}
    </View>
  );
}

export const st = StyleSheet.create({
  pie: { paddingTop: 12, paddingHorizontal: 16, backgroundColor: color.tarjeta, borderTopWidth: 1, borderTopColor: color.borde },
  hojaWrap: { flex: 1, justifyContent: 'flex-end' },
  hoja: { gap: 14, paddingTop: 12, paddingHorizontal: 20, backgroundColor: color.tarjeta, borderTopLeftRadius: 16, borderTopRightRadius: 16, boxShadow: sombra.sheet },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.borde },
  tabs: { flexDirection: 'row', paddingTop: 6, paddingHorizontal: 4, backgroundColor: color.tarjeta, borderTopWidth: 1, borderTopColor: color.borde },
  indWrap: { position: 'absolute', top: 6, left: 4, height: 32, alignItems: 'center' },
  ind: { width: 56, height: 32, borderRadius: radio.pastilla, backgroundColor: color.tinta },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabIcono: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
  punto: { position: 'absolute', top: 4, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: color.rojo, borderWidth: 2, borderColor: color.tarjeta },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, paddingHorizontal: 16 },
  tileIcono: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pagarFila: { height: 40, marginLeft: 68, marginRight: 16, marginBottom: 12, borderRadius: 12, backgroundColor: color.rojo, alignItems: 'center', justifyContent: 'center' },
  lista: { backgroundColor: color.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.tarjeta, overflow: 'hidden' },
});
