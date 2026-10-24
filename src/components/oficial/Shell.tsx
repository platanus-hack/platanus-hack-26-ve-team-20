import { LogOut, ReceiptText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { alVencerSesionOficial, cerrarSesionOficial, getSesionOficial, sesionOficialVencio } from '@/lib/oficial/api.ts'
import { Boton, BotonTema, Hoja } from '@/components/ui/index.tsx'
import { Logo } from '@/components/vc/index.tsx'

const LOGIN = '/oficial/ingresar'

/** Rutas del oficial: sin sesión vuelve al login conservando la ruta de origen. */
export function ProtegidaOficial() {
  const { pathname, search } = useLocation()
  if (!getSesionOficial()) return <Navigate to={LOGIN} replace state={{ vencida: sesionOficialVencio(), desde: pathname + search }} />
  return <Shell />
}

/** ≥1024: sidebar tinta con barra lima (como la cuenta del ciudadano). Debajo: barra superior. */
function Shell() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [vencida, setVencida] = useState(false)
  const sesion = getSesionOficial()
  useEffect(() => alVencerSesionOficial(() => setVencida(true)), [])

  const salir = () => { cerrarSesionOficial(); navigate(LOGIN) }
  const reentrar = () => navigate(LOGIN, { state: { vencida: true, desde: pathname + search } })

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="tinta hidden w-[248px] flex-none flex-col gap-1 bg-tinta px-3 py-5 lg:flex">
          <div className="px-3 pb-5 text-card"><Logo claro /></div>
          <nav aria-label="Principal" className="flex flex-col gap-1">
            <Link to="/oficial/multas" aria-current="page" className="relative flex h-11 items-center gap-3 rounded-control bg-tinta-2 px-3 text-[15px] font-semibold text-card">
              <span aria-hidden="true" className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-sm bg-brand" />
              <ReceiptText size={20} strokeWidth={1.75} aria-hidden="true" className="text-brand" />
              Historial de multas
            </Link>
          </nav>
          <BotonTema className="mt-auto text-niebla! hover:text-card!" />
          <div className="flex items-center gap-2.5 rounded-control bg-tinta-2 p-3 text-card">
            <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-full bg-tinta-3 font-mono text-[13px] font-bold text-brand">{iniciales(sesion?.name ?? '')}</span>
            <span className="flex min-w-0 flex-1 flex-col leading-[18px]">
              <span className="truncate text-[13px] font-bold">{sesion?.name}</span>
              <span className="font-mono text-xs text-niebla">{sesion?.badge ?? 'Policía'}</span>
            </span>
            <button type="button" onClick={salir} aria-label="Cerrar sesión" className="flex size-11 items-center justify-center text-niebla hover:text-card">
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-14 flex-none items-center gap-2.5 border-b border-borde bg-card pr-2 pl-4 lg:hidden">
            <Logo />
            <span className="text-sm text-texto-2">· Policía</span>
            <BotonTema className="ml-auto" />
            <button type="button" onClick={salir} className="flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold">
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />Salir
            </button>
          </header>
          <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div key={pathname} className="vista flex flex-1 flex-col">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <Hoja abierta={vencida} modo="modal" etiqueta="Su sesión venció" onCerrar={reentrar}>
        <h2 className="text-h2 font-semibold">Su sesión venció</h2>
        <p className="text-texto-2">Por seguridad, la sesión del oficial dura 12 horas. Entre de nuevo con su correo.</p>
        <Boton onClick={reentrar}>Entrar de nuevo</Boton>
      </Hoja>
    </div>
  )
}

/** "Oficial Nuevo (ejemplo)" → "ON". */
const iniciales = (nombre: string) => nombre.split(/\s+/).filter((p) => /^\p{L}/u.test(p)).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
