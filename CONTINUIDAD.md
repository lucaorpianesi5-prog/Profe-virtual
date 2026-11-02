# Profe Virtual: continuidad del proyecto

**Este es el archivo para empezar cada sesión de trabajo.** Reúne el estado actual, las decisiones tomadas, el registro de bugs, las ideas y los próximos pasos.
- **Para cómo usar la planilla** (qué va en cada hoja y columna): [CONFIGURACION.md](CONFIGURACION.md).
- **Al terminar una sesión:** actualizar este archivo (estado, bugs, ideas, próximos pasos) en el mismo pull request que los cambios.

Última actualización: **02/11/2026**, después del PR #9.

---

## 1. Quién y qué

- **Luca:** personal trainer y dueño del producto. No programa: decide producto, método y contenido, y prueba en **iPad** y **celular Android**. Escribe en español rioplatense (voseo) y espera respuestas así.
- **Profe Virtual:** web app instalable (PWA). El alumno ve su plan, registra series y cargas en el gimnasio, y ve su progreso.
  - **Diferencial:** el aprendizaje. Cada decisión trae su porqué y la app guía la progresión sin imponerla.
- **Etapa actual: piloto.** Luca usa la app con su propia cuenta. Después se suman 1 o 2 alumnos de confianza, antes de vender.
- **Principio:** la app **sugiere, no impone**. Las decisiones del alumno son libres. La guía se explica como "la estructura del programa, que funciona y previene lesiones".

## 2. Repositorio, despliegue y forma de trabajo

| | |
|---|---|
| Repositorio | `lucaorpianesi5-prog/Profe-virtual`, rama principal `main` |
| App publicada (GitHub Pages) | https://lucaorpianesi5-prog.github.io/Profe-virtual/ (real) · `…/?demo` (demo con datos de ejemplo, no guarda nada) |
| Planilla | "Profe Virtual — Datos", en el Drive de Luca, sin compartir. Solo la lee y escribe el proxy |
| Proxy | Apps Script dentro de la planilla, publicado como aplicación web |

**Archivos:**
- `index.html`: toda la app (HTML + CSS + JS, sin dependencias).
- `apps-script/proxy.gs`: el proxy. Se pega a mano en Apps Script.
- `CONFIGURACION.md`: guía de la planilla.
- `CONTINUIDAD.md`: este archivo.
- `manifest.webmanifest`, `sw.js`, `icon.svg`, `icons/`: archivos de la app instalable.

**Flujo de un cambio:**
1. Claude trabaja en una rama y prueba con Playwright, con el `proxy.gs` real y la planilla y el login de Google simulados (ver §9).
2. Claude abre un pull request y Luca lo fusiona: **Merge pull request → Confirm merge**.
3. GitHub Pages publica en 1 o 2 minutos. El navegador puede tardar hasta **10 minutos** en tomar la versión nueva. Para forzarlo, cerrar la app del todo y volver a abrirla.
4. **Si cambió el proxy:**
   - pegar `proxy.gs` entero en Apps Script y guardar;
   - correr `configurar` si el PR lo indica (crea hojas, columnas o listas nuevas);
   - **Implementar → Gestionar implementaciones → ✏️ → Nueva versión → Implementar**. Solo guardar no alcanza.
   - **Nunca** crear una implementación nueva, porque cambia la URL.
