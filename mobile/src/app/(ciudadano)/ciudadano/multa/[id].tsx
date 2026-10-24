import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, ChevronDown, ChevronLeft, Play } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { FRAMES, EscenaEvidencia } from '@/components/escenas';
import { Pantalla, Pie } from '@/components/extra';
import { Badge, Boton, ESTADO, Placa, PlacaChip, Pressy, SW, T, Tarjeta } from '@/components/ui';
import { VEHICULOS, apelar, esPendiente, useCiudadano } from '@/demo/ciudadano';
import { bs } from '@/demo/format';
import { irAPagar } from '@/lib/nav';
import { color, radio, sombra, tipo } from '@/theme';

export default function DetalleMulta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { multas } = useCiudadano();
  const m = multas.find((x) => x.id === id) ?? multas[0];
  const [frame, setFrame] = useState(1);
  const [jugando, setJugando] = useState(false);
  const [acc, setAcc] = useState({ como: false, aud: false });
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
  const venceTxt = m.estado === 'VENCIDA' ? `Venció el ${m.vence}` : m.estado === 'PENDIENTE' ? `Vence el ${m.vence} · en 30 días` : m.estado === 'PAGADA' ? 'Saldada' : 'Sin cobro';
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
      style={{ gap: 16, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 }}
      pie={
        pagable ? (
          <Pie>
            <Boton titulo={`Pagar ${bs(m.amountCents)}`} variante="pago" onPress={() => irAPagar([m.id])} />
          </Pie>
        ) : null
      }>
      <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/ciudadano'))} style={s.volver}>
        <ChevronLeft size={18} color={color.tinta} strokeWidth={2} />
        <T style={tipo.pequenoFuerte}>Volver</T>
      </Pressable>
      <View style={{ gap: 8 }}>
        <Badge estado={m.estado} />
        <T accessibilityRole="header" style={tipo.display}>
          {m.tipo}
        </T>
        <T style={{ color: color.texto2 }}>
          <T style={tipo.mono}>
            {m.fecha} · {m.hora}
          </T>{' '}
          · {m.lugar}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PlacaChip placa={m.placa} alto={26} />
          <T style={[tipo.pequeno, { flex: 1, color: color.texto2 }]}>{vehiculo}</T>
        </View>
      </View>

      <Tarjeta style={{ gap: 6, padding: 16 }}>
        <T style={[tipo.caption, { color: color.texto2 }]}>Monto de ejemplo</T>
        <T style={[tipo.montoG, m.estado === 'ANULADA' ? { textDecorationLine: 'line-through', color: color.texto2 } : null]}>{bs(m.amountCents)}</T>
        <T style={[tipo.pequeno, { color: color.texto2 }]}>{venceTxt}</T>
      </Tarjeta>

      <View accessibilityLabel="Evidencia" style={{ gap: 10 }}>
        <View style={s.evidencia}>
          <EscenaEvidencia frame={frame} placa={m.placa} alt={`Fotograma ${frame + 1} de 3, ${FRAMES[frame].momento} de la línea`} />
          <View style={[s.chipTinta, { left: 10 }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.rojo }} />
            <T style={[tipo.captionFuerte, { fontSize: 12, color: color.tarjeta }]}>
              ROJO · <T style={[tipo.mono, { fontSize: 12, color: color.tarjeta }]}>{m.hora + FRAMES[frame].seg}</T>
            </T>
          </View>
          <View style={[s.chipTinta, { right: 10 }]}>
            <T style={[tipo.mono, { fontSize: 12, color: color.tarjeta }]}>{m.cam}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {FRAMES.map((f, i) => (
            <Pressy
              key={f.corta}
              accessibilityRole="button"
              accessibilityLabel={`Fotograma ${i + 1} de 3, ${f.momento} de la línea`}
              accessibilityState={{ selected: frame === i }}
              onPress={() => {
                if (iv.current) clearInterval(iv.current);
                setJugando(false);
                setFrame(i);
              }}
              style={[s.frameBtn, frame === i ? { backgroundColor: color.suave, borderWidth: 2, borderColor: color.tinta } : null]}>
              <T style={[tipo.mono, { fontSize: 13 }]}>{f.corta}</T>
              <T style={{ fontSize: 12, lineHeight: 16, fontFamily: tipo.caption.fontFamily }}>{f.momento}</T>
            </Pressy>
          ))}
          <Pressy accessibilityRole="button" onPress={reproducir} style={s.clip}>
            <Play size={16} color={color.tarjeta} strokeWidth={SW} />
            <T style={[tipo.pequenoFuerte, { color: color.tarjeta }]}>{jugando ? 'Reproduciendo…' : 'Ver clip'}</T>
          </Pressy>
        </View>
        <Tarjeta style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
          <Placa placa={m.placa} tam={22} />
          <View style={{ flex: 1 }}>
            <T style={tipo.pequenoFuerte}>Recorte de placa</T>
            <T style={[tipo.pequeno, { color: color.texto2 }]}>Ampliado del fotograma 2.</T>
          </View>
        </Tarjeta>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BadgeCheck size={18} color={color.verde} strokeWidth={SW} />
          <T style={tipo.pequenoFuerte}>{m.verif}</T>
        </View>
      </View>

      <Tarjeta>
        <Acordeon titulo="Cómo se detectó" abierto={acc.como} onToggle={() => setAcc({ ...acc, como: !acc.como })}>
          <T style={[tipo.pequeno, { color: color.texto2 }]}>
            La cámara {m.cam} grabó el cruce. El modelo leyó la placa y la regla de la línea de pare confirmó la luz en el momento del cruce.
          </T>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={[tipo.pequeno, { color: color.texto2 }]}>Confianza del modelo</T>
            <T style={[tipo.mono, { fontSize: 14 }]}>{m.conf}</T>
          </View>
        </Acordeon>
        <Acordeon titulo="Auditoría" abierto={acc.aud} borde onToggle={() => setAcc({ ...acc, aud: !acc.aud })}>
          {auditoria.map((a) => (
            <View key={a.que} style={{ flexDirection: 'row', gap: 10 }}>
              <T style={[tipo.mono, { fontSize: 14, width: 104 }]}>{a.cuando}</T>
              <T style={[tipo.pequeno, { flex: 1, color: color.texto2 }]}>{a.que}</T>
            </View>
          ))}
        </Acordeon>
      </Tarjeta>

      {pagable ? <Boton titulo="Apelar esta multa" variante="borde" onPress={() => setDialogo(true)} /> : null}
      {nota ? (
        <View style={[s.nota, { backgroundColor: ESTADO[m.estado === 'PAGADA' ? 'PAGADA' : m.estado === 'APELADA' ? 'APELADA' : 'ANULADA'].bg }]}>
          <T style={[tipo.pequenoFuerte, { color: ESTADO[m.estado === 'PAGADA' ? 'PAGADA' : m.estado === 'APELADA' ? 'APELADA' : 'ANULADA'].fg }]}>{nota}</T>
        </View>
      ) : null}

      <Modal transparent visible={dialogo} animationType="fade" onRequestClose={() => setDialogo(false)}>
        <View style={s.velo}>
          <View accessibilityViewIsModal style={s.dialogo}>
            <T accessibilityRole="header" style={{ fontFamily: tipo.h2.fontFamily, fontSize: 24, lineHeight: 30 }}>
              ¿Desea apelar esta multa?
            </T>
            <T style={{ color: color.texto2 }}>Su apelación congela el cobro hasta que un operador la revise. Le avisaremos por WhatsApp.</T>
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

