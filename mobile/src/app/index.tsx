import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import Animated, { Easing, interpolateColor, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { ISOTIPO_PATH, LUCES } from '@/components/Isotipo';
import { T } from '@/components/ui';
import { sesionEnMemoria } from '@/lib/dispositivo';
import { useTema } from '@/lib/tema';
import { temaClaro, tipo } from '@/theme';

const CircleAnimado = Animated.createAnimatedComponent(Circle);
const ANCHO = 168;
// El splash nativo pinta el carro a 76 px en el centro; aquí arranca igual y crece, para que el paso no se note.
const ESCALA_INICIAL = 76 / ANCHO;
// Mitad del alto del nombre + el espacio: así el carro empieza centrado como en el splash nativo.
const SUBIDA = 36;
const suave = Easing.bezier(0.22, 1, 0.36, 1);
// Tiempos (ms): el carro crece, las luces se encienden de rojo a verde, sube el nombre y todo se desvanece.
const T_FUNDIDO = 2500;
const T_SALIDA = 2900;

/** Primera vista: el carro, sus luces de rojo a verde y el nombre. Luego entra el ciudadano. */
export default function Inicio() {
  const rm = useReducedMotion();
  const { c } = useTema();
  const carro = useSharedValue(rm ? 1 : 0);
  const nombre = useSharedValue(rm ? 1 : 0);
  const visible = useSharedValue(1);
  const luces = [useSharedValue(rm ? 1 : 0.2), useSharedValue(rm ? 1 : 0.2), useSharedValue(rm ? 1 : 0.2)];

  // Solo al montar: la animación corre una vez.
  useEffect(() => {
    if (!rm) {
      carro.set(withTiming(1, { duration: 900, easing: suave }));
      luces.forEach((l, i) => l.set(withDelay(700 + i * 240, withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }))));
      nombre.set(withDelay(1050, withTiming(1, { duration: 700, easing: suave })));
      visible.set(withDelay(T_FUNDIDO, withTiming(0, { duration: 380, easing: Easing.inOut(Easing.quad) })));
    }
    const t = setTimeout(() => router.replace(sesionEnMemoria() === 'ciudadano' ? '/ciudadano' : '/ciudadano/login'), rm ? 900 : T_SALIDA);
    return () => clearTimeout(t);
  }, []);

  // Al salir, el fondo tinta se funde con el fondo de la app: el login o el inicio aparecen sin salto.
  const estiloFondo = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(visible.get(), [0, 1], [c.fondo, temaClaro.tinta]) }));
  const estiloCarro = useAnimatedStyle(() => ({
    opacity: visible.get(),
    transform: [{ translateY: (1 - nombre.get()) * SUBIDA }, { scale: ESCALA_INICIAL + (1 - ESCALA_INICIAL) * carro.get() }],
  }));
  const estiloNombre = useAnimatedStyle(() => ({
    opacity: nombre.get() * visible.get(),
    transform: [{ translateY: (1 - nombre.get()) * 12 }],
  }));

  return (
    <Animated.View accessible accessibilityLabel="SmartTraffic" style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }, estiloFondo]}>
      <StatusBar style="light" />
      <Animated.View style={estiloCarro}>
        <Svg viewBox="0 0 356 206" width={ANCHO} height={(ANCHO * 206) / 356}>
          <Path fillRule="evenodd" fill={temaClaro.tintaTexto} d={ISOTIPO_PATH} />
          {LUCES.map(([cx, fill], i) => <Luz key={cx} cx={cx} fill={fill} brillo={luces[i]} />)}
        </Svg>
      </Animated.View>
      <Animated.View style={estiloNombre}>
        <T style={[tipo.display, { color: temaClaro.tintaTexto }]}>SmartTraffic</T>
      </Animated.View>
    </Animated.View>
  );
}

function Luz({ cx, fill, brillo }: { cx: number; fill: string; brillo: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ opacity: brillo.get() }));
  return <CircleAnimado cx={cx} cy={150} r={11} fill={fill} animatedProps={props} />;
}