5. **Commits y PR:** solo cuando Luca lo pide. Los mensajes llevan `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Si la app muestra un error al guardar algo:** el mensaje dice la causa real. "La versión anterior del proxy" quiere decir que falta publicar la versión nueva en Apps Script. "Sin conexión" aparece solo cuando el pedido no llega.

## 3. Arquitectura

```
App (GitHub Pages) ──POST texto plano──► Proxy Apps Script (corre como Luca) ──► Planilla de Luca
```

- **Login con Google** (Google Identity Services). El proxy verifica el ID token (`aud` = CLIENT_ID), busca el email en **Alumnos** con estado `activo` y emite un token propio firmado con HMAC, que dura 60 días. Cada pedido vuelve a revisar Alumnos.
- **Google Cloud:** proyecto "Profe virtual", en **modo Prueba**. Cada alumno va en *Público → Usuarios de prueba* **y** en la hoja Alumnos.
- **Configuración:**
  - `CONFIG.proxy`: la URL `/exec` de la aplicación web.
  - `CONFIG.clientId`: `290132927246-beo9h34ie995ikholsirpa1l8sg03prs.apps.googleusercontent.com`. Es el mismo valor que `CLIENT_ID` en `proxy.gs`.
- **Acciones del proxy:**
  - `login`, `datos` y `guardarSesion`. `guardarSesion` es idempotente y además actualiza Progresiones y el Panel.
  - `preferencias`: esfuerzo y días.
  - `guardarSesionPlan` / `borrarSesionPlan`: archiva la versión anterior en Planes_archivo.
  - `agregarABiblioteca`.
  - Las tres últimas son solo para el dueño de la planilla o los emails de `PUEDEN_ARMAR`.
- **Constantes al principio de `proxy.gs`:** `PUEDEN_ARMAR`, `PATRONES`, `ENFOQUES`, `NIVELES` (8) y `SEMANAS_HISTORIAL` (16).
- **Disparadores simples de la planilla:**
  - `onOpen`: menú Profe Virtual y actualización del Panel.
  - `onEdit` en la Biblioteca: rehace la hoja Listas.
- **Guardado local en la app:**
  - `pv-ses`: sesión en curso. Si se cierra la app, al volver ofrece **Retomar**.
  - `pv-pend`: cola de sesiones sin subir. Se suben solas al volver la señal.
  - `pv-cache`: abre al instante, aunque no haya señal.
  - `pv-token`: la sesión de Google.

## 4. La planilla (resumen; detalle en CONFIGURACION.md)

| Hoja | Quién la escribe | Para qué |
|---|---|---|
| **Panel** | Proxy (valores, sin fórmulas) | Una fila por alumno: última sesión, días sin entrenar, constancia y vencimiento. Se actualiza al abrir la planilla y al guardar cada sesión |
| **Alumnos** | Luca (`registro_esfuerzo` y `dias`, también la app) | Quién entra, sus días y su suscripción |
| **Planes** | La app (Armar sesión) o Luca | Una fila por ejercicio del plan de cada alumno. `bloque` = circuito; `actualizado` = cuándo se editó desde la app |
| **Biblioteca** | Luca, o la app con "Ejercicio nuevo" | **Cadenas de progresión**: patrón, enfoque y `nivel_1`…`nivel_8`, de la regresión a la progresión |
| **Ejercicios** | Luca | La ficha de técnica: video, 3 claves, error común, músculos, por qué y `por_lado` |
| **Sesiones** | App | Una fila por entrenamiento, con el check-in |
| **Registro** | App | Una fila por serie, con `pausas`. Queda completo; la app lee solo las últimas 16 semanas |
| **Progresiones** | App | Primera y última vez de cada ejercicio, por alumno |
| **Planes_archivo** | App | Versiones anteriores de las sesiones editadas o borradas |
| **Listas** (oculta) | Proxy | Lista de ejercicios para los desplegables |

**Regla de oro: el nombre del ejercicio conecta todas las hojas.** Las mayúsculas no importan, pero las tildes y los espacios sí. Cambiar un nombre corta la "última vez" y la progresión.

**Detalles de la planilla:**
- Hay listas desplegables en patrón, enfoque, ejercicio, estado y unidad.
- Las hojas de la app avisan antes de editarlas a mano.
- Las columnas que no se usen se **ocultan**, no se borran: si se borran, `configurar` las vuelve a crear.

## 5. El método de Luca, como lo aplica la app

- **Rango de repeticiones:** de 4 a 12 por defecto, ajustable en cada ejercicio.
- **Subir carga:** se sugiere cuando **una** sesión completa el tope en todas las series, firme y **sin pausas** (y con RIR 2 o más, si se anota).
  - La carga sube 2,5 kg, o 1 kg si es menor a 10 kg.
  - Las reps bajan **siempre a la mitad** de las últimas. Si el número es impar, se redondea para abajo: 12 → 6, 9 → 4.
  - Después se vuelve a construir hasta el tope.
- **Pausas dentro de la serie** (rest-pause): ante el fallo, unos 10 segundos para recuperar ATP. La app las anota por serie (No, 1, 2, 3+).
  - Si hubo pausas, recomienda repetir la carga y ofrece **Subir igual**.
  - Para subir de carga o de nivel, las pausas tienen que ser cero.
- **Pasar de nivel:** con el tope sin pausas, se ofrece el nivel siguiente de la cadena.
- **Retroceder:** después de 2 sesiones seguidas sin llegar al mínimo, se sugiere volver un nivel, con el mensaje de que el proceso no es lineal y que retroceder también es avanzar.
- **Carga del plan:** si se editó la sesión después del último registro, manda la carga del plan.
- **Guía al armar:** un ejercicio por patrón por sesión. Después, armado libre.
- **Unilaterales:** reps por lado (casilla `por_lado`).

## 6. Qué hace hoy la app (resumen)

- **Layouts:** celular, iPad vertical, iPad horizontal (dos paneles) y escritorio. Rotar no pierde estado.
- **Inicio:**
  - próxima sesión, en rotación A → B → C;
  - la semana, con ✓ en los días entrenados;
  - racha.
- **Mi plan:**
  - días de la semana y elegir cualquier sesión para empezarla;
  - **Tus sesiones**: armar, editar y borrar (solo para quien puede armar);
  - **Cambiar días**: de 1 a 7.
- **Armar sesión:**
  - buscador de la Biblioteca agrupado por patrón, con filtro por enfoque, nivel y "Estás acá";
  - guía de patrones;
  - circuitos y "Por lado";
  - **Ejercicio nuevo**: lo suma a la Biblioteca en su lugar de la cadena;
  - Guardar y empezar.
- **Sesión:**
  - check-in y versión liviana;
  - registro por serie (reps y kg escribibles o con − y +), pausas, RIR/RPE opcionales;
  - descanso con cuenta regresiva;
  - circuitos por vueltas;
  - avisos de progresión y la cadena completa en Regresión/Progresión;
  - técnica y video;
  - cierre de la sesión.
- **Progreso:** carga máxima por sesión de cada ejercicio, y constancia.
- **Más:** instalar, registro de esfuerzo, estética, sincronizar, suscripción (vencimiento y monto) y cerrar sesión.

## 7. Registro de bugs

Formato: fecha · descripción · estado (abierto / resuelto en PR #).

### Abiertos
- Ninguno conocido.

### Resueltos
- 02/11 · Al guardar una sesión editada, al empezarla aparecían cargas viejas: el historial le ganaba al plan → **PR #4**.
- 02/11 · Cambiar días obligaba a tener la misma cantidad de días que de sesiones → **PR #3**.
- 02/11 · El Panel con fórmulas daba `#ERROR!` en la planilla real; ahora lo calcula el proxy → **PR #7**.
- 02/11 · Al borrar una sesión no se veía nada mientras procesaba (2 a 5 s) → **PR #7**.
- 02/11 · Errores de la planilla aparecían como "No hay conexión con el registro de Luca" → **PR #9**.
- 02/11 · Al escribir un número, el cursor quedaba en el medio y se mezclaba con el anterior; 102,5 se cortaba en el celular → **PR #5**.

