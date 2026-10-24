import { StackDeRol } from '@/lib/guardia';

export default function PoliciaLayout() {
  return <StackDeRol modo="policia" protegidas={['policia/(tabs)']} />;
}
