/**
 * Google Apps Script — sincronización App Fútbol Sala
 *
 * CONFIGURACIÓN:
 * 1. Abre tu libro en Google Sheets → Extensiones → Apps Script
 * 2. Pega este archivo completo (sustituye todo el contenido del editor)
 * 3. Ajusta SPREADSHEET_ID abajo (ID del libro) o deja que la app envíe spreadsheetId en cada POST
 * 4. Hojas usadas (se crean solas si no existen): Plantilla, Partidos, Entrenamientos, Evaluacion_DI
 * 5. Implementar → Nueva implementación → Aplicación web
 *    Ejecutar como: tu cuenta | Acceso: Cualquiera
 * 6. Copia la URL que termina en /exec y ponla en googleSheetsService.ts (GOOGLE_SCRIPT_URL)
 *
 * HOJA "Plantilla" (cabecera fila 1):
 * id | nombreCompleto | nominal | fechaNacimiento | numeroLicencia | dorsal | posicion | edad | foto | player_json
 *
 * HOJA "Partidos" (cabecera fila 1):
 * f | fecha | rival | goles_favor | goles_contra | Ubicion | Tipo_Competicion |
 * autor_gol1..20, quinteto_gol1..20, minuto_Gol1..20 |
 * luego jugador_1..20 + asist_1..20 O una columna por cada nombre de plantilla (AS/AV/NA)
 *
 * HOJA "Entrenamientos": Fecha | Jugador | Asistencia | FECHA ENTRENAMIENTO
 *
 * HOJA "Evaluacion_DI": row_id, jugador_id, jugador_nombre, eval_id, fecha_eval, fuente, score_eval,
 * bloque, subbloque, pregunta, respuesta, puntuacion, fecha_sync
 *
 * Sheet.getRange(fila, columna, numFilas, numColumnas): el 3er y 4o parámetro son CANTIDADES (tamaño del bloque),
 * no el índice de la última fila/columna. Ver Sheet#getRange(Integer,Integer,Integer,Integer) en la documentación de Apps Script.
 */

// ID por defecto del libro (la app puede sobrescribir con spreadsheetId en el JSON del POST)
const SPREADSHEET_ID = '1KpaCmUQH5JFjUJ7P26MVH4CRxSkpHpMvYRxZs1RddtQ';

/** Libro maestro con macros y estructura completa; se copia al crear Equipo + Temporada. */
const TEMPLATE_SPREADSHEET_ID = SPREADSHEET_ID;

const SHEET_PLANTILLA = 'Plantilla';
const SHEET_PARTIDOS = 'Partidos';
const SHEET_ENTRENAMIENTOS = 'Entrenamientos';
const SHEET_EVALUACION_DI = 'Evaluacion_DI';
const SHEET_EVALUACION_DI_IA_MATRIZ = 'Evaluacion_DI_IA_Matriz';
const SHEET_EVALUACION_DI_PERSONAL_MATRIZ = 'Evaluacion_DI_Personal_Matriz';
const SHEET_HISTORICO_EVALUACIONES = 'Historico_Evaluaciones';
const SHEET_VERSION_APP = 'Version_App';
const SHEET_HISTORIAL_CRONO = 'Historial_Cronometro';
const SHEET_PARTIDOS_ACTAS = 'Partidos_Actas';
const SHEET_CALENDARIO_EVENTOS = 'Calendario_Eventos';
const SHEET_REGISTRO_LIBROS = 'Registro_Libros';
const SHEET_USUARIOS_APP = 'Usuarios_App';
/** Correos con permiso de administrar solicitudes de acceso a la app. */
const APP_ADMIN_EMAILS = ['monteromiguel.fs@gmail.com'];
const DRIVE_ROOT_FOLDER_DEFAULT = 'FutsalLegaData';
const DRIVE_FOLDER_ACTAS = 'Actas Partidos';
const DRIVE_FOLDER_FOTOS = 'Fotos jugadores';
/** Sube este valor al desplegar; comprueba con GET a la URL /exec que coincida si el error persiste */
const SCRIPT_VERSION = '2026-07-26-access-role-v1';

function isSpreadsheetIdGas(id) {
  if (!id) return false;
  try {
    SpreadsheetApp.openById(String(id).trim());
    return true;
  } catch (e) {
    return false;
  }
}

function isDriveFolderIdGas(id) {
  if (!id) return false;
  try {
    DriveApp.getFolderById(String(id).trim());
    return true;
  } catch (e) {
    return false;
  }
}

/** Corrige registro con libro/carpeta intercambiados antes de guardar o devolver. */
function fixSwappedRegistroIds(payload) {
  var ssId = normalizeSpreadsheetIdGas(payload.spreadsheetId || '');
  var driveId =
    normalizeDriveFolderIdGas(payload.teamDriveFolderId || payload.driveRootFolderId || '');
  var parentId = normalizeDriveFolderIdGas(payload.parentDriveFolderId || '');
  var altSs = normalizeSpreadsheetIdGas(payload.teamDriveFolderId || payload.parentDriveFolderId || '');
  var swapped = false;

  if (ssId && !isSpreadsheetIdGas(ssId) && isDriveFolderIdGas(ssId)) {
    if (altSs && isSpreadsheetIdGas(altSs)) {
      driveId = ssId;
      ssId = altSs;
      swapped = true;
    }
  }
  if (ssId && driveId && ssId === driveId && altSs && isSpreadsheetIdGas(altSs)) {
    ssId = altSs;
    swapped = true;
  }
  return {
    spreadsheetId: ssId,
    teamDriveFolderId: driveId,
    parentDriveFolderId: parentId,
    swapped: swapped,
  };
}

function normalizeDriveFolderIdGas(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  if (/\/spreadsheets\//i.test(raw)) return '';
  var m = raw.match(/\/folders\/([a-zA-Z0-9-_]+)/i);
  if (m && m[1]) return m[1];
  if (/^https?:\/\//i.test(raw)) return '';
  if (/^[a-zA-Z0-9-_]{10,}$/.test(raw)) return raw;
  return '';
}

function normalizeSpreadsheetIdGas(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  var m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (m && m[1]) return m[1];
  return raw;
}

/**
 * Opcional: ID del proyecto Apps Script vinculado a la plantilla.
 * Lo ves en el editor: script.google.com/.../projects/ESTE_ID/edit
 * Si está vacío, se intenta detectar por API (requiere scope script.projects).
 */
const TEMPLATE_BOUND_SCRIPT_PROJECT_ID =
  '1ccLcjSB5xnGKe_FALPy6lxSEiYibYe246N-8LjlOsouCdYovgJqmXjrX';

/** Primera columna de asistencias / nombres de jugador (índice 0): tras 7 base + 20×3 goles = 67 */
const COL_START_ASIST_PARTIDOS = 7 + 20 * 3;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Toda celda escrita con setValues debe ser escalar (string/number/boolean/date).
 * Objetos o arrays (p. ej. player_json o respuestas anidadas) provocan fallos de dimensiones en cualquier hoja.
 */
function sheetScalarValue(v) {
  if (v == null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v)) {
      var parts = [];
      for (var ai = 0; ai < v.length; ai++) {
        parts.push(sheetScalarValue(v[ai]));
      }
      return parts.join(', ');
    }
    try {
      return JSON.stringify(v);
    } catch (je) {
      return String(v);
    }
  }
  return String(v);
}

function evalDiFlatCell(v) {
  return sheetScalarValue(v);
}

/** Filas enviadas en `data`: suele ser []; si la app manda un solo objeto o `{ rows: [] }`, lo normalizamos. */
function coerceTableExportRows(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.data)) return raw.data;
    if (typeof raw.length === 'number') {
      var acc = [];
      for (var li = 0; li < raw.length; li++) {
        if (raw[li] != null) acc.push(raw[li]);
      }
      if (acc.length) return acc;
    }
    if (
      raw.id != null ||
      raw.nominal != null ||
      raw.nombreCompleto != null ||
      raw.row_id != null ||
      raw.fecha != null ||
      raw.Fecha != null ||
      raw.rival != null
    ) {
      return [raw];
    }
  }
  return [];
}

/** playerAsist u otro array-like (objeto con índices "0","1",…) → array de `len` escalares. */
function coerceStringArrayLike(raw, len) {
  var out = [];
  var i;
  for (i = 0; i < len; i++) {
    var v = null;
    if (raw == null) {
      v = '';
    } else if (Array.isArray(raw)) {
      v = raw[i];
    } else if (typeof raw === 'object') {
      v = raw[i] !== undefined && raw[i] !== null ? raw[i] : raw[String(i)];
    }
    out.push(sheetScalarValue(v));
  }
  return out;
}

function coerceMatrixPayload(m) {
  if (m == null) return [];
  if (Array.isArray(m)) return m;
  if (typeof m === 'object' && Array.isArray(m.rows)) return m.rows;
  if (typeof m === 'object' && Array.isArray(m.matrix)) return m.matrix;
  return [];
}

function coerceEvaluacionesDIInput(data) {
  return coerceTableExportRows(data).filter(function (x) {
    return x != null && typeof x === 'object';
  });
}

function evalDiBuildRowWithId(rowIdTrimmed, r, nowIso) {
  return [
    rowIdTrimmed,
    evalDiFlatCell(r.jugador_id),
    evalDiFlatCell(r.jugador_nombre),
    evalDiFlatCell(r.eval_id),
    evalDiFlatCell(r.fecha_eval),
    evalDiFlatCell(r.fuente),
    evalDiFlatCell(r.score_eval),
    evalDiFlatCell(r.bloque),
    evalDiFlatCell(r.subbloque),
    evalDiFlatCell(r.pregunta),
    evalDiFlatCell(r.respuesta),
    evalDiFlatCell(r.puntuacion),
    evalDiFlatCell(nowIso),
  ];
}

