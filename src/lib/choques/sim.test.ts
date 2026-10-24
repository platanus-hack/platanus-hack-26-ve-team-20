import { describe, expect, it } from 'vitest'
import {
  BUFFER_MS, CALLES_X, CALLES_Y, DETECCION_MS, POST_MS, PRE_MS, RUMBO,
  ajustarACalle, avanzar, puestoEnCalle, bitacora, choqueAlAzar, conPropio, crearRed, detectar, distancia, estadoCaptura,
  finIncidente, formatT, normalizar, resumen, simularChoque, vista, type Estado, type Nodo,
} from './sim.ts'

const enCalle = (n: Nodo) => CALLES_X.some((x) => Math.abs(n.pos.x - x) < 1e-6) || CALLES_Y.some((y) => Math.abs(n.pos.y - y) < 1e-6)

function correr(e: Estado, ms: number, paso = 50): Estado {
  let s = e
  for (let t = 0; t < ms; t += paso) s = avanzar(s, paso)
  return s
}

describe('geometría', () => {
  it('normaliza ángulos a (-180, 180]', () => {
    expect(normalizar(190)).toBe(-170)
    expect(normalizar(-180)).toBe(180)
    expect(normalizar(720)).toBe(0)
  })

  it('un punto delante está en cuadro; uno detrás no', () => {
    const n = { pos: { x: 0, y: 0 }, rumbo: RUMBO.E, fov: 70, alcance: 100 }
    expect(vista(n, { x: 50, y: 10 }).enCuadro).toBe(true)
    expect(vista(n, { x: -50, y: 0 }).enCuadro).toBe(false)
    expect(vista(n, { x: 150, y: 0 }).enCuadro).toBe(false) // fuera de alcance
    expect(vista(n, { x: 50, y: 50 }).anguloRel).toBeCloseTo(45) // a la derecha (sur)
  })

  it('ajusta un clic al punto de calle más cercano', () => {
    expect(ajustarACalle({ x: 305, y: 150 })).toEqual({ x: 300, y: 150 })
    expect(ajustarACalle({ x: 420, y: 236 })).toEqual({ x: 420, y: 240 })
    expect(ajustarACalle({ x: 0, y: 0 })).toEqual({ x: 100, y: 80 })
  })

  it('puestoEnCalle pone a todos en la misma calle, uno junto al otro y dentro del mapa', () => {
    const puestos = [0, 1, 2, 3, 30].map(puestoEnCalle)
    expect(new Set(puestos.map((p) => p.y)).size).toBe(1)
    expect(puestos.slice(0, 4).map((p) => p.x)).toEqual([260, 305, 350, 395])
    expect(puestos.at(-1)?.x).toBe(CALLES_X.at(-1))
    for (const p of puestos) expect(ajustarACalle(p)).toEqual(p)
  })

  it('formatea tiempos relativos al choque', () => {
    expect(formatT(-PRE_MS)).toBe('T−10 s')
    expect(formatT(1234)).toBe('T+1,2 s')
  })
})

describe('red', () => {
  it('es determinista con la misma semilla', () => {
    expect(correr(crearRed({ semilla: 7 }), 3000)).toEqual(correr(crearRed({ semilla: 7 }), 3000))
  })

  it('los carros se mueven siempre por las calles y dentro del mapa', () => {
    let e = crearRed({ semilla: 3 })
    for (let i = 0; i < 600; i++) {
      e = avanzar(e, 100)
      for (const n of e.nodos) {
        expect(enCalle(n)).toBe(true)
        expect(n.pos.x).toBeGreaterThanOrEqual(CALLES_X[0] - 1e-6)
        expect(n.pos.y).toBeLessThanOrEqual((CALLES_Y.at(-1) ?? 0) + 1e-6)
      }
    }
  })

  it('las cámaras de semáforo y el nodo propio no se mueven', () => {
    const e = conPropio(crearRed(), true)
    const fijos = e.nodos.filter((n) => n.velocidad === 0)
    expect(fijos.some((n) => n.propio)).toBe(true)
    expect(correr(e, 5000).nodos.filter((n) => n.velocidad === 0)).toEqual(fijos)
  })

  it('siempre hay al menos un teléfono sin señal', () => {
    for (const semilla of [1, 2, 3, 4, 5]) expect(crearRed({ semilla }).nodos.some((n) => n.senal === 'SIN')).toBe(true)
  })
})

