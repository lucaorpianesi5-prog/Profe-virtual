/**
 * Profe Virtual — proxy de datos.
 * Va dentro de la planilla "Profe Virtual — Datos" (Extensiones → Apps Script). Ver CONFIGURACION.md.
 *
 * Seguridad: la app nunca ve la planilla. Cada pedido trae la identidad verificada de Google
 * (o un token firmado por este script), y solo se leen o escriben las filas de ese alumno.
 */

// ID de cliente OAuth de Google Cloud (el mismo que va en index.html). No es secreto.
const CLIENT_ID = '290132927246-beo9h34ie995ikholsirpa1l8sg03prs.apps.googleusercontent.com';
// Días que dura la sesión en el dispositivo antes de volver a pedir "Entrar con Google".
const DIAS_TOKEN = 60;
// Versión del proxy: la app la muestra al final de Inicio y de Más, para saber si la última versión está publicada.
const VERSION_PROXY = '1.11 · 04/11/2026';
// Quién puede armar su plan desde la app ("Armar sesión" en Mi plan). El dueño de la planilla siempre puede;
// para habilitar a otra cuenta, agregá su email acá, por ejemplo ['alguien@gmail.com'].
const PUEDEN_ARMAR = [];
// Patrones de movimiento de la Biblioteca (lista desplegable en la columna "patron"; la app los muestra en este orden).
const PATRONES = ['Bisagra de Cadera', 'Bisagra de Rodilla', 'Core', 'Tracción', 'Empuje', 'Tren superior', 'Tren inferior', 'Full body'];
// Enfoques de la Biblioteca (lista desplegable en la columna "enfoque").
const ENFOQUES = ['Fuerza', 'Amplitud de Movimiento', 'Activación', 'Potencia', 'Equilibrio y Coordinación', 'Resistencia'];
// Cuántos niveles puede tener una cadena de la Biblioteca (de la regresión a la progresión).
const NIVELES = 8;
// La app recibe solo el registro de las últimas semanas (para "última vez", carga sugerida y Progreso).
// Lo anterior queda en la hoja Registro y resumido en Progresiones.
const SEMANAS_HISTORIAL = 16;

const HOJAS = {
  Alumnos:    ['email', 'nombre', 'estado', 'dias', 'registro_esfuerzo', 'fecha_alta', 'fecha_pago', 'fecha_vencimiento', 'monto', 'notas'],
  Planes:     ['email', 'sesion', 'sesion_nombre', 'orden', 'ejercicio', 'series', 'reps_min', 'reps_max', 'unidad', 'descanso_seg', 'carga_kg', 'por_que', 'notas', 'bloque', 'actualizado'],
  Biblioteca: ['patron', 'enfoque'].concat(Array.from({ length: NIVELES }, (_, i) => 'nivel_' + (i + 1))),
  Ejercicios: ['ejercicio', 'patron', 'video_url', 'como_1', 'como_2', 'como_3', 'error_comun', 'musculos', 'por_que', 'regresion', 'progresion', 'por_lado'],
  Sesiones:   ['id_sesion', 'fecha', 'email', 'sesion', 'duracion_min', 'series', 'reducida', 'rpe_sesion', 'sueno', 'estres', 'energia', 'guardada'],
  Registro:   ['id_sesion', 'fecha', 'email', 'sesion', 'ejercicio', 'serie', 'carga_kg', 'reps', 'rir', 'rpe', 'pausas'],
  Progresiones: ['email', 'ejercicio', 'patron', 'enfoque', 'nivel', 'primera_fecha', 'primera_carga', 'primeras_reps',
                 'ultima_fecha', 'ultima_carga', 'ultimas_reps', 'mejor_carga', 'sesiones']
};

/* ───────── Puesta en marcha ─────────
   configurar es la primera función del archivo para que el botón "Ejecutar" del editor la elija sola. */