/** Iguala ancho de filas y aplana celdas objeto antes de setValues en hojas tipo matriz (IA / personal / histórico). */
function normalizeMatrixRectangular(safe) {
  if (!safe.length || !Array.isArray(safe[0])) return safe;
  var w = safe[0].length;
  var out = [];
  for (var ri = 0; ri < safe.length; ri++) {
    var row = Array.isArray(safe[ri]) ? safe[ri].slice() : [];
    while (row.length < w) row.push('');
    if (row.length > w) row = row.slice(0, w);
    for (var ci = 0; ci < w; ci++) {
      var cell = row[ci];
      row[ci] = cell != null && typeof cell === 'object' ? sheetScalarValue(cell) : cell == null ? '' : String(cell);
    }
    out.push(row);
  }
  return out;
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = String(params.action || '').trim();
    if (action === 'ensureDriveWorkspace') {
      var spreadsheetId = normalizeSpreadsheetIdGas(params.spreadsheetId || '');
      var rootFolderId = params.rootFolderId || '';
      var response = handleEnsureDriveWorkspace(rootFolderId, spreadsheetId);
      response.handledAction = 'ensureDriveWorkspace';
      response.scriptVersion = SCRIPT_VERSION;
      return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(
        ContentService.MimeType.JSON
      );
    }
    if (action === 'testScriptApi') {
      var testResult = testScriptApiAuthorization();
      testResult.handledAction = 'testScriptApi';
      testResult.scriptVersion = SCRIPT_VERSION;
      return ContentService.createTextOutput(JSON.stringify(testResult)).setMimeType(
        ContentService.MimeType.JSON
      );
    }
    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message: 'Google Apps Script activo',
        scriptVersion: SCRIPT_VERSION,
        timestamp: new Date().toISOString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        message: 'Error en doGet: ' + error.toString(),
        scriptVersion: SCRIPT_VERSION,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: 'POST sin cuerpo JSON. Comprueba la URL /exec de la implementacion web.',
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var spreadsheetId = requestData.spreadsheetId || null;

    var response;
    switch (action) {
      case 'exportPlantilla':
        response = handleExportPlantilla(requestData.data, spreadsheetId);
        break;
      case 'importPlantilla':
        response = handleImportPlantilla(spreadsheetId);
        break;
      case 'exportPartidos':
        response = handleExportPartidos(requestData, spreadsheetId);
        break;
      case 'importPartidos':
        response = handleImportPartidos(spreadsheetId);
        break;
      case 'exportEntrenamientos':
        response = handleExportEntrenamientos(requestData, spreadsheetId);
        break;
      case 'importEntrenamientos':
        response = handleImportEntrenamientos(spreadsheetId);
        break;
      case 'generateMatchReport':
        response = handleGenerateMatchReport(requestData.partidoId, spreadsheetId);
        break;
      case 'exportReportToDrive':
        response = handleExportReportToDrive(requestData.partidoId, spreadsheetId);
        break;
      case 'uploadPhotoToDrive':
        response = handleUploadPhotoToDrive(
          requestData.folderId,
          requestData.fileName,
          requestData.base64Data,
          requestData.rootFolderId,
          requestData.folderName
        );
        break;
      case 'uploadActaToDrive':
        response = handleUploadActaToDrive(
          requestData.folderId,
          requestData.folderName,
          requestData.fileName,
          requestData.base64Data,
          requestData.mimeType,
          requestData.rootFolderId
        );
        break;
      case 'listActasDrive':
        response = handleListActasDrive(requestData.folderId, requestData.folderName, requestData.rootFolderId);
        break;
      case 'ensureDriveWorkspace':
        response = handleEnsureDriveWorkspace(requestData.rootFolderId, spreadsheetId);
        break;
      case 'createTeamSpreadsheetFromTemplate':
        response = handleCreateTeamSpreadsheetFromTemplate(requestData);
        break;
      case 'registerTeamBook':
        response = handleRegisterTeamBook(requestData);
        break;
      case 'listRegistroLibros':
        response = handleListRegistroLibros();
        break;
      case 'syncAllBooksFromRegistry':
        response = handleSyncAllBooksFromRegistry(requestData);
        break;
      case 'registerAppUser':
        response = handleRegisterAppUser(requestData);
        break;
      case 'checkAppUserAuthorization':
        response = handleCheckAppUserAuthorization(requestData);
        break;
      case 'setAppUserAuthorization':
        response = handleSetAppUserAuthorization(requestData);
        break;
      case 'listAppUsers':
        response = handleListAppUsers(requestData);
        break;
      case 'exportEvaluacionesDI':
        response = handleExportEvaluacionesDI(requestData.data, spreadsheetId);
        break;
      case 'exportEvaluacionesDIViews':
        response = handleExportEvaluacionesDIViews(requestData, spreadsheetId);
        break;
      case 'importEvaluacionesDI':
        response = handleImportEvaluacionesDI(spreadsheetId);
        break;
      case 'getAppVersion':
        response = handleGetAppVersion(requestData, spreadsheetId);
        break;
      case 'publishAppVersion':
        response = handlePublishAppVersion(requestData, spreadsheetId);
        break;
      case 'exportHistorialCronometro':
        response = handleExportHistorialCronometro(requestData, spreadsheetId);
        break;
      case 'importHistorialCronometro':
        response = handleImportHistorialCronometro(requestData, spreadsheetId);
        break;
      case 'exportCalendarioEventos':
        response = handleExportCalendarioEventos(requestData, spreadsheetId);
        break;
      case 'importCalendarioEventos':
        response = handleImportCalendarioEventos(requestData, spreadsheetId);
        break;
      case 'listPhotosDrive':
        response = handleListPhotosDrive(requestData.folderId, requestData.folderName, requestData.rootFolderId);
        break;
      case 'getDriveFileBase64':
        response = handleGetDriveFileBase64(requestData.fileId, requestData.maxBytes);
        break;
      case 'exportPartidosActas':
        response = handleExportPartidosActas(requestData, spreadsheetId);
        break;
      case 'importPartidosActas':
        response = handleImportPartidosActas(spreadsheetId);
        break;
      default:
        response = { success: false, message: 'Accion no reconocida' };
    }

    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        message: 'Error en el servidor: ' + error.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSpreadsheet(optionalId) {
  var id = optionalId || SPREADSHEET_ID;
  if (!id || id === 'TU_SPREADSHEET_ID_AQUI') {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Hoja Version_App (fila 1 cabecera, fila 2 datos activos):
 * version | versionCode | apkUrl | changelog | bound_script_project_id
 */
function ensureVersionAppSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_VERSION_APP);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_VERSION_APP);
    sheet
      .getRange(1, 1, 1, 5)
      .setValues([['version', 'versionCode', 'apkUrl', 'changelog', 'bound_script_project_id']]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < 5) {
    sheet.getRange(1, 5).setValue('bound_script_project_id');
  }
  return sheet;
}

/** Al abrir un libro copiado, guarda su scriptId en Version_App para propagación posterior. */
function onOpen() {
  try {
    recordMyBoundScriptIdInVersionApp();
  } catch (e) {
    // no bloquear apertura del libro
  }
}

function recordMyBoundScriptIdInVersionApp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  var sheet = ensureVersionAppSheet(ss);
  var scriptId = String(ScriptApp.getScriptId() || '').trim();
  if (!scriptId) return;
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, 5).setValues([['', '', '', '', scriptId]]);
  } else {
    sheet.getRange(2, 5).setValue(scriptId);
  }
}

function handleGetAppVersion(requestData, spreadsheetId) {
  try {
    var reqSheet = requestData && requestData.spreadsheetId ? requestData.spreadsheetId : null;
    var ss = getSpreadsheet(spreadsheetId || reqSheet || SPREADSHEET_ID);
    var sheet = ensureVersionAppSheet(ss);
    if (sheet.getLastRow() < 2) {
      return {
        success: true,
        version: '',
        versionCode: 0,
        apkUrl: '',
        changelog: '',
        message: 'Sin version publicada en Version_App',
      };
    }
    var row = sheet.getRange(2, 1, 1, 4).getValues()[0];
    return {
      success: true,
      version: String(row[0] || '').trim(),
      versionCode: Number(row[1] || 0) || 0,
      apkUrl: String(row[2] || '').trim(),
      changelog: String(row[3] || '').trim(),
    };
  } catch (error) {
    return { success: false, message: 'Error leyendo Version_App: ' + error.toString() };
  }
}

/**
 * Escribe la fila 2 de Version_App (publicar aviso OTA/APK para dispositivos).
 * Body: version, versionCode, apkUrl (opcional), changelog (opcional)
 */
function handlePublishAppVersion(requestData, spreadsheetId) {
  try {
    var version = String((requestData && requestData.version) || '').trim();
    var versionCode = Number((requestData && requestData.versionCode) || 0) || 0;
    if (!version && versionCode <= 0) {
      return { success: false, message: 'Faltan version o versionCode' };
    }
    var apkUrl = String((requestData && requestData.apkUrl) || '').trim();
    var changelog = String((requestData && requestData.changelog) || '').trim();
    if (!changelog) {
      changelog = version ? 'Versión ' + version + (versionCode > 0 ? ' (vc' + versionCode + ')' : '') : '';
    }

    var reqSheet = requestData && requestData.spreadsheetId ? requestData.spreadsheetId : null;
    var ss = getSpreadsheet(spreadsheetId || reqSheet || SPREADSHEET_ID);
    var sheet = ensureVersionAppSheet(ss);
    if (sheet.getLastRow() < 1) {
      sheet.getRange(1, 1, 1, 4).setValues([['version', 'versionCode', 'apkUrl', 'changelog']]);
      sheet.setFrozenRows(1);
    } else {
      var hdr = sheet.getRange(1, 1, 1, 4).getValues()[0];
      if (!String(hdr[0] || '').trim()) {
        sheet.getRange(1, 1, 1, 4).setValues([['version', 'versionCode', 'apkUrl', 'changelog']]);
        sheet.setFrozenRows(1);
      }
    }

    var prevApkUrl = '';
    if (sheet.getLastRow() >= 2) {
      var prev = sheet.getRange(2, 1, 1, 4).getValues()[0];
      prevApkUrl = String(prev[2] || '').trim();
    }
    if (!apkUrl && prevApkUrl) apkUrl = prevApkUrl;

    sheet.getRange(2, 1, 1, 4).setValues([[version, versionCode, apkUrl, changelog]]);

    return {
      success: true,
      version: version,
      versionCode: versionCode,
      apkUrl: apkUrl,
      changelog: changelog,
      message: 'Version_App actualizada (fila 2)',
    };
  } catch (error) {
    return { success: false, message: 'Error publicando Version_App: ' + error.toString() };
  }
}

function getOrCreateSheet(sheetName, optionalSpreadsheetId) {
  var ss = getSpreadsheet(optionalSpreadsheetId);
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === SHEET_PLANTILLA) {
      sheet.getRange(1, 1, 1, 10).setValues([
        [
          'id',
          'nombreCompleto',
          'nominal',
          'fechaNacimiento',
          'numeroLicencia',
          'dorsal',
          'posicion',
          'edad',
          'foto',
          'player_json',
        ],
      ]);
      sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    } else if (sheetName === SHEET_PARTIDOS) {
      var headers = ['f', 'fecha', 'rival', 'goles_favor', 'goles_contra', 'Ubicion', 'Tipo_Competicion'];
      for (var gi = 1; gi <= 20; gi++) {
        headers.push('autor_gol' + gi);
        headers.push('quinteto_gol' + gi);
        headers.push('minuto_Gol' + gi);
      }
      for (var ji = 1; ji <= 20; ji++) {
        headers.push('jugador_' + ji);
        headers.push('asist_' + ji);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    } else if (sheetName === SHEET_ENTRENAMIENTOS) {
      sheet.getRange(1, 1, 1, 4).setValues([['Fecha', 'Jugador', 'Asistencia', 'FECHA ENTRENAMIENTO']]);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    } else if (sheetName === SHEET_EVALUACION_DI) {
      sheet.getRange(1, 1, 1, 13).setValues([
        [
          'row_id',
          'jugador_id',
          'jugador_nombre',
          'eval_id',
          'fecha_eval',
          'fuente',
          'score_eval',
          'bloque',
          'subbloque',
          'pregunta',
          'respuesta',
          'puntuacion',
          'fecha_sync',
        ],
      ]);
      sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
    } else if (sheetName === SHEET_EVALUACION_DI_IA_MATRIZ || sheetName === SHEET_EVALUACION_DI_PERSONAL_MATRIZ) {
      sheet.getRange(1, 1, 1, 2).setValues([['Pregunta', 'Resultado valoracion']]);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    } else if (sheetName === SHEET_HISTORICO_EVALUACIONES) {
      sheet.getRange(1, 1, 1, 1).setValues([['Fecha evaluacion']]);
      sheet.getRange(1, 1, 1, 1).setFontWeight('bold');
    } else if (sheetName === SHEET_HISTORIAL_CRONO) {
      sheet.getRange(1, 1, 1, 3).setValues([['equipo', 'temporada', 'historial_json']]);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheetName === SHEET_CALENDARIO_EVENTOS) {
      sheet.getRange(1, 1, 1, 3).setValues([['equipo', 'temporada', 'eventos_json']]);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  } else if (sheetName === SHEET_PARTIDOS && sheet.getLastRow() < 1) {
    var h2 = ['f', 'fecha', 'rival', 'goles_favor', 'goles_contra', 'Ubicion', 'Tipo_Competicion'];
    for (var g2 = 1; g2 <= 20; g2++) {
      h2.push('autor_gol' + g2);
      h2.push('quinteto_gol' + g2);
      h2.push('minuto_Gol' + g2);
    }
    for (var j2 = 1; j2 <= 20; j2++) {
      h2.push('jugador_' + j2);
      h2.push('asist_' + j2);
    }
    sheet.getRange(1, 1, 1, h2.length).setValues([h2]);
    sheet.getRange(1, 1, 1, h2.length).setFontWeight('bold');
  }

  return sheet;
}

