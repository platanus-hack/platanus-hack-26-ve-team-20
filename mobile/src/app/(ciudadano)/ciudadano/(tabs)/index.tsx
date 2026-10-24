import { router } from 'expo-router';
import { BellRing, Car, Check, CircleAlert, Clock, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListaMultas, Pantalla } from '@/components/extra';
import { Boton, Enlace, SW, T } from '@/components/ui';
import { CIUDADANO, VEHICULOS, esPendiente, marcarNotificacionVista, useCiudadano, type Multa } from '@/demo/ciudadano';
import { bs } from '@/demo/format';
import { vibrar } from '@/lib/dispositivo';
import { abrirMulta, irAPagar } from '@/lib/nav';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';


export default function Inicio() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const { multas, notificacionVista } = useCiudadano();
  const pend = multas.filter(esPendiente);
  const pagadas = multas.filter((m) => m.estado === 'PAGADA');
  const total = pend.reduce((a, m) => a + m.amountCents, 0);
  const vencida = pend.find((m) => m.estado === 'VENCIDA');
  const proxima = pend.find((m) => m.estado === 'PENDIENTE');
  const nueva = multas.find((m) => m.id === 'm1' && m.estado === 'PENDIENTE');

  const tiles: { label: string; valor: string; sub: string; icono: LucideIcon; bg: string; fg: string }[] = [];
  if (vencida) tiles.push({ label: 'Vencida desde', valor: vencida.vence ?? '', sub: `${vencida.placa} · ${vencida.tipo}`, icono: CircleAlert, bg: c.rojoFondo, fg: c.rojoTexto });
  if (proxima) tiles.push({ label: 'Próximo vencimiento', valor: proxima.vence ?? '', sub: `${proxima.placa} · en 30 días`, icono: Clock, bg: c.suave, fg: c.texto });
  if (tiles.length < 2) tiles.push({ label: 'Vehículos', valor: String(VEHICULOS.length), sub: 'a su nombre', icono: Car, bg: c.suave, fg: c.texto });

  return (
    <View style={{ flex: 1 }}>
      <Pantalla style={{ gap: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ gap: 2 }}>
          <T style={[tipo.pequeno, { color: c.texto2 }]}>
            Buen día · <T style={[tipo.mono, { fontSize: 14, color: c.texto2 }]}>{CIUDADANO.cedula}</T>
          </T>
          <T accessibilityRole="header" style={tipo.h1}>
            Inicio
          </T>
        </View>

        {pend.length ? (
          <>
            <View style={{ gap: 12 }}>
              <View style={s.bento}>
                <View style={s.chipLima}>
                  <T style={[tipo.captionFuerte, { color: c.tinta }]}>{pend.length} por pagar</T>
                </View>
                <T style={[tipo.pequeno, { color: c.sobreTinta }]}>Total pendiente · monto de ejemplo</T>
                <T style={[tipo.montoG, { color: c.tintaTexto }]}>{bs(total)}</T>
                <Boton titulo={pend.length > 1 ? 'Pagar todo' : 'Pagar'} variante="pago" onPress={() => irAPagar(pend.map((m) => m.id))} style={{ alignSelf: 'flex-start', marginTop: 'auto', paddingHorizontal: 24 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {tiles.map((t) => (
                  <View key={t.label} style={s.tile}>
                    <View style={[s.tileIco, { backgroundColor: t.bg }]}>
                      <t.icono size={18} color={t.fg} strokeWidth={SW} />
                    </View>
                    <T style={[tipo.caption, { color: c.texto2 }]}>{t.label}</T>
                    <T style={[tipo.mono, { fontSize: 20, lineHeight: 26 }]}>{t.valor}</T>
                    <T style={[tipo.caption, { color: c.texto2 }]}>{t.sub}</T>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ gap: 12 }}>
              <T accessibilityRole="header" style={tipo.h2}>
                Por pagar
              </T>
              <ListaMultas multas={pend} onAbrir={abrirMulta} onPagar={(m) => irAPagar([m.id])} />
            </View>
          </>
        ) : (
          <>
            <View style={s.celebra}>
              <View style={s.celebraIco}>
                <Check size={36} color={c.tinta} strokeWidth={2.5} />
              </View>
              <View style={{ gap: 6 }}>
                <T style={[tipo.display, { color: c.tintaTexto }]}>Está al día</T>
                <T style={{ color: c.sobreTinta }}>No tiene multas por pagar. Gracias por ponerse al día.</T>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  <View style={s.chipOscuro}>
                    <T style={[tipo.captionFuerte, { color: c.tintaTexto }]}>
                      <T style={[tipo.mono, { fontSize: 13, color: c.tintaTexto }]}>{pagadas.length}</T> pagadas
                    </T>
                  </View>
                  <View style={s.chipOscuro}>
                    <T style={[tipo.mono, { fontSize: 13, color: c.tintaTexto }]}>{bs(pagadas.reduce((a, m) => a + m.amountCents, 0))} pagados</T>
                  </View>
                </View>
              </View>
            </View>
            <View style={{ gap: 12 }}>
              <T accessibilityRole="header" style={tipo.h2}>
                Últimas pagadas
              </T>
              <ListaMultas multas={pagadas.slice(0, 3)} onAbrir={abrirMulta} />
            </View>
          </>
        )}

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T accessibilityRole="header" style={tipo.h2}>
              Infracciones recientes
            </T>
            <Enlace titulo="Ver todas" onPress={() => router.navigate({ pathname: '/ciudadano/multas', params: { tab: '0', filtro: 'todos' } })} />
          </View>
          <ListaMultas multas={multas.slice(0, 5)} onAbrir={abrirMulta} />
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
        <View style={[s.tileIco, { width: 40, height: 40, borderRadius: 12, backgroundColor: c.rojoFondo }]}>
          <BellRing size={20} color={c.rojoTexto} strokeWidth={SW} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={tipo.cuerpoFuerte}>Nueva multa · {multa.tipo}</T>
          <T style={[tipo.pequeno, { color: c.texto2 }]}>
            <T style={[tipo.mono, { fontSize: 14 }]}>{multa.placa}</T> · {bs(multa.amountCents)} · toque para ver la evidencia
          </T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const estilos = ({ c, sombra }: Tema) =>
  StyleSheet.create({
  bento: { gap: 10, padding: 24, minHeight: 200, backgroundColor: c.tinta, borderWidth: 1, borderColor: c.tintaBorde, borderRadius: radio.tarjeta },
  chipLima: { alignSelf: 'flex-start', height: 26, paddingHorizontal: 10, borderRadius: radio.pastilla, backgroundColor: c.lima, justifyContent: 'center' },
  tile: { flex: 1, gap: 4, padding: 16, backgroundColor: c.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.tarjeta },
  tileIco: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  celebra: { gap: 20, padding: 24, backgroundColor: c.tinta, borderWidth: 1, borderColor: c.tintaBorde, borderRadius: radio.tarjeta },
  celebraIco: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.lima, alignItems: 'center', justifyContent: 'center' },
  chipOscuro: { height: 28, paddingHorizontal: 12, borderRadius: radio.pastilla, backgroundColor: c.tinta2, justifyContent: 'center' },
  notif: { position: 'absolute', left: 12, right: 12, padding: 12, paddingHorizontal: 14, borderRadius: radio.tarjeta, backgroundColor: c.tarjeta, boxShadow: sombra.flotante },
});