// Crea las hojas que falten (y columnas nuevas al final), sin borrar nada. Se puede correr más de una vez.
function configurar() {
  const lib = SpreadsheetApp.getActive();
  if (!lib) throw new Error('Este script tiene que estar dentro de la planilla: abrí "Profe Virtual — Datos" y entrá por Extensiones → Apps Script.');
  PropertiesService.getScriptProperties().setProperty('PLANILLA_ID', lib.getId());
  secreto();

  Object.keys(HOJAS).forEach(n => {
    let h = lib.getSheetByName(n);
    if (!h) h = lib.insertSheet(n);
    const cab = HOJAS[n];
    if (h.getLastRow() === 0) {
      h.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
      h.setFrozenRows(1);
    } else {
      const actual = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
      cab.filter(c => actual.indexOf(c) < 0).forEach(c => h.getRange(1, h.getLastColumn() + 1).setValue(c).setFontWeight('bold'));
    }
  });
  // Las fechas que escribe la app quedan como texto (aaaa-mm-dd): así no cambian con la zona horaria.
  ['Sesiones', 'Registro'].forEach(n => lib.getSheetByName(n).getRange('B:B').setNumberFormat('@'));
  ['F:F', 'I:I'].forEach(c => lib.getSheetByName('Progresiones').getRange(c).setNumberFormat('@'));
  try {
    const lista = (valores, que) => SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(false)
      .setHelpText('Elegí uno de la lista. Para sumar otro, agregalo en ' + que + ' al principio del proxy y corré configurar.').build();
    lib.getSheetByName('Biblioteca').getRange('A2:A').setDataValidation(lista(PATRONES, 'PATRONES'));
    lib.getSheetByName('Biblioteca').getRange('B2:B').setDataValidation(lista(ENFOQUES, 'ENFOQUES'));
    // Ejercicios unilaterales: casilla en "por_lado" (las repeticiones se cuentan de cada lado)
    const he = lib.getSheetByName('Ejercicios'), cabE = he.getRange(1, 1, 1, he.getLastColumn()).getValues()[0].map(String);
    he.getRange(2, cabE.indexOf('por_lado') + 1, he.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  } catch (e) { Logger.log('No se pudieron poner las listas de patrón y enfoque: ' + e); }

  // Ejemplo para probar: vos como primer alumno, con un plan y un catálogo de muestra.
  const yo = Session.getEffectiveUser().getEmail();
  const alumnos = lib.getSheetByName('Alumnos');
  if (alumnos.getLastRow() === 1 && yo) {
    alumnos.appendRow([yo, 'Luca', 'activo', 'L,X,V', '', new Date(), '', '', '', 'Cuenta de prueba']);
  }
  const planes = lib.getSheetByName('Planes');
  if (planes.getLastRow() === 1 && yo) {
    const p = [
      ['A', 'Sentadilla y tracción', 1, 'Sentadilla goblet', 4, 6, 8, 'reps', 150, 20, '', '', ''],
      ['A', '', 2, 'Remo con mancuerna', 3, 8, 10, 'reps', 120, 22.5, '', '', ''],
      ['A', '', 3, 'Face pull', 3, 10, 12, 'reps', 90, 15, '', '', ''],
      ['B', 'Empuje y bisagra', 1, 'Peso muerto rumano', 3, 6, 8, 'reps', 150, 60, '', '', ''],
      ['B', '', 2, 'Press inclinado con mancuernas', 3, 8, 10, 'reps', 120, 22, '', '', ''],
      ['B', '', 3, 'Plancha', 3, 30, 30, 'seg', 60, 0, '', 'Respirá normal durante toda la serie.', ''],
      ['C', 'Unilateral y core', 1, 'Hip thrust', 3, 8, 10, 'reps', 120, 50, '', '', ''],
      ['C', '', 2, 'Zancada búlgara', 3, 8, 8, 'reps', 15, 12, '', 'Circuito: hacé una serie de cada ejercicio seguido y descansá al final de la vuelta.', 'C2'],
      ['C', '', 3, 'Dead bug', 3, 10, 10, 'reps', 90, 0, '', '', 'C2']
    ].map(r => [yo].concat(r));
    planes.getRange(2, 1, p.length, p[0].length).setValues(p);
  }
  const ejercicios = lib.getSheetByName('Ejercicios');
  if (ejercicios.getLastRow() === 1) {
    const e = [
      ['Sentadilla goblet', 'Sentadilla', '', 'Mancuerna pegada al pecho, pies al ancho de hombros.', 'Bajá entre las rodillas, con el pecho alto.', 'Subí empujando todo el pie contra el piso.', 'Que las rodillas se vayan hacia adentro.', 'Cuádriceps, Glúteos, Core', '', 'Sentadilla a cajón', 'Sentadilla frontal'],
      ['Remo con mancuerna', 'Tracción horizontal', '', 'Una mano y una rodilla en el banco, espalda plana.', 'Llevá el codo hacia la cadera, no hacia el techo.', 'Bajá lento hasta estirar del todo el brazo.', 'Girar el torso para ayudarse a subir.', 'Dorsal, Romboides, Bíceps', '', 'Remo en polea', 'Remo con barra'],
      ['Face pull', 'Hombro', '', 'Polea a la altura de la cara, agarre con cuerda.', 'Tirá hacia la frente abriendo los codos.', 'Frená un instante y volvé con control.', 'Usar demasiado peso y tirar con el cuerpo.', 'Deltoides posterior, Manguito rotador', '', '', ''],
      ['Peso muerto rumano', 'Bisagra de cadera', '', 'Pies al ancho de cadera, barra pegada a las piernas.', 'Llevá la cadera hacia atrás, con rodillas apenas flexionadas y espalda neutra.', 'Bajá hasta sentir estirar atrás del muslo y volvé empujando el piso.', 'Redondear la espalda baja o separar la barra del cuerpo.', 'Isquios, Glúteos, Espalda baja', 'Fortalece toda la cadena posterior, que es la que protege la zona lumbar.', 'Peso muerto con mancuernas', 'Buenos días con barra'],
      ['Press inclinado con mancuernas', 'Empuje horizontal', '', 'Banco a 30°, omóplatos juntos y pies firmes.', 'Bajá las mancuernas a la altura del pecho, con codos a unos 45°.', 'Empujá arriba y un poco hacia adentro.', 'Abrir demasiado los codos y cargar el hombro.', 'Pecho superior, Hombro, Tríceps', '', 'Press en máquina', 'Press de banca con barra'],
      ['Plancha', 'Core', '', 'Codos bajo los hombros, cuerpo en línea recta.', 'Apretá glúteos y abdomen, sin hundir la cadera.', 'Respirá normal y mantené la posición.', 'Dejar caer la cadera o subirla de más.', 'Abdomen, Glúteos, Hombros', '', 'Dead bug', 'Rueda abdominal'],
      ['Hip thrust', 'Bisagra de cadera', '', 'Espalda alta apoyada en el banco, pies al ancho de cadera.', 'Subí la cadera hasta alinear rodillas, cadera y hombros.', 'Apretá los glúteos arriba un segundo y bajá lento.', 'Arquear la zona lumbar al llegar arriba.', 'Glúteos, Isquios', '', '', ''],
      ['Zancada búlgara', 'Unilateral', '', 'Pie de atrás apoyado en el banco, pie de adelante a un paso largo.', 'Bajá en vertical, con el torso levemente inclinado.', 'Empujá con el talón de adelante para subir.', 'Apoyar el peso en la pierna de atrás.', 'Cuádriceps, Glúteos', '', 'Step-up', ''],
      ['Dead bug', 'Core', '', 'Boca arriba, brazos al techo y rodillas a 90°.', 'Estirá brazo y pierna contrarios sin despegar la espalda baja del piso.', 'Volvé y cambiá de lado con calma.', 'Arquear la espalda al estirar la pierna.', 'Abdomen profundo', '', '', 'Plancha']
    ];
    ejercicios.getRange(2, 1, e.length, e[0].length).setValues(e);
  }

  // Biblioteca: la primera vez se arma sola siguiendo las regresiones y progresiones de Ejercicios.
  const bib = lib.getSheetByName('Biblioteca');
  if (bib.getLastRow() === 1) {
    const cadenas = cadenasDesdeEjercicios();
    if (cadenas.length) bib.getRange(2, 1, cadenas.length, HOJAS.Biblioteca.length).setValues(cadenas);
  }
  // Progresiones: la primera vez se completa con todo lo que ya está en Registro.
  if (lib.getSheetByName('Progresiones').getLastRow() === 1) reconstruirProgresiones();

  // La hoja vacía que trae toda planilla nueva ya no hace falta.
  lib.getSheets().forEach(h => {
    if (!HOJAS[h.getName()] && ['Listas', 'Panel', 'Planes_archivo'].indexOf(h.getName()) < 0 && h.getLastRow() === 0 && lib.getSheets().length > 1) lib.deleteSheet(h);
  });
  // Ordenar la planilla: listas desplegables, Panel de alumnos y aviso en las hojas que escribe la app.
  // Cada parte va por separado: si una falla, las demás se aplican igual (y la app no depende de ninguna).
  [listasDesplegables, armarPanel, protegerHojasDeLaApp].forEach(f => {
    try { f(lib); } catch (e) { Logger.log('No se pudo completar ' + f.name + ': ' + e); }
  });
  Logger.log('Listo. Hojas: ' + Object.keys(HOJAS).join(', ') + '. Alumno de prueba: ' + yo);
}

/* ───────── Orden de la planilla (los aplica configurar) ───────── */
const ESTADOS = ['activo', 'vencido', 'pausa'];
const UNIDADES = ['reps', 'seg', 'reps por lado', 'seg por lado'];

// Letra de columna (1 → A, 27 → AA)
function letra(n) { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
// Letra de la columna que tiene ese encabezado en la hoja
function colDe(h, nombre) {
  const cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(c => txt(c));
  const j = cab.indexOf(nombre);
  if (j < 0) throw new Error('Falta la columna "' + nombre + '" en ' + h.getName());
  return letra(j + 1);
}
function columnaEntera(h, nombre) { return h.getRange(colDe(h, nombre) + '2:' + colDe(h, nombre)); }

// 1 y 2. Listas desplegables: ejercicios (desde la Biblioteca), estado de Alumnos y unidad de Planes.
function listasDesplegables(lib) {
  // Hoja oculta "Listas": todos los ejercicios de la Biblioteca, ordenados, para el desplegable.
  let li = lib.getSheetByName('Listas');
  if (!li) li = lib.insertSheet('Listas');
  actualizarListas(lib);
  li.hideSheet();
  // Ejercicio: sugiere los de la Biblioteca. Avisa (sin bloquear) si se escribe uno que no está.
  const ej = SpreadsheetApp.newDataValidation().requireValueInRange(li.getRange('A2:A'), true).setAllowInvalid(true)
    .setHelpText('Elegí un ejercicio de la Biblioteca. Si no está, agregalo primero en la Biblioteca para que el nombre coincida en todas las hojas.').build();
  columnaEntera(lib.getSheetByName('Planes'), 'ejercicio').setDataValidation(ej);
  columnaEntera(lib.getSheetByName('Ejercicios'), 'ejercicio').setDataValidation(ej);
  const lista = (valores, ayuda) => SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(false).setHelpText(ayuda).build();
  columnaEntera(lib.getSheetByName('Alumnos'), 'estado').setDataValidation(lista(ESTADOS, 'activo = entra a la app; vencido o pausa = queda afuera.'));
  columnaEntera(lib.getSheetByName('Planes'), 'unidad').setDataValidation(lista(UNIDADES, 'reps o seg; "por lado" para los unilaterales.'));
}

// 3. Las hojas que escribe la app avisan antes de editarlas a mano (se puede seguir si se confirma).
function protegerHojasDeLaApp(lib) {
  ['Sesiones', 'Registro', 'Progresiones', 'Planes_archivo', 'Panel', 'Listas'].forEach(n => {
    const h = lib.getSheetByName(n);
    if (!h || h.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
    h.protect().setDescription('La escribe la app: editarla a mano puede romper datos.').setWarningOnly(true);
  });
}

// Lista de ejercicios de la Biblioteca (hoja oculta Listas), escrita como valores: sin fórmulas.
// Se rehace con configurar y cada vez que se edita la Biblioteca (onEdit).
function actualizarListas(lib) {
  const li = lib.getSheetByName('Listas'), bib = lib.getSheetByName('Biblioteca');
  if (!li || !bib || bib.getLastRow() < 2) return;
  const v = bib.getRange(1, 1, bib.getLastRow(), bib.getLastColumn()).getValues(), cab = v.shift().map(c => txt(c));
  const cols = cab.map((c, j) => /^nivel_\d+$/.test(c) ? j : -1).filter(j => j >= 0), vistos = {}, nombres = [];
  v.forEach(r => cols.forEach(j => { const n = txt(r[j]); if (n && !vistos[norm(n)]) { vistos[norm(n)] = true; nombres.push(n); } }));
  nombres.sort((a, b) => a.localeCompare(b, 'es'));
  if (li.getLastRow() > 0) li.getRange(1, 1, li.getLastRow(), 1).clearContent();
  li.getRange(1, 1, nombres.length + 1, 1).setValues([['ejercicios (de la Biblioteca, no editar)']].concat(nombres.map(n => [n])));
}

// 4. Panel: una fila por alumno, calculada por el script y escrita como valores (sin fórmulas).
// Se actualiza al abrir la planilla, al guardar cada sesión y con configurar.
const PANEL_CAB = ['Alumno', 'Email', 'Estado', 'Días por semana', 'Última sesión', 'Días sin entrenar',
  'Sesiones (últimos 30 días)', 'Constancia (4 semanas)', 'Vence', 'Días para vencer', 'Ejercicios registrados'];
function armarPanel(lib) {
  let p = lib.getSheetByName('Panel');
  if (!p) p = lib.insertSheet('Panel', 0);
  p.clear();
  try { p.setConditionalFormatRules([]); } catch (e) {}
  p.getRange(1, 1, 1, PANEL_CAB.length).setValues([PANEL_CAB]).setFontWeight('bold').setWrap(true);
  p.setFrozenRows(1);
  p.setColumnWidth(1, 150); p.setColumnWidth(2, 220);
  actualizarPanel(lib);
}
function actualizarPanel(lib) {
  const p = lib.getSheetByName('Panel');
  if (!p) return;
  const tz = lib.getSpreadsheetTimeZone(), iso = d => d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : txt(d);
  const hoy = iso(new Date());
  const dias = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
  const esIso = t => /^\d{4}-\d{2}-\d{2}$/.test(t);
  const comoFecha = t => new Date(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10));
  const leer = n => { const h = lib.getSheetByName(n); if (!h || h.getLastRow() < 2) return [];
    const v = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues(), cab = v.shift().map(c => txt(c));
    return v.filter(r => r.some(c => c !== '')).map(r => { const o = {}; cab.forEach((c, j) => { if (c) o[c] = r[j]; }); return o; }); };
  const ses = leer('Sesiones').map(r => ({ e: norm(r.email), f: iso(r.fecha) })).filter(x => esIso(x.f));
  const prog = leer('Progresiones').map(r => norm(r.email));
  const filasP = leer('Alumnos').filter(a => txt(a.email)).map(a => {
    const e = norm(a.email), mias = ses.filter(x => x.e === e).map(x => x.f).sort();
    const ult = mias.length ? mias[mias.length - 1] : '';
    const nd = txt(a.dias) ? txt(a.dias).split(',').filter(x => x.trim()).length : '';
    const en = n => mias.filter(f => dias(f, hoy) <= n).length;
    const vence = iso(a.fecha_vencimiento);
    return [txt(a.nombre), e, txt(a.estado || 'activo'), nd || '—', ult ? comoFecha(ult) : '—', ult ? dias(ult, hoy) : '',
      en(30), nd ? Math.min(1, en(28) / (nd * 4)) : '', esIso(vence) ? comoFecha(vence) : (vence || ''), esIso(vence) ? dias(hoy, vence) : '',
      prog.filter(x => x === e).length];
  });
  if (p.getLastRow() > 1) p.getRange(2, 1, p.getLastRow() - 1, PANEL_CAB.length).clearContent().setBackground(null);
  if (filasP.length) {
    p.getRange(2, 1, filasP.length, PANEL_CAB.length).setValues(filasP);
    p.getRange(2, 5, filasP.length, 1).setNumberFormat('dd/mm/yyyy');
    p.getRange(2, 9, filasP.length, 1).setNumberFormat('dd/mm/yyyy');
    p.getRange(2, 8, filasP.length, 1).setNumberFormat('0%');
    // Alertas: más de 7 días sin entrenar (amarillo) y suscripción que vence en 7 días o menos (rojo)
    filasP.forEach((r, i) => {
      if (typeof r[5] === 'number' && r[5] > 7) p.getRange(i + 2, 6).setBackground('#FCE8B2');
      if (typeof r[9] === 'number' && r[9] <= 7) p.getRange(i + 2, 10).setBackground('#F4C7C3');
    });
  }
  p.getRange('A1').setNote('Se actualiza solo: al abrir la planilla, cada vez que alguien guarda una sesión y con configurar. Última actualización: ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm'));
}

// Arma cadenas (una fila por cadena) siguiendo regresion → ejercicio → progresion de la hoja Ejercicios.
function cadenasDesdeEjercicios() {
  const sig = {}, ant = {}, nombre = {}, patron = {};
  const k = n => norm(n);
  filas('Ejercicios').filter(r => r.ejercicio).forEach(r => {
    const e = txt(r.ejercicio); nombre[k(e)] = e; if (r.patron) patron[k(e)] = txt(r.patron);
    if (r.progresion) { const p = txt(r.progresion); nombre[k(p)] = nombre[k(p)] || p; if (!sig[k(e)]) { sig[k(e)] = k(p); ant[k(p)] = ant[k(p)] || k(e); } }
    if (r.regresion) { const g = txt(r.regresion); nombre[k(g)] = nombre[k(g)] || g; if (!sig[k(g)]) { sig[k(g)] = k(e); ant[k(e)] = ant[k(e)] || k(g); } }
  });
  const visto = {}, out = [];
  Object.keys(nombre).filter(n => !ant[n]).forEach(ini => {
    const cad = [];
    for (let n = ini; n && !visto[n] && cad.length < NIVELES; n = sig[n]) { visto[n] = true; cad.push(n); }
    const pat = patronNuevo(cad.map(n => patron[n]).find(Boolean) || '', cad.map(n => nombre[n]).join(' '));
    const fila = [pat, ''].concat(cad.map(n => nombre[n]));
    while (fila.length < HOJAS.Biblioteca.length) fila.push('');
    out.push(fila);
  });
  return out.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

// Lleva un patrón viejo (o el nombre del ejercicio) a la lista PATRONES. Si no se reconoce, queda vacío para elegirlo.
function patronNuevo(pat, ejercicios) {
  const t = norm(pat + ' ' + ejercicios).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ya = PATRONES.find(p => norm(p) === norm(pat));
  if (ya) return ya;
  if (/sentadilla|rodilla|prensa|extension de cuad/.test(t)) return 'Bisagra de Rodilla';
  if (/bisagra|cadera|peso muerto|hip thrust|puente|buenos dias|swing/.test(t)) return 'Bisagra de Cadera';
  if (/core|plancha|dead bug|abdominal|pallof/.test(t)) return 'Core';
  if (/traccion|remo|jalon|dominada|face pull/.test(t)) return 'Tracción';
  if (/empuje|press|flexion|fondos/.test(t)) return 'Empuje';
  if (/unilateral|zancada|estocada|step|bulgara|gemelo|pierna/.test(t)) return 'Tren inferior';
  if (/hombro|biceps|triceps|brazo|elevacion/.test(t)) return 'Tren superior';
  return '';
}

// Rehace la hoja Progresiones a partir de todo el Registro (configurar la usa la primera vez; también está en el menú).
function reconstruirProgresiones() {
  const h = hoja('Progresiones');
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).clearContent();
  const porSesion = {};
  filas('Registro').forEach(r => {
    const email = norm(r.email), ej = txt(r.ejercicio); if (!email || !ej) return;
    const key = email + '|' + txt(r.id_sesion) + '|' + norm(ej);
    (porSesion[key] = porSesion[key] || { email: email, ej: ej, f: fecha(r.fecha), series: [] }).series.push({ kg: num(r.carga_kg), reps: num(r.reps) });
  });
  const cat = catalogo().cat, mapa = {};
  Object.keys(porSesion).map(k => porSesion[k]).sort((a, b) => a.f.localeCompare(b.f))
    .forEach(x => plegar(mapa, x.email, x.ej, x.f, mejorSerie(x.series), cat));
  const cab = HOJAS.Progresiones, v = Object.keys(mapa).map(k => cab.map(c => vacio(mapa[k][c])));
  if (v.length) h.getRange(2, 1, v.length, cab.length).setValues(v);
  Logger.log('Progresiones: ' + v.length + ' filas.');
}

// Menú "Profe Virtual" en la planilla (corre solo al abrirla, no desde el editor).
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Profe Virtual')
    .addItem('Configurar / reparar hojas', 'configurar')
    .addItem('Actualizar Panel', 'actualizarPanelMenu')
    .addItem('Rehacer Progresiones desde Registro', 'reconstruirProgresiones')
    .addToUi();
  try { actualizarPanel(SpreadsheetApp.getActive()); } catch (e) {}   // el Panel queda al día cada vez que abrís la planilla
}
function actualizarPanelMenu() { actualizarPanel(SpreadsheetApp.getActive()); }
// Al editar la Biblioteca, la lista desplegable de ejercicios se actualiza sola.
function onEdit(e) {
  try { if (e && e.range && e.range.getSheet().getName() === 'Biblioteca') actualizarListas(e.source); } catch (err) {}
}

