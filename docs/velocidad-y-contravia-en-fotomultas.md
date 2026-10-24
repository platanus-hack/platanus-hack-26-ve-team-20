# Geometría, no entrenamiento, resuelve velocidad y contravía

El sistema actual (YOLO + ByteTrack + detector de placas + EasyOCR) se puede extender a exceso de velocidad, contravía, PARE, giros prohibidos, vuelta en U y línea continua **sin entrenar ningún modelo nuevo de infracciones**: todo sale de las trayectorias que ya produce ByteTrack, de una configuración por cámara (polígonos, líneas y direcciones permitidas) y, en el caso de la velocidad, de una homografía calibrada con 4 o más puntos medidos en el pavimento. Un pipeline muy parecido al de ustedes (YOLOv8 + ByteTrack + homografía) midió con un **error absoluto medio de 1,69 km/h** frente a pistola de velocidad, mientras que los métodos que estiman la escala solos, sin medir el sitio, pasan de 8 a 21 km/h de error cuando esa escala sale mal, así que la precisión depende de la cinta métrica, del reloj y de la cámara, no de la red neuronal. Google Maps no sirve para esto: su API de límites solo se vende a flotas de 20.000 o más activos, la tabla de cobertura de Google marca ese dato como no disponible en Venezuela, ninguna API suya expone el sentido de la vía y sus términos **prohíben guardar el contenido y usarlo (Street View incluido) para entrenar, probar o validar modelos**. OpenStreetMap sí trae `oneway` y `maxspeed` con una licencia que permite guardarlos, pero solo el 8,5% de las vías venezolanas tiene límite etiquetado, de modo que el valor legal sale de la señal vertical o, si no hay señal, del art. 254 del Reglamento (40 km/h urbano, 15 km/h en intersecciones). Lo único que de verdad pide más datos de entrenamiento es el detector de vehículos (motos, por puestos, noche) y, sobre todo, hace falta video propio de Caracas para validar cada regla. En lo legal, la velocidad es la infracción más exigente: la Ley de Metrología somete a control a los instrumentos usados en actos administrativos, la norma OIML R 91-1:2025 ya acepta medidores por video pero con ±3 km/h y ensayo de tipo, y en Venezuela y la región solo una autoridad competente puede emitir la multa. La ruta realista es lanzar primero semáforo en rojo y contravía en convenio con una alcaldía, con revisión humana de cada evento, y dejar la velocidad como estimación no sancionatoria hasta homologarla.

## La velocidad sale de una homografía medida en el pavimento

