import { Navigate } from 'react-router'
import { getSesion } from '@/lib/demo/api.ts'

/** `/`: con sesión va al inicio del ciudadano; sin sesión, al login. */
export default function Landing() {
  return <Navigate to={getSesion() ? '/inicio' : '/ingresar'} replace />
}