## 8. Ideas y próximos pasos

### Próximo paso inmediato
1. **Luca:** usar la app 1–2 semanas y cargar contenido (cadenas en la Biblioteca, fichas con claves y videos). Anotar todo lo que haga ruido en la hoja "Pruebas" de la planilla (`fecha | qué hice | qué esperaba | qué pasó | captura`) o pasarlo directo.
2. **Claude, en paralelo:**
   - **Elegir qué sesión toca cada día.** Posible diseño: en Cambiar días, asignar una sesión a cada día y guardarlo en `dias` como `L:A,X:C,V:B`. La rotación queda como opción.
   - **Ver una sesión hecha.** Tocar un día con ✓ de la semana y abrir el detalle de esa sesión (desde Registro). Más adelante, un historial completo. A definir: si se puede corregir un dato desde ahí.

### Para validar con el uso
- La regla de carga y la mitad de las reps.
- El aviso para retroceder (2 sesiones).
- Los textos de RIR/RPE, la versión liviana y el cierre.
- **Entrar con Google desde la app instalada en el iPad** (nunca probado).

### Después: 1 o 2 alumnos de confianza
- Altas en Alumnos y en Usuarios de prueba.
- El plan lo carga Luca en Planes, o lo arma el alumno si se agrega su email a `PUEDEN_ARMAR`.
- Avisarles que sus datos (incluido el check-in) quedan en la planilla de Luca.

### Ideas anotadas
- **Más volumen antes de pasar de nivel** en algunos ejercicios (por ejemplo, de flexiones con rodillas a flexiones completas). Por ahora el rango se ajusta a mano. Falta la solución óptima.
- **Planes de alumnos desde la app:** el mismo editor, eligiendo el alumno, con opción de duplicar un plan.
- **Mi suscripción:** vencimiento, aviso antes de vencer y botón de pago (Mercado Pago).
- **Importar la planilla "Mapeo"** del Drive de Luca (catálogo y marcas) para cargar la Biblioteca de una vez.
- **Del diseño original**, pendiente para el producto completo: entrevista (ya prototipada en la demo), perfiles Deportista / Constante / Explorador, motor de reglas, capa de bienestar y tips. Fuera de alcance de la v1: IA, chat, app nativa, nutrición.

### Antes de vender
- Dominio propio y política de privacidad.
- Publicar el login de Google: hoy está en modo Prueba, con hasta 100 usuarios.
- Consulta legal antes de cobrar.
- Si cambia la lista de archivos de la app instalable, subir la versión de caché en `sw.js` (hoy `pv-v1`).

## 9. Cómo se prueba sin tocar producción

**Pruebas con Playwright** (hay un Chromium instalado en el entorno de Claude):
- Se sirve el repositorio con `python3 -m http.server 8765`.
- Un *mock* en Node simula los servicios de Google y ejecuta el `proxy.gs` real en un `vm`:
  - `SpreadsheetApp`, con una planilla en memoria;
  - `PropertiesService`, `Utilities` con HMAC real, `LockService` y `ContentService`;
  - `UrlFetchApp`, donde tokeninfo acepta tokens `tok-<email>`;
  - `Session`.
- Playwright intercepta:
  - `script.google.com`: lo pasa al `doPost` del mock;
  - `accounts.google.com/gsi/client`: lo reemplaza por un botón falso de Google.
- **Casos cubiertos:** circuitos, sesión real completa, armar/editar/borrar sesión, días, Biblioteca y Progresiones, pausas y mitad de reps, por lado, alta a la Biblioteca, mensajes de error y demo.
- Los scripts de prueba viven en el scratchpad de cada sesión (no en el repositorio), así que se rearman cuando hace falta.
- **No se pueden probar desde el entorno:** fórmulas de Google Sheets, el login real de Google y GitHub Pages. Por eso el Panel no usa fórmulas.

**Demo:** `…/?demo` no guarda nada y sirve para mostrar la app. No hay que romperla.
