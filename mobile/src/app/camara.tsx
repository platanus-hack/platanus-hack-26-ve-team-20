import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { CameraOff, CircleAlert, Settings, WifiOff, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Linking, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { EscenaCamara } from '@/components/escenas';
import { SW, T } from '@/components/ui';
import {
  CAMARA_DEFECTO,
  DURACION_CLIP_MS,
  SinConexionError,
  nuevaClaveEvento,
  sendEvent,
  sincronizarReloj,
  type DetectionRequest,
  type DetectionResult,
} from '@/demo/camara';
import { decimal } from '@/demo/format';
import { CLAVE_CAMARA, CODIGO_CAMARA, URL_API, guardar, leer, vibrar } from '@/lib/dispositivo';
import { cam, fuente, radio } from '@/theme';

type Fase = 'reposo' | 'grabando' | 'subiendo' | 'analizando' | 'resultado' | 'fallo';
const EASE = Easing.bezier(0.32, 0.72, 0, 1);
const PASOS = ['Clip recibido', 'Modelo', 'Regla de línea'];
const ANILLO = 182.2; // 2πr con r = 29
const web = Platform.OS === 'web';

export default function Camara() {
  const rm = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [permiso, pedirPermiso] = useCameraPermissions();

  const [fase, setFase] = useState<Fase>('reposo');
  const [t, setT] = useState(0);
  const [pct, setPct] = useState(0);
  const [paso, setPaso] = useState(0);
  const [resultado, setResultado] = useState<DetectionResult | null>(null);
  const [reloj, setReloj] = useState(true);
  const [offset, setOffset] = useState(0);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  const [sinGPS, setSinGPS] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [cfg, setCfg] = useState({ apiUrl: CAMARA_DEFECTO.apiUrl, clave: '', codigo: CAMARA_DEFECTO.codigo });
  const [numero, setNumero] = useState(0);

  const iv = useRef<ReturnType<typeof setInterval> | null>(null);
  const evento = useRef<DetectionRequest | null>(null);
  const vivo = useRef(true);

  // Orientación horizontal solo en esta pantalla.
  useEffect(() => {
    vivo.current = true;
    if (!web) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      vivo.current = false;
      if (iv.current) clearInterval(iv.current);
      if (!web) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  useEffect(() => {
    (async () => {
      const [url, clave, codigo] = await Promise.all([leer(URL_API), leer(CLAVE_CAMARA), leer(CODIGO_CAMARA)]);
      const c = { apiUrl: url ?? CAMARA_DEFECTO.apiUrl, clave: clave ?? '', codigo: codigo ?? CAMARA_DEFECTO.codigo };
      if (!vivo.current) return;
      setCfg(c);
      const off = await sincronizarReloj(c.apiUrl);
      if (vivo.current) {
        setOffset(off);
        setReloj(false);
      }
    })();
    Location.requestForegroundPermissionsAsync()
      .then(async (r) => {
        if (!r.granted) throw new Error('sin permiso');
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (vivo.current) setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy ?? undefined });
      })
      .catch(() => vivo.current && setSinGPS(true));
  }, []);

  useEffect(() => {
    if (!web && permiso && !permiso.granted && permiso.canAskAgain) pedirPermiso();
  }, [permiso, pedirPermiso]);

  const sinPermiso = !web && !!permiso && !permiso.granted && !permiso.canAskAgain;
  const ocupado = fase === 'subiendo' || fase === 'analizando' || fase === 'fallo';

  // ---- flujo: grabar → subir → analizar → resultado

  const flash = useSharedValue(0);
  const mini = useSharedValue(0); // 0 = pantalla completa, 1 = en la esquina
  const miniOp = useSharedValue(0);

  function grabar() {
    if (iv.current) clearInterval(iv.current);
    vibrar([30]);
    setResultado(null);
    setFase('grabando');
    setT(0);
    setPct(0);
    setPaso(0);
    miniOp.set(0);
    const inicio = Date.now();
    iv.current = setInterval(() => {
      const s = Math.min(4, (Date.now() - inicio) / 1000);
      setT(s);
      if (s >= 4) terminar(inicio, DURACION_CLIP_MS);
    }, 100);
  }

  function terminar(inicio: number, durationMs: number) {
    if (iv.current) clearInterval(iv.current);
    vibrar([20, 60, 20]);
    if (!rm) {
      flash.set(withSequence(withTiming(0.75, { duration: 0 }), withTiming(0, { duration: 120, easing: Easing.linear })));
    }
    mini.set(0);
    miniOp.set(withTiming(1, { duration: rm ? 0 : 120 }));
    setTimeout(() => {
      mini.set(withTiming(1, { duration: rm ? 0 : 300, easing: EASE }));
    }, 60);
    const n = numero + 1;
    setNumero(n);
    // shortcut: el clip no se graba de verdad (recordAsync); la URL es de ejemplo hasta conectar Blob.
    evento.current = {
      cameraCode: cfg.codigo,
      type: 'RED_LIGHT',
      clip: { url: `https://blob.example/clips/${cfg.codigo}-${n}.mp4`, startedAt: new Date(inicio + offset).toISOString(), durationMs },
      clockOffsetMs: offset,
      device: gps ?? { lat: CAMARA_DEFECTO.lat, lng: CAMARA_DEFECTO.lng },
      idempotencyKey: nuevaClaveEvento(n),
    };
    subir(0);
  }

  async function subir(desde: number) {
    if (!evento.current) return;
    setFase('subiendo');
    setPct(desde);
    try {
      const r = await sendEvent(evento.current, { apiUrl: cfg.apiUrl, cameraKey: cfg.clave, onProgress: (p) => vivo.current && setPct(p) }, desde);
      if (vivo.current) analizar(r);
    } catch (e) {
      if (!vivo.current) return;
      setPct(e instanceof SinConexionError ? e.pct : desde);
      setFase('fallo');
    }
  }

  function analizar(r: DetectionResult) {
    setFase('analizando');
    setPaso(0);
    let p = 0;
    iv.current = setInterval(() => {
      p += 1;
      setPaso(p);
      if (p >= 3) {
        if (iv.current) clearInterval(iv.current);
        setTimeout(() => {
          if (!vivo.current) return;
          vibrar([40]);
          setResultado(r);
          setFase('resultado');
          miniOp.set(withTiming(0, { duration: rm ? 0 : 120 }));
        }, 300);
      }
    }, 700);
  }

  function accion() {
    if (fase === 'grabando') terminar(Date.now() - t * 1000, Math.round(t * 1000));
    else if (!ocupado) grabar();
  }

  async function guardarAjustes() {
    await Promise.all([guardar(URL_API, cfg.apiUrl.trim()), guardar(CLAVE_CAMARA, cfg.clave), guardar(CODIGO_CAMARA, cfg.codigo)]);
    setAjustes(false);
  }

  // ---- estilos animados

  const panelP = useSharedValue(0);
  const resP = useSharedValue(0);
  const ajP = useSharedValue(0);
  useEffect(() => {
    panelP.set(withTiming(ocupado ? 1 : 0, { duration: rm ? 120 : 280, easing: EASE }));
  }, [ocupado, rm, panelP]);
  useEffect(() => {
    resP.set(withTiming(fase === 'resultado' ? 1 : 0, { duration: rm ? 120 : 280, easing: EASE }));
  }, [fase, rm, resP]);
  useEffect(() => {
    ajP.set(withTiming(ajustes ? 1 : 0, { duration: rm ? 120 : 280, easing: EASE }));
  }, [ajustes, rm, ajP]);

  const panelEst = useAnimatedStyle(() => ({ opacity: panelP.get(), transform: [{ translateY: (1 - panelP.get()) * 220 }] }));
  const resEst = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - resP.get()) * 460 }] }));
  const ajEst = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - ajP.get()) * 400 }] }));
  const veloEst = useAnimatedStyle(() => ({ opacity: ajP.get() * 0.6 }));
  const flashEst = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const miniEst = useAnimatedStyle(() => ({
    opacity: miniOp.get(),
    transform: [{ translateX: mini.get() * 16 }, { translateY: mini.get() * 156 }, { scale: 1 - mini.get() * 0.85 }],
  }));

  const estado = {
    reposo: ['Listo', cam.verde],
    grabando: ['REC', cam.rec],
    subiendo: ['Enviando', cam.azul],
    analizando: ['Analizando', cam.ambar],
    resultado: ['Resultado', cam.texto],
    fallo: ['Sin conexión', cam.rojo],
  }[fase];
  const grab = fase === 'grabando';
  const tam = grab ? 64 : 88;
  const evtTxt = `Evento ${String(numero).padStart(4, '0')}`;
  const izq = 16 + insets.left;
  const panelW = Math.min(500, width - 156 - 140 - insets.left - insets.right);

  return (
    <View style={s.raiz}>
      <StatusBar hidden />
      <View style={StyleSheet.absoluteFill}>{!web && permiso?.granted ? <CameraView style={{ flex: 1 }} facing="back" /> : <EscenaCamara />}</View>

      <View style={[s.placa, { left: izq, top: 16 }]}>
        <T style={{ fontFamily: fuente.monoFuerte, fontSize: 18, lineHeight: 22, color: cam.texto }}>{cfg.codigo}</T>
        <T style={{ fontFamily: fuente.ui, fontSize: 13, lineHeight: 18, color: cam.texto2 }}>{CAMARA_DEFECTO.interseccion}</T>
      </View>
      <View style={{ position: 'absolute', left: izq, top: 84, gap: 6 }}>
        {sinGPS ? <ChipCam texto={`Sin GPS · ubicación de ${CAMARA_DEFECTO.codigo}`} bg={cam.ambarFondo} fg={cam.ambar} punto={cam.ambar} /> : <ChipCam texto={gps?.accuracyM ? `GPS ±${Math.round(gps.accuracyM)} m` : 'GPS…'} bg={cam.superficie} fg={cam.texto} punto={gps ? cam.verde : cam.texto2} />}
        {reloj ? <ChipCam texto="Sincronizando reloj…" bg={cam.azulFondo} fg={cam.azul} punto={cam.azul} /> : <ChipCam texto="Reloj sincronizado" bg={cam.superficie} fg={cam.texto} punto={cam.verde} />}
      </View>

      <View accessibilityLiveRegion="polite" style={[s.estado, { right: 136 + insets.right }]}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: estado[1] }} />
        <T style={{ fontFamily: fuente.uiFuerte, fontSize: 18, letterSpacing: 0.7, color: cam.texto }}>{estado[0]}</T>
        {grab ? <T style={{ fontFamily: fuente.monoFuerte, fontSize: 18, fontVariant: ['tabular-nums'], color: cam.texto }}>{decimal(t, 1)} / 4,0 s</T> : null}
      </View>

      <View style={[s.columna, { right: 12 + insets.right }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Ajustes de la cámara" onPress={() => setAjustes(true)} style={s.botonAjustes}>
          <Settings size={22} color={cam.texto} strokeWidth={SW} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={grab ? 'Detener grabación' : fase === 'resultado' ? 'Grabar otro evento' : 'Grabar evento'}
          accessibilityState={{ disabled: ocupado }}
          disabled={ocupado}
          onPress={accion}
          style={[s.rec, { width: tam, height: tam, opacity: ocupado ? 0.6 : 1 }]}>
          {grab ? (
            <Svg viewBox="0 0 64 64" width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Circle cx={32} cy={32} r={29} fill="none" stroke={cam.linea} strokeWidth={4} />
              <Circle cx={32} cy={32} r={29} fill="none" stroke={cam.rojo} strokeWidth={4} strokeLinecap="round" transform="rotate(-90 32 32)" strokeDasharray={ANILLO} strokeDashoffset={ANILLO * (1 - t / 4)} />
            </Svg>
          ) : null}
          <View style={grab ? [s.nucleo, { width: 24, height: 24, borderRadius: 6 }] : [s.nucleo, { backgroundColor: ocupado ? '#4B5565' : cam.rec }]} />
        </Pressable>
        <View style={s.etiqueta}>
          <T style={{ fontFamily: fuente.uiFuerte, fontSize: 13, lineHeight: 18, color: cam.texto, textAlign: 'center' }}>{grab ? 'Detener' : ocupado ? 'En espera' : 'Grabar evento'}</T>
        </View>
      </View>

      <Animated.View pointerEvents="none" style={[s.mini, miniEst]}>
        <EscenaCamara />
      </Animated.View>

      <Animated.View pointerEvents={ocupado ? 'auto' : 'none'} style={[s.panel, { left: 156 + insets.left, width: panelW }, panelEst]}>
        {fase === 'subiendo' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
              <T style={{ fontFamily: fuente.uiFuerte, fontSize: 22, color: cam.texto }}>Subiendo clip</T>
              <T style={{ marginLeft: 'auto', fontFamily: fuente.monoFuerte, fontSize: 28, fontVariant: ['tabular-nums'], color: cam.texto }}>{pct} %</T>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} accessibilityLabel="Subida del clip" style={s.barra}>
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: cam.azul, borderRadius: 999 }} />
            </View>
            <T style={{ fontFamily: fuente.ui, fontSize: 13, lineHeight: 18, color: cam.texto2 }}>
              {evtTxt} · {decimal((evento.current?.clip.durationMs ?? DURACION_CLIP_MS) / 1000, 1)} s · si falla se reintenta el mismo evento
            </T>
          </>
        ) : null}
        {fase === 'analizando' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
              <T style={{ fontFamily: fuente.uiFuerte, fontSize: 22, color: cam.texto }}>Analizando…</T>
              <T style={{ marginLeft: 'auto', fontFamily: fuente.ui, fontSize: 13, color: cam.texto2 }}>hasta 30 s</T>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {PASOS.map((n, i) => {
                const hecho = i < paso;
                const actual = i === paso;
                return (
                  <View key={n} style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[s.punto, hecho ? { backgroundColor: cam.verde, borderWidth: 0 } : actual ? { borderWidth: 2, borderColor: cam.texto } : null]}>
                        {actual ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cam.texto }} /> : null}
                      </View>
                      <View style={{ flex: 1, height: 3, backgroundColor: cam.linea }}>
                        {hecho && i < 2 ? <View style={{ flex: 1, backgroundColor: cam.verde }} /> : null}
                      </View>
                    </View>
                    <T style={{ fontFamily: actual ? fuente.uiFuerte : fuente.ui, fontSize: 13, lineHeight: 18, color: actual ? cam.texto : cam.texto2 }}>{actual ? `${n}…` : n}</T>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
        {fase === 'fallo' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.icoFallo}>
                <WifiOff size={18} color={cam.rojo} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fuente.uiFuerte, fontSize: 18, lineHeight: 24, color: cam.texto }}>No se pudo subir el clip</T>
                <T style={{ fontFamily: fuente.ui, fontSize: 13, lineHeight: 18, color: cam.texto2 }}>Sin conexión a la API · se guardó el {evtTxt.toLowerCase()} en el teléfono</T>
              </View>
            </View>
            <BotonLima titulo="Reintentar el mismo evento" onPress={() => subir(pct)} />
          </>
        ) : null}
      </Animated.View>

      <Animated.View pointerEvents={fase === 'resultado' ? 'auto' : 'none'} accessibilityLiveRegion="polite" accessibilityLabel="Último resultado" style={[s.resultado, { paddingRight: 20 + insets.right, width: 440 + insets.right }, resEst]}>
        {resultado ? <Resultado r={resultado} onOtro={grabar} /> : null}
      </Animated.View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: cam.texto }, flashEst]} />

      {sinPermiso ? (
        <View accessibilityRole="alert" style={s.permiso}>
          <View style={s.icoPermiso}>
            <CameraOff size={44} color={cam.rojo} strokeWidth={SW} />
          </View>
          <View style={{ gap: 12, maxWidth: 460, flexShrink: 1 }}>
            <T accessibilityRole="header" style={{ fontFamily: fuente.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.56, color: cam.texto }}>
              Necesitamos la cámara y la ubicación
            </T>
            <T style={{ color: cam.texto2 }}>Sin la cámara no se pueden grabar eventos. La ubicación confirma la intersección; sin ella usamos la de CAM-001.</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <BotonLima titulo="Abrir ajustes del teléfono" onPress={() => Linking.openSettings().catch(() => {})} />
              <Pressable accessibilityRole="button" onPress={() => pedirPermiso()} style={[s.botonLima, { backgroundColor: cam.superficie, borderWidth: 1, borderColor: cam.borde }]}>
                <T style={{ fontFamily: fuente.uiFuerte, color: cam.texto }}>Reintentar</T>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <Animated.View pointerEvents={ajustes ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: cam.fondo }, veloEst]}>
        <Pressable accessibilityLabel="Cerrar ajustes" style={{ flex: 1 }} onPress={() => setAjustes(false)} />
      </Animated.View>
      <Animated.View pointerEvents={ajustes ? 'auto' : 'none'} accessibilityViewIsModal style={[s.ajustes, { paddingRight: 20 + insets.right, width: 380 + insets.right }, ajEst]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T accessibilityRole="header" style={{ fontFamily: fuente.uiFuerte, fontSize: 22, lineHeight: 28, color: cam.texto }}>
            Ajustes de cámara
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ajustes" onPress={() => setAjustes(false)} style={{ marginLeft: 'auto', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color={cam.texto} strokeWidth={SW} />
          </Pressable>
        </View>
        <CampoCam etiqueta="URL de la API" value={cfg.apiUrl} onChangeText={(v) => setCfg({ ...cfg, apiUrl: v })} keyboardType="url" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <CampoCam etiqueta="Clave de cámara" value={cfg.clave} onChangeText={(v) => setCfg({ ...cfg, clave: v })} secureTextEntry />
          </View>
          <View style={{ width: 120 }}>
            <CampoCam etiqueta="Código" value={cfg.codigo} onChangeText={(v) => setCfg({ ...cfg, codigo: v.toUpperCase() })} fuerte />
          </View>
        </View>
        <BotonLima titulo="Guardar" onPress={guardarAjustes} />
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: 44, alignSelf: 'center', justifyContent: 'center' }}>
          <T style={{ fontFamily: fuente.uiFuerte, fontSize: 14, color: cam.texto2 }}>Salir del modo cámara</T>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Resultado({ r, onOtro }: { r: DetectionResult; onOtro: () => void }) {
  const veredicto = r.verdict === 'VIOLATION' ? 'INFRACCIÓN' : r.verdict === 'NEEDS_REVIEW' ? 'REVISIÓN' : 'SIN INFRACCIÓN';
  const luz = { RED: ['ROJO', cam.rojo], YELLOW: ['AMARILLO', cam.ambar], GREEN: ['VERDE', cam.verde], UNKNOWN: ['—', cam.texto2] }[r.crossing.lightState];
  const rel = { WITH_FLOW: 'a favor del flujo', AGAINST_FLOW: 'contravía', UNKNOWN: 'sin dato' }[r.motion.relation];
  const etq = { fontFamily: fuente.ui, fontSize: 13, lineHeight: 18, color: cam.texto2 } as const;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[s.veredicto, { backgroundColor: r.verdict === 'VIOLATION' ? cam.rec : cam.superficie }]}>
          <CircleAlert size={18} color={cam.texto} strokeWidth={2.25} />
          <T style={{ fontFamily: fuente.uiFuerte, fontSize: 20, letterSpacing: 0.8, color: cam.texto }}>{veredicto}</T>
        </View>
        {r.plate ? (
          <View accessibilityLabel={`Placa ${r.plate}`} style={s.placaRes}>
            <T style={{ fontFamily: fuente.uiFuerte, fontSize: 8, lineHeight: 9, letterSpacing: 1.9, color: '#0E1726' }}>VENEZUELA</T>
            <T style={{ fontFamily: fuente.monoFuerte, fontSize: 22, lineHeight: 26, letterSpacing: 1.8, color: '#0E1726' }}>{r.plate}</T>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
        <View style={{ width: '50%', paddingRight: 16 }}>
          <T style={etq}>Luz en el cruce</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: luz[1] }} />
            <T style={{ fontFamily: fuente.uiFuerte, fontSize: 18, lineHeight: 26, color: cam.texto }}>{luz[0]}</T>
          </View>
        </View>
        <View style={{ width: '50%', gap: 6 }}>
          <T style={etq}>
            Confianza <T style={{ fontFamily: fuente.monoFuerte, fontSize: 13, color: cam.texto }}>{decimal(r.confidence)}</T>
          </T>
          <View style={{ height: 8, backgroundColor: cam.linea, borderRadius: 999, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(r.confidence * 100)}%`, height: '100%', backgroundColor: cam.verde, borderRadius: 999 }} />
          </View>
        </View>
        <View style={{ width: '50%', paddingRight: 16 }}>
          <T style={etq}>Velocidad estimada</T>
          <T style={{ fontFamily: fuente.monoFuerte, fontSize: 18, lineHeight: 26, color: cam.texto }}>{r.motion.speedKmh != null ? `${r.motion.speedKmh} km/h` : '—'}</T>
        </View>
        <View style={{ width: '50%' }}>
          <T style={etq}>Carril · dirección</T>
          <T style={{ fontFamily: fuente.uiFuerte, fontSize: 15, lineHeight: 26, color: cam.texto }}>
            {r.motion.laneId ?? '—'} · {rel}
          </T>
        </View>
      </View>
      <View style={[s.chipAviso]}>
        <T style={{ fontFamily: fuente.uiFuerte, fontSize: 12, color: cam.ambar }}>estimación, no sancionatoria, sin validar</T>
      </View>
      <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T style={{ fontFamily: fuente.monoFuerte, fontSize: 13, color: cam.texto2 }}>Latencia {decimal(r.latencyMs / 1000, 1)} s</T>
        <BotonLima titulo="Grabar otro" onPress={onOtro} style={{ marginLeft: 'auto' }} />
      </View>
    </>
  );
}

function ChipCam({ texto, bg, fg, punto }: { texto: string; bg: string; fg: string; punto: string }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: punto }} />
      <T style={{ fontFamily: fuente.uiFuerte, fontSize: 12, color: fg }}>{texto}</T>
    </View>
  );
}

function BotonLima({ titulo, onPress, style }: { titulo: string; onPress: () => void; style?: object }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.botonLima, style]}>
      <T style={{ fontFamily: fuente.uiFuerte, color: '#0E1726' }}>{titulo}</T>
    </Pressable>
  );
}

function CampoCam({ etiqueta, fuerte, ...input }: ComponentProps<typeof TextInput> & { etiqueta: string; fuerte?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <T style={{ fontFamily: fuente.uiFuerte, fontSize: 13, color: cam.texto2 }}>{etiqueta}</T>
      <TextInput accessibilityLabel={etiqueta} autoCapitalize="none" autoCorrect={false} placeholderTextColor={cam.texto2} {...input} style={[s.campo, { fontFamily: fuerte ? fuente.monoFuerte : fuente.mono }]} />
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cam.fondo, overflow: 'hidden' },
  placa: { position: 'absolute', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: cam.superficie, borderRadius: radio.control },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999 },
  estado: { position: 'absolute', top: 16, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, backgroundColor: cam.superficie, borderRadius: radio.control },
  columna: { position: 'absolute', top: 0, bottom: 0, width: 112, alignItems: 'center', justifyContent: 'center', gap: 10 },
  botonAjustes: { position: 'absolute', top: 16, width: 44, height: 44, borderRadius: radio.control, backgroundColor: cam.superficie, alignItems: 'center', justifyContent: 'center' },
  rec: { borderRadius: 999, backgroundColor: cam.texto, alignItems: 'center', justifyContent: 'center' },
  nucleo: { width: 64, height: 64, borderRadius: 32, backgroundColor: cam.rec },
  etiqueta: { paddingVertical: 2, paddingHorizontal: 10, backgroundColor: cam.superficie, borderRadius: 999 },
  mini: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: cam.texto, transformOrigin: 'left top' },
  panel: { position: 'absolute', bottom: 16, gap: 12, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: cam.superficie, borderRadius: radio.tarjeta },
  barra: { height: 10, backgroundColor: cam.linea, borderRadius: 999, overflow: 'hidden' },
  punto: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: cam.borde, backgroundColor: cam.fondo, alignItems: 'center', justifyContent: 'center' },
  icoFallo: { width: 36, height: 36, borderRadius: 10, backgroundColor: cam.rojoFondo, alignItems: 'center', justifyContent: 'center' },
  resultado: { position: 'absolute', top: 0, right: 0, bottom: 0, gap: 12, paddingVertical: 16, paddingLeft: 20, backgroundColor: cam.superficie },
  veredicto: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: radio.control },
  placaRes: { alignItems: 'center', paddingTop: 3, paddingBottom: 5, paddingHorizontal: 12, backgroundColor: cam.texto, borderWidth: 2, borderColor: cam.texto, borderRadius: radio.placa },
  chipAviso: { alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: cam.ambarFondo, justifyContent: 'center' },
  permiso: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: cam.fondo, flexDirection: 'row', alignItems: 'center', gap: 32, paddingVertical: 32, paddingHorizontal: 48 },
  icoPermiso: { width: 96, height: 96, borderRadius: 24, backgroundColor: cam.superficie, alignItems: 'center', justifyContent: 'center' },
  ajustes: { position: 'absolute', top: 0, right: 0, bottom: 0, gap: 12, paddingVertical: 16, paddingLeft: 20, backgroundColor: cam.superficie, boxShadow: '0 8px 24px -6px rgba(0,0,0,.5)' },
  campo: { height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: cam.borde, borderRadius: radio.control, backgroundColor: cam.fondo, color: cam.texto, fontSize: 16 },
  botonLima: { height: 48, paddingHorizontal: 18, borderRadius: radio.control, backgroundColor: '#C6F24E', alignItems: 'center', justifyContent: 'center' },
});
