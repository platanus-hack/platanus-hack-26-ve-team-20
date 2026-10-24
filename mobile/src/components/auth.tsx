import { ShieldCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { color, tipo } from '@/theme';
import { T } from './ui';

export function Marca({ texto }: { texto: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color.lima, alignItems: 'center', justifyContent: 'center' }}>
        <ShieldCheck size={18} color={color.tinta} strokeWidth={2} />
      </View>
      <T style={[tipo.cuerpoFuerte, { color: color.tarjeta }]}>{texto}</T>
    </View>
  );
}

export function CabeceraTinta({ marca, titulo, sub, grande }: { marca: string; titulo: string; sub?: string; grande?: boolean }) {
  return (
    <View style={{ gap: 12, paddingTop: grande ? 28 : 24, paddingBottom: grande ? 32 : 28, paddingHorizontal: grande ? 20 : 16, backgroundColor: color.tinta }}>
      <Marca texto={marca} />
      <T accessibilityRole="header" style={[grande ? tipo.display : { fontFamily: tipo.display.fontFamily, fontSize: 24, lineHeight: 30, letterSpacing: -0.48 }, { color: color.tarjeta }]}>
        {titulo}
      </T>
      {sub ? <T style={{ color: color.sobreTinta }}>{sub}</T> : null}
    </View>
  );
}

export function Pasos({ paso }: { paso: 1 | 2 | 3 }) {
  return (
    <View accessibilityLabel={`Paso ${paso} de 3`} style={{ flexDirection: 'row', gap: 6 }}>
      {['1 · Datos', '2 · Código', '3 · Listo'].map((n, i) => (
        <View key={n} style={{ flex: 1, paddingTop: 8, borderTopWidth: 3, borderTopColor: i < paso ? color.tinta : color.borde }}>
          <T style={[tipo.captionFuerte, { color: i < paso ? color.tinta : color.texto2 }]}>{n}</T>
        </View>
      ))}
    </View>
  );
}

export function Titulo({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T accessibilityRole="header" style={tipo.display}>
        {titulo}
      </T>
      {sub ? <T style={{ color: color.texto2 }}>{sub}</T> : null}
    </View>
  );
}
