import { StackDeRol } from '@/lib/guardia';

export default function CiudadanoLayout() {
  return <StackDeRol modo="ciudadano" protegidas={['ciudadano/(tabs)', 'ciudadano/multa/[id]', 'ciudadano/pago', 'ciudadano/comprobante']} />;
}
