/**
 * Google Apps Script para sincronización con la App de Fútbol Sala
 * 
 * INSTRUCCIONES DE CONFIGURACIÓN:
 * 1. Abre Google Sheets y crea un nuevo libro de cálculo
 * 2. Ve a Extensiones > Apps Script
 * 3. Pega este código completo
 * 4. Crea 3 hojas con estos nombres exactos:
 *    - "Plantilla"
 *    - "Partidos"
 *    - "Entrenamientos"
 * 5. Configura las columnas de cada hoja según las especificaciones
 * 6. Despliega como aplicación web con permisos de ejecución
 * 7. Copia la URL de despliegue y úsala en googleSheetsService.ts
 * 
 * ESTRUCTURA DE HOJAS:
 * 
 * HOJA "Plantilla":
 * Columnas: id | nombreCompleto | nominal | fechaNacimiento | numeroLicencia | dorsal | posicion | edad | foto
 * 
 * HOJA "Partidos":
 * Columnas: id | fecha | rival | goles_favor | goles_contra | resultado | cronometro | 
 *           quinteto_gol1 | autor_gol1 | quinteto_gol2 | autor_gol2 | ... | quinteto_gol10 | autor_gol10
 * 
 * HOJA "Entrenamientos":
 * Columnas: Fecha | Jugador | Asistencia | FECHA ENTRENAMIENTO
 */

// ID de la hoja de cálculo
const SPREADSHEET_ID = '1hgU1f36TE2WYM8IbeHXVti0qP0HjBDEbUX82axnXZog';

// Nombres de las hojas
const SHEET_PLANTILLA = 'Plantilla';
const SHEET_PARTIDOS = 'Partidos';
const SHEET_ENTRENAMIENTOS = 'Entrenamientos';

// ID de carpetas de Google Drive
const FOLDER_ID_FOTOS = '1VUPNFNggtYoXAVglFwNfWw8TD1BjmXWt';
const FOLDER_ID_ACTAS = '1kYAmF1v4YgMEooXpmUVFgrnL0rV89-yV';

/**
 * Función para manejar peticiones GET (necesaria para que la URL funcione)
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Google Apps Script activo y funcionando',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Función principal que maneja todas las peticiones POST
 */
function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;

    let response;

    switch (action) {
      case 'exportPlantilla':
        response = handleExportPlantilla(requestData.data);
        break;
      case 'importPlantilla':
        response = handleImportPlantilla();
        break;
      case 'exportPartidos':
        response = handleExportPartidos(requestData.data);
        break;
      case 'importPartidos':
        response = handleImportPartidos();
        break;
      case 'exportEntrenamientos':
        response = handleExportEntrenamientos(requestData.data);
        break;
      case 'importEntrenamientos':
        response = handleImportEntrenamientos();
        break;
      case 'generateMatchReport':
        response = handleGenerateMatchReport(requestData.partidoId);
        break;
      case 'exportReportToDrive':
        response = handleExportReportToDrive(requestData.partidoId);
        break;
      case 'uploadPhotoToDrive':
        response = handleUploadPhotoToDrive(requestData.folderId, requestData.fileName, requestData.base64Data);
        break;
      case 'uploadActaToDrive':
        response = handleUploadActaToDrive(requestData.folderId, requestData.fileName, requestData.base64Data, requestData.mimeType);
        break;
      default:
        response = { success: false, message: 'Acción no reconocida: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error en el servidor: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Obtiene la hoja de cálculo activa
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID === 'TU_SPREADSHEET_ID_AQUI') {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Obtiene o crea una hoja específica
 */
function getOrCreateSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Configurar encabezados según la hoja
    if (sheetName === SHEET_PLANTILLA) {
      sheet.getRange(1, 1, 1, 12).setValues([[
        'id', 'nombreCompleto', 'nominal', 'fechaNacimiento',
        'numeroLicencia', 'dorsal', 'posicion', 'edad', 'foto',
        'estadoFisico', 'disponibilidad', 'perfilTactico'
      ]]);
      sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
    } else if (sheetName === SHEET_PARTIDOS) {
      const headers = ['f', 'fecha', 'rival', 'goles_favor', 'goles_contra', 'Ubicion', 'Tipo_Competicion'];
      for (let i = 1; i <= 20; i++) {
        headers.push('autor_gol' + i);
        headers.push('quinteto_gol' + i);
        headers.push('minuto_Gol' + i);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    } else if (sheetName === SHEET_ENTRENAMIENTOS) {
      sheet.getRange(1, 1, 1, 5).setValues([[
        'Fecha', 'Jugador', 'Asistencia', 'Objetivos', 'FECHA ENTRENAMIENTO'
      ]]);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    }
  }
  
  return sheet;
}

// ============================================================================
// FUNCIONES DE EXPORTACIÓN
// ============================================================================

/**
 * Exporta la plantilla a Google Sheets
 */
function handleExportPlantilla(data) {
  try {
    const sheet = getOrCreateSheet(SHEET_PLANTILLA);
    
    // Limpiar datos existentes (excepto encabezados)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    
    // Convertir datos a formato de filas
    const rows = data.map(row => [
      row.id || '',
      row.nombreCompleto || '',
      row.nominal || '',
      row.fechaNacimiento || '',
      row.numeroLicencia || '',
      row.dorsal || '',
      row.posicion || '',
      row.edad || '',
      row.foto || '',
      row.estadoFisico || '',
      row.disponibilidad || '',
      row.perfilTactico || ''
    ]);
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 12).setValues(rows);
    }
    
    return { success: true, message: 'Plantilla exportada correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al exportar plantilla: ' + error.toString() };
  }
}