function handleExportEvaluacionesDI(data, spreadsheetId) {
  try {
    var sheet = getOrCreateSheet(SHEET_EVALUACION_DI, spreadsheetId);
    var input = coerceEvaluacionesDIInput(data);
    if (input.length === 0) return { success: true, message: 'Sin evaluaciones para exportar', inserted: 0, updated: 0 };

    var lastRow = sheet.getLastRow();
    var numCols = 13;
    /** row_id -> fila 1-based en la hoja (solo filas ya existentes) */
    var rowIndexById = {};
    if (lastRow > 1) {
      /** getRange(fila, col, numFilas, numCols): numFilas = filas con datos desde la 2 hasta getLastRow() → lastRow - 1 */
      var idRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var ir = 0; ir < idRange.length; ir++) {
        var id0 = String(idRange[ir][0] || '').trim();
        if (id0) rowIndexById[id0] = 2 + ir;
      }
    }

    var nowIso = new Date().toISOString();
    var toAppend = [];
    var appended = 0;
    var updated = 0;

    for (var j = 0; j < input.length; j++) {
      var r = input[j] || {};
      var rowId = String(r.row_id || '').trim();
      if (!rowId) continue;

      var rowVals = evalDiBuildRowWithId(rowId, r, nowIso);

      var existingRow = rowIndexById[rowId];
      if (existingRow >= 2) {
        sheet.getRange(existingRow, 1, 1, numCols).setValues([rowVals]);
        updated++;
      } else if (existingRow === -1) {
        continue;
      } else {
        toAppend.push(rowVals);
        rowIndexById[rowId] = -1;
      }
    }

    if (toAppend.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      var batch = toAppend.map(function (row) {
        var line = [];
        for (var c = 0; c < numCols; c++) {
          line.push(c < row.length ? evalDiFlatCell(row[c]) : '');
        }
        return line;
      });
      sheet.getRange(startRow, 1, batch.length, numCols).setValues(batch);
      appended = toAppend.length;
    }

    return {
      success: true,
      message: 'Evaluaciones exportadas',
      inserted: appended + updated,
      appended: appended,
      updated: updated,
    };
  } catch (error) {
    return { success: false, message: 'Error al exportar Evaluacion_DI: ' + error.toString() };
  }
}

function handleImportEvaluacionesDI(spreadsheetId) {
  try {
    var sheet = getOrCreateSheet(SHEET_EVALUACION_DI, spreadsheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return { success: true, data: [], message: 'Sin datos en Evaluacion_DI' };
    var rows = values.slice(1).map(function (row) {
      return {
        row_id: row[0] || '',
        jugador_id: row[1] || '',
        jugador_nombre: row[2] || '',
        eval_id: row[3] || '',
        fecha_eval: row[4] || '',
        fuente: row[5] || '',
        score_eval: row[6] || '',
        bloque: row[7] || '',
        subbloque: row[8] || '',
        pregunta: row[9] || '',
        respuesta: row[10] || '',
        puntuacion: row[11] || '',
        fecha_sync: row[12] || '',
      };
    });
    return { success: true, data: rows, message: 'Evaluaciones importadas' };
  } catch (error) {
    return { success: false, message: 'Error al importar Evaluacion_DI: ' + error.toString() };
  }
}

function writeMatrixSheet(sheetName, matrix, spreadsheetId) {
  var sheet = getOrCreateSheet(sheetName, spreadsheetId);
  var safe = Array.isArray(matrix) ? matrix : [];
  sheet.clearContents();
  if (!safe.length || !Array.isArray(safe[0]) || safe[0].length === 0) {
    sheet.getRange(1, 1, 1, 1).setValues([['Sin datos']]);
    sheet.getRange(1, 1, 1, 1).setFontWeight('bold');
    return { rows: 0, cols: 1 };
  }
  safe = normalizeMatrixRectangular(safe);
  sheet.getRange(1, 1, safe.length, safe[0].length).setValues(safe);
  sheet.getRange(1, 1, 1, safe[0].length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (safe[0].length > 1) sheet.setFrozenColumns(1);
  return { rows: Math.max(0, safe.length - 1), cols: safe[0].length };
}

function handleExportEvaluacionesDIViews(requestData, spreadsheetId) {
  try {
    var updateIA = requestData.updateIA !== false;
    var updatePersonal = requestData.updatePersonal !== false;
    var updateHistorico = requestData.updateHistorico !== false;
    var iaInfo = { rows: 0, cols: 0 };
    var personalInfo = { rows: 0, cols: 0 };

    /** No borrar una matriz con clearContents si no viene datos (p. ej. iaMatrix ausente en export solo personal). */
    var iaMx = coerceMatrixPayload(requestData.iaMatrix);
    var perMx = coerceMatrixPayload(requestData.personalMatrix);
    var hisMx = coerceMatrixPayload(requestData.historicoMatrix);
    if (updateIA && iaMx.length > 0) {
      iaInfo = writeMatrixSheet(SHEET_EVALUACION_DI_IA_MATRIZ, iaMx, spreadsheetId);
    }
    if (updatePersonal && perMx.length > 0) {
      personalInfo = writeMatrixSheet(SHEET_EVALUACION_DI_PERSONAL_MATRIZ, perMx, spreadsheetId);
    }
    if (updateHistorico && hisMx.length > 0) {
      writeMatrixSheet(SHEET_HISTORICO_EVALUACIONES, hisMx, spreadsheetId);
    }

    return {
      success: true,
      message: 'Vistas D.I. exportadas.',
      iaRows: iaInfo.rows,
      personalRows: personalInfo.rows,
      players: Math.max(0, iaInfo.cols - 2),
    };
  } catch (error) {
    return { success: false, message: 'Error al exportar vistas D.I.: ' + error.toString() };
  }
}

function handleExportPlantilla(data, spreadsheetId) {
  try {
    var sheet = getOrCreateSheet(SHEET_PLANTILLA, spreadsheetId);
    var list = coerceTableExportRows(data);
    var headers = [
      'id',
      'nombreCompleto',
      'nominal',
      'fechaNacimiento',
      'numeroLicencia',
      'dorsal',
      'posicion',
      'edad',
      'foto',
      'player_json',
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    var rows = list
      .filter(function (row) {
        return row != null && typeof row === 'object';
      })
      .map(function (row) {
        var line = [
          sheetScalarValue(row.id),
          sheetScalarValue(row.nombreCompleto),
          sheetScalarValue(row.nominal),
          sheetScalarValue(row.fechaNacimiento),
          sheetScalarValue(row.numeroLicencia),
          sheetScalarValue(row.dorsal),
          sheetScalarValue(row.posicion),
          sheetScalarValue(row.edad),
          sheetScalarValue(row.foto),
          sheetScalarValue(row.player_json),
        ];
        while (line.length < 10) line.push('');
        return line.slice(0, 10);
      });

    if (rows.length > 0) {
      // Última fila = fila 2 + (N - 1); no usar rows.length como índice de fila (rompe N=1 y desalinea N>1)
      sheet.getRange(2, 1, rows.length, 10).setValues(rows);
    }
    return { success: true, message: 'Plantilla exportada correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al exportar plantilla: ' + error.toString() };
  }
}

function handleExportPartidos(requestData, spreadsheetId) {
  try {
    var data = coerceTableExportRows(requestData.data).filter(function (r) {
      return r != null && typeof r === 'object';
    });
    var players = requestData.players || [];
    if (!Array.isArray(players)) {
      players = players && typeof players === 'object' ? [players] : [];
    }
    var appendOnly = requestData.appendOnly === true;
    var sheet = getOrCreateSheet(SHEET_PARTIDOS, spreadsheetId);

    if (!appendOnly) {
      var lr = sheet.getLastRow();
      if (lr >= 1) {
        sheet.getRange(1, 1, lr, sheet.getLastColumn()).clearContent();
      }
    }
    var headerBase = ['f', 'fecha', 'rival', 'goles_favor', 'goles_contra', 'Ubicion', 'Tipo_Competicion'];
    for (var i = 1; i <= 20; i++) {
      headerBase.push('autor_gol' + i);
      headerBase.push('quinteto_gol' + i);
      headerBase.push('minuto_Gol' + i);
    }
    if (players.length > 0) {
      for (var k = 0; k < players.length; k++) {
        var pk = players[k];
        var rawNom = pk && (pk.nominal != null ? pk.nominal : pk.name);
        var nom = String(rawNom != null ? rawNom : '')
          .trim();
        headerBase.push(nom || 'Jugador');
      }
    } else {
      for (var j = 1; j <= 20; j++) {
        headerBase.push('jugador_' + j);
        headerBase.push('asist_' + j);
      }
    }

    var numCols = headerBase.length;
    var rows = data.map(function (row) {
      var baseRow = [
        sheetScalarValue(row.f || row.id),
        sheetScalarValue(row.fecha),
        sheetScalarValue(row.rival),
        sheetScalarValue(row.goles_favor != null && row.goles_favor !== '' ? row.goles_favor : '0'),
        sheetScalarValue(row.goles_contra != null && row.goles_contra !== '' ? row.goles_contra : '0'),
        sheetScalarValue(row.Ubicion || 'LOCAL'),
        sheetScalarValue(row.Tipo_Competicion || 'LIGA'),
      ];
      for (var g = 1; g <= 20; g++) {
        baseRow.push(sheetScalarValue(row['autor_gol' + g]));
        baseRow.push(sheetScalarValue(row['quinteto_gol' + g]));
        baseRow.push(sheetScalarValue(row['minuto_Gol' + g]));
      }
      /** Debe coincidir exactamente con headerBase: con plantilla = 1 col AS/AV/NA por jugador; sin plantilla = jugador_1..20 + asist_1..20 */
      if (players.length > 0) {
        var paList = coerceStringArrayLike(row.playerAsist, players.length);
        for (var pc = 0; pc < players.length; pc++) {
          baseRow.push(paList[pc]);
        }
      } else {
        for (var jj = 1; jj <= 20; jj++) {
          baseRow.push(sheetScalarValue(row['jugador_' + jj]));
          baseRow.push(sheetScalarValue(row['asist_' + jj]));
        }
      }
      while (baseRow.length < numCols) {
        baseRow.push('');
      }
      if (baseRow.length > numCols) {
        baseRow = baseRow.slice(0, numCols);
      }
      return baseRow;
    });

    // Sustituye cabecera si reemplazo total, hoja vacía, o hay filas nuevas (append): evita cabecera antigua con distinto número de columnas que el bloque de datos.
    if (!appendOnly || sheet.getLastRow() < 1 || rows.length > 0) {
      sheet.getRange(1, 1, 1, headerBase.length).setValues([headerBase]);
      sheet.getRange(1, 1, 1, headerBase.length).setFontWeight('bold');
    }

    if (rows.length > 0) {
      var startRow = appendOnly ? sheet.getLastRow() + 1 : 2;
      var safeRows = rows.map(function (r) {
        var line = [];
        for (var ci = 0; ci < numCols; ci++) {
          var v = ci < r.length ? r[ci] : '';
          line.push(sheetScalarValue(v));
        }
        return line;
      });
      for (var ri = 0; ri < safeRows.length; ri++) {
        if (safeRows[ri].length !== numCols) {
          return {
            success: false,
            message:
              'Error interno partidos: fila ' +
              (ri + 1) +
              ' tiene ' +
              safeRows[ri].length +
              ' columnas, se esperaban ' +
              numCols +
              ' (script ' +
              SCRIPT_VERSION +
              ')',
          };
        }
      }
      sheet.getRange(startRow, 1, safeRows.length, numCols).setValues(safeRows);
    }
    return { success: true, message: appendOnly ? 'Partidos nuevos añadidos' : 'Partidos exportados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al exportar partidos: ' + error.toString() };
  }
}

function handleExportEntrenamientos(requestData, spreadsheetId) {
  try {
    var data = coerceTableExportRows(requestData.data).filter(function (r) {
      return r != null && typeof r === 'object';
    });
    var appendOnly = requestData.appendOnly === true;
    var sheet = getOrCreateSheet(SHEET_ENTRENAMIENTOS, spreadsheetId);

    if (!appendOnly) {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
    }
    var rows = data.map(function (row) {
      return [
        sheetScalarValue(row.Fecha),
        sheetScalarValue(row.Jugador),
        sheetScalarValue(row.Asistencia || 'AS'),
        sheetScalarValue(row['FECHA ENTRENAMIENTO'] || row.Fecha),
      ];
    });
    if (rows.length > 0) {
      var sr = appendOnly ? sheet.getLastRow() + 1 : 2;
      sheet.getRange(sr, 1, rows.length, 4).setValues(rows);
    }
    return { success: true, message: appendOnly ? 'Entrenamientos nuevos añadidos' : 'Entrenamientos exportados' };
  } catch (error) {
    return { success: false, message: 'Error al exportar entrenamientos: ' + error.toString() };
  }
}

function handleImportPlantilla(spreadsheetId) {
  try {
    var sheet = getOrCreateSheet(SHEET_PLANTILLA, spreadsheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, data: [], message: 'No hay datos para importar' };
    }
    var rows = values.slice(1).map(function (row) {
      return {
        id: row[0] || '',
        nombreCompleto: row[1] || '',
        nominal: row[2] || '',
        fechaNacimiento: row[3] || '',
        numeroLicencia: row[4] || '',
        dorsal: row[5] || '',
        posicion: row[6] || '',
        edad: row[7] || '',
        foto: row[8] || '',
        player_json: row[9] || '',
      };
    });
    return { success: true, data: rows, message: 'Plantilla importada correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al importar plantilla: ' + error.toString() };
  }
}

function handleImportPartidos(spreadsheetId) {
  try {
    var sheet = getOrCreateSheet(SHEET_PARTIDOS, spreadsheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, data: [], message: 'No hay datos para importar' };
    }
    var headerRow = values[0];
    var colStartAsist = COL_START_ASIST_PARTIDOS;
    var h0 = headerRow[colStartAsist];
    var isHeaderPlayerNames =
      h0 &&
      String(h0).indexOf('jugador_') !== 0 &&
      String(h0).trim() !== '';

    var rows = values.slice(1).map(function (row) {
      var partido = {
        f: row[0] || '',
        id: row[0] || '',
        fecha: row[1] || '',
        rival: row[2] || '',
        goles_favor: String(row[3] || '0'),
        goles_contra: String(row[4] || '0'),
        Ubicion: (row[5] || 'LOCAL').toString().trim(),
        Tipo_Competicion: (row[6] || 'LIGA').toString().trim(),
      };
      var col = 7;
      for (var i = 1; i <= 20; i++) {
        partido['autor_gol' + i] = row[col++] || '';
        partido['quinteto_gol' + i] = row[col++] || '';
        partido['minuto_Gol' + i] = row[col++] || '';
      }
      if (isHeaderPlayerNames) {
        for (var jn = 1; jn <= 20; jn++) {
          var idx = colStartAsist + (jn - 1);
          var nombre = (headerRow[idx] || '').toString().trim();
          var asist = (row[idx] || 'AS').toString().trim().toUpperCase();
          partido['jugador_' + jn] = nombre;
          partido['asist_' + jn] = (asist === 'AV' || asist === 'NA') ? asist : 'AS';
        }
      } else {
        for (var jj = 1; jj <= 20; jj++) {
          partido['jugador_' + jj] = row[col++] || '';
          partido['asist_' + jj] = row[col++] || '';
        }
      }
      return partido;
    });
    return { success: true, data: rows, message: 'Partidos importados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al importar partidos: ' + error.toString() };
  }
}

function handleImportEntrenamientos(spreadsheetId) {
  try {
    var sheet = getOrCreateSheet(SHEET_ENTRENAMIENTOS, spreadsheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, data: [], message: 'No hay datos para importar' };
    }
    var rows = values.slice(1).map(function (row) {
      return {
        Fecha: row[0] || '',
        Jugador: row[1] || '',
        Asistencia: row[2] || 'AS',
        'FECHA ENTRENAMIENTO': row[3] || row[0] || '',
      };
    });
    return { success: true, data: rows, message: 'Entrenamientos importados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al importar entrenamientos: ' + error.toString() };
  }
}

