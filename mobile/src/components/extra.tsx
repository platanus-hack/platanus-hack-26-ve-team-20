import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Multa } from '@/demo/ciudadano';
import { bs } from '@/demo/format';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';
import { DemoBanner, ETIQUETA, Entrada, Pressy, SW, T, estados } from './ui';

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

// Contenedor de pantalla vertical (ciudadano y policía): franja de demo arriba.
export function Pantalla({ children, scroll = true, pie, style, fijos }: { children: ReactNode; scroll?: boolean; pie?: ReactNode; style?: StyleProp<ViewStyle>; fijos?: number[] }) {
  const { c } = useTema();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.fondo }}>
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
  const st = useEstilos(estilos);
  const insets = useSafeAreaInsets();
  return <View style={[st.pie, { paddingBottom: Math.max(16, insets.bottom) }]}>{children}</View>;
}

// Sheet inferior: 280 ms (.32,.72,0,1); con movimiento reducido, 120 ms.
export function Hoja({ abierta, onCerrar, children, etiqueta }: { abierta: boolean; onCerrar: () => void; children: ReactNode; etiqueta: string }) {
  const { c } = useTema();
  const st = useEstilos(estilos);
  const rm = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [alto, setAlto] = useState(600);
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(abierta ? 1 : 0, { duration: rm ? 120 : 280, easing: EASE_SHEET }));
  }, [abierta, rm, p]);
  const velo = useAnimatedStyle(() => ({ opacity: p.get() }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * (alto + 40) }] }));
  return (
    <View pointerEvents={abierta ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.velo }, velo]}>
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

// Tab bar con una pastilla suave que se desliza en 220 ms detrás del ícono activo.
export function BarraTabs({ state, navigateToTab, insets, items }: BottomTabBarProps & { items: ItemTab[] }) {
  const { c } = useTema();
  const st = useEstilos(estilos);
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
              <I size={22} color={on ? c.texto : c.texto2} strokeWidth={on ? 2 : SW} />
              {it.punto && !on ? <View style={st.punto} /> : null}
            </View>
            <T style={[tipo.caption, { fontSize: 12, lineHeight: 16, fontFamily: on ? 'Geist_600SemiBold' : 'Geist_500Medium', color: on ? c.texto : c.texto2 }]}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** '24/10/2026' → '24 oct' (el año va en los encabezados de mes y en el detalle). */
export const fechaCorta = (f: string) => {
  const [d, m] = f.split('/');
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m}`;
};

// Fila de multa: qué pasó, placa y fecha, monto y estado. El pago se hace desde el detalle.
export function FilaMulta({ m, i, onAbrir }: { m: Multa; i: number; onAbrir: () => void }) {
  const { c } = useTema();
  const st = useEstilos(estilos);
  const e = estados(c)[m.estado];
  const I = e.icono;
  return (
    <Entrada i={i}>
      {i ? <View style={st.separador} /> : null}
      <Pressy
        accessibilityRole="button"
        accessibilityLabel={`${m.tipo}, ${m.placa}, ${fechaCorta(m.fecha)}, ${ETIQUETA[m.estado]}, ${bs(m.amountCents)}. Ver detalle`}
        onPress={onAbrir}
        style={st.fila}>
        <View style={[st.tileIcono, { backgroundColor: e.bg }]}>
          <I size={18} color={e.fg} strokeWidth={SW} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T numberOfLines={1} style={tipo.cuerpoFuerte}>{m.tipo}</T>
          <T style={[tipo.caption, { color: c.texto2 }]}>
            <T style={[tipo.mono, { fontSize: 12, color: c.texto2 }]}>{m.placa}</T> · {fechaCorta(m.fecha)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <T style={[tipo.mono, { fontSize: 15 }, m.estado === 'ANULADA' ? { textDecorationLine: 'line-through', color: c.texto2 } : null]}>{bs(m.amountCents)}</T>
          <T style={[tipo.captionFuerte, { color: e.fg }]}>{ETIQUETA[m.estado]}</T>
        </View>
        <ChevronRight size={18} color={c.texto3} strokeWidth={2} />
      </Pressy>
    </Entrada>
  );
}

export function ListaMultas({ multas, onAbrir }: { multas: Multa[]; onAbrir: (m: Multa) => void }) {
  const st = useEstilos(estilos);
  return (
    <View style={st.lista}>
      {multas.map((m, i) => (
        <FilaMulta key={m.id} m={m} i={i} onAbrir={() => onAbrir(m)} />
      ))}
    </View>
  );
}

const estilos = ({ c, sombra }: Tema) =>
  StyleSheet.create({
    pie: { paddingTop: 12, paddingHorizontal: 16, backgroundColor: c.tarjeta, borderTopWidth: 1, borderTopColor: c.borde },
    hojaWrap: { flex: 1, justifyContent: 'flex-end' },
    hoja: { gap: 14, paddingTop: 12, paddingHorizontal: 20, backgroundColor: c.tarjeta, borderTopLeftRadius: 16, borderTopRightRadius: 16, boxShadow: sombra.sheet },
    asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.borde },
    tabs: { flexDirection: 'row', paddingTop: 6, paddingHorizontal: 4, backgroundColor: c.tarjeta, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borde },
    indWrap: { position: 'absolute', top: 6, left: 4, height: 32, alignItems: 'center' },
    ind: { width: 56, height: 32, borderRadius: radio.pastilla, backgroundColor: c.suave },
    tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
    tabIcono: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
    punto: { position: 'absolute', top: 4, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: c.rojo, borderWidth: 2, borderColor: c.tarjeta },
    fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
    tileIcono: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    separador: { marginLeft: 64, height: StyleSheet.hairlineWidth, backgroundColor: c.borde },
    lista: { backgroundColor: c.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.tarjeta, overflow: 'hidden' },
  });