/**
 * Exporta los partidos a Google Sheets
 */
function handleExportPartidos(data) {
  try {
    const sheet = getOrCreateSheet(SHEET_PARTIDOS);
    
    // Limpiar datos existentes (excepto encabezados)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    
    // Header: f, fecha, rival, goles_favor, goles_contra, Ubicion, Tipo_Competicion, autor_gol[1-20], quinteto_gol[1-20], minuto_Gol[1-20]
    const rows = data.map(row => {
      const baseRow = [
        row.f || row.id || '',
        row.fecha || '',
        row.rival || '',
        row.goles_favor || '0',
        row.goles_contra || '0',
        row.Ubicion || 'LOCAL',
        row.Tipo_Competicion || 'LIGA'
      ];
      for (let i = 1; i <= 20; i++) {
        baseRow.push(row['autor_gol' + i] || '');
        baseRow.push(row['quinteto_gol' + i] || '');
        baseRow.push(row['minuto_Gol' + i] || '');
      }
      return baseRow;
    });
    
    if (rows.length > 0) {
      const numCols = 7 + 20 * 3;
      sheet.getRange(2, 1, rows.length, numCols).setValues(rows);
    }
    
    return { success: true, message: 'Partidos exportados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al exportar partidos: ' + error.toString() };
  }
}

/**
 * Exporta los entrenamientos a Google Sheets
 */
function handleExportEntrenamientos(data) {
  try {
    const sheet = getOrCreateSheet(SHEET_ENTRENAMIENTOS);
    
    // Limpiar datos existentes (excepto encabezados)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    
    // Convertir datos a formato de filas (una fila por jugador por entrenamiento)
    // data es un array de objetos EntrenamientoRow
    const rows = data.map(row => [
      row.Fecha || '',
      row.Jugador || '',
      row.Asistencia || 'AS',
      row.Objetivos || '',
      row['FECHA ENTRENAMIENTO'] || row.Fecha || ''
    ]);

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    }
    
    return { success: true, message: 'Entrenamientos exportados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al exportar entrenamientos: ' + error.toString() };
  }
}

// ============================================================================
// FUNCIONES DE IMPORTACIÓN
// ============================================================================

/**
 * Importa la plantilla desde Google Sheets
 */
function handleImportPlantilla() {
  try {
    const sheet = getOrCreateSheet(SHEET_PLANTILLA);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) {
      return { success: true, data: [], message: 'No hay datos para importar' };
    }
    
    // Saltar encabezados
    const rows = values.slice(1).map(row => ({
      id: row[0] || '',
      nombreCompleto: row[1] || '',
      nominal: row[2] || '',
      fechaNacimiento: row[3] || '',
      numeroLicencia: row[4] || '',
      dorsal: row[5] || '',
      posicion: row[6] || '',
      edad: row[7] || '',
      foto: row[8] || '',
      estadoFisico: row[9] || '',
      disponibilidad: row[10] || '',
      perfilTactico: row[11] || ''
    }));
    
    return { success: true, data: rows, message: 'Plantilla importada correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al importar plantilla: ' + error.toString() };
  }
}

