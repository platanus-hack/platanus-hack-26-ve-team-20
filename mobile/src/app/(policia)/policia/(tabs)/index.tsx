import * as Location from 'expo-location';
import { BellRing, Check, ChevronDown, MapPinOff, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { MapaAlertas } from '@/components/escenas';
import { Pantalla } from '@/components/extra';
import { Aviso, Boton, Chip, Enlace, Placa, PlacaChip, Pressy, SW, T, Tarjeta } from '@/components/ui';
import { horaCaracas } from '@/demo/format';
import { ALERTA_DEMO, getOficial, setOficial, useOficial } from '@/demo/policia';
import { vibrar } from '@/lib/dispositivo';
import { color, radio, sombra, tipo } from '@/theme';

const A = ALERTA_DEMO;

function llegaAlerta(ms: number) {
  return setTimeout(() => {
    if (getOficial().alerta === 'activa') return;
    setOficial({ alerta: 'activa' });
    vibrar([120, 60, 120]);
  }, ms);
}

export default function Alertas() {
  const { servicio, posicionDemo, geo, alerta, recibidaA } = useOficial();
  const sinGeo = geo === 'sin' && !posicionDemo;
  const visible = alerta === 'activa' && servicio;

  useEffect(() => {
    if (geo !== 'pendiente') return;
    Location.requestForegroundPermissionsAsync()
      .then((r) => setOficial({ geo: r.granted ? 'ok' : 'sin' }))
      .catch(() => setOficial({ geo: 'sin' }));
  }, [geo]);

  // Prototipo: la alerta XY987ZT llega 2 s después de entrar a Alertas.
  useEffect(() => {
    if (getOficial().alerta !== 'ninguna') return;
    const t = llegaAlerta(2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Pantalla style={{ gap: 16, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T accessibilityRole="header" style={tipo.display}>
          Alertas
        </T>
        <Chip
          texto={servicio ? 'En servicio' : 'Fuera de servicio'}
          bg={servicio ? color.verdeFondo : color.grisFondo}
          fg={servicio ? color.verdeTexto : color.texto2}
          punto={servicio ? color.verde : color.bordeInput}
          style={{ height: 28, paddingHorizontal: 12 }}
        />
      </View>
      {sinGeo ? (
        <Aviso icono={MapPinOff}>
          <T style={[tipo.pequeno, { color: color.tinta }]}>
            <T style={[tipo.pequenoFuerte, { color: color.tinta }]}>Sin geolocalización.</T> Usamos la posición demo de Av. Demo Norte; las distancias son aproximadas.
          </T>
        </Aviso>
      ) : null}
      <View style={s.mapa}>
        <MapaAlertas alerta={visible} distancia={`${A.distanciaM} m`} />
        {sinGeo ? (
          <Pressy accessibilityRole="button" onPress={() => setOficial({ posicionDemo: true })} style={s.posDemo}>
            <T style={[tipo.captionFuerte, { color: color.tarjeta }]}>Usar posición demo</T>
          </Pressy>
        ) : null}
      </View>

      {visible ? <TarjetaAlerta /> : null}

      {!visible ? (
        <Tarjeta style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
          <View style={s.icoTinta}>
            <ShieldCheck size={24} color={color.lima} strokeWidth={SW} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={tipo.cuerpoFuerte}>Sin alertas activas</T>
            <T style={[tipo.pequeno, { color: color.texto2 }]}>
              {servicio ? 'Le avisaremos con vibración y sonido si una cámara ve un vehículo con multas impagas cerca.' : 'Está fuera de servicio. Active «En servicio» en Perfil para recibir alertas.'}
            </T>
          </View>
        </Tarjeta>
      ) : null}

      {alerta === 'recibida' ? (
        <>
          <Tarjeta style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, paddingHorizontal: 16 }}>
            <PlacaChip placa={A.placa} alto={26} />
            <T style={[tipo.pequeno, { flex: 1, color: color.texto2 }]}>
              Recibida a las <T style={[tipo.mono, { fontSize: 14 }]}>{recibidaA}</T>
            </T>
            <Chip texto="RECIBIDA" bg={color.verdeFondo} fg={color.verdeTexto} style={{ height: 24, paddingHorizontal: 9, alignSelf: 'center' }} />
          </Tarjeta>
          <Enlace
            titulo="Simular otra alerta (demo)"
            style={{ alignSelf: 'center' }}
            onPress={() => {
              setOficial({ alerta: 'ninguna' });
              llegaAlerta(600);
            }}
          />
        </>
      ) : null}
    </Pantalla>
  );
}

// La alerta sube 280 ms al llegar y baja al marcarla como recibida.
function TarjetaAlerta() {
  const rm = useReducedMotion();
  const [detalle, setDetalle] = useState(false);
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: rm ? 120 : 280, easing: Easing.bezier(0.32, 0.72, 0, 1) }));
  }, [rm, p]);
  const anim = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: rm ? 0 : (1 - p.get()) * 24 }] }));

  function recibir() {
    const fin = () => setOficial({ alerta: 'recibida', recibidaA: horaCaracas(new Date()) });
    p.set(withTiming(0, { duration: rm ? 0 : 280 }));
    setTimeout(fin, rm ? 0 : 280);
  }

  return (
    <Animated.View accessibilityLiveRegion="assertive" accessibilityLabel="Alerta activa" style={[s.alerta, anim]}>
      <View style={s.franja}>
        <BellRing size={16} color={color.tarjeta} strokeWidth={2} />
        <T style={[tipo.captionFuerte, { color: color.tarjeta, letterSpacing: 0.5 }]}>ALERTA ACTIVA</T>
        <T style={{ marginLeft: 'auto', fontFamily: 'JetBrainsMono_500Medium', fontSize: 13, color: color.tarjeta }}>hace 1 min</T>
      </View>
      <View style={{ gap: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Placa placa={A.placa} tam={28} />
          <View style={{ flex: 1 }}>
            <T style={tipo.h3}>
              <T style={[tipo.mono, { fontSize: 18 }]}>{A.multasImpagas}</T> multas impagas
            </T>
            <T style={[tipo.pequeno, { color: color.texto2 }]}>{A.vehiculo}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T style={[tipo.mono, { fontSize: 22, lineHeight: 28 }]}>{A.distanciaM} m</T>
          <T style={[tipo.pequeno, { flex: 1, color: color.texto2 }]}>{A.interseccion}</T>
        </View>
        <Aviso icono={TriangleAlert} style={{ paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' }}>
          <T style={[tipo.pequeno, { color: color.tinta }]}>
            <T style={[tipo.pequenoFuerte, { color: color.tinta }]}>Verifique antes de actuar.</T> Es deuda registrada, no una infracción en curso.
          </T>
        </Aviso>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detalle }} onPress={() => setDetalle(!detalle)} style={s.verDetalle}>
          <T style={tipo.pequenoFuerte}>Ver detalle</T>
          <ChevronDown size={18} color={color.tinta} strokeWidth={SW} style={{ transform: [{ rotate: detalle ? '180deg' : '0deg' }] }} />
        </Pressable>
        {detalle ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: -8 }}>
            <View style={{ width: '50%' }}>
              <T style={[tipo.pequeno, { color: color.texto2 }]}>Cámara</T>
              <T style={[tipo.mono, { fontSize: 14 }]}>{A.cam}</T>
            </View>
            <View style={{ width: '50%' }}>
              <T style={[tipo.pequeno, { color: color.texto2 }]}>Visto a las</T>
              <T style={[tipo.mono, { fontSize: 14 }]}>{A.vistoA}</T>
            </View>
            <T style={[tipo.pequeno, { width: '100%', color: color.texto2 }]}>Sin datos del dueño: solo placa, vehículo y deuda.</T>
          </View>
        ) : null}
        <Boton titulo="Recibido" icono={Check} onPress={recibir} />
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  mapa: { borderRadius: radio.tarjeta, overflow: 'hidden', boxShadow: sombra.tarjeta },
  posDemo: { position: 'absolute', right: 10, top: 10, height: 40, paddingHorizontal: 12, borderRadius: radio.pastilla, backgroundColor: color.tinta, justifyContent: 'center' },
  icoTinta: { width: 48, height: 48, borderRadius: 14, backgroundColor: color.tinta, alignItems: 'center', justifyContent: 'center' },
  alerta: { backgroundColor: color.tarjeta, borderRadius: radio.tarjeta, overflow: 'hidden', boxShadow: sombra.flotante },
  franja: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: color.rojo },
  verDetalle: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
