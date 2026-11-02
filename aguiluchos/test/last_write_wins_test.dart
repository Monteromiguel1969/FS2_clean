import 'package:aguiluchos/services/last_write_wins.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';

void main() {
  final t0 = DateTime.utc(2026, 5, 1, 10);
  final t1 = t0.add(const Duration(minutes: 5));

  test('sin copia local: se toma la remota', () {
    final r = nidoDeEjemplo(updatedAt: t0);
    expect(LastWriteWins.resolve(local: null, remote: r), LwwDecision.takeRemote);
  });

  test('local sincronizada y remota más reciente: remota, sin conflicto', () {
    final l = nidoDeEjemplo(id: 'a', updatedAt: t0)..isSynced = true;
    final r = nidoDeEjemplo(id: 'a', updatedAt: t1);
    expect(LastWriteWins.resolve(local: l, remote: r), LwwDecision.takeRemote);
  });

  test('local sincronizada y remota igual o más antigua: se conserva la local', () {
    final l = nidoDeEjemplo(id: 'a', updatedAt: t1)..isSynced = true;
    expect(LastWriteWins.resolve(local: l, remote: nidoDeEjemplo(id: 'a', updatedAt: t1)),
        LwwDecision.keepLocal);
    expect(LastWriteWins.resolve(local: l, remote: nidoDeEjemplo(id: 'a', updatedAt: t0)),
        LwwDecision.keepLocal);
  });

  test('local pendiente y remota más reciente: remota gana CON conflicto', () {
    final l = nidoDeEjemplo(id: 'a', updatedAt: t0)..isSynced = false;
    final r = nidoDeEjemplo(id: 'a', updatedAt: t1);
    expect(LastWriteWins.resolve(local: l, remote: r),
        LwwDecision.takeRemoteWithConflict);
  });

  test('local pendiente y local más reciente o igual: gana la local (sin conflicto)', () {
    final l = nidoDeEjemplo(id: 'a', updatedAt: t1)..isSynced = false;
    expect(LastWriteWins.resolve(local: l, remote: nidoDeEjemplo(id: 'a', updatedAt: t0)),
        LwwDecision.keepLocal);
    expect(LastWriteWins.resolve(local: l, remote: nidoDeEjemplo(id: 'a', updatedAt: t1)),
        LwwDecision.keepLocal);
  });

  test('serverKeptNewerVersion detecta que el servidor conservó otra versión', () {
    final pushed = nidoDeEjemplo(id: 'a', updatedAt: t0);
    expect(
        LastWriteWins.serverKeptNewerVersion(
            pushed: pushed, stored: nidoDeEjemplo(id: 'a', updatedAt: t1)),
        isTrue);
    expect(
        LastWriteWins.serverKeptNewerVersion(
            pushed: pushed, stored: nidoDeEjemplo(id: 'a', updatedAt: t0)),
        isFalse);
  });
}
