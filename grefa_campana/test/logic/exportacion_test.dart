import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/logic/exportacion.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';

NidoGrefaModel _nido(
  String etiqueta, {
  String? municipio,
  String? resultado,
  DateTime? entrada,
  int? nacidos,
  int? volados,
  int? muertos,
}) => NidoGrefaModel()
  ..etiqueta = etiqueta
  ..municipio = municipio
  ..resultadoReproductivo = resultado
  ..fechaEntradaNido = entrada
  ..numPollosNacidos = nacidos
  ..numPollosVolados = volados
  ..numPollosMuertos = muertos;

void main() {
  final nidos = [
    _nido(
      'A',
      municipio: 'Toledo',
      resultado: 'Éxito',
      entrada: DateTime(2026, 5, 10),
      nacidos: 4,
      volados: 3,
      muertos: 1,
    ),
    _nido(
      'B',
      municipio: 'Ávila',
      resultado: 'Fracaso',
      entrada: DateTime(2026, 5, 20),
      nacidos: 2,
      volados: 0,
      muertos: 2,
    ),
    _nido('C', municipio: 'toledo', entrada: DateTime(2026, 6, 15), nacidos: 3),
    _nido(
      'D',
      municipio: 'Madrid',
      resultado: 'Éxito',
      entrada: DateTime(2026, 7, 1),
      nacidos: 5,
      volados: 5,
    ),
  ];

  group('filtrarParaExportar', () {
    test('sin filtros devuelve todos', () {
      expect(
        filtrarParaExportar(nidos, const FiltroExportacion()),
        hasLength(4),
      );
    });

    test('por estado Éxito / Fracaso', () {
      final ex = filtrarParaExportar(
        nidos,
        const FiltroExportacion(estado: EstadoReproductivo.exito),
      );
      expect(ex.map((n) => n.etiqueta), ['A', 'D']);
      final fr = filtrarParaExportar(
        nidos,
        const FiltroExportacion(estado: EstadoReproductivo.fracaso),
      );
      expect(fr.map((n) => n.etiqueta), ['B']);
    });

    test('por municipios (multiselección, sin distinguir mayúsculas)', () {
      final r = filtrarParaExportar(
        nidos,
        const FiltroExportacion(municipios: {'Toledo', 'Madrid'}),
      );
      expect(r.map((n) => n.etiqueta), ['A', 'C', 'D']);
    });

    test('por rango de fechas inclusivo', () {
      final r = filtrarParaExportar(
        nidos,
        FiltroExportacion(
          desde: DateTime(2026, 5, 20),
          hasta: DateTime(2026, 6, 15),
        ),
      );
      expect(r.map((n) => n.etiqueta), ['B', 'C']);
    });

    test('combina filtros', () {
      final r = filtrarParaExportar(
        nidos,
        FiltroExportacion(
          desde: DateTime(2026, 5, 1),
          hasta: DateTime(2026, 6, 30),
          municipios: const {'Toledo'},
          estado: EstadoReproductivo.exito,
        ),
      );
      expect(r.map((n) => n.etiqueta), ['A']);
    });
  });

  test('fechaDeCampana usa la primera fecha disponible y si no updatedAt', () {
    expect(
      fechaDeCampana(_nido('x', entrada: DateTime(2026, 5, 10, 14))),
      DateTime(2026, 5, 10),
    );
    final n = NidoGrefaModel()..fechaCosecha = DateTime(2026, 6, 28);
    expect(fechaDeCampana(n), DateTime(2026, 6, 28));
    final sin = NidoGrefaModel(updatedAt: DateTime.utc(2026, 8, 1, 12));
    expect(fechaDeCampana(sin), DateTime(2026, 8, 1));
  });

  group('ResumenEjecutivo', () {
    test('totaliza nacidos, volados y muertes', () {
      final r = ResumenEjecutivo.de(nidos);
      expect(r.totalNidos, 4);
      expect(r.nidosExito, 2);
      expect(r.nidosFracaso, 1);
      expect(r.nidosEnCurso, 1);
      expect(r.pollosNacidos, 14);
      expect(r.pollosVolados, 8);
      expect(r.pollosMuertos, 3);
      expect(r.tasaExito, closeTo(66.67, 0.01));
      expect(r.productividad, 2.0);
    });

    test('usa los desgloses cuando faltan los totales', () {
      final n = NidoGrefaModel()
        ..pollosVoladosPrecosecha = 1
        ..pollosVoladosPostcosecha = 2
        ..pollosMuertosCosecha = 1;
      final r = ResumenEjecutivo.de([n]);
      expect(r.pollosVolados, 3);
      expect(r.pollosMuertos, 1);
    });

    test('lista vacía no divide por cero', () {
      final r = ResumenEjecutivo.de(const []);
      expect(r.totalNidos, 0);
      expect(r.tasaExito, isNull);
      expect(r.productividad, isNull);
    });
  });

  group('generarJustificacion', () {
    test('éxito con intervención', () {
      final n = NidoGrefaModel()
        ..intervencion = true
        ..tipoAccionesManejo = ['Dron', 'Rodal']
        ..resultadoReproductivo = 'Éxito'
        ..numPollosVolados = 3
        ..numPollosMuertos = 1;
      final t = generarJustificacion(n);
      expect(t, contains('dron y rodal'));
      expect(t, contains('3 pollos volados'));
      expect(t, contains('1 baja'));
    });

    test('fracaso con causa y fase', () {
      final n = NidoGrefaModel()
        ..resultadoReproductivo = 'Fracaso'
        ..causasFracaso = 'Depredación'
        ..estadoFracaso = 'Incubación';
      final t = generarJustificacion(n);
      expect(t, contains('Seguimiento sin intervención'));
      expect(t, contains('fase de incubación'));
      expect(t, contains('depredación'));
    });

    test('en curso y observaciones largas truncadas', () {
      final n = NidoGrefaModel()..observacionesI = 'x' * 300;
      final t = generarJustificacion(n);
      expect(t, contains('Reproducción en curso'));
      expect(t, endsWith('...'));
    });
  });

  test('camposPorFase agrupa los 42 campos en 4 fases', () {
    final g = camposPorFase();
    expect(g.keys, hasLength(4));
    expect(g.values.fold<int>(0, (a, l) => a + l.length), 42);
  });
}
