import { Route, Routes } from 'react-router'
import AuthLayout from './components/cuenta/AuthLayout.tsx'
import { Protegida } from './components/cuenta/Shell.tsx'
import { ProtegidaOficial } from './components/oficial/Shell.tsx'
import AdminRevision from './pages/AdminRevision.tsx'
import Camaras from './pages/Camaras.tsx'
import Consulta from './pages/Consulta.tsx'
import Landing from './pages/Landing.tsx'
import Multa from './pages/Multa.tsx'
import Oficial from './pages/Oficial.tsx'
import Pagar from './pages/Pagar.tsx'
import Comprobante from './pages/cuenta/Comprobante.tsx'
import EnVivo from './pages/cuenta/EnVivo.tsx'
import Estadisticas from './pages/cuenta/Estadisticas.tsx'
import Inicio from './pages/cuenta/Inicio.tsx'
import Login from './pages/cuenta/Login.tsx'
import MultaDetalle from './pages/cuenta/MultaDetalle.tsx'
import Multas from './pages/cuenta/Multas.tsx'
import Pago from './pages/cuenta/Pago.tsx'
import Perfil from './pages/cuenta/Perfil.tsx'
import Registro from './pages/cuenta/Registro.tsx'
import RegistroCodigo from './pages/cuenta/RegistroCodigo.tsx'
import Vehiculos from './pages/cuenta/Vehiculos.tsx'
import IngresarOficial from './pages/oficial/Ingresar.tsx'
import InvitacionOficial from './pages/oficial/Invitacion.tsx'
import MultaOficial from './pages/oficial/MultaDetalle.tsx'
import MultasOficial from './pages/oficial/Multas.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/consulta" element={<Consulta />} />
      <Route path="/multa/:token" element={<Multa />} />
      <Route path="/multa/:token/pagar" element={<Pagar />} />
      <Route path="/camaras" element={<Camaras />} />
      <Route path="/oficial" element={<Oficial />} />
      <Route path="/admin/revision" element={<AdminRevision />} />

      {/* Cuenta del ciudadano (Dirección C) */}
      <Route element={<AuthLayout />}>
        <Route path="/ingresar" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/registro/codigo" element={<RegistroCodigo />} />
        <Route path="/oficial/ingresar" element={<IngresarOficial />} />
        <Route path="/oficial/invitacion" element={<InvitacionOficial />} />
      </Route>

      {/* Historial de multas del policía (docs/12) */}
      <Route element={<ProtegidaOficial />}>
        <Route path="/oficial/multas" element={<MultasOficial />} />
        <Route path="/oficial/multas/:id" element={<MultaOficial />} />
      </Route>
      <Route element={<Protegida />}>
        <Route path="/inicio" element={<Inicio />} />
        <Route path="/multas" element={<Multas />} />
        <Route path="/multas/:id" element={<MultaDetalle />} />
        <Route path="/multas/:id/pagar" element={<Pago />} />
        <Route path="/multas/:id/comprobante" element={<Comprobante />} />
        <Route path="/pagar" element={<Pago />} />
        <Route path="/comprobante" element={<Comprobante />} />
        <Route path="/estadisticas" element={<Estadisticas />} />
        <Route path="/vehiculos" element={<Vehiculos />} />
        <Route path="/en-vivo" element={<EnVivo />} />
        <Route path="/perfil" element={<Perfil />} />
      </Route>

      <Route path="*" element={<p className="p-6">Página no encontrada.</p>} />
    </Routes>
  )
}