/**
 * Informe alineado con la hoja Partidos actual (7 columnas base + 20×3 goles + asistencias desde col 67).
 */
function handleGenerateMatchReport(partidoId, spreadsheetId) {
  try {
    if (partidoId == null || String(partidoId).trim() === '') {
      return { success: false, message: 'Falta partidoId' };
    }
    var sheet = getOrCreateSheet(SHEET_PARTIDOS, spreadsheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) {
      return { success: false, message: 'No hay partidos en la hoja' };
    }
    var headerRow = values[0];
    var target = String(partidoId).trim();
    var partidoRow = null;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][0] || '').trim() === target) {
        partidoRow = values[r];
        break;
      }
    }
    if (!partidoRow) {
      return { success: false, message: 'Partido no encontrado (id en columna f)' };
    }

    var report = '<h1>INFORME DE PARTIDO</h1>';
    report += '<h2>Datos generales</h2><table border="1" cellpadding="5"><tr><th>Campo</th><th>Valor</th></tr>';
    report += '<tr><td>ID (f)</td><td>' + escapeHtml(partidoRow[0]) + '</td></tr>';
    report += '<tr><td>Fecha</td><td>' + escapeHtml(partidoRow[1]) + '</td></tr>';
    report += '<tr><td>Rival</td><td>' + escapeHtml(partidoRow[2]) + '</td></tr>';
    report += '<tr><td>Goles a favor</td><td>' + escapeHtml(partidoRow[3]) + '</td></tr>';
    report += '<tr><td>Goles en contra</td><td>' + escapeHtml(partidoRow[4]) + '</td></tr>';
    report += '<tr><td>Ubicación</td><td>' + escapeHtml(partidoRow[5]) + '</td></tr>';
    report += '<tr><td>Tipo competición</td><td>' + escapeHtml(partidoRow[6]) + '</td></tr></table>';

    report += '<h2>Goles (hasta 20)</h2><table border="1" cellpadding="5"><tr><th>#</th><th>Autor</th><th>Quinteto</th><th>Minuto</th></tr>';
    var golCount = 0;
    for (var g = 1; g <= 20; g++) {
      var base = 7 + (g - 1) * 3;
      var autor = partidoRow[base] || '';
      var quinteto = partidoRow[base + 1] || '';
      var minuto = partidoRow[base + 2] || '';
      if (String(autor).trim() !== '' || String(quinteto).trim() !== '' || String(minuto).trim() !== '') {
        golCount++;
        report +=
          '<tr><td>' +
          golCount +
          '</td><td>' +
          escapeHtml(autor) +
          '</td><td>' +
          escapeHtml(quinteto) +
          '</td><td>' +
          escapeHtml(minuto) +
          '</td></tr>';
      }
    }
    if (golCount === 0) {
      report += '<tr><td colspan="4">Sin goles registrados en columnas autor/quinteto/minuto</td></tr>';
    }
    report += '</table>';

    report += '<h2>Convocatoria / asistencia</h2><table border="1" cellpadding="5"><tr><th>Jugador</th><th>Estado</th></tr>';
    var colStart = COL_START_ASIST_PARTIDOS;
    var maxC = Math.max(headerRow.length, partidoRow.length);
    var asistRows = 0;
    var hAsist = headerRow[colStart];
    var isNames =
      hAsist &&
      String(hAsist).indexOf('jugador_') !== 0 &&
      String(hAsist).trim() !== '';

    if (isNames) {
      for (var c = colStart; c < maxC; c++) {
        var name = String(headerRow[c] || '').trim();
        if (!name) continue;
        var est = String(partidoRow[c] || 'AS').trim().toUpperCase();
        if (est !== 'AV' && est !== 'NA') est = 'AS';
        report += '<tr><td>' + escapeHtml(name) + '</td><td>' + escapeHtml(est) + '</td></tr>';
        asistRows++;
      }
    } else {
      for (var j = 1; j <= 20; j++) {
        var jc = colStart + (j - 1) * 2;
        var jnom = String(partidoRow[jc] || '').trim();
        var jest = String(partidoRow[jc + 1] || 'AS').trim().toUpperCase();
        if (!jnom) continue;
        if (jest !== 'AV' && jest !== 'NA') jest = 'AS';
        report += '<tr><td>' + escapeHtml(jnom) + '</td><td>' + escapeHtml(jest) + '</td></tr>';
        asistRows++;
      }
    }
    if (asistRows === 0) {
      report += '<tr><td colspan="2">Sin datos de convocatoria en esta fila</td></tr>';
    }
    report += '</table>';

    return { success: true, report: report, message: 'Informe generado correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al generar informe: ' + error.toString() };
  }
}

function handleExportReportToDrive(partidoId, spreadsheetId) {
  try {
    var reportResult = handleGenerateMatchReport(partidoId, spreadsheetId);
    if (!reportResult.success) {
      return reportResult;
    }
    var htmlContent =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Informe partido</title></head><body>' +
      reportResult.report +
      '</body></html>';
    var folder = DriveApp.getRootFolder();
    var safeId = String(partidoId).replace(/[^\w\-]/g, '_');
    var fileName = 'Informe_Partido_' + safeId + '_' + new Date().getTime() + '.html';
    var file = folder.createFile(fileName, htmlContent, 'text/html');
    return { success: true, url: file.getUrl(), message: 'Informe exportado a Drive' };
  } catch (error) {
    return { success: false, message: 'Error al exportar a Drive: ' + error.toString() };
  }
}

function isDriveFolderMime(mime) {
  return (
    mime === MimeType.FOLDER ||
    mime === 'application/vnd.google-apps.folder'
  );
}

/** Devuelve la carpeta solo si el ID es una carpeta de Drive (no un libro ni otro archivo). */
function resolveDriveFolderById(folderId) {
  var id = String(folderId || '').trim();
  if (!id) return null;
  try {
    var file = DriveApp.getFileById(id);
    var mime = String(file.getMimeType() || '');
    if (!isDriveFolderMime(mime)) return null;
    return DriveApp.getFolderById(id);
  } catch (e) {
    return null;
  }
}

function getOrCreateRootFolder(rootFolderId) {
  var folder = resolveDriveFolderById(rootFolderId);
  if (folder) return folder;
  var byName = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER_DEFAULT);
  if (byName.hasNext()) return byName.next();
  return DriveApp.createFolder(DRIVE_ROOT_FOLDER_DEFAULT);
}

function getOrCreateSubfolder(parentFolder, folderName) {
  var safeName = folderName || 'Carpeta';
  var folders = parentFolder.getFoldersByName(safeName);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(safeName);
}

function shareDriveFileForView(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
}

function drivePhotoImageUrl(file) {
  shareDriveFileForView(file);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
}

function handleUploadPhotoToDrive(folderId, fileName, base64Data, rootFolderId, folderName) {
  try {
    if (!fileName || !base64Data) {
      return { success: false, message: 'Faltan parámetros: fileName o base64Data' };
    }
    var folder = null;
    if (folderId) {
      try {
        folder = DriveApp.getFolderById(folderId);
      } catch (e) {
        folder = null;
      }
    }
    if (!folder) {
      var root = getOrCreateRootFolder(rootFolderId);
      folder = getOrCreateSubfolder(root, folderName || DRIVE_FOLDER_FOTOS);
    }
    var existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', fileName);
    var file = folder.createFile(blob);
    var imageUrl = drivePhotoImageUrl(file);
    return {
      success: true,
      url: file.getUrl(),
      imageUrl: imageUrl,
      fileId: file.getId(),
      folderId: folder.getId(),
      message: 'Foto subida correctamente',
    };
  } catch (error) {
    return { success: false, message: 'Error al subir foto: ' + error.toString() };
  }
}

function getOrCreateFolder(folderId, folderName, rootFolderId) {
  var safeName = folderName || DRIVE_FOLDER_ACTAS;
  if (folderId) {
    try {
      var byId = DriveApp.getFolderById(folderId);
      if (byId) return byId;
    } catch (e) {}
  }
  var root = getOrCreateRootFolder(rootFolderId);
  return getOrCreateSubfolder(root, safeName);
}

function handleUploadActaToDrive(folderId, folderName, fileName, base64Data, mimeType, rootFolderId) {
  try {
    if (!fileName || !base64Data) {
      return { success: false, message: 'Faltan fileName o base64Data' };
    }
    var folder = getOrCreateFolder(folderId, folderName || DRIVE_FOLDER_ACTAS, rootFolderId);
    var existingFiles = folder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    var mime = mimeType || 'image/jpeg';
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mime, fileName);
    var file = folder.createFile(blob);
    return {
      success: true,
      url: file.getUrl(),
      fileId: file.getId(),
      folderId: folder.getId(),
      message: 'Acta subida correctamente',
    };
  } catch (error) {
    return { success: false, message: 'Error al subir acta: ' + error.toString() };
  }
}

