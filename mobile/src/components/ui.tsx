import { CircleAlert, CircleCheck, CircleMinus, CircleSlash, Clock, Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import type { EstadoMulta } from '@/demo/ciudadano';
import { color, fuente, radio, sombra, tipo } from '@/theme';

export const SW = 1.75;

export function T({ style, ...props }: TextProps) {
  return <Text {...props} style={[tipo.cuerpo, { color: color.tinta }, style]} />;
}

export function DemoBanner() {
  return (
    <View accessibilityRole="text" style={s.banner}>
      <View style={s.bannerPunto} />
      <T style={[tipo.caption, { color: color.texto2 }]}>Demo · datos ficticios · pagos simulados</T>
    </View>
  );
}

const APressable = Animated.createAnimatedComponent(Pressable);

// Presionar: spring a .97 (sin escala con movimiento reducido).
export function Pressy({ style, onPressIn, onPressOut, disabled, ...props }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const rm = useReducedMotion();
  const esc = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: esc.get() }] }));
  return (
    <APressable
      {...props}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={(e) => {
        if (!rm) esc.set(withSpring(0.97, { damping: 15, stiffness: 400 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        esc.set(withSpring(1, { damping: 15, stiffness: 400 }));
        onPressOut?.(e);
      }}
      style={[style, anim]}
    />
  );
}

type Variante = 'tinta' | 'pago' | 'borde' | 'peligro';

const VAR: Record<Variante, { bg: string; fg: string; borde?: string }> = {
  tinta: { bg: color.tinta, fg: color.tarjeta },
  pago: { bg: color.rojo, fg: color.tarjeta },
  borde: { bg: color.tarjeta, fg: color.tinta, borde: color.bordeInput },
  peligro: { bg: color.tarjeta, fg: color.rojoTexto, borde: color.bordeInput },
};

export function Boton({
  titulo,
  onPress,
  variante = 'tinta',
  cargando,
  disabled,
  icono: Icono,
  style,
  alto = 48,
  accessibilityLabel,
}: {
  titulo: string;
  onPress?: () => void;
  variante?: Variante;
  cargando?: boolean;
  disabled?: boolean;
  icono?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  alto?: number;
  accessibilityLabel?: string;
}) {
  const v = disabled ? { bg: color.borde, fg: color.texto2 } : VAR[variante];
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? titulo}
      accessibilityState={{ busy: !!cargando, disabled: !!disabled }}
      onPress={cargando || disabled ? undefined : onPress}
      disabled={disabled}
      style={[
        s.boton,
        { height: alto, backgroundColor: v.bg },
        'borde' in v && v.borde ? { borderWidth: 1, borderColor: v.borde } : null,
        style,
      ]}>
      {cargando ? <ActivityIndicator color={v.fg} /> : Icono ? <Icono size={18} color={v.fg} strokeWidth={SW} /> : null}
      <T style={[tipo.cuerpoFuerte, { color: v.fg }]}>{titulo}</T>
    </Pressy>
  );
}

export function Enlace({ titulo, onPress, colorTexto = color.azul, disabled, style }: { titulo: string; onPress?: () => void; colorTexto?: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.enlace, style]} hitSlop={4}>
      <T style={[tipo.pequenoFuerte, { color: disabled ? color.texto3 : colorTexto }]}>{titulo}</T>
    </Pressable>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  mono,
  clave,
  extra,
  style,
  ...input
}: TextInputProps & { etiqueta: ReactNode; error?: string | null; ayuda?: string; mono?: boolean; clave?: boolean; extra?: ReactNode }) {
  const [ver, setVer] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T style={tipo.pequenoFuerte}>{etiqueta}</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {extra}
        <View style={{ flex: 1 }}>
          <TextInput
            placeholderTextColor={color.texto3}
            accessibilityLabel={typeof etiqueta === 'string' ? etiqueta : undefined}
            {...input}
            secureTextEntry={clave ? !ver : input.secureTextEntry}
            style={[
              s.input,
              { fontFamily: mono ? fuente.mono : fuente.ui },
              error ? { borderWidth: 1.5, borderColor: color.rojo } : null,
              clave ? { paddingRight: 52 } : null,
              style,
            ]}
          />
          {clave ? (
            <Pressable accessibilityRole="button" accessibilityLabel={ver ? 'Ocultar contraseña' : 'Ver contraseña'} onPress={() => setVer(!ver)} style={s.ojo}>
              {ver ? <EyeOff size={20} color={color.texto2} strokeWidth={SW} /> : <Eye size={20} color={color.texto2} strokeWidth={SW} />}
            </Pressable>
          ) : null}
        </View>
      </View>
      {error?.trim() ? (
        <T accessibilityLiveRegion="polite" style={[tipo.caption, { color: color.rojoTexto }]}>
          {error}
        </T>
      ) : null}
      {ayuda ? <T style={[tipo.caption, { color: color.texto2 }]}>{ayuda}</T> : null}
    </View>
  );
}

