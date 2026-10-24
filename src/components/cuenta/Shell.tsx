import { Car, ChartColumn, House, LogOut, Menu, ReceiptText, User, Video, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { alVencerSesion, cerrarSesion, contarPendientes, getSesion, sesionVencio } from '@/lib/demo/api.ts'
import { formatCedula } from '@/lib/format.ts'
import { Boton, Hoja, SelectorTema } from '@/components/ui/index.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { Logo } from '@/components/vc/index.tsx'

type Seccion = 'inicio' | 'multas' | 'estadisticas' | 'vehiculos' | 'en-vivo' | 'perfil'
const NAV: Array<{ id: Seccion; label: string; Icono: LucideIcon }> = [
  { id: 'inicio', label: 'Inicio', Icono: House },
  { id: 'multas', label: 'Multas', Icono: ReceiptText },
  { id: 'estadisticas', label: 'Estadísticas', Icono: ChartColumn },
  { id: 'vehiculos', label: 'Vehículos', Icono: Car },
  { id: 'en-vivo', label: 'Cámaras en vivo', Icono: Video },
  { id: 'perfil', label: 'Perfil', Icono: User },
]
const ABAJO: Seccion[] = ['inicio', 'multas', 'estadisticas', 'vehiculos']

/** Rutas protegidas: sin sesión vuelve al login (avisando si venció). */
export function Protegida() {
  const location = useLocation()
  if (!getSesion()) return <Navigate to="/ingresar" replace state={{ vencida: sesionVencio(), desde: location.pathname + location.search }} />
  return <Shell />
}

/** ≥1024: sidebar tinta con barra lima. Debajo: barra superior + navegación inferior con "Más". */
function Shell() {
  const { pathname, search, state } = useLocation()
  const navigate = useNavigate()
  const main = useRef<HTMLElement>(null)
  const [mas, setMas] = useState(false)
  const [vencida, setVencida] = useState(false)
  const sesion = getSesion()

  const primera = pathname.split('/')[1] ?? ''
  // Detalle, pago y comprobante: sin navegación inferior; la sección activa es de donde vino.
  const enFlujo = /^\/multas\/[^/]+/.test(pathname) || primera === 'pagar' || primera === 'comprobante'
  const desde = (state as { desde?: string } | null)?.desde
  const seccion: string = enFlujo ? (desde ?? (primera === 'multas' ? 'multas' : 'inicio')) : primera
  const pendientes = useMemo(() => contarPendientes(), [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => alVencerSesion(() => setVencida(true)), [])
  useEffect(() => { main.current?.scrollTo(0, 0) }, [pathname])

  const salir = () => { cerrarSesion(); navigate('/ingresar') }
  const idx = ABAJO.indexOf(seccion as Seccion)
  const iAbajo = idx < 0 ? 4 : idx

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="tinta hidden w-[248px] flex-none flex-col gap-1 bg-tinta px-3 py-5 lg:flex">
          <div className="px-3 pb-5 text-card"><Logo claro /></div>
          <nav aria-label="Principal" className="flex flex-col gap-1">
            {NAV.map(({ id, label, Icono }) => {
              const on = seccion === id
              return (
                <Link
                  key={id}
                  to={`/${id}`}
                  aria-current={on ? 'page' : undefined}
                  className={cx('relative flex h-11 items-center gap-3 rounded-control px-3 text-[15px] transition-colors duration-150', on ? 'bg-tinta-2 font-semibold text-card' : 'font-medium text-niebla hover:bg-tinta-2/60 hover:text-card')}
                >
                  {on && <span aria-hidden="true" className="barra-activa absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-sm bg-brand" />}
                  <Icono size={20} strokeWidth={1.75} aria-hidden="true" className={on ? 'text-brand' : undefined} />
                  <span className="flex-1">{label}</span>
                  {id === 'multas' && pendientes > 0 && (
                    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-rojo px-1.5 font-mono text-xs font-bold text-contraste" aria-label={`${pendientes} por pagar`}>{pendientes}</span>
                  )}
                </Link>
              )
            })}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 rounded-control bg-tinta-2 p-3 text-card">
            <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-full bg-tinta-3 font-mono text-[13px] font-bold text-brand">{sesion?.cedula.charAt(0)}</span>
            <span className="flex min-w-0 flex-1 flex-col leading-[18px]">
              <span className="font-mono text-[13px] font-bold">{sesion && formatCedula(sesion.cedula)}</span>
              <span className="text-xs text-niebla">Ciudadano</span>
            </span>
            <button type="button" onClick={salir} aria-label="Cerrar sesión" className="flex size-11 items-center justify-center text-niebla hover:text-card">
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-14 flex-none items-center gap-2.5 border-b border-borde bg-card pr-2 pl-4 lg:hidden">
            <Logo />
            <Link to="/perfil" aria-label="Perfil" className="ml-auto flex size-11 items-center justify-center">
              <span className="flex size-8 items-center justify-center rounded-full bg-suave font-mono text-xs font-bold">{sesion?.cedula.charAt(0)}</span>
            </Link>
          </header>

          <main ref={main} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div key={pathname} className="vista flex flex-1 flex-col">
              <Outlet />
            </div>
          </main>

          {!enFlujo && (
            <nav aria-label="Principal" className="relative grid flex-none grid-cols-5 border-t border-borde bg-card px-1 py-1.5 lg:hidden">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1.5 left-1 flex h-8 justify-center transition-transform duration-[220ms] ease-sheet motion-reduce:transition-none"
                style={{ width: 'calc((100% - 8px) / 5)', transform: `translateX(${iAbajo * 100}%)` }}
              >
                <span className="h-8 w-14 rounded-full bg-suave" />
              </span>
              {[...ABAJO.map((id) => NAV.find((n) => n.id === id)), null].map((n, i) => {
                const on = i === iAbajo
                const Icono = n?.Icono ?? Menu
                const cuerpo = (
                  <>
                    <span className="flex h-8 w-14 items-center justify-center"><Icono size={20} strokeWidth={on ? 2 : 1.75} aria-hidden="true" className={on ? 'text-tinta' : 'text-texto-2'} /></span>
                    {n?.label ?? 'Más'}
                  </>
                )
                const cls = cx('relative z-10 flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs', on ? 'font-semibold text-tinta' : 'font-medium text-texto-2')
                return n ? (
                  <Link key={n.id} to={`/${n.id}`} aria-current={on ? 'page' : undefined} className={cls}>{cuerpo}</Link>
                ) : (
                  <button key="mas" type="button" onClick={() => setMas(true)} aria-haspopup="dialog" aria-current={on ? 'page' : undefined} className={cls}>{cuerpo}</button>
                )
              })}
            </nav>
          )}
        </div>
      </div>

      <Hoja abierta={mas} onCerrar={() => setMas(false)} etiqueta="Más secciones">
        <Link to="/en-vivo" onClick={() => setMas(false)} className="flex min-h-14 items-center gap-3 px-2 font-semibold"><Video size={20} strokeWidth={1.75} aria-hidden="true" />Cámaras en vivo</Link>
        <Link to="/perfil" onClick={() => setMas(false)} className="flex min-h-14 items-center gap-3 border-t border-borde px-2 font-semibold"><User size={20} strokeWidth={1.75} aria-hidden="true" />Perfil</Link>
        <div className="flex flex-col gap-2 border-t border-borde px-2 py-3">
          <span className="text-sm font-semibold">Apariencia</span>
          <SelectorTema />
        </div>
        <button type="button" onClick={salir} className="flex min-h-14 items-center gap-3 border-t border-borde px-2 text-left font-semibold text-rojo-osc"><LogOut size={20} strokeWidth={1.75} aria-hidden="true" />Cerrar sesión</button>
      </Hoja>

      <Hoja abierta={vencida} modo="modal" etiqueta="Su sesión venció" onCerrar={() => navigate('/ingresar', { state: { vencida: true, desde: pathname + search } })}>
        <h2 className="text-h2 font-semibold">Su sesión venció</h2>
        <p className="text-texto-2">Por seguridad cerramos su sesión después de un tiempo sin uso. Entre de nuevo con su cédula.</p>
        <Boton onClick={() => navigate('/ingresar', { state: { vencida: true, desde: pathname + search } })}>Entrar de nuevo</Boton>
      </Hoja>
    </div>
  )
}
