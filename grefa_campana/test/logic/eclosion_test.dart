import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/logic/eclosion.dart';

void main() {
  group('estimarFechaEclosion', () {
    test('suma 30 días a la fecha de incubación', () {
      expect(estimarFechaEclosion(DateTime(2026, 5, 1)), DateTime(2026, 5, 31));
    });

    test('cruza fin de mes y de año', () {
      expect(
        estimarFechaEclosion(DateTime(2026, 5, 20)),
        DateTime(2026, 6, 19),
      );
      expect(
        estimarFechaEclosion(DateTime(2026, 12, 15)),
        DateTime(2027, 1, 14),
      );
    });

    test('respeta años bisiestos', () {
      expect(estimarFechaEclosion(DateTime(2028, 2, 1)), DateTime(2028, 3, 2));
      expect(estimarFechaEclosion(DateTime(2027, 2, 1)), DateTime(2027, 3, 3));
    });

    test('ignora la hora y no se ve afectado por el cambio horario', () {
      // 2026-03-15 + 30 días cruza el cambio a horario de verano (29 de marzo).
      expect(
        estimarFechaEclosion(DateTime(2026, 3, 15, 23, 59)),
        DateTime(2026, 4, 14),
      );
    });

    test('sin fecha de incubación devuelve null', () {
      expect(estimarFechaEclosion(null), isNull);
    });

    test('la duración es configurable y por defecto 30 días', () {
      expect(diasIncubacion, 30);
      expect(
        estimarFechaEclosion(DateTime(2026, 5, 1), dias: 28),
        DateTime(2026, 5, 29),
      );
    });
  });

  group('diasHastaEclosion', () {
    final incubacion = DateTime(2026, 5, 1); // eclosión estimada 31/05

    test('días restantes, cero y negativos', () {
      expect(diasHastaEclosion(incubacion, hoy: DateTime(2026, 5, 21)), 10);
      expect(diasHastaEclosion(incubacion, hoy: DateTime(2026, 5, 31, 18)), 0);
      expect(diasHastaEclosion(incubacion, hoy: DateTime(2026, 6, 2)), -2);
    });

    test('null sin fecha', () {
      expect(diasHastaEclosion(null, hoy: DateTime(2026, 5, 21)), isNull);
    });
  });

  group('edadPollosDias', () {
    test('días desde la eclosión real', () {
      expect(
        edadPollosDias(DateTime(2026, 5, 31), hoy: DateTime(2026, 6, 10)),
        10,
      );
      expect(
        edadPollosDias(DateTime(2026, 5, 31), hoy: DateTime(2026, 5, 31)),
        0,
      );
    });

    test('eclosión futura o ausente => null', () {
      expect(
        edadPollosDias(DateTime(2026, 6, 10), hoy: DateTime(2026, 5, 31)),
        isNull,
      );
      expect(edadPollosDias(null), isNull);
    });
  });
}
