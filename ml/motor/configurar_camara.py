"""Configura las reglas de una cámara dibujando sobre la imagen y guarda camara.json.

Uso:  python configurar_camara.py                          (cámara 0 de la compu)
      python configurar_camara.py --fuente 1               (otra cámara)
      python configurar_camara.py --fuente cruce.jpg       (desde una foto del sitio)
      python configurar_camara.py --cargar camara.json     (editar una configuración que ya existe)

Teclas: primero eliges qué dibujar y luego haces clic sobre la imagen.
  L  línea de pare del semáforo: 2 clics para la línea + 1 clic dentro de la intersección
  C  carril con sentido permitido: clics para el polígono, ENTER, luego 2 clics para la flecha (desde, hacia)
  Z  zona de entrada o salida para giros: clics para el polígono, ENTER, y escribes el nombre en la terminal
  M  movimientos permitidos entre zonas (en la terminal, ej. A>B, A>C). Sin esto no se revisan giros
  P  PARE: clics para la zona de parada, ENTER, luego 2 clics para la línea del PARE + 1 clic después de la línea
  V  zona de velocidad: clics para el polígono, ENTER, y escribes el límite en km/h en la terminal
  S  línea continua: clics a lo largo de la línea, ENTER
  H  homografía (para medir en metros): clic en un punto del piso y escribes sus coordenadas reales en metros
     en la terminal (ej. "0 0", "3.5 0", "3.5 20"...). ENTER al terminar, mínimo 4 puntos (mejor 6 a 10)
  U  deshacer el último punto   X  cancelar lo que estás dibujando   B  borrar una regla completa
  F  congelar / descongelar el video   G  guardar   Q  salir

La velocidad necesita homografía. Mide los puntos en el pavimento con cinta o medidor láser (esquinas de las
líneas del carril, marcas del brocal) y usa un mismo origen para todos.
"""
import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np

from motor_infracciones import Homografia, dibujar_config

AYUDA = {
    None: "Elige: L linea pare | C carril | Z zona | M movimientos | P PARE | V velocidad | S linea continua | H homografia",
    "l": "Linea de pare: 2 clics para la linea y 1 clic dentro de la interseccion",
    "c": "Carril: clics para el poligono y ENTER",
    "z": "Zona de giro: clics para el poligono y ENTER (el nombre se escribe en la terminal)",
    "p": "PARE: clics para la zona de parada y ENTER",
    "v": "Zona de velocidad: clics para el poligono y ENTER (el limite se escribe en la terminal)",
    "s": "Linea continua: clics a lo largo de la linea y ENTER",
    "h": "Homografia: clic en un punto del piso y escribe sus metros en la terminal. ENTER al terminar (min 4)",
}
IMAGENES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


