import 'dart:io';
import 'dart:typed_data';

import 'package:aguiluchos/models/nido_constants.dart';
import 'package:aguiluchos/services/excel_import_service.dart';
import 'package:excel/excel.dart' as xl;
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';

const _cabecera = [
  'Numeración', 'Etiqueta', 'Proyecto', 'Propietario ', 'Tlfn',
  'Localizaciones google maps', 'Municipio ', 'Provincia', 'Referencia catastral',
  'Especie', 'Territorio', 'Coordenada x', 'Coordenada Y', 'Estado final',
  'Sustrato', 'Fecha incubación', 'Fecha de eclosión (30 dias)',
  'Nº huevos (al entrar nido)', 'Nº huevos no eclosionados', 'Nº pollos nacidos',
  'Edad (dias)', 'Tamaño puesta', 'Fecha entrada nido', 'Nº pollos volados',
  'Vuelan pollos', 'Fecha de vuelo (33 dias)', 'Fecha cosecha',
  'Pollos volados pre-cosecha', 'Pollos volados post-cosecha', 'Nº pollos muertos',
  'Pollos muertos pre-cosecha ', 'Pollos muertos durante la cosecha',
  'Pollos muertos post-cosecha ', 'Resultado reproductivo', 'Causas fracaso',
  'Estado-Fracaso', 'Intervención', 'Tipo de acciones y/o manejo',
  'Observaciones I', 'Observaciones II', 'Anillas PVC', 'Anillas metalica',
];

xl.CellValue? _c(Object? v) => switch (v) {
      null => null,
      int i => xl.IntCellValue(i),
      double d => xl.DoubleCellValue(d),
      DateTime d => xl.DateCellValue(year: d.year, month: d.month, day: d.day),
      _ => xl.TextCellValue(v.toString()),
    };

Uint8List libro(List<List<Object?>> filas, {List<String> cabecera = _cabecera}) {
  final book = xl.Excel.createExcel();
  final sheet = book[book.getDefaultSheet()!];
  sheet.appendRow([for (final h in cabecera) xl.TextCellValue(h)]);
  for (final f in filas) {
    sheet.appendRow([for (final v in f) _c(v)]);
  }
  return Uint8List.fromList(book.save()!);
}

/// Fila con los valores "sucios" típicos de la hoja real.
List<Object?> filaExito() => [
      2, 'P2', 'Compensatorias ', 'Francisco Paredes', 628206688,
      'https://maps.app.goo.gl/AWZDE7C45ywJp128A', 'Torrejón de Velasco ',
      'Madrid', '28150A014000350000HI ', 'A.Pálido', 'Seguro', 434220, 4446085,
      'Reproducción con éxito', 'Cebada', '±12/04/2026', '±12/05/2026', 0, 0, 4,
      '±21-19-17', 4, DateTime(2026, 6, 3), 1, 'si', '±25-30 /07/2026',
      DateTime(2026, 6, 17), 0, 1, 3, 0, 0, 3, 'Éxito', '—', '—', 'Si',
      'Vuelos de dron (1º 19/05/26). Rodal realizado 18 de junio. Pago por compensación',
      'obs I', 'obs II', 'BL[3TE,38E]', 'G-14606/607',
    ];

List<Object?> filaFracaso() => [
      3, 'P3', 'LIFE', '—', '—', '—', 'Sanabria', 'Zamora', 'Indet.', 'A. cenizo',
      'Probable', 678982, 4667281, 'Reproducción sin éxito', 'Indet', '--', '--',
      '—', '—', 3, '—', 4, '—', 0, 'no', '—', 'Indet.', '—', '—', '—', '—', '—',
      '—', 'Fracaso', 'Huevos infertiles', 'Pollo + huevo', 'no', '—', null, null,
      null, null,
    ];

