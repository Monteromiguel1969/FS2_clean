/// Catálogos de valores usados en formularios, filtros y exportaciones.
library;

/// Días de incubación considerados para estimar la fecha de eclosión.
const int diasIncubacion = 30;

abstract final class Especies {
  static const cenizo = 'Aguilucho cenizo';
  static const palido = 'Aguilucho pálido';
  static const lagunero = 'Aguilucho lagunero';
  static const todas = [cenizo, palido, lagunero];

  /// Normaliza las variantes escritas a mano ("A.Cenizo", "A. pálido"...).
  static String? normalizar(String? raw) {
    final t = (raw ?? '').toLowerCase();
    if (t.contains('cenizo')) return cenizo;
    if (t.contains('pálido') || t.contains('palido')) return palido;
    if (t.contains('lagunero')) return lagunero;
    return null;
  }
}

abstract final class ResultadoReproductivo {
  static const exito = 'Éxito';
  static const fracaso = 'Fracaso';
  static const valores = [exito, fracaso];
}

/// Valores del filtro de estado reproductivo (Todos/Éxito/Fracaso/En curso).
enum EstadoReproductivo {
  todos('Todos'),
  exito('Éxito'),
  fracaso('Fracaso'),
  enCurso('En curso');

  const EstadoReproductivo(this.etiqueta);
  final String etiqueta;
}

abstract final class TiposManejo {
  static const dron = 'Dron';
  static const rodal = 'Rodal';
  static const compensacion = 'Compensación';
  static const todos = [dron, rodal, compensacion];
}

abstract final class CausasFracaso {
  static const todas = [
    'Depredación',
    'Abandono',
    'Huevos infértiles',
    'Cosecha',
    'Cosecha en verde',
    'Parcela cosechada',
    'Parcela arada',
    'Incendio parcela',
    'Desconocidas',
    'Otra',
  ];
}

abstract final class EstadosFinales {
  static const conExito = 'Reproducción con éxito';
  static const sinExito = 'Reproducción sin éxito';
  static const noConstatada = 'Reproducción no constatada';
  static const territorioDescartado = 'Territorio descartado';
  static const todos = [conExito, sinExito, noConstatada, territorioDescartado];
}

abstract final class EstadosFracaso {
  static const huevos = 'Huevos';
  static const pollos = 'Pollos';
  static const pollosYHuevos = 'Pollos y huevos';
  static const todos = [huevos, pollos, pollosYHuevos];
}

abstract final class Territorios {
  static const todos = ['Seguro', 'Probable', 'Posible', 'Descartado'];
}

abstract final class Proyectos {
  static const todos = ['LIFE', 'Compensatorias', 'USANOS'];
}

abstract final class Sustratos {
  static const todos = [
    'Cebada',
    'Trigo',
    'Avena',
    'Erial',
    'Barbecho',
    'Pastizal',
    'Herbazal',
    'Matorral',
    'Otro',
  ];
}