// Selector V/E de la cédula
export function TipoCedula({ valor, onCambio }: { valor: 'V' | 'E'; onCambio: (v: 'V' | 'E') => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tipo de cédula ${valor}. Cambiar`}
      onPress={() => onCambio(valor === 'V' ? 'E' : 'V')}
      style={[s.input, { width: 76, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 }]}>
      <T style={[tipo.mono, { fontSize: 16 }]}>{valor}</T>
    </Pressable>
  );
}

export const ESTADO: Record<EstadoMulta, { bg: string; fg: string; icono: LucideIcon }> = {
  PENDIENTE: { bg: color.rojoFondo, fg: color.rojoTexto, icono: Clock },
  VENCIDA: { bg: color.rojoFondo, fg: color.rojoTexto, icono: CircleAlert },
  PAGADA: { bg: color.verdeFondo, fg: color.verdeTexto, icono: CircleCheck },
  APELADA: { bg: color.azulFondo, fg: color.azulTexto, icono: CircleMinus },
  ANULADA: { bg: color.grisFondo, fg: color.texto2, icono: CircleSlash },
};

export function Badge({ estado, style }: { estado: EstadoMulta; style?: StyleProp<ViewStyle> }) {
  const e = ESTADO[estado];
  const I = e.icono;
  return (
    <View style={[s.badge, { backgroundColor: e.bg }, style]}>
      <I size={13} color={e.fg} strokeWidth={2} />
      <T style={[tipo.captionFuerte, { fontSize: 12, color: e.fg }]}>{estado}</T>
    </View>
  );
}

export function Chip({ texto, bg, fg, punto, style }: { texto: string; bg: string; fg: string; punto?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.badge, { backgroundColor: bg, height: 26, paddingHorizontal: 10 }, style]}>
      {punto ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: punto }} /> : null}
      <T style={[tipo.captionFuerte, { fontSize: 12, color: fg }]}>{texto}</T>
    </View>
  );
}

export function PlacaChip({ placa, alto = 22 }: { placa: string; alto?: number }) {
  return (
    <View style={[s.placaChip, { height: alto, borderWidth: alto > 22 ? 2 : 1.5 }]}>
      <T style={[tipo.mono, { fontSize: alto > 22 ? 14 : 12, lineHeight: 16, letterSpacing: 0.5 }]}>{placa}</T>
    </View>
  );
}

export function Placa({ placa, tam = 30 }: { placa: string; tam?: number }) {
  const fg = color.tinta;
  return (
    <View accessibilityLabel={`Placa ${placa}`} style={[s.placa, { borderColor: fg, backgroundColor: color.tarjeta }]}>
      <T style={{ fontFamily: fuente.uiFuerte, fontSize: tam < 24 ? 8 : 9, lineHeight: 10, letterSpacing: 2.2, color: fg }}>VENEZUELA</T>
      <T style={[tipo.mono, { fontSize: tam, lineHeight: tam + 4, letterSpacing: tam * 0.08, color: fg }]}>{placa}</T>
    </View>
  );
}

export function Interruptor({ valor, onCambio, etiqueta }: { valor: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  const rm = useReducedMotion();
  const x = useSharedValue(valor ? 20 : 0);
  useEffect(() => {
    x.set(withTiming(valor ? 20 : 0, { duration: rm ? 120 : 220 }));
  }, [valor, rm, x]);
  const boli = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={etiqueta}
      accessibilityState={{ checked: valor }}
      onPress={() => onCambio(!valor)}
      hitSlop={6}
      style={[s.pista, { backgroundColor: valor ? color.tinta : color.bordeInput }]}>
      <Animated.View style={[s.boli, { backgroundColor: valor ? color.lima : color.tarjeta }, boli]} />
    </Pressable>
  );
}

// Entrada de listas: 240 ms (.16,1,.3,1) con 30 ms de escalonado; con movimiento reducido, fundido de 120 ms.
export function Entrada({ i = 0, children, style }: { i?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const rm = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(rm ? 0 : i * 30, withTiming(1, { duration: rm ? 120 : 240, easing: Easing.bezier(0.16, 1, 0.3, 1) })));
  }, [i, rm, p]);
  const anim = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: rm ? 0 : (1 - p.get()) * 8 }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.tarjeta, style]}>{children}</View>;
}

export function Aviso({ children, tono = 'ambar', icono: I, style }: { children: ReactNode; tono?: 'ambar' | 'rojo' | 'azul'; icono?: LucideIcon; style?: StyleProp<ViewStyle> }) {
  const t = { ambar: [color.ambar, color.tinta], rojo: [color.rojoFondo, color.rojoTexto], azul: [color.azulFondo, color.azulTexto] }[tono];
  return (
    <View accessibilityRole="alert" style={[s.aviso, { backgroundColor: t[0] }, style]}>
      {I ? <I size={18} color={t[1]} strokeWidth={2} /> : null}
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <T style={[tipo.pequeno, { color: t[1] }]}>{children}</T> : children}</View>
    </View>
  );
}

export const s = StyleSheet.create({
  banner: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: color.suave,
    borderBottomWidth: 1,
    borderBottomColor: color.borde,
  },
  bannerPunto: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ambar },
  boton: { borderRadius: radio.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  enlace: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: color.bordeInput,
    borderRadius: radio.control,
    backgroundColor: color.tarjeta,
    fontSize: 16,
    color: color.tinta,
  },
  ojo: { position: 'absolute', right: 2, top: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, height: 24, paddingHorizontal: 9, borderRadius: radio.pastilla },
  placaChip: { alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 6, borderColor: color.tinta, borderRadius: radio.placa },
  placa: { alignItems: 'center', alignSelf: 'flex-start', paddingTop: 4, paddingBottom: 6, paddingHorizontal: 14, borderWidth: 2, borderRadius: radio.placa },
  pista: { width: 52, height: 32, borderRadius: radio.pastilla, padding: 4 },
  boli: { width: 24, height: 24, borderRadius: 12 },
  tarjeta: { backgroundColor: color.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.tarjeta },
  aviso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: radio.control },
});
