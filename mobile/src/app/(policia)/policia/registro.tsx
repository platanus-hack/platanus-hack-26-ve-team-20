import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CabeceraTinta } from '@/components/auth';
import { Pantalla } from '@/components/extra';
import { Boton, Campo, Enlace } from '@/components/ui';
import { OFICIAL, institucionValida } from '@/demo/policia';
import { guardarSesion } from '@/lib/dispositivo';

const soloCodigo = (t: string) => t.toUpperCase().replace(/[^A-Z0-9-]/g, '');

export default function RegistroOficial() {
  const [nombre, setNombre] = useState(OFICIAL.nombre);
  const [placa, setPlaca] = useState(OFICIAL.placaOficial);
  const [correo, setCorreo] = useState(OFICIAL.correo);
  const [clave, setClave] = useState('demo1234');
  const [inst, setInst] = useState('');
  const [error, setError] = useState(false);

  async function crear() {
    if (!institucionValida(inst)) {
      setError(true);
      return;
    }
    await guardarSesion('policia');
    router.dismissAll();
    router.replace('/policia');
  }

  return (
    <Pantalla>
      <CabeceraTinta grande marca="SmartTraffic · Policía" titulo="Registro de oficial" sub="Necesita el código de su institución." />
      <View style={{ gap: 16, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 32 }}>
        <Campo etiqueta="Nombre" autoComplete="name" value={nombre} onChangeText={setNombre} />
        <Campo etiqueta="Número de placa de oficial" mono autoCapitalize="characters" value={placa} onChangeText={(t) => setPlaca(soloCodigo(t))} />
        <Campo etiqueta="Correo" keyboardType="email-address" autoCapitalize="none" value={correo} onChangeText={setCorreo} />
        <Campo etiqueta="Contraseña" clave autoComplete="new-password" value={clave} onChangeText={setClave} />
        <Campo
          etiqueta="Código de institución"
          mono
          autoCapitalize="characters"
          placeholder="TRANSITO-DEMO"
          value={inst}
          onChangeText={(t) => setInst(soloCodigo(t))}
          error={error ? 'Código de institución inválido.' : null}
        />
        <Boton titulo="Crear cuenta" onPress={crear} />
        <Enlace titulo="Ya tengo cuenta" onPress={() => router.back()} style={{ alignSelf: 'center' }} />
      </View>
    </Pantalla>
  );
}
