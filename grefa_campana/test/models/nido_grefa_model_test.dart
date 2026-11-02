import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_campo.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';

import '../helpers.dart';

void main() {
  group('Catálogo de campos', () {
    test('tiene exactamente 42 campos distribuidos 14/5/9/14 en 4 fases', () {
      expect(camposNido, hasLength(42));
      final porFase = <FaseNido, int>{};
      for (final c in camposNido) {
        porFase[c.fase] = (porFase[c.fase] ?? 0) + 1;
      }
      expect(porFase, {
        FaseNido.ubicacion: 14,
        FaseNido.puesta: 5,
        FaseNido.seguimiento: 9,
        FaseNido.cosecha: 14,
      });
    });

    test('las claves son únicas y coinciden con la especificación', () {
      final claves = camposNido.map((c) => c.clave).toList();
      expect(claves.toSet(), hasLength(42));
      expect(
        claves,
        containsAll(<String>[
          'numeracion',
          'etiqueta',
          'proyecto',
          'propietario',
          'tlfn',
          'google_maps_url',
          'municipio',
          'provincia',
          'referencia_catastral',
          'especie',
          'territorio',
          'coordenada_x',
          'coordenada_y',
          'sustrato',
          'fecha_incubacion',
          'fecha_eclosion',
          'num_huevos_entrada',
          'tamano_puesta',
          'fecha_entrada_nido',
          'num_pollos_nacidos',
          'num_huevos_no_eclosionados',
          'edad_dias',
          'anillas_pvc',
          'anillas_metalica',
          'intervencion',
          'tipo_acciones_manejo',
          'observaciones_i',
          'observaciones_ii',
          'fecha_vuelo',
          'fecha_cosecha',
          'pollos_volados_precosecha',
          'pollos_volados_postcosecha',
          'num_pollos_volados',
          'vuelan_pollos',
          'num_pollos_muertos',
          'pollos_muertos_precosecha',
          'pollos_muertos_cosecha',
          'pollos_muertos_postcosecha',
          'estado_final',
          'resultado_reproductivo',
          'causas_fracaso',
          'estado_fracaso',
        ]),
      );
    });
  });

  group('NidoGrefaModel', () {
    test('genera un UUID v4 y valores por defecto', () {
      final n = NidoGrefaModel();
      expect(n.id, matches(RegExp(r'^[0-9a-f-]{36}$')));
      expect(n.isSynced, isFalse);
      expect(n.hasConflict, isFalse);
      expect(n.localImagePaths, isEmpty);
      expect(n.imageUrls, isEmpty);
      expect(n.updatedAt.isUtc, isTrue);
      expect(NidoGrefaModel().id, isNot(n.id));
    });

    test('toJson contiene los 42 campos + id, updated_at e image_urls', () {
      final json = nidoCompleto().toJson();
      for (final c in camposNido) {
        expect(json.containsKey(c.clave), isTrue, reason: c.clave);
      }
      expect(json['id'], '11111111-1111-4111-8111-111111111111');
      expect(json['updated_at'], '2026-05-20T10:30:00.000Z');
      expect(json['fecha_incubacion'], '2026-05-01');
      expect(json['tipo_acciones_manejo'], ['Dron', 'Rodal']);
      expect(json['coordenada_x'], -3.2);
      expect(json['intervencion'], true);
      expect(json['image_urls'], hasLength(1));
      // Campos solo locales no viajan al servidor.
      expect(json.containsKey('is_synced'), isFalse);
      expect(json.containsKey('has_conflict'), isFalse);
      expect(json.containsKey('local_image_paths'), isFalse);
      expect(json.containsKey('last_synced_at'), isFalse);
      expect(() => jsonEncode(json), returnsNormally);
    });

    test('toJson/fromJson conserva todos los campos remotos', () {
      final original = nidoCompleto();
      final copia = NidoGrefaModel.fromJson(
        jsonDecode(jsonEncode(original.toJson())) as Map<String, dynamic>,
      );
      expect(copia.toJson(), original.toJson());
      expect(copia.id, original.id);
      expect(copia.updatedAt, original.updatedAt);
      expect(copia.fechaIncubacion, DateTime(2026, 5, 1));
      expect(copia.tipoAccionesManejo, ['Dron', 'Rodal']);
      expect(copia.imageUrls, original.imageUrls);
    });

    test('toMap/fromMap conserva todo, incluido el control local', () {
      final original = nidoCompleto()
        ..isSynced = true
        ..hasConflict = true
        ..lastSyncedAt = DateTime.utc(2026, 5, 19, 8);
      final m = original.toMap();
      expect(m['is_synced'], 1);
      expect(m['has_conflict'], 1);
      expect(m['intervencion'], 1);
      expect(m['tipo_acciones_manejo'], '["Dron","Rodal"]');
      expect(m['local_image_paths'], '["/tmp/seguimiento_a.jpg"]');

      final copia = NidoGrefaModel.fromMap(m);
      expect(copia.toMap(), m);
      expect(copia.isSynced, isTrue);
      expect(copia.hasConflict, isTrue);
      expect(copia.localImagePaths, ['/tmp/seguimiento_a.jpg']);
      expect(copia.lastSyncedAt, DateTime.utc(2026, 5, 19, 8));
      expect(copia.coordenadaY, 40.1);
    });

    test('las claves de toMap incluyen los 42 campos y el control', () {
      final m = NidoGrefaModel().toMap();
      expect(m.keys, containsAll(camposNido.map((c) => c.clave)));
      expect(
        m.keys,
        containsAll(<String>[
          'id',
          'updated_at',
          'is_synced',
          'has_conflict',
          'local_image_paths',
          'image_urls',
        ]),
      );
      expect(m.length, 42 + 7);
    });

    test('fromJson es tolerante con tipos y valores vacíos', () {
      final n = NidoGrefaModel.fromJson({
        'id': 'abc',
        'updated_at': '2026-05-20T10:30:00.123456+00:00',
        'municipio': '',
        'num_pollos_nacidos': '3',
        'coordenada_x': '-3,25',
        'coordenada_y': 40,
        'intervencion': 1,
        'tipo_acciones_manejo': 'Dron, Rodal',
        'fecha_vuelo': '2026-06-25T00:00:00+00:00',
        'image_urls': null,
        'vuelan_pollos': 'true',
      });
      expect(n.id, 'abc');
      expect(n.municipio, isNull);
      expect(n.numPollosNacidos, 3);
      expect(n.coordenadaX, -3.25);
      expect(n.coordenadaY, 40.0);
      expect(n.intervencion, isTrue);
      expect(n.tipoAccionesManejo, ['Dron', 'Rodal']);
      expect(n.fechaVuelo, DateTime(2026, 6, 25));
      expect(n.imageUrls, isEmpty);
      expect(n.vuelanPollos, isTrue);
      expect(n.updatedAt.isUtc, isTrue);
      expect(n.updatedAt.microsecond, 456);
    });

    test('copiar() es una copia profunda', () {
      final a = nidoCompleto();
      final b = a.copiar();
      b.tipoAccionesManejo.add('Compensación');
      b.localImagePaths.add('/x.jpg');
      b.etiqueta = 'otra';
      expect(a.tipoAccionesManejo, ['Dron', 'Rodal']);
      expect(a.localImagePaths, hasLength(1));
      expect(a.etiqueta, 'CEN-012');
      expect(b.id, a.id);
    });

    group('estadoReproductivo', () {
      test('interpreta el resultado sin importar mayúsculas ni tildes', () {
        expect(
          (NidoGrefaModel()..resultadoReproductivo = 'Éxito')
              .estadoReproductivo,
          EstadoReproductivo.exito,
        );
        expect(
          (NidoGrefaModel()..resultadoReproductivo = 'EXITO')
              .estadoReproductivo,
          EstadoReproductivo.exito,
        );
        expect(
          (NidoGrefaModel()..resultadoReproductivo = ' fracaso ')
              .estadoReproductivo,
          EstadoReproductivo.fracaso,
        );
        expect(
          (NidoGrefaModel()..resultadoReproductivo = null).estadoReproductivo,
          EstadoReproductivo.enCurso,
        );
        expect(
          (NidoGrefaModel()..resultadoReproductivo = 'otro').estadoReproductivo,
          EstadoReproductivo.enCurso,
        );
      });
    });

    group('recalcularTotales', () {
      test('suma desgloses y deriva vuelan_pollos', () {
        final n = NidoGrefaModel()
          ..pollosVoladosPrecosecha = 1
          ..pollosVoladosPostcosecha = 2
          ..pollosMuertosPrecosecha = 1
          ..pollosMuertosCosecha = 1
          ..pollosMuertosPostcosecha = 0
          ..recalcularTotales();
        expect(n.numPollosVolados, 3);
        expect(n.numPollosMuertos, 2);
        expect(n.vuelanPollos, isTrue);
      });

      test('sin desgloses no toca los totales existentes', () {
        final n = NidoGrefaModel()
          ..numPollosVolados = 4
          ..recalcularTotales();
        expect(n.numPollosVolados, 4);
        expect(n.numPollosMuertos, isNull);
        expect(n.vuelanPollos, isTrue);
      });

      test('cero volados => vuelan_pollos falso', () {
        final n = NidoGrefaModel()
          ..pollosVoladosPrecosecha = 0
          ..recalcularTotales();
        expect(n.numPollosVolados, 0);
        expect(n.vuelanPollos, isFalse);
      });
    });

    test('tieneCoordenadas valida rangos', () {
      expect(
        (NidoGrefaModel()
              ..coordenadaX = -3
              ..coordenadaY = 40)
            .tieneCoordenadas,
        isTrue,
      );
      expect((NidoGrefaModel()..coordenadaX = -3).tieneCoordenadas, isFalse);
      expect(
        (NidoGrefaModel()
              ..coordenadaX = 300
              ..coordenadaY = 40)
            .tieneCoordenadas,
        isFalse,
      );
      expect(
        (NidoGrefaModel()
              ..coordenadaX = 3
              ..coordenadaY = 95)
            .tieneCoordenadas,
        isFalse,
      );
    });

    test('titulo usa etiqueta, numeración o id', () {
      expect((NidoGrefaModel(id: 'abcdefgh-1')..etiqueta = 'E1').titulo, 'E1');
      expect(
        (NidoGrefaModel(id: 'abcdefgh-1')..numeracion = '7').titulo,
        'Nido 7',
      );
      expect(NidoGrefaModel(id: 'abcdefgh-1').titulo, 'Nido abcdefgh');
    });
  });

  group('fechas', () {
    test(
      'formatearFechaIso y parsearFecha son inversas y no dependen de la zona',
      () {
        expect(formatearFechaIso(DateTime(2026, 1, 5)), '2026-01-05');
        expect(parsearFecha('2026-01-05'), DateTime(2026, 1, 5));
        expect(parsearFecha('2026-01-05T23:30:00Z'), DateTime(2026, 1, 5));
        expect(parsearFecha(''), isNull);
        expect(parsearFecha(null), isNull);
      },
    );
  });
}
