import { router } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CabeceraTinta, Titulo } from '@/components/auth';
import { Hoja, Pantalla } from '@/components/extra';
import { Boton, Campo, Enlace, SW, T, TipoCedula } from '@/components/ui';
import { entrar } from '@/demo/ciudadano';
import { CLAVE_CAMARA, guardar, guardarSesion } from '@/lib/dispositivo';
import { useTema } from '@/lib/tema';
import { tipo } from '@/theme';

export default function LoginCiudadano() {
  const { c } = useTema();
  const [tipoCed, setTipoCed] = useState<'V' | 'E'>('V');
  const [ced, setCed] = useState('99000001');
  const [clave, setClave] = useState('demo1234');
  const [error, setError] = useState(false);
  const [olvido, setOlvido] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [claveCamara, setClaveCamara] = useState('');

  async function onEntrar() {
    setCargando(true);
    const ok = await entrar(ced, clave);
    setCargando(false);
    setError(!ok);
    if (!ok) return;
    await guardarSesion('ciudadano');
    router.replace('/ciudadano');
  }

  async function abrirCamara() {
    await guardar(CLAVE_CAMARA, claveCamara);
    setHoja(false);
    setClaveCamara('');
    router.push('/camara');
  }

  return (
    <Pantalla>
      <CabeceraTinta marca="SmartTraffic" titulo="La multa llega con la prueba, y se paga en un minuto." />
      <View style={{ flexGrow: 1, gap: 20, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 24 }}>
        <Titulo titulo="Entrar" sub="Use su cédula y su contraseña." />
        <Campo
          etiqueta="Cédula"
          mono
          keyboardType="number-pad"
          autoComplete="username"
          value={ced}
          onChangeText={(t) => setCed(t.replace(/\D/g, '').slice(0, 9))}
          extra={<TipoCedula valor={tipoCed} onCambio={setTipoCed} />}
        />
        <View>
          <Campo
            etiqueta="Contraseña"
            clave
            autoComplete="current-password"
            value={clave}
            onChangeText={setClave}
            error={error ? 'Cédula o contraseña incorrectas. Le quedan 2 intentos.' : null}
          />
          <Enlace titulo="¿Olvidó su contraseña?" onPress={() => setOlvido(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
          {olvido ? <T style={[tipo.caption, { color: c.texto2 }]}>Prototipo: entre con cualquier contraseña de 8 caracteres o más.</T> : null}
        </View>
        <Boton titulo="Entrar" cargando={cargando} onPress={onEntrar} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <T style={[tipo.pequeno, { color: c.texto2 }]}>¿No tiene cuenta?</T>
          <Enlace titulo="Crear cuenta" onPress={() => router.push('/ciudadano/registro')} />
        </View>
        {/* Acceso del operador: el teléfono hace de cámara de tránsito en la demo. */}
        <Pressable accessibilityRole="button" onPress={() => setHoja(true)} style={{ marginTop: 'auto', alignSelf: 'center', minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Camera size={16} color={c.texto2} strokeWidth={SW} />
          <T style={[tipo.pequeno, { fontFamily: 'Geist_500Medium', color: c.texto2 }]}>Modo cámara (operador)</T>
        </Pressable>
      </View>

      <Hoja abierta={hoja} onCerrar={() => setHoja(false)} etiqueta="Modo cámara">
        <T accessibilityRole="header" style={{ fontFamily: 'Geist_600SemiBold', fontSize: 24, lineHeight: 30 }}>
          Modo cámara
        </T>
        <T style={{ color: c.texto2 }}>Solo para el operador del equipo. Escriba la clave de cámara.</T>
        <Campo etiqueta="Clave de cámara" clave mono value={claveCamara} onChangeText={setClaveCamara} placeholder="Al menos 6 caracteres" autoCapitalize="none" />
        <Boton titulo="Abrir cámara" disabled={claveCamara.length < 6} onPress={abrirCamara} />
      </Hoja>
    </Pantalla>
  );
}
