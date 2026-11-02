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
4. En la barra de arriba, en el desplegable que está al lado de **Ejecutar**, fijate que diga **`configurar`** (es la primera función, así que debería aparecer sola). Tocá **Ejecutar**.
   - Google va a pedir permisos. Como el script es tuyo, va a aparecer "Google no verificó esta app": entrá en **Configuración avanzada → Ir a … (no seguro)** y aceptá. Es tu propio código, corriendo en tu cuenta.
   - Abajo se abre el **Registro de ejecución**. Tiene que terminar con `Listo. Hojas: Alumnos, Planes, …`. Si aparece un error en rojo, ese texto es el que hay que mirar.
5. Volvé a la pestaña de la planilla (si no ves cambios, recargala): vas a ver las hojas **Alumnos, Planes, Ejercicios, Sesiones y Registro**, con vos como primer alumno y un plan de muestra para probar.

Si no se crean las hojas:
- **El desplegable decía otra función** (por ejemplo `doPost`): elegí `configurar` y ejecutá de nuevo.
- **Creaste el script desde script.google.com** en vez de desde la planilla: tiene que estar *dentro* de la planilla. Abrí la planilla y entrá por **Extensiones → Apps Script**.
- **No aceptaste los permisos**: ejecutá de nuevo y completá la autorización.

`configurar` se puede volver a correr cuando quieras: agrega lo que falte y no borra nada. También queda en el menú **Profe Virtual** de la planilla.

## 2. ID de cliente de Google (para "Entrar con Google")

1. Entrá a <https://console.cloud.google.com/> con tu cuenta y creá un proyecto, por ejemplo **Profe Virtual**.
2. Buscá **Google Auth Platform** (o *APIs y servicios → Pantalla de consentimiento de OAuth*) y completá:
   - Nombre de la app: **Profe Virtual**, y tu email de soporte.
   - Público: **Externo**.
   - Dejá la app en **Prueba** y agregá tu email y el de cada alumno en **Público → Usuarios de prueba → Agregar usuarios** (hasta 100). Solo esas cuentas pueden entrar con Google, además de tener que estar en la hoja Alumnos.
     Los 7 días de vencimiento que menciona Google en modo Prueba no afectan: la app usa el login de Google una sola vez y después mantiene la sesión 60 días.
   - **Más adelante (para vender a desconocidos):** publicar en **Público → Publicar app** exige página principal, política de privacidad y dominio autorizado en *Información de la marca*. Conviene hacerlo con dominio propio y la política revisada. No subas logo si no querés que Google pida verificar la marca.
3. En **Clientes** (o *Credenciales*), **Crear cliente → Aplicación web**:
   - Orígenes autorizados de JavaScript: `https://lucaorpianesi5-prog.github.io` (sin barra final ni `/Profe-virtual`)
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
| `unidad` | `reps` o `seg` (para planchas y similares). Para unilaterales: `reps por lado` o `seg por lado`. Si queda vacía, se usa la casilla `por_lado` de Ejercicios |
| `descanso_seg` | segundos de descanso |
| `carga_kg` | carga inicial. Después, la app sugiere a partir de lo que el alumno registró |
| `por_que` | el porqué de este ejercicio para este alumno (si está vacío, usa el de Ejercicios) |
| `notas` | una indicación tuya que el alumno ve durante la sesión |
| `bloque` | opcional. Para armar un **circuito**, poné la misma letra (por ejemplo `B`) en dos o más ejercicios **seguidos** según `orden`. Vacío = ejercicio normal |

### Circuitos

Los ejercicios seguidos con el mismo `bloque` se hacen por vueltas: una serie de cada uno y se vuelve a empezar.

- **Vueltas** = las `series` de cada ejercicio (si alguno tiene menos, en las últimas vueltas se saltea).
- **`descanso_seg` de cada ejercicio** = la pausa antes de pasar al siguiente (por ejemplo 15). Puede ser `0`: pasa directo.
- **`descanso_seg` del último del circuito** = el descanso al terminar la vuelta (por ejemplo 120).
- En la sesión, al marcar una serie la app pasa sola al siguiente ejercicio del circuito y muestra "vuelta 2 de 3". En Mi plan, el circuito aparece agrupado.