class Editor:
    """Lógica del editor sin ventanas (se puede probar sola). preguntar = función que lee texto de la terminal."""

    def __init__(self, W, H, preguntar=input, config=None):
        self.W, self.H = W, H
        self.cfg = config if config is not None else {}
        self.cfg["resolucion"] = [W, H]
        self.preguntar = preguntar
        self.modo, self.etapa, self.puntos, self.tmp = None, 0, [], {}
        self.mensaje = AYUDA[None]
        self.cambios = False

    # ------------------------------------------------------------ entrada
    def tecla(self, k):
        k = k.lower() if len(k) == 1 else k
        if k in ("l", "c", "z", "p", "v", "s", "h"):
            self.modo, self.etapa, self.puntos, self.tmp = k, 0, [], {}
            self.mensaje = AYUDA[k]
        elif k == "m":
            self._movimientos()
        elif k == "enter":
            self._enter()
        elif k == "u":
            if self.puntos:
                self.puntos.pop()
                if self.modo == "h" and self.tmp.get("mundo"):
                    self.tmp["mundo"].pop()
        elif k == "x":
            self._listo("Cancelado. " + AYUDA[None])
        elif k == "b":
            self._borrar()

    def clic(self, x, y):
        if not self.modo:
            return
        p = [int(x), int(y)]
        if self.modo == "h":
            txt = self.preguntar(f"Punto {len(self.puntos) + 1} en ({p[0]}, {p[1]}): metros reales 'x y': ")
            try:
                X, Y = [float(v) for v in str(txt).replace(",", " ").split()[:2]]
            except ValueError:
                self.mensaje = "Coordenadas invalidas, vuelve a hacer clic"
                return
            self.puntos.append(p)
            self.tmp.setdefault("mundo", []).append([X, Y])
            self.mensaje = f"{len(self.puntos)} puntos. Sigue o ENTER para terminar (min 4)"
            return
        self.puntos.append(p)
        if self.modo == "l" and len(self.puntos) == 3:
            self.cfg["linea_pare"], self.cfg["punto_despues"] = self.puntos[:2], self.puntos[2]
            self._listo("Linea de pare guardada")
        elif self.modo == "c" and self.etapa == 1 and len(self.puntos) == 2:
            carriles = self.cfg.setdefault("carriles", [])
            carriles.append({"nombre": f"C{len(carriles) + 1}", "poligono": self.tmp["poligono"],
                             "direccion": self.puntos[:2]})
            self._listo(f"Carril C{len(carriles)} guardado")
        elif self.modo == "p" and self.etapa == 1 and len(self.puntos) == 3:
            self.cfg["pare"] = {"zona": self.tmp["zona"], "linea": self.puntos[:2], "punto_despues": self.puntos[2],
                                "segundos_min": 1.0}
            self._listo("PARE guardado")

    def _enter(self):
        m = self.modo
        if m in ("c", "z", "p", "v") and self.etapa == 0:
            if len(self.puntos) < 3:
                self.mensaje = "El poligono necesita al menos 3 puntos"
                return
            poly = list(self.puntos)
            if m == "c":
                self.tmp["poligono"], self.etapa, self.puntos = poly, 1, []
                self.mensaje = "Ahora 2 clics: la flecha del sentido permitido (desde, hacia)"
            elif m == "p":
                self.tmp["zona"], self.etapa, self.puntos = poly, 1, []
                self.mensaje = "Ahora 2 clics para la linea del PARE y 1 clic despues de la linea"
            elif m == "z":
                zonas = self.cfg.setdefault("zonas", {})
                nombre = str(self.preguntar("Nombre de la zona (ej. A, Norte): ") or "").strip()
                nombre = nombre or chr(ord("A") + len(zonas))
                zonas[nombre] = poly
                falta = "" if "movimientos_permitidos" in self.cfg else " (falta M: movimientos permitidos)"
                self._listo(f"Zona {nombre} guardada{falta}")
            elif m == "v":
                txt = str(self.preguntar("Limite de velocidad en km/h [40]: ") or "").strip()
                try:
                    limite = float(txt) if txt else 40.0
                except ValueError:
                    limite = 40.0
                self.cfg["velocidad"] = {"zona": poly, "limite_kmh": limite, "tolerancia_kmh": 5}
                falta = "" if self.cfg.get("homografia") else " (falta H: homografia para medir)"
                self._listo(f"Zona de velocidad guardada, limite {limite:g} km/h{falta}")
        elif m == "s":
            if len(self.puntos) < 2:
                self.mensaje = "La linea necesita al menos 2 puntos"
                return
            self.cfg.setdefault("lineas_continuas", []).append(list(self.puntos))
            self._listo("Linea continua guardada")
        elif m == "h":
            if len(self.puntos) < 4:
                self.mensaje = "La homografia necesita al menos 4 puntos"
                return
            hom = {"imagen": list(self.puntos), "mundo": list(self.tmp["mundo"])}
            try:
                err = Homografia(**hom).error_m
            except ValueError as e:
                self.mensaje = str(e)
                return
            self.cfg["homografia"] = hom
            aviso = "" if len(self.puntos) > 4 else " (con 4 puntos el error siempre da 0; usa 6 o mas para medirlo)"
            self._listo(f"Homografia guardada, error medio {err:.2f} m{aviso}")

    def _movimientos(self):
        txt = str(self.preguntar("Movimientos permitidos (ej. A>B, A>C, B>A). Vacio = ninguno: ") or "")
        pares = []
        for parte in re.split(r"[,;]", txt):
            if ">" in parte:
                a, b = [s.strip() for s in parte.split(">", 1)]
                if a and b:
                    pares.append([a, b])
        self.cfg["movimientos_permitidos"] = pares
        self._listo(f"{len(pares)} movimientos permitidos guardados")

    def _borrar(self):
        txt = str(self.preguntar("Borrar (linea, carriles, zonas, pare, velocidad, lineas, homografia): ") or "")
        claves = {"linea": ["linea_pare", "punto_despues"], "carriles": ["carriles"],
                  "zonas": ["zonas", "movimientos_permitidos"], "pare": ["pare"], "velocidad": ["velocidad"],
                  "lineas": ["lineas_continuas"], "homografia": ["homografia"]}
        for k in claves.get(txt.strip().lower(), []):
            self.cfg.pop(k, None)
        self._listo("Borrado" if txt.strip().lower() in claves else "No reconoci esa regla")

    def _listo(self, mensaje):
        self.modo, self.etapa, self.puntos, self.tmp = None, 0, [], {}
        self.mensaje = mensaje
        self.cambios = True

    # ------------------------------------------------------------ salida
    def dibujar(self, frame):
        vis = frame.copy()
        dibujar_config(vis, self.cfg)
        if self.cfg.get("linea_pare"):
            a, b = self.cfg["linea_pare"]
            cv2.line(vis, tuple(a), tuple(b), (0, 0, 255), 3)
            if self.cfg.get("punto_despues"):
                cv2.circle(vis, tuple(self.cfg["punto_despues"]), 7, (0, 255, 255), -1)
        if self.tmp.get("poligono") or self.tmp.get("zona"):
            cv2.polylines(vis, [np.asarray(self.tmp.get("poligono") or self.tmp.get("zona"), np.int32)], True,
                          (0, 255, 255), 2)
        for i, p in enumerate(self.puntos):
            cv2.circle(vis, tuple(p), 5, (0, 255, 255), -1)
            if i:
                cv2.line(vis, tuple(self.puntos[i - 1]), tuple(p), (0, 255, 255), 2)
        cv2.rectangle(vis, (0, 0), (vis.shape[1], 30), (0, 0, 0), -1)
        cv2.putText(vis, self.mensaje[:110], (10, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        return vis

    def guardar(self, ruta):
        cfg = {"_ayuda": "Generado con configurar_camara.py. Coordenadas en pixeles de la resolucion indicada.",
               **{k: v for k, v in self.cfg.items() if not str(k).startswith("_")}}
        Path(ruta).write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
        self.cambios = False


def main():
    ap = argparse.ArgumentParser(description="Dibuja las reglas de la cámara y guarda camara.json")
    ap.add_argument("--fuente", default="0", help="índice de la cámara, URL, video o foto")
    ap.add_argument("--salida", default="camara.json")
    ap.add_argument("--cargar", default=None, help="configuración existente para editar")
    args = ap.parse_args()

    cap, frame = None, None
    if Path(args.fuente).suffix.lower() in IMAGENES:
        frame = cv2.imread(args.fuente)
        if frame is None:
            raise SystemExit(f"No pude leer {args.fuente}")
    else:
        cap = cv2.VideoCapture(int(args.fuente) if str(args.fuente).isdigit() else args.fuente)
        ok, frame = cap.read() if cap.isOpened() else (False, None)
        if not ok:
            raise SystemExit(f"No pude abrir la fuente {args.fuente}")
    H, W = frame.shape[:2]
    cfg = json.loads(Path(args.cargar).read_text(encoding="utf-8")) if args.cargar else None
    if cfg and cfg.get("resolucion") and list(cfg["resolucion"]) != [W, H]:
        print(f"Aviso: la configuración se dibujó a {cfg['resolucion']} y la cámara da {[W, H]}")
    ed = Editor(W, H, config=cfg)

    ventana = "Configurar camara"
    try:
        cv2.namedWindow(ventana, cv2.WINDOW_NORMAL)
    except cv2.error:
        raise SystemExit("OpenCV no puede abrir ventanas. Corre: pip uninstall -y opencv-python-headless "
                         "opencv-python && pip install opencv-python")
    cv2.setMouseCallback(ventana, lambda ev, x, y, *_: ed.clic(x, y) if ev == cv2.EVENT_LBUTTONDOWN else None)
    print(__doc__)
    congelado = cap is None
    while True:
        if not congelado:
            ok, f = cap.read()
            if ok:
                frame = f
        cv2.imshow(ventana, ed.dibujar(frame))
        k = cv2.waitKey(30) & 0xFF
        if k == 255:
            continue
        if k in (13, 10):
            ed.tecla("enter")
        elif k == ord("g"):
            ed.guardar(args.salida)
            cv2.imwrite(str(Path(args.salida).with_suffix(".referencia.jpg")), frame)
            ed.mensaje = f"Guardado en {args.salida} (y una foto de referencia para detectar si la camara se movio)"
            print(ed.mensaje)
        elif k == ord("f") and cap is not None:
            congelado = not congelado
        elif k == ord("q"):
            if ed.cambios and input("Hay cambios sin guardar. ¿Guardar? [s/n]: ").strip().lower().startswith("s"):
                ed.guardar(args.salida)
                print("Guardado en", args.salida)
            break
        else:
            ed.tecla(chr(k))
    if cap is not None:
        cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