/* ───────── Entrada ───────── */
function doPost(e) {
  let r;
  try {
    r = atender(JSON.parse((e && e.postData && e.postData.contents) || '{}'));
  } catch (err) {
    r = { ok: false, error: err.code || 'error', mensaje: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return ContentService.createTextOutput('Profe Virtual: el proxy está funcionando.');
}

function atender(q) {
  if (q.accion === 'login') {
    const email = verificarGoogle(q.idToken);
    const alumno = buscarAlumno(email);
    return Object.assign({ ok: true, token: firmar(email) }, datosDe(alumno));
  }
  const email = leerToken(q.token);
  const alumno = buscarAlumno(email);   // en cada pedido: si Luca lo pasa a "vencido", deja de entrar
  if (q.accion === 'datos') return Object.assign({ ok: true }, datosDe(alumno));
  if (q.accion === 'guardarSesion') return Object.assign({ ok: true }, guardarSesion(email, q.sesion, q.series));
  if (q.accion === 'preferencias') return Object.assign({ ok: true }, guardarPreferencias(alumno, q));
  if (q.accion === 'agregarABiblioteca') {
    if (!puedeArmar(email)) throw falla('permiso', 'Tu cuenta no puede cargar ejercicios');
    agregarABiblioteca(q);
    return Object.assign({ ok: true }, datosDe(alumno));
  }
  if (q.accion === 'guardarSesionPlan' || q.accion === 'borrarSesionPlan') {
    if (!puedeArmar(email)) throw falla('permiso', 'Tu cuenta no puede armar sesiones');
    reemplazarSesionPlan(email, q.sesion, q.accion === 'guardarSesionPlan' ? q : null);
    return Object.assign({ ok: true }, datosDe(alumno));
  }
  throw falla('accion', 'Acción desconocida: ' + q.accion);
}

function falla(code, mensaje) {
  const e = new Error(mensaje || code);
  e.code = code;
  return e;
}

/* ───────── Identidad ───────── */
// Google firma el ID token; tokeninfo comprueba firma y vencimiento. Acá se comprueba que sea para esta app.
function verificarGoogle(idToken) {
  if (!idToken) throw falla('auth', 'Falta el token de Google');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw falla('auth', 'Token de Google inválido o vencido');
  const t = JSON.parse(res.getContentText());
  if (t.aud !== CLIENT_ID) throw falla('auth', 'El token no es de esta app');
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw falla('auth', 'Emisor inválido');
  if (String(t.email_verified) !== 'true') throw falla('auth', 'El email de Google no está verificado');
  return String(t.email).trim().toLowerCase();
}

// Token propio (email + vencimiento, firmado con HMAC) para no pedir Google en cada uso.
function secreto() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SECRETO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRETO', s); }
  return s;
}
function firma(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secreto()));
}
function firmar(email) {
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ e: email, x: Date.now() + DIAS_TOKEN * 864e5 }));
  return payload + '.' + firma(payload);
}
function leerToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2 || firma(partes[0]) !== partes[1]) throw falla('auth', 'Sesión inválida');
  const d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
  if (!d.x || d.x < Date.now()) throw falla('auth', 'La sesión venció');
  return d.e;
}

