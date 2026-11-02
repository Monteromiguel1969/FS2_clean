import 'package:grefa_campana/models/nido_grefa_model.dart';

/// Nido con los 42 campos rellenos, útil para pruebas de serialización.
NidoGrefaModel nidoCompleto({String? id, DateTime? updatedAt}) {
  return NidoGrefaModel(
      id: id ?? '11111111-1111-4111-8111-111111111111',
      updatedAt: updatedAt ?? DateTime.utc(2026, 5, 20, 10, 30),
      localImagePaths: ['/tmp/seguimiento_a.jpg'],
      imageUrls: [
        'https://x.supabase.co/storage/v1/object/public/nidos-fotos/n/cosecha_b.jpg',
      ],
    )
    ..numeracion = '12'
    ..etiqueta = 'CEN-012'
    ..proyecto = 'Campaña 2026'
    ..propietario = 'Juan Pérez'
    ..tlfn = '600123456'
    ..googleMapsUrl = 'https://maps.google.com/?q=40.1,-3.2'
    ..municipio = 'Villaconejos'
    ..provincia = 'Madrid'
    ..referenciaCatastral = '28165A00100001'
    ..especie = 'Aguilucho cenizo (Circus pygargus)'
    ..territorio = 'T-4'
    ..coordenadaX = -3.2
    ..coordenadaY = 40.1
    ..sustrato = 'Cebada'
    ..fechaIncubacion = DateTime(2026, 5, 1)
    ..fechaEclosion = DateTime(2026, 5, 31)
    ..numHuevosEntrada = 4
    ..tamanoPuesta = 5
    ..fechaEntradaNido = DateTime(2026, 5, 3)
    ..numPollosNacidos = 4
    ..numHuevosNoEclosionados = 1
    ..edadDias = 12
    ..anillasPvc = 'A1,A2'
    ..anillasMetalica = 'M-123'
    ..intervencion = true
    ..tipoAccionesManejo = ['Dron', 'Rodal']
    ..observacionesI = 'Obs I'
    ..observacionesIi = 'Obs II'
    ..fechaVuelo = DateTime(2026, 6, 25)
    ..fechaCosecha = DateTime(2026, 6, 28)
    ..pollosVoladosPrecosecha = 1
    ..pollosVoladosPostcosecha = 2
    ..numPollosVolados = 3
    ..vuelanPollos = true
    ..numPollosMuertos = 1
    ..pollosMuertosPrecosecha = 0
    ..pollosMuertosCosecha = 1
    ..pollosMuertosPostcosecha = 0
    ..estadoFinal = 'Pollos volados'
    ..resultadoReproductivo = 'Éxito'
    ..causasFracaso = 'Depredación'
    ..estadoFracaso = 'Pollos en nido';
}
