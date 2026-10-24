import { Route, Routes } from 'react-router'
import AdminRevision from './pages/AdminRevision.tsx'
import Camaras from './pages/Camaras.tsx'
import Consulta from './pages/Consulta.tsx'
import Landing from './pages/Landing.tsx'
import Multa from './pages/Multa.tsx'
import Oficial from './pages/Oficial.tsx'
import Pagar from './pages/Pagar.tsx'

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
      <Route path="*" element={<p className="p-6">Página no encontrada.</p>} />
    </Routes>
  )
}