function puedeArmar(email) {
  let dueno = '';
  try { dueno = norm(Session.getEffectiveUser().getEmail()); } catch (e) {}
  return (!!dueno && email === dueno) || PUEDEN_ARMAR.map(norm).indexOf(email) >= 0;
}

function buscarAlumno(email) {
  const a = filas('Alumnos').find(r => norm(r.email) === email);
  if (!a) throw falla('no_alumno', email);
  const estado = norm(a.estado || 'activo');
  if (estado !== 'activo') throw falla('inactivo', estado);
  return a;
}

/* ───────── Lectura ───────── */
// Catálogo: las cadenas de la Biblioteca (patrón, enfoque, nivel, regresión y progresión) + la ficha de técnica de
// Ejercicios. Un ejercicio que no está en la Biblioteca conserva el patrón, la regresión y la progresión de su ficha.
function catalogo() {
  const fichas = {};
  filas('Ejercicios').filter(r => r.ejercicio).forEach(r => {
    fichas[norm(r.ejercicio)] = {
      n: txt(r.ejercicio), pat: txt(r.patron), video: txt(r.video_url),
      como: [r.como_1, r.como_2, r.como_3].map(txt).filter(Boolean),
      err: txt(r.error_comun), mus: txt(r.musculos).split(',').map(x => x.trim()).filter(Boolean),
      por: txt(r.por_que), reg: txt(r.regresion), prog: txt(r.progresion), lado: siNo(r.por_lado)
    };
  });
  const cat = {}, cadenas = [];
  let bib = [];
  try { bib = filas('Biblioteca'); } catch (e) { /* planilla sin Biblioteca todavía: queda el catálogo de Ejercicios */ }
  bib.forEach(r => {
    const ej = [];
    for (let i = 1; i <= NIVELES; i++) { const n = txt(r['nivel_' + i]); if (n && !cat[norm(n)] && ej.indexOf(n) < 0) ej.push(n); }
    if (!ej.length) return;
    const c = cadenas.length;
    cadenas.push({ pat: txt(r.patron), enf: txt(r.enfoque), ej: ej });
    ej.forEach((n, i) => {
      const f = fichas[norm(n)] || { n: n, video: '', como: [], err: '', mus: [], por: '' };
      cat[norm(n)] = Object.assign({}, f, { n: n, pat: txt(r.patron) || f.pat || '', enf: txt(r.enfoque), cad: c, niv: i + 1, reg: ej[i - 1] || '', prog: ej[i + 1] || '' });
    });
  });
  Object.keys(fichas).forEach(k => { if (!cat[k]) cat[k] = fichas[k]; });
  return { cat: cat, cadenas: cadenas };
}

