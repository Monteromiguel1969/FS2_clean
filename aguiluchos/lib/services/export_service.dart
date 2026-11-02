import 'dart:io';
import 'dart:typed_data';

import 'package:excel/excel.dart' as xl;
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/nido_constants.dart';
import '../models/nido_grefa_model.dart';
import 'app_directories.dart';

/// Totales del resumen ejecutivo del informe.
class ResumenCampana {
  ResumenCampana(List<NidoGrefaModel> nidos)
      : totalNidos = nidos.length,
        exitos = nidos
            .where((n) => n.estadoReproductivo == EstadoReproductivo.exito)
            .length,
        fracasos = nidos
            .where((n) => n.estadoReproductivo == EstadoReproductivo.fracaso)
            .length,
        enCurso = nidos
            .where((n) => n.estadoReproductivo == EstadoReproductivo.enCurso)
            .length,
        pollosNacidos = nidos.fold(0, (a, n) => a + (n.numPollosNacidos ?? 0)),
        pollosVolados = nidos.fold(0, (a, n) => a + (n.numPollosVolados ?? 0)),
        pollosMuertos = nidos.fold(0, (a, n) => a + (n.numPollosMuertos ?? 0)),
        intervenciones = nidos.where((n) => n.intervencion).length,
        causas = _contarCausas(nidos);

  final int totalNidos;
  final int exitos;
  final int fracasos;
  final int enCurso;
  final int pollosNacidos;
  final int pollosVolados;
  final int pollosMuertos;
  final int intervenciones;
  final Map<String, int> causas;

  /// Nidos con éxito sobre nidos con resultado cerrado (éxito + fracaso).
  double? get tasaExito {
    final cerrados = exitos + fracasos;
    return cerrados == 0 ? null : exitos / cerrados;
  }

  /// Pollos volados por nido con resultado cerrado.
  double? get productividad {
    final cerrados = exitos + fracasos;
    return cerrados == 0 ? null : pollosVolados / cerrados;
  }

  static Map<String, int> _contarCausas(List<NidoGrefaModel> nidos) {
    final m = <String, int>{};
    for (final n in nidos) {
      final c = n.causasFracaso;
      if (n.estadoReproductivo == EstadoReproductivo.fracaso &&
          c != null &&
          c.isNotEmpty) {
        m[c] = (m[c] ?? 0) + 1;
      }
    }
    return m;
  }
}

/// Generación de informes Excel y PDF y entrega de archivos.
class ExportService {
  static final _fecha = DateFormat('dd/MM/yyyy');

  // ── Excel ────────────────────────────────────────────────────────────────

  Uint8List generarExcel(List<NidoGrefaModel> nidos, List<NidoColumn> columnas) {
    final excel = xl.Excel.createExcel();
    final defaultSheet = excel.getDefaultSheet();
    if (defaultSheet != null) excel.rename(defaultSheet, 'Nidos');
    final sheet = excel['Nidos'];

    final header = xl.CellStyle(
      bold: true,
      backgroundColorHex: xl.ExcelColor.fromHexString('#FFD7E6D5'),
    );
    sheet.appendRow([for (final c in columnas) xl.TextCellValue(c.label)]);
    for (var i = 0; i < columnas.length; i++) {
      sheet
          .cell(xl.CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 0))
          .cellStyle = header;
    }

