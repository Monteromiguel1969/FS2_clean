import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;

import '../app/app_services.dart';
import '../models/mapa_fondo.dart';
import '../models/nido_filter.dart';
import '../models/nido_grefa_model.dart';
import '../services/app_directories.dart';
import '../services/fondo_mapa_prefs.dart';
import '../services/informe_tecnico.dart';
import '../services/mapa_imagen.dart';
import '../services/presentacion.dart';
import '../services/presentacion_pptx.dart';
import '../widgets/entrega_archivos.dart';
import '../widgets/responsive.dart';

/// Emisión de informes técnicos completos (como en la web): datos calculados
/// con precisión + textos editables, y salida a PDF / Word / HTML.
class InformeTecnicoScreen extends StatefulWidget {
  const InformeTecnicoScreen({
    super.key,
    required this.nidos,
    this.filtros = '',
    this.individual = false,
    this.fabricaMapas,
    this.geo,
  });

  final List<NidoGrefaModel> nidos;

  /// Descripción de los filtros aplicados (se cita en «Objeto y alcance»).
  final String filtros;

  /// Informe de un solo nido (ficha técnica + conclusiones).
  final bool individual;

  /// Generador de mapas (inyectable en pruebas). Recibe el fondo elegido
  /// (Mapa OSM u Ortofoto PNOA); por defecto descarga las teselas de internet.
  final GeneradorMapas Function(MapaFondo fondo)? fabricaMapas;

  /// Filtro aplicado en la selección (comunidad, provincia, localidad, proyecto,
  /// campaña): titula el mapa general y el ámbito de la presentación.
  final NidoFilter? geo;

  @override
  State<InformeTecnicoScreen> createState() => _InformeTecnicoScreenState();
}

class _InformeTecnicoScreenState extends State<InformeTecnicoScreen> {
  late InformeBorrador _b;
  final _titulo = TextEditingController();
  final _referencia = TextEditingController();
  final _destinatario = TextEditingController();
  final _autor = TextEditingController();
  final _cargo = TextEditingController();
  final _alcance = TextEditingController();
  final _conclusiones = TextEditingController();
  bool _didInit = false;
  bool _busy = false;

