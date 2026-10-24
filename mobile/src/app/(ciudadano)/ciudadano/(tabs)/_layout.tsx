import { Tabs } from 'expo-router/js-tabs';
import { Car, House, ReceiptText, User } from 'lucide-react-native';

import { BarraTabs, type ItemTab } from '@/components/extra';
import { color } from '@/theme';

const ITEMS: ItemTab[] = [
  { name: 'index', label: 'Inicio', icono: House },
  { name: 'multas', label: 'Multas', icono: ReceiptText },
  { name: 'vehiculos', label: 'Vehículos', icono: Car },
  { name: 'perfil', label: 'Perfil', icono: User },
];

export default function TabsCiudadano() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.fondo } }} tabBar={(p) => <BarraTabs {...p} items={ITEMS} />}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="multas" options={{ title: 'Multas' }} />
      <Tabs.Screen name="vehiculos" options={{ title: 'Vehículos' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
