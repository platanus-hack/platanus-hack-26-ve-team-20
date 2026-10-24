import { Bell, Car, ChartColumn, LayoutGrid, LogOut, Menu, ReceiptText, User, Video, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { alVencerSesion, cerrarSesion, contarPendientes, getSesion, sesionVencio } from '@/lib/demo/api.ts'
import { formatCedula } from '@/lib/format.ts'
import { Boton, Hoja, InterruptorTema, SelectorTema } from '@/components/ui/index.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { Logo } from '@/components/vc/index.tsx'
import { Isotipo } from '@/components/vc/Isotipo.tsx'

type Seccion = 'inicio' | 'multas' | 'estadisticas' | 'vehiculos' | 'en-vivo' | 'perfil'
const NAV: Array<{ id: Seccion; label: string; Icono: LucideIcon }> = [
  { id: 'inicio', label: 'Resumen', Icono: LayoutGrid },
  { id: 'multas', label: 'Multas', Icono: ReceiptText },
  { id: 'estadisticas', label: 'Estadísticas', Icono: ChartColumn },
  { id: 'vehiculos', label: 'Vehículos', Icono: Car },
  { id: 'en-vivo', label: 'Cámaras en vivo', Icono: Video },
]
const ABAJO: Seccion[] = ['inicio', 'multas', 'estadisticas', 'vehiculos']

/** Rutas protegidas: sin sesión vuelve al login (avisando si venció). */
export function Protegida() {
  const location = useLocation()
  if (!getSesion()) return <Navigate to="/ingresar" replace state={{ vencida: sesionVencio(), desde: location.pathname + location.search }} />
  return <Shell />
}

/** ≥1024: riel de íconos (con el logo); tema, avisos y cédula van en la fila del título. Debajo: barra superior + navegación inferior con "Más". */
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
    <div className="flex h-dvh flex-col bg-fondo">
      <div className="flex min-h-0 flex-1 lg:gap-4 lg:p-4">
        {/* ≥1024: riel de íconos con el logo; cada sección es un círculo con su nombre accesible. */}
        <aside className="hidden w-[102px] flex-none flex-col items-center rounded-[22px] bg-card pt-6 pb-6 shadow-card lg:flex">
          <Link to="/inicio" aria-label="SmartTraffic, inicio" className="flex text-tinta"><Isotipo size={60} /></Link>
          <nav aria-label="Principal" className="mt-16 flex flex-col items-center gap-4">
            {NAV.filter((n) => n.id !== 'estadisticas').map(({ id, label, Icono }) => {
              const on = seccion === id
              return (
                <Link
                  key={id}
                  to={`/${id}`}
                  aria-current={on ? 'page' : undefined}
                  aria-label={id === 'multas' && pendientes > 0 ? `${label}, ${pendientes} por pagar` : label}
                  title={label}
                  className={cx('press relative flex size-11 items-center justify-center rounded-full transition-colors duration-150', on ? 'bg-brand text-[#0e1726]' : 'bg-suave text-tinta hover:bg-borde')}
                >
                  <Icono size={18} strokeWidth={on ? 2.2 : 1.9} aria-hidden="true" />
                  {id === 'multas' && pendientes > 0 && (
                    <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rojo px-1 font-mono text-[11px] font-bold text-contraste">{pendientes}</span>
                  )}
                </Link>
              )
            })}
          </nav>
          <button type="button" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión" className="mt-auto flex size-11 items-center justify-center rounded-full bg-suave text-tinta transition-colors duration-150 hover:bg-borde">
            <LogOut size={18} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-14 flex-none items-center gap-2.5 border-b border-borde bg-card pr-2 pl-4 lg:hidden">
            <Logo />
            <Link to="/perfil" aria-label="Perfil" className="ml-auto flex size-11 items-center justify-center">
              <span className="flex size-8 items-center justify-center rounded-full bg-suave font-mono text-xs font-bold">{sesion?.cedula.charAt(0)}</span>
            </Link>
          </header>

          <main ref={main} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* ≥1024: tema, avisos y cédula arriba a la derecha, en la fila del título de cada página (se desplazan con ella). */}
            <header className="absolute top-0 right-0 z-20 hidden h-11 items-center gap-4 lg:flex">
              <InterruptorTema />
              <Link to="/multas" aria-label={pendientes > 0 ? `Avisos: ${pendientes} multas por pagar` : 'Avisos'} className="relative flex size-11 items-center justify-center rounded-full text-tinta">
                <Bell size={20} strokeWidth={2} aria-hidden="true" />
                {pendientes > 0 && <span aria-hidden="true" className="absolute top-2 right-2.5 size-2 rounded-full bg-rojo" />}
              </Link>
              <Link to="/perfil" className="group press flex min-h-11 items-center gap-2 text-tinta">
                <span className="font-mono text-sm font-medium">{sesion && formatCedula(sesion.cedula)}</span>
                <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-brand font-mono text-xs font-bold text-[#0e1726] transition-transform duration-150 ease-press group-hover:scale-105">{sesion?.cedula.charAt(0)}</span>
              </Link>
            </header>
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
