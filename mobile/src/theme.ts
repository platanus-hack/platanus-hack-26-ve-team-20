// Tokens de "Asfalto y Señal" (Dirección C). El lima vive solo sobre tinta.
import type { TextStyle } from 'react-native';

export const color = {
  fondo: '#F3F5F8',
  tarjeta: '#FCFDFE',
  suave: '#EEF1F5',
  tinta: '#0E1726',
  tinta2: '#151C28',
  tinta3: '#2A3446',
  texto2: '#4B5565',
  texto3: '#667085',
  sobreTinta: '#A9B4C4',
  lima: '#C6F24E',
  borde: '#DDE2E9',
  bordeInput: '#7D8797',
  rojo: '#C8281C',
  rojoHover: '#A91F15',
  rojoTexto: '#A91F15',
  rojoFondo: '#FDECEA',
  verde: '#12723A',
  verdeTexto: '#0F6332',
  verdeFondo: '#E6F4EA',
  ambar: '#F5A524',
  ambarTexto: '#7A4300',
  ambarFondo: '#FEF2D6',
  azul: '#1F5FD1',
  azulTexto: '#1A4FB0',
  azulFondo: '#E8F0FD',
  grisFondo: '#ECEFF3',
} as const;

// Modo cámara (oscuro)
export const cam = {
  fondo: '#0A0F18',
  superficie: '#151C28',
  linea: '#2A3446',
  texto: '#F2F5F9',
  texto2: '#A9B4C4',
  borde: '#4B5565',
  rojo: '#FF6B5E',
  rec: '#D93226',
  verde: '#3DD68C',
  ambar: '#FFB224',
  azul: '#7AB0FF',
  ambarFondo: '#2A2410',
  azulFondo: '#14213A',
  rojoFondo: '#2A1618',
} as const;

export const radio = { control: 12, tarjeta: 16, placa: 6, pastilla: 999 } as const;

export const sombra = {
  tarjeta: '0 1px 2px rgba(14,23,38,.06), 0 0 0 1px rgba(14,23,38,.06)',
  sheet: '0 8px 24px -6px rgba(14,23,38,.14)',
  flotante: '0 8px 24px -6px rgba(14,23,38,.14), 0 0 0 1px rgba(14,23,38,.06)',
  modal: '0 24px 48px -12px rgba(14,23,38,.22)',
} as const;

// Una familia por peso: en RN el peso de una fuente cargada va en el nombre.
export const fuente = {
  display: 'BricolageGrotesque_700Bold',
  ui: 'Geist_400Regular',
  uiMedia: 'Geist_500Medium',
  uiFuerte: 'Geist_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
  monoFuerte: 'JetBrainsMono_700Bold',
} as const;

const num: TextStyle['fontVariant'] = ['tabular-nums'];

export const tipo = {
  display: { fontFamily: fuente.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.64 },
  h1: { fontFamily: fuente.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  h2: { fontFamily: fuente.uiFuerte, fontSize: 20, lineHeight: 28 },
  h3: { fontFamily: fuente.uiFuerte, fontSize: 18, lineHeight: 26 },
  cuerpo: { fontFamily: fuente.ui, fontSize: 16, lineHeight: 24 },
  cuerpoFuerte: { fontFamily: fuente.uiFuerte, fontSize: 16, lineHeight: 24 },
  pequeno: { fontFamily: fuente.ui, fontSize: 14, lineHeight: 20 },
  pequenoFuerte: { fontFamily: fuente.uiFuerte, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fuente.ui, fontSize: 13, lineHeight: 18 },
  captionFuerte: { fontFamily: fuente.uiFuerte, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fuente.monoFuerte, fontVariant: num },
  montoG: { fontFamily: fuente.monoFuerte, fontSize: 40, lineHeight: 44, fontVariant: num },
} satisfies Record<string, TextStyle>;

// Curvas del diseño
export const curva = {
  sheet: [0.32, 0.72, 0, 1],
  entrada: [0.16, 1, 0.3, 1],
} as const;
