import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Pantalla } from '@/components/extra';
import { Boton, T } from '@/components/ui';
import { CIUDADANO, esPendiente, useCiudadano } from '@/demo/ciudadano';
import { bs, fechaCaracas, horaCaracas } from '@/demo/format';
import { hapticaExito } from '@/lib/dispositivo';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';

export default function Comprobante() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const { ids: idsParam } = useLocalSearchParams<{ ids?: string }>();
  const ids = (idsParam ?? '').split(',').filter(Boolean);
  const { multas } = useCiudadano();
  const pagadas = multas.filter((m) => ids.includes(m.id));
  const restantes = multas.filter(esPendiente);
  const total = pagadas.reduce((a, m) => a + m.amountCents, 0);
  const [ahora] = useState(() => new Date());
  const rm = useReducedMotion();

  // El check se dibuja en 400 ms.
  const trazo = useSharedValue(0);
  useEffect(() => {
    hapticaExito();
    trazo.set(withDelay(40, withTiming(1, { duration: rm ? 0 : 400, easing: Easing.bezier(0.16, 1, 0.3, 1) })));
  }, [rm, trazo]);
  const tapa = useAnimatedStyle(() => ({ transform: [{ translateX: trazo.get() * 44 }] }));

  return (
    <Pantalla style={{ gap: 20, paddingTop: 40, paddingHorizontal: 16, paddingBottom: 32 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={s.circulo}>
          <View style={{ width: 44, height: 44, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={40} color={c.sobreAcento} strokeWidth={2.5} />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.verde }, tapa]} />
          </View>
        </View>
        <T accessibilityRole="header" style={tipo.h1}>
          Pago aprobado
        </T>
      </View>

      <View accessibilityLabel="Comprobante" style={s.recibo}>
        <View style={s.total}>
          <T style={[tipo.caption, { color: c.texto2 }]}>Total pagado</T>
          <T style={[tipo.mono, { fontSize: 32, lineHeight: 38 }]}>{bs(total)}</T>
          <View style={s.sello}>
            <T style={[tipo.mono, { fontSize: 12, letterSpacing: 1.4, color: c.texto2 }]}>SIMULADO</T>
          </View>
        </View>
        {pagadas.map((m) => (
          <View key={m.id} style={s.linea}>
            <View style={{ flex: 1 }}>
              <T style={tipo.pequenoFuerte}>{m.tipo}</T>
              <T style={[tipo.caption, { color: c.texto2 }]}>
                {m.placa} · {bs(m.amountCents)}
              </T>
            </View>
            <T style={[tipo.mono, { fontSize: 13, color: c.texto2 }]}>{m.ref}</T>
          </View>
        ))}
        <View style={{ flexDirection: 'row' }}>
          <View style={s.dato}>
            <T style={[tipo.caption, { color: c.texto2 }]}>Fecha</T>
            <T style={[tipo.mono, { fontSize: 14 }]}>
              {fechaCaracas(ahora)} · {horaCaracas(ahora)}
            </T>
          </View>
          <View style={[s.dato, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.borde }]}>
            <T style={[tipo.caption, { color: c.texto2 }]}>Teléfono</T>
            <T style={[tipo.mono, { fontSize: 14 }]}>{CIUDADANO.telefonoOculto}</T>
          </View>
        </View>
      </View>

      <Boton titulo="Volver al inicio" onPress={() => router.dismissTo('/ciudadano')} />
      {restantes.length ? (
        <Boton titulo={`Pagar la restante (${bs(restantes.reduce((a, m) => a + m.amountCents, 0))})`} variante="borde" onPress={() => router.replace({ pathname: '/ciudadano/pago', params: { ids: restantes.map((m) => m.id).join(',') } })} />
      ) : null}
      <T style={[tipo.caption, { color: c.texto2, textAlign: 'center' }]}>Le enviamos la confirmación por WhatsApp.</T>
    </Pantalla>
  );
}

const estilos = ({ c, sombra }: Tema) =>
  StyleSheet.create({
  circulo: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.verde, alignItems: 'center', justifyContent: 'center' },
  recibo: { backgroundColor: c.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.tarjeta, overflow: 'hidden' },
  total: { alignItems: 'center', gap: 6, paddingVertical: 20, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borde },
  sello: { height: 26, paddingHorizontal: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.texto2, borderRadius: radio.placa, justifyContent: 'center' },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borde },
  dato: { flex: 1, paddingVertical: 12, paddingHorizontal: 16 },
});
