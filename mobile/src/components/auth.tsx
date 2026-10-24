import { View } from 'react-native';

import { useTema } from '@/lib/tema';
import { tipo } from '@/theme';
import { Isotipo } from './Isotipo';
import { T } from './ui';

export function Marca({ texto }: { texto: string }) {
  const { c } = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Isotipo size={40} color={c.tintaTexto} />
      <T style={[tipo.cuerpoFuerte, { color: c.tintaTexto }]}>{texto}</T>
    </View>
  );
}

export function CabeceraTinta({ marca, titulo, sub, grande }: { marca: string; titulo: string; sub?: string; grande?: boolean }) {
  const { c } = useTema();
  return (
    <View style={{ gap: 12, paddingTop: grande ? 28 : 24, paddingBottom: grande ? 32 : 28, paddingHorizontal: grande ? 20 : 16, backgroundColor: c.tinta }}>
      <Marca texto={marca} />
      <T accessibilityRole="header" style={[grande ? tipo.display : { fontFamily: tipo.display.fontFamily, fontSize: 24, lineHeight: 30, letterSpacing: -0.48 }, { color: c.tintaTexto }]}>
        {titulo}
      </T>
      {sub ? <T style={{ color: c.sobreTinta }}>{sub}</T> : null}
    </View>
  );
}

export function Pasos({ paso }: { paso: 1 | 2 | 3 }) {
  const { c } = useTema();
  return (
    <View accessibilityLabel={`Paso ${paso} de 3`} style={{ flexDirection: 'row', gap: 6 }}>
      {['1 · Datos', '2 · Código', '3 · Listo'].map((n, i) => (
        <View key={n} style={{ flex: 1, paddingTop: 8, borderTopWidth: 3, borderTopColor: i < paso ? c.texto : c.borde }}>
          <T style={[tipo.captionFuerte, { color: i < paso ? c.texto : c.texto2 }]}>{n}</T>
        </View>
      ))}
    </View>
  );
}

export function Titulo({ titulo, sub }: { titulo: string; sub?: string }) {
  const { c } = useTema();
  return (
    <View style={{ gap: 6 }}>
      <T accessibilityRole="header" style={tipo.display}>
        {titulo}
      </T>
      {sub ? <T style={{ color: c.texto2 }}>{sub}</T> : null}
    </View>
  );
}
