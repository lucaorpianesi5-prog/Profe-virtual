# Puesta en marcha con datos reales

La app tiene dos modos:

- **Demo** (como hasta ahora): datos de ejemplo, no guarda nada. Es lo que se ve mientras `CONFIG` en `index.html` está vacío, y siempre se puede abrir agregando `?demo` a la URL.
- **Real**: tus alumnos entran con su cuenta de Google, ven el plan que vos les cargaste y cada sesión queda en tu planilla.

Son unos 20 minutos, una sola vez. Al final vas a tener dos valores para pegar en `index.html`.

## Cómo funciona

```
App (GitHub Pages) ──► Proxy (Apps Script, corre con tu cuenta) ──► Planilla "Profe Virtual — Datos" (tu Drive)
```

- La planilla **no se comparte con nadie**. Solo el proxy la lee y la escribe.
- El proxy verifica la cuenta de Google de quien entra, la busca en la hoja **Alumnos** y le devuelve **solo sus datos**. Si pasás a un alumno a `vencido`, deja de entrar en el próximo uso.
- La app guarda cada sesión primero en el dispositivo y después la sube. Si en el gimnasio no hay señal, se sube sola cuando vuelve la conexión. Si se cierra la app a mitad de sesión, al volver ofrece retomarla.

## 1. Planilla y proxy

1. En Google Drive, creá una planilla nueva y ponele **Profe Virtual — Datos**.
2. Menú **Extensiones → Apps Script**. Se abre el editor.
3. Borrá lo que haya en `Código.gs` y pegá todo el contenido de [`apps-script/proxy.gs`](apps-script/proxy.gs). Guardá (ícono de disquete).
4. En la barra de arriba elegí la función **`configurar`** y tocá **Ejecutar**.
   - Google va a pedir permisos. Como el script es tuyo, va a aparecer "Google no verificó esta app": entrá en **Configuración avanzada → Ir a … (no seguro)** y aceptá. Es tu propio código, corriendo en tu cuenta.
5. Volvé a la planilla: vas a ver las hojas **Alumnos, Planes, Ejercicios, Sesiones y Registro**, con vos como primer alumno y un plan de muestra para probar.

`configurar` se puede volver a correr cuando quieras: agrega lo que falte y no borra nada. También queda en el menú **Profe Virtual** de la planilla.

## 2. ID de cliente de Google (para "Entrar con Google")

1. Entrá a <https://console.cloud.google.com/> con tu cuenta y creá un proyecto, por ejemplo **Profe Virtual**.
2. Buscá **Google Auth Platform** (o *APIs y servicios → Pantalla de consentimiento de OAuth*) y completá:
   - Nombre de la app: **Profe Virtual**, y tu email de soporte.
   - Público: **Externo**.
   - Publicá la app (**En producción**). Como solo pide nombre y email, Google no exige verificación.
     Si en algún momento te la pide, dejala en **Prueba** y agregá los emails de tus alumnos como usuarios de prueba (hasta 100).
3. En **Clientes** (o *Credenciales*), **Crear cliente → Aplicación web**:
   - Orígenes autorizados de JavaScript: `https://lucaorpianesi5-prog.github.io`
   - No hace falta poner URIs de redireccionamiento.
4. Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`).
5. En el editor de Apps Script, pegalo en la primera línea de configuración y guardá:
   ```js
   const CLIENT_ID = 'TU_ID.apps.googleusercontent.com';
   ```

## 3. Publicar el proxy

1. En Apps Script: **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**. Que cualquiera pueda llamarlo no significa que pueda ver algo: sin una cuenta de Google que esté en Alumnos, el proxy no devuelve nada.
3. **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).

> **Cuando cambies el código del proxy**, no crees una implementación nueva, porque cambiaría la URL. Usá **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**: la URL queda igual.

## 4. Conectar la app

En `index.html`, completá los dos valores (están al principio del script):

```js
const CONFIG={
  proxy:'https://script.google.com/macros/s/…/exec',
  clientId:'TU_ID.apps.googleusercontent.com'
};
```

Subí el cambio (commit y push). En un par de minutos la app publicada ya usa datos reales. La demo sigue en `…/Profe-virtual/?demo`.

## 5. Probar

1. Abrí la app y entrá con tu cuenta de Google: vas a ver el plan de muestra.
2. Hacé una sesión corta y tocá **Listo**: tiene que aparecer una fila en **Sesiones** y una por serie en **Registro**.
3. En el iPad, instalala (Compartir → Agregar a inicio) y **entrá de nuevo desde la app instalada**: en iPhone y iPad, la app instalada no comparte la sesión con Safari.

## Cargar a tus alumnos

**Alumnos**: una fila por alumno.

| columna | qué va |
|---|---|
| `email` | el email de la cuenta de Google con la que va a entrar |
| `nombre` | cómo lo saluda la app |
| `estado` | `activo` para que entre; cualquier otra cosa (`vencido`, `pausa`) lo deja afuera |
| `dias` | días de entrenamiento, por ejemplo `L,X,V` (L M X J V S D). Ordena la semana en Mi plan |
| `registro_esfuerzo` | lo completa la app cuando el alumno elige RIR/RPE |
| `fecha_alta`, `fecha_pago`, `fecha_vencimiento`, `monto` | para la suscripción. Hoy la app muestra el vencimiento y el monto en Más |
| `notas` | tuyas, la app no las muestra |

**Planes**: una fila por ejercicio, por alumno.

| columna | qué va |
|---|---|
| `email` | del alumno |
| `sesion` | `A`, `B`, `C`… Cada letra es una sesión. La app propone la que sigue a la última que hizo (A → B → C → A) |
| `sesion_nombre` | por ejemplo "Empuje y bisagra". Alcanza con ponerlo en la primera fila de cada sesión |
| `orden` | orden dentro de la sesión |
| `ejercicio` | nombre. Si coincide con uno de **Ejercicios**, trae la técnica, el video y las variantes |
| `series`, `reps_min`, `reps_max` | por ejemplo 3, 8, 10. Si es fijo, poné el mismo número en los dos |
| `unidad` | `reps` o `seg` (para planchas y similares) |
| `descanso_seg` | segundos de descanso |
| `carga_kg` | carga inicial. Después, la app sugiere a partir de lo que el alumno registró |
| `por_que` | el porqué de este ejercicio para este alumno (si está vacío, usa el de Ejercicios) |
| `notas` | una indicación tuya que el alumno ve durante la sesión |

Para pasar el mismo plan a otro alumno: copiá las filas y cambiá el email.

**Ejercicios**: tu catálogo, compartido por todos.

| columna | qué va |
|---|---|
| `ejercicio` | nombre, igual que en Planes |
| `patron` | por ejemplo "Bisagra de cadera" |
| `video_url` | link de YouTube **no listado** |
| `como_1`, `como_2`, `como_3` | las tres claves de técnica |
| `error_comun`, `musculos` (separados por coma), `por_que` | |
| `regresion`, `progresion` | nombre del ejercicio más simple y del más exigente del mismo patrón. Activan los botones ↓ y ↑ en la sesión |

**Sesiones** y **Registro** las escribe la app. Podés leerlas, filtrarlas o armar gráficos en otra hoja, pero no cambies los encabezados.

## Regla de carga sugerida (a validar)

Si la última vez el alumno llegó al tope del rango en todas las series (y, si registró RIR, con RIR 2 o más), se sugiere subir **2,5 kg**, o **1 kg** si la carga es menor a 10 kg. Si no, se repite la carga. Está en `sugerida()` e `incremento()` de `index.html`.

## Datos sensibles

El check-in (sueño, estrés, energía) y el registro de esfuerzo quedan en tu planilla. Conviene contárselo a tus alumnos antes de que empiecen.
