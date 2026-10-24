import { router } from 'expo-router';
import { BellRing, Check } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListaMultas, Pantalla } from '@/components/extra';
import { Boton, Enlace, SW, T } from '@/components/ui';
import { CIUDADANO, esPendiente, marcarNotificacionVista, useCiudadano, type Multa } from '@/demo/ciudadano';
import { bs } from '@/demo/format';
import { vibrar } from '@/lib/dispositivo';
import { abrirMulta, irAPagar } from '@/lib/nav';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, temaClaro, tipo } from '@/theme';

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

// Inicio: cuánto debe y qué multas lo componen. El historial vive en la pestaña Multas.
export default function Inicio() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const { multas, notificacionVista } = useCiudadano();
  const pend = multas.filter(esPendiente);
  const total = pend.reduce((a, m) => a + m.amountCents, 0);
  const vencidas = pend.filter((m) => m.estado === 'VENCIDA').length;
  const nueva = multas.find((m) => m.id === 'm1' && m.estado === 'PENDIENTE');
  const verTodas = () => router.navigate({ pathname: '/ciudadano/multas', params: { tab: pend.length ? '0' : '1', filtro: 'todos' } });

  return (
    <View style={{ flex: 1 }}>
      <Pantalla style={{ gap: 28, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
        <View style={{ gap: 4 }}>
          <T accessibilityRole="header" style={tipo.h1}>
            {saludo()}
          </T>
          <T style={[tipo.pequeno, { color: c.texto2 }]}>
            Cédula <T style={[tipo.mono, { fontSize: 14, color: c.texto2 }]}>{CIUDADANO.cedula}</T>
          </T>
        </View>

        {pend.length ? (
          <View style={s.resumen}>
            <View style={{ gap: 4 }}>
              <T style={[tipo.pequeno, { color: c.sobreTinta }]}>Por pagar</T>
              <T style={[tipo.montoG, { color: c.tintaTexto }]}>{bs(total)}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T style={[tipo.pequeno, { color: c.sobreTinta }]}>
                  {pend.length} {pend.length === 1 ? 'multa' : 'multas'}
                </T>
                {vencidas ? (
                  <View style={s.vencida}>
                    <View style={[s.puntoRojo, { backgroundColor: c.rojo }]} />
                    <T style={[tipo.captionFuerte, { color: c.tintaTexto }]}>{vencidas === 1 ? '1 vencida' : `${vencidas} vencidas`}</T>
                  </View>
                ) : null}
              </View>
            </View>
            <Boton titulo={pend.length > 1 ? 'Pagar todo' : 'Pagar'} variante="lima" onPress={() => irAPagar(pend.map((m) => m.id))} />
          </View>
        ) : (
          <View style={[s.resumen, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
            <View style={s.check}>
              <Check size={26} color={temaClaro.tinta} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T style={[tipo.h2, { color: c.tintaTexto }]}>Está al día</T>
              <T style={[tipo.pequeno, { color: c.sobreTinta }]}>No tiene multas por pagar.</T>
            </View>
          </View>
        )}

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T accessibilityRole="header" style={tipo.h3}>
              {pend.length ? 'Pendientes' : 'Historial'}
            </T>
            <Enlace titulo="Ver todas" onPress={verTodas} />
          </View>
          {pend.length ? (
            <ListaMultas multas={pend} onAbrir={abrirMulta} />
          ) : (
            <ListaMultas multas={multas.filter((m) => m.estado === 'PAGADA').slice(0, 3)} onAbrir={abrirMulta} />
          )}
        </View>
      </Pantalla>
      {nueva && !notificacionVista ? <Notificacion multa={nueva} /> : null}
    </View>
  );
}

// "Nueva multa": baja desde arriba en 280 ms y abre el detalle.
function Notificacion({ multa }: { multa: Multa }) {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const rm = useReducedMotion();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(-200);
  const op = useSharedValue(rm ? 0 : 1);

  useEffect(() => {
    const t1 = setTimeout(() => {
      vibrar([30]);
      if (rm) op.set(withTiming(1, { duration: 120 }));
      y.set(withTiming(0, { duration: rm ? 0 : 280, easing: Easing.bezier(0.32, 0.72, 0, 1) }));
    }, 700);
    const t2 = setTimeout(() => {
      y.set(withTiming(-200, { duration: rm ? 0 : 280 }));
      setTimeout(marcarNotificacionVista, 300);
    }, 8700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [rm, y, op]);

  const anim = useAnimatedStyle(() => ({ opacity: op.get(), transform: [{ translateY: y.get() }] }));

  return (
    <Animated.View style={[s.notif, { top: insets.top + 40 }, anim]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Nueva multa: ${multa.tipo}, ${multa.placa}, ${bs(multa.amountCents)}. Abrir detalle`}
        onPress={() => {
          marcarNotificacionVista();
          abrirMulta(multa);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[s.tileIco, { backgroundColor: c.rojoFondo }]}>
          <BellRing size={20} color={c.rojoTexto} strokeWidth={SW} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={tipo.cuerpoFuerte}>Nueva multa · {multa.tipo}</T>
          <T style={[tipo.pequeno, { color: c.texto2 }]}>
            <T style={[tipo.mono, { fontSize: 14 }]}>{multa.placa}</T> · {bs(multa.amountCents)} · toque para ver la prueba
          </T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const estilos = ({ c, sombra }: Tema) =>
  StyleSheet.create({
    resumen: { gap: 20, padding: 20, backgroundColor: c.tinta, borderRadius: radio.tarjeta, boxShadow: sombra.tarjeta },
    vencida: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: radio.pastilla, backgroundColor: c.tinta2 },
    puntoRojo: { width: 6, height: 6, borderRadius: 3 },
    check: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.lima, alignItems: 'center', justifyContent: 'center' },
    tileIco: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    notif: { position: 'absolute', left: 12, right: 12, padding: 12, paddingHorizontal: 14, borderRadius: radio.tarjeta, backgroundColor: c.tarjeta, boxShadow: sombra.flotante },
  });