function handleListActasDrive(folderId, folderName, rootFolderId) {
  try {
    var folder = getOrCreateFolder(folderId, folderName || DRIVE_FOLDER_ACTAS, rootFolderId);
    var filesIt = folder.getFiles();
    var files = [];
    while (filesIt.hasNext()) {
      var f = filesIt.next();
      files.push({
        id: f.getId(),
        name: f.getName(),
        url: f.getUrl(),
        mimeType: f.getMimeType(),
        createdTime: f.getDateCreated() ? f.getDateCreated().toISOString() : '',
      });
    }
    files.sort(function (a, b) {
      return new Date(b.createdTime || 0).getTime() - new Date(a.createdTime || 0).getTime();
    });
    return {
      success: true,
      folderId: folder.getId(),
      files: files,
      message: 'Actas listadas correctamente',
    };
  } catch (error) {
    return { success: false, message: 'Error al listar actas: ' + error.toString(), files: [] };
  }
}

function handleListPhotosDrive(folderId, folderName, rootFolderId) {
  try {
    var folder = getOrCreateFolder(folderId, folderName || DRIVE_FOLDER_FOTOS, rootFolderId);
    var filesIt = folder.getFiles();
    var files = [];
    while (filesIt.hasNext()) {
      var f = filesIt.next();
      var mime = f.getMimeType() || '';
      files.push({
        id: f.getId(),
        name: f.getName(),
        url: f.getUrl(),
        imageUrl: mime.indexOf('image/') === 0 ? drivePhotoImageUrl(f) : '',
        mimeType: mime,
        createdTime: f.getDateCreated() ? f.getDateCreated().toISOString() : '',
      });
    }
    files.sort(function (a, b) {
      return new Date(b.createdTime || 0).getTime() - new Date(a.createdTime || 0).getTime();
    });
    return {
      success: true,
      folderId: folder.getId(),
      files: files,
      message: 'Fotos listadas correctamente',
    };
  } catch (error) {
    return { success: false, message: 'Error al listar fotos: ' + error.toString(), files: [] };
  }
}

function handleGetDriveFileBase64(fileId, maxBytes) {
  try {
    if (!fileId) {
      return { success: false, message: 'Falta fileId' };
    }
    var limit = Number(maxBytes || 0) || 8 * 1024 * 1024;
    var file = DriveApp.getFileById(String(fileId));
    var size = file.getSize();
    if (size > limit) {
      return {
        success: false,
        tooLarge: true,
        size: size,
        url: file.getUrl(),
        mimeType: file.getMimeType(),
        message: 'Archivo demasiado grande para descargar (' + size + ' bytes)',
      };
    }
    var blob = file.getBlob();
    return {
      success: true,
      base64: Utilities.base64Encode(blob.getBytes()),
      mimeType: blob.getContentType() || file.getMimeType() || 'application/octet-stream',
      name: file.getName(),
      url: file.getUrl(),
      message: 'Archivo descargado correctamente',
    };
  } catch (error) {
    return { success: false, message: 'Error al descargar archivo: ' + error.toString() };
  }
}

function handleImportPartidosActas(spreadsheetId) {
  try {
    var sheet = getOrCreateSheet(SHEET_PARTIDOS_ACTAS, spreadsheetId);
    if (sheet.getLastRow() < 2) {
      return { success: true, actas: [], message: 'Sin actas en Partidos_Actas' };
    }
    var data = sheet.getDataRange().getValues();
    var actas = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var partidoKey = String(row[0] || '').trim();
      if (!partidoKey) continue;
      var actaJson = {};
      try {
        actaJson = JSON.parse(String(row[4] || row[1] || '{}'));
      } catch (pe) {
        actaJson = {};
      }
      actas.push({
        partidoKey: partidoKey,
        fecha: String(row[1] || '').trim(),
        rival: String(row[2] || '').trim(),
        lugar: String(row[3] || '').trim(),
        acta: actaJson,
      });
    }
    return { success: true, actas: actas, message: 'Actas importadas (' + actas.length + ')' };
  } catch (error) {
    return { success: false, actas: [], message: 'Error al importar actas: ' + error.toString() };
  }
}

function handleExportPartidosActas(requestData, spreadsheetId) {
  try {
    var actas = requestData.actas || [];
    if (!Array.isArray(actas)) actas = [];
    var sheet = getOrCreateSheet(SHEET_PARTIDOS_ACTAS, spreadsheetId);
    sheet.getRange(1, 1, 1, 5).setValues([['partido_key', 'fecha', 'rival', 'lugar', 'acta_json']]);
    sheet.setFrozenRows(1);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    var rows = actas
      .filter(function (item) {
        return item && String(item.partidoKey || '').trim();
      })
      .map(function (item) {
        return [
          sheetScalarValue(item.partidoKey),
          sheetScalarValue(item.fecha),
          sheetScalarValue(item.rival),
          sheetScalarValue(item.lugar),
          sheetScalarValue(JSON.stringify(item.acta || {})),
        ];
      });
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    }
    return { success: true, message: 'Actas exportadas (' + rows.length + ')' };
  } catch (error) {
    return { success: false, message: 'Error al exportar actas: ' + error.toString() };
  }
}

function handleImportHistorialCronometro(requestData, spreadsheetId) {
  try {
    var equipo = String(requestData.equipo || '').trim();
    var temporada = String(requestData.temporada || '').trim();
    var sheet = getOrCreateSheet(SHEET_HISTORIAL_CRONO, spreadsheetId);
    if (sheet.getLastRow() < 2) {
      return { success: true, historial: [] };
    }
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === equipo && String(data[i][1] || '').trim() === temporada) {
        try {
          var parsed = JSON.parse(String(data[i][2] || '[]'));
          return { success: true, historial: Array.isArray(parsed) ? parsed : [] };
        } catch (pe) {
          return { success: true, historial: [] };
        }
      }
    }
    return { success: true, historial: [] };
  } catch (error) {
    return { success: false, message: 'Error al importar historial cronómetro: ' + error.toString(), historial: [] };
  }
}

function handleExportHistorialCronometro(requestData, spreadsheetId) {
  try {
    var equipo = String(requestData.equipo || '').trim();
    var temporada = String(requestData.temporada || '').trim();
    var historial = requestData.historial || [];
    if (!Array.isArray(historial)) historial = [];
    var sheet = getOrCreateSheet(SHEET_HISTORIAL_CRONO, spreadsheetId);
    if (sheet.getLastRow() < 1) {
      sheet.getRange(1, 1, 1, 3).setValues([['equipo', 'temporada', 'historial_json']]);
      sheet.setFrozenRows(1);
    }
    var json = JSON.stringify(historial);
    var data = sheet.getDataRange().getValues();
    var targetRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === equipo && String(data[i][1] || '').trim() === temporada) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow > 0) {
      sheet.getRange(targetRow, 3).setValue(json);
    } else {
      sheet.appendRow([equipo, temporada, json]);
    }
    return { success: true, message: 'Historial del cronómetro exportado (' + historial.length + ' sesiones)' };
  } catch (error) {
    return { success: false, message: 'Error al exportar historial cronómetro: ' + error.toString() };
  }
}

function handleImportCalendarioEventos(requestData, spreadsheetId) {
  try {
    var equipo = String(requestData.equipo || '').trim();
    var temporada = String(requestData.temporada || '').trim();
    var sheet = getOrCreateSheet(SHEET_CALENDARIO_EVENTOS, spreadsheetId);
    if (sheet.getLastRow() < 2) {
      return { success: true, eventos: [] };
    }
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === equipo && String(data[i][1] || '').trim() === temporada) {
        try {
          var parsed = JSON.parse(String(data[i][2] || '[]'));
          return { success: true, eventos: Array.isArray(parsed) ? parsed : [] };
        } catch (pe) {
          return { success: true, eventos: [] };
        }
      }
    }
    return { success: true, eventos: [] };
  } catch (error) {
    return { success: false, message: 'Error al importar calendario: ' + error.toString(), eventos: [] };
  }
}

function handleExportCalendarioEventos(requestData, spreadsheetId) {
  try {
    var equipo = String(requestData.equipo || '').trim();
    var temporada = String(requestData.temporada || '').trim();
    var eventos = requestData.eventos || [];
    if (!Array.isArray(eventos)) eventos = [];
    var sheet = getOrCreateSheet(SHEET_CALENDARIO_EVENTOS, spreadsheetId);
    if (sheet.getLastRow() < 1) {
      sheet.getRange(1, 1, 1, 3).setValues([['equipo', 'temporada', 'eventos_json']]);
      sheet.setFrozenRows(1);
    }
    var json = JSON.stringify(eventos);
    var data = sheet.getDataRange().getValues();
    var targetRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === equipo && String(data[i][1] || '').trim() === temporada) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow > 0) {
      sheet.getRange(targetRow, 3).setValue(json);
    } else {
      sheet.appendRow([equipo, temporada, json]);
    }
    return { success: true, message: 'Calendario exportado (' + eventos.length + ' eventos)' };
  } catch (error) {
    return { success: false, message: 'Error al exportar calendario: ' + error.toString() };
  }
}

/**
 * Borra filas de datos (desde la 2) dejando cabeceras, formato de hoja y macros intactos.
 */
function clearSheetDataFromRow2(sheet) {
  if (!sheet) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  var numRows = lastRow - 1;
  try {
    sheet.deleteRows(2, numRows);
  } catch (deleteErr) {
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    sheet.getRange(2, 1, numRows, lastCol).clearContent();
  }
  return numRows;
}

/**
 * Vacía todas las hojas del libro copiado: mantiene hojas, cabecera fila 1 y Apps Script;
 * elimina jugadores, partidos, evaluaciones, historial, etc.
 */
function clearTeamBookDataKeepHeaders(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheets = ss.getSheets();
  var rowsRemoved = 0;
  for (var i = 0; i < sheets.length; i++) {
    rowsRemoved += clearSheetDataFromRow2(sheets[i]);
  }
  SpreadsheetApp.flush();
  return { sheetsProcessed: sheets.length, rowsRemoved: rowsRemoved };
}

/**
 * Hoja maestra Registro_Libros (libro canónico SPREADSHEET_ID):
 * equipo | temporada | book_name | spreadsheet_id | spreadsheet_url | app_account_email |
 * parent_drive_folder_id | team_drive_folder_id | fotos_folder_id | actas_folder_id |
 * script_version | created_at | updated_at
 */
