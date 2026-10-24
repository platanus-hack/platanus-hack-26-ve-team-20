"""Prueba en vivo: cámara + semáforo simulado + multas.

Instalar:   pip install -r requirements.txt
Configurar: python configurar_camara.py                (dibuja línea de pare, carriles, PARE, zonas, velocidad...)
Correr:     python prueba_camara.py                      (cámara 0 de la compu, usa camara.json)
            python prueba_camara.py --camara 1           (otra cámara USB)
            python prueba_camara.py --camara http://192.168.1.20:8080/video   (celular como cámara IP)
            python prueba_camara.py --ciclo 10,3,10      (semáforo automático: verde 10 s, amarillo 3 s, rojo 10 s)
            python prueba_camara.py --coco               (prueba rápida sin modelos entrenados: vehículos con YOLO COCO, sin placas)
            python prueba_camara.py --camara choque.mp4  (con choques.pt en la carpeta también avisa posibles choques)

Si no existe camara.json, al arrancar haces 3 clics para la línea de pare (2 clics) y un punto dentro de la
intersección (1 clic). Para contravía, PARE, giros, línea continua y velocidad usa configurar_camara.py.

Teclas:  R = rojo | V = verde | A = amarillo (cuenta como verde) | C = volver a marcar la línea de pare | Q = salir
Las multas se guardan en ./multas/ (escena, vehículo, placa y datos.json) y en multas.csv.

Si al abrir la ventana sale un error tipo "The function is not implemented", es porque EasyOCR instaló
opencv-python-headless (sin ventanas). Se arregla con:
    pip uninstall -y opencv-python-headless opencv-python && pip install opencv-python
"""
import argparse
import csv
import json
import time
from pathlib import Path

import cv2

from motor_infracciones import MotorInfracciones, estado_ciclo

VENTANA = "Infracciones"
TEXTOS = ["Clic 1: inicio de la linea de pare", "Clic 2: fin de la linea de pare",
          "Clic 3: un punto DENTRO de la interseccion"]


def abrir_camara(fuente):
    cap = cv2.VideoCapture(int(fuente) if str(fuente).isdigit() else fuente)
    if not cap.isOpened():
        raise SystemExit(f"No pude abrir la cámara {fuente}")
    return cap