function Acordeon({ titulo, abierto, onToggle, borde, children }: { titulo: string; abierto: boolean; onToggle: () => void; borde?: boolean; children: ReactNode }) {
  return (
    <View style={borde ? { borderTopWidth: 1, borderTopColor: color.borde } : null}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: abierto }} onPress={onToggle} style={s.acordeon}>
        <T style={[tipo.cuerpoFuerte, { flex: 1 }]}>{titulo}</T>
        <ChevronDown size={20} color={color.tinta} strokeWidth={SW} style={{ transform: [{ rotate: abierto ? '180deg' : '0deg' }] }} />
      </Pressable>
      {abierto ? <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>{children}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  volver: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  evidencia: { borderRadius: radio.tarjeta, overflow: 'hidden', backgroundColor: color.tinta2 },
  chipTinta: { position: 'absolute', top: 10, flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: radio.pastilla, backgroundColor: color.tinta },
  frameBtn: { flex: 1, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.borde },
  clip: { flex: 1.2, minHeight: 52, borderRadius: 12, backgroundColor: color.tinta, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  acordeon: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  nota: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radio.control },
  velo: { flex: 1, backgroundColor: 'rgba(14,23,38,.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialogo: { width: '100%', maxWidth: 420, gap: 14, padding: 24, backgroundColor: color.tarjeta, borderRadius: radio.tarjeta, boxShadow: sombra.modal },
});
