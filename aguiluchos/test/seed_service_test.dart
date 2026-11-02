import 'dart:io';

import 'package:aguiluchos/services/seed_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';

class _EmptyBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async => throw Exception('no asset');
}

class _BadBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async =>
      ByteData.sublistView(Uint8List.fromList([1, 2, 3]));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('sin asset no hace nada ni marca la carga', () async {
    final db = await openTestDb(FakeClock());
    final r = await SeedService(bundle: _EmptyBundle()).cargarSiProcede(db);
    expect(r, isNull);
    expect(await db.leerMeta(SeedService.metaKey), isNull);
    expect(await db.consultar(), isEmpty);
    await db.close();
  });

  test('asset corrupto no rompe el arranque', () async {
    final db = await openTestDb(FakeClock());
    final r = await SeedService(bundle: _BadBundle()).cargarSiProcede(db);
    expect(r, isNull);
    expect(await db.leerMeta(SeedService.metaKey), isNull);
    await db.close();
  });

  test(
    'con el Excel real importa una sola vez',
    () async {
      final path = Platform.environment['AGUILUCHOS_XLSX'];
      final db = await openTestDb(FakeClock());
      final bundle = _FileBundle(File(path!).readAsBytesSync());
      final seed = SeedService(bundle: bundle);
      final r = await seed.cargarSiProcede(db);
      expect(r!.nuevos, greaterThan(0));
      expect(await seed.cargarSiProcede(db), isNull);
      expect((await db.consultar()).length, r.nuevos);
      await db.close();
    },
    skip: Platform.environment['AGUILUCHOS_XLSX'] == null
        ? 'Define AGUILUCHOS_XLSX para ejecutarlo'
        : false,
  );
}

class _FileBundle extends CachingAssetBundle {
  _FileBundle(this.bytes);
  final Uint8List bytes;
  @override
  Future<ByteData> load(String key) async => ByteData.sublistView(bytes);
}
