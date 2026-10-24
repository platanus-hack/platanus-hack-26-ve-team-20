import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Hoja, Pantalla, Pie } from '@/components/extra';
import { Aviso, Campo, SW, T, TipoCedula } from '@/components/ui';
import { cedulaValida, claveC2PValida, esPendiente, getMultas, pagarMultas, telefonoValido, type RechazoPago } from '@/demo/ciudadano';
import { bs, fechaCaracas } from '@/demo/format';
import { color, fuente, radio, tipo } from '@/theme';

const BANCOS = ['0102 · Banco de Venezuela (ejemplo)', '0105 · Mercantil (ejemplo)', '0134 · Banesco (ejemplo)', '0191 · BNC (ejemplo)'];

export default function Pago() {
  const { ids: idsParam } = useLocalSearchParams<{ ids?: string }>();
  const ids = (idsParam ?? '').split(',').filter(Boolean);
  // Lista fija al abrir: así el total no cambia mientras se paga.
  const [lista] = useState(() => getMultas().filter((m) => ids.includes(m.id) && esPendiente(m)));
  const total = lista.reduce((a, m) => a + m.amountCents, 0);

  const [banco, setBanco] = useState(BANCOS[0]);
  const [hojaBanco, setHojaBanco] = useState(false);
  const [tel, setTel] = useState('04120000001');
  const [tipoCed, setTipoCed] = useState<'V' | 'E'>('V');
  const [ced, setCed] = useState('99000001');
  const [clave, setClave] = useState('');
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [rechazo, setRechazo] = useState<RechazoPago | null>(null);

  const telOk = telefonoValido(tel);
  const claveOk = claveC2PValida(clave);

  // Mientras se procesa el pago no se puede salir (atrás de Android).
  useEffect(() => {
    if (!enviando) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [enviando]);

  async function pagar() {
    if (enviando) return;
    setIntento(true);
    if (!telOk || !cedulaValida(ced) || !claveOk) return;
    setEnviando(true);
    setRechazo(null);
    const elegidas = lista.map((m) => m.id);
    const r = await pagarMultas(elegidas, clave, fechaCaracas(new Date()));
    setEnviando(false);
    if (!r.ok) {
      setRechazo(r.rechazo);
      setClave('');
      setIntento(false);
      return;
    }
    router.replace({ pathname: '/ciudadano/comprobante', params: { ids: elegidas.join(',') } });
  }

  const volver = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: enviando }}
      disabled={enviando}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/ciudadano'))}
      style={[s.volver, enviando ? { opacity: 0.4 } : null]}>
      <ChevronLeft size={18} color={color.tinta} strokeWidth={2} />
      <T style={tipo.pequenoFuerte}>Volver</T>
    </Pressable>
  );

  if (!lista.length) {
    return (
      <Pantalla style={{ gap: 16, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 }}>
        {volver}
        <Aviso tono="azul">No hay multas pendientes por pagar.</Aviso>
      </Pantalla>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ gestureEnabled: !enviando }} />
      <Pantalla
        style={{ gap: 16, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 }}
        pie={
          <Pie>
            <BotonPago texto={enviando ? 'Procesando pago…' : `Pagar ${bs(total)}`} enviando={enviando} onPress={pagar} />
          </Pie>
        }>
        {volver}
        <View style={s.resumen}>
          <T style={[tipo.pequeno, { color: color.sobreTinta }]}>Total a pagar · monto de ejemplo</T>
          <T style={[tipo.montoG, { color: color.tarjeta }]}>{bs(total)}</T>
          <View style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.tinta3 }}>
            {lista.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <T style={[tipo.pequeno, { color: color.tarjeta }]}>
                  <T style={[tipo.mono, { fontSize: 14, color: color.tarjeta }]}>{m.placa}</T> · {m.tipo}
                </T>
                <T style={{ fontFamily: fuente.mono, fontSize: 14, color: color.tarjeta }}>{bs(m.amountCents)}</T>
              </View>
            ))}
          </View>
        </View>
        <View style={s.form}>
          <T accessibilityRole="header" style={tipo.h3}>
            Pago Móvil C2P
          </T>
          {rechazo ? (
            <Aviso tono="rojo">
              <T style={[tipo.pequenoFuerte, { color: color.rojoTexto }]}>{rechazo === 'fondos' ? 'Fondos insuficientes' : 'Clave C2P inválida'}</T>
              <T style={[tipo.pequeno, { color: color.rojoTexto }]}>
                {rechazo === 'fondos' ? 'Su cuenta no tiene saldo suficiente. No se cobró nada.' : 'Su banco rechazó la clave. Genere una nueva e intente otra vez; no se cobró nada.'}
              </T>
            </Aviso>
          ) : null}
          <View style={{ gap: 6 }}>
            <T style={tipo.pequenoFuerte}>Banco</T>
            <Pressable accessibilityRole="button" accessibilityLabel={`Banco: ${banco}. Cambiar`} onPress={() => setHojaBanco(true)} style={s.select}>
              <T style={{ flex: 1 }} numberOfLines={1}>
                {banco}
              </T>
              <ChevronDown size={18} color={color.texto2} strokeWidth={SW} />
            </Pressable>
          </View>
          <Campo etiqueta="Teléfono" mono keyboardType="phone-pad" value={tel} onChangeText={setTel} error={intento && !telOk ? 'Use 0412, 0414, 0416, 0424 o 0426 y 7 dígitos.' : null} />
          <Campo
            etiqueta="Cédula del titular"
            mono
            keyboardType="number-pad"
            value={ced}
            onChangeText={(t) => setCed(t.replace(/\D/g, '').slice(0, 9))}
            extra={<TipoCedula valor={tipoCed} onCambio={setTipoCed} />}
          />
          <Campo
            etiqueta="Clave C2P"
            mono
            secureTextEntry
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="6 a 8 dígitos"
            value={clave}
            onChangeText={(t) => setClave(t.replace(/\D/g, '').slice(0, 8))}
            style={{ letterSpacing: 4 }}
            error={intento && !claveOk ? 'La clave C2P tiene entre 6 y 8 dígitos.' : null}
            ayuda="Genere su clave C2P en la app de su banco."
          />
          <T style={[tipo.caption, { color: color.texto3 }]}>Prototipo: 000000 = clave inválida · 111111 = fondos insuficientes.</T>
        </View>
      </Pantalla>
      <Hoja abierta={hojaBanco} onCerrar={() => setHojaBanco(false)} etiqueta="Banco">
        <T accessibilityRole="header" style={tipo.h3}>
          Banco
        </T>
        {BANCOS.map((b, i) => (
          <Pressable
            key={b}
            accessibilityRole="button"
            accessibilityState={{ selected: banco === b }}
            onPress={() => {
              setBanco(b);
              setHojaBanco(false);
            }}
            style={[s.opcion, i ? { borderTopWidth: 1, borderTopColor: color.borde } : null]}>
            <T style={banco === b ? tipo.cuerpoFuerte : tipo.cuerpo}>{b}</T>
          </Pressable>
        ))}
      </Hoja>
    </View>
  );
}