Si la columna `bloque` no está en tu hoja Planes, corré `configurar` de nuevo (menú **Profe Virtual → Configurar / reparar hojas**): la agrega al final sin tocar lo demás.

### Armar sesiones desde la app

En **Mi plan → Tus sesiones** aparecen **Armar sesión** y un botón por cada sesión para editarla. Elegís ejercicios del catálogo (o escribís uno nuevo), series, reps o segundos, descanso, carga inicial y nota, y podés unir ejercicios en circuito. Al guardar:

- La sesión queda en **Planes**, con las mismas columnas de siempre.
- Si la sesión ya existía, la versión anterior se copia a la hoja **Planes_archivo**, con la fecha. La app crea esa hoja la primera vez.
- El historial no se toca: la "última vez" y la carga sugerida siguen el **nombre** del ejercicio. Para no cortar la progresión, usá el mismo nombre.

Por ahora solo puede hacerlo **el dueño de la planilla**. Para habilitar a otra cuenta, agregá su email en `PUEDEN_ARMAR`, al principio de `proxy.gs`. Los alumnos no ven estos botones.

Para pasar el mismo plan a otro alumno: copiá las filas y cambiá el email.

**Biblioteca**: tus cadenas de progresión, compartidas por todos. Es la hoja que ordena el catálogo.

| columna | qué va |
|---|---|
| `patron` | se elige de la lista: Bisagra de Cadera, Bisagra de Rodilla, Core, Tracción, Empuje, Tren superior, Tren inferior, Full body |
| `enfoque` | se elige de la lista: Fuerza, Amplitud de Movimiento, Activación, Potencia, Equilibrio y Coordinación, Resistencia |
| `nivel_1` … `nivel_8` | los ejercicios de la cadena, **de la regresión a la progresión**, de izquierda a derecha. Usá los que hagan falta |

- Una fila por cadena. Cada ejercicio va en **una sola** cadena; si se repite, vale la primera.
- La regresión y la progresión de cada ejercicio salen de sus vecinos en la fila: no hace falta cargarlas aparte.
- Al armar una sesión, el buscador agrupa por patrón, filtra por enfoque y marca en qué nivel de cada cadena está el alumno.
- La primera vez, `configurar` arma la Biblioteca sola siguiendo la regresión y la progresión de tu hoja Ejercicios, y lleva cada patrón viejo al más parecido de la lista (por ejemplo, Sentadilla → Bisagra de Rodilla). Revisalos, y completá el enfoque, que queda vacío.
- Para sumar otro patrón o enfoque, agregalo en `PATRONES` o `ENFOQUES`, al principio de `proxy.gs`, y corré `configurar`. La app muestra los patrones en ese orden.

**Ejercicios**: la ficha de técnica de cada ejercicio. Es opcional: completala de a poco, para los que tengan video o claves.

| columna | qué va |
|---|---|
| `ejercicio` | nombre, igual que en Biblioteca y Planes |
| `video_url` | link de YouTube **no listado** |
| `como_1`, `como_2`, `como_3` | las tres claves de técnica |
| `error_comun`, `musculos` (separados por coma), `por_que` | |
| `patron`, `regresion`, `progresion` | solo cuentan para los ejercicios que **no** están en la Biblioteca |
| `por_lado` | casilla: marcala en los ejercicios **unilaterales** (por ejemplo, Peso muerto a una pierna). La app muestra "reps por lado" y las repeticiones se registran de cada lado |

**Sesiones** y **Registro** las escribe la app. Podés leerlas, filtrarlas o armar gráficos en otra hoja, pero no cambies los encabezados. Registro guarda cada serie y queda completo, aunque la app solo lee las últimas 16 semanas (`SEMANAS_HISTORIAL` en el proxy).

**Progresiones** también la escribe la app: una fila por alumno y ejercicio, con la **primera** vez (fecha, carga y reps de la mejor serie), la **última**, la mejor carga y cuántas sesiones lleva. Se actualiza al guardar cada sesión. Es la hoja para ver de un vistazo cómo viene cada alumno, y la app la usa para la "última vez" cuando es más vieja que 16 semanas. Si alguna vez la querés rehacer desde Registro: menú **Profe Virtual → Rehacer Progresiones desde Registro**.

