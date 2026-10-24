import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { CabeceraTinta, Pasos, Titulo } from '@/components/auth';
import { Pantalla } from '@/components/extra';
import { Aviso, Boton, Campo, Enlace, SW, T, TipoCedula } from '@/components/ui';
import { enviarCodigo, type ErrorRegistro } from '@/demo/ciudadano';
import { color, tipo } from '@/theme';

export default function Registro() {
  const [tipoCed, setTipoCed] = useState<'V' | 'E'>('V');
  const [ced, setCed] = useState('99000001');
  const [tel, setTel] = useState('04120000001');
  const [correo, setCorreo] = useState('');
  const [c1, setC1] = useState('demo1234');
  const [c2, setC2] = useState('demo1234');
  const [error, setError] = useState<ErrorRegistro | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    setCargando(true);
    const e = await enviarCodigo({ ced, tel, c1, c2 });
    setCargando(false);
    setError(e);
    if (!e) router.push('/ciudadano/codigo');
  }

  // Registro se abre desde login: volver evita apilar otro login.
  const irAEntrar = () => (router.canGoBack() ? router.back() : router.replace('/ciudadano/login'));

  const claveMal = error === 'claveCorta' ? 'La contraseña debe tener al menos 8 caracteres.' : error === 'noCoinciden' ? 'Las contraseñas no coinciden.' : null;

  return (
    <Pantalla>
      <CabeceraTinta marca="SmartTraffic" titulo="La multa llega con la prueba, y se paga en un minuto." />
      <View style={{ gap: 20, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
        <Pasos paso={1} />
        <Titulo titulo="Crear cuenta" sub="Vea y pague sus multas con su cédula." />
        {error === 'yaRegistrada' ? (
          <Aviso tono="rojo">
            <View style={{ gap: 4 }}>
              <T style={[tipo.pequenoFuerte, { color: color.rojoTexto }]}>Esta cédula ya tiene una cuenta.</T>
              <T style={[tipo.pequeno, { color: color.rojoTexto }]}>Entre con su contraseña o recupérela desde «¿Olvidó su contraseña?».</T>
              <Enlace titulo="Ir a Entrar" colorTexto={color.rojoTexto} onPress={irAEntrar} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            </View>
          </Aviso>
        ) : null}
        <Campo
          etiqueta="Cédula"
          mono
          keyboardType="number-pad"
          value={ced}
          onChangeText={(t) => setCed(t.replace(/\D/g, '').slice(0, 9))}
          error={error === 'yaRegistrada' ? ' ' : null}
          extra={<TipoCedula valor={tipoCed} onCambio={setTipoCed} />}
        />
        <Campo
          etiqueta="Teléfono"
          mono
          keyboardType="phone-pad"
          autoComplete="tel"
          value={tel}
          onChangeText={setTel}
          error={error === 'telefono' ? 'Use 0412, 0414, 0416, 0424 o 0426 y 7 dígitos.' : null}
        />
        <Campo
          etiqueta={
            <T style={tipo.pequenoFuerte}>
              Correo <T style={[tipo.pequeno, { color: color.texto2 }]}>(opcional)</T>
            </T>
          }
          accessibilityLabel="Correo (opcional)"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="usted@correo.com"
          value={correo}
          onChangeText={setCorreo}
        />
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Contraseña" secureTextEntry autoComplete="new-password" value={c1} onChangeText={setC1} error={claveMal ? ' ' : null} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Confirmar" secureTextEntry autoComplete="new-password" value={c2} onChangeText={setC2} error={claveMal ? ' ' : null} />
            </View>
          </View>
          {claveMal ? <T style={[tipo.caption, { color: color.rojoTexto }]}>{claveMal}</T> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MessageCircle size={16} color={color.texto2} strokeWidth={SW} style={{ marginTop: 1 }} />
          <T style={[tipo.caption, { flex: 1, color: color.texto2 }]}>
            El código llega por WhatsApp al teléfono que el sistema tiene registrado para su cédula, para que nadie abra una cuenta a su nombre.
          </T>
        </View>
        <Boton titulo="Enviar código por WhatsApp" cargando={cargando} onPress={enviar} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <T style={[tipo.pequeno, { color: color.texto2 }]}>¿Ya tiene cuenta?</T>
          <Enlace titulo="Entrar" onPress={irAEntrar} />
        </View>
      </View>
    </Pantalla>
  );
}
