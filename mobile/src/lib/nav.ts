import { router } from 'expo-router';

import type { Multa } from '@/demo/ciudadano';

export const abrirMulta = (m: Multa) => router.push(`/ciudadano/multa/${m.id}`);
export const irAPagar = (ids: string[]) => router.push({ pathname: '/ciudadano/pago', params: { ids: ids.join(',') } });
