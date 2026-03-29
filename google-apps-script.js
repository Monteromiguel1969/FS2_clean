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
 */

// ID por defecto del libro (la app puede sobrescribir con spreadsheetId en el JSON del POST)
const SPREADSHEET_ID = '1hgU1f36TE2WYM8IbeHXVti0qP0HjBDEbUX82axnXZog';

const SHEET_PLANTILLA = 'Plantilla';
const SHEET_PARTIDOS = 'Partidos';
const SHEET_ENTRENAMIENTOS = 'Entrenamientos';
const SHEET_EVALUACION_DI = 'Evaluacion_DI';
const SHEET_EVALUACION_DI_IA_MATRIZ = 'Evaluacion_DI_IA_Matriz';
const SHEET_EVALUACION_DI_PERSONAL_MATRIZ = 'Evaluacion_DI_Personal_Matriz';
const SHEET_HISTORICO_EVALUACIONES = 'Historico_Evaluaciones';

/** Primera columna de asistencias / nombres de jugador (índice 0): tras 7 base + 20×3 goles = 67 */
const COL_START_ASIST_PARTIDOS = 7 + 20 * 3;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: true,
      message: 'Google Apps Script activo',
      timestamp: new Date().toISOString(),
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const spreadsheetId = requestData.spreadsheetId || null;

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
        response = handleUploadPhotoToDrive(requestData.folderId, requestData.fileName, requestData.base64Data);
        break;
      case 'uploadActaToDrive':
        response = handleUploadActaToDrive(
          requestData.folderId,
          requestData.folderName,
          requestData.fileName,
          requestData.base64Data,
          requestData.mimeType
        );
        break;
      case 'listActasDrive':
        response = handleListActasDrive(requestData.folderId, requestData.folderName);
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
    var input = Array.isArray(data) ? data : [];
    if (input.length === 0) return { success: true, message: 'Sin evaluaciones para exportar', inserted: 0 };

    var lastRow = sheet.getLastRow();
    var existingIds = {};
    if (lastRow > 1) {
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var id = String(ids[i][0] || '').trim();
        if (id) existingIds[id] = true;
      }
    }

    var nowIso = new Date().toISOString();
    var rows = [];
    for (var j = 0; j < input.length; j++) {
      var r = input[j] || {};
      var rowId = String(r.row_id || '').trim();
      if (!rowId || existingIds[rowId]) continue;
      rows.push([
        rowId,
        r.jugador_id || '',
        r.jugador_nombre || '',
        r.eval_id || '',
        r.fecha_eval || '',
        r.fuente || '',
        r.score_eval || '',
        r.bloque || '',
        r.subbloque || '',
        r.pregunta || '',
        r.respuesta || '',
        r.puntuacion || '',
        nowIso,
      ]);
      existingIds[rowId] = true;
    }

    if (rows.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, 13).setValues(rows);
    }
    return { success: true, message: 'Evaluaciones exportadas', inserted: rows.length };
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

    if (updateIA) {
      iaInfo = writeMatrixSheet(SHEET_EVALUACION_DI_IA_MATRIZ, requestData.iaMatrix || [], spreadsheetId);
    }
    if (updatePersonal) {
      personalInfo = writeMatrixSheet(
        SHEET_EVALUACION_DI_PERSONAL_MATRIZ,
        requestData.personalMatrix || [],
        spreadsheetId
      );
    }
    if (updateHistorico) {
      writeMatrixSheet(SHEET_HISTORICO_EVALUACIONES, requestData.historicoMatrix || [], spreadsheetId);
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

    var rows = (data || []).map(function (row) {
      return [
        row.id || '',
        row.nombreCompleto || '',
        row.nominal || '',
        row.fechaNacimiento || '',
        row.numeroLicencia || '',
        row.dorsal || '',
        row.posicion || '',
        row.edad || '',
        row.foto || '',
        row.player_json || '',
      ];
    });

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 10).setValues(rows);
    }
    return { success: true, message: 'Plantilla exportada correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al exportar plantilla: ' + error.toString() };
  }
}