function datosDe(a) {
  const email = norm(a.email);
  const cc = catalogo(), cat = cc.cat;

  const sesiones = {};
  filas('Planes').filter(r => norm(r.email) === email && r.ejercicio).forEach(r => {
    const k = txt(r.sesion || 'A').toUpperCase();
    const s = sesiones[k] = sesiones[k] || { sesion: k, nombre: '', ejercicios: [] };
    if (!s.nombre && r.sesion_nombre) s.nombre = txt(r.sesion_nombre);
    const c = cat[norm(r.ejercicio)] || {};
    const rmin = num(r.reps_min), rmax = num(r.reps_max), desc = num(r.descanso_seg);
    s.ejercicios.push({
      orden: num(r.orden) || s.ejercicios.length + 1,
      n: txt(r.ejercicio), pat: c.pat || '',
      s: num(r.series) || 3, r: [rmin || rmax || 10, rmax || rmin || 10],
      seg: /^seg/i.test(txt(r.unidad)), d: desc == null ? 90 : desc, kg: num(r.carga_kg) || 0,
      lado: txt(r.unidad) ? /lado/i.test(txt(r.unidad)) : !!c.lado,   // reps (o segundos) por lado
      act: r.actualizado instanceof Date ? r.actualizado.getTime() : 0,   // cuándo se editó desde la app
      por: txt(r.por_que) || c.por || '', notas: txt(r.notas),
      b: txt(r.bloque).toUpperCase(), porPlan: txt(r.por_que),   // mismo bloque en filas seguidas = circuito
      video: c.video || '', como: c.como || [], err: c.err || '', mus: c.mus || [], reg: c.reg || '', prog: c.prog || ''
    });
  });
  const plan = Object.keys(sesiones).sort().map(k => {
    sesiones[k].ejercicios.sort((x, y) => x.orden - y.orden);
    return sesiones[k];
  });

  const ses = filas('Sesiones').filter(r => norm(r.email) === email).map(r => ({
    id: txt(r.id_sesion), fecha: fecha(r.fecha), sesion: txt(r.sesion), dur: num(r.duracion_min), series: num(r.series), rpe: num(r.rpe_sesion),
    g: r.guardada instanceof Date ? r.guardada.getTime() : 0
  }));
  // Registro solo de las últimas semanas, leyendo el final de la hoja (las filas se agregan en orden)
  const desde = fecha(new Date(Date.now() - SEMANAS_HISTORIAL * 7 * 864e5));
  const historial = filasFinales('Registro', 6000).filter(r => norm(r.email) === email && fecha(r.fecha) >= desde).map(r => ({
    id: txt(r.id_sesion), fecha: fecha(r.fecha), sesion: txt(r.sesion), ej: txt(r.ejercicio),
    serie: num(r.serie), kg: num(r.carga_kg), reps: num(r.reps), rir: num(r.rir), rpe: num(r.rpe), pausas: num(r.pausas)
  }));

  return {
    alumno: {
      email: email, nombre: txt(a.nombre), dias: txt(a.dias), esfuerzo: norm(a.registro_esfuerzo), armar: puedeArmar(email),
      vencimiento: fecha(a.fecha_vencimiento), monto: num(a.monto)
    },
    plan: plan, catalogo: Object.keys(cat).map(k => cat[k]), cadenas: cc.cadenas, patrones: PATRONES, enfoques: ENFOQUES, version: VERSION_PROXY, sesiones: ses, historial: historial,
    progresiones: (libro().getSheetByName('Progresiones') ? filas('Progresiones') : []).filter(r => norm(r.email) === email).map(r => ({
      ej: txt(r.ejercicio), pf: fecha(r.primera_fecha), pk: num(r.primera_carga), pr: num(r.primeras_reps),
      uf: fecha(r.ultima_fecha), uk: num(r.ultima_carga), ur: num(r.ultimas_reps), mk: num(r.mejor_carga), n: num(r.sesiones)
    }))
  };
}