def marcar_linea(cap, cfg, ruta):
    """Marca solo la línea de pare (3 clics) y la guarda en la configuración, sin tocar las demás reglas."""
    puntos = []

    def clic(evento, x, y, *_):
        if evento == cv2.EVENT_LBUTTONDOWN and len(puntos) < 3:
            puntos.append([x, y])

    cv2.setMouseCallback(VENTANA, clic)
    while len(puntos) < 3:
        ok, frame = cap.read()
        if not ok:
            continue
        for p in puntos:
            cv2.circle(frame, tuple(p), 7, (0, 255, 255), -1)
        if len(puntos) >= 2:
            cv2.line(frame, tuple(puntos[0]), tuple(puntos[1]), (0, 0, 255), 3)
        cv2.putText(frame, TEXTOS[len(puntos)], (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
        cv2.imshow(VENTANA, frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            raise SystemExit
    cv2.setMouseCallback(VENTANA, lambda *a: None)
    H, W = frame.shape[:2]
    if cfg.get("resolucion") and list(cfg["resolucion"]) != [W, H]:
        print("Aviso: camara.json se dibujó con otra resolución; las demás reglas se escalan automáticamente")
    cfg.setdefault("resolucion", [W, H])
    sx, sy = cfg["resolucion"][0] / W, cfg["resolucion"][1] / H
    cfg["linea_pare"] = [[puntos[0][0] * sx, puntos[0][1] * sy], [puntos[1][0] * sx, puntos[1][1] * sy]]
    cfg["punto_despues"] = [puntos[2][0] * sx, puntos[2][1] * sy]
    Path(ruta).write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    return cfg


def main():
    ap = argparse.ArgumentParser(description="Prueba en vivo del motor de infracciones")
    ap.add_argument("--camara", default="0", help="índice de la cámara o URL (RTSP/HTTP)")
    ap.add_argument("--config", default="camara.json", help="reglas de la cámara (de configurar_camara.py)")
    ap.add_argument("--vehiculos", default="vehiculos.pt", help="pesos del modelo de vehículos")
    ap.add_argument("--placas", default="placas.pt", help="pesos del modelo de placas")
    ap.add_argument("--senales", default="senales.pt", help="pesos del modelo de señales (opcional)")
    ap.add_argument("--choques", default="choques.pt", help="pesos de la capa de choques (opcional)")
    ap.add_argument("--conf-choques", type=float, default=0.5, help="confianza mínima del modelo de choques")
    ap.add_argument("--coco", action="store_true", help="usa yolo11n.pt (COCO) para vehículos")
    ap.add_argument("--ciclo", default=None, help="semáforo automático verde,amarillo,rojo en segundos, ej. 10,3,10")
    ap.add_argument("--imgsz", type=int, default=640, help="tamaño de inferencia de vehículos (baja a 480 si va lento)")
    ap.add_argument("--recalibrar", action="store_true", help="vuelve a marcar la línea de pare")
    args = ap.parse_args()

    cap = abrir_camara(args.camara)
    try:
        cv2.namedWindow(VENTANA, cv2.WINDOW_NORMAL)
    except cv2.error:
        raise SystemExit("OpenCV no puede abrir ventanas. Corre: pip uninstall -y opencv-python-headless "
                         "opencv-python && pip install opencv-python")
    ruta = Path(args.config)
    cfg = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}
    if args.recalibrar or not cfg.get("linea_pare"):
        cfg = marcar_linea(cap, cfg, ruta)

    csv_path = Path("multas.csv")
    nuevo = not csv_path.exists()
    f_csv = open(csv_path, "a", newline="", encoding="utf-8")
    escritor = csv.writer(f_csv)
    if nuevo:
        escritor.writerow(["fecha_hora", "id", "clase", "tipo", "placa", "confianza_placa", "detalle", "carpeta"])

    def en_multa(m):
        extra = f" {m['detalle']['velocidad_kmh']} km/h" if m["tipo"] == "exceso_velocidad" else ""
        etiqueta = "AVISO" if m["tipo"] == "choque" else "MULTA"
        print(f"{etiqueta}  {m['fecha_hora']}  {m['descripcion']}{extra}  {m['clase']}  placa {m['placa']} "
              f"({m['confianza_placa']})  -> {m['carpeta']}")
        escritor.writerow([m["fecha_hora"], m["id"], m["clase"], m["tipo"], m["placa"], m["confianza_placa"],
                           json.dumps(m["detalle"], ensure_ascii=False), m["carpeta"]])
        f_csv.flush()

    placas = args.placas if Path(args.placas).exists() else None
    senales = args.senales if Path(args.senales).exists() else None
    choques = args.choques if Path(args.choques).exists() else None
    if placas is None:
        print(f"Aviso: no encontré {args.placas}; se detectan infracciones pero no se leen placas.")

    def crear_motor():
        return MotorInfracciones(
            pesos_vehiculos="yolo11n.pt" if args.coco else args.vehiculos, pesos_placas=placas, usar_coco=args.coco,
            config=cfg, pesos_senales=senales, imgsz_vehiculos=args.imgsz, carpeta_evidencias="multas",
            en_multa=en_multa, pesos_choques=choques, conf_choques=args.conf_choques)

    motor = crear_motor()
    print("Reglas activas:", motor.reglas_activas())
    ciclo = None
    if args.ciclo:
        v, a, r = [float(x) for x in args.ciclo.split(",")]
        ciclo = [("verde", v), ("amarillo", a), ("rojo", r)]
    estado, t0, fps, t_prev = "verde", time.time(), 0.0, time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            print("Se perdió la señal de la cámara")
            break
        if ciclo:
            estado = estado_ciclo(time.time() - t0, ciclo)
        salida = motor.procesar_frame(frame, estado)
        vis = salida["frame"]
        for inf in salida["infracciones_nuevas"]:
            print(f"Infracción: {inf['descripcion']} | {inf['clase']} #{inf['id']} (leyendo placa...)")
        ahora = time.time()
        fps = 0.9 * fps + 0.1 / max(1e-6, ahora - t_prev)
        t_prev = ahora
        cv2.putText(vis, f"{fps:4.1f} fps | R rojo  V verde  A amarillo  C linea  Q salir",
                    (20, vis.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.imshow(VENTANA, vis)
        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k in (ord("r"), ord("v"), ord("a")):
            estado, ciclo = {ord("r"): "rojo", ord("v"): "verde", ord("a"): "amarillo"}[k], None
        elif k == ord("c"):
            motor.finalizar()
            cfg = marcar_linea(cap, cfg, ruta)
            motor = crear_motor()

    total = motor.finalizar()
    print(f"Fin: {len(total)} multas guardadas en ./multas y multas.csv")
    cap.release()
    f_csv.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