function ensureRegistroLibrosSheet(optionalSpreadsheetId) {
  var ss = getSpreadsheet(optionalSpreadsheetId || SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_REGISTRO_LIBROS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_REGISTRO_LIBROS);
    sheet
      .getRange(1, 1, 1, 13)
      .setValues([
        [
          'equipo',
          'temporada',
          'book_name',
          'spreadsheet_id',
          'spreadsheet_url',
          'app_account_email',
          'parent_drive_folder_id',
          'team_drive_folder_id',
          'fotos_folder_id',
          'actas_folder_id',
          'script_version',
          'created_at',
          'updated_at',
        ],
      ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function buildRegistroLibrosRow(meta, nowIso, prevCreatedAt) {
  return [
    sheetScalarValue(meta.equipo),
    sheetScalarValue(meta.temporada),
    sheetScalarValue(meta.bookName),
    sheetScalarValue(meta.spreadsheetId),
    sheetScalarValue(meta.spreadsheetUrl),
    sheetScalarValue(meta.appAccountEmail),
    sheetScalarValue(meta.parentDriveFolderId),
    sheetScalarValue(meta.teamDriveFolderId || meta.driveRootFolderId),
    sheetScalarValue(meta.fotosFolderId),
    sheetScalarValue(meta.actasFolderId),
    sheetScalarValue(meta.scriptVersion || SCRIPT_VERSION),
    sheetScalarValue(prevCreatedAt || nowIso),
    sheetScalarValue(nowIso),
  ];
}

/** Alta o actualización de un libro de equipo/temporada en Registro_Libros. */
function handleRegisterTeamBook(requestData) {
  try {
    var fixed = fixSwappedRegistroIds(requestData);
    var spreadsheetId = String(fixed.spreadsheetId || '').trim();
    var equipo = String(requestData.equipo || '').trim();
    var temporada = String(requestData.temporada || '').trim();
    if (!spreadsheetId) {
      return { success: false, message: 'Falta spreadsheetId para registrar el libro.' };
    }
    if (!isSpreadsheetIdGas(spreadsheetId)) {
      return {
        success: false,
        message:
          'spreadsheetId no abre un Google Sheet válido. Comprueba que no sea una carpeta de Drive.',
      };
    }
    if (!equipo || !temporada) {
      return { success: false, message: 'Faltan equipo y temporada para el registro.' };
    }
    var sheet = ensureRegistroLibrosSheet(SPREADSHEET_ID);
    var nowIso = new Date().toISOString();
    var bookName = String(requestData.bookName || '').trim() || equipo + ' ' + temporada;
    var rowVals = buildRegistroLibrosRow(
      {
        equipo: equipo,
        temporada: temporada,
        bookName: bookName,
        spreadsheetId: spreadsheetId,
        spreadsheetUrl: requestData.spreadsheetUrl,
        appAccountEmail: requestData.appAccountEmail,
        parentDriveFolderId: fixed.parentDriveFolderId || requestData.parentDriveFolderId,
        teamDriveFolderId: fixed.teamDriveFolderId || requestData.teamDriveFolderId || requestData.driveRootFolderId,
        fotosFolderId: requestData.fotosFolderId,
        actasFolderId: requestData.actasFolderId,
        scriptVersion: SCRIPT_VERSION,
      },
      nowIso,
      null
    );

    var lastRow = sheet.getLastRow();
    var targetRow = -1;
    var prevCreated = '';
    if (lastRow >= 2) {
      var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
      for (var i = 0; i < data.length; i++) {
        var rowId = String(data[i][3] || '').trim();
        var rowEq = String(data[i][0] || '').trim();
        var rowTemp = String(data[i][1] || '').trim();
        if (rowId === spreadsheetId || (rowEq === equipo && rowTemp === temporada)) {
          targetRow = 2 + i;
          prevCreated = String(data[i][11] || '').trim();
          break;
        }
      }
    }
    if (prevCreated) rowVals[11] = prevCreated;
    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, 13).setValues([rowVals]);
      return {
        success: true,
        message: 'Registro_Libros actualizado (fila ' + targetRow + ').',
        row: targetRow,
        spreadsheetId: spreadsheetId,
      };
    }
    sheet.appendRow(rowVals);
    return {
      success: true,
      message: 'Libro registrado en Registro_Libros.',
      row: sheet.getLastRow(),
      spreadsheetId: spreadsheetId,
    };
  } catch (error) {
    return { success: false, message: 'Error al registrar libro: ' + error.toString() };
  }
}

/** Lista todos los libros del registro (para mantenimiento / propagación de script). */
function handleListRegistroLibros() {
  try {
    var sheet = ensureRegistroLibrosSheet(SPREADSHEET_ID);
    if (sheet.getLastRow() < 2) {
      return { success: true, books: [], message: 'Registro_Libros vacío.' };
    }
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
    var books = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rawPayload = {
        spreadsheetId: String(row[3] || '').trim(),
        teamDriveFolderId: String(row[7] || '').trim(),
        parentDriveFolderId: String(row[6] || '').trim(),
      };
      var fixed = fixSwappedRegistroIds(rawPayload);
      var ssId = String(fixed.spreadsheetId || '').trim();
      if (!ssId) continue;
      books.push({
        equipo: String(row[0] || '').trim(),
        temporada: String(row[1] || '').trim(),
        bookName: String(row[2] || '').trim(),
        spreadsheetId: ssId,
        spreadsheetUrl: String(row[4] || '').trim(),
        appAccountEmail: String(row[5] || '').trim(),
        parentDriveFolderId: String(fixed.parentDriveFolderId || row[6] || '').trim(),
        teamDriveFolderId: String(fixed.teamDriveFolderId || row[7] || '').trim(),
        fotosFolderId: String(row[8] || '').trim(),
        actasFolderId: String(row[9] || '').trim(),
        scriptVersion: String(row[10] || '').trim(),
        createdAt: String(row[11] || '').trim(),
        updatedAt: String(row[12] || '').trim(),
      });
    }
    return {
      success: true,
      books: books,
      message: 'Registro_Libros: ' + books.length + ' libro(s).',
      scriptVersion: SCRIPT_VERSION,
    };
  } catch (error) {
    return { success: false, books: [], message: 'Error leyendo Registro_Libros: ' + error.toString() };
  }
}

/**
 * Hoja maestra Usuarios_App (libro canónico SPREADSHEET_ID):
 * email | uid | estado | nombre | solicitado_at | aprobado_at | notas | rol
 * estado: pendiente | aprobado | rechazado | bloqueado
 * rol: entrenador | lectura (default entrenador; admin siempre edita)
 */
function ensureUsuariosAppSheet(optionalSpreadsheetId) {
  var ss = getSpreadsheet(optionalSpreadsheetId || SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_USUARIOS_APP);
  var headers = ['email', 'uid', 'estado', 'nombre', 'solicitado_at', 'aprobado_at', 'notas', 'rol'];
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USUARIOS_APP);
    sheet.getRange(1, 1, 1, 8).setValues([headers]);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var hasRol = false;
    for (var h = 0; h < currentHeaders.length; h++) {
      if (String(currentHeaders[h] || '').trim().toLowerCase() === 'rol') {
        hasRol = true;
        break;
      }
    }
    if (!hasRol) {
      sheet.getRange(1, 8).setValue('rol');
      sheet.getRange(1, 8).setFontWeight('bold');
    }
  }
  return sheet;
}

function normalizeAppUserEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isAppAdminEmail(email) {
  var normalized = normalizeAppUserEmail(email);
  if (!normalized) return false;
  for (var i = 0; i < APP_ADMIN_EMAILS.length; i++) {
    if (normalizeAppUserEmail(APP_ADMIN_EMAILS[i]) === normalized) return true;
  }
  return false;
}

function normalizeAppUserEstado(estado) {
  var raw = String(estado || '')
    .trim()
    .toLowerCase();
  if (raw === 'aprobado' || raw === 'rechazado' || raw === 'bloqueado' || raw === 'pendiente') return raw;
  return 'pendiente';
}

/** Rol de acceso en la app: entrenador (edita) | lectura (solo ver). */
function normalizeAppUserRol(rol) {
  var raw = String(rol || '')
    .trim()
    .toLowerCase();
  if (raw === 'lectura' || raw === 'solo_lectura' || raw === 'solo lectura' || raw === 'read' || raw === 'viewer') {
    return 'lectura';
  }
  return 'entrenador';
}

function findUsuarioAppRowByEmail(sheet, email) {
  var normalized = normalizeAppUserEmail(email);
  if (!normalized) return { row: -1, data: null };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { row: -1, data: null };
  var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeAppUserEmail(values[i][0]) === normalized) {
      return { row: 2 + i, data: values[i] };
    }
  }
  return { row: -1, data: null };
}

function buildUsuarioAppRecord(rowData) {
  var email = String(rowData[0] || '').trim();
  return {
    email: email,
    uid: String(rowData[1] || '').trim(),
    estado: normalizeAppUserEstado(rowData[2]),
    nombre: String(rowData[3] || '').trim(),
    solicitadoAt: String(rowData[4] || '').trim(),
    aprobadoAt: String(rowData[5] || '').trim(),
    notas: String(rowData[6] || '').trim(),
    rol: isAppAdminEmail(email) ? 'entrenador' : normalizeAppUserRol(rowData[7]),
  };
}

/** Avisa por correo a los administradores de una nueva solicitud pendiente. */
function notifyAdminsNewAppUserRequest(user) {
  try {
    if (!user || normalizeAppUserEstado(user.estado) !== 'pendiente') return;
    if (isAppAdminEmail(user.email)) return;
    var recipients = [];
    for (var i = 0; i < APP_ADMIN_EMAILS.length; i++) {
      var mail = String(APP_ADMIN_EMAILS[i] || '').trim();
      if (mail) recipients.push(mail);
    }
    if (!recipients.length) return;

    var bookUrl = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit#gid=0';
    var sheet = ensureUsuariosAppSheet(SPREADSHEET_ID);
    try {
      bookUrl =
        'https://docs.google.com/spreadsheets/d/' +
        SPREADSHEET_ID +
        '/edit#gid=' +
        sheet.getSheetId();
    } catch (eUrl) {}

    var subject = '[Futsal Amas Lega] Nueva solicitud de acceso: ' + user.email;
    var body =
      'Un entrenador ha solicitado usar la app Futsal Amas Lega.\n\n' +
      'Correo: ' +
      user.email +
      '\n' +
      'UID Firebase: ' +
      (user.uid || '(sin uid)') +
      '\n' +
      'Estado: pendiente\n' +
      'Solicitado: ' +
      (user.solicitadoAt || new Date().toISOString()) +
      '\n\n' +
      'Para aprobar:\n' +
      '1) Abre la app → Mi cuenta → GESTIONAR USUARIOS (ADMIN), o\n' +
      '2) Edita la hoja Usuarios_App del libro maestro y pon estado = aprobado\n\n' +
      'Libro maestro: ' +
      bookUrl +
      '\n\n' +
      '— Apps Script Futsal Amas Lega';

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: subject,
      body: body,
    });
  } catch (mailErr) {
    console.warn('notifyAdminsNewAppUserRequest: ' + mailErr);
  }
}

function upsertUsuarioAppRow(sheet, requestData) {
  var email = normalizeAppUserEmail(requestData.email);
  var uid = String(requestData.uid || '').trim();
  var nombre = String(requestData.nombre || '').trim();
  if (!email) {
    return { success: false, message: 'Falta email para registrar usuario de app.' };
  }
  var nowIso = new Date().toISOString();
  var found = findUsuarioAppRowByEmail(sheet, email);
  var estado = 'pendiente';
  if (isAppAdminEmail(email)) estado = 'aprobado';
  else if (requestData.estado) estado = normalizeAppUserEstado(requestData.estado);

  var rol = 'entrenador';
  if (requestData.rol != null && requestData.rol !== '') {
    rol = normalizeAppUserRol(requestData.rol);
  }
  if (isAppAdminEmail(email)) rol = 'entrenador';

  if (found.row > 0) {
    var prev = found.data || [];
    var prevEstado = normalizeAppUserEstado(prev[2]);
    if (!requestData.estado) estado = prevEstado;
    if (isAppAdminEmail(email)) estado = 'aprobado';
    if (requestData.rol == null || requestData.rol === '') {
      rol = normalizeAppUserRol(prev[7]);
    }
    if (isAppAdminEmail(email)) rol = 'entrenador';
    var rowVals = [
      email,
      uid || String(prev[1] || '').trim(),
      estado,
      nombre || String(prev[3] || '').trim(),
      String(prev[4] || '').trim() || nowIso,
      estado === 'aprobado' ? String(prev[5] || '').trim() || nowIso : String(prev[5] || '').trim(),
      String(prev[6] || '').trim(),
      rol,
    ];
    sheet.getRange(found.row, 1, 1, 8).setValues([rowVals]);
    return {
      success: true,
      created: false,
      row: found.row,
      user: buildUsuarioAppRecord(rowVals),
      message: 'Usuario actualizado en Usuarios_App.',
    };
  }

  var newRow = [
    email,
    uid,
    estado,
    nombre,
    nowIso,
    estado === 'aprobado' ? nowIso : '',
    '',
    rol,
  ];
  sheet.appendRow(newRow);
  var createdUser = buildUsuarioAppRecord(newRow);
  notifyAdminsNewAppUserRequest(createdUser);
  return {
    success: true,
    created: true,
    row: sheet.getLastRow(),
    user: createdUser,
    message: estado === 'aprobado' ? 'Usuario registrado y aprobado.' : 'Solicitud registrada (pendiente de aprobación).',
  };
}

/** Alta o actualización de solicitud de acceso a la app. */
function handleRegisterAppUser(requestData) {
  try {
    var sheet = ensureUsuariosAppSheet(SPREADSHEET_ID);
    var result = upsertUsuarioAppRow(sheet, requestData);
    if (!result.success) return result;
    return {
      success: true,
      authorized: result.user.estado === 'aprobado',
      status: result.user.estado,
      isAdmin: isAppAdminEmail(result.user.email),
      accessRole: result.user.rol || 'entrenador',
      user: result.user,
      message: result.message,
    };
  } catch (error) {
    return { success: false, message: 'Error al registrar usuario de app: ' + error.toString() };
  }
}