/* ───────── Escritura ───────── */
// Idempotente: si la app reintenta una sesión que ya llegó (por ejemplo, sin señal), no se duplica.
function guardarSesion(email, s, series) {
  if (!s || !s.id) throw falla('datos', 'Falta la sesión');
  series = Array.isArray(series) ? series : [];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const hs = hoja('Sesiones');
    if (hs.getLastRow() > 1) {
      const ya = hs.getRange(2, 1, hs.getLastRow() - 1, 1).createTextFinder(String(s.id)).matchEntireCell(true).findNext();
      if (ya) return { repetida: true };
    }
    const f = /^\d{4}-\d{2}-\d{2}$/.test(String(s.fecha)) ? String(s.fecha) : fecha(new Date());
    hs.appendRow([celda(s.id), f, email, celda(s.sesion), num(s.duracion_min), series.length, s.reducida ? 'sí' : 'no',
      vacio(num(s.rpe_sesion)), vacio(num(s.sueno)), vacio(num(s.estres)), vacio(num(s.energia)), new Date()]);
    const filasReg = series.map(x => [celda(s.id), f, email, celda(s.sesion), celda(x.ej), num(x.serie), num(x.kg), num(x.reps), vacio(num(x.rir)), vacio(num(x.rpe)), vacio(num(x.pausas))]);
    if (filasReg.length) {
      const hr = hoja('Registro');
      hr.getRange(hr.getLastRow() + 1, 1, filasReg.length, filasReg[0].length).setValues(filasReg);
      actualizarProgresiones(email, f, series);
      try { actualizarPanel(libro()); } catch (e) { /* el Panel es solo para Luca: si falla, la sesión igual queda guardada */ }
    }
    return { guardadas: filasReg.length };
  } finally {
    lock.releaseLock();
  }
}

