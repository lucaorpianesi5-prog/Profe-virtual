/**
 * Profe Virtual — proxy de datos.
 * Va dentro de la planilla "Profe Virtual — Datos" (Extensiones → Apps Script). Ver CONFIGURACION.md.
 *
 * Seguridad: la app nunca ve la planilla. Cada pedido trae la identidad verificada de Google
 * (o un token firmado por este script), y solo se leen o escriben las filas de ese alumno.
 */

// ID de cliente OAuth de Google Cloud (el mismo que va en index.html). No es secreto.
const CLIENT_ID = 'PEGAR_ACA.apps.googleusercontent.com';
// Días que dura la sesión en el dispositivo antes de volver a pedir "Entrar con Google".
const DIAS_TOKEN = 60;

const HOJAS = {
  Alumnos:    ['email', 'nombre', 'estado', 'dias', 'registro_esfuerzo', 'fecha_alta', 'fecha_pago', 'fecha_vencimiento', 'monto', 'notas'],
  Planes:     ['email', 'sesion', 'sesion_nombre', 'orden', 'ejercicio', 'series', 'reps_min', 'reps_max', 'unidad', 'descanso_seg', 'carga_kg', 'por_que', 'notas'],
  Ejercicios: ['ejercicio', 'patron', 'video_url', 'como_1', 'como_2', 'como_3', 'error_comun', 'musculos', 'por_que', 'regresion', 'progresion'],
  Sesiones:   ['id_sesion', 'fecha', 'email', 'sesion', 'duracion_min', 'series', 'reducida', 'rpe_sesion', 'sueno', 'estres', 'energia', 'guardada'],
  Registro:   ['id_sesion', 'fecha', 'email', 'sesion', 'ejercicio', 'serie', 'carga_kg', 'reps', 'rir', 'rpe']
};

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

function buscarAlumno(email) {
  const a = filas('Alumnos').find(r => norm(r.email) === email);
  if (!a) throw falla('no_alumno', email);
  const estado = norm(a.estado || 'activo');
  if (estado !== 'activo') throw falla('inactivo', estado);
  return a;
}