describe('choque y alerta', () => {
  it('detecta quien tiene el punto en cuadro, el más cercano; nadie si no lo ve nadie', () => {
    const base = crearRed().nodos[0] as Nodo
    const a: Nodo = { ...base, id: 'A', pos: { x: 100, y: 240 }, rumbo: RUMBO.E, senal: 'OK' }
    const b: Nodo = { ...base, id: 'B', pos: { x: 160, y: 240 }, rumbo: RUMBO.E, senal: 'OK' }
    const ciego: Nodo = { ...base, id: 'C', pos: { x: 220, y: 240 }, rumbo: RUMBO.E, senal: 'OK' } // de espaldas al punto
    expect(detectar([a, b, ciego], { x: 200, y: 240 })?.id).toBe('B')
    expect(detectar([ciego], { x: 200, y: 240 })).toBeNull()
    expect(detectar([{ ...b, senal: 'SIN' }], { x: 200, y: 240 })).toBeNull()
  })

  it('choqueAlAzar: el reportero lo ve de frente, frena y alerta solo a los nodos en el radio', () => {
    const radio = 300
    const e = choqueAlAzar(correr(crearRed(), 2000), radio)
    const inc = e.incidente
    expect(inc?.reportero).toBeTruthy()
    if (!inc?.reportero) return
    const rep = e.nodos.find((n) => n.id === inc.reportero) as Nodo
    expect(rep.detenido).toBe(true)
    const propia = inc.capturas.find((c) => c.reportero)
    expect(propia?.enCuadro).toBe(true)
    expect(propia?.alertaEn).toBe(inc.t0 + DETECCION_MS)

    const alertados = new Set(inc.capturas.map((c) => c.nodoId))
    for (const n of e.nodos) expect(alertados.has(n.id)).toBe(distancia(n.pos, inc.centro) <= radio)
  })

  it('un radio más grande alerta a más nodos', () => {
    const e = correr(crearRed(), 2000)
    const chico = choqueAlAzar(e, 150).incidente?.capturas.length ?? 0
    const grande = choqueAlAzar(e, 800).incidente?.capturas.length ?? 0
    expect(grande).toBeGreaterThan(chico)
  })

  it('cada captura recorre EN_CAMINO → CAPTURANDO → SUBIENDO → LISTO y cubre T−10 s a T+5 s', () => {
    const inc = choqueAlAzar(crearRed(), 800).incidente
    const c = inc?.capturas.find((x) => !x.perdida && !x.reportero)
    if (!inc || !c) throw new Error('sin captura')
    expect(estadoCaptura(c, c.alertaEn - 1)).toBe('EN_CAMINO')
    expect(estadoCaptura(c, c.alertaEn)).toBe('CAPTURANDO')
    expect(c.finCaptura).toBe(Math.max(c.alertaEn, inc.t0 + POST_MS))
    expect(estadoCaptura(c, c.finCaptura)).toBe('SUBIENDO')
    expect(estadoCaptura(c, c.listoEn)).toBe('LISTO')
    // la alerta llegó a tiempo: T−10 s seguía en el buffer
    expect(c.alertaEn - inc.t0).toBeLessThanOrEqual(BUFFER_MS - PRE_MS)
  })

  it('un nodo sin señal recibe la alerta tarde y pierde el choque', () => {
    // radio que cubre todo el mapa: el teléfono sin señal entra seguro
    const inc = choqueAlAzar(crearRed(), 2000).incidente
    const sin = inc?.capturas.find((c) => c.perdida)
    if (!inc || !sin) throw new Error('sin nodo perdido')
    expect(sin.alertaEn - inc.t0).toBeGreaterThan(BUFFER_MS - PRE_MS)
    expect(estadoCaptura(sin, sin.alertaEn)).toBe('PERDIDO')
  })

  it('un clic donde nadie mira no genera reporte ni alertas', () => {
    const e = crearRed()
    const sinVista = { ...e, nodos: e.nodos.map((n) => ({ ...n, alcance: 0 })) }
    const inc = simularChoque(sinVista, { x: 400, y: 240 }, 300).incidente
    expect(inc?.reportero).toBeNull()
    expect(inc?.capturas).toEqual([])
    expect(bitacora(inc!, inc!.t0 + 1000).at(-1)?.tono).toBe('mal')
  })

  it('un choque nuevo libera al carro que frenó en el anterior', () => {
    const e = choqueAlAzar(crearRed(), 300)
    const antes = e.incidente?.reportero
    const otro = simularChoque(e, { x: 100, y: 80 }, 300)
    expect(otro.nodos.find((n) => n.id === antes)?.detenido).toBe(false)
    expect(otro.incidente?.id).toBe('INC-002')
  })

  it('la bitácora crece con el tiempo y termina consolidando el incidente', () => {
    const inc = choqueAlAzar(crearRed(), 300).incidente
    if (!inc) throw new Error('sin incidente')
    expect(bitacora(inc, inc.t0)).toHaveLength(1)
    const fin = bitacora(inc, finIncidente(inc))
    expect(fin.at(-1)?.texto).toContain('consolidado')
    expect(fin.map((x) => x.t)).toEqual([...fin.map((x) => x.t)].sort((a, b) => a - b))
    expect(resumen(inc, finIncidente(inc)).completo).toBe(true)
    expect(resumen(inc, inc.t0).completo).toBe(false)
  })
})
