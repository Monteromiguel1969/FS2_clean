import 'package:aguiluchos/models/nido_constants.dart';
import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:flutter_test/flutter_test.dart';

NidoGrefaModel completo() {
  final n = NidoGrefaModel(
    id: '11111111-1111-4111-8111-111111111111',
    updatedAt: DateTime.utc(2026, 5, 20, 8, 30),
    localImagePaths: ['/tmp/seguimiento_a.jpg'],
    remoteImageUrls: ['https://x/y/cosecha_b.jpg'],
  )
    ..numeracion = '12'
    ..etiqueta = 'N-12'
    ..proyecto = 'Life Aguiluchos'
    ..propietario = 'Ana'
    ..tlfn = '600 111 222'
    ..googleMapsUrl = 'https://maps.app.goo.gl/abc'
    ..municipio = 'Villalba'
    ..provincia = 'Madrid'
    ..referenciaCatastral = '28001A001000010000XX'
    ..especie = Especies.cenizo
    ..territorio = 'T-4'
    ..coordenadaX = 440000
    ..coordenadaY = 4474000
    ..sustrato = 'Cereal'
    ..fechaIncubacion = DateTime(2026, 5, 1)
    ..fechaEclosion = DateTime(2026, 5, 31)
    ..numHuevosEntrada = 4
    ..tamanoPuesta = 5
    ..fechaEntradaNido = DateTime(2026, 5, 2)
    ..numPollosNacidos = 4
    ..numHuevosNoEclosionados = 1
    ..edadDias = 12
    ..anillasPvc = 'A12'
    ..anillasMetalica = 'M-998'
    ..intervencion = true
    ..tipoAccionesManejo = [TiposManejo.dron, TiposManejo.rodal]
    ..observacionesI = 'obs I'
    ..observacionesII = 'obs II'
    ..fechaVuelo = DateTime(2026, 7, 1)
    ..fechaCosecha = DateTime(2026, 6, 20)
    ..pollosVoladosPrecosecha = 1
    ..pollosVoladosPostcosecha = 2
    ..pollosMuertosPrecosecha = 0
    ..pollosMuertosCosecha = 1
    ..pollosMuertosPostcosecha = 0
    ..estadoFinal = 'Pollos volados'
    ..resultadoReproductivo = ResultadoReproductivo.exito
    ..causasFracaso = null
    ..estadoFracaso = null;
  n.recalcularTotales();
  return n;
}

