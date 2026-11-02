import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../logic/eclosion.dart';
import '../logic/mapas.dart';
import '../models/nido_grefa_model.dart';
import '../services/location_service.dart';
import '../state/app_scope.dart';
import '../widgets/campos_formulario.dart';
import '../widgets/image_picker_widget.dart';

/// Ficha de un nido con 4 pestañas (una por fase de la campaña).
///
/// [nido] == null crea un nido nuevo. En escritorio puede incrustarse en un
/// panel ([embedded]) y avisa con [onGuardado]/[onCerrar].
class NidoDetailScreen extends StatefulWidget {
  const NidoDetailScreen({
    super.key,
    this.nido,
    this.embedded = false,
    this.onGuardado,
    this.onCerrar,
    this.ubicacion,
  });

  final NidoGrefaModel? nido;
  final bool embedded;
  final ValueChanged<NidoGrefaModel>? onGuardado;
  final VoidCallback? onCerrar;
  final LocationService? ubicacion;

  @override
  State<NidoDetailScreen> createState() => _NidoDetailScreenState();
}

class _NidoDetailScreenState extends State<NidoDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this);
  late final NidoGrefaModel _nido = widget.nido?.copiar() ?? NidoGrefaModel();
  final _formKey = GlobalKey<FormState>();
  final _ubicacion = LocationService();
  bool _guardando = false;
  bool _capturandoGps = false;
  bool _modificado = false;

  /// Cambia al reescribir campos desde código (GPS, fecha estimada) para
  /// reconstruir los `TextFormField` con su nuevo valor inicial.
  int _refresco = 0;

  bool get _esNuevo => widget.nido == null;

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  void _cambio(VoidCallback fn) {
    setState(() {
      fn();
      _modificado = true;
    });
  }

  // ------------------------------------------------------------ acciones

  Future<void> _capturarGps() async {
    setState(() => _capturandoGps = true);
    try {
      final pos = await (widget.ubicacion ?? _ubicacion).posicionActual();
      _cambio(() {
        _nido.coordenadaY = double.parse(pos.latitude.toStringAsFixed(6));
        _nido.coordenadaX = double.parse(pos.longitude.toStringAsFixed(6));
        _refresco++;
      });
      _aviso('Ubicación capturada (±${pos.accuracy.toStringAsFixed(0)} m).');
    } on UbicacionException catch (e) {
      _aviso(e.mensaje);
    } catch (e) {
      _aviso('No se pudo obtener la ubicación: $e');
    } finally {
      if (mounted) setState(() => _capturandoGps = false);
    }
  }

  Future<void> _abrirGoogleMaps() async {
    final url = urlGoogleMaps(_nido);
    if (url == null) {
      _aviso('Indica una URL de Google Maps o captura las coordenadas.');
      return;
    }
    final ok = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!ok) _aviso('No se pudo abrir Google Maps.');
  }

  void _aviso(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _guardar() async {
    if (_guardando) return;
    if ((_nido.etiqueta ?? '').trim().isEmpty) {
      _tabs.animateTo(0);
      _aviso('La etiqueta del nido es obligatoria.');
      return;
    }
    if (_formKey.currentState?.validate() == false) {
      _aviso('Revisa los campos marcados en rojo.');
      return;
    }
    if ((_nido.coordenadaX == null) != (_nido.coordenadaY == null)) {
      _tabs.animateTo(0);
      _aviso('Indica ambas coordenadas (X e Y) o ninguna.');
      return;
    }
    setState(() => _guardando = true);
    try {
      final app = AppScope.of(context);
      final guardado = await app.nidos.guardar(_nido);
      if (!mounted) return;
      _modificado = false;
      _aviso('Nido guardado en el dispositivo. Se sincronizará con conexión.');
      if (widget.onGuardado != null) {
        widget.onGuardado!(guardado);
      } else if (!widget.embedded) {
        Navigator.of(context).pop(guardado);
      }
    } catch (e) {
      _aviso('Error al guardar: $e');
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<bool> _confirmarSalida() async {
    if (!_modificado) return true;
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cambios sin guardar'),
        content: const Text(
          'Si sales ahora se perderán los cambios de esta ficha.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Seguir editando'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Descartar'),
          ),
        ],
      ),
    );
    return r ?? false;
  }

  // -------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    final titulo = _esNuevo ? 'Nuevo nido' : _nido.titulo;
    return PopScope(
      canPop: !_modificado || widget.embedded,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        if (await _confirmarSalida()) navigator.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: !widget.embedded,
          title: Text(titulo, overflow: TextOverflow.ellipsis),
          actions: [
            if (widget.embedded && widget.onCerrar != null)
              IconButton(
                tooltip: 'Cerrar ficha',
                icon: const Icon(Icons.close),
                onPressed: () async {
                  if (await _confirmarSalida()) widget.onCerrar!();
                },
              ),
          ],
          bottom: TabBar(
            controller: _tabs,
            tabs: const [
              Tab(text: '🗺️ Ubicación'),
              Tab(text: '🪺 Incubación'),
              Tab(text: '🐣 Seguimiento y Manejo'),
              Tab(text: '🚜 Cosecha y Balance'),
            ],
          ),
        ),
        body: Form(
          key: _formKey,
          child: Column(
            children: [
              if (_nido.hasConflict) _bannerConflicto(),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    _pestana(_tabUbicacion()),
                    _pestana(_tabIncubacion()),
                    _pestana(_tabSeguimiento()),
                    _pestana(_tabCosecha()),
                  ],
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton(
              onPressed: _guardando ? null : _guardar,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
              ),
              child: _guardando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('💾 Guardar Nido'),
            ),
          ),
        ),
      ),
    );
  }

  Widget _bannerConflicto() {
    return MaterialBanner(
      backgroundColor: Colors.amber.shade100,
      leading: const Icon(Icons.warning_amber_rounded, color: Colors.orange),
      content: const Text(
        'Este nido se editó a la vez en otro dispositivo o en el panel web. '
        'Se conservó la versión más reciente (Last-Write-Wins). Revisa los datos.',
      ),
      actions: [
        TextButton(
          onPressed: () async {
            final app = AppScope.of(context);
            await app.nidos.marcarConflictoRevisado(_nido);
            if (mounted) setState(() => _nido.hasConflict = false);
          },
          child: const Text('Marcar como revisado'),
        ),
      ],
    );
  }

  Widget _pestana(List<Widget> hijos) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: ListView(padding: const EdgeInsets.all(16), children: hijos),
      ),
    );
  }

  // ---------------------------------------------------- Pestaña 1 · F1

  List<Widget> _tabUbicacion() {
    final n = _nido;
    return [
      FilaAdaptable(
        children: [
          CampoTexto(
            etiqueta: 'Numeración',
            valor: n.numeracion,
            onChanged: (v) => _cambio(() => n.numeracion = v),
          ),
          CampoTexto(
            etiqueta: 'Etiqueta *',
            valor: n.etiqueta,
            validador: (v) => (v ?? '').trim().isEmpty ? 'Obligatoria' : null,
            onChanged: (v) => _cambio(() => n.etiqueta = v),
          ),
          CampoTexto(
            etiqueta: 'Proyecto',
            valor: n.proyecto,
            onChanged: (v) => _cambio(() => n.proyecto = v),
          ),
          CampoDesplegable(
            etiqueta: 'Especie',
            valor: n.especie,
            opciones: OpcionesNido.especies,
            onChanged: (v) => _cambio(() => n.especie = v),
          ),
          CampoTexto(
            etiqueta: 'Propietario',
            valor: n.propietario,
            onChanged: (v) => _cambio(() => n.propietario = v),
          ),
          CampoTexto(
            etiqueta: 'Teléfono',
            valor: n.tlfn,
            teclado: TextInputType.phone,
            onChanged: (v) => _cambio(() => n.tlfn = v),
          ),
          CampoTexto(
            etiqueta: 'Municipio',
            valor: n.municipio,
            onChanged: (v) => _cambio(() => n.municipio = v),
          ),
          CampoTexto(
            etiqueta: 'Provincia',
            valor: n.provincia,
            onChanged: (v) => _cambio(() => n.provincia = v),
          ),
          CampoTexto(
            etiqueta: 'Referencia catastral',
            valor: n.referenciaCatastral,
            onChanged: (v) => _cambio(() => n.referenciaCatastral = v),
          ),
          CampoTexto(
            etiqueta: 'Territorio',
            valor: n.territorio,
            onChanged: (v) => _cambio(() => n.territorio = v),
          ),
          CampoTexto(
            etiqueta: 'Sustrato',
            valor: n.sustrato,
            ayuda: 'Cultivo o tipo de terreno donde está el nido',
            onChanged: (v) => _cambio(() => n.sustrato = v),
          ),
        ],
      ),
      const TituloSeccion('Localización'),
      FilaAdaptable(
        children: [
          CampoDecimal(
            key: ValueKey('x$_refresco'),
            etiqueta: 'Coordenada X (longitud)',
            valor: n.coordenadaX,
            minimo: -180,
            maximo: 180,
            onChanged: (v) => _cambio(() => n.coordenadaX = v),
          ),
          CampoDecimal(
            key: ValueKey('y$_refresco'),
            etiqueta: 'Coordenada Y (latitud)',
            valor: n.coordenadaY,
            minimo: -90,
            maximo: 90,
            onChanged: (v) => _cambio(() => n.coordenadaY = v),
          ),
        ],
      ),
      const SizedBox(height: 12),
      CampoTexto(
        key: ValueKey('url$_refresco'),
        etiqueta: 'URL de Google Maps',
        valor: n.googleMapsUrl,
        teclado: TextInputType.url,
        onChanged: (v) => _cambio(() => n.googleMapsUrl = v),
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          FilledButton.icon(
            onPressed: _capturandoGps ? null : _capturarGps,
            icon: _capturandoGps
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.my_location),
            label: const Text('Capturar GPS actual'),
          ),
          OutlinedButton.icon(
            onPressed: _abrirGoogleMaps,
            icon: const Icon(Icons.map_outlined),
            label: const Text('Abrir en Google Maps'),
          ),
        ],
      ),
    ];
  }

  // ---------------------------------------------------- Pestaña 2 · F2

  List<Widget> _tabIncubacion() {
    final n = _nido;
    final estimada = estimarFechaEclosion(n.fechaIncubacion);
    final faltan = diasHastaEclosion(n.fechaIncubacion);
    final esquema = Theme.of(context).colorScheme;
    String detalle() {
      if (faltan == null) return '';
      if (faltan > 1) return 'Faltan $faltan días';
      if (faltan == 1) return 'Falta 1 día';
      if (faltan == 0) return 'Eclosión prevista hoy';
      return 'Prevista hace ${-faltan} día${faltan == -1 ? '' : 's'}';
    }

    return [
      FilaAdaptable(
        children: [
          CampoFecha(
            etiqueta: 'Fecha de entrada al nido',
            valor: n.fechaEntradaNido,
            onChanged: (v) => _cambio(() => n.fechaEntradaNido = v),
          ),
          CampoFecha(
            etiqueta: 'Fecha de incubación',
            valor: n.fechaIncubacion,
            onChanged: (v) => _cambio(() => n.fechaIncubacion = v),
          ),
          CampoContador(
            etiqueta: 'Tamaño de puesta',
            valor: n.tamanoPuesta,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.tamanoPuesta = v),
          ),
          CampoContador(
            etiqueta: 'Nº huevos a la entrada',
            valor: n.numHuevosEntrada,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.numHuevosEntrada = v),
          ),
        ],
      ),
      const SizedBox(height: 16),
      Card(
        color: esquema.primaryContainer,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(
                Icons.egg_alt_outlined,
                size: 36,
                color: esquema.onPrimaryContainer,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Fecha Estimada de Eclosión',
                      style: Theme.of(context).textTheme.labelLarge
                          ?.copyWith(color: esquema.onPrimaryContainer),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      estimada == null
                          ? 'Indica la fecha de incubación'
                          : formatoFecha.format(estimada),
                      key: const Key('fecha-estimada-eclosion'),
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(
                            color: esquema.onPrimaryContainer,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    if (estimada != null)
                      Text(
                        '${detalle()} · incubación + $diasIncubacion días',
                        style: TextStyle(color: esquema.onPrimaryContainer),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 16),
      const TituloSeccion('Eclosión real'),
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: CampoFecha(
              etiqueta: 'Fecha de eclosión',
              valor: n.fechaEclosion,
              onChanged: (v) => _cambio(() => n.fechaEclosion = v),
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: estimada == null
                ? null
                : () => _cambio(() => n.fechaEclosion = estimada),
            child: const Text('Usar la estimada'),
          ),
        ],
      ),
    ];
  }

  // ---------------------------------------------------- Pestaña 3 · F3

  List<Widget> _tabSeguimiento() {
    final n = _nido;
    final app = AppScope.of(context);
    final edadCalculada = edadPollosDias(n.fechaEclosion);
    return [
      FilaAdaptable(
        columnasMax: 3,
        children: [
          CampoContador(
            etiqueta: 'Pollos nacidos',
            valor: n.numPollosNacidos,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.numPollosNacidos = v),
          ),
          CampoContador(
            etiqueta: 'Huevos no eclosionados',
            valor: n.numHuevosNoEclosionados,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.numHuevosNoEclosionados = v),
          ),
          CampoContador(
            key: ValueKey('edad$_refresco'),
            etiqueta: 'Edad (días)',
            valor: n.edadDias,
            maximo: 120,
            onChanged: (v) => _cambio(() => n.edadDias = v),
          ),
        ],
      ),
      if (edadCalculada != null)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => _cambio(() {
              n.edadDias = edadCalculada;
              _refresco++;
            }),
            icon: const Icon(Icons.calculate_outlined),
            label: Text(
              'Calcular edad desde la eclosión ($edadCalculada días)',
            ),
          ),
        ),
      const SizedBox(height: 8),
      FilaAdaptable(
        children: [
          CampoTexto(
            etiqueta: 'Anilla PVC',
            valor: n.anillasPvc,
            onChanged: (v) => _cambio(() => n.anillasPvc = v),
          ),
          CampoTexto(
            etiqueta: 'Anilla metálica',
            valor: n.anillasMetalica,
            onChanged: (v) => _cambio(() => n.anillasMetalica = v),
          ),
        ],
      ),
      const TituloSeccion('Manejo'),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        title: const Text('Intervención realizada'),
        value: n.intervencion,
        onChanged: (v) => _cambio(() => n.intervencion = v ?? false),
      ),
      Text(
        'Tipo de acciones de manejo',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      const SizedBox(height: 4),
      Wrap(
        spacing: 8,
        children: [
          for (final t in {
            ...OpcionesNido.tiposManejo,
            ...n.tipoAccionesManejo,
          })
            FilterChip(
              label: Text(t),
              selected: n.tipoAccionesManejo.contains(t),
              onSelected: (sel) => _cambio(() {
                final l = List<String>.of(n.tipoAccionesManejo);
                sel ? l.add(t) : l.remove(t);
                n.tipoAccionesManejo = l;
                if (sel) n.intervencion = true;
              }),
            ),
        ],
      ),
      const SizedBox(height: 12),
      CampoTexto(
        etiqueta: 'Observaciones I',
        valor: n.observacionesI,
        maxLines: 6,
        minLines: 4,
        onChanged: (v) => _cambio(() => n.observacionesI = v),
      ),
      const SizedBox(height: 12),
      CampoTexto(
        etiqueta: 'Observaciones II',
        valor: n.observacionesIi,
        maxLines: 6,
        minLines: 4,
        onChanged: (v) => _cambio(() => n.observacionesIi = v),
      ),
      const TituloSeccion('Fotografías de seguimiento'),
      ImagePickerWidget(
        nido: n,
        etapa: EtapaFoto.seguimiento,
        almacen: app.imagenes,
        onChanged: () => _cambio(() {}),
      ),
    ];
  }

  // ---------------------------------------------------- Pestaña 4 · F4

  List<Widget> _tabCosecha() {
    final n = _nido;
    final app = AppScope.of(context);
    final volados =
        (n.pollosVoladosPrecosecha ?? 0) + (n.pollosVoladosPostcosecha ?? 0);
    final muertos =
        (n.pollosMuertosPrecosecha ?? 0) +
        (n.pollosMuertosCosecha ?? 0) +
        (n.pollosMuertosPostcosecha ?? 0);
    final esFracaso = n.estadoReproductivo == EstadoReproductivo.fracaso;
    return [
      FilaAdaptable(
        children: [
          CampoFecha(
            etiqueta: 'Fecha de vuelo',
            valor: n.fechaVuelo,
            onChanged: (v) => _cambio(() => n.fechaVuelo = v),
          ),
          CampoFecha(
            etiqueta: 'Fecha de cosecha',
            valor: n.fechaCosecha,
            onChanged: (v) => _cambio(() => n.fechaCosecha = v),
          ),
        ],
      ),
      const TituloSeccion('Pollos volados'),
      FilaAdaptable(
        children: [
          CampoContador(
            etiqueta: 'Volados pre-cosecha',
            valor: n.pollosVoladosPrecosecha,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.pollosVoladosPrecosecha = v),
          ),
          CampoContador(
            etiqueta: 'Volados post-cosecha',
            valor: n.pollosVoladosPostcosecha,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.pollosVoladosPostcosecha = v),
          ),
        ],
      ),
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          'Total volados: $volados',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
      const TituloSeccion('Pollos muertos'),
      FilaAdaptable(
        columnasMax: 3,
        children: [
          CampoContador(
            etiqueta: 'Muertos pre-cosecha',
            valor: n.pollosMuertosPrecosecha,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.pollosMuertosPrecosecha = v),
          ),
          CampoContador(
            etiqueta: 'Muertos durante cosecha',
            valor: n.pollosMuertosCosecha,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.pollosMuertosCosecha = v),
          ),
          CampoContador(
            etiqueta: 'Muertos post-cosecha',
            valor: n.pollosMuertosPostcosecha,
            maximo: 12,
            onChanged: (v) => _cambio(() => n.pollosMuertosPostcosecha = v),
          ),
        ],
      ),
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          'Total muertos: $muertos',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
      const TituloSeccion('Balance'),
      FilaAdaptable(
        children: [
          CampoDesplegable(
            etiqueta: 'Resultado reproductivo',
            valor: n.resultadoReproductivo,
            opciones: OpcionesNido.resultados,
            textoVacio: 'Sin definir (en curso)',
            onChanged: (v) => _cambio(() => n.resultadoReproductivo = v),
          ),
          CampoDesplegable(
            etiqueta: 'Estado final',
            valor: n.estadoFinal,
            opciones: OpcionesNido.estadosFinales,
            onChanged: (v) => _cambio(() => n.estadoFinal = v),
          ),
          if (esFracaso)
            CampoDesplegable(
              etiqueta: 'Causas del fracaso',
              valor: n.causasFracaso,
              opciones: OpcionesNido.causasFracaso,
              onChanged: (v) => _cambio(() => n.causasFracaso = v),
            ),
          if (esFracaso)
            CampoDesplegable(
              etiqueta: 'Fase del fracaso',
              valor: n.estadoFracaso,
              opciones: OpcionesNido.estadosFracaso,
              onChanged: (v) => _cambio(() => n.estadoFracaso = v),
            ),
        ],
      ),
      const TituloSeccion('Fotografías de cosecha'),
      ImagePickerWidget(
        nido: n,
        etapa: EtapaFoto.cosecha,
        almacen: app.imagenes,
        onChanged: () => _cambio(() {}),
      ),
    ];
  }
}
