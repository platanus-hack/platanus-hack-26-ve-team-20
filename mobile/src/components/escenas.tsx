// Ilustraciones vectoriales del diseño (fotograma de evidencia, escena de cámara y mapa de alertas).
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

function Carro({ t, placa, claro }: { t: string; placa: string; claro?: boolean }) {
  return (
    <G transform={t}>
      <Rect x={0} y={22} width={84} height={34} rx={6} fill={claro ? '#9198A2' : '#8C929B'} />
      <Path d="M12 22 L20 4 H64 L72 22 Z" fill={claro ? '#7D848F' : '#6E7682'} />
      <Path d="M19 20 L24.5 8 H59.5 L65 20 Z" fill={claro ? '#3E4652' : '#2E3540'} />
      <Rect x={4} y={30} width={15} height={6} rx={1.5} fill={claro ? '#A8323A' : '#B5363C'} />
      <Rect x={65} y={30} width={15} height={6} rx={1.5} fill={claro ? '#A8323A' : '#B5363C'} />
      <Rect x={26} y={38} width={32} height={12} rx={1.5} fill={claro ? '#FFFFFF' : '#F2F5F9'} stroke="#0E1726" strokeWidth={0.8} />
      <SvgText x={42} y={47} textAnchor="middle" fontFamily="JetBrainsMono_700Bold" fontSize={7} fontWeight="700" fill="#0E1726">
        {placa}
      </SvgText>
      <Rect x={6} y={55} width={14} height={6} rx={2} fill={claro ? '#1E242C' : '#12161D'} />
      <Rect x={64} y={55} width={14} height={6} rx={2} fill={claro ? '#1E242C' : '#12161D'} />
      {claro ? <Rect x={-4} y={0} width={92} height={64} fill="none" stroke="#FFFFFF" strokeWidth={1.2} strokeDasharray="3 2" /> : null}
    </G>
  );
}

export const FRAMES = [
  { t: 'translate(188,100) scale(1)', seg: ':11,9', corta: '1', momento: 'antes' },
  { t: 'translate(180,70) scale(.84)', seg: ':12,3', corta: '2', momento: 'en la línea' },
  { t: 'translate(178,50) scale(.7)', seg: ':12,7', corta: '3', momento: 'después' },
];

export function EscenaEvidencia({ frame, placa, alt }: { frame: number; placa: string; alt: string }) {
  return (
    <Svg viewBox="0 0 320 180" width="100%" style={{ aspectRatio: 16 / 9 }} accessibilityRole="image" accessibilityLabel={alt}>
      <Rect width={320} height={180} fill="#8A929C" />
      <Rect x={0} y={12} width={74} height={46} fill="#7A828D" />
      <Rect x={226} y={4} width={94} height={54} fill="#747C87" />
      <Polygon points="0,58 122,58 0,180" fill="#ABA69C" />
      <Polygon points="198,58 320,58 320,180" fill="#ABA69C" />
      <Polygon points="122,58 198,58 320,180 0,180" fill="#4B525C" />
      <Line x1={160} y1={60} x2={160} y2={180} stroke="#E8E6E0" strokeWidth={2} strokeDasharray="10 9" />
      <Polygon points="66,116 254,116 262,124 58,124" fill="#ECEAE4" />
      <Line x1={40} y1={120} x2={280} y2={120} stroke="#C8281C" strokeWidth={2.5} strokeDasharray="8 5" />
      <Rect x={282} y={10} width={3} height={56} fill="#2B3A55" />
      <Rect x={287} y={8} width={16} height={40} rx={3} fill="#0E1726" />
      <Circle cx={295} cy={16} r={4.5} fill="#C8281C" />
      <Circle cx={295} cy={28} r={4.5} fill="#2A3446" />
      <Circle cx={295} cy={40} r={4.5} fill="#2A3446" />
      <Carro t={FRAMES[frame].t} placa={placa} claro />
    </Svg>
  );
}