/* ───────── Lectura ───────── */
function datosDe(a) {
  const email = norm(a.email);

  const catalogo = filas('Ejercicios').filter(r => r.ejercicio).map(r => ({
    n: txt(r.ejercicio), pat: txt(r.patron), video: txt(r.video_url),
    como: [r.como_1, r.como_2, r.como_3].map(txt).filter(Boolean),
    err: txt(r.error_comun), mus: txt(r.musculos).split(',').map(x => x.trim()).filter(Boolean),
    por: txt(r.por_que), reg: txt(r.regresion), prog: txt(r.progresion)
  }));
  const cat = {};
  catalogo.forEach(c => { cat[norm(c.n)] = c; });

  const sesiones = {};
  filas('Planes').filter(r => norm(r.email) === email && r.ejercicio).forEach(r => {
    const k = txt(r.sesion || 'A').toUpperCase();
    const s = sesiones[k] = sesiones[k] || { sesion: k, nombre: '', ejercicios: [] };
    if (!s.nombre && r.sesion_nombre) s.nombre = txt(r.sesion_nombre);
    const c = cat[norm(r.ejercicio)] || {};
    const rmin = num(r.reps_min), rmax = num(r.reps_max);
    s.ejercicios.push({
      orden: num(r.orden) || s.ejercicios.length + 1,
      n: txt(r.ejercicio), pat: c.pat || '',
      s: num(r.series) || 3, r: [rmin || rmax || 10, rmax || rmin || 10],
      seg: /^seg/i.test(txt(r.unidad)), d: num(r.descanso_seg) || 90, kg: num(r.carga_kg) || 0,
      por: txt(r.por_que) || c.por || '', notas: txt(r.notas),
      video: c.video || '', como: c.como || [], err: c.err || '', mus: c.mus || [], reg: c.reg || '', prog: c.prog || ''
    });
  });
  const plan = Object.keys(sesiones).sort().map(k => {
    sesiones[k].ejercicios.sort((x, y) => x.orden - y.orden);
    return sesiones[k];
  });

  const ses = filas('Sesiones').filter(r => norm(r.email) === email).map(r => ({
    id: txt(r.id_sesion), fecha: fecha(r.fecha), sesion: txt(r.sesion), dur: num(r.duracion_min), series: num(r.series), rpe: num(r.rpe_sesion)
  }));
  const historial = filas('Registro').filter(r => norm(r.email) === email).map(r => ({
    id: txt(r.id_sesion), fecha: fecha(r.fecha), sesion: txt(r.sesion), ej: txt(r.ejercicio),
    serie: num(r.serie), kg: num(r.carga_kg), reps: num(r.reps), rir: num(r.rir), rpe: num(r.rpe)
  }));

  return {
    alumno: {
      email: email, nombre: txt(a.nombre), dias: txt(a.dias), esfuerzo: norm(a.registro_esfuerzo),
      vencimiento: fecha(a.fecha_vencimiento), monto: num(a.monto)
    },
    plan: plan, catalogo: catalogo, sesiones: ses, historial: historial
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
    const filasReg = series.map(x => [celda(s.id), f, email, celda(s.sesion), celda(x.ej), num(x.serie), num(x.kg), num(x.reps), vacio(num(x.rir)), vacio(num(x.rpe))]);
    if (filasReg.length) {
      const hr = hoja('Registro');
      hr.getRange(hr.getLastRow() + 1, 1, filasReg.length, filasReg[0].length).setValues(filasReg);
    }
    return { guardadas: filasReg.length };
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
function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function txt(v) { return String(v == null ? '' : v).trim(); }
function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
function vacio(v) { return v == null ? '' : v; }
// Texto que viene de la app: que nunca se interprete como fórmula en la planilla.
function celda(v) { const s = txt(v).slice(0, 200); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function fecha(v) {
  if (v instanceof Date) return Utilities.formatDate(v, libro().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return txt(v);
}

/* ───────── Puesta en marcha ───────── */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Profe Virtual').addItem('Configurar / reparar hojas', 'configurar').addToUi();
}

// Crea las hojas que falten (y columnas nuevas al final), sin borrar nada. Se puede correr más de una vez.
function configurar() {
  const lib = SpreadsheetApp.getActive();
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

  // Ejemplo para probar: vos como primer alumno, con un plan y un catálogo de muestra.
  const yo = Session.getEffectiveUser().getEmail();
  const alumnos = lib.getSheetByName('Alumnos');
  if (alumnos.getLastRow() === 1 && yo) {
    alumnos.appendRow([yo, 'Luca', 'activo', 'L,X,V', '', new Date(), '', '', '', 'Cuenta de prueba']);
  }
  const planes = lib.getSheetByName('Planes');
  if (planes.getLastRow() === 1 && yo) {
    const p = [
      ['A', 'Sentadilla y tracción', 1, 'Sentadilla goblet', 4, 6, 8, 'reps', 150, 20, '', ''],
      ['A', '', 2, 'Remo con mancuerna', 3, 8, 10, 'reps', 120, 22.5, '', ''],
      ['A', '', 3, 'Face pull', 3, 10, 12, 'reps', 90, 15, '', ''],
      ['B', 'Empuje y bisagra', 1, 'Peso muerto rumano', 3, 6, 8, 'reps', 150, 60, '', ''],
      ['B', '', 2, 'Press inclinado con mancuernas', 3, 8, 10, 'reps', 120, 22, '', ''],
      ['B', '', 3, 'Plancha', 3, 30, 30, 'seg', 60, 0, '', 'Respirá normal durante toda la serie.'],
      ['C', 'Unilateral y core', 1, 'Hip thrust', 3, 8, 10, 'reps', 120, 50, '', ''],
      ['C', '', 2, 'Zancada búlgara', 3, 8, 8, 'reps', 120, 12, '', ''],
      ['C', '', 3, 'Dead bug', 3, 10, 10, 'reps', 60, 0, '', '']
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

  // La hoja vacía que trae toda planilla nueva ya no hace falta.
  lib.getSheets().forEach(h => {
    if (!HOJAS[h.getName()] && h.getLastRow() === 0 && lib.getSheets().length > 1) lib.deleteSheet(h);
  });
  Logger.log('Listo. Hojas: ' + Object.keys(HOJAS).join(', ') + '. Alumno de prueba: ' + yo);
}
