import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CabeceraTinta, Titulo } from '@/components/auth';
import { Pantalla } from '@/components/extra';
import { Boton, Campo, Enlace, T, TipoCedula } from '@/components/ui';
import { entrar } from '@/demo/ciudadano';
import { guardarSesion } from '@/lib/dispositivo';
import { color, tipo } from '@/theme';

export default function LoginCiudadano() {
  const [tipoCed, setTipoCed] = useState<'V' | 'E'>('V');
  const [ced, setCed] = useState('99000001');
  const [clave, setClave] = useState('demo1234');
  const [error, setError] = useState(false);
  const [olvido, setOlvido] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function onEntrar() {
    setCargando(true);
    const ok = await entrar(ced, clave);
    setCargando(false);
    setError(!ok);
    if (!ok) return;
    await guardarSesion('ciudadano');
    router.replace('/ciudadano');
  }

  return (
    <Pantalla>
      <CabeceraTinta marca="SmartTraffic" titulo="La multa llega con la prueba, y se paga en un minuto." />
      <View style={{ gap: 20, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
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
          {olvido ? <T style={[tipo.caption, { color: color.texto2 }]}>Prototipo: entre con cualquier contraseña de 8 caracteres o más.</T> : null}
        </View>
        <Boton titulo="Entrar" cargando={cargando} onPress={onEntrar} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <T style={[tipo.pequeno, { color: color.texto2 }]}>¿No tiene cuenta?</T>
          <Enlace titulo="Crear cuenta" onPress={() => router.push('/ciudadano/registro')} />
        </View>
      </View>
    </Pantalla>
  );
}
