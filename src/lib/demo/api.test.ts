import { beforeEach, describe, expect, it } from 'vitest'
import { formatBs, formatFecha, formatHora, formatMes } from '../format.ts'
import {
  DemoError, calcularEstadisticas, getMultas, getSesion, iniciarSesion, pagarMultas, reiniciarDemo,
  solicitarCodigo, verificarCodigo,
} from './api.ts'
import { MULTAS_DEMO } from './datos.ts'

const codigo = (p: Promise<unknown>) => p.then(() => 'OK', (e: unknown) => (e instanceof DemoError ? e.code : String(e)))
const pago = { banco: '0102', telefono: '04120000001', cedula: '99000001', clave: '123456' }

beforeEach(reiniciarDemo)

describe('formato', () => {
  it('monto es-VE con "Bs." antepuesto', () => {
    expect(formatBs(125_000)).toBe('Bs. 1.250,00')
    expect(formatBs(250_000)).toBe('Bs. 2.500,00')
    expect(formatBs(0)).toBe('Bs. 0,00')
  })
  it('fecha y hora 24 h en Caracas', () => {
    expect(formatFecha('2026-10-24T14:03:00Z')).toBe('24/10/2026')
    expect(formatHora('2026-10-24T14:03:00Z')).toBe('10:03')
    expect(formatFecha('2026-03-12T02:31:00Z')).toBe('11/03/2026')
    expect(formatMes('2026-10-24T14:03:00Z')).toBe('Octubre 2026')
  })
})

describe('acceso', () => {
  it('login demo: clave de 6+ caracteres salvo la incorrecta', async () => {
    expect(await codigo(iniciarSesion('V-99000001', 'clave-mal'))).toBe('CREDENCIALES')
    expect(await codigo(iniciarSesion('V-99000001', '12345'))).toBe('CREDENCIALES')
    expect(await codigo(iniciarSesion('V-11111111', 'demo1234'))).toBe('CREDENCIALES')
    expect(await codigo(iniciarSesion('v-99.000.001', 'demo12'))).toBe('OK')
    expect(getSesion()?.cedula).toBe('V99000001')
  })

  it('registro: cédula ya registrada, código vencido, inválido y válido', async () => {
    const datos = { cedula: 'V99000001', telefono: '04120000001', correo: null, clave: 'demo1234' }
    expect(await codigo(solicitarCodigo({ ...datos, cedula: 'V12345678' }))).toBe('YA_REGISTRADA')
    expect(await codigo(solicitarCodigo(datos))).toBe('OK')
    expect(await codigo(verificarCodigo('000000'))).toBe('CODIGO_VENCIDO')
    expect(await codigo(verificarCodigo('111222'))).toBe('CODIGO_INVALIDO')
    expect((await verificarCodigo('123456')).vehiculos).toHaveLength(2)
    expect(getSesion()?.cedula).toBe('V99000001')
    expect(await codigo(solicitarCodigo(datos))).toBe('YA_REGISTRADA')
  })

  it('una cédula sin vehículos crea la cuenta igual y no ve multas ajenas', async () => {
    await solicitarCodigo({ cedula: 'E7654321', telefono: '04141234567', correo: null, clave: 'demo1234' })
    expect((await verificarCodigo('123456')).vehiculos).toEqual([])
    expect(await getMultas()).toEqual([])
  })

  it('sin sesión los datos responden SESION', async () => {
    expect(await codigo(getMultas())).toBe('SESION')
  })
})

describe('pago C2P simulado', () => {
  beforeEach(() => iniciarSesion('V99000001', 'demo1234'))

  it('000000 = clave inválida, 111111 = fondos insuficientes, sin cobrar', async () => {
    expect(await codigo(pagarMultas(['m1'], { ...pago, clave: '000000' }))).toBe('CLAVE_C2P')
    expect(await codigo(pagarMultas(['m1'], { ...pago, clave: '111111' }))).toBe('FONDOS')
    expect((await getMultas()).find((m) => m.id === 'm1')?.status).toBe('PENDING')
  })

  it('valida teléfono y clave de 6–8 dígitos', async () => {
    expect(await codigo(pagarMultas(['m1'], { ...pago, telefono: '04110000001' }))).toBe('VALIDACION')
    expect(await codigo(pagarMultas(['m1'], { ...pago, clave: '12345' }))).toBe('VALIDACION')
  })

  it('"Pagar todo" deja la cuenta al día con una referencia SIM por multa', async () => {
    const pagadas = await pagarMultas(['m1', 'm2'], pago)
    expect(pagadas.map((m) => m.status)).toEqual(['PAID', 'PAID'])
    pagadas.forEach((m) => expect(m.paymentReference).toMatch(/^SIM-\d{8}$/))
    expect((await getMultas()).filter((m) => m.status === 'PENDING' || m.status === 'OVERDUE')).toEqual([])
    expect(await codigo(pagarMultas(['m1'], pago))).toBe('YA_PAGADA')
  })
})

describe('estadísticas', () => {
  it('cuenta por estado, mes, tipo y vehículo', () => {
    const st = calcularEstadisticas(MULTAS_DEMO, new Date('2026-10-24T18:00:00Z'))
    expect(st).toMatchObject({ total: 6, porPagar: 2, pagadas: 3, montoPagadoCents: 375_000, diasSinInfracciones: 0, desde: '2026-03-12T02:31:00Z' })
    expect(st.porMes.map((m) => m.n)).toEqual([1, 1, 0, 1, 0, 1, 1, 1])
    expect(st.porTipo).toEqual([{ type: 'RED_LIGHT', n: 4 }, { type: 'TURN_ARROW', n: 1 }, { type: 'SPEEDING', n: 1 }])
    expect(st.porVehiculo).toEqual([{ plate: 'AB123CD', n: 5 }, { plate: 'CD456EF', n: 1 }])
  })

  it('sin multas no hay días ni fecha de inicio', () => {
    expect(calcularEstadisticas([])).toMatchObject({ total: 0, diasSinInfracciones: null, desde: null })
  })
})
