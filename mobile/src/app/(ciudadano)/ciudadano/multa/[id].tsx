import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, ChevronDown, ChevronLeft, Play } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { FRAMES, EscenaEvidencia } from '@/components/escenas';
import { Pantalla, Pie } from '@/components/extra';
import { Badge, Boton, Enlace, Placa, PlacaChip, Pressy, SW, T, Tarjeta, estados } from '@/components/ui';
import { VEHICULOS, apelar, esPendiente, useCiudadano } from '@/demo/ciudadano';
import { bs } from '@/demo/format';
import { irAPagar } from '@/lib/nav';
import { useEstilos, useTema, type Tema } from '@/lib/tema';
import { radio, tipo } from '@/theme';

export default function DetalleMulta() {
  const { c } = useTema();
  const s = useEstilos(estilos);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { multas } = useCiudadano();
  const m = multas.find((x) => x.id === id) ?? multas[0];
  const [frame, setFrame] = useState(1);
  const [jugando, setJugando] = useState(false);
  const [detalles, setDetalles] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const iv = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (iv.current) clearInterval(iv.current);
  }, []);

  function reproducir() {
    if (iv.current) clearInterval(iv.current);
    setFrame(0);
    setJugando(true);
    let i = 0;
    iv.current = setInterval(() => {
      i += 1;
      if (i > 2) {
        if (iv.current) clearInterval(iv.current);
        setJugando(false);
        return;
      }
      setFrame(i);
    }, 700);
  }

  const pagable = esPendiente(m);
  const vehiculo = VEHICULOS.find((v) => v.placa === m.placa)?.descripcion;
  const venceTxt = m.estado === 'VENCIDA' ? `Venció el ${m.vence}` : m.estado === 'PENDIENTE' ? `Vence el ${m.vence}` : m.estado === 'PAGADA' ? 'Saldada' : 'Sin cobro';
  const auditoria = [
    { cuando: `${m.fecha} ${m.hora}`, que: `Detectada por ${m.cam}` },
    { cuando: `${m.fecha} ${m.hora}`, que: m.verif },
    { cuando: m.fecha, que: 'Aviso enviado por WhatsApp' },
  ];
  if (m.estado === 'PAGADA') auditoria.push({ cuando: m.pagadaEl ?? '', que: `Pago simulado · ${m.ref}` });
  if (m.estado === 'ANULADA') auditoria.push({ cuando: '12/03/2026', que: `Anulada por operador: ${m.motivo}` });
  if (m.estado === 'APELADA') auditoria.push({ cuando: '24/10/2026', que: 'Apelación recibida · cobro en pausa' });
  const nota =
    m.estado === 'PAGADA'
      ? `Pagada el ${m.pagadaEl} · ${m.ref}`
      : m.estado === 'ANULADA'
        ? `Anulada: ${m.motivo}. No hay nada que pagar.`
        : m.estado === 'APELADA'
          ? 'Cobro en pausa mientras se revisa su apelación.'
          : '';

  return (
    <Pantalla
      style={{ gap: 24, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 32 }}
      pie={
        pagable ? (
          <Pie>
            <Boton titulo={`Pagar ${bs(m.amountCents)}`} variante="pago" onPress={() => irAPagar([m.id])} />
          </Pie>
        ) : null
      }>
      <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/ciudadano'))} style={s.volver}>
        <ChevronLeft size={20} color={c.texto} strokeWidth={2} />
        <T style={tipo.pequenoFuerte}>Volver</T>
      </Pressable>

      <View style={{ gap: 8 }}>
        <Badge estado={m.estado} />
        <T accessibilityRole="header" style={tipo.h1}>
          {m.tipo}
        </T>
        <T style={[tipo.pequeno, { color: c.texto2 }]}>
          {m.fecha} · {m.hora}
        </T>
      </View>

      <View style={{ gap: 2 }}>
        <T style={[tipo.montoG, m.estado === 'ANULADA' ? { textDecorationLine: 'line-through', color: c.texto2 } : null]}>{bs(m.amountCents)}</T>
        <T style={[tipo.pequeno, { color: m.estado === 'VENCIDA' ? c.rojoTexto : c.texto2 }]}>{venceTxt} · monto de ejemplo</T>
      </View>

      <Tarjeta>
        <Dato primero etiqueta="Lugar">
          <T style={[tipo.pequeno, { textAlign: 'right' }]}>{m.lugar}</T>
        </Dato>
        <Dato etiqueta="Vehículo">
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <PlacaChip placa={m.placa} />
            <T style={[tipo.caption, { color: c.texto2, textAlign: 'right' }]}>{vehiculo}</T>
          </View>
        </Dato>
        <Dato etiqueta="Cámara">
          <T style={[tipo.mono, { fontSize: 14 }]}>{m.cam}</T>
        </Dato>
      </Tarjeta>

      <View accessibilityLabel="Prueba" style={{ gap: 12 }}>
        <T accessibilityRole="header" style={tipo.h3}>
          Prueba
        </T>
        <View style={s.evidencia}>
          <EscenaEvidencia frame={frame} placa={m.placa} alt={`Fotograma ${frame + 1} de 3, ${FRAMES[frame].momento} de la línea`} />
          <View style={[s.chipTinta, { left: 10 }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B5E' }} />
            <T style={[tipo.mono, { fontSize: 12, color: '#F4F5F7' }]}>{m.hora + FRAMES[frame].seg}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View accessibilityRole="tablist" style={s.frames}>
            {FRAMES.map((f, i) => (
              <Pressy
                key={f.corta}
                accessibilityRole="tab"
                accessibilityLabel={`Fotograma ${i + 1} de 3, ${f.momento} de la línea`}
                accessibilityState={{ selected: frame === i }}
                onPress={() => {
                  if (iv.current) clearInterval(iv.current);
                  setJugando(false);
                  setFrame(i);
                }}
                style={[s.frameBtn, frame === i ? s.frameOn : null]}>
                <T style={[tipo.captionFuerte, { color: frame === i ? c.texto : c.texto2 }]}>{f.momento[0].toUpperCase() + f.momento.slice(1)}</T>
              </Pressy>
            ))}
          </View>
          <Pressy accessibilityRole="button" accessibilityLabel={jugando ? 'Reproduciendo clip' : 'Ver clip'} onPress={reproducir} style={s.clip}>
            <Play size={18} color={c.texto} strokeWidth={SW} />
          </Pressy>
        </View>
        <View style={s.placaLeida}>
          <Placa placa={m.placa} tam={18} />
          <View style={{ flex: 1 }}>
            <T style={tipo.pequenoFuerte}>Placa leída</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <BadgeCheck size={14} color={c.verdeTexto} strokeWidth={2} />
              <T style={[tipo.caption, { color: c.texto2 }]}>{m.verif}</T>
            </View>
          </View>
        </View>
      </View>

      <Tarjeta>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detalles }} onPress={() => setDetalles(!detalles)} style={s.acordeon}>
          <T style={[tipo.cuerpoFuerte, { flex: 1 }]}>Cómo se detectó</T>
          <ChevronDown size={20} color={c.texto2} strokeWidth={SW} style={{ transform: [{ rotate: detalles ? '180deg' : '0deg' }] }} />
        </Pressable>
        {detalles ? (
          <View style={{ gap: 14, paddingHorizontal: 16, paddingBottom: 16 }}>
            <T style={[tipo.pequeno, { color: c.texto2 }]}>
              La cámara {m.cam} grabó el cruce. El modelo leyó la placa con una confianza de <T style={[tipo.mono, { fontSize: 14, color: c.texto2 }]}>{m.conf}</T> y la regla de la línea de pare confirmó la luz roja.
            </T>
            <View style={{ gap: 10 }}>
              {auditoria.map((a) => (
                <View key={a.que} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={[s.puntoAud, { backgroundColor: c.texto3 }]} />
                  <View style={{ flex: 1 }}>
                    <T style={tipo.pequeno}>{a.que}</T>
                    <T style={[tipo.caption, { color: c.texto2 }]}>{a.cuando}</T>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Tarjeta>

      {pagable ? <Enlace titulo="¿No está de acuerdo? Apelar esta multa" onPress={() => setDialogo(true)} colorTexto={c.texto2} style={{ alignSelf: 'center' }} /> : null}
      {nota ? (
        <View style={[s.nota, { backgroundColor: estados(c)[m.estado === 'PAGADA' ? 'PAGADA' : m.estado === 'APELADA' ? 'APELADA' : 'ANULADA'].bg }]}>
          <T style={[tipo.pequenoFuerte, { color: estados(c)[m.estado === 'PAGADA' ? 'PAGADA' : m.estado === 'APELADA' ? 'APELADA' : 'ANULADA'].fg }]}>{nota}</T>
        </View>
      ) : null}

      <Modal transparent visible={dialogo} animationType="fade" onRequestClose={() => setDialogo(false)}>
        <View style={s.velo}>
          <View accessibilityViewIsModal style={s.dialogo}>
            <T accessibilityRole="header" style={{ fontFamily: tipo.h2.fontFamily, fontSize: 24, lineHeight: 30 }}>
              ¿Desea apelar esta multa?
            </T>
            <T style={{ color: c.texto2 }}>Su apelación congela el cobro hasta que un operador la revise. Le avisaremos por WhatsApp.</T>
            <Boton
              titulo="Confirmar apelación"
              onPress={() => {
                apelar(m.id);
                setDialogo(false);
              }}
            />
            <Boton titulo="Cancelar" variante="borde" onPress={() => setDialogo(false)} />
          </View>
        </View>
      </Modal>
    </Pantalla>
  );
}

function Dato({ etiqueta, children, primero }: { etiqueta: string; children: ReactNode; primero?: boolean }) {
  const { c } = useTema();
  const s = useEstilos(estilos);
  return (
    <View style={[s.dato, primero ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borde }]}>
      <T style={[tipo.pequeno, { color: c.texto2 }]}>{etiqueta}</T>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

const estilos = ({ c, sombra }: Tema) =>
  StyleSheet.create({
    volver: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8, marginLeft: -4 },
    dato: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, minHeight: 52, paddingVertical: 14, paddingHorizontal: 16 },
    evidencia: { borderRadius: radio.tarjeta, overflow: 'hidden', backgroundColor: c.suave },
    chipTinta: { position: 'absolute', top: 10, flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: radio.pastilla, backgroundColor: 'rgba(14,23,38,.85)' },
    frames: { flex: 1, flexDirection: 'row', padding: 4, borderRadius: radio.control, backgroundColor: c.suave },
    frameBtn: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    frameOn: { backgroundColor: c.tarjeta, boxShadow: sombra.tarjeta },
    clip: { width: 48, minHeight: 48, borderRadius: radio.control, backgroundColor: c.suave, alignItems: 'center', justifyContent: 'center' },
    placaLeida: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    acordeon: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
    puntoAud: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
    nota: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radio.control },
    velo: { flex: 1, backgroundColor: c.velo, alignItems: 'center', justifyContent: 'center', padding: 16 },
    dialogo: { width: '100%', maxWidth: 420, gap: 14, padding: 24, backgroundColor: c.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.modal },
  });