/**
 * Importa los partidos desde Google Sheets
 */
function handleImportPartidos() {
  try {
    const sheet = getOrCreateSheet(SHEET_PARTIDOS);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) {
      return { success: true, data: [], message: 'No hay datos para importar' };
    }
    
    // Header: f, fecha, rival, goles_favor, goles_contra, Ubicion, Tipo_Competicion, autor_gol[1-20], quinteto_gol[1-20], minuto_Gol[1-20]
    const rows = values.slice(1).map(row => {
      const partido = {
        f: row[0] || '',
        id: row[0] || '',
        fecha: row[1] || '',
        rival: row[2] || '',
        goles_favor: String(row[3] || '0'),
        goles_contra: String(row[4] || '0'),
        Ubicion: row[5] || 'LOCAL',
        Tipo_Competicion: row[6] || 'LIGA'
      };
      let col = 7;
      for (let i = 1; i <= 20; i++) {
        partido['autor_gol' + i] = row[col++] || '';
        partido['quinteto_gol' + i] = row[col++] || '';
        partido['minuto_Gol' + i] = row[col++] || '';
      }
      
      return partido;
    });
    
    return { success: true, data: rows, message: 'Partidos importados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al importar partidos: ' + error.toString() };
  }
}

/**
 * Importa los entrenamientos desde Google Sheets
 */
function handleImportEntrenamientos() {
  try {
    const sheet = getOrCreateSheet(SHEET_ENTRENAMIENTOS);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) {
      return { success: true, data: [], message: 'No hay datos para importar' };
    }
    
    // Saltar encabezados y convertir a formato de filas
    const rows = values.slice(1).map(row => ({
      Fecha: row[0] || '',
      Jugador: row[1] || '',
      Asistencia: row[2] || 'AS',
      Objetivos: row[3] || '',
      'FECHA ENTRENAMIENTO': row[4] || row[0] || ''
    }));
    
    return { success: true, data: rows, message: 'Entrenamientos importados correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al importar entrenamientos: ' + error.toString() };
  }
}

// ============================================================================
// FUNCIONES DE GENERACIÓN DE INFORMES
// ============================================================================

/**
 * Genera un informe completo de un partido
 */
function handleGenerateMatchReport(partidoId) {
  try {
    const sheet = getOrCreateSheet(SHEET_PARTIDOS);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    // Buscar el partido por ID
    let partidoRow = null;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === partidoId) {
        partidoRow = values[i];
        break;
      }
    }
    
    if (!partidoRow) {
      return { success: false, message: 'Partido no encontrado' };
    }
    
    // Construir el informe HTML
    let report = '<h1>INFORME DE PARTIDO</h1>';
    report += '<h2>Datos Generales</h2>';
    report += '<table border="1" cellpadding="5" cellspacing="0">';
    report += '<tr><th>Campo</th><th>Valor</th></tr>';
    report += '<tr><td>ID</td><td>' + (partidoRow[0] || '') + '</td></tr>';
    report += '<tr><td>Fecha</td><td>' + (partidoRow[1] || '') + '</td></tr>';
    report += '<tr><td>Rival</td><td>' + (partidoRow[2] || '') + '</td></tr>';
    report += '<tr><td>Goles a Favor</td><td>' + (partidoRow[3] || '0') + '</td></tr>';
    report += '<tr><td>Goles en Contra</td><td>' + (partidoRow[4] || '0') + '</td></tr>';
    report += '<tr><td>Resultado</td><td>' + (partidoRow[5] || '') + '</td></tr>';
    report += '<tr><td>Cronómetro</td><td>' + (partidoRow[6] || 'N/A') + '</td></tr>';
    report += '</table>';
    
    // Información de goles
    report += '<h2>Detalle de Goles</h2>';
    report += '<table border="1" cellpadding="5" cellspacing="0">';
    report += '<tr><th>Gol</th><th>Autor</th><th>Quinteto en Pista</th></tr>';
    
    let golCount = 0;
    for (let i = 1; i <= 10; i++) {
      const quintetoIndex = 6 + (i - 1) * 2 + 1;
      const autorIndex = quintetoIndex + 1;
      if (partidoRow[autorIndex]) {
        golCount++;
        report += '<tr>';
        report += '<td>Gol ' + golCount + '</td>';
        report += '<td>' + (partidoRow[autorIndex] || '') + '</td>';
        report += '<td>' + (partidoRow[quintetoIndex] || '') + '</td>';
        report += '</tr>';
      }
    }
    
    if (golCount === 0) {
      report += '<tr><td colspan="3">No hay goles registrados</td></tr>';
    }
    
    report += '</table>';
    
    // Información de asistentes/convocados
    report += '<h2>Convocados/Asistentes</h2>';
    report += '<table border="1" cellpadding="5" cellspacing="0">';
    report += '<tr><th>#</th><th>Jugador</th></tr>';
    
    let asistenteCount = 0;
    for (let i = 1; i <= 20; i++) {
      const asistenteIndex = 26 + i; // Columnas 27-46 (0-indexed: 26-45)
      if (partidoRow[asistenteIndex]) {
        asistenteCount++;
        report += '<tr>';
        report += '<td>' + asistenteCount + '</td>';
        report += '<td>' + (partidoRow[asistenteIndex] || '') + '</td>';
        report += '</tr>';
      }
    }
    
    if (asistenteCount === 0) {
      report += '<tr><td colspan="2">No hay asistentes registrados</td></tr>';
    }
    
    report += '</table>';
    
    return { success: true, report: report, message: 'Informe generado correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al generar informe: ' + error.toString() };
  }
}

