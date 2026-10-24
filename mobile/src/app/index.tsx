import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { ISOTIPO_PATH, LUCES } from '@/components/Isotipo';
import { T } from '@/components/ui';
import { sesionEnMemoria } from '@/lib/dispositivo';
import { temaClaro, tipo } from '@/theme';

const CircleAnimado = Animated.createAnimatedComponent(Circle);
const ANCHO = 168;
// El splash nativo pinta el carro a 76 px en el centro; aquí arranca igual y crece, para que el paso no se note.
const ESCALA_INICIAL = 76 / ANCHO;
// Mitad del alto del nombre + el espacio: así el carro empieza centrado como en el splash nativo.
const SUBIDA = 36;
const salida = Easing.bezier(0.16, 1, 0.3, 1);

/** Primera vista: el carro, sus luces de rojo a verde y el nombre. Luego entra el ciudadano. */
export default function Inicio() {
  const rm = useReducedMotion();
  const carro = useSharedValue(rm ? 1 : 0);
  const nombre = useSharedValue(rm ? 1 : 0);
  const luces = [useSharedValue(rm ? 1 : 0.2), useSharedValue(rm ? 1 : 0.2), useSharedValue(rm ? 1 : 0.2)];

  // Solo al montar: la animación corre una vez.
  useEffect(() => {
    if (!rm) {
      carro.set(withTiming(1, { duration: 520, easing: salida }));
      luces.forEach((l, i) => l.set(withDelay(460 + i * 170, withTiming(1, { duration: 140 }))));
      nombre.set(withDelay(620, withTiming(1, { duration: 420, easing: salida })));
    }
    const t = setTimeout(() => router.replace(sesionEnMemoria() === 'ciudadano' ? '/ciudadano' : '/ciudadano/login'), rm ? 700 : 1700);
    return () => clearTimeout(t);
  }, []);

  const estiloCarro = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - nombre.get()) * SUBIDA }, { scale: ESCALA_INICIAL + (1 - ESCALA_INICIAL) * carro.get() }],
  }));
  const estiloNombre = useAnimatedStyle(() => ({
    opacity: nombre.get(),
    transform: [{ translateY: (1 - nombre.get()) * 12 }],
  }));

  return (
    <View accessible accessibilityLabel="SmartTraffic" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: temaClaro.tinta }}>
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
    </View>
  );
}

function Luz({ cx, fill, brillo }: { cx: number; fill: string; brillo: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ opacity: brillo.get() }));
  return <CircleAnimado cx={cx} cy={150} r={11} fill={fill} animatedProps={props} />;
}
