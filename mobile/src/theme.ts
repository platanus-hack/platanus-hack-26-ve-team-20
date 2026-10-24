// Tokens de "Asfalto y Señal" (Dirección C). El lima vive solo sobre tinta.
import type { TextStyle } from 'react-native';

export const temaClaro = {
  fondo: '#F3F5F8',
  tarjeta: '#FCFDFE',
  suave: '#EEF1F5',
  // Superficies de tinta (cabeceras, botón principal, pastillas). También es la tinta sobre lima y ámbar.
  tinta: '#0E1726',
  tinta2: '#151C28',
  tinta3: '#2A3446',
  tintaBorde: '#0E1726',
  tintaTexto: '#FCFDFE',
  texto: '#0E1726',
  texto2: '#4B5565',
  texto3: '#636D82',
  sobreTinta: '#A9B4C4',
  sobreAcento: '#FCFDFE',
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
  velo: 'rgba(14,23,38,.4)',
  // Acción principal: tinta en claro, lima en oscuro. El rojo queda para estados.
  primario: '#0E1726',
  sobrePrimario: '#FCFDFE',
  boliOn: '#C6F24E',
};

export type Colores = typeof temaClaro;

// Grafito neutro: grises sin tinte, superficies separadas por tono, lima solo como acento.
export const temaOscuro: Colores = {
  fondo: '#0B0C0E',
  tarjeta: '#16181C',
  suave: '#1F2228',
  tinta: '#16181C',
  tinta2: '#1F2228',
  tinta3: '#2A2E35',
  tintaBorde: '#26292F',
  tintaTexto: '#F4F5F7',
  texto: '#F4F5F7',
  texto2: '#A1A7B3',
  texto3: '#8B919C',
  sobreTinta: '#A1A7B3',
  sobreAcento: '#0B0C0E',
  lima: '#C6F24E',
  borde: '#26292F',
  bordeInput: '#717783',
  rojo: '#F2706B',
  rojoHover: '#F58C88',
  rojoTexto: '#FF9A94',
  rojoFondo: '#2A1716',
  verde: '#4CC38A',
  verdeTexto: '#6FD9A3',
  verdeFondo: '#10241A',
  ambar: '#F5B544',
  ambarTexto: '#F8CB75',
  ambarFondo: '#2A2212',
  azul: '#7FAEFF',
  azulTexto: '#A3C4FF',
  azulFondo: '#15203A',
  grisFondo: '#1F2228',
  velo: 'rgba(0,0,0,.6)',
  primario: '#C6F24E',
  sobrePrimario: '#0E1726',
  boliOn: '#0E1726',
};

// Compatibilidad: los tokens claros. Las pantallas usan `useTema()` para cambiar en caliente.
export const color = temaClaro;

export type ModoTema = 'claro' | 'oscuro' | 'sistema';
export type Esquema = 'claro' | 'oscuro';

export const esquemaDe = (modo: ModoTema, sistema: 'light' | 'dark' | null | undefined): Esquema =>
  modo === 'sistema' ? (sistema === 'dark' ? 'oscuro' : 'claro') : modo;

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

export type Sombras = Record<keyof typeof sombra, string>;

// En oscuro la sombra no se ve: un filo blanco al 5 % separa la superficie.
export const sombraOscura: Sombras = {
  tarjeta: '0 0 0 1px rgba(255,255,255,.05)',
  sheet: '0 -1px 0 rgba(255,255,255,.06), 0 8px 24px -6px rgba(0,0,0,.6)',
  flotante: '0 0 0 1px rgba(255,255,255,.06), 0 12px 28px -8px rgba(0,0,0,.7)',
  modal: '0 0 0 1px rgba(255,255,255,.06), 0 24px 48px -12px rgba(0,0,0,.75)',
};

export const estiloInput = (c: Colores): TextStyle => ({
  height: 48,
  paddingHorizontal: 14,
  borderWidth: 1,
  borderColor: c.bordeInput,
  borderRadius: radio.control,
  backgroundColor: c.tarjeta,
  fontSize: 16,
  color: c.texto,
});

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
