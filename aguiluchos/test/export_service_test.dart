import 'package:aguiluchos/models/nido_constants.dart';
import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/services/export_service.dart';
import 'package:excel/excel.dart' as xl;
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';

List<NidoGrefaModel> muestra() => [
      nidoDeEjemplo(etiqueta: 'A-1')
        ..numPollosNacidos = 4
        ..pollosVoladosPrecosecha = 3
        ..pollosMuertosCosecha = 1
        ..resultadoReproductivo = ResultadoReproductivo.exito
        ..intervencion = true
        ..tipoAccionesManejo = ['Dron']
        ..fechaIncubacion = DateTime(2026, 5, 1)
        ..recalcularTotales(),
      nidoDeEjemplo(etiqueta: 'A-2')
        ..numPollosNacidos = 3
        ..pollosMuertosPrecosecha = 3
        ..resultadoReproductivo = ResultadoReproductivo.fracaso
        ..causasFracaso = 'Depredación'
        ..estadoFracaso = 'Total'
        ..recalcularTotales(),
      nidoDeEjemplo(etiqueta: 'A-3'),
    ];

void main() {
  final export = ExportService();

  test('Excel: solo las columnas elegidas, con cabeceras y tipos', () {
    final cols = [
      nidoColumnByKey('etiqueta'),
      nidoColumnByKey('num_pollos_nacidos'),
      nidoColumnByKey('intervencion'),
      nidoColumnByKey('fecha_incubacion'),
    ];
    final bytes = export.generarExcel(muestra(), cols);
    final book = xl.Excel.decodeBytes(bytes);
    final sheet = book['Nidos'];

    expect(sheet.maxRows, 4);
    expect(sheet.maxColumns, 4);
    expect(sheet.row(0).map((c) => c?.value.toString()).toList(),
        ['Etiqueta', 'Nº pollos nacidos', 'Intervención', 'Fecha de incubación']);
    expect(sheet.row(1)[0]?.value.toString(), 'A-1');
    expect(sheet.row(1)[1]?.value, isA<xl.IntCellValue>());
    expect((sheet.row(1)[1]?.value as xl.IntCellValue).value, 4);
    expect(sheet.row(1)[2]?.value.toString(), 'Sí');
    expect(sheet.row(1)[3]?.value, isA<xl.DateCellValue>());
    expect(sheet.row(3)[1]?.value, isNull);
  });

  test('Excel con las 42 columnas', () {
    final bytes = export.generarExcel(muestra(), nidoColumns);
    final sheet = xl.Excel.decodeBytes(bytes)['Nidos'];
    expect(sheet.maxColumns, 42);
    expect(sheet.maxRows, 4);
  });

  test('resumen de campaña: totales y tasas', () {
    final r = ResumenCampana(muestra());
    expect(r.totalNidos, 3);
    expect(r.exitos, 1);
    expect(r.fracasos, 1);
    expect(r.enCurso, 1);
    expect(r.pollosNacidos, 7);
    expect(r.pollosVolados, 3);
    expect(r.pollosMuertos, 4);
    expect(r.intervenciones, 1);
    expect(r.tasaExito, 0.5);
    expect(r.productividad, 1.5);
    expect(r.causas, {'Depredación': 1});
  });

  test('justificación de conservación', () {
    final n = muestra();
    expect(ExportService.justificacionConservacion(n[0]),
        contains('Intervención de conservación (Dron)'));
    expect(ExportService.justificacionConservacion(n[1]),
        'Fracaso (Total): Depredación');
    expect(ExportService.justificacionConservacion(n[2]), '-');
  });

  test('PDF: genera un documento válido', () async {
    final bytes = await export.generarPdf(muestra(),
        descripcionFiltros: 'estado: Éxito', generadoEn: DateTime(2026, 6, 1));
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    expect(bytes.length, greaterThan(1500));
  });

  test('PDF sin nidos también se genera', () async {
    final bytes = await export.generarPdf(const []);
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
  });

  test('nombre de archivo con marca de tiempo', () {
    expect(ExportService.nombreArchivo('x', 'pdf', DateTime(2026, 6, 1, 9, 5)),
        'x_20260601_0905.pdf');
  });
}