/** Comprueba si el usuario puede usar la app (crear equipos, sincronizar). */
function handleCheckAppUserAuthorization(requestData) {
  try {
    var email = normalizeAppUserEmail(requestData.email);
    var uid = String(requestData.uid || '').trim();
    if (!email) {
      return { success: false, authorized: false, message: 'Falta email para comprobar autorización.' };
    }
    var sheet = ensureUsuariosAppSheet(SPREADSHEET_ID);
    var found = findUsuarioAppRowByEmail(sheet, email);
    if (found.row < 0) {
      if (requestData.autoRegister === true) {
        var created = upsertUsuarioAppRow(sheet, {
          email: email,
          uid: uid,
          nombre: requestData.nombre,
        });
        if (!created.success) return created;
        return {
          success: true,
          authorized: created.user.estado === 'aprobado',
          status: created.user.estado,
          isAdmin: isAppAdminEmail(created.user.email),
          accessRole: created.user.rol || 'entrenador',
          user: created.user,
          message: created.message,
        };
      }
      return {
        success: true,
        authorized: false,
        status: 'pendiente',
        isAdmin: isAppAdminEmail(email),
        message: 'Usuario no registrado. Solicita acceso desde la app.',
      };
    }

    var prev = found.data || [];
    var estado = normalizeAppUserEstado(prev[2]);
    if (isAppAdminEmail(email)) estado = 'aprobado';
    var rol = normalizeAppUserRol(prev[7]);
    if (isAppAdminEmail(email)) rol = 'entrenador';
    var rowVals = [
      email,
      uid || String(prev[1] || '').trim(),
      estado,
      String(prev[3] || '').trim(),
      String(prev[4] || '').trim(),
      estado === 'aprobado' ? String(prev[5] || '').trim() || new Date().toISOString() : String(prev[5] || '').trim(),
      String(prev[6] || '').trim(),
      rol,
    ];
    if (uid && uid !== String(prev[1] || '').trim()) {
      sheet.getRange(found.row, 1, 1, 8).setValues([rowVals]);
    } else if (isAppAdminEmail(email) && estado !== normalizeAppUserEstado(prev[2])) {
      sheet.getRange(found.row, 1, 1, 8).setValues([rowVals]);
    } else if (!String(prev[7] || '').trim()) {
      // Completa rol vacío en hojas antiguas sin reescribir el resto.
      sheet.getRange(found.row, 8).setValue(rol);
    }

    return {
      success: true,
      authorized: estado === 'aprobado',
      status: estado,
      isAdmin: isAppAdminEmail(email),
      accessRole: rol,
      user: buildUsuarioAppRecord(rowVals),
      message: estado === 'aprobado' ? 'Acceso autorizado.' : 'Acceso pendiente o denegado.',
    };
  } catch (error) {
    return { success: false, authorized: false, message: 'Error comprobando autorización: ' + error.toString() };
  }
}

function assertAppAdmin(adminEmail) {
  if (!isAppAdminEmail(adminEmail)) {
    return { ok: false, message: 'No tienes permiso de administrador de usuarios.' };
  }
  return { ok: true };
}

/** Cambia el estado y/o rol de un usuario (solo administradores). */
function handleSetAppUserAuthorization(requestData) {
  try {
    var adminCheck = assertAppAdmin(requestData.adminEmail);
    if (!adminCheck.ok) return { success: false, message: adminCheck.message };

    var targetEmail = normalizeAppUserEmail(requestData.targetEmail || requestData.email);
    var newEstado = normalizeAppUserEstado(requestData.estado || requestData.status);
    if (!targetEmail) {
      return { success: false, message: 'Indica el correo del usuario a modificar.' };
    }
    if (isAppAdminEmail(targetEmail)) newEstado = 'aprobado';

    var sheet = ensureUsuariosAppSheet(SPREADSHEET_ID);
    var found = findUsuarioAppRowByEmail(sheet, targetEmail);
    var nowIso = new Date().toISOString();
    var newRol =
      requestData.rol != null && requestData.rol !== ''
        ? normalizeAppUserRol(requestData.rol)
        : null;
    if (isAppAdminEmail(targetEmail)) newRol = 'entrenador';

    if (found.row < 0) {
      var created = upsertUsuarioAppRow(sheet, {
        email: targetEmail,
        uid: String(requestData.uid || '').trim(),
        nombre: String(requestData.nombre || '').trim(),
        estado: newEstado,
        rol: newRol || 'entrenador',
      });
      if (!created.success) return created;
      if (newEstado === 'aprobado' && created.row > 0) {
        var createdVals = sheet.getRange(created.row, 1, 1, 8).getValues()[0];
        createdVals[5] = nowIso;
        if (newRol) createdVals[7] = newRol;
        sheet.getRange(created.row, 1, 1, 8).setValues([createdVals]);
        created.user = buildUsuarioAppRecord(createdVals);
      }
      return {
        success: true,
        user: created.user,
        message: 'Usuario creado con estado «' + newEstado + '».',
      };
    }

    var prev = found.data || [];
    var rolFinal = newRol != null ? newRol : normalizeAppUserRol(prev[7]);
    if (isAppAdminEmail(targetEmail)) rolFinal = 'entrenador';
    var rowVals = [
      targetEmail,
      String(prev[1] || '').trim(),
      newEstado,
      String(prev[3] || '').trim(),
      String(prev[4] || '').trim() || nowIso,
      newEstado === 'aprobado' ? nowIso : String(prev[5] || '').trim(),
      String(requestData.notas != null ? requestData.notas : prev[6] || '').trim(),
      rolFinal,
    ];
    sheet.getRange(found.row, 1, 1, 8).setValues([rowVals]);
    return {
      success: true,
      user: buildUsuarioAppRecord(rowVals),
      message:
        newRol != null
          ? 'Actualizado: estado «' + newEstado + '», rol «' + rolFinal + '».'
          : 'Estado actualizado a «' + newEstado + '».',
    };
  } catch (error) {
    return { success: false, message: 'Error al cambiar autorización: ' + error.toString() };
  }
}

/** Lista solicitudes de usuarios (solo administradores). */
function handleListAppUsers(requestData) {
  try {
    var adminCheck = assertAppAdmin(requestData.adminEmail);
    if (!adminCheck.ok) return { success: false, users: [], message: adminCheck.message };

    var sheet = ensureUsuariosAppSheet(SPREADSHEET_ID);
    if (sheet.getLastRow() < 2) {
      return { success: true, users: [], message: 'Usuarios_App vacío.' };
    }
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    var users = [];
    for (var i = 0; i < data.length; i++) {
      var email = String(data[i][0] || '').trim();
      if (!email) continue;
      users.push(buildUsuarioAppRecord(data[i]));
    }
    return {
      success: true,
      users: users,
      message: 'Usuarios_App: ' + users.length + ' registro(s).',
    };
  } catch (error) {
    return { success: false, users: [], message: 'Error leyendo Usuarios_App: ' + error.toString() };
  }
}

/** --- Fase D: propagar estructura y/o script vinculado a todos los libros del registro --- */

var SCRIPT_API_SCOPE_HINT =
  'Falta autorizar script.external_request / script.projects en el proyecto del /exec.\n' +
  '1) Editor GAS → appsscript.json con los 4 scopes → GUARDA.\n' +
  '2) Revoca acceso en https://myaccount.google.com/permissions y ejecuta forceReauthorizeAllScopes.\n' +
  '3) Activa "Apps Script API" en Google Cloud Console (proyecto vinculado al script).\n' +
  '4) Ejecuta testScriptApiAuthorization → success: true.\n' +
  '5) Nueva implementación web.\n' +
  'Mientras tanto usa "Solo estructura" en la app.';

var SCRIPT_API_GCP_HINT =
  'Permisos OAuth OK, pero falta activar "Apps Script API" en Google Cloud Console.\n' +
  'Editor GAS → Configuración del proyecto → Proyecto de Google Cloud → abrir en consola → APIs → Apps Script API → Activar.';

/**
 * Ejecutar UNA VEZ tras revocar permisos en myaccount.google.com/permissions.
 * Debe mostrar ventana de autorización; si no aparece, el manifiesto no está guardado en Google.
 */
function forceReauthorizeAllScopes() {
  SpreadsheetApp.openById(SPREADSHEET_ID);
  DriveApp.getRootFolder();
  var resp = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('forceReauthorizeAllScopes: google.com status=' + resp.getResponseCode());
  Logger.log('Si no viste ventana de permisos, revoca acceso en myaccount.google.com/permissions y vuelve a ejecutar.');
  return { ok: true, googleStatus: resp.getResponseCode() };
}

function parseGcpProjectFromScriptApiError(text) {
  var m = String(text || '').match(/project[:\s]+(\d{8,})/i);
  return m && m[1] ? String(m[1]) : '';
}

/** Ejecutar tras forceReauthorizeAllScopes para comprobar Script API (usa GET /v1/projects/{scriptId}). */
function testScriptApiAuthorization() {
  var scriptId = String(TEMPLATE_BOUND_SCRIPT_PROJECT_ID || ScriptApp.getScriptId() || '').trim();
  var result;
  try {
    if (!scriptId) {
      result = {
        success: false,
        status: 0,
        hint: 'No hay scriptId. Define TEMPLATE_BOUND_SCRIPT_PROJECT_ID o ejecuta desde el editor del proyecto.',
      };
      Logger.log(JSON.stringify(result, null, 2));
      return result;
    }
    var resp = scriptApiRequest('projects/' + encodeURIComponent(scriptId), 'get');
    var code = resp.getResponseCode();
    var bodyText = String(resp.getContentText() || '');
    var hint = 'Script API autorizada para proyecto ' + scriptId + '.';
    var enableApiUrl = '';
    if (code === 403) {
      var gcpProject = parseGcpProjectFromScriptApiError(bodyText);
      enableApiUrl =
        gcpProject
          ? 'https://console.cloud.google.com/apis/api/script.googleapis.com/overview?project=' + gcpProject
          : 'https://console.cloud.google.com/apis/library/script.googleapis.com';
      hint =
        'Activa Apps Script API en el proyecto GCP vinculado al script.\n' +
        'Abre enableApiUrl (en el JSON de este resultado), pulsa ACTIVAR, espera 1 min y vuelve a ejecutar.';
    } else if (code === 404) {
      hint =
        'Proyecto ' +
        scriptId +
        ' no encontrado. Comprueba TEMPLATE_BOUND_SCRIPT_PROJECT_ID en la URL del editor (.../projects/ESTE_ID/edit).';
    } else if (code !== 200) {
      hint = SCRIPT_API_SCOPE_HINT;
    }
    result = {
      success: code === 200,
      status: code,
      scriptId: scriptId,
      hint: hint,
      enableApiUrl: enableApiUrl || undefined,
      preview: bodyText.slice(0, 300),
    };
  } catch (error) {
    result = { success: false, message: String(error), hint: SCRIPT_API_SCOPE_HINT };
  }
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function scriptApiRequest(path, method, payload) {
  try {
    var token = ScriptApp.getOAuthToken();
    var options = {
      method: method || 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    };
    if (payload != null) {
      options.contentType = 'application/json';
      options.payload = JSON.stringify(payload);
    }
    return UrlFetchApp.fetch('https://script.googleapis.com/v1/' + path, options);
  } catch (error) {
    var msg = String(error);
    if (msg.indexOf('script.external_request') >= 0 || msg.indexOf('script.projects') >= 0) {
      throw new Error(SCRIPT_API_SCOPE_HINT + '\n\nDetalle: ' + msg);
    }
    throw error;
  }
}

function getBoundScriptIdFromVersionAppSheet(spreadsheetId) {
  var sid = String(spreadsheetId || '').trim();
  if (!sid) return '';
  try {
    var ss = SpreadsheetApp.openById(sid);
    var sheet = ss.getSheetByName(SHEET_VERSION_APP);
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 5) return '';
    return String(sheet.getRange(2, 5).getValue() || '').trim();
  } catch (e) {
    return '';
  }
}

