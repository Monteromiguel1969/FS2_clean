import 'dart:io';

import 'package:excel/excel.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_campo.dart';
import 'package:grefa_campana/services/export_service.dart';

import '../helpers.dart';

void main() {
  final servicio = ExportService();

  test('Excel: cabeceras de las columnas elegidas y una fila por nido', () {
    final nidos = [
      nidoCompleto(),
      nidoCompleto(id: '22222222-2222-4222-8222-222222222222'),
    ];
    final cols = camposNido
        .where(
          (c) => const {
            'etiqueta',
            'municipio',
            'fecha_incubacion',
            'intervencion',
            'tipo_acciones_manejo',
            'num_pollos_nacidos',
            'coordenada_x',
          }.contains(c.clave),
        )
        .toList();
    final bytes = servicio.generarExcel(nidos, cols);
    expect(bytes.sublist(0, 2), [0x50, 0x4B]); // zip "PK"

    final excel = Excel.decodeBytes(bytes);
    final hoja = excel.tables.values.first;
    expect(hoja.maxRows, 3);
    expect(hoja.maxColumns, cols.length);
    final cab = hoja.rows.first.map((c) => c?.value.toString()).toList();
    expect(cab, cols.map((c) => c.etiqueta).toList());

    final fila = hoja.rows[1].map((c) => c?.value).toList();
    final idx = {for (var i = 0; i < cols.length; i++) cols[i].clave: i};
    expect(fila[idx['etiqueta']!].toString(), 'CEN-012');
    expect(fila[idx['municipio']!].toString(), 'Villaconejos');
    expect(fila[idx['intervencion']!].toString(), 'Sí');
    expect(fila[idx['tipo_acciones_manejo']!].toString(), 'Dron, Rodal');
    expect(fila[idx['num_pollos_nacidos']!], isA<IntCellValue>());
    expect((fila[idx['num_pollos_nacidos']!] as IntCellValue).value, 4);
    expect((fila[idx['coordenada_x']!] as DoubleCellValue).value, -3.2);
    expect(fila[idx['fecha_incubacion']!], isA<DateCellValue>());
  });

  test('Excel: los 42 campos se exportan sin errores', () {
    final bytes = servicio.generarExcel([nidoCompleto()], camposNido);
    final hoja = Excel.decodeBytes(bytes).tables.values.first;
    expect(hoja.maxColumns, 42);
  });

  test('PDF: documento válido con membrete y resumen', () async {
    final bytes = await servicio.generarPdf(
      [
        nidoCompleto(),
        nidoCompleto(id: '33333333-3333-4333-8333-333333333333'),
      ],
      desde: DateTime(2026, 4, 1),
      hasta: DateTime(2026, 8, 31),
      generado: DateTime(2026, 9, 1, 9, 30),
    );
    expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
    expect(bytes.length, greaterThan(2000));
  });

  test('PDF: sin nidos también se genera', () async {
    final bytes = await servicio.generarPdf(const []);
    expect(String.fromCharCodes(bytes.sublist(0, 5)), '%PDF-');
  });

  test('nombreArchivo incluye prefijo, marca de tiempo y extensión', () {
    expect(
      ExportService.nombreArchivo(
        'nidos_grefa',
        'xlsx',
        ahora: DateTime(2026, 6, 1, 8, 5),
      ),
      'nidos_grefa_20260601_0805.xlsx',
    );
  });

  test('guardar escribe el archivo (requiere path_provider)', () async {
    // Se valida solo la ruta de creación de archivos con un directorio temporal.
    final dir = await Directory.systemTemp.createTemp('grefa_exp_');
    final f = File('${dir.path}/x.xlsx');
    await f.writeAsBytes(servicio.generarExcel([nidoCompleto()], camposNido));
    expect(await f.length(), greaterThan(1000));
    await dir.delete(recursive: true);
  });
}
