import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/logic/lww.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';

NidoGrefaModel _n({required DateTime t, bool synced = false, DateTime? base}) =>
    NidoGrefaModel(id: 'n1', updatedAt: t, isSynced: synced)
      ..lastSyncedAt = base;

final t0 = DateTime.utc(2026, 5, 1, 10);
final t1 = DateTime.utc(2026, 5, 1, 11);
final t2 = DateTime.utc(2026, 5, 1, 12);

void main() {
  group('resolverLastWriteWins', () {
    test('sin local: se acepta el remoto', () {
      final r = resolverLastWriteWins(
        local: null,
        remoto: _n(t: t1, synced: true),
      );
      expect(r.accion, AccionSync.aceptarRemoto);
      expect(r.hayConflicto, isFalse);
    });

    test('sin remoto: se sube si el local está pendiente', () {
      expect(
        resolverLastWriteWins(local: _n(t: t1), remoto: null).accion,
        AccionSync.subirLocal,
      );
      expect(
        resolverLastWriteWins(
          local: _n(t: t1, synced: true),
          remoto: null,
        ).accion,
        AccionSync.ninguna,
      );
    });

    test(
      'local sincronizado y remoto más reciente: gana el remoto sin conflicto',
      () {
        final r = resolverLastWriteWins(
          local: _n(t: t0, synced: true),
          remoto: _n(t: t1, synced: true),
        );
        expect(r.accion, AccionSync.aceptarRemoto);
        expect(r.hayConflicto, isFalse);
      },
    );

    test('local sincronizado y remoto igual o más antiguo: no hace nada', () {
      expect(
        resolverLastWriteWins(
          local: _n(t: t1, synced: true),
          remoto: _n(t: t1),
        ).accion,
        AccionSync.ninguna,
      );
      expect(
        resolverLastWriteWins(
          local: _n(t: t1, synced: true),
          remoto: _n(t: t0),
        ).accion,
        AccionSync.ninguna,
      );
    });

    test('local pendiente y remoto sin cambios desde la última sync: se sube sin conflicto', () {
      final r = resolverLastWriteWins(
        local: _n(t: t2, base: t0),
        remoto: _n(t: t0, synced: true),
      );
      expect(r.accion, AccionSync.subirLocal);
      expect(r.hayConflicto, isFalse);
    });

    test(
      'edición concurrente con local más reciente: gana local y hay conflicto',
      () {
        final r = resolverLastWriteWins(
          local: _n(t: t2, base: t0),
          remoto: _n(t: t1, synced: true),
        );
        expect(r.accion, AccionSync.subirLocal);
        expect(r.hayConflicto, isTrue);
      },
    );

    test('edición concurrente con remoto más reciente: gana remoto y hay conflicto', () {
      final r = resolverLastWriteWins(
        local: _n(t: t1, base: t0),
        remoto: _n(t: t2, synced: true),
      );
      expect(r.accion, AccionSync.aceptarRemoto);
      expect(r.hayConflicto, isTrue);
    });

    test('local pendiente sin base conocida y remoto distinto: conflicto', () {
      final r = resolverLastWriteWins(
        local: _n(t: t1),
        remoto: _n(t: t2, synced: true),
      );
      expect(r.accion, AccionSync.aceptarRemoto);
      expect(r.hayConflicto, isTrue);
    });

    test('misma marca de tiempo (subida previa cuya respuesta se perdió): sin conflicto', () {
      final r = resolverLastWriteWins(
        local: _n(t: t1),
        remoto: _n(t: t1, synced: true),
      );
      expect(r.accion, AccionSync.aceptarRemoto);
      expect(r.hayConflicto, isFalse);
    });

    test('compara en UTC aunque lleguen en zonas distintas', () {
      final local = NidoGrefaModel(
        id: 'n1',
        updatedAt: DateTime.parse('2026-05-01T12:00:00+02:00'),
      )..lastSyncedAt = t0;
      final remoto = NidoGrefaModel(
        id: 'n1',
        updatedAt: DateTime.parse('2026-05-01T10:30:00Z'),
      );
      // 12:00+02:00 == 10:00Z, anterior al remoto (10:30Z) => edición concurrente, gana remoto.
      final r = resolverLastWriteWins(local: local, remoto: remoto);
      expect(r.accion, AccionSync.aceptarRemoto);
      expect(r.hayConflicto, isTrue);
    });
  });
}
