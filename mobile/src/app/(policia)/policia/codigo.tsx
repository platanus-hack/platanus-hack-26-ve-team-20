import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CabeceraTinta } from '@/components/auth';
import { Pantalla } from '@/components/extra';
import { Boton, Campo, T, Tarjeta } from '@/components/ui';
import { OFICIAL, institucionValida } from '@/demo/policia';
import { guardarSesion } from '@/lib/dispositivo';
import { color, tipo } from '@/theme';

const soloCodigo = (t: string) => t.toUpperCase().replace(/[^A-Z0-9-]/g, '');

// Primer acceso con Google: se confirma la institución antes de recibir alertas.
export default function CodigoInstitucion() {
  const [placa, setPlaca] = useState(OFICIAL.placaOficial);
  const [inst, setInst] = useState('');
  const [error, setError] = useState(false);

  async function continuar() {
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
      <CabeceraTinta grande marca="SmartTraffic · Policía" titulo="Primer acceso" sub="Confirme su institución para recibir alertas." />
      <View style={{ gap: 16, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 32 }}>
        <Tarjeta style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.suave, alignItems: 'center', justifyContent: 'center' }}>
            <T style={[tipo.mono, { fontSize: 13 }]}>{OFICIAL.iniciales}</T>
          </View>
          <View>
            <T style={tipo.cuerpoFuerte}>{OFICIAL.nombre}</T>
            <T style={[tipo.pequeno, { color: color.texto2 }]}>{OFICIAL.correo}</T>
          </View>
        </Tarjeta>
        <Campo etiqueta="Número de placa de oficial" mono autoCapitalize="characters" value={placa} onChangeText={(t) => setPlaca(soloCodigo(t))} />
        <Campo
          etiqueta="Código de institución"
          mono
          autoCapitalize="characters"
          placeholder="TRANSITO-DEMO"
          value={inst}
          onChangeText={(t) => setInst(soloCodigo(t))}
          error={error ? 'Código de institución inválido. Pídalo a su supervisor.' : null}
          ayuda="Lo entrega su institución. Evita que alguien se registre como policía. En la demo: TRANSITO-DEMO."
        />
        <Boton titulo="Continuar" onPress={continuar} />
      </View>
    </Pantalla>
  );
}