/* ───────── Progresiones: primera y última vez de cada ejercicio, por alumno ───────── */
// La mejor serie de una sesión: la de más carga y, con esa carga, la de más repeticiones.
function mejorSerie(series) {
  let m = null;
  series.forEach(x => {
    const kg = num(x.kg) || 0, reps = num(x.reps) || 0;
    if (!m || kg > m.kg || (kg === m.kg && reps > m.reps)) m = { kg: kg, reps: reps };
  });
  return m || { kg: 0, reps: 0 };
}
function plegar(mapa, email, ej, f, m, cat) {
  const k = email + '|' + norm(ej), c = cat[norm(ej)] || {};
  let p = mapa[k];
  if (!p) {
    p = mapa[k] = { email: email, ejercicio: ej, primera_fecha: f, primera_carga: m.kg, primeras_reps: m.reps,
      ultima_fecha: f, ultima_carga: m.kg, ultimas_reps: m.reps, mejor_carga: m.kg, sesiones: 0 };
  } else {
    if (f < fecha(p.primera_fecha)) { p.primera_fecha = f; p.primera_carga = m.kg; p.primeras_reps = m.reps; }
    if (f >= fecha(p.ultima_fecha)) { p.ultima_fecha = f; p.ultima_carga = m.kg; p.ultimas_reps = m.reps; }
    p.mejor_carga = Math.max(num(p.mejor_carga) || 0, m.kg);
  }
  p.patron = c.pat || p.patron || ''; p.enfoque = c.enf || p.enfoque || ''; p.nivel = c.niv || p.nivel || '';
  p.sesiones = (num(p.sesiones) || 0) + 1;
  p._tocada = true;
}
function actualizarProgresiones(email, f, series) {
  if (!libro().getSheetByName('Progresiones')) return;   // falta correr configurar: el Registro igual queda completo
  const h = hoja('Progresiones'), cab = HOJAS.Progresiones, cat = catalogo().cat, mapa = {};
  filas('Progresiones').filter(r => norm(r.email) === email).forEach(r => { mapa[email + '|' + norm(r.ejercicio)] = r; });
  const porEj = {};
  series.forEach(x => { if (txt(x.ej)) (porEj[norm(x.ej)] = porEj[norm(x.ej)] || { ej: txt(x.ej), s: [] }).s.push(x); });
  Object.keys(porEj).forEach(k => plegar(mapa, email, porEj[k].ej, f, mejorSerie(porEj[k].s), cat));
  const nuevas = [];
  Object.keys(mapa).forEach(k => {
    const p = mapa[k]; if (!p._tocada) return;
    const fila = cab.map(c => c.indexOf('fecha') >= 0 ? fecha(p[c]) : vacio(p[c]));
    if (p._fila) h.getRange(p._fila, 1, 1, cab.length).setValues([fila]); else nuevas.push(fila);
  });
  if (nuevas.length) h.getRange(h.getLastRow() + 1, 1, nuevas.length, cab.length).setValues(nuevas);
}

// Ejercicio nuevo desde la app (Armar sesión): entra a la Biblioteca como cadena propia o dentro de una cadena
// existente, antes o después de otro ejercicio (q.junto + q.lado = 'antes' | 'despues'). Si es unilateral, se crea
// o marca su ficha en Ejercicios con por_lado.
function agregarABiblioteca(q) {
  const n = celda(q.n).slice(0, 80);
  if (!txt(n)) throw falla('datos', 'Falta el nombre del ejercicio');
  const pat = PATRONES.find(x => norm(x) === norm(q.pat)), enf = ENFOQUES.find(x => norm(x) === norm(q.enf));
  if (!pat || !enf) throw falla('datos', 'Elegí el patrón y el enfoque');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const h = hoja('Biblioteca');
    const v = h.getRange(1, 1, Math.max(1, h.getLastRow()), h.getLastColumn()).getValues();
    const cab = v[0].map(c => txt(c)), niv = cab.map((c, j) => /^nivel_\d+$/.test(c) ? j : -1).filter(j => j >= 0);
    const cp = cab.indexOf('patron'), ce = cab.indexOf('enfoque');
    for (let i = 1; i < v.length; i++) if (niv.some(j => norm(v[i][j]) === norm(n))) throw falla('datos', '"' + n + '" ya está en la Biblioteca');
    let fila = -1, lista = [];
    if (txt(q.junto)) {
      for (let i = 1; i < v.length && fila < 0; i++) if (niv.some(j => norm(v[i][j]) === norm(q.junto))) fila = i;
      if (fila < 0) throw falla('datos', 'No encontré "' + q.junto + '" en la Biblioteca');
      lista = niv.map(j => txt(v[fila][j])).filter(Boolean);
      if (lista.length >= niv.length) throw falla('datos', 'Esa cadena ya tiene ' + niv.length + ' niveles');
      const k = lista.map(norm).indexOf(norm(q.junto));
      lista.splice(q.lado === 'antes' ? k : k + 1, 0, n);
      niv.forEach((j, x) => { v[fila][j] = lista[x] || ''; });
      h.getRange(fila + 1, 1, 1, cab.length).setValues([v[fila]]);
    } else {
      const nueva = cab.map(() => '');
      nueva[cp] = pat; nueva[ce] = enf; nueva[niv[0]] = n;
      h.getRange(h.getLastRow() + 1, 1, 1, cab.length).setValues([nueva]);
    }
    if (q.porLado) {
      const he = hoja('Ejercicios'), ve = he.getRange(1, 1, Math.max(1, he.getLastRow()), he.getLastColumn()).getValues();
      const cabE = ve[0].map(c => txt(c)), jn = cabE.indexOf('ejercicio'), jl = cabE.indexOf('por_lado');
      let fe = -1;
      for (let i = 1; i < ve.length; i++) if (norm(ve[i][jn]) === norm(n)) fe = i;
      if (jl >= 0) {
        if (fe < 0) { const r = cabE.map(() => ''); r[jn] = n; r[jl] = true; he.getRange(he.getLastRow() + 1, 1, 1, cabE.length).setValues([r]); }
        else he.getRange(fe + 1, jl + 1).setValue(true);
      }
    }
    try { actualizarListas(libro()); } catch (e) {}
  } finally {
    lock.releaseLock();
  }
}

