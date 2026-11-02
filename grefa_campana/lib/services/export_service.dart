import 'dart:io';
import 'dart:typed_data';

import 'package:excel/excel.dart';
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';

import '../logic/exportacion.dart';
import '../logic/texto.dart';
import '../models/nido_campo.dart';
import '../models/nido_grefa_model.dart';
import 'directorios.dart';

/// Generación de Excel y PDF, y guardado/compartido de los archivos.
class ExportService {
  static final DateFormat _fmtFecha = DateFormat('dd/MM/yyyy');

  // ---------------------------------------------------------------- Excel

  /// Libro Excel con una fila por nido y las [columnas] indicadas.
  Uint8List generarExcel(List<NidoGrefaModel> nidos, List<NidoCampo> columnas) {
    final excel = Excel.createExcel();
    const hoja = 'Nidos GREFA';
    final porDefecto = excel.getDefaultSheet();
    if (porDefecto != null && porDefecto != hoja) {
      excel.rename(porDefecto, hoja);
    }

    final estiloCab = CellStyle(
      bold: true,
      backgroundColorHex: ExcelColor.fromHexString('#FFD7E8D0'),
    );
    final estiloFecha = CellStyle(numberFormat: NumFormat.defaultDate);

    for (var c = 0; c < columnas.length; c++) {
      excel.updateCell(
        hoja,
        CellIndex.indexByColumnRow(columnIndex: c, rowIndex: 0),
        TextCellValue(columnas[c].etiqueta),
        cellStyle: estiloCab,
      );
    }
    for (var r = 0; r < nidos.length; r++) {
      for (var c = 0; c < columnas.length; c++) {
        final valor = _celda(columnas[c], nidos[r]);
        if (valor == null) continue;
        excel.updateCell(
          hoja,
          CellIndex.indexByColumnRow(columnIndex: c, rowIndex: r + 1),
          valor,
          cellStyle: valor is DateCellValue ? estiloFecha : null,
        );
      }
    }
    final bytes = excel.encode();
    if (bytes == null) throw StateError('No se pudo generar el Excel');
    return Uint8List.fromList(bytes);
  }

  CellValue? _celda(NidoCampo c, NidoGrefaModel n) {
    final v = c.leer(n);
    if (v == null) return null;
    return switch (c.tipo) {
      TipoCampo.texto =>
        v.toString().isEmpty ? null : TextCellValue(v.toString()),
      TipoCampo.entero => IntCellValue(v as int),
      TipoCampo.decimal => DoubleCellValue(v as double),
      TipoCampo.fecha => DateCellValue.fromDateTime(v as DateTime),
      TipoCampo.booleano => TextCellValue((v as bool) ? 'Sí' : 'No'),
      TipoCampo.lista =>
        (v as List<String>).isEmpty ? null : TextCellValue(v.join(', ')),
    };
  }

  // ------------------------------------------------------------------ PDF

