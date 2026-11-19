import 'dart:io';

import 'package:aguiluchos/models/nido_filter.dart';
import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/services/database_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'helpers/fakes.dart';

NidoGrefaModel _n(String etiqueta, {String? proyecto, String? campana}) =>
    nidoDeEjemplo(etiqueta: etiqueta)
      ..proyecto = proyecto
      ..campana = campana;

void main() {
  late DatabaseService db;

  setUp(() async => db = await openTestDb(FakeClock()));
  tearDown(() => db.close());

  group('campaña como campo propio', () {
    test('toJson/fromJson la conservan y no se confunde con el proyecto', () {
      final n = _n('A', proyecto: 'LIFE', campana: '2026');
      final json = n.toJson();
      expect(json['proyecto'], 'LIFE');
      expect(json['campana'], '2026');
      final copia = NidoGrefaModel.fromJson(json);
      expect(copia.proyecto, 'LIFE');
      expect(copia.campana, '2026');
      expect(copia.remotoSinCampana, isFalse);
    });

    test('un registro de Supabase sin columna campana se marca como tal', () {
      final json = _n('A', campana: '2026').toJson()..remove('campana');
      final n = NidoGrefaModel.fromJson(json);
      expect(n.campana, isNull);
      expect(n.remotoSinCampana, isTrue);
    });

    test('toMap/fromMap (SQLite) conservan la campaña', () {
      final n = _n('A', campana: '2025-2026');
      expect(NidoGrefaModel.fromMap(n.toMap()).campana, '2025-2026');
    });
  });

  group('filtro de proyecto y campaña', () {
    setUp(() async {
      await db.guardar(_n('A', proyecto: 'LIFE', campana: '2026'));
      await db.guardar(_n('B', proyecto: 'LIFE', campana: '2025'));
      await db.guardar(_n('C', proyecto: 'USANOS', campana: '2026'));
      await db.guardar(_n('D', proyecto: 'LIFE'));
      await db.guardar(_n('E', campana: '  '));
    });

    Future<List<String>> etiquetas(NidoFilter f) async =>
        ((await db.consultar(f)).map((n) => n.etiqueta!).toList()..sort());

    test('sin filtro salen todos', () async {
      expect(await etiquetas(const NidoFilter()), ['A', 'B', 'C', 'D', 'E']);
    });

    test('por campaña', () async {
      expect(await etiquetas(const NidoFilter(campana: '2026')), ['A', 'C']);
    });

    test('por proyecto y campaña a la vez', () async {
      expect(await etiquetas(const NidoFilter(proyecto: 'LIFE', campana: '2026')), ['A']);
    });

    test('«sin campaña» recoge los nidos sin dato o en blanco', () async {
      expect(await etiquetas(const NidoFilter(campana: NidoFilter.sinValor)), ['D', 'E']);
    });

    test('«sin proyecto»', () async {
      expect(await etiquetas(const NidoFilter(proyecto: NidoFilter.sinValor)), ['E']);
    });

    test('isEmpty tiene en cuenta proyecto y campaña', () {
      expect(const NidoFilter(campana: '2026').isEmpty, isFalse);
      expect(const NidoFilter(proyecto: 'LIFE').isEmpty, isFalse);
      expect(const NidoFilter().conGeo(comunidad: 'X').campana, isNull);
      expect(const NidoFilter(campana: '2026').conGeo(comunidad: 'X').campana, '2026');
    });
  });

  group('sincronización', () {
    test('un remoto sin columna campana no borra la campaña local', () async {
      final local = _n('A', campana: '2026');
      await db.guardar(local);
      final remoto = NidoGrefaModel.fromJson(local.toJson()..remove('campana'))
        ..etiqueta = 'A-editado';
      await db.aplicarRemoto(remoto);
      final leido = (await db.obtener(local.id))!;
      expect(leido.etiqueta, 'A-editado');
      expect(leido.campana, '2026');
    });

    test('un remoto con campana la sustituye', () async {
      final local = _n('A', campana: '2026');
      await db.guardar(local);
      final remoto = NidoGrefaModel.fromJson(local.toJson()..['campana'] = '2027');
      await db.aplicarRemoto(remoto);
      expect((await db.obtener(local.id))!.campana, '2027');
    });
  });

  test('migración v1 → v2: añade campana y los nidos existentes quedan sin campaña', () async {
    sqfliteFfiInit();
    final dir = await Directory.systemTemp.createTemp('migra_v2');
    addTearDown(() => dir.delete(recursive: true));
    final ruta = '${dir.path}/v1.db';
    final cols = nidoColumns.where((c) => c.key != 'campana').map((c) => '${c.key} ${c.sqliteType}').join(',');
    final v1 = await databaseFactoryFfi.openDatabase(ruta,
        options: OpenDatabaseOptions(
          version: 1,
          onCreate: (d, _) async {
            await d.execute('''CREATE TABLE nidos (
  id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, is_synced INTEGER NOT NULL DEFAULT 0,
  has_conflict INTEGER NOT NULL DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0,
  local_image_paths TEXT NOT NULL DEFAULT '[]', remote_image_urls TEXT NOT NULL DEFAULT '[]', $cols)''');
            await d.execute('CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT)');
            await d.insert('nidos', {
              'id': 'viejo-1',
              'updated_at': DateTime.utc(2026, 5, 1).millisecondsSinceEpoch,
              'etiqueta': 'V-1',
              'proyecto': 'LIFE',
            });
          },
        ));
    await v1.close();

    final migrada = DatabaseService(
        factory: databaseFactoryFfi, databasePath: ruta, clock: FakeClock().call);
    await migrada.init();
    addTearDown(migrada.close);
    final viejo = (await migrada.obtener('viejo-1'))!;
    expect(viejo.etiqueta, 'V-1');
    expect(viejo.proyecto, 'LIFE');
    expect(viejo.campana, isNull);
    expect(
        (await migrada.consultar(const NidoFilter(campana: NidoFilter.sinValor))).length, 1);
    await migrada.guardar(_n('Nuevo', campana: '2026'));
    expect((await migrada.consultar(const NidoFilter(campana: '2026'))).length, 1);
  });
}
