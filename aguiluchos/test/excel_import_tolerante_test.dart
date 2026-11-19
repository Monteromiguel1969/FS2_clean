import 'dart:typed_data';

import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/services/database_service.dart';
import 'package:aguiluchos/services/excel_import_service.dart';
import 'package:excel/excel.dart' as xl;
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';

xl.CellValue? _c(Object? v) => switch (v) {
      null => null,
      int i => xl.IntCellValue(i),
      double d => xl.DoubleCellValue(d),
      _ => xl.TextCellValue(v.toString()),
    };

Uint8List _libro(List<String> cabecera, List<List<Object?>> filas) {
  final book = xl.Excel.createExcel();
  final sheet = book[book.getDefaultSheet()!];
  sheet.appendRow([for (final h in cabecera) xl.TextCellValue(h)]);
  for (final f in filas) {
    sheet.appendRow([for (final v in f) _c(v)]);
  }
  return Uint8List.fromList(book.save()!);
}

void main() {
  late DatabaseService db;
  late ExcelImportService svc;

  setUp(() async {
    db = await openTestDb(FakeClock());
    svc = ExcelImportService(idsPorCampana: true);
  });
  tearDown(() => db.close());

  group('cabeceras', () {
    test('Año y Ano se leen como campaña', () {
      for (final h in ['Año', 'Ano', 'ANYO', 'Temporada']) {
        final r = svc.parse(_libro(['Etiqueta', h], [['P1', 2025]]));
        expect(r.nidos.single.campana, '2025', reason: h);
        expect(r.columnasNoReconocidas, isEmpty, reason: h);
      }
    });

    test('si hay Campaña y Año, gana Campaña y Año se ignora', () {
      final r = svc.parse(_libro(
        ['Etiqueta', 'Año', 'Campaña'],
        [['P1', 2020, '2026']],
      ));
      expect(r.nidos.single.campana, '2026');
      expect(r.columnasNoReconocidas, ['Año']);
    });

    test('Campaña gana aunque aparezca antes que Año o con otra grafía', () {
      final r = svc.parse(_libro(
        ['Etiqueta', 'CAMPANA', 'ano'],
        [['P1', '2027', 1999]],
      ));
      expect(r.nidos.single.campana, '2027');
    });

    test('cabeceras con ruido (espacios, invisibles, plural, erratas)', () {
      final r = svc.parse(_libro(
        ['\u200BEtiqueta ', 'Campañas', 'Proyecto:', 'Municpio'],
        [['P1', '2026', 'LIFE', 'Toledo']],
      ));
      final n = r.nidos.single;
      expect(n.etiqueta, 'P1');
      expect(n.campana, '2026');
      expect(n.proyecto, 'LIFE');
      expect(n.municipio, 'Toledo');
    });

    test('sin Etiqueta ni Numeración no se importa', () {
      expect(() => svc.parse(_libro(['Municipio'], [['x']])), throwsFormatException);
    });

    test('proyecto y campaña son campos distintos', () {
      final r = svc.parse(_libro(
        ['Etiqueta', 'Proyecto', 'Campaña'],
        [['P1', 'LIFE', '2026']],
      ));
      expect(r.nidos.single.proyecto, 'LIFE');
      expect(r.nidos.single.campana, '2026');
    });
  });

  group('importación tolerante', () {
    Future<NidoGrefaModel> existente() async {
      final n = NidoGrefaModel(id: 'e-5')
        ..numeracion = '5'
        ..etiqueta = 'P5'
        ..proyecto = 'LIFE'
        ..campana = '2026'
        ..municipio = 'Madrid'
        ..provincia = 'Madrid'
        ..especie = 'Aguilucho cenizo'
        ..numPollosNacidos = 4
        ..observacionesI = 'nota de campo';
      await db.guardar(n);
      return n;
    }

    test('columnas que faltan y celdas vacías no machacan datos', () async {
      final n = await existente();
      final rep = await svc.importarTolerante(
        db,
        _libro(
          ['Numeración', 'Municipio', 'Nº pollos nacidos', 'Observaciones I'],
          [
            [5, null, 3, '   '],
          ],
        ),
      );
      expect(rep.nuevos, 0);
      expect(rep.actualizados, 1);
      final l = (await db.obtener(n.id))!;
      expect(l.municipio, 'Madrid', reason: 'celda vacía no pisa');
      expect(l.especie, 'Aguilucho cenizo', reason: 'columna ausente no pisa');
      expect(l.observacionesI, 'nota de campo', reason: 'celda en blanco no pisa');
      expect(l.proyecto, 'LIFE');
      expect(l.campana, '2026');
      expect(l.numPollosNacidos, 3, reason: 'la celda con dato sí actualiza');
      expect(rep.columnasQueFaltan, contains('Especie'));
      expect(rep.columnasQueFaltan, isNot(contains('Municipio')));
    });

    test('un fichero con solo la clave no cambia nada', () async {
      await existente();
      final rep = await svc.importarTolerante(db, _libro(['Etiqueta'], [['P5']]));
      expect(rep.actualizados, 0);
      expect(rep.sinCambios, 1);
      expect(rep.nuevos, 0);
      expect((await db.consultar()).length, 1);
    });

    test('importar dos veces el mismo fichero es idempotente', () async {
      final datos = _libro(['Etiqueta', 'Año', 'Municipio'], [['N1', 2026, 'Toledo']]);
      final a = await svc.importarTolerante(db, datos);
      expect(a.nuevos, 1);
      final b = await svc.importarTolerante(db, datos);
      expect(b.nuevos, 0);
      expect(b.sinCambios, 1);
      expect((await db.consultar()).single.campana, '2026');
    });

    test('un existente sin campaña la recibe del fichero; otra campaña crea un nido nuevo', () async {
      final n = await existente()
        ..campana = null;
      await db.editar(n);
      final r1 = await svc.importarTolerante(
          db, _libro(['Numeración', 'Campaña'], [[5, '2026']]));
      expect(r1.nuevos, 0);
      expect((await db.obtener(n.id))!.campana, '2026');

      final r2 = await svc.importarTolerante(
          db, _libro(['Numeración', 'Campaña'], [[5, '2025']]));
      expect(r2.nuevos, 1, reason: 'mismo nº pero otra campaña = otro nido');
      final todos = await db.consultar();
      expect(todos.map((e) => e.campana).toSet(), {'2026', '2025'});
    });

    test('los ids nuevos dependen de la campaña (como en el panel)', () async {
      await svc.importarTolerante(
          db, _libro(['Numeración', 'Campaña'], [[7, '2025'], [7, '2026']]));
      final todos = await db.consultar();
      expect(todos.length, 2);
      expect(todos.map((e) => e.id).toSet().length, 2);
    });

    test('filas con el mismo nido repetidas en el fichero se fusionan', () async {
      final rep = await svc.importarTolerante(
        db,
        _libro(['Etiqueta', 'Municipio', 'Especie'],
            [['Z1', 'Toledo', null], ['Z1', null, 'Aguilucho cenizo']]),
      );
      expect(rep.nuevos, 1);
      final n = (await db.consultar()).single;
      expect(n.municipio, 'Toledo');
      expect(n.especie, 'Aguilucho cenizo');
    });

    test('informa de la cabecera usada como campaña', () async {
      final rep = await svc.importarTolerante(db, _libro(['Etiqueta', 'Año'], [['A', 2024]]));
      expect(rep.traeCampana, isTrue);
      expect(rep.cabecerasReconocidas.any((c) => c.cabecera == 'Año' && c.campo == 'campana'),
          isTrue);
    });

    test('sin columna de campaña los nidos nuevos quedan sin campaña', () async {
      final rep = await svc.importarTolerante(db, _libro(['Etiqueta'], [['Q1']]));
      expect(rep.traeCampana, isFalse);
      expect((await db.consultar()).single.campana, isNull);
    });
  });
}