  /// Informe PDF: membrete GREFA, resumen ejecutivo y tabla de nidos con su
  /// justificación de conservación.
  Future<Uint8List> generarPdf(
    List<NidoGrefaModel> nidos, {
    DateTime? desde,
    DateTime? hasta,
    DateTime? generado,
  }) async {
    final resumen = ResumenEjecutivo.de(nidos);
    final ahora = generado ?? DateTime.now();
    final verde = PdfColor.fromHex('#2E6B3A');
    final claro = PdfColor.fromHex('#E8F0E4');

    final doc = pw.Document(title: 'Informe de campaña GREFA', author: 'GREFA');

    String rango() {
      if (desde == null && hasta == null) return 'Toda la campaña';
      return '${desde == null ? '...' : _fmtFecha.format(desde)} - '
          '${hasta == null ? '...' : _fmtFecha.format(hasta)}';
    }

    pw.Widget membrete() => pw.Container(
      padding: const pw.EdgeInsets.only(bottom: 8),
      decoration: pw.BoxDecoration(
        border: pw.Border(bottom: pw.BorderSide(color: verde, width: 2)),
      ),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          pw.Container(
            width: 44,
            height: 44,
            alignment: pw.Alignment.center,
            decoration: pw.BoxDecoration(
              color: verde,
              shape: pw.BoxShape.circle,
            ),
            child: pw.Text(
              'G',
              style: pw.TextStyle(
                color: PdfColors.white,
                fontSize: 24,
                fontWeight: pw.FontWeight.bold,
              ),
            ),
          ),
          pw.SizedBox(width: 12),
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'GREFA',
                  style: pw.TextStyle(
                    fontSize: 20,
                    fontWeight: pw.FontWeight.bold,
                    color: verde,
                  ),
                ),
                pw.Text(
                  'Grupo de Rehabilitación de la Fauna Autóctona y su Hábitat',
                  style: const pw.TextStyle(fontSize: 9),
                ),
              ],
            ),
          ),
          pw.Text(
            'Campaña Aguilucho Cenizo y Pálido',
            style: const pw.TextStyle(fontSize: 9),
          ),
        ],
      ),
    );

    pw.Widget kpi(String titulo, String valor) => pw.Expanded(
      child: pw.Container(
        margin: const pw.EdgeInsets.only(right: 6),
        padding: const pw.EdgeInsets.all(8),
        decoration: pw.BoxDecoration(
          color: claro,
          borderRadius: pw.BorderRadius.circular(4),
        ),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(titulo, style: const pw.TextStyle(fontSize: 8)),
            pw.SizedBox(height: 2),
            pw.Text(
              valor,
              style: pw.TextStyle(
                fontSize: 16,
                fontWeight: pw.FontWeight.bold,
                color: verde,
              ),
            ),
          ],
        ),
      ),
    );

    String pct(double? v) => v == null ? 's/d' : '${v.toStringAsFixed(1)} %';

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4.landscape,
        margin: const pw.EdgeInsets.all(28),
        header: (_) => membrete(),
        footer: (ctx) => pw.Container(
          alignment: pw.Alignment.centerRight,
          child: pw.Text(
            'Generado el ${DateFormat('dd/MM/yyyy HH:mm').format(ahora)} · '
            'Página ${ctx.pageNumber} de ${ctx.pagesCount}',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
          ),
        ),
        build: (ctx) => [
          pw.SizedBox(height: 10),
          pw.Text(
            'Informe de seguimiento reproductor',
            style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold),
          ),
          pw.Text(
            'Periodo: ${rango()}',
            style: const pw.TextStyle(fontSize: 10),
          ),
          pw.SizedBox(height: 10),
          pw.Text(
            'Resumen ejecutivo',
            style: pw.TextStyle(
              fontSize: 12,
              fontWeight: pw.FontWeight.bold,
              color: verde,
            ),
          ),
          pw.SizedBox(height: 4),
          pw.Row(
            children: [
              kpi('Nidos', '${resumen.totalNidos}'),
              kpi('Pollos nacidos', '${resumen.pollosNacidos}'),
              kpi('Pollos volados', '${resumen.pollosVolados}'),
              kpi('Pollos muertos', '${resumen.pollosMuertos}'),
              kpi('Tasa de éxito', pct(resumen.tasaExito)),
            ],
          ),
          pw.SizedBox(height: 4),
          pw.Text(
            'Éxito: ${resumen.nidosExito} · Fracaso: ${resumen.nidosFracaso} · '
            'En curso: ${resumen.nidosEnCurso} · Productividad: '
            '${resumen.productividad?.toStringAsFixed(2) ?? 's/d'} pollos volados/nido.',
            style: const pw.TextStyle(fontSize: 9),
          ),
          pw.SizedBox(height: 12),
          pw.Text(
            'Nidos seleccionados y justificación de conservación',
            style: pw.TextStyle(
              fontSize: 12,
              fontWeight: pw.FontWeight.bold,
              color: verde,
            ),
          ),
          pw.SizedBox(height: 4),
          if (nidos.isEmpty)
            pw.Text('No hay nidos que cumplan los filtros seleccionados.')
          else
            pw.TableHelper.fromTextArray(
              headerStyle: pw.TextStyle(
                fontSize: 8,
                fontWeight: pw.FontWeight.bold,
                color: PdfColors.white,
              ),
              headerDecoration: pw.BoxDecoration(color: verde),
              cellStyle: const pw.TextStyle(fontSize: 7.5),
              cellAlignment: pw.Alignment.topLeft,
              columnWidths: {
                0: const pw.FlexColumnWidth(1.2),
                1: const pw.FlexColumnWidth(1.4),
                2: const pw.FlexColumnWidth(1.4),
                3: const pw.FlexColumnWidth(0.9),
                4: const pw.FlexColumnWidth(0.6),
                5: const pw.FlexColumnWidth(0.6),
                6: const pw.FlexColumnWidth(0.6),
                7: const pw.FlexColumnWidth(5),
              },
              headers: const [
                'Etiqueta',
                'Municipio',
                'Especie',
                'Resultado',
                'Nac.',
                'Vol.',
                'Muer.',
                'Justificación de conservación',
              ],
              data: [
                for (final n in nidos)
                  [
                    n.titulo,
                    _lugar(n),
                    n.especie ?? '',
                    n.estadoReproductivo.etiqueta,
                    '${n.numPollosNacidos ?? 0}',
                    '${n.numPollosVolados ?? 0}',
                    '${n.numPollosMuertos ?? 0}',
                    generarJustificacion(n),
                  ],
              ],
            ),
        ],
      ),
    );
    return doc.save();
  }

  /// "Municipio, Provincia" sin repetir cuando ambos coinciden.
  static String _lugar(NidoGrefaModel n) {
    final m = (n.municipio ?? '').trim();
    final p = (n.provincia ?? '').trim();
    if (p.isEmpty || normalizarTexto(p) == normalizarTexto(m)) return m;
    return m.isEmpty ? p : '$m, $p';
  }

  // --------------------------------------------------- Guardar / compartir

  /// Guarda [bytes] en `Documentos/GREFA_exportaciones` y devuelve el archivo.
  Future<File> guardar(Uint8List bytes, String nombre) async {
    final base = await directorioDocumentos();
    final dir = Directory(p.join(base.path, 'GREFA_exportaciones'));
    await dir.create(recursive: true);
    final f = File(p.join(dir.path, nombre));
    await f.writeAsBytes(bytes, flush: true);
    return f;
  }

  /// Abre el diálogo de compartir del sistema. En Linux de escritorio
  /// `share_plus` no soporta archivos: se devuelve `false`.
  Future<bool> compartir(File archivo, {String? texto}) async {
    if (Platform.isLinux) return false;
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(archivo.path)],
        text: texto,
        subject: 'GREFA - ${p.basename(archivo.path)}',
      ),
    );
    return true;
  }

  static String nombreArchivo(
    String prefijo,
    String extension, {
    DateTime? ahora,
  }) {
    final t = DateFormat('yyyyMMdd_HHmm').format(ahora ?? DateTime.now());
    return '${prefijo}_$t.$extension';
  }
}