function handleExportPartidos(requestData, spreadsheetId) {
  try {
    var data = requestData.data || [];
    var players = requestData.players || [];
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
        var nom = (players[k].nominal || players[k].name || '').trim();
        headerBase.push(nom || 'Jugador');
      }
    } else {
      for (var j = 1; j <= 20; j++) {
        headerBase.push('jugador_' + j);
        headerBase.push('asist_' + j);
      }
    }
    if (!appendOnly || sheet.getLastRow() < 1) {
      sheet.getRange(1, 1, 1, headerBase.length).setValues([headerBase]);
      sheet.getRange(1, 1, 1, headerBase.length).setFontWeight('bold');
    }

    var rows = data.map(function (row) {
      var baseRow = [
        row.f || row.id || '',
        row.fecha || '',
        row.rival || '',
        row.goles_favor || '0',
        row.goles_contra || '0',
        row.Ubicion || 'LOCAL',
        row.Tipo_Competicion || 'LIGA',
      ];
      for (var g = 1; g <= 20; g++) {
        baseRow.push(row['autor_gol' + g] || '');
        baseRow.push(row['quinteto_gol' + g] || '');
        baseRow.push(row['minuto_Gol' + g] || '');
      }
      if (row.playerAsist && row.playerAsist.length > 0) {
        for (var pa = 0; pa < row.playerAsist.length; pa++) {
          baseRow.push(row.playerAsist[pa] || '');
        }
      } else {
        for (var jj = 1; jj <= 20; jj++) {
          baseRow.push(row['jugador_' + jj] || '');
          baseRow.push(row['asist_' + jj] || '');
        }
      }
      return baseRow;
    });

    if (rows.length > 0) {
      var numCols = headerBase.length;
      var startRow = appendOnly ? sheet.getLastRow() + 1 : 2;
      sheet.getRange(startRow, 1, startRow + rows.length - 1, numCols).setValues(rows);
    }
    return { success: true, message: appendOnly ? 'Partidos nuevos añadidos' : 'Partidos exportados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al exportar partidos: ' + error.toString() };
  }
}

function handleExportEntrenamientos(requestData, spreadsheetId) {
  try {
    var data = requestData.data || [];
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
        row.Fecha || '',
        row.Jugador || '',
        row.Asistencia || 'AS',
        row['FECHA ENTRENAMIENTO'] || row.Fecha || '',
      ];
    });
    if (rows.length > 0) {
      var sr = appendOnly ? sheet.getLastRow() + 1 : 2;
      sheet.getRange(sr, 1, sr + rows.length - 1, 4).setValues(rows);
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

function handleUploadPhotoToDrive(folderId, fileName, base64Data) {
  try {
    if (!folderId || !fileName || !base64Data) {
      return { success: false, message: 'Faltan parámetros: folderId, fileName, base64Data' };
    }
    var folder = DriveApp.getFolderById(folderId);
    var existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', fileName);
    var file = folder.createFile(blob);
    return { success: true, url: file.getUrl(), message: 'Foto subida correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al subir foto: ' + error.toString() };
  }
}

function getOrCreateFolder(folderId, folderName) {
  var safeName = folderName || 'Actas Partidos';
  if (folderId) {
    try {
      var byId = DriveApp.getFolderById(folderId);
      if (byId) return byId;
    } catch (e) {}
  }
  var byName = DriveApp.getFoldersByName(safeName);
  if (byName.hasNext()) return byName.next();
  return DriveApp.createFolder(safeName);
}

function handleUploadActaToDrive(folderId, folderName, fileName, base64Data, mimeType) {
  try {
    if (!fileName || !base64Data) {
      return { success: false, message: 'Faltan fileName o base64Data' };
    }
    var folder = getOrCreateFolder(folderId, folderName || 'Actas Partidos');
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

function handleListActasDrive(folderId, folderName) {
  try {
    var folder = getOrCreateFolder(folderId, folderName || 'Actas Partidos');
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