function findBoundScriptProjectIdForSpreadsheet(spreadsheetId) {
  var sid = String(spreadsheetId || '').trim();
  if (!sid) return '';

  if (sid === String(TEMPLATE_SPREADSHEET_ID).trim() || sid === String(SPREADSHEET_ID).trim()) {
    return String(TEMPLATE_BOUND_SCRIPT_PROJECT_ID || ScriptApp.getScriptId() || '').trim();
  }

  var fromVersionApp = getBoundScriptIdFromVersionAppSheet(sid);
  if (fromVersionApp) return fromVersionApp;

  return '';
}

function getScriptProjectContent(scriptProjectId) {
  var pid = String(scriptProjectId || '').trim();
  if (!pid) return null;
  var resp = scriptApiRequest('projects/' + encodeURIComponent(pid) + '/content', 'get');
  if (resp.getResponseCode() !== 200) return null;
  return JSON.parse(resp.getContentText());
}

function updateScriptProjectContent(scriptProjectId, content) {
  var pid = String(scriptProjectId || '').trim();
  if (!pid || !content) return false;
  var resp = scriptApiRequest('projects/' + encodeURIComponent(pid) + '/content', 'put', content);
  return resp.getResponseCode() === 200;
}

function ensureTeamBookSheetStructure(spreadsheetId) {
  getOrCreateSheet(SHEET_PLANTILLA, spreadsheetId);
  getOrCreateSheet(SHEET_PARTIDOS, spreadsheetId);
  getOrCreateSheet(SHEET_ENTRENAMIENTOS, spreadsheetId);
  getOrCreateSheet(SHEET_EVALUACION_DI, spreadsheetId);
  getOrCreateSheet(SHEET_HISTORIAL_CRONO, spreadsheetId);
  getOrCreateSheet(SHEET_PARTIDOS_ACTAS, spreadsheetId);
  getOrCreateSheet(SHEET_CALENDARIO_EVENTOS, spreadsheetId);
  ensureVersionAppSheet(getSpreadsheet(spreadsheetId));
}

function updateRegistroLibrosScriptVersion(spreadsheetId, version) {
  var sheet = ensureRegistroLibrosSheet(SPREADSHEET_ID);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  var nowIso = new Date().toISOString();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][3] || '').trim() === String(spreadsheetId || '').trim()) {
      sheet.getRange(2 + i, 11).setValue(version);
      sheet.getRange(2 + i, 13).setValue(nowIso);
      return;
    }
  }
}

/**
 * Recorre Registro_Libros y actualiza hojas y/o el .gs vinculado desde la plantilla.
 * requestData.mode: 'structure' | 'script' | 'both' (default both)
 * requestData.force: true para ignorar libros ya en SCRIPT_VERSION
 */
function handleSyncAllBooksFromRegistry(requestData) {
  try {
    var mode = String((requestData && requestData.mode) || 'both').trim().toLowerCase();
    if (mode !== 'structure' && mode !== 'script' && mode !== 'both') mode = 'both';
    var force = !!(requestData && requestData.force);
    var list = handleListRegistroLibros();
    if (!list.success) return list;
    var books = list.books || [];

    var templateProjectId = String(TEMPLATE_BOUND_SCRIPT_PROJECT_ID || '').trim();
    var templateContent = null;
    var scriptApiReady = false;
    var scriptApiWarning = '';

    if (mode === 'script' || mode === 'both') {
      try {
        if (!templateProjectId) {
          templateProjectId = findBoundScriptProjectIdForSpreadsheet(TEMPLATE_SPREADSHEET_ID);
        }
        if (templateProjectId) {
          templateContent = getScriptProjectContent(templateProjectId);
          scriptApiReady = !!templateContent;
        }
        if (!scriptApiReady && mode === 'both') {
          scriptApiWarning =
            'Script API no disponible; se propagó SOLO la estructura de hojas. ' + SCRIPT_API_SCOPE_HINT;
          mode = 'structure';
        }
      } catch (scriptInitErr) {
        scriptApiWarning = String(scriptInitErr);
        if (mode === 'both') {
          mode = 'structure';
        } else {
          return {
            success: false,
            message: scriptApiWarning,
            scriptVersion: SCRIPT_VERSION,
            scriptApiWarning: scriptApiWarning,
          };
        }
      }
    }

    if (mode === 'script' && !scriptApiReady) {
      return {
        success: false,
        message: scriptApiWarning || 'Script API no disponible. ' + SCRIPT_API_SCOPE_HINT,
        scriptVersion: SCRIPT_VERSION,
        scriptApiWarning: scriptApiWarning || SCRIPT_API_SCOPE_HINT,
      };
    }

    var updated = [];
    var failed = [];
    var skipped = [];

    for (var bi = 0; bi < books.length; bi++) {
      var b = books[bi];
      var ssId = String(b.spreadsheetId || '').trim();
      if (!ssId) continue;

      if (!force && b.scriptVersion === SCRIPT_VERSION && mode !== 'structure') {
        skipped.push({
          spreadsheetId: ssId,
          bookName: b.bookName,
          reason: 'Ya en version ' + SCRIPT_VERSION,
        });
        continue;
      }

      try {
        if (mode === 'structure' || mode === 'both') {
          ensureTeamBookSheetStructure(ssId);
        }
        if (mode === 'script' || mode === 'both') {
          if (!scriptApiReady) {
            throw new Error(
              'Script API no disponible. Activa scope script.projects y/o define TEMPLATE_BOUND_SCRIPT_PROJECT_ID.'
            );
          }
          var childProjectId = findBoundScriptProjectIdForSpreadsheet(ssId);
          if (!childProjectId) {
            throw new Error(
              'No se encontro proyecto Apps Script vinculado al libro. Abre el libro en Sheets una vez (onOpen guarda el ID en Version_App) o define el script manualmente.'
            );
          }
          if (!updateScriptProjectContent(childProjectId, templateContent)) {
            throw new Error('No se pudo copiar el script a ' + childProjectId);
          }
        }
        updateRegistroLibrosScriptVersion(ssId, SCRIPT_VERSION);
        updated.push({
          spreadsheetId: ssId,
          bookName: b.bookName,
          equipo: b.equipo,
          temporada: b.temporada,
        });
      } catch (bookErr) {
        failed.push({
          spreadsheetId: ssId,
          bookName: b.bookName,
          error: String(bookErr),
        });
      }
    }

    var allOk = failed.length === 0 && !scriptApiWarning;
    var baseMessage =
      'Propagacion ' +
      mode +
      ': ' +
      updated.length +
      ' ok, ' +
      failed.length +
      ' error, ' +
      skipped.length +
      ' omitidos.';
    return {
      success: allOk,
      message: scriptApiWarning ? baseMessage + '\n\n' + scriptApiWarning : baseMessage,
      scriptVersion: SCRIPT_VERSION,
      mode: mode,
      scriptApiWarning: scriptApiWarning || undefined,
      templateScriptProjectId: templateProjectId || null,
      scriptApiReady: scriptApiReady,
      updated: updated,
      failed: failed,
      skipped: skipped,
    };
  } catch (error) {
    return { success: false, message: 'Error en sync masivo: ' + error.toString() };
  }
}

/**
 * Coloca el libro copiado dentro de subcarpeta Equipo+Temporada bajo la carpeta padre.
 */
function organizeNewTeamBookInDrive(copyFile, parentFolderId, bookName) {
  var parent = resolveDriveFolderById(parentFolderId);
  if (!parent) parent = getOrCreateRootFolder(null);
  var teamFolder = getOrCreateSubfolder(parent, bookName);
  var fileToMove = copyFile;
  try {
    fileToMove = DriveApp.getFileById(copyFile.getId());
  } catch (e) {}
  fileToMove.moveTo(teamFolder);
  return {
    parentFolderId: parent.getId(),
    teamFolderId: teamFolder.getId(),
  };
}

/**
 * Copia el libro plantilla (con macros) y lo nombra Equipo + Temporada.
 * Opcionalmente lo coloca en parentDriveFolderId y crea subcarpeta con el mismo nombre.
 */
function handleCreateTeamSpreadsheetFromTemplate(requestData) {
  try {
    var bookName = String((requestData && requestData.bookName) || '').trim();
    var parentDriveFolderId = requestData ? requestData.parentDriveFolderId : null;
    var name = bookName;
    if (!name) {
      return { success: false, message: 'Nombre del libro vacío (Equipo + Temporada).' };
    }
    var templateFile = DriveApp.getFileById(TEMPLATE_SPREADSHEET_ID);
    var copy = templateFile.makeCopy(name);
    var ssId = copy.getId();
    var ssUrl = copy.getUrl();

    var cleared = clearTeamBookDataKeepHeaders(ssId);

    var teamFolderId = null;
    var parentFolderId = null;
    var driveWarning = '';

    var parentId = parentDriveFolderId ? String(parentDriveFolderId).trim() : '';
    if (parentId && !resolveDriveFolderById(parentId)) {
      driveWarning =
        'La carpeta padre no es válida (debe ser una carpeta de Drive, no un libro de Sheets). Se usó la carpeta por defecto del script.';
      parentId = '';
    }

    try {
      var layout = organizeNewTeamBookInDrive(copy, parentId || null, name);
      teamFolderId = layout.teamFolderId;
      parentFolderId = layout.parentFolderId;
    } catch (driveErr) {
      driveWarning =
        (driveWarning ? driveWarning + ' ' : '') +
        'Libro creado pero no se pudo organizar en Drive: ' +
        String(driveErr) +
        '. Puedes moverlo manualmente a tu carpeta.';
    }

    var msg =
      'Libro "' +
      name +
      '" creado (plantilla con macros, sin datos). Filas vaciadas: ' +
      cleared.rowsRemoved +
      '.';
    if (driveWarning) msg += ' ' + driveWarning;

    return {
      success: true,
      message: msg,
      spreadsheetId: ssId,
      spreadsheetUrl: ssUrl,
      bookName: name,
      driveRootFolderId: teamFolderId,
      parentDriveFolderId: parentFolderId,
      rowsCleared: cleared.rowsRemoved,
      driveWarning: driveWarning || undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error al crear libro desde plantilla: ' + error.toString(),
    };
  }
}

function handleEnsureDriveWorkspace(rootFolderId, spreadsheetId) {
  try {
    var parentRaw = rootFolderId ? String(rootFolderId).trim() : '';
    if (parentRaw && /\/spreadsheets\//i.test(parentRaw)) {
      return {
        success: false,
        message:
          'La carpeta raíz no puede ser un libro de Sheets. Usa una carpeta de Drive (.../folders/...).',
      };
    }
    var parentId = normalizeDriveFolderIdGas(parentRaw);
    if (parentRaw && !parentId) {
      return {
        success: false,
        message:
          'La carpeta raíz no es válida. Usa una URL .../folders/... o el ID de una carpeta de Drive.',
      };
    }
    var root = getOrCreateRootFolder(parentId || null);
    var fotos = getOrCreateSubfolder(root, DRIVE_FOLDER_FOTOS);
    var actas = getOrCreateSubfolder(root, DRIVE_FOLDER_ACTAS);
    var result = {
      success: true,
      message: 'Estructura de Drive verificada/creada.',
      rootFolderId: root.getId(),
      fotosFolderId: fotos.getId(),
      actasFolderId: actas.getId(),
    };
    var ssId = normalizeSpreadsheetIdGas(spreadsheetId);
    if (ssId) {
      var ss = SpreadsheetApp.openById(ssId);
      getOrCreateSheet(SHEET_PLANTILLA, ss.getId());
      getOrCreateSheet(SHEET_PARTIDOS, ss.getId());
      getOrCreateSheet(SHEET_ENTRENAMIENTOS, ss.getId());
      getOrCreateSheet(SHEET_EVALUACION_DI, ss.getId());
      getOrCreateSheet(SHEET_HISTORIAL_CRONO, ss.getId());
      getOrCreateSheet(SHEET_PARTIDOS_ACTAS, ss.getId());
      getOrCreateSheet(SHEET_CALENDARIO_EVENTOS, ss.getId());
      ensureVersionAppSheet(ss);
      result.message = 'Estructura de Drive y Spreadsheet verificada/creada.';
      result.spreadsheetId = ss.getId();
    }
    return result;
  } catch (error) {
    return {
      success: false,
      message: 'Error al preparar la estructura de nube: ' + error.toString(),
    };
  }
}
