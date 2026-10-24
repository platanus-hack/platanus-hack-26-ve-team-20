import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { CabeceraTinta, Pasos, Titulo } from '@/components/auth';
import { Pantalla } from '@/components/extra';
import { Boton, Enlace, T } from '@/components/ui';
import { CIUDADANO, confirmarCodigo } from '@/demo/ciudadano';
import { useTema } from '@/lib/tema';
import { estiloInput, fuente, tipo } from '@/theme';

export default function Codigo() {
  const { c } = useTema();
  const [cod, setCod] = useState('');
  const [error, setError] = useState(false);
  const [espera, setEspera] = useState(45);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function verificar() {
    setCargando(true);
    const r = await confirmarCodigo(cod);
    setCargando(false);
    setError(r !== 'ok');
    if (r === 'ok') router.replace('/ciudadano/creada');
  }

  return (
    <Pantalla>
      <CabeceraTinta marca="SmartTraffic" titulo="La multa llega con la prueba, y se paga en un minuto." />
      <View style={{ gap: 20, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
        <Pasos paso={2} />
        <View style={{ gap: 6 }}>
          <Titulo titulo="Revise su WhatsApp" />
          <T style={{ color: c.texto2 }}>
            Enviamos un código de 6 dígitos al <T style={tipo.mono}>{CIUDADANO.telefonoOculto}</T>, el teléfono registrado para{' '}
            <T style={tipo.mono}>{CIUDADANO.cedula}</T>.
          </T>
        </View>
        <View style={{ gap: 6 }}>
          <T style={tipo.pequenoFuerte}>Código</T>
          <TextInput
            accessibilityLabel="Código"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor={c.texto3}
            value={cod}
            onChangeText={(t) => setCod(t.replace(/\D/g, '').slice(0, 6))}
            style={[estiloInput(c), { height: 64, fontFamily: fuente.monoFuerte, fontSize: 32, letterSpacing: 14, textAlign: 'center' }, error ? { borderWidth: 1.5, borderColor: c.rojo } : null]}
          />
          {error ? <T accessibilityRole="alert" style={[tipo.caption, { color: c.rojoTexto }]}>Código inválido. Revise el mensaje e intente de nuevo.</T> : null}
        </View>
        <Boton titulo="Verificar" cargando={cargando} onPress={verificar} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <T style={[tipo.pequeno, { color: c.texto2 }]}>¿No le llegó?</T>
          <Enlace
            titulo={espera > 0 ? `Reenviar en 0:${String(espera).padStart(2, '0')}` : 'Reenviar código'}
            disabled={espera > 0}
            onPress={() => {
              setEspera(45);
              setCod('');
              setError(false);
            }}
          />
        </View>
        <T style={[tipo.caption, { color: c.texto3, textAlign: 'center' }]}>Prototipo: 123456 es válido; 000000 simula un código inválido.</T>
      </View>
    </Pantalla>
  );
}
