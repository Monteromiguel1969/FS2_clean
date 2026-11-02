import 'package:aguiluchos/models/nido_constants.dart';
import 'package:aguiluchos/models/nido_filter.dart';
import 'package:aguiluchos/services/database_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';

void main() {
  late FakeClock clock;
  late DatabaseService db;

  setUp(() async {
    clock = FakeClock();
    db = await openTestDb(clock);
  });

  tearDown(() => db.close());

  test('guardar inserta, marca isSynced=false y fija updatedAt', () async {
    final n = nidoDeEjemplo(updatedAt: DateTime.utc(2000))..isSynced = true;
    await db.guardar(n);
    final leido = (await db.obtener(n.id))!;
    expect(leido.isSynced, isFalse);
    expect(leido.updatedAt, clock());
    expect(leido.etiqueta, 'N-001');
  });

  test('editar actualiza el registro y refresca updatedAt', () async {
    final n = nidoDeEjemplo();
    await db.guardar(n);
    await db.marcarSincronizado(n.id, n.updatedAt);
    expect((await db.obtener(n.id))!.isSynced, isTrue);

    clock.advance(const Duration(minutes: 5));
    final editado = (await db.obtener(n.id))!..etiqueta = 'N-001-bis';
    await db.editar(editado);

    final leido = (await db.obtener(n.id))!;
    expect(leido.etiqueta, 'N-001-bis');
    expect(leido.isSynced, isFalse);
    expect(leido.updatedAt, clock());
    expect((await db.consultar()).length, 1);
  });

  test('guardar limpia hasConflict', () async {
    final n = nidoDeEjemplo()..hasConflict = true;
    await db.guardar(n);
    expect((await db.obtener(n.id))!.hasConflict, isFalse);
  });

  test('persiste listas, fechas y booleanos', () async {
    final n = nidoDeEjemplo()
      ..tipoAccionesManejo = ['Dron', 'Rodal']
      ..intervencion = true
      ..fechaIncubacion = DateTime(2026, 5, 1)
      ..localImagePaths = ['/a/seguimiento_1.jpg']
      ..remoteImageUrls = ['https://x/cosecha_2.jpg'];
    await db.guardar(n);
    final l = (await db.obtener(n.id))!;
    expect(l.tipoAccionesManejo, ['Dron', 'Rodal']);
    expect(l.intervencion, isTrue);
    expect(l.fechaIncubacion, DateTime(2026, 5, 1));
    expect(l.localImagePaths, ['/a/seguimiento_1.jpg']);
    expect(l.remoteImageUrls, ['https://x/cosecha_2.jpg']);
  });

  group('consultar con filtros', () {
    setUp(() async {
      Future<void> add(String et, String mun, String? res, {String? prop, DateTime? entrada}) async {
        final n = nidoDeEjemplo(etiqueta: et, municipio: mun)
          ..resultadoReproductivo = res
          ..propietario = prop
          ..fechaEntradaNido = entrada;
        await db.guardar(n);
        clock.advance(const Duration(seconds: 1));
      }

      await add('A-1', 'Villalba', 'Éxito', prop: 'María Álvarez', entrada: DateTime(2026, 5, 10));
      await add('A-2', 'Villalba', 'Fracaso', prop: 'Pedro', entrada: DateTime(2026, 6, 10));
      await add('B-1', 'Toledo', null, prop: 'Ángela', entrada: DateTime(2026, 7, 10));
      await add('B-2', 'Segovia', '', prop: 'Luis');
    });

    Future<List<String>> et(NidoFilter f) async =>
        (await db.consultar(f)).map((n) => n.etiqueta!).toList();

    test('sin filtros devuelve todos, más recientes primero', () async {
      expect(await et(const NidoFilter()), ['B-2', 'B-1', 'A-2', 'A-1']);
    });

    test('por municipio (uno o varios)', () async {
      expect(await et(const NidoFilter(municipios: {'Villalba'})), ['A-2', 'A-1']);
      expect(
          (await et(const NidoFilter(municipios: {'Toledo', 'Segovia'}))).toSet(),
          {'B-1', 'B-2'});
    });

    test('por estado reproductivo', () async {
      expect(await et(const NidoFilter(estado: EstadoReproductivo.exito)), ['A-1']);
      expect(await et(const NidoFilter(estado: EstadoReproductivo.fracaso)), ['A-2']);
      expect(await et(const NidoFilter(estado: EstadoReproductivo.enCurso)), ['B-2', 'B-1']);
    });

    test('búsqueda libre en etiqueta y propietario, sin distinguir mayúsculas/acentos de caja', () async {
      expect(await et(const NidoFilter(query: 'b-1')), ['B-1']);
      expect(await et(const NidoFilter(query: 'ÁLVAREZ')), ['A-1']);
      expect(await et(const NidoFilter(query: 'ángela')), ['B-1']);
      expect(await et(const NidoFilter(query: 'zzz')), isEmpty);
    });

    test('por rango de fechas de campaña', () async {
      final f = NidoFilter(
          fechaDesde: DateTime(2026, 6, 1), fechaHasta: DateTime(2026, 7, 31));
      expect(await et(f), ['B-1', 'A-2']);
    });

    test('filtros combinados', () async {
      expect(
          await et(const NidoFilter(
              municipios: {'Villalba'}, estado: EstadoReproductivo.fracaso)),
          ['A-2']);
    });

    test('municipios() devuelve los distintos ordenados', () async {
      expect(await db.municipios(), ['Segovia', 'Toledo', 'Villalba']);
    });
  });

  test('borrar es lógico, pendiente de sync, y purgar lo elimina', () async {
    final n = nidoDeEjemplo();
    await db.guardar(n);
    await db.marcarSincronizado(n.id, n.updatedAt);
    clock.advance(const Duration(minutes: 1));

    await db.borrar(n.id);
    expect(await db.consultar(), isEmpty);
    expect(await db.obtener(n.id), isNull);
    final tombstone = (await db.obtener(n.id, incluirBorrados: true))!;
    expect(tombstone.isDeleted, isTrue);
    expect(tombstone.isSynced, isFalse);
    expect(await db.contarPendientes(), 1);

    await db.purgar(n.id);
    expect(await db.obtener(n.id, incluirBorrados: true), isNull);
    expect(await db.contarPendientes(), 0);
  });

  test('marcarSincronizado no pisa ediciones hechas durante la subida', () async {
    final n = nidoDeEjemplo();
    await db.guardar(n);
    final subido = n.updatedAt;
    clock.advance(const Duration(seconds: 30));
    await db.guardar((await db.obtener(n.id))!..etiqueta = 'editado');

    expect(await db.marcarSincronizado(n.id, subido), isFalse);
    expect((await db.obtener(n.id))!.isSynced, isFalse);
  });

  test('aplicarRemoto guarda como sincronizado y conserva fotos locales', () async {
    final local = nidoDeEjemplo()..localImagePaths = ['/a/cosecha_1.jpg'];
    await db.guardar(local);
    final remoto = nidoDeEjemplo(id: local.id, etiqueta: 'REMOTO', updatedAt: DateTime.utc(2030));
    await db.aplicarRemoto(remoto, conflicto: true);
    final l = (await db.obtener(local.id))!;
    expect(l.etiqueta, 'REMOTO');
    expect(l.isSynced, isTrue);
    expect(l.hasConflict, isTrue);
    expect(l.updatedAt, DateTime.utc(2030));
    expect(l.localImagePaths, ['/a/cosecha_1.jpg']);
  });

  test('meta clave/valor', () async {
    expect(await db.leerMeta('k'), isNull);
    await db.escribirMeta('k', 'v1');
    await db.escribirMeta('k', 'v2');
    expect(await db.leerMeta('k'), 'v2');
  });

  test('changes emite al guardar', () async {
    var eventos = 0;
    final sub = db.changes.listen((_) => eventos++);
    await db.guardar(nidoDeEjemplo());
    await Future<void>.delayed(Duration.zero);
    expect(eventos, 1);
    await sub.cancel();
  });
}