void main() {
  group('Metadatos de columnas', () {
    test('hay 42 columnas con claves únicas', () {
      expect(nidoColumns.length, 42);
      expect(nidoColumns.map((c) => c.key).toSet().length, 42);
    });

    test('reparto por fases: 14 / 5 / 9 / 14', () {
      expect(nidoColumnsPorFase[NidoFase.ubicacion]!.length, 14);
      expect(nidoColumnsPorFase[NidoFase.incubacion]!.length, 5);
      expect(nidoColumnsPorFase[NidoFase.seguimiento]!.length, 9);
      expect(nidoColumnsPorFase[NidoFase.cosecha]!.length, 14);
    });

    test('las claves coinciden con las columnas de Supabase', () {
      const esperadas = [
        'numeracion', 'etiqueta', 'proyecto', 'propietario', 'tlfn',
        'google_maps_url', 'municipio', 'provincia', 'referencia_catastral',
        'especie', 'territorio', 'coordenada_x', 'coordenada_y', 'sustrato',
        'fecha_incubacion', 'fecha_eclosion', 'num_huevos_entrada',
        'tamano_puesta', 'fecha_entrada_nido', 'num_pollos_nacidos',
        'num_huevos_no_eclosionados', 'edad_dias', 'anillas_pvc',
        'anillas_metalica', 'intervencion', 'tipo_acciones_manejo',
        'observaciones_i', 'observaciones_ii', 'fecha_vuelo', 'fecha_cosecha',
        'pollos_volados_precosecha', 'pollos_volados_postcosecha',
        'num_pollos_volados', 'vuelan_pollos', 'num_pollos_muertos',
        'pollos_muertos_precosecha', 'pollos_muertos_cosecha',
        'pollos_muertos_postcosecha', 'estado_final',
        'resultado_reproductivo', 'causas_fracaso', 'estado_fracaso',
      ];
      expect(nidoColumns.map((c) => c.key).toList(), esperadas);
    });
  });

  group('Serialización', () {
    test('toMap/fromMap conserva todos los campos', () {
      final n = completo();
      final copia = NidoGrefaModel.fromMap(n.toMap());
      expect(copia.toMap(), n.toMap());
      expect(copia.tipoAccionesManejo, ['Dron', 'Rodal']);
      expect(copia.fechaIncubacion, DateTime(2026, 5, 1));
      expect(copia.localImagePaths, ['/tmp/seguimiento_a.jpg']);
      expect(copia.updatedAt, DateTime.utc(2026, 5, 20, 8, 30));
      expect(copia.intervencion, isTrue);
    });

    test('toJson usa snake_case, tipos de Supabase y no envía campos locales', () {
      final json = completo().toJson();
      expect(json['id'], '11111111-1111-4111-8111-111111111111');
      expect(json['updated_at'], '2026-05-20T08:30:00.000Z');
      expect(json['fecha_incubacion'], '2026-05-01');
      expect(json['intervencion'], true);
      expect(json['tipo_acciones_manejo'], ['Dron', 'Rodal']);
      expect(json['coordenada_x'], 440000.0);
      expect(json['imagenes_urls'], ['https://x/y/cosecha_b.jpg']);
      expect(json.containsKey('is_synced'), isFalse);
      expect(json.containsKey('has_conflict'), isFalse);
      expect(json.containsKey('local_image_paths'), isFalse);
    });

    test('fromJson(toJson) es idempotente y marca como sincronizado', () {
      final n = completo();
      final r = NidoGrefaModel.fromJson(n.toJson());
      expect(r.isSynced, isTrue);
      expect(r.hasConflict, isFalse);
      expect(r.toJson(), n.toJson());
      expect(r.remoteImageUrls, n.remoteImageUrls);
      expect(r.localImagePaths, isEmpty);
    });

    test('fromJson tolera nulos, números como texto y fechas con hora', () {
      final r = NidoGrefaModel.fromJson({
        'id': 'abc',
        'updated_at': '2026-05-20T10:30:00+02:00',
        'edad_dias': '7',
        'coordenada_x': 3,
        'fecha_vuelo': '2026-07-01T00:00:00',
        'vuelan_pollos': null,
        'tipo_acciones_manejo': null,
      });
      expect(r.edadDias, 7);
      expect(r.coordenadaX, 3.0);
      expect(r.fechaVuelo, DateTime(2026, 7, 1));
      expect(r.vuelanPollos, isFalse);
      expect(r.tipoAccionesManejo, isEmpty);
      expect(r.updatedAt, DateTime.utc(2026, 5, 20, 8, 30));
    });

    test('clone es independiente del original', () {
      final n = completo();
      final c = n.clone()..tipoAccionesManejo.add('Compensación');
      expect(n.tipoAccionesManejo.length, 2);
      expect(c.sameContentAs(n), isFalse);
    });
  });

  group('Lógica de dominio', () {
    test('fecha estimada de eclosión = incubación + 30 días', () {
      final n = NidoGrefaModel()..fechaIncubacion = DateTime(2026, 5, 1);
      expect(n.fechaEstimadaEclosion, DateTime(2026, 5, 31));
      n.fechaIncubacion = DateTime(2026, 3, 15);
      expect(n.fechaEstimadaEclosion, DateTime(2026, 4, 14));
      n.fechaIncubacion = null;
      expect(n.fechaEstimadaEclosion, isNull);
    });

    test('estado reproductivo derivado', () {
      final n = NidoGrefaModel();
      expect(n.estadoReproductivo, EstadoReproductivo.enCurso);
      n.resultadoReproductivo = 'Éxito';
      expect(n.estadoReproductivo, EstadoReproductivo.exito);
      n.resultadoReproductivo = 'Fracaso';
      expect(n.estadoReproductivo, EstadoReproductivo.fracaso);
    });

    test('recalcularTotales suma desgloses y deriva vuelan_pollos', () {
      final n = completo();
      expect(n.numPollosVolados, 3);
      expect(n.numPollosMuertos, 1);
      expect(n.vuelanPollos, isTrue);
      n
        ..pollosVoladosPrecosecha = 0
        ..pollosVoladosPostcosecha = 0
        ..recalcularTotales();
      expect(n.numPollosVolados, 0);
      expect(n.vuelanPollos, isFalse);
    });

    test('recalcularTotales conserva el total si no hay desglose', () {
      final n = NidoGrefaModel()..numPollosVolados = 2;
      n.recalcularTotales();
      expect(n.numPollosVolados, 2);
      expect(n.vuelanPollos, isTrue);
    });

    test('un nido completo y coherente es válido', () {
      expect(completo().validar(), isEmpty);
    });

    test('validar detecta errores que bloquean el guardado', () {
      final n = completo()
        ..etiqueta = ' '
        ..numPollosNacidos = 2
        ..coordenadaY = 123
        ..coordenadaX = 440000;
      n.recalcularTotales();
      final e = n.validar().join('|');
      expect(e, contains('etiqueta'));
      expect(e, contains('superan los pollos nacidos'));
      expect(e, contains('UTM'));
    });

    test('advertencias: incoherencias que se pueden confirmar', () {
      expect(completo().advertencias(), isEmpty);
      final n = completo()
        ..fechaEclosion = DateTime(2026, 4, 1)
        ..numHuevosEntrada = 9;
      final w = n.advertencias().join('|');
      expect(w, contains('eclosión'));
      expect(w, contains('huevos a la entrada'));
    });

    test('Fracaso sin causa y Éxito sin volados generan advertencia', () {
      final f = NidoGrefaModel()
        ..etiqueta = 'x'
        ..resultadoReproductivo = ResultadoReproductivo.fracaso;
      expect(f.validar(), isEmpty);
      expect(f.advertencias().join(), contains('causa'));
      f.causasFracaso = 'Depredación';
      expect(f.advertencias(), isEmpty);

      final e = NidoGrefaModel()
        ..etiqueta = 'x'
        ..resultadoReproductivo = ResultadoReproductivo.exito;
      expect(e.advertencias().join(), contains('volados'));
    });

    test('manejo sin intervención es incoherente', () {
      final n = NidoGrefaModel()
        ..etiqueta = 'x'
        ..tipoAccionesManejo = ['Dron'];
      expect(n.validar().join(), contains('Intervención'));
    });

    test('URL de Google Maps: la guardada o una generada desde coordenadas UTM', () {
      final n = NidoGrefaModel()
        ..coordenadaX = 440000
        ..coordenadaY = 4474000;
      final p = n.latLon!;
      expect(n.googleMapsUri.toString(),
          'https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}');
      expect(p.lat, closeTo(40.43, 0.1));
      expect(p.lon, closeTo(-3.65, 0.1));
      n.googleMapsUrl = 'maps.app.goo.gl/xyz';
      expect(n.googleMapsUri.toString(), 'https://maps.app.goo.gl/xyz');
      expect(NidoGrefaModel().googleMapsUri, isNull);
    });

    test('formatted da valores legibles para exportar', () {
      final n = completo();
      expect(nidoColumnByKey('intervencion').formatted(n), 'Sí');
      expect(nidoColumnByKey('fecha_incubacion').formatted(n), '01/05/2026');
      expect(nidoColumnByKey('tipo_acciones_manejo').formatted(n), 'Dron, Rodal');
      expect(nidoColumnByKey('causas_fracaso').formatted(n), '');
    });
  });
}