// El botón se llena de tinta durante 1,2 s mientras se procesa el pago.
function BotonPago({ texto, enviando, onPress }: { texto: string; enviando: boolean; onPress: () => void }) {
  const rm = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(enviando ? withTiming(1, { duration: rm ? 0 : 1200, easing: Easing.linear }) : 0);
  }, [enviando, rm, p]);
  const relleno = useAnimatedStyle(() => ({ transform: [{ scaleX: p.get() }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: enviando }}
      onPress={onPress}
      style={[s.pagar, { backgroundColor: enviando ? color.tinta3 : color.rojo }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.tinta, transformOrigin: 'left' }, relleno]} />
      <T style={[tipo.cuerpoFuerte, { color: color.tarjeta }]}>{texto}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  volver: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  resumen: { gap: 8, padding: 24, backgroundColor: color.tinta, borderRadius: radio.tarjeta },
  form: { gap: 14, padding: 16, backgroundColor: color.tarjeta, borderRadius: radio.tarjeta, boxShadow: '0 1px 2px rgba(14,23,38,.06), 0 0 0 1px rgba(14,23,38,.06)' },
  select: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: color.bordeInput, borderRadius: radio.control, backgroundColor: color.tarjeta },
  opcion: { minHeight: 56, justifyContent: 'center' },
  pagar: { height: 48, borderRadius: radio.control, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