  /// Niveles de mapas de localización a incluir.
  final Set<String> _nivelesMapa = {'general'};
  bool _mapaIndividual = true;
  String? _progreso;
  List<MapaGenerado>? _mapasCache;
  String? _mapasClave;
  MapaFondo _fondo = MapaFondo.osm;
  bool _fondoTocado = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didInit) return;
    _didInit = true;
    final email = AppServices.of(context).auth?.email ?? '';
    final autorDef = email.contains('@')
        ? email.split('@').first.replaceAll(RegExp(r'[._]'), ' ')
        : '';
    final hoy = DateTime.now();
    final anio = anioCampanaInforme(widget.nidos, hoy);
    final etiqueta = widget.nidos.length == 1
        ? (widget.nidos.first.etiqueta ?? widget.nidos.first.numeracion ?? '')
        : '';
    _b = InformeBorrador(
      nidos: widget.nidos,
      titulo: widget.individual
          ? 'Informe técnico del nido $etiqueta'
          : 'Informe técnico de seguimiento reproductor · Campaña Aguilucho $anio',
      referencia: referenciaInformePorDefecto(hoy),
      fecha: hoy,
      autor: autorDef,
      filtros: widget.filtros,
      individual: widget.individual,
    );
    _titulo.text = _b.titulo;
    _referencia.text = _b.referencia;
    _autor.text = _b.autor;
    _alcance.text = _b.alcance;
    _conclusiones.text = _b.conclusiones;
    _cargarFirma();
    leerFondoMapa(AppServices.of(context).db).then((f) {
      if (mounted && !_fondoTocado && f != _fondo) {
        setState(() {
          _fondo = f;
          _mapasCache = null;
        });
      }
    });
  }

  @override
  void dispose() {
    for (final c in [_titulo, _referencia, _destinatario, _autor, _cargo, _alcance, _conclusiones]) {
      c.dispose();
    }
    super.dispose();
  }

  // Autor / cargo / destinatario se recuerdan para el siguiente informe.
  Future<File> _firmaFile() async =>
      File(p.join((await appDataDirectory()).path, 'informe_firma.json'));

  Future<void> _cargarFirma() async {
    try {
      final f = await _firmaFile();
      if (!await f.exists()) return;
      final m = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        if (m['autor'] is String && (m['autor'] as String).isNotEmpty) _autor.text = m['autor'] as String;
        if (m['cargo'] is String) _cargo.text = m['cargo'] as String;
        if (m['destinatario'] is String) _destinatario.text = m['destinatario'] as String;
      });
    } catch (_) {
      // sin almacenamiento disponible: no se recuerdan los datos
    }
  }

  Future<void> _guardarFirma() async {
    try {
      await (await _firmaFile()).writeAsString(jsonEncode({
        'autor': _autor.text.trim(),
        'cargo': _cargo.text.trim(),
        'destinatario': _destinatario.text.trim(),
      }));
    } catch (_) {}
  }

  void _volcar() {
    _b
      ..titulo = _titulo.text.trim().isEmpty ? _b.titulo : _titulo.text.trim()
      ..referencia = _referencia.text.trim().isEmpty ? _b.referencia : _referencia.text.trim()
      ..destinatario = _destinatario.text.trim()
      ..autor = _autor.text.trim()
      ..cargo = _cargo.text.trim()
      ..alcance = _alcance.text
      ..conclusiones = _conclusiones.text;
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  /// Genera (o reutiliza) los mapas según las opciones elegidas.
  Future<List<MapaGenerado>> _generarMapas() async {
    final niveles = widget.individual
        ? (_mapaIndividual ? <String>{'general'} : <String>{})
        : {..._nivelesMapa};
    if (niveles.isEmpty) return [];
    final clave = '${_fondo.id}:${(niveles.toList()..sort()).join(',')}';
    if (_mapasCache != null && _mapasClave == clave) return _mapasCache!;
    final gen = widget.fabricaMapas != null
        ? widget.fabricaMapas!(_fondo)
        : GeneradorMapas(fondo: _fondo);
    final etiqueta = widget.nidos.isEmpty
        ? ''
        : (widget.nidos.first.etiqueta ?? widget.nidos.first.numeracion ?? '');
    if (mounted) setState(() => _progreso = 'Generando mapas de localización…');
    final r = await gen.generar(
      widget.nidos,
      niveles,
      tituloGeneral: widget.individual ? 'Nido $etiqueta' : _tituloMapaGeneral,
      progreso: (h, t) {
        if (mounted) setState(() => _progreso = 'Generando mapas de localización ($h/$t)…');
      },
    );
    _mapasCache = r;
    _mapasClave = clave;
    return r;
  }

  String get _tituloMapaGeneral {
    final g = widget.geo;
    if (g == null) return 'Todos los nidos';
    return tituloMapaGeneral(
        pais: g.pais, comunidad: g.comunidad, provincia: g.provincia, localidad: g.localidad);
  }

  String get _ambito {
    final g = widget.geo;
    if (g == null) return 'Todos los nidos';
    return ambitoPresentacion(
      proyecto: g.proyecto,
      campana: g.campana,
      pais: g.pais,
      comunidad: g.comunidad,
      provincia: g.provincia,
      localidad: g.localidad,
      sinValor: NidoFilter.sinValor,
    );
  }

  void _cambiarFondo(MapaFondo f) {
    _fondoTocado = true;
    setState(() {
      _fondo = f;
      _mapasCache = null;
    });
    guardarFondoMapa(AppServices.of(context).db, f);
  }

  Future<void> _emitir(Set<String> formatos) async {
    if (!widget.individual && _b.secciones.isEmpty) {
      _snack('Selecciona al menos una sección.');
      return;
    }
    _volcar();
    setState(() => _busy = true);
    try {
      _b.mapas = await _generarMapas();
      _b.fondo = _fondo;
      final doc = InformeTecnico.construir(_b);
      final archivos = <ArchivoExportado>[];
      if (formatos.contains('pptx')) {
        final pres = armarPresentacion(
          _b,
          ambito: _ambito,
          sinCoordenadas: widget.nidos.where((n) => !n.tieneCoordenadas).length,
        );
        archivos.add(ArchivoExportado(
          nombre: pres.nombre,
          mime: mimePptx,
          ext: 'pptx',
          bytes: construirPptx(pres),
        ));
      }
      if (formatos.contains('pdf')) {
        archivos.add(ArchivoExportado(
          nombre: nombreArchivoInforme(_b.referencia, 'pdf'),
          mime: 'application/pdf',
          ext: 'pdf',
          bytes: await InformeRender.pdf(doc),
        ));
      }
      if (formatos.contains('doc')) {
        archivos.add(ArchivoExportado(
          nombre: nombreArchivoInforme(_b.referencia, 'doc'),
          mime: 'application/msword',
          ext: 'doc',
          bytes: utf8.encode('\u{FEFF}${InformeRender.word(doc)}'),
        ));
      }
      if (formatos.contains('html')) {
        archivos.add(ArchivoExportado(
          nombre: nombreArchivoInforme(_b.referencia, 'html'),
          mime: 'text/html',
          ext: 'html',
          bytes: utf8.encode(InformeRender.html(doc)),
        ));
      }
      await _guardarFirma();
      if (!mounted) return;
      setState(() => _busy = false);
      await entregarArchivos(context, archivos);
    } catch (e) {
      _snack('Error al generar el informe: $e');
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _progreso = null;
        });
      }
    }
  }

  Future<void> _editarJustificaciones() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => _JustificacionesScreen(borrador: _b),
    ));
    if (mounted) setState(() {});
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  Widget _campo(TextEditingController c, String etiqueta, {Key? key, int maxLines = 1}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          key: key,
          controller: c,
          maxLines: maxLines,
          minLines: maxLines > 1 ? 3 : 1,
          decoration: InputDecoration(
            labelText: etiqueta,
            border: const OutlineInputBorder(),
            alignLabelWithHint: maxLines > 1,
          ),
        ),
      );

  Widget _textoEditable({
    required TextEditingController c,
    required String titulo,
    required String Function() automatico,
    required Key tecla,
  }) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(titulo, style: Theme.of(context).textTheme.titleSmall)),
          TextButton.icon(
            icon: const Icon(Icons.restart_alt, size: 18),
            label: const Text('Restaurar automático'),
            onPressed: () => setState(() => c.text = automatico()),
          ),
        ]),
        _campo(c, 'Texto (editable)', key: tecla, maxLines: 8),
      ]);

  @override
  Widget build(BuildContext context) {
    final cuerpo = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              widget.individual
                  ? 'Informe técnico del nido con sus 4 fases, posición, balance y conclusiones. Los datos se toman del nido; el texto es editable antes de emitir.'
                  : 'Las cifras se calculan con los ${widget.nidos.length} nidos seleccionados; los textos son un borrador que puedes editar libremente antes de emitir el informe.',
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('Documento', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        _campo(_titulo, 'Título', key: const Key('inf-titulo')),
        _campo(_referencia, 'Referencia', key: const Key('inf-ref')),
        _campo(_destinatario, 'Destinatario (opcional)', key: const Key('inf-dest')),
        _campo(_autor, 'Elaborado por', key: const Key('inf-autor')),
        _campo(_cargo, 'Cargo (opcional)', key: const Key('inf-cargo')),
        if (!widget.individual) ...[
          const SizedBox(height: 8),
          Text('Secciones', style: Theme.of(context).textTheme.titleLarge),
          for (final s in SeccionInforme.values)
            CheckboxListTile(
              key: Key('sec-${s.name}'),
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(s.etiqueta),
              value: _b.secciones.contains(s),
              onChanged: (v) => setState(
                  () => v == true ? _b.secciones.add(s) : _b.secciones.remove(s)),
            ),
          const SizedBox(height: 8),
          Text('Mapas de localización', style: Theme.of(context).textTheme.titleLarge),
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
                'Un mapa por grupo, con los nidos coloreados por resultado y encuadrados en los nidos de la selección. Necesita conexión para descargar el fondo; sin ella solo se dibujan los puntos.',
                style: TextStyle(fontSize: 12)),
          ),
          Row(children: [
            const Text('Fondo: '),
            const SizedBox(width: 8),
            Flexible(
              child: SegmentedButton<MapaFondo>(
                key: const Key('inf-fondo'),
                showSelectedIcon: false,
                segments: [
                  for (final f in MapaFondo.values)
                    ButtonSegment(value: f, label: Text(f.etiqueta)),
                ],
                selected: {_fondo},
                onSelectionChanged: (v) => _cambiarFondo(v.first),
              ),
            ),
          ]),
          const SizedBox(height: 4),
          for (final (clave, etiqueta) in const [
            ('general', 'General (todos los nidos)'),
            ('comunidad', 'Por comunidades autónomas'),
            ('provincia', 'Por provincias'),
            ('localidad', 'Por localidades'),
          ])
            CheckboxListTile(
              key: Key('mapa-$clave'),
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(etiqueta),
              value: _nivelesMapa.contains(clave),
              onChanged: (v) => setState(
                  () => v == true ? _nivelesMapa.add(clave) : _nivelesMapa.remove(clave)),
            ),
        ] else if (widget.nidos.length == 1 && widget.nidos.first.tieneCoordenadas)
          CheckboxListTile(
            key: const Key('mapa-individual'),
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('Incluir mapa de localización del nido'),
            value: _mapaIndividual,
            onChanged: (v) => setState(() => _mapaIndividual = v == true),
          ),
        const SizedBox(height: 8),
        Text('Textos del informe', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        if (!widget.individual)
          _textoEditable(
            c: _alcance,
            titulo: 'Objeto y alcance',
            automatico: () {
              _volcar();
              return _b.textoAlcance();
            },
            tecla: const Key('inf-alcance'),
          ),
        _textoEditable(
          c: _conclusiones,
          titulo: 'Observaciones y conclusiones',
          automatico: () => widget.individual && widget.nidos.length == 1
              ? InformeBorrador.textoConclusionesNido(widget.nidos.first)
              : _b.textoConclusiones(),
          tecla: const Key('inf-conclusiones'),
        ),
        if (!widget.individual || widget.nidos.length == 1)
          Card(
            child: ListTile(
              key: const Key('inf-editar-just'),
              leading: const Icon(Icons.edit_note),
              title: Text(widget.individual
                  ? 'Justificación de conservación'
                  : 'Justificaciones por nido (${widget.nidos.length})'),
              subtitle: const Text('Edita el texto de justificación que aparece en el informe'),
              trailing: const Icon(Icons.chevron_right),
              onTap: _editarJustificaciones,
            ),
          ),
        const SizedBox(height: 90),
      ],
    );

    return Scaffold(
      appBar: AppBar(title: Text(widget.individual ? 'Informe del nido' : 'Informe técnico')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (_busy) const LinearProgressIndicator(),
            if (_progreso != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(_progreso!, style: const TextStyle(fontSize: 12)),
              ),
            const SizedBox(height: 8),
            Wrap(spacing: 10, runSpacing: 8, alignment: WrapAlignment.center, children: [
              FilledButton.icon(
                key: const Key('inf-pdf'),
                onPressed: _busy ? null : () => _emitir({'pdf'}),
                icon: const Icon(Icons.picture_as_pdf),
                label: const Text('Informe PDF'),
              ),
              FilledButton.tonalIcon(
                key: const Key('inf-word'),
                onPressed: _busy ? null : () => _emitir({'doc'}),
                icon: const Icon(Icons.description),
                label: const Text('Word (.doc)'),
              ),
              if (!widget.individual)
                FilledButton.tonalIcon(
                  key: const Key('inf-pptx'),
                  onPressed: _busy ? null : () => _emitir({'pptx'}),
                  icon: const Icon(Icons.slideshow),
                  label: const Text('PowerPoint (.pptx)'),
                ),
              OutlinedButton.icon(
                key: const Key('inf-html'),
                onPressed: _busy ? null : () => _emitir({'html'}),
                icon: const Icon(Icons.code),
                label: const Text('HTML'),
              ),
              OutlinedButton.icon(
                key: const Key('inf-todos'),
                onPressed: _busy ? null : () => _emitir({'pdf', 'doc'}),
                icon: const Icon(Icons.library_books_outlined),
                label: const Text('PDF + Word'),
              ),
            ]),
          ]),
        ),
      ),
      body: Breakpoints.isWide(context)
          ? Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 820), child: cuerpo))
          : cuerpo,
    );
  }
}

class _JustificacionesScreen extends StatelessWidget {
  const _JustificacionesScreen({required this.borrador});
  final InformeBorrador borrador;

  @override
  Widget build(BuildContext context) {
    final nidos = borrador.nidos;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Justificaciones'),
        actions: [
          TextButton(
            onPressed: () {
              for (final n in nidos) {
                borrador.justificaciones[n.id] = justificacionPorDefecto(n);
              }
              Navigator.of(context).pop();
            },
            child: const Text('Restaurar todas'),
          ),
        ],
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: nidos.length,
        itemBuilder: (_, i) {
          final n = nidos[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TextFormField(
              key: ValueKey('just-${n.id}'),
              initialValue: borrador.justificaciones[n.id] ?? justificacionPorDefecto(n),
              maxLines: null,
              minLines: 2,
              onChanged: (v) => borrador.justificaciones[n.id] = v,
              decoration: InputDecoration(
                labelText:
                    '${n.etiqueta ?? n.numeracion ?? 'Nido'} · ${n.municipio ?? ''} · ${n.estadoReproductivo.etiqueta}',
                border: const OutlineInputBorder(),
              ),
            ),
          );
        },
      ),
    );
  }
}
