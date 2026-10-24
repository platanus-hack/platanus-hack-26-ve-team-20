import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { CabeceraMarca, Pasos, Titulo } from '@/components/auth';
import { Pantalla } from '@/components/extra';
import { Boton, PlacaChip } from '@/components/ui';
import { VEHICULOS } from '@/demo/ciudadano';
import { guardarSesion } from '@/lib/dispositivo';
import { useTema } from '@/lib/tema';

export default function Creada() {
  const { c } = useTema();
  return (
    <Pantalla>
      <CabeceraMarca />
      <View style={{ gap: 20, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
        <Pasos paso={3} />
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.tinta, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={34} color={c.lima} strokeWidth={2.5} />
        </View>
        <Titulo titulo="Cuenta creada" sub="Encontramos 2 vehículos a su nombre. Ya puede ver sus multas y pagarlas." />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {VEHICULOS.map((v) => (
            <PlacaChip key={v.placa} placa={v.placa} alto={30} />
          ))}
        </View>
        <Boton
          titulo="Ir al inicio"
          onPress={async () => {
            await guardarSesion('ciudadano');
            router.dismissAll();
            router.replace('/ciudadano');
          }}
        />
      </View>
    </Pantalla>
  );
}
