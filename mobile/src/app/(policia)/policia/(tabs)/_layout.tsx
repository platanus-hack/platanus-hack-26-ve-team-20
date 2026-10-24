import { Tabs } from 'expo-router/js-tabs';
import { Bell, Search, User } from 'lucide-react-native';

import { BarraTabs } from '@/components/extra';
import { useOficial } from '@/demo/policia';
import { useTema } from '@/lib/tema';

export default function TabsPolicia() {
  const { c } = useTema();
  const { alerta, servicio } = useOficial();
  const items = [
    { name: 'index', label: 'Alertas', icono: Bell, punto: alerta === 'activa' && servicio },
    { name: 'consultar', label: 'Consultar', icono: Search },
    { name: 'perfil', label: 'Perfil', icono: User },
  ];
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.fondo } }} tabBar={(p) => <BarraTabs {...p} items={items} />}>
      <Tabs.Screen name="index" options={{ title: 'Alertas' }} />
      <Tabs.Screen name="consultar" options={{ title: 'Consultar placa' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