void main() {
  final svc = ExcelImportService();

  test('limpia valores sucios y respeta las 42 columnas', () {
    final r = svc.parse(libro([filaExito()]));
    expect(r.nidos.length, 1);
    final n = r.nidos.single;
    expect(n.etiqueta, 'P2');
    expect(n.proyecto, 'Compensatorias');
    expect(n.municipio, 'Torrejón de Velasco');
    expect(n.especie, Especies.palido);
    expect(n.coordenadaX, 434220);
    expect(n.coordenadaY, 4446085);
    expect(n.fechaIncubacion, DateTime(2026, 4, 12));
    expect(n.fechaEclosion, DateTime(2026, 5, 12));
    expect(n.fechaEntradaNido, DateTime(2026, 6, 3));
    expect(n.fechaVuelo, DateTime(2026, 7, 25), reason: 'rango: primer día');
    expect(n.fechaCosecha, DateTime(2026, 6, 17));
    expect(n.edadDias, 21);
    expect(n.numPollosNacidos, 4);
    expect(n.numPollosVolados, 1);
    expect(n.pollosVoladosPostcosecha, 1);
    expect(n.numPollosMuertos, 3);
    expect(n.vuelanPollos, isTrue);
    expect(n.intervencion, isTrue);
    expect(n.tipoAccionesManejo, [TiposManejo.dron, TiposManejo.rodal, TiposManejo.compensacion]);
    expect(n.resultadoReproductivo, ResultadoReproductivo.exito);
    expect(n.estadoFinal, EstadosFinales.conExito);
    expect(n.causasFracaso, isNull);
    expect(n.tlfn, '628206688');
    expect(n.estadoReproductivo, EstadoReproductivo.exito);
    expect(n.isSynced, isFalse);
    expect(n.validar(), isEmpty);
    expect(n.advertencias(), isEmpty);
  });

  test('conserva en Observaciones II lo que no cabe en columnas', () {
    final n = svc.parse(libro([filaExito()])).nidos.single;
    expect(n.observacionesII, startsWith('obs II'));
    expect(n.observacionesII, contains('Acciones de manejo (texto original): Vuelos de dron'));
    expect(n.observacionesII, contains('fecha_incubacion'));
    expect(n.observacionesII, contains('fecha_vuelo'));
    expect(n.observacionesII, contains('edad original: ±21-19-17'));
  });

  test('marcadores "sin dato" y normalizaciones de catálogo', () {
    final n = svc.parse(libro([filaFracaso()])).nidos.single;
    expect(n.propietario, isNull);
    expect(n.googleMapsUrl, isNull);
    expect(n.referenciaCatastral, isNull);
    expect(n.especie, Especies.cenizo);
    expect(n.sustrato, isNull);
    expect(n.fechaIncubacion, isNull);
    expect(n.numHuevosEntrada, isNull);
    expect(n.numPollosNacidos, 3);
    expect(n.resultadoReproductivo, ResultadoReproductivo.fracaso);
    expect(n.causasFracaso, 'Huevos infértiles');
    expect(n.estadoFracaso, EstadosFracaso.pollosYHuevos);
    expect(n.intervencion, isFalse);
    expect(n.tipoAccionesManejo, isEmpty);
    expect(n.observacionesII, isNull);
    expect(n.coordenadaX, 678982);
    expect(n.latLon!.lon, closeTo(-6.8, 0.5), reason: 'Zamora: huso 29');
    expect(n.validar(), isEmpty);
  });

  test('resultado se deduce del estado final cuando falta', () {
    final f = filaFracaso()..[33] = 'Desconocido';
    final n = svc.parse(libro([f])).nidos.single;
    expect(n.resultadoReproductivo, ResultadoReproductivo.fracaso);
    final g = filaFracaso()
      ..[13] = 'Territorio descartado'
      ..[33] = 'territorio descartado';
    expect(svc.parse(libro([g])).nidos.single.resultadoReproductivo, isNull);
  });

  test('coordenada con un dígito de menos se descarta con aviso', () {
    final f = filaFracaso()..[12] = 466791;
    final r = svc.parse(libro([f]));
    expect(r.nidos.single.coordenadaY, isNull);
    expect(r.nidos.single.coordenadaX, isNull);
    expect(r.avisos.join(), contains('no plausibles'));
  });

  test('coordenadas como texto con espacios ("678 730")', () {
    final f = filaFracaso()
      ..[11] = '678 730'
      ..[12] = '4667690';
    final n = svc.parse(libro([f])).nidos.single;
    expect(n.coordenadaX, 678730);
    expect(n.coordenadaY, 4667690);
  });

  test('avisa de totales incoherentes sin modificarlos', () {
    final f = filaExito()..[23] = 5;
    final r = svc.parse(libro([f]));
    expect(r.nidos.single.numPollosVolados, 5);
    expect(r.avisos.join(), contains('volados pre+post'));
  });

  test('las columnas se localizan por nombre, en cualquier orden', () {
    final cab = ['Municipio', 'Etiqueta', 'Columna rara', 'Fecha de vuelo (33 dias)'];
    final r = svc.parse(libro([
      ['Toledo', 'X-1', 'zzz', '±05-10/07/2026'],
    ], cabecera: cab));
    expect(r.nidos.single.municipio, 'Toledo');
    expect(r.nidos.single.etiqueta, 'X-1');
    expect(r.nidos.single.fechaVuelo, DateTime(2026, 7, 5));
    expect(r.columnasNoReconocidas, ['Columna rara']);
  });

  test('ids deterministas: reimportar no duplica ni sobrescribe', () async {
    final clock = FakeClock();
    final db = await openTestDb(clock);
    addTearDown(db.close);
    final bytes = libro([filaExito(), filaFracaso(), List.filled(42, null)]);

    final a = await svc.importar(db, bytes);
    expect(a.nuevos, 2);
    expect(a.parse.filasOmitidas, 1);
    expect((await db.consultar()).length, 2);

    final editado = (await db.consultar()).firstWhere((n) => n.etiqueta == 'P2')
      ..municipio = 'EDITADO';
    await db.guardar(editado);

    final b = await svc.importar(db, bytes);
    expect(b.nuevos, 0);
    expect(b.yaExistentes, 2);
    expect((await db.consultar()).firstWhere((n) => n.etiqueta == 'P2').municipio, 'EDITADO');
    expect(await db.contarPendientes(), 2);
  });

  test('un Excel con otro formato lanza FormatException', () {
    expect(() => svc.parse(libro([], cabecera: ['A', 'B'])), throwsFormatException);
  });

  // Prueba opcional contra el fichero real (contiene datos personales: no se
  // versiona). Ejecutar con:
  //   AGUILUCHOS_XLSX=/ruta/DATOS_FINALES.xlsx flutter test test/excel_import_test.dart
  final real = Platform.environment['AGUILUCHOS_XLSX'];
  test('fichero real DATOS FINALES AGUILUCHO 2026', () {
    final r = svc.parse(File(real!).readAsBytesSync());
    expect(r.nidos.length, 95);
    expect(r.nidos.map((n) => n.id).toSet().length, 95);
    expect(r.columnasNoReconocidas, isEmpty);
    final conCoord = r.nidos.where((n) => n.tieneCoordenadas).toList();
    expect(conCoord.length, greaterThanOrEqualTo(90));
    for (final n in conCoord) {
      final p = n.latLon!;
      expect(p.lat, inInclusiveRange(39.5, 43.5), reason: '${n.etiqueta} ${n.coordenadaX},${n.coordenadaY}');
      expect(p.lon, inInclusiveRange(-8.6, -2.5), reason: '${n.etiqueta}');
    }
    final exitos = r.nidos.where((n) => n.estadoReproductivo == EstadoReproductivo.exito).length;
    final fracasos = r.nidos.where((n) => n.estadoReproductivo == EstadoReproductivo.fracaso).length;
    // ignore: avoid_print
    print('REAL: ${r.nidos.length} nidos, $exitos éxito, $fracasos fracaso, '
        '${conCoord.length} con coordenadas, ${r.avisos.length} avisos');
    final errores = r.nidos.where((n) => n.validar().isNotEmpty).toList();
    final avisos = r.nidos.where((n) => n.advertencias().isNotEmpty).length;
    // ignore: avoid_print
    print('Con errores de validar(): ${errores.length}; con advertencias: $avisos');
    for (final n in errores) {
      // ignore: avoid_print
      print('  ${n.numeracion} ${n.etiqueta}: ${n.validar()}');
    }
    expect(errores.length, lessThanOrEqualTo(3));
  }, skip: real == null ? 'define AGUILUCHOS_XLSX para ejecutarla' : false);
}