### Orden de la planilla (lo arma `configurar`)

- **Listas desplegables**:
  - `ejercicio`, en Planes y en Ejercicios: sugiere los ejercicios de la Biblioteca. Si escribís uno que no está, avisa con una marca roja, pero no lo bloquea. Agregalo primero a la Biblioteca, así el nombre coincide en todas las hojas.
  - `estado` en Alumnos: activo, vencido o pausa.
  - `unidad` en Planes: reps, seg, reps por lado o seg por lado.
  - La lista de ejercicios sale de una hoja oculta, **Listas**, que se actualiza sola con la Biblioteca. No la edites.
- **Aviso antes de editar**: Sesiones, Registro, Progresiones, Planes_archivo, Panel y Listas piden confirmación si las editás a mano. La app las sigue escribiendo igual.
- **Panel**: la primera hoja, una fila por alumno, hecha solo con fórmulas. Muestra:
  - estado, días por semana y última sesión;
  - días sin entrenar (en amarillo, si pasan 7);
  - sesiones de los últimos 30 días y constancia de las últimas 4 semanas (sesiones hechas / días × 4);
  - vencimiento y días para vencer (en rojo, si faltan 7 o menos);
  - cuántos ejercicios tiene registrados.

  No escribas en el Panel: corré `configurar` para rehacerlo.
- **Columnas que ya no uses** (por ejemplo `patron`, `regresion` y `progresion` de Ejercicios, cuando todo esté en la Biblioteca): **ocultalas**, no las borres. Si las borrás, `configurar` las vuelve a crear.

## Regla de carga sugerida

El método: se trabaja en el rango de repeticiones del plan (por defecto, de **4 a 12** al agregar un ejercicio) y se sube la carga recién cuando el tope sale **cómodo, firme y sin pausas**.

Si la última vez el alumno llegó al tope del rango en todas las series, **sin pausas** (y, si registró RIR, con RIR 2 o más), se sugiere subir **2,5 kg**, o **1 kg** si la carga es menor a 10 kg. Si no, se repite la carga.

**Pausas:** al marcar cada serie, la barra de descanso pregunta si hubo pausas dentro de la serie (No, 1, 2, 3+). Si no se toca, cuenta como sin pausas. Quedan en la columna `pausas` de Registro. El botón ⓘ explica el método: ante el fallo, frenar unos 10 segundos para que el músculo recupere ATP y seguir; funciona, pero para subir la carga o de nivel las pausas tienen que ser cero.

Si la sesión se editó desde la app **después** del último registro de ese ejercicio, manda la carga del plan (columna `actualizado` de Planes). Al abrir el editor, la carga ya muestra la que la app propondría, así que guardar sin tocarla no cambia nada.

**Recomendación al empezar cada ejercicio** (el alumno siempre decide):
- La última vez completó el tope en todas las series **sin pausas** → la carga ya viene subida y las repeticiones bajan **siempre a la mitad** de las últimas, aunque quede debajo del rango del ejercicio (12 × 50 kg → 6 × 52,5 kg; de 8 → 4; con un número impar se redondea para abajo, para que quede margen: 9 → 4), para volver a construir hasta el tope. La app lo presenta como la estructura del programa, que funciona y previene lesiones, y aclara que la decisión es del alumno. Si hay un nivel siguiente en la cadena, también se ofrece pasar a él.
- Llegó al tope pero **con pausas** → la app recomienda repetir la carga hasta lograrlo sin pausas, con un botón **Subir igual** por si prefiere avanzar.
- Dos sesiones seguidas sin llegar al mínimo de repeticiones → sugiere volver un nivel, aclarando que retroceder también es parte del proceso.

**Pendiente:** algunos ejercicios necesitan más volumen de repeticiones antes de pasar de nivel (por ejemplo, de flexiones con rodillas a flexiones completas). Por ahora el rango se ajusta a mano en cada ejercicio del plan.

## Datos sensibles

El check-in (sueño, estrés, energía) y el registro de esfuerzo quedan en tu planilla. Conviene contárselo a tus alumnos antes de que empiecen.
