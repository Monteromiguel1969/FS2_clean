/// Catálogos de valores usados en formularios, filtros y exportaciones.
library;

/// Días de incubación considerados para estimar la fecha de eclosión.
const int diasIncubacion = 30;

abstract final class Especies {
  static const cenizo = 'Aguilucho cenizo';
  static const palido = 'Aguilucho pálido';
  static const todas = [cenizo, palido];
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
    'Cosechadora / maquinaria agrícola',
    'Abandono del nido',
    'Inclemencias meteorológicas',
    'Huevos no viables',
    'Molestias humanas',
    'Enfermedad / parásitos',
    'Causa desconocida',
    'Otra',
  ];
}

abstract final class EstadosFinales {
  static const todos = [
    'En incubación',
    'Con pollos',
    'Pollos volados',
    'Fracasado',
    'Nido no localizado',
  ];
}

abstract final class EstadosFracaso {
  static const todos = ['Total', 'Parcial'];
}

abstract final class Sustratos {
  static const todos = [
    'Cereal',
    'Barbecho',
    'Pastizal',
    'Matorral',
    'Cultivo de regadío',
    'Otro',
  ];
}