/**
 * Exporta un informe de partido a Google Drive
 */
function handleExportReportToDrive(partidoId) {
  try {
    // Generar el informe
    const reportResult = handleGenerateMatchReport(partidoId);
    
    if (!reportResult.success) {
      return reportResult;
    }
    
    // Crear documento HTML en Drive
    const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Informe de Partido</title></head><body>' + 
                       reportResult.report + '</body></html>';
    
    const folder = DriveApp.getRootFolder(); // O usar una carpeta específica
    const fileName = 'Informe_Partido_' + partidoId + '_' + new Date().getTime() + '.html';
    const file = folder.createFile(fileName, htmlContent, 'text/html');
    
    // Obtener URL del archivo
    const fileUrl = file.getUrl();
    
    return { 
      success: true, 
      url: fileUrl, 
      message: 'Informe exportado a Drive correctamente' 
    };
  } catch (error) {
    return { success: false, message: 'Error al exportar a Drive: ' + error.toString() };
  }
}

/**
 * Sube una foto de jugador a Google Drive
 * Carpeta: 1VUPNFNggtYoXAVglFwNfWw8TD1BjmXWt
 * Nombre de archivo: nombre del jugador. Sustituye si ya existe.
 */
function handleUploadPhotoToDrive(folderId, fileName, base64Data) {
  try {
    if (!folderId || !fileName || !base64Data) {
      return { success: false, message: 'Faltan parámetros: folderId, fileName, base64Data' };
    }
    const folder = DriveApp.getFolderById(folderId);
    const existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', fileName);
    const file = folder.createFile(blob);
    return { success: true, url: file.getUrl(), message: 'Foto subida correctamente' };
  } catch (error) {
    return { success: false, message: 'Error al subir foto: ' + error.toString() };
  }
}

/**
 * Sube un acta oficial de partido (PDF o imagen) a Google Drive
 * Carpeta: 1kYAmF1v4YgMEooXpmUVFgrnL0rV89-yV
 * Nombre: [Fecha] [Rival] (ej: 20-02-2025 Atletico Madrid)
 * Sustituye archivo si ya existe con el mismo nombre
 */
function handleUploadActaToDrive(folderId, fileName, base64Data, mimeType) {
  try {
    if (!folderId || !fileName || !base64Data || !mimeType) {
      return { success: false, message: 'Faltan parámetros: folderId, fileName, base64Data, mimeType' };
    }
    
    const folder = DriveApp.getFolderById(folderId);
    
    // Eliminar archivo existente con el mismo nombre si existe
    const existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    
    // Decodificar base64 y crear el blob
    const decodedData = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedData, mimeType, fileName);
    
    // Crear el archivo en Drive
    const file = folder.createFile(blob);
    const fileUrl = file.getUrl();
    
    return { 
      success: true, 
      url: fileUrl, 
      message: 'Acta subida a Drive correctamente' 
    };
  } catch (error) {
    return { success: false, message: 'Error al subir acta: ' + error.toString() };
  }
}