Todas las técnicas para medir velocidad con una cámara fija terminan en lo mismo: convertir la posición del vehículo en la imagen a metros sobre el plano de la vía y dividir entre el tiempo. Hay cuatro familias (dos líneas virtuales a distancia conocida, homografía con puntos medidos, autocalibración por puntos de fuga y regresión aprendida), y la revisión más completa del tema concluye que **la homografía es la más usada** en sistemas fijos, aunque exige una calibración precisa, y que no existe ningún trabajo que compare experimentalmente los enfoques entre sí ([Fernández Llorca et al.](https://ar5iv.labs.arxiv.org/html/2101.06159)). Las dos líneas funcionan si la base es larga y el tracking es bueno: una tesis ecuatoriana con YOLOv8 + DeepSORT logró **±3,16 km/h (4,74%)** contra un velocímetro GPS ([UPS Guayaquil](https://dspace.ups.edu.ec/handle/123456789/31291?mode=full)), mientras que un trabajo con líneas separadas unos 6 m y detección clásica promedió **20,86% de error** ([Arriffin et al.](https://joiv.org/index.php/joiv/article/download/1820/640)). La autocalibración por puntos de fuga funciona bien en autopista (alrededor de 1 km/h en BrnoCompSpeed, como se ve abajo), pero su punto débil es la escala: el método totalmente automático FullACC promedia 8,59 km/h de error en ese mismo benchmark y sus autores concluyen que la calibración automática "still has too large errors" ([BrnoCompSpeed](https://arxiv.org/pdf/1702.06441)), y FARSEC, que estima la escala con una red de profundidad, llega a **21,24 km/h de error medio** con un peor caso de 383 km/h, al punto de que sus autores piden no usarlo en lugar de radares policiales ([FARSEC](https://arxiv.org/pdf/2309.14468)). Los modelos de extremo a extremo solo se han probado con datos sintéticos de CARLA (MAE de 1,26 a 3,27 km/h) y sus autores reconocen que falta cerrar la brecha entre simulación y realidad ([Hernández Martínez et al.](https://arxiv.org/pdf/2104.09903)). Para una cámara que ustedes controlan y pueden medir, la homografía manual es la mejor relación entre precisión y complejidad, y además es auditable, algo que un modelo de regresión no ofrece.

Las cifras a esperar dependen mucho del escenario. En autopista, de día y con video Full HD a 50 fps, los mejores métodos sobre BrnoCompSpeed (cajas 3D más calibración por puntos de fuga) bajan a **0,78 a 0,79 km/h de error medio** ([Macko, Gajdošech y Kocur](https://arxiv.org/pdf/2505.01203)). Lo más parecido a su stack es el trabajo de Kamil et al. con YOLOv8 + ByteTrack, una homografía estimada con una red para llevar la imagen a vista cenital y una regresión lineal de corrección, validado contra pistola de velocidad en 2.408 vehículos: **MAE ≈1,69 km/h y RMSE ≈2,38 km/h** ([IEEE Access 2024](https://doaj.org/article/057c20b8ef5843dd94eb2d186b0daf7f)). En una vía urbana brasileña junto a un semáforo, siguiendo rasgos de la placa con una homografía por carril, el 96,0% de los vehículos quedó dentro de la tolerancia legal de [-3, +2] km/h, pero con rasgos de todo el vehículo solo el 73,4% ([Luvizon et al.](https://pessoal.dainf.ct.utfpr.edu.br/rminetto/projects/vehicle-speed/Paper_ITS_final.pdf)). Y en tráfico urbano denso, midiendo cuadro a cuadro, el error porcentual medio subió a **20,9%** ([Bell et al.](https://isprs-annals.copernicus.org/articles/V-2-2020/419/2020/)). La lectura práctica: un prototipo bien calibrado en Caracas debería apuntar a 1 a 3 km/h de error medio con casos aislados por encima de 5 km/h, lo cual sirve para analítica pero no alcanza para multar sin una tolerancia generosa y revisión humana.

### Los errores vienen de la escala, del punto de referencia y del reloj

El error de distancia crece con el **cuadrado de la distancia a la cámara**, y la relación metros por píxel también ([Fernández Llorca et al.](https://ar5iv.labs.arxiv.org/html/2101.06159)), por eso conviene medir cerca y con buena resolución. El punto de referencia importa: el centro inferior de la caja 2D salta cuando hay oclusiones o la caja se recorta, y el método asume vía plana ([Roboflow](https://roboflow.com/blog/estimate-speed-computer-vision)); en el estudio brasileño, la altura de la placa sobre el pavimento sobreestimaba la velocidad de autobuses y camiones y fue "the main cause of speed measurement errors", corregida con un factor de 0,9 ([Luvizon et al.](https://pessoal.dainf.ct.utfpr.edu.br/rminetto/projects/vehicle-speed/Paper_ITS_final.pdf)). El reloj es la trampa más silenciosa: la revisión recomienda sellos de tiempo por imagen sincronizados por NTP en vez del fps nominal ([Fernández Llorca et al.](https://ar5iv.labs.arxiv.org/html/2101.06159)), y un estudio forense encontró cámaras CCTV con fps variable a 14,99 cuadros por segundo ([ForeSpeed](https://arxiv.org/html/2512.19364v1)).

Un cálculo propio ilustra por qué la base de medición manda. A 60 km/h (16,7 m/s), recorrer 10 m toma 0,6 s; a 30 fps cada cruce de línea tiene una incertidumbre de ±1 cuadro (33 ms), y en el peor caso los dos cruces suman 66 ms, es decir **hasta 11% de error**. Con una base de 25 m (1,5 s) ese mismo error baja a cerca de 4%. Lo mismo pasa con la posición: ±0,25 m de bailoteo del punto inferior en cada extremo son ±5% en 10 m y ±2% en 25 m. Alargar la base e interpolar el instante exacto de cruce entre dos cuadros es la mejora más barata. Ojo también con la referencia de validación: en BrnoCompSpeed un GPS de consumo tuvo **1,64 km/h de error medio** contra LiDAR y un radar 1,07 km/h ([BrnoCompSpeed](https://arxiv.org/pdf/1702.06441)), así que validar con el GPS del teléfono ya trae 1 a 2 km/h de ruido propio.

### SpeedEstimator de Ultralytics es un demo; la plantilla buena es supervision

El `SpeedEstimator` de Ultralytics usa un `meter_per_pixel` constante (0,05 por defecto) sin corrección de perspectiva, toma la distancia entre el primer y último punto de solo `max_hist` = 5 cuadros, calcula el tiempo por conteo de cuadros y no por sello de tiempo, trunca a entero y congela la velocidad del ID ([código fuente](https://raw.githubusercontent.com/ultralytics/ultralytics/main/ultralytics/solutions/speed_estimation.py)); la propia documentación advierte que "Speed will be an estimate and may not be completely accurate" ([Ultralytics](https://docs.ultralytics.com/guides/speed-estimation/)). Sirve para una demo, no para multar. Además, Ultralytics cambió su tracker por defecto a `tracktrack.yaml`, así que hay que pasar `tracker="bytetrack.yaml"` explícitamente para conservar ByteTrack ([Ultralytics track](https://docs.ultralytics.com/modes/track/)).

La plantilla correcta es el ejemplo de velocidad de Roboflow supervision: un `ViewTransformer` basado en `cv2.getPerspectiveTransform` que lleva un trapecio de la vía a un rectángulo métrico, el ancla `BOTTOM_CENTER` de cada caja, una cola de un segundo de historia por track y velocidad mostrada solo tras 0,5 s de datos ([ultralytics_example.py](https://raw.githubusercontent.com/roboflow/supervision/develop/examples/speed_estimation/ultralytics_example.py)). Los puntos SOURCE/TARGET se ajustan para cada vista de cámara; supervision es MIT, Ultralytics es **AGPL-3.0** y RF-DETR es Apache-2.0 ([README](https://raw.githubusercontent.com/roboflow/supervision/develop/examples/speed_estimation/README.md)), detalle a revisar si Lowtech lo va a vender como producto. Si usan el ByteTrack de supervision, tengan presente que en la versión 0.29.0 `sv.ByteTrack` quedó obsoleto a favor de `ByteTrackTracker` del paquete `trackers`, con `update()` en lugar de `update_with_detections()` y eliminación prevista en 0.30.0 ([supervision](https://supervision.roboflow.com/0.29.0/deprecated/)); desde `trackers` 2.4.0, `update()` devuelve una copia nueva en vez de modificar la entrada ([changelog](https://trackers.roboflow.com/develop/changelog/)).

La integración recomendada es mantener `model.track(frame, persist=True, tracker="bytetrack.yaml")`, transformar el punto inferior central de cada track con una homografía (`cv2.findHomography` con 4 o más puntos medidos, RANSAC si son más de 4), guardar (tiempo, X, Y) en metros y calcular **una sola velocidad por vehículo** entre dos líneas del plano métrico separadas 15 a 25 m, con interpolación del instante de cruce, o con una pendiente robusta sobre toda la trayectoria dentro de la zona. Esa velocidad se amarra a la placa leída para el mismo `tracker_id`, igual que ya lo hacen con el semáforo.

### La cámara pesa más que el algoritmo

La resolución baja destruye la precisión: el mismo método que daba 2,15 km/h en BrnoCompSpeed subió a **12,8 km/h** en CCTV coreano de baja resolución con carros de unos 20 píxeles ([Revaud y Humenberger](https://openaccess.thecvf.com/content/ICCV2021/papers/Revaud_Robust_Automatic_Monocular_Vehicle_Speed_Estimation_for_Traffic_Surveillance_ICCV_2021_paper.pdf)). Los montajes de investigación usan 1080p a 50 fps (BrnoCompSpeed) o hasta 160 fps con teleobjetivos y disparo por hardware, con MAE de 1,44 km/h ([Llorca et al.](https://invett.aut.uah.es/sotelo/ITSC16_0449.pdf)). Como referencia de geometría, un fabricante de cámaras de velocidad recomienda montar a **7 m de altura** (mínimo 4, máximo 10), inclinación de -13°, punto de disparo a 30 m (15 a 40 m), un tramo recto despejado de 50 a 60 m y 1 a 2 carriles por cámara; además, un giroscopio marca los eventos como "no certificados" si la cámara se mueve ([Adaptive Recognition](https://adaptiverecognition.com/app/uploads/DOC/Cameras/Vidar_Speed_Cameras_for_Speed_Enforcement_and_ANPR/Vidar_Speed_Consolidation/Optimizing_Speed_Camera_Performance.pdf)). Para que la placa no salga corrida, el obturador debe ser 1/(11 × velocidad máxima en km/h), es decir **1/1000 s hasta 90 km/h**, y los filtros IR exigen iluminador IR incluso de día ([Milestone](https://doc.milestonesys.com/2024r2/pl-PL/add-ons/add-on_lpr/lpr_lensandshutterspeed.htm)). No hay ningún benchmark público de velocidad nocturna: BrnoCompSpeed y los demás son diurnos ([FARSEC](https://arxiv.org/pdf/2309.14468)).

Con eso, la especificación sensata para el piloto es 1080p como mínimo (mejor 4 MP), 25 a 30 fps reales, obturador fijo de 1/1000 s o más rápido, WDR e iluminador IR, poste de 5 a 8 m mirando a lo largo del carril, y una zona de medición de 15 a 30 m recta y plana que empiece a unos 10 a 15 m de la cámara. En una intersección, la zona de velocidad va en el tramo de aproximación antes de la línea de detención, donde nadie está cruzando; la cámara del semáforo sirve para ambas cosas solo si ese tramo es recto y cae en una parte de la imagen con buena resolución. Guarden una imagen de referencia por cámara y comparen periódicamente con emparejamiento de rasgos: un poste que se mueve un poco invalida la homografía.

## Contravía, PARE y giros prohibidos son reglas sobre la trayectoria

Ningún sistema publicado de detección de contravía entrena un "clasificador de contravía": todos usan un detector comercial o preentrenado, un tracker y una regla geométrica que compara el movimiento con la dirección permitida. Un trabajo de Bangladesh usó YOLOv3 con pesos COCO y un tracker de centroides, detectó los 3 casos de su prueba y reconoce que el tracker intercambia IDs cuando los objetos se solapan ([arXiv 2210.10226](https://ar5iv.labs.arxiv.org/html/2210.10226)). Una revisión de 2026 con ByteTrack y un umbral de desviación angular reporta **92,4% a 94,0% de exactitud** y 4,2% a 6,5% de falsos positivos sobre UA-DETRAC, aunque no explica cómo etiquetó la contravía en ese dataset ([Choudhary y Singh](https://www.atlantis-press.com/article/126027946.pdf)). Kit et al. (2025) usan YOLOv8 + ByteTrack con pares de polígonos de entrada y salida por carril y una tabla de patrones de ocupación, y solo pudieron evaluar cualitativamente "due to the absence of labeled datasets"; las rotondas les dan resultados "unknown" ([IJACSA](https://thesai.org/Downloads/Volume16No6/Paper_86-Dynamic_Polygon_Based_Reverse_Driving_Detection_Technique.pdf)). Un sistema tailandés aprende la orientación de la vía con un minuto de tráfico y reporta **95,23%**, pero falla con líneas borrosas, sombras, curvas y vehículos lejanos ([Sustainability 2022](https://www.mdpi.com/2071-1050/14/16/10232)).

El dato más útil para ustedes viene de Iowa: con 10 cámaras de día, YOLOv3 + SORT tuvo **precisión 0,75** (recall 0,96), mientras que NVIDIA DeepStream, con mejor tracking, llegó a **0,99** (recall 0,97), y el sistema estricto con SORT marcaba muchos eventos normales como contravía ([InTrans, Iowa State](https://cwims.intrans.iastate.edu/wp-content/uploads/2020/12/wwd_detection_automation_using_CCTV_cameras_t2.pdf)). Es decir, **el enemigo es el cambio de ID de ByteTrack, no el detector**. Por eso la regla debe medir el desplazamiento en una ventana de aproximadamente 1 s sobre el plano métrico, exigir un desplazamiento mínimo en metros, exigir un ángulo mayor a unos 135° contra la dirección permitida durante varios chequeos seguidos, exigir una edad mínima del track y confirmar con el orden de zonas (pasar por la salida antes que por la entrada). En Caracas hay que contar además con falsos positivos que ningún paper cuantifica: motos que zigzaguean y se mueven de lado, carros que retroceden para estacionar, autobuses y por puestos que se orillan, y gente empujando la moto contra el flujo. Ningún umbral publicado está validado para tráfico latinoamericano, así que los valores iniciales hay que calibrarlos con video local.

El PARE se resuelve igual. El demo de Roboflow usa RF-DETR con pesos COCO y tres zonas dibujadas una sola vez (la vía que gobierna la señal, una zona de parada junto a la línea blanca y una zona de salida), considera "detenido" a un vehículo cuyo centro se mueve **menos de 15 píxeles por segundo**, evalúa solo al primero de la cola y no usa ningún detector de señales; agrega un detector de ruedas opcional para ubicar la rueda delantera, y su video de demostración salió de GTA V ([Roboflow](https://roboflow.com/blog/stop-sign-violation-detection)). No encontré ningún estudio revisado por pares con métricas de detección de PARE por cámara, aunque sí patentes específicas en EE. UU. ([USPTO 11900657](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11900657)). Con la homografía, la regla mejora: se exige velocidad menor a 1 o 2 km/h durante al menos 1 s dentro de la zona de parada antes de cruzar la línea.

Los giros prohibidos, el "no entre" y la vuelta en U son pares (zona de entrada, zona de salida). Rathore et al. agrupan automáticamente los puntos de inicio y fin de las trayectorias en polígonos de entrada y salida, clasifican cada trayectoria por punto en polígono y logran **3,4% de error mediano** en 25 cámaras de Bengaluru, con mejores regiones cuando calibran con clips de al menos 60 minutos que incluyan hora pico ([arXiv 2607.10949](https://arxiv.org/abs/2607.10949)). El mismo mecanismo da la infracción: si el par no está en la tabla de movimientos permitidos, es giro prohibido, y si entra y sale por el mismo brazo, es vuelta en U. La línea continua es un cruce de polilínea: el `LineZone` de supervision tiene `minimum_crossing_threshold` para exigir varias observaciones del otro lado antes de contar el cruce, y requiere `tracker_id` ([LineZone](https://supervision.roboflow.com/latest/detection/tools/line_zone)); el `PolygonZone` evalúa por defecto el ancla `BOTTOM_CENTER` ([PolygonZone](https://supervision.roboflow.com/latest/detection/tools/polygon_zone/)). Como referencia del semáforo que ya tienen, una implementación abierta que marca infracción cuando el centro del vehículo cruza la línea en rojo reporta F1 de 0,93 en 20 videos ([GitHub](https://github.com/AnhDai1997/Fully-Automated-red-light-Violation-Detection)).

Con una cámara fija **no hace falta detectar la señal**: su ubicación y significado se configuran una vez. Un detector de señales solo tiene sentido para cámaras PTZ o móviles, para autoconfigurar cámaras nuevas, para dejar evidencia de que la señal existía y era visible, o para señales temporales. Si algún día lo necesitan, la señalización venezolana se rige por el Manual Venezolano de Dispositivos Uniformes para el Control del Tránsito, basado en el MUTCD de EE. UU., con el octágono rojo que dice "PARE" ([Wikipedia: Road signs in South America](https://en.wikipedia.org/wiki/Road_signs_in_South_America); [Wikipedia: Stop sign](https://en.wikipedia.org/wiki/Stop_sign)), y en los países de influencia MUTCD casi todas las prohibiciones usan un círculo rojo con barra ([Wikipedia: MUTCD](https://en.wikipedia.org/wiki/Comparison_of_MUTCD-influenced_traffic_signs)). No pude acceder al texto del manual venezolano, pero esto sugiere que datasets de la familia MUTCD (LISA) o con imágenes sudamericanas (Mapillary) transferirían razonablemente.

## Solo el detector de vehículos necesita más datos de entrenamiento

La pregunta "¿qué hay que entrenar?" tiene una respuesta corta: casi nada nuevo. Lo que sí se entrena es el detector de vehículos (ajuste fino con footage local) y lo que ya tienen de placas. Todo lo demás es configuración, calibración y validación.

| Función | ¿Entrenar? | Qué necesita en realidad |
|---|---|---|
| Detección de vehículos | Sí, ajuste fino recomendado | Datasets actuales + unos cientos de cuadros de Caracas etiquetados (motos, por puestos, autobuses, noche, lluvia) |
| Placas + EasyOCR | Ya está | Medir el OCR a la distancia real de cada cámara; placas de moto opcional |
| Exceso de velocidad | No | Homografía por cámara con puntos medidos, sellos de tiempo reales, video de validación con GPS o radar |
| Contravía / no entre | No | Polígono por carril + dirección permitida; video normal y escenificado |
| PARE | No (detector de ruedas opcional) | Línea y zona de parada, umbral de "detenido" |
| Giro prohibido / vuelta en U | No | Zonas de entrada y salida + tabla de movimientos permitidos |
| Línea continua | No | Polilínea dibujada sobre la imagen |
| Semáforo en rojo | Ya está | Línea de detención + estado de la app (amarillo = verde) |
| Detector de señales | Opcional | Solo para autoconfiguración, evidencia o cámaras PTZ |

Para validar la velocidad antes de grabar en Caracas, el dataset público más parecido a su caso es el de la UTFPR: 20 videos (291 minutos, 1080p a 30,15 fps) de una vía urbana junto a un semáforo, con placas brasileñas y velocidad de referencia de lazos inductivos aprobados por Inmetro; ojo, los lazos solo dieron velocidad al 43% de las motos ([Luvizon et al.](https://pessoal.dainf.ct.utfpr.edu.br/rminetto/projects/vehicle-speed/Paper_ITS_final.pdf)), y está libre "for research purposes" ([UTFPR](https://pessoal.dainf.ct.utfpr.edu.br/rminetto/projects/vehicle-speed/)). El estándar para compararse con lo publicado es BrnoCompSpeed (18 videos 1080p a 50 fps, 20.865 vehículos, compuertas LiDAR a 28 m), que se pide por correo, pesa unos 200 GB y no indica licencia ([GitHub](https://github.com/JakubSochor/BrnoCompSpeed)). Ninguno de los dos está en Kaggle; los datasets de Kaggle titulados "vehicle speed" no se pudieron verificar ([rkuo2000](https://www.kaggle.com/datasets/rkuo2000/vehicle-speed)). UA-DETRAC no trae velocidad ([UA-DETRAC](https://ar5iv.arxiv.org/html/1511.04136)) y la velocidad de referencia del AI City 2018 nunca se publicó ([VS13](https://ar5iv.labs.arxiv.org/html/2212.01651)). Tampoco hay ningún dataset público de velocidad urbana nocturna.

Para contravía la situación es más clara todavía: **no existe un dataset público de video con contravías etiquetadas**. Los benchmarks de anomalías como el AI City 2021 Track 4 son de vehículos detenidos y choques ([arXiv 2105.03827](https://ar5iv.arxiv.org/html/2105.03827)) y TAD es de accidentes ([arXiv 2209.12386](https://ar5iv.labs.arxiv.org/html/2209.12386)). El set de Roboflow con clases `right-side` y `wrong-side` (636 imágenes) no sirve para multar ([Roboflow](https://universe.roboflow.com/imageprocessingworkspace/wrong-way-driving-detection-3hzo7)), porque la contravía es una propiedad temporal de la trayectoria respecto al carril y no se ve en una sola imagen. El esfuerzo de datos, entonces, está en grabar video propio, como se detalla al final.

## Google Maps no conoce los límites de Caracas; OSM sirve de punto de partida

Primero una aclaración de concepto: los datos de mapas (límite de velocidad, sentido único o doble) **configuran las reglas** de cada cámara, es decir, qué velocidad es infracción y qué dirección es contravía. **No entrenan el modelo de visión**, que se entrena con imágenes etiquetadas de vehículos y placas y cuyas salidas (trayectorias, velocidades) se comparan contra esas reglas.

Google sí tiene un endpoint de límites de velocidad en la Roads API, sin aviso de obsolescencia, pero solo está disponible "to all customers with an Asset Tracking license" ([Google Roads API](https://developers.google.com/maps/documentation/roads/speed-limits)), un paquete para flotas que exige administrar **al menos 20.000 activos** y firmar contrato con atestación de un ejecutivo C-level ([Google Asset Tracking](https://developers.google.com/maps/solutions/asset-tracking/asset-tracking-plan)). Cuesta USD 20 por cada 1.000 entradas tras 5.000 gratis al mes ([precios](https://developers.google.com/maps/billing-and-pricing/pricing)), Google advierte que su exactitud "cannot be guaranteed" y no es en tiempo real ([Google Roads API](https://developers.google.com/maps/documentation/roads/speed-limits)), y su tabla oficial de cobertura marca Speed Limits como **no disponible o de baja calidad en Venezuela** ([cobertura](https://developers.google.com/maps/coverage)). El sentido de circulación no aparece como atributo en ninguna API: la Routes API no tiene campo de límite ni de sentido único, y su `speedReadingIntervals` describe congestión, no límites legales ([Routes API](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)).

Aun con acceso, los términos lo bloquean. La cláusula 3.2.3(a) prohíbe extraer o almacenar contenido fuera de los servicios y la descarga masiva de imágenes de Street View e información vial; la 3.2.3(b) prohíbe el caché; la 3.2.3(c)(vii) prohíbe expresamente "use Google Maps Content to improve machine learning and artificial intelligence models, including to train, test, validate or fine-tune the models"; la 3.2.3(e) prohíbe usarlo junto a un mapa que no sea de Google; y el descargo dice que el servicio es "FOR PLANNING PURPOSES ONLY" ([Términos de Google Maps Platform](https://cloud.google.com/maps-platform/terms)). Para la Roads API solo se permite cachear latitud y longitud por 30 días, nada sobre límites ([Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)), y de Street View solo se pueden guardar los IDs de panorama ([políticas de Street View](https://developers.google.com/maps/documentation/streetview/policies)). Traducido: no pueden guardar "límite 40, sentido norte a sur" sacado de Google en su base de configuración, **no pueden usar Street View para entrenar ni validar el YOLO ni un detector de señales**, y ante un reclamo el límite que vale es el de la señal o la norma, no el de un mapa "para planificación".

OpenStreetMap sí sirve como punto de partida. Tiene `oneway=yes/no/-1`, donde `-1` indica que el sentido es contrario al orden en que se dibujó la vía ([OSM Wiki: oneway](https://wiki.openstreetmap.org/wiki/Key:oneway)), y `maxspeed` en km/h por defecto ([OSM Wiki: maxspeed](https://wiki.openstreetmap.org/wiki/Key:maxspeed)); Overpass permite traer todas las vías en un radio en metros con su geometría ([Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)). La ODbL exige atribución y solo obliga a compartir la base derivada si se hace "Public Use" de ella ([OSMF FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ); [OSM copyright](https://www.openstreetmap.org/copyright)), así que guardar la configuración internamente está permitido. El problema es la cobertura: de **501.825 vías venezolanas, solo 42.445 tienen `maxspeed` (8,5%) y 64.846 tienen `oneway` (12,9%)** ([taginfo highway](https://taginfo.geofabrik.de/south-america:venezuela/api/4/key/stats?key=highway); [maxspeed](https://taginfo.geofabrik.de/south-america:venezuela/api/4/key/stats?key=maxspeed); [oneway](https://taginfo.geofabrik.de/south-america:venezuela/api/4/key/stats?key=oneway)), y el valor de `maxspeed` más frecuente es 20 km/h (15.654 vías), que no coincide con ningún límite legal general y huele a edición masiva que hay que auditar ([taginfo valores](https://taginfo.geofabrik.de/south-america:venezuela/api/4/key/values?key=maxspeed&filter=ways&rp=25&sortname=count&sortorder=desc)). Que una calle no tenga `oneway` no significa que sea de doble sentido, y para multar por contravía eso no se puede asumir. No pude medir la cobertura específica de Caracas. Los comerciales no resuelven esto: un revendedor de HERE lista límites para Venezuela solo en vías de clase funcional 1 y 2 ([Europa Technologies](https://www.europa.uk.com/map-data/here-maps/country/?cc=ve)), TomTom expone `speedLimits` por elemento de vía sin cobertura documentada para el país ([TomTom](https://docs.tomtom.com/snap-to-roads-api/documentation/snap-to-roads-api/synchronous-snap-to-roads)), y Mapbox tiene `maxspeed` en beta y una capa de calles basada en parte en OSM ([Mapbox](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/)).

El valor legal sale de la señal. El art. 254 del Reglamento de la Ley de Tránsito Terrestre dice que las velocidades "serán las que indiquen las señales de tránsito" y, sin señales, **40 km/h en zonas urbanas y 15 km/h en intersecciones** ([vLex Venezuela](https://vlexvenezuela.com/vid/zmbrano-acusadores-canga-ludwin-303287806)), con 70 km/h de día y 50 de noche en carreteras y 90 km/h en el canal izquierdo y 70 en el derecho en autopistas ([Seminario Derecho del Tránsito](http://seminarioderechodeltransito.blogspot.com/2012/10/velocidades-maximas-de-conduccion-en.html)). Una resolución conjunta de febrero de 2024 fija autopistas 70, troncales 60, urbano 40, intersecciones 15 y carga pesada 45 km/h ([NTN24](https://www.ntn24.com/noticias-actualidad/nueva-resolucion-de-transito-limita-velocidad-del-transporte-publico-y-privado-en-venezuela-473425)); expertos consultados en 2025 dicen que esos valores siguen vigentes ([Meridiano](https://meridiano.net/servicios/servicios/aclaracion-sobre-los-limites-de-velocidad-en-venezuela-2025869560)), y la G.O. 42.779 de diciembre de 2023 fijó los 45 km/h para carga de 3.500 kg o más ([Acceso a la Justicia](https://accesoalajusticia.org/se-establece-un-limite-maximo-de-velocidad-permitida-de-45-kms-h-para-vehiculos-de-carga-con-peso-igual-o-superior-a-3-500kgs/)). En autopistas urbanas como la Francisco Fajardo hay discrepancia (90/70 contra 70), así que hay que confirmarlo con el INTT antes de multar.

El flujo por cámara queda así: con la lat/lon de la cámara se consulta OSM, se calcula el rumbo del tramo entre sus dos nodos más cercanos (si `oneway=yes` ese es el sentido permitido, si es `-1` el opuesto), se compara con el rumbo óptico de la cámara para saber si el tráfico legal se acerca o se aleja, se verifica en sitio y se dibuja todo sobre la imagen. El mapa da el valor de la regla; la imagen define dónde y en qué dirección se aplica. Una consulta típica:

```
[out:json];
way(around:30,10.4961,-66.8530)["highway"];
out tags geom;
```

La configuración manual sigue siendo obligatoria por cinco razones: el GPS de la cámara y la geometría de OSM pueden asociarla a la vía equivocada en distribuidores o avenidas con calzadas separadas; ByteTrack trabaja en píxeles y la dirección permitida hay que proyectarla a la imagen; existen excepciones locales como canales de autobús en contraflujo o canales reversibles por horario; la velocidad necesita calibración métrica independiente del mapa; y la multa debe basarse en la señal vigente documentada con foto y fecha, no en un dato sin garantía.

## MotorInfracciones necesita un JSON por cámara y seis reglas

No conozco la firma exacta de su clase `MotorInfracciones`, así que la propuesta asume lo que describen: un motor que por cada cuadro recibe las detecciones con `tracker_id` de ByteTrack, el sello de tiempo y el estado del semáforo de la app. La extensión consiste en cargar un JSON versionado por cámara, mantener un estado por track (historia de puntos en píxeles y en metros, zonas visitadas, cruces) y evaluar una función por regla. El JSON se dibuja una vez sobre un cuadro congelado, con la herramienta PolygonZone de Roboflow que usa su tutorial de PARE ([Roboflow](https://roboflow.com/blog/stop-sign-violation-detection)) o con un editor dentro de su propia app. Este ejemplo (coordenadas ilustrativas) es una calle de doble sentido que llega a una intersección con semáforo: el carril derecho se aleja de la cámara hacia la línea de detención y el izquierdo viene de vuelta.

```json
{
  "camara_id": "CCS-LIB-001",
  "version_config": "2026-10-23.1",
  "ubicacion": { "lat": 10.4961, "lon": -66.8530, "rumbo_camara_deg": 182 },
  "reloj": { "fuente_tiempo": "pts_rtsp", "sincronizacion": "ntp" },
  "semaforo": { "fuente": "app_simulada", "amarillo_cuenta_como": "verde" },
  "homografia": {
    "puntos_imagen":  [[412, 655], [1490, 660], [1210, 340], [690, 338]],
    "puntos_suelo_m": [[0.0, 0.0], [7.0, 0.0], [7.0, 25.0], [0.0, 25.0]],
    "control_imagen":  [[950, 500], [600, 420]],
    "control_suelo_m": [[3.5, 8.0], [0.5, 15.0]],
    "error_max_control_m": 0.15
  },
  "carriles": [
    {
      "id": "C1_se_aleja",
      "poligono": [[951, 657], [1490, 660], [1210, 340], [950, 339]],
      "direccion_permitida": [0.0, 1.0],
      "limite_kmh": 40,
      "fuente_limite": "senal_vertical",
      "foto_senal": "evidencia/CCS-LIB-001_senal_2026-10-20.jpg"
    },
    {
      "id": "C2_se_acerca",
      "poligono": [[412, 655], [951, 657], [950, 339], [690, 338]],
      "direccion_permitida": [0.0, -1.0],
      "limite_kmh": 40,
      "fuente_limite": "reglamento_art_254_urbano"
    }
  ],
  "velocidad": { "y_linea_a_m": 3.0, "y_linea_b_m": 18.0, "tolerancia_kmh": 10 },
  "linea_detencion": [[950, 345], [1215, 347]],
  "zona_detencion": [[950, 345], [1215, 347], [1250, 400], [950, 398]],
  "regla_linea": "semaforo",
  "zonas_entrada": { "S": [[950, 420], [1290, 423], [1250, 400], [950, 398]] },
  "zonas_salida": {
    "N": [[960, 330], [1200, 332], [1180, 290], [965, 288]],
    "E": [[1225, 335], [1500, 325], [1500, 270], [1200, 285]],
    "O": [[420, 330], [690, 333], [700, 285], [420, 270]],
    "S": [[700, 330], [945, 332], [945, 300], [715, 298]]
  },
  "movimientos_permitidos": [["S", "N"], ["S", "E"]],
  "lineas_continuas": [{ "id": "LC_central", "puntos": [[951, 657], [950, 339]] }],
  "parametros": {
    "edad_min_track_frames": 15,
    "contravia_ventana_s": 1.0,
    "contravia_despl_min_m": 2.0,
    "contravia_angulo_min_deg": 135,
    "contravia_frames_consecutivos": 10,
    "pare_vel_max_kmh": 2.0,
    "pare_tiempo_min_s": 1.0,
    "linea_frames_min": 3
  },
  "osm": {
    "way_id": 123456789,
    "oneway": "no",
    "maxspeed": null,
    "consultado": "2026-10-23",
    "atribucion": "© OpenStreetMap contributors, ODbL"
  }
}
```

Los campos clave: `homografia` define el plano métrico (aquí 7 m de ancho por 25 m de largo, con dos puntos de control reservados que no entran al cálculo y sirven para medir el error de reproyección en metros); `direccion_permitida` va en coordenadas del suelo, no en píxeles, así la perspectiva no distorsiona el ángulo; `y_linea_a_m` y `y_linea_b_m` son las dos líneas de velocidad en el plano métrico (base de 15 m); `regla_linea` decide si la línea de detención se evalúa con el semáforo o como PARE; `movimientos_permitidos` es la lista blanca de pares (entrada, salida), y aquí deja prohibidos el giro a la izquierda (S a O) y la vuelta en U (S a S). Las fuentes del límite y la foto de la señal convierten al JSON en un documento auditable. El esqueleto de integración, con las dos reglas nuevas más delicadas, quedaría así:

```python
import json
from collections import deque
import cv2
import numpy as np

class ConfigCamara:
    def __init__(self, ruta_json):
        with open(ruta_json, encoding="utf-8") as f:
            self.c = json.load(f)
        h = self.c["homografia"]
        img = np.array(h["puntos_imagen"], dtype=np.float32)
        suelo = np.array(h["puntos_suelo_m"], dtype=np.float32)
        self.H, _ = cv2.findHomography(img, suelo, cv2.RANSAC if len(img) > 4 else 0)

    def a_metros(self, xy):
        p = np.asarray(xy, dtype=np.float32).reshape(-1, 1, 2)
        return cv2.perspectiveTransform(p, self.H).reshape(-1, 2)

    def carril_de(self, pie):
        for carril in self.c["carriles"]:
            poly = np.array(carril["poligono"], dtype=np.int32)
            if cv2.pointPolygonTest(poly, (float(pie[0]), float(pie[1])), False) >= 0:
                return carril
        return None

class EstadoTrack:
    def __init__(self):
        self.hist = deque(maxlen=150)   # (t, x_px, y_px, X_m, Y_m)
        self.cruces_vel = {}            # nombre_linea -> instante interpolado
        self.frames_contra = 0
        self.reglas_disparadas = set()

def tiempo_cruce(y0, t0, y1, t1, y_linea):
    """Instante interpolado en que la coordenada Y (m) pasa por y_linea."""
    if y1 == y0 or (y0 - y_linea) * (y1 - y_linea) > 0:
        return None
    return t0 + (y_linea - y0) / (y1 - y0) * (t1 - t0)

class MotorInfracciones:
    def __init__(self, ruta_config):
        self.cfg = ConfigCamara(ruta_config)
        self.estados = {}               # tracker_id -> EstadoTrack
        # regla_semaforo ya existe; regla_pare, regla_movimiento y
        # regla_linea_continua siguen el mismo patrón (ver tabla de reglas);
        # emitir() arma y guarda el paquete de evidencia para revisión humana

    def procesar(self, t, tracks, estado_semaforo):
        # t: sello de tiempo real del cuadro (PTS o reloj NTP), no frame/fps
        # tracks: [(tracker_id, x1, y1, x2, y2, clase), ...] salidos de ByteTrack
        for tid, x1, y1, x2, y2, clase in tracks:
            pie = ((x1 + x2) / 2.0, y2)          # punto inferior central
            X, Y = self.cfg.a_metros([pie])[0]
            st = self.estados.setdefault(tid, EstadoTrack())
            st.hist.append((t, pie[0], pie[1], X, Y))
            carril = self.cfg.carril_de(pie)
            self.regla_semaforo(tid, st, estado_semaforo)   # la que ya existe
            if carril is not None:
                self.regla_velocidad(tid, st, carril)
                self.regla_contravia(tid, st, carril)
            self.regla_pare(tid, st)
            self.regla_movimiento(tid, st)
            self.regla_linea_continua(tid, st)

    def regla_velocidad(self, tid, st, carril):
        if len(st.hist) < 2 or "velocidad" in st.reglas_disparadas:
            return
        (t0, _, _, _, Y0), (t1, _, _, _, Y1) = st.hist[-2], st.hist[-1]
        v = self.cfg.c["velocidad"]
        for nombre in ("y_linea_a_m", "y_linea_b_m"):
            if nombre not in st.cruces_vel:
                tc = tiempo_cruce(Y0, t0, Y1, t1, v[nombre])
                if tc is not None:
                    st.cruces_vel[nombre] = tc
        if len(st.cruces_vel) == 2:
            st.reglas_disparadas.add("velocidad")
            dt = abs(st.cruces_vel["y_linea_b_m"] - st.cruces_vel["y_linea_a_m"])
            if dt > 0:
                kmh = abs(v["y_linea_b_m"] - v["y_linea_a_m"]) / dt * 3.6
                if kmh > carril["limite_kmh"] + v["tolerancia_kmh"]:
                    self.emitir(tid, "velocidad", {"kmh": round(kmh, 1)})

    def regla_contravia(self, tid, st, carril):
        p = self.cfg.c["parametros"]
        if len(st.hist) < p["edad_min_track_frames"] or "contravia" in st.reglas_disparadas:
            return
        t_fin = st.hist[-1][0]
        ventana = [h for h in st.hist if h[0] >= t_fin - p["contravia_ventana_s"]]
        if len(ventana) < 2:
            return
        d = np.array(ventana[-1][3:5]) - np.array(ventana[0][3:5])
        n = np.linalg.norm(d)
        if n < p["contravia_despl_min_m"]:
            return
        u = np.array(carril["direccion_permitida"], dtype=float)
        cos_a = float(np.dot(d / n, u / np.linalg.norm(u)))
        if cos_a < np.cos(np.radians(p["contravia_angulo_min_deg"])):
            st.frames_contra += 1
        else:
            st.frames_contra = 0
        if st.frames_contra >= p["contravia_frames_consecutivos"]:
            st.reglas_disparadas.add("contravia")
            self.emitir(tid, "contravia", {"carril": carril["id"]})
```

Las seis reglas, con sus valores de arranque (que no están validados en ninguna fuente y hay que ajustar con video local), quedan así:

| Infracción | Geometría del JSON | Regla por cuadro | Arranque sugerido | Falsos positivos a vigilar |
|---|---|---|---|---|
| Semáforo en rojo (ya existe) | `linea_detencion`, `semaforo` | El punto inferior central cruza la línea mientras el estado es rojo (amarillo cuenta como verde) | Cruce confirmado en 2 a 3 cuadros | Cambio de ID justo en la línea; vehículo ya parado sobre la línea antes del rojo |
| Exceso de velocidad | `homografia`, `velocidad`, `carriles[].limite_kmh` | Instantes interpolados de cruce de las dos líneas métricas; v = distancia / Δt × 3,6 con sellos reales; infracción si v supera límite + tolerancia; descartar tracks con huecos, oclusión o cambio de ID | Base de 15 a 25 m; tolerancia de 10 km/h en el piloto | Cajas recortadas por un autobús; sesgo de altura en autobuses y camiones; cámara movida |
| Contravía / no entre | `carriles[].poligono`, `direccion_permitida` | Desplazamiento en ventana de 1 s mayor a 2 m con ángulo mayor a 135° contra el sentido permitido durante 10 cuadros seguidos; confirmar con orden de zonas | Edad mínima de 15 cuadros | Motos zigzagueando, retroceso para estacionar, moto empujada a pie |
| PARE | `linea_detencion`, `zona_detencion`, `regla_linea = "pare"` | Solo el primero de la cola; al cruzar la línea se revisa si dentro de la zona tuvo v menor a 2 km/h durante al menos 1 s; si no, infracción | 2 km/h, 1 s (Roboflow usó 15 px/s sin homografía) | Vehículo que para antes de la zona; cola larga |
| Giro prohibido / vuelta en U | `zonas_entrada`, `zonas_salida`, `movimientos_permitidos` | Primera zona de entrada y primera zona de salida del track; si el par no está permitido, infracción; mismo brazo = vuelta en U; los tracks que nunca tocaron una zona de entrada no se evalúan | Lista blanca por intersección | Tracks partidos dentro de la intersección que crean pares falsos |
| Línea continua | `lineas_continuas` | El punto inferior central (o las esquinas traseras) cruza la polilínea y se queda al menos 3 cuadros del otro lado | 3 cuadros | Motos en el borde de la línea; cajas que saltan |

Cada infracción debe guardar un paquete de evidencia: identificador único, cámara y `version_config`, regla, `tracker_id`, sellos de tiempo sincronizados, placa por votación entre varios cuadros con su mejor recorte, un clip corto, velocidad medida con límite y tolerancia aplicada, estado del semáforo y tiempo transcurrido desde el rojo, un hash del paquete y el estado de revisión humana. Esa lista no es capricho: la OIML R 91-1:2025 pide fecha, hora, lugar, identificador único, velocidad con dirección, tipo y serie del equipo, imágenes y configuración, con archivos protegidos en integridad y autenticidad ([OIML R 91-1](https://www.oiml.org/en/files/pdf_r/r091-1-e25.pdf)); el manual británico exige para semáforo al menos dos imágenes o video de 25 fps o más, una con el vehículo sobre la línea, y cifrado AES-128 con MAC al capturar ([GOV.UK](https://www.gov.uk/government/publications/speedmeter-traffic-light-and-lane-enforcement-camera-handbook/speedmeter-traffic-light-and-prohibited-lane-enforcement-camera-handbook-accessible)); y la ley venezolana de mensajes de datos reconoce integridad cuando el mensaje "se mantiene inalterable desde que se generó" ([CONATEL](https://conatel.gob.ve/wp-content/uploads/2024/08/PDF-Ley-sobre-Mensajes-de-Datos-y-Firmas-Electronicas.pdf)). Las métricas de validación por regla son precisión y recall sobre eventos, **falsas alarmas por hora de tráfico normal** y, para velocidad, media, desviación y percentil 95 del error contra la referencia, separados por tipo de vehículo.

## La multa de velocidad exige cinemómetro homologado y una autoridad

La Ley de Transporte Terrestre de 2008 (G.O. 38.985) no menciona cámaras, fotodetección ni un procedimiento de multa automatizada en el texto que se pudo revisar (hasta el art. 142), pero obliga a las autoridades a implementar "mecanismos" de control de velocidad (art. 48) y reserva al INTT la autorización para colocarlos y señalizarlos en vías nacionales (art. 23.23) ([Studocu, LTT](https://www.studocu.com/latam/document/universidad-nacional-experimental-de-los-llanos-occidentales-ezequiel-zamora/derecho-administrativo-i/gaceta-oficial-n-38/76022824)). El régimen sancionatorio es nacional (art. 5), los municipios fiscalizan "según la normativa de carácter nacional" (art. 7), los órganos de ejecución son el Cuerpo Técnico de Vigilancia del Transporte Terrestre y las policías homologadas (art. 18), y las actuaciones de policías no homologados son nulas (art. 20) ([Pandectas Digital](https://pandectasdigital.blogspot.com/2016/08/ley-de-transporte-terrestre.html)). Para Lowtech eso significa una cosa: **ustedes ponen la herramienta, pero quien valida y emite la multa es una autoridad homologada**.

Los montos nacionales son simbólicos. El art. 169 castiga con 10 U.T. desatender el semáforo y exceder la velocidad ([reproducción del art. 169](https://departamentoplanificacion.blogspot.com/2010/10/ley-de-transito-terrestre-articulo-169.html)), y la contravía aparece en el art. 170 con 5 U.T. según prensa ([Noticia al Día](https://noticialdia.com/al-dia/cuales-son-las-multas-que-establece-la-ley-para-los-motorizados-en-venezuela/)), aunque otra fuente habla de hasta 10 U.T. ([El Diario](https://eldiario.com/2023/09/21/multas-en-caracas-cuales-son-las-tarifas-por-infracciones-de-transito/)). Con la U.T. en Bs. 43 desde junio de 2025 y reservada por el SENIAT a tributos nacionales ([PwC Venezuela](https://www.pwc.com/ve/es/assets/documentos/stl/NAC-Reajuste-Valor-UT-Junio2025-v3-2.pdf)), 10 U.T. son Bs. 430, y por eso los municipios multan con ordenanzas propias indexadas al tipo de cambio oficial, como permite la ley de armonización tributaria de 2023 ([Forvis Mazars](https://www.forvismazars.com/ve/es/insights/forvis-mazars-insights/loat)): Baruta cobra entre 20 y 100 veces el tipo de cambio según la gravedad ([Finanzas Digital](https://finanzasdigital.com/multas-transito-baruta-2025/)) y Maracaibo cobra US$60 por semáforo con una boleta digital que levanta un funcionario en sitio ([Nuevo Día](https://nuevodia.com.ve/nuevo-sistema-de-multas-de-transito-activan-en-maracaibo/)). Hay anuncios de cámaras, pero ningún procedimiento publicado: la alcaldía de Libertador anunció en julio de 2025 "cámaras inteligentes" en "cada esquina, y en cada semáforo" atadas a la Ordenanza de Convivencia Ciudadana, sin fecha ni procedimiento de notificación ([El Diario](https://eldiario.com/2025/07/15/autoridades-instalaran-camaras-inteligentes-semaforos-caracas-detectar-infracciones/)), y Maracaibo anunció en enero de 2026 cámaras para rojo y giros indebidos que sancionarían al propietario, sin base legal citada ([Relámpago Zuliano](https://relampagozuliano.com/2026/01/02/tolerancia-cero-en-maracaibo-infractores-enfrentaran-retencion-de-vehiculos-y-multas-digitales/)). Incluso la plataforma digital del INTT de 2024 funciona con un funcionario que toma la foto y la sube, no con detección automática ([Finanzas Digital](https://finanzasdigital.com/califican-de-muy-buena-la-iniciativa-de-plataforma-digital-para-establecer-multas/)).

La velocidad tiene además un problema metrológico. La Ley de Metrología de 2005 somete a control legal los instrumentos usados en mediciones que afectan la seguridad y en "actos de naturaleza judicial, pericial y administrativa" (art. 19, numerales 4 y 5), control que incluye aprobación de modelo y verificación (art. 21), con verificación obligatoria para instrumentos de oficinas públicas o de seguridad (art. 26) y aprobación de modelo previa a la venta (art. 27) ([Ley de Metrología](https://venezuela.justia.com/federales/leyes/ley-de-metrologia/gdoc)). Una multa es un acto administrativo, así que un medidor de velocidad por visión encaja en esa descripción, pero **no encontré ninguna norma COVENIN, reglamento técnico de SENCAMER ni lista que regule específicamente los cinemómetros**. Esa ausencia corta en dos sentidos: no hay un ensayo nacional que aprobar, pero cualquier abogado puede impugnar una multa de velocidad por falta de verificación del instrumento.

La región confirma el patrón: la velocidad exige un instrumento aprobado y verificado; el semáforo y la contravía exigen sobre todo buena evidencia.

| País | Velocidad por cámara | Semáforo, contravía y otros | Lección |
|---|---|---|---|
| Colombia | Ley 1843 de 2017: solo la autoridad expide comparendos, facultad no delegable a privados, remuneración privada máxima de 10% del recaudo, trazabilidad metrológica al INM ([Ley 1843](https://experimentos.urosario.edu.co/sites/default/files/2022-10/ley_1843_2017.pdf)); 13% de las cámaras usan videoanalítica pero "no existen requisitos metrológicos obligatorios" ([SIC, 2026](https://www.redjurista.com/Compilaciones2018/tablas_ProyectosNormas/2026/07/14/pdto_siyc_0001aj_2026.pdf)) | SAST autorizados por la ANSV | La Corte tumbó la solidaridad del propietario ([C-038/2020](https://www.ambitojuridico.com/sites/default/files/BancoMedios/Archivos/com-sent-c-038-20.pdf)); Supertransporte investiga 293.869 comparendos de 128 cámaras de Bogotá ([El Tiempo](https://www.eltiempo.com/bogota/no-hay-comparendos-por-exceso-de-velocidad-dice-secretaria-de-movilidad-de-bogota-frente-a-investigacion-de-supertransporte-y-mintransporte-3565665)) |
| Brasil | Modelo aprobado por Inmetro y verificación inicial y periódica; la velocidad considerada es la medida menos el error admisible ([CONTRAN 798/2020](https://www.normasbrasil.com.br/norma/resolucao-798-2020_401145.html)); tolerancia de 7 km/h hasta 100 km/h y verificación cada 12 meses ([AutoPapo](https://autopapo.com.br/noticia/radares-vencidos-nao-podem-te-multar/)) | Sistemas "no metrológicos" con evaluación de conformidad e imagen con placa, fecha, hora y lugar ([CONTRAN 920/2022](https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes/Resolucao9202022.pdf)) | Separar infracciones metrológicas y no metrológicas |
| México | El proyecto de NOM de cinemómetros excluye expresamente la videoanalítica ([PROY-NOM-215-SCFI-2017](https://members.wto.org/crnattachments/2018/TBT/MEX/18_3063_00_s.pdf)) | La SCJN validó la fotomulta como "prueba plena" si indica tecnología, ubicación e imagen inalterada ([AR 1266/2017](https://www.scjn.gob.mx/sites/default/files/sinopsis_asuntos_destacados/documento/2018-05/2S-020518-JFFGS-1266.pdf)); CDMX aplica sanciones no monetarias a placas locales ([Chilango](https://www.chilango.com/noticias/fotocivicas-vs-radares-moviles-en-cdmx-diferencias-y-como-te-pueden-multar/)) | Modelo pedagógico posible |
| Chile | Ley CATI 21.549 exige requisitos de "fiabilidad y certeza" ([PracticaTest](https://practicatest.cl/blog/normativa-de-transito/sistemas-automatizados-infracciones-exceso-velocidad)); su vigencia seguía pendiente del reglamento al 6 de octubre de 2026 ([PracticaTest](https://practicatest.cl/blog/articulos-especiales/como-evitar-las-multas-por-exceso-velocidad-de-fotorradares)) | Luz roja incluida; vehículo, placa, lugar, fecha, hora y velocidades en una misma imagen ([La Tercera](https://www.latercera.com/la-tercera-pm/noticia/ley-cati-mas-cerca-transportes-reingresa-reglamento-que-regula-radares-y-camaras-para-fiscalizar-excesos-de-velocidad/JQ2OJYSOHNDKZOEFBFGQIV3RZI/)) | Años entre la ley y la operación |
| Argentina | Aprobación de modelo, verificación anual, ±3 km/h bajo 100 km/h, para "cualquier método" ([Res. 753/98](https://www.inti.gob.ar/assets/uploads/metrologialegal/pdf/753.pdf)) | La ANSV homologa cada instalación ([Boletín Oficial](https://www.boletinoficial.gob.ar/pdf/aviso/primera/323888/20250508)) | Homologación por sitio |
| Perú | Certificación de no más de un año; se presume responsable al propietario ([DS 017-2019-MTC](https://cdn.www.gob.pe/uploads/document/file/5533902/278951-decreto-supremo-n-017-2019-mtc.pdf)); en Lima, tolerancia de 5 km/h y evidencia nula sin certificado INACAL ([El Peruano](https://elperuano.pe/noticia/278041-fotopapeletas-regulan-uso-del-cinemometro-en-lima)) | | Sin certificado, la prueba no vale |
| Ecuador | Radares sin certificados de calibración quedan inactivos y sus multas son impugnables ([Primicias](https://www.primicias.ec/sociedad/ant-radares-obligacion-certificados-calibraciones-verificaciones-metrologicas-90535)) | | Igual patrón |

La buena noticia viene de la OIML: la R 91-1:2025 reemplazó la edición de 1990 (solo radar) y ahora incluye expresamente medidores **por imagen (video y foto)** y por tramo, con error máximo de **±3 km/h hasta 100 km/h** (±3% por encima) en uso estacionario, y exige que un medidor por imagen no mida si la calidad de imagen no permite cumplir ese error ([OIML R 91-1](https://www.oiml.org/en/files/pdf_r/r091-1-e25.pdf)); la R 91-2 define ensayos de exactitud del punto de disparo, distancias mínima y máxima, iluminación mínima y niebla máxima ([OIML R 91-2](https://www.oiml.org/en/files/pdf_r/r091-2-e25.pdf)). El Reino Unido añade que los medidores automáticos necesitan un segundo método independiente que coincida dentro del 10% ([GOV.UK](https://www.gov.uk/government/publications/speedmeter-traffic-light-and-lane-enforcement-camera-handbook/speedmeter-traffic-light-and-prohibited-lane-enforcement-camera-handbook-accessible)). Con 1 a 3 km/h de error medio y casos aislados por encima de 5 km/h, un prototipo de visión todavía no cumple ±3 km/h en el percentil que importa; la velocidad por video es legalmente posible, pero por la puerta del ensayo de tipo.

En protección de datos, Venezuela no tiene ley general ni autoridad de control; aplican el art. 28 de la Constitución (habeas data) y los principios de la sentencia 1318/2011 del TSJ: consentimiento, finalidad, proporcionalidad, retención limitada y seguridad ([DLA Piper](https://www.dlapiperdataprotection.com/?c=VE&t=law)). En la práctica: no guardar placas de quien no cometió infracción, difuminar rostros, retener poco y poner aviso visible. Con todo esto, el camino se divide en tres niveles:

| Nivel | Qué se puede hacer | Qué hace falta |
|---|---|---|
| Piloto sin autoridad | Conteos, velocidades estimadas, mapas de calor, alertas y "multas simuladas" en demo, con aviso de estimación no metrológica | Principios del TSJ 1318/2011 sobre datos |
| Convenio con alcaldía | Semáforo en rojo, contravía, giros y PARE con revisión humana de cada evento; boleta emitida por funcionario homologado | Ordenanza o acto que lo habilite, policía homologada por el INTT, evidencia íntegra y firmada, notificación al conductor con derecho a defensa |
| Velocidad sancionatoria | Multa por exceso | Instrumento con aprobación de modelo y verificación (Ley de Metrología), ensayo contra OIML R 91, tolerancia restada, señalización, autorización del INTT en vías nacionales |

Un detalle que conviene decidir desde ya es a quién se notifica: la LTT no da una base visible para responsabilizar al propietario por lo que capta una cámara, y en Colombia esa misma regla fue declarada inconstitucional, así que el diseño debe apuntar a identificar al conductor o, como mínimo, dejar abierta la defensa del propietario.

## Conclusión

El cuello de botella de este proyecto ya no es el modelo. Pasó a tres cosas que no se resuelven con más GPUs: la calibración métrica y el reloj de cada cámara, el video local para medir falsos positivos regla por regla y la ruta legal. Eso cambia el rol del JSON por cámara, que deja de ser un archivo técnico y se vuelve el documento que un auditor o un juez pedirá: qué señal justifica la regla, cuándo se verificó, qué versión de la configuración estaba activa y cuál fue el error de reproyección medido. También sugiere diseñar el módulo de velocidad "listo para R 91" desde el primer día (sellos NTP, evidencia firmada, descarte automático cuando la imagen es mala y una campaña de pasadas contra radar o GNSS), porque esos mismos datos de validación son los que después sirven para pedir la homologación. Y como el tracking pesa más que el detector (0,75 contra 0,99 de precisión en Iowa con el mismo problema), el mejor uso del tiempo de ingeniería es endurecer las reglas contra cambios de ID, no reentrenar YOLO.

En lo comercial, la distinción brasileña entre infracciones metrológicas y no metrológicas da el orden de producto: semáforo en rojo, contravía, giros y PARE son "solo evidencia" y se pueden ofrecer ya a alcaldías como Libertador o Maracaibo, que anunciaron cámaras sin procedimiento definido; la velocidad se vende primero como analítica (perfiles de velocidad, puntos críticos) hasta poder emparejarla con un radar certificado como segundo método, al estilo británico. La investigación sobre casi 300.000 comparendos en Bogotá muestra lo caro que sale saltarse la metrología: es mejor llegar tarde a la multa de velocidad que llegar con una que se cae en tribunales.

## Inputs para el modelo

Esta sección lista todo lo que se puede agregar como input. Lo primero, para no perder tiempo buscando datos que no existen: **velocidad, contravía, "no entre", PARE, giros prohibidos, vuelta en U, línea continua y semáforo en rojo NO necesitan ningún dataset nuevo de entrenamiento**. Se resuelven con reglas geométricas, calibración por cámara (homografía con puntos medidos) y video propio de validación. Los únicos componentes que se entrenan son el detector de vehículos (ajuste fino), el detector de placas y el OCR que ya tienen, y, de manera opcional, un detector de señales (solo para autoconfigurar cámaras o como evidencia) o un detector de ruedas para afinar el PARE, para el cual las notas no identifican ningún dataset público. Los datasets de velocidad listados abajo son de **validación**, no de entrenamiento.

### Inputs de Kaggle que se adjuntan directo en el notebook ("Add Input")

| Dataset (slug de Kaggle) | Para qué sirve | ¿Obligatorio, recomendado u opcional? | Dónde se consigue | Licencia |
|---|---|---|---|---|
| `saumyapatel/traffic-vehicles-object-detection` | Vehículos y placas desde cámaras de tráfico | Obligatorio | Kaggle input | No consta en las notas; revisar en Kaggle |
| `nadinpethiyagoda/vehicle-dataset-for-yolo` | Más vehículos | Obligatorio | Kaggle input | No consta; revisar en Kaggle |
| `fareselmenshawii/large-license-plate-dataset` | Placas, ~27k imágenes | Obligatorio | Kaggle input | No consta; revisar en Kaggle |
| `andrewmvd/car-plate-detection` | Placas en primer plano, formato VOC | Recomendado | Kaggle input | No consta; revisar en Kaggle |
| HelmetViolations (buscar por nombre en Kaggle) | Placas de moto | Opcional | Kaggle input | No consta; revisar en Kaggle |
| `kipngetichv/reencoded-barbados-traffic` | Video de tráfico para probar | Opcional | Kaggle input | No consta; revisar en Kaggle |
| `meowmeowmeowmeowmeow/gtsrb-german-traffic-sign` | Clasificador de señales (43 clases, más de 50.000 recortes, europeas); solo para autoconfiguración o evidencia | Opcional | Kaggle input | Uso libre citando a Stallkamp et al. (IJCNN 2011) ([GTSRB](https://benchmark.ini.rub.de/gtsrb_dataset.html)) |
| `andrewmvd/road-sign-detection` | Detector básico de señales: 877 imágenes, 4 clases (stop, speedlimit, crosswalk, trafficlight) | Opcional | Kaggle input | CC0 1.0 ([Dataset Ninja](https://datasetninja.com/road-sign-detection)) |
| `pkdarabi/cardetection` | "Traffic Signs Detection" etiquetado para YOLOv8; clases e imágenes no verificadas | Opcional (inspeccionar antes) | Kaggle input | No verificada |
| `rkuo2000/vehicle-speed` | Video titulado "vehicle speed"; no se verificó si trae velocidad de referencia | Opcional (inspeccionar antes) | Kaggle input | No verificada |
| `theludway/vehicle-speed` | Descripción "Travel between two distances"; contenido no verificado | Opcional (inspeccionar antes) | Kaggle input | No verificada |
| `prateek3g/vehicle-speed-estimation` | Estimación de velocidad; contenido no verificado | Opcional (inspeccionar antes) | Kaggle input | No verificada |
| `suryaprasadp/vehiclespeeddetectionsampledata` | Datos de muestra de detección de velocidad; contenido no verificado | Opcional (inspeccionar antes) | Kaggle input | No verificada |

Los cuatro datasets de Kaggle de "velocidad" aparecieron en búsquedas, pero sus páginas solo mostraron metadatos ([theludway](https://www.kaggle.com/datasets/theludway/vehicle-speed); [prateek3g](https://www.kaggle.com/datasets/prateek3g/vehicle-speed-estimation/metadata); [suryaprasadp](https://www.kaggle.com/datasets/suryaprasadp/vehiclespeeddetectionsampledata/discussion)): antes de usarlos para validar hay que confirmar que traen una velocidad de referencia medida con un instrumento, no solo video.

### Descargas externas (subir como dataset privado de Kaggle o pedir por correo)

| Dataset (nombre + URL) | Para qué sirve | ¿Obligatorio, recomendado u opcional? | Dónde se consigue | Licencia |
|---|---|---|---|---|
| UTFPR vehicle-speed dataset (Luvizon, Nassu, Minetto): https://pessoal.dainf.ct.utfpr.edu.br/rminetto/projects/vehicle-speed/ | Validar velocidad antes de grabar en Caracas: 20 videos urbanos junto a un semáforo, placas brasileñas, referencia de lazos aprobados por Inmetro | Recomendado | Descarga externa desde la página del proyecto; subir como dataset privado | "Freely available for research purposes"; sin licencia explícita |
| BrnoCompSpeed: https://github.com/JakubSochor/BrnoCompSpeed | Benchmark estándar para compararse con lo publicado: 18 videos 1080p a 50 fps, 20.865 vehículos, LiDAR | Opcional (unos 200 GB, tipo autopista, solo de día) | Solicitud por correo a Jakub Špaňhel (ispanhel@fit.vutbr.cz) | No indicada en el README |
| Calibraciones de BrnoCompSpeed: `kocurvik/BCS_results` (enlazado desde https://github.com/kocurvik/retinanet_traffic_3D) y `data/brno_homographies.zip` de https://github.com/naver/cctv | Solo si se usa Brno: evita recalibrar sus cámaras | Opcional | Descarga desde GitHub | naver/cctv: CC BY-NC-SA 3.0 (no comercial); BCS_results: no indicada |
| VS13: https://slobodan.ucg.ac.me/science/vs13/ | 400 clips de 10 s, 13 carros, 30 a 105 km/h, cámara a 1,2 m junto a la vía; referencia = velocidad crucero | Opcional | Descarga pública (un ZIP de 0,8 a 1,2 GB por vehículo) | No indicada ([VS13](https://slobodan.ucg.ac.me/science/vs13/)) |
| ForeSpeed (Amped Software): https://arxiv.org/html/2512.19364v1 | Probar cámaras CCTV baratas (5 a 30 fps, de 640x360 a 4K) | Opcional | El paper dice que es público, pero no se halló enlace de descarga | No indicada |
| Señales en español, Roboflow `geraldines-workspace/senalestransito`: https://universe.roboflow.com/geraldines-workspace/senalestransito | 441 imágenes, 38 clases (`pare`, `no_entre`, `prohibido_girar_en_u`, `velocidad_maxima_35`, `velocidad_maxima_50`...). Primera opción si algún día quieren detector de señales | Opcional | Exportar desde Roboflow en formato YOLO y subir como dataset privado | CC BY 4.0 |
| Mapillary Traffic Sign Dataset (MTSD): https://blog.mapillary.com/update/2019/06/27/mapillary-traffic-sign-dataset.html | ~100.000 imágenes, 313 clases, con meta de 15% de imágenes de Sudamérica ([paper](https://ar5iv.labs.arxiv.org/html/1909.04422)) | Opcional | Descarga externa | Edición research (libre para uso académico) y edición comercial |
| LISA Traffic Sign Dataset: https://cvrr.ucsd.edu/lisa-traffic-signs-dataset | 47 señales de EE. UU., familia MUTCD, la más parecida al diseño venezolano | Opcional | Descarga externa tras acuerdo de licencia | Académica |
| TT100K vía `TT100K.yaml` de Ultralytics: https://docs.ultralytics.com/datasets/detect/tt100k | 221 clases de señales chinas | Opcional (evitar en producto comercial) | Descarga automática (~18 GB) al entrenar con Ultralytics | CC BY-NC 2.0 |
| GTSDB: https://benchmark.ini.rub.de/gtsdb_dataset.html | 900 imágenes completas para detección de señales europeas | Opcional | Descarga externa | No indicada |
| Brazilian Vertical Traffic Signs and Lights Dataset (Mendeley, DOI 10.17632/jbpsr4fvg9.2): https://data.mendeley.com/datasets/jbpsr4fvg9/2 | Señales reglamentarias, preventivas y semáforos brasileños con cajas XML | Opcional | Descarga externa | CC BY 4.0 |
| HumynLabs/Brazilian_Road_Signs_Dataset (Hugging Face): https://huggingface.co/datasets/HumynLabs/Brazilian_Road_Signs_Dataset/blob/main/README.md | Señales brasileñas en formato imagefolder | Opcional | Descarga desde Hugging Face | CC BY 4.0 |
| Roboflow `lahiru-m3wtk/traffic-violation-detection-2`: https://universe.roboflow.com/lahiru-m3wtk/traffic-violation-detection-2 | 151 imágenes con línea continua y discontinua; solo si quieren detectar las marcas automáticamente en vez de dibujarlas | Opcional | Exportar desde Roboflow | CC BY 4.0 |
| Roboflow `roadviolationdataset/road_violation_detection`: https://universe.roboflow.com/roadviolationdataset/road_violation_detection | 294 imágenes: crosswalk, solid_center_line, broken_center_line, edge_line | Opcional | Exportar desde Roboflow | CC BY 4.0 |
| UA-DETRAC: https://ar5iv.arxiv.org/html/1511.04136 | 10 horas de video y 1,21 millones de cajas con noche y lluvia: robustez del detector y del tracker. No tiene velocidad | Opcional | Descarga externa | No indicada en las notas |

### Datos de configuración de reglas (configuran, no entrenan)

| Fuente | Para qué sirve | ¿Obligatorio, recomendado u opcional? | Dónde se consigue | Licencia |
|---|---|---|---|---|
| Límites legales: señal vertical en sitio, art. 254 del Reglamento y resolución conjunta de 2024 | Valor de `limite_kmh` por carril | Obligatorio | Visita de campo (foto fechada), Gaceta Oficial, INTT | Norma pública |
| OpenStreetMap vía Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL | `oneway`, `maxspeed`, `lanes` y geometría de la vía cerca de cada cámara, como punto de partida | Recomendado | Consulta Overpass con `around` o extracto de Geofabrik para Venezuela | ODbL (atribución; compartir solo si hay uso público de la base derivada) |
| osm-legal-default-speeds: https://raw.githubusercontent.com/westnordost/osm-legal-default-speeds/master/demo/distribution/legal_default_speeds.json | Límites por defecto de Venezuela por tipo de vía (urbano 40; rural 70, 50 de noche; autopista 90 y 70 por canal) | Opcional | GitHub | CC BY-SA 2.0 (datos de la wiki de OSM) |

### Lo que no hay que agregar

| Fuente | Por qué no |
|---|---|
| Google Maps Platform y Street View | Los términos prohíben cachear, extraer y usar el contenido para entrenar, probar, validar o ajustar modelos (3.2.3(c)(vii)), y la descarga masiva de Street View (3.2.3(a)(ii)); Speed Limits es de acceso limitado y no está disponible en Venezuela |
| Roboflow `imageprocessingworkspace/wrong-way-driving-detection-3hzo7` (636 imágenes) | La contravía es temporal; una imagen suelta no la muestra |
| AI City Challenge 2018 Track 1 | La velocidad de referencia nunca se publicó |
| AI City Challenge 2021 Track 4, TAD y CADP | Son choques y vehículos detenidos, no contravía |
| Dataset CCTV de Revaud (NAVER) | Aún no publicado ([naver/cctv](https://github.com/naver/cctv)) |
| DeaSpeedDataset (Kamil et al.) | Disponibilidad pública no confirmada |
| Señales mexicanas (ESWA 2022) y peruanas (LACCEI 2022) | No son públicos; además México usa "ALTO" y no "PARE" ([LACCEI](https://laccei.org/LACCEI2022-BocaRaton/full_papers/FP550.pdf)) |

### Datos propios que hay que grabar

1. **Calibración de cada cámara:** 6 a 10 puntos del pavimento medidos con cinta o medidor láser (esquinas de líneas de carril, marcas del brocal), dejando 2 a 4 como puntos de control para medir el error en metros, más una foto de referencia de la vista para detectar si la cámara se movió.
2. **Pasadas de velocidad controladas:** un carro propio con registrador GNSS de 10 Hz (o app GPS más una cámara filmando el velocímetro) y, si se consigue, una pistola radar o láser en paralelo; 20 a 80 km/h, ambos carriles, día y noche, 3 a 5 pasadas por combinación (50 a 100 o más por cámara), incluyendo una moto y un autobús o camión, con los relojes sincronizados por NTP.
3. **Tráfico normal:** 1 a 2 horas por cámara en hora pico, de noche y con lluvia, para medir falsas alarmas por hora de cada regla.
4. **Infracciones escenificadas:** contravía, PARE con parada completa y "rodando", giro prohibido, vuelta en U y cruce de línea continua con vehículos propios, decenas por regla.
5. **Negativos difíciles:** motos zigzagueando, autobuses y por puestos parando, retrocesos para estacionar y oclusiones por autobuses.
6. **Cuadros para ajuste fino:** unos cientos de cuadros de esas mismas cámaras etiquetados (motos, por puestos, autobuses, noche) para afinar el detector y medir el OCR a la distancia real.
7. **Evidencia de señalización:** foto fechada de cada señal vertical y marca vial que justifica cada regla del JSON.