// Escena de reposo de la cámara: se ve cuando no hay vista previa real (web o sin permiso).
export function EscenaCamara() {
  return (
    <Svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <Rect width={320} height={180} fill="#5E6670" />
      <Rect x={0} y={12} width={74} height={46} fill="#4F5762" />
      <Rect x={226} y={4} width={94} height={54} fill="#4A525D" />
      <Polygon points="0,58 122,58 0,180" fill="#7B7F86" />
      <Polygon points="198,58 320,58 320,180" fill="#7B7F86" />
      <Polygon points="122,58 198,58 320,180 0,180" fill="#2F353F" />
      <Line x1={160} y1={60} x2={160} y2={180} stroke="#C9CCD1" strokeWidth={2} strokeDasharray="10 9" />
      <Polygon points="66,116 254,116 262,124 58,124" fill="#D5D6D8" />
      <Rect x={282} y={10} width={3} height={56} fill="#1E242C" />
      <Rect x={287} y={8} width={16} height={40} rx={3} fill="#0A0F18" />
      <Circle cx={295} cy={16} r={4.5} fill="#FF6B5E" />
      <Circle cx={295} cy={28} r={4.5} fill="#2A3446" />
      <Circle cx={295} cy={40} r={4.5} fill="#2A3446" />
      <Carro t="translate(182,78) scale(.88)" placa="AB123CD" />
    </Svg>
  );
}

// Mapa esquemático de la zona (no es un mapa real): posición del oficial y alerta activa.
export function MapaAlertas({ alerta, distancia }: { alerta: boolean; distancia: string }) {
  return (
    <Svg
      viewBox="0 0 358 240"
      width="100%"
      style={{ aspectRatio: 358 / 240 }}
      accessibilityRole="image"
      accessibilityLabel={alerta ? `Mapa: su posición y una alerta activa en CAM-001 a ${distancia}` : 'Mapa: su posición y dos cámaras cercanas, sin alertas'}>
      <Rect width={358} height={240} fill="#EEF1F5" />
      <Rect x={16} y={16} width={110} height={70} rx={6} fill="#E3E7ED" />
      <Rect x={180} y={120} width={90} height={70} rx={6} fill="#E3E7ED" />
      <Rect x={290} y={20} width={56} height={60} rx={6} fill="#DFE8DC" />
      <Path d="M0 100 H358" stroke="#FCFDFE" strokeWidth={14} />
      <Path d="M0 200 H358" stroke="#FCFDFE" strokeWidth={8} />
      <Path d="M150 0 V240" stroke="#FCFDFE" strokeWidth={12} />
      <Path d="M280 0 V240" stroke="#FCFDFE" strokeWidth={8} />
      <SvgText x={8} y={94} fontFamily="Geist_400Regular" fontSize={9} fill="#4B5565">
        Av. Demo Norte
      </SvgText>
      <Rect x={143} y={190} width={16} height={16} rx={4} fill="#0E1726" />
      <Rect x={272} y={192} width={16} height={16} rx={4} fill="#0E1726" />
      {alerta ? (
        <G>
          <Line x1={70} y1={190} x2={280} y2={100} stroke="#0E1726" strokeWidth={1.5} strokeDasharray="4 4" />
          <Rect x={152} y={134} width={44} height={18} rx={9} fill="#0E1726" />
          <SvgText x={174} y={147} textAnchor="middle" fontFamily="JetBrainsMono_700Bold" fontSize={10} fontWeight="700" fill="#C6F24E">
            {distancia}
          </SvgText>
          <Circle cx={280} cy={100} r={22} fill="#C8281C" opacity={0.14} />
          <Rect x={266} y={86} width={28} height={28} rx={8} fill="#C8281C" stroke="#FCFDFE" strokeWidth={2.5} />
          <Rect x={273} y={95} width={14} height={10} rx={2} fill="#FCFDFE" />
        </G>
      ) : null}
      <Circle cx={70} cy={190} r={16} fill="#1F5FD1" opacity={0.16} />
      <Circle cx={70} cy={190} r={8} fill="#1F5FD1" stroke="#FCFDFE" strokeWidth={3} />
    </Svg>
  );
}