    for (final n in nidos) {
      sheet.appendRow([
        for (final c in columnas) _celda(c, n),
      ]);
    }
    final bytes = excel.save();
    if (bytes == null) throw StateError('No se pudo generar el Excel.');
    return Uint8List.fromList(bytes);
  }

  xl.CellValue? _celda(NidoColumn c, NidoGrefaModel n) {
    final v = c.read(n);
    if (v == null) return null;
    return switch (c.type) {
      NidoColumnType.integer => xl.IntCellValue(v as int),
      NidoColumnType.real => xl.DoubleCellValue(v as double),
      NidoColumnType.date => xl.DateCellValue(
          year: (v as DateTime).year, month: v.month, day: v.day),
      _ => xl.TextCellValue(c.formatted(n)),
    };
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  Future<Uint8List> generarPdf(
    List<NidoGrefaModel> nidos, {
    String? descripcionFiltros,
    DateTime? generadoEn,
  }) async {
    final resumen = ResumenCampana(nidos);
    final ahora = generadoEn ?? DateTime.now();
    final verde = PdfColor.fromHex('#2E5E3A');
    final doc = pw.Document(
      title: 'Informe de campaña Aguilucho - GREFA',
      author: 'GREFA',
    );

    pw.Widget membrete() => pw.Container(
          padding: const pw.EdgeInsets.only(bottom: 8),
          decoration: pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: verde, width: 2)),
          ),
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text('GREFA',
                      style: pw.TextStyle(
                          fontSize: 26,
                          fontWeight: pw.FontWeight.bold,
                          color: verde)),
                  pw.Text(
                      'Grupo para la Rehabilitación de la Fauna Autóctona y su Hábitat',
                      style: const pw.TextStyle(fontSize: 8)),
                ],
              ),
              pw.Text('Campaña Aguilucho cenizo y pálido',
                  style: pw.TextStyle(
                      fontSize: 12, fontWeight: pw.FontWeight.bold)),
            ],
          ),
        );

    pw.Widget kpi(String titulo, String valor) => pw.Container(
          width: 120,
          padding: const pw.EdgeInsets.all(8),
          decoration: pw.BoxDecoration(
            border: pw.Border.all(color: PdfColors.grey500),
            borderRadius: pw.BorderRadius.circular(4),
          ),
          child: pw.Column(children: [
            pw.Text(valor,
                style: pw.TextStyle(
                    fontSize: 20, fontWeight: pw.FontWeight.bold, color: verde)),
            pw.Text(titulo,
                textAlign: pw.TextAlign.center,
                style: const pw.TextStyle(fontSize: 8)),
          ]),
        );

    String pct(double? v) =>
        v == null ? 'n/d' : '${(v * 100).toStringAsFixed(0)} %';

    final filas = nidos
        .map((n) => [
              n.etiqueta ?? '',
              n.municipio ?? '',
              n.especie ?? '',
              '${n.numPollosNacidos ?? 0}',
              '${n.numPollosVolados ?? 0}',
              '${n.numPollosMuertos ?? 0}',
              n.estadoReproductivo.etiqueta,
              justificacionConservacion(n),
            ])
        .toList();

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4.landscape,
        margin: const pw.EdgeInsets.all(28),
        header: (_) => membrete(),
        footer: (ctx) => pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Text('Página ${ctx.pageNumber} de ${ctx.pagesCount}',
              style: const pw.TextStyle(fontSize: 8)),
        ),
        build: (_) => [
          pw.SizedBox(height: 10),
          pw.Text('Informe de seguimiento reproductor',
              style:
                  pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
          pw.Text('Generado el ${_fecha.format(ahora)}',
              style: const pw.TextStyle(fontSize: 9)),
          if (descripcionFiltros != null && descripcionFiltros.isNotEmpty)
            pw.Text('Filtros: $descripcionFiltros',
                style: const pw.TextStyle(fontSize: 9)),
          pw.SizedBox(height: 10),
          pw.Text('Resumen ejecutivo',
              style: pw.TextStyle(
                  fontSize: 13, fontWeight: pw.FontWeight.bold, color: verde)),
          pw.SizedBox(height: 6),
          pw.Wrap(spacing: 8, runSpacing: 8, children: [
            kpi('Nidos', '${resumen.totalNidos}'),
            kpi('Pollos nacidos', '${resumen.pollosNacidos}'),
            kpi('Pollos volados', '${resumen.pollosVolados}'),
            kpi('Pollos muertos', '${resumen.pollosMuertos}'),
            kpi('Nidos con éxito', '${resumen.exitos}'),
            kpi('Nidos fracasados', '${resumen.fracasos}'),
            kpi('Nidos en curso', '${resumen.enCurso}'),
            kpi('Tasa de éxito', pct(resumen.tasaExito)),
            kpi('Productividad (volados/nido)',
                resumen.productividad?.toStringAsFixed(2) ?? 'n/d'),
            kpi('Nidos con intervención', '${resumen.intervenciones}'),
          ]),
          if (resumen.causas.isNotEmpty) ...[
            pw.SizedBox(height: 8),
            pw.Text(
              'Causas de fracaso: ${resumen.causas.entries.map((e) => '${e.key} (${e.value})').join(', ')}',
              style: const pw.TextStyle(fontSize: 9),
            ),
          ],
          pw.SizedBox(height: 14),
          pw.Text('Relación de nidos',
              style: pw.TextStyle(
                  fontSize: 13, fontWeight: pw.FontWeight.bold, color: verde)),
          pw.SizedBox(height: 6),
          if (filas.isEmpty)
            pw.Text('No hay nidos que cumplan los filtros seleccionados.')
          else
            pw.TableHelper.fromTextArray(
              headers: const [
                'Etiqueta',
                'Municipio',
                'Especie',
                'Nacidos',
                'Volados',
                'Muertos',
                'Resultado',
                'Justificación de conservación',
              ],
              data: filas,
              headerStyle: pw.TextStyle(
                  fontSize: 8,
                  fontWeight: pw.FontWeight.bold,
                  color: PdfColors.white),
              headerDecoration: pw.BoxDecoration(color: verde),
              cellStyle: const pw.TextStyle(fontSize: 8),
              cellAlignments: {
                for (var i = 3; i <= 5; i++) i: pw.Alignment.center,
              },
              columnWidths: {
                0: const pw.FlexColumnWidth(1.2),
                1: const pw.FlexColumnWidth(1.4),
                2: const pw.FlexColumnWidth(1.4),
                3: const pw.FlexColumnWidth(0.7),
                4: const pw.FlexColumnWidth(0.7),
                5: const pw.FlexColumnWidth(0.7),
                6: const pw.FlexColumnWidth(1),
                7: const pw.FlexColumnWidth(4),
              },
              oddRowDecoration:
                  const pw.BoxDecoration(color: PdfColors.grey100),
            ),
        ],
      ),
    );
    return doc.save();
  }

  /// Texto de justificación para la tabla del informe: acciones de manejo,
  /// causa de fracaso y observaciones relevantes.
  static String justificacionConservacion(NidoGrefaModel n) {
    final partes = <String>[];
    if (n.intervencion) {
      final tipos = n.tipoAccionesManejo.isEmpty
          ? 'sin especificar'
          : n.tipoAccionesManejo.join(', ');
      partes.add('Intervención de conservación ($tipos)');
    }
    if (n.estadoReproductivo == EstadoReproductivo.fracaso) {
      final causa = (n.causasFracaso ?? '').isEmpty ? 'causa no indicada' : n.causasFracaso!;
      final estado = (n.estadoFracaso ?? '').isEmpty ? '' : ' (${n.estadoFracaso})';
      partes.add('Fracaso$estado: $causa');
    }
    final obs = (n.observacionesI ?? '').trim();
    if (obs.isNotEmpty) {
      partes.add(obs.length > 140 ? '${obs.substring(0, 137)}...' : obs);
    }
    return partes.isEmpty ? '-' : partes.join('. ');
  }

  // ── Archivos ─────────────────────────────────────────────────────────────

  /// Escribe los bytes en el directorio temporal (para compartir).
  Future<File> guardarTemporal(Uint8List bytes, String nombre) async {
    final dir = await getTemporaryDirectory();
    final file = File(p.join(dir.path, nombre));
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  /// Guarda en un directorio persistente de la app (almacenamiento local).
  Future<File> guardarEnApp(Uint8List bytes, String nombre) async {
    final base = await appDataDirectory();
    final dir = Directory(p.join(base.path, 'aguiluchos_exportaciones'));
    if (!await dir.exists()) await dir.create(recursive: true);
    final file = File(p.join(dir.path, nombre));
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  static String nombreArchivo(String prefijo, String ext, [DateTime? now]) =>
      '${prefijo}_${DateFormat('yyyyMMdd_HHmm').format(now ?? DateTime.now())}.$ext';
}
