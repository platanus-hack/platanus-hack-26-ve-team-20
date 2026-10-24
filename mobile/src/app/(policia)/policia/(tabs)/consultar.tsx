import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Pantalla } from '@/components/extra';
import { Boton, Chip, Entrada, Placa, T, Tarjeta } from '@/components/ui';
import { bs } from '@/demo/format';
import { consultarPlaca, normalizarPlaca, type ResultadoPlaca } from '@/demo/policia';
import { useTema } from '@/lib/tema';
import { estiloInput, fuente, tipo } from '@/theme';

export default function Consultar() {
  const { c } = useTema();
  const [placa, setPlaca] = useState('XY987ZT');
  const [res, setRes] = useState<ResultadoPlaca | null>(null);
  const [cargando, setCargando] = useState(false);

  async function consultar() {
    setCargando(true);
    setRes(await consultarPlaca(placa));
    setCargando(false);
  }

  const vista = res
    ? res.tipo === 'deuda'
      ? { badge: 'CON DEUDA', bg: c.rojoFondo, fg: c.rojoTexto, titulo: `${res.multas} multas impagas`, texto: `${res.vehiculo} · ${bs(res.totalCents)} en total (monto de ejemplo). Verifique antes de actuar.` }
      : res.tipo === 'alDia'
        ? { badge: 'AL DÍA', bg: c.verdeFondo, fg: c.verdeTexto, titulo: 'Sin multas impagas', texto: 'No hay deuda registrada para esta placa.' }
        : { badge: 'REVISE', bg: c.grisFondo, fg: c.texto2, titulo: 'Formato no válido', texto: 'Use 7 caracteres, por ejemplo AB123CD.' }
    : null;

  return (
    <Pantalla style={{ gap: 16, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
      <T accessibilityRole="header" style={tipo.display}>
        Consultar placa
      </T>
      <View style={{ gap: 6 }}>
        <T style={tipo.pequenoFuerte}>Placa</T>
        <TextInput
          accessibilityLabel="Placa"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder="AB123CD"
          placeholderTextColor={c.texto3}
          value={placa}
          onChangeText={(t) => setPlaca(normalizarPlaca(t).slice(0, 7))}
          onSubmitEditing={consultar}
          style={[estiloInput(c), { height: 64, paddingHorizontal: 16, fontFamily: fuente.monoFuerte, fontSize: 30, letterSpacing: 3.6 }]}
        />
        <T style={[tipo.caption, { color: c.texto2 }]}>Escriba o pegue la placa. No mostramos datos del dueño.</T>
      </View>
      <Boton titulo="Consultar" cargando={cargando} onPress={consultar} />
      {res && vista ? (
        <Entrada key={`${res.placa}-${res.tipo}`}>
          <Tarjeta style={{ gap: 8, padding: 16 }}>
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Placa placa={res.placa || '—'} tam={22} />
              <Chip texto={vista.badge} bg={vista.bg} fg={vista.fg} />
            </View>
            <T style={tipo.h3}>{vista.titulo}</T>
            <T style={[tipo.pequeno, { color: c.texto2 }]}>{vista.texto}</T>
          </Tarjeta>
        </Entrada>
      ) : null}
    </Pantalla>
  );
}