// Reemplaza (o borra, si ses es null) una sesión del plan del alumno. Antes, copia las filas anteriores
// a la hoja Planes_archivo con la fecha, para poder recuperarlas.
function reemplazarSesionPlan(email, letra, ses) {
  letra = txt(letra).toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(letra)) throw falla('datos', 'Letra de sesión inválida');
  let ejs = [];
  if (ses) {
    ejs = (Array.isArray(ses.ejercicios) ? ses.ejercicios : []).filter(e => e && txt(e.n)).slice(0, 40);
    if (!ejs.length) throw falla('datos', 'La sesión no tiene ejercicios');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const h = hoja('Planes');
    const v = h.getDataRange().getValues();
    const cab = v[0].map(c => txt(c));
    const ce = cab.indexOf('email'), cs = cab.indexOf('sesion');
    const viejas = [];
    for (let i = 1; i < v.length; i++) {
      if (norm(v[i][ce]) === email && txt(v[i][cs] || 'A').toUpperCase() === letra) viejas.push(i + 1);
    }
    if (viejas.length) {
      const lib = libro();
      let ar = lib.getSheetByName('Planes_archivo');
      if (!ar) {
        ar = lib.insertSheet('Planes_archivo');
        ar.getRange(1, 1, 1, cab.length + 1).setValues([['archivado'].concat(cab)]).setFontWeight('bold');
        ar.setFrozenRows(1);
      }
      const ahora = new Date();
      const copia = viejas.map(f => [ahora].concat(v[f - 1]));
      ar.getRange(ar.getLastRow() + 1, 1, copia.length, copia[0].length).setValues(copia);
      // Se borran de abajo hacia arriba para que los números de fila no se corran
      for (let k = viejas.length - 1; k >= 0; k--) h.deleteRow(viejas[k]);
    }
    if (ejs.length) {
      const nuevas = ejs.map((e, i) => {
        const fila = cab.map(() => '');
        const rmin = Math.max(1, Math.round(num(e.rmin) || num(e.rmax) || 10));
        const rmax = Math.max(rmin, Math.round(num(e.rmax) || rmin));
        const poner = (c, val) => { const j = cab.indexOf(c); if (j >= 0) fila[j] = val; };
        poner('email', email); poner('sesion', letra); poner('sesion_nombre', i === 0 ? celda(ses.nombre) : '');
        poner('orden', i + 1); poner('ejercicio', celda(e.n));
        poner('series', Math.min(20, Math.max(1, Math.round(num(e.s) || 3))));
        poner('reps_min', rmin); poner('reps_max', rmax); poner('unidad', (e.seg ? 'seg' : 'reps') + (e.lado ? ' por lado' : ''));
        poner('descanso_seg', Math.min(900, Math.max(0, Math.round(num(e.d) == null ? 90 : num(e.d)))));
        poner('carga_kg', Math.max(0, num(e.kg) || 0)); poner('notas', celda(e.notas).slice(0, 300));
        poner('por_que', celda(e.porPlan).slice(0, 500));
        poner('bloque', celda(e.b).toUpperCase().slice(0, 3));
        poner('actualizado', new Date());   // así la carga que pusiste le gana a la sugerida hasta que vuelvas a entrenar
        return fila;
      });
      h.getRange(h.getLastRow() + 1, 1, nuevas.length, cab.length).setValues(nuevas);
    }
  } finally {
    lock.releaseLock();
  }
}

function guardarPreferencias(a, q) {
  const h = hoja('Alumnos');
  const cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  const poner = (col, valor) => { const j = cab.indexOf(col); if (j >= 0) h.getRange(a._fila, j + 1).setValue(valor); };
  if (['nada', 'rir', 'rpe', 'ambos'].indexOf(q.esfuerzo) >= 0) poner('registro_esfuerzo', q.esfuerzo);
  if (typeof q.dias === 'string' && /^[LMXJVSD](,[LMXJVSD]){0,6}$/.test(q.dias)) poner('dias', q.dias);
  return {};
}

/* ───────── Planilla ───────── */
function libro() {
  const id = PropertiesService.getScriptProperties().getProperty('PLANILLA_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}
function hoja(nombre) {
  const h = libro().getSheetByName(nombre);
  if (!h) throw falla('config', 'Falta la hoja "' + nombre + '". Corré configurar() desde el editor de Apps Script.');
  return h;
}
// Filas como objetos { columna: valor, _fila: n }, sin filas vacías.
function filas(nombre) {
  const v = hoja(nombre).getDataRange().getValues();
  const cab = v.shift().map(c => String(c).trim());
  const out = [];
  v.forEach((r, i) => {
    if (!r.some(c => c !== '')) return;
    const o = { _fila: i + 2 };
    cab.forEach((c, j) => { if (c) o[c] = r[j]; });
    out.push(o);
  });
  return out;
}
// Las últimas n filas de una hoja como objetos (para no leer todo el Registro en cada pedido).
function filasFinales(nombre, n) {
  const h = hoja(nombre), ult = h.getLastRow();
  if (ult < 2) return [];
  const cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(c => String(c).trim());
  const desde = Math.max(2, ult - n + 1);
  return h.getRange(desde, 1, ult - desde + 1, cab.length).getValues().filter(r => r.some(c => c !== '')).map(r => {
    const o = {}; cab.forEach((c, j) => { if (c) o[c] = r[j]; }); return o;
  });
}
function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function txt(v) { return String(v == null ? '' : v).trim(); }
function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
function siNo(v) { return v === true || /^(s[ií]|x|true|verdadero|1)$/i.test(txt(v)); }
function vacio(v) { return v == null ? '' : v; }
// Texto que viene de la app: que nunca se interprete como fórmula en la planilla.
function celda(v) { const s = txt(v).slice(0, 200); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function fecha(v) {
  if (v instanceof Date) return Utilities.formatDate(v, libro().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return txt(v);
}

