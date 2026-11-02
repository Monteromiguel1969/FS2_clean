import 'dart:io';

import 'package:flutter/material.dart';

import '../logic/exportacion.dart';
import '../logic/texto.dart';
import '../models/nido_campo.dart';
import '../models/nido_grefa_model.dart';
import '../services/export_service.dart';
import '../state/app_scope.dart';
import '../widgets/campos_formulario.dart';

/// Exportación a Excel y PDF con filtros y selector de columnas a la carta.
class ExportScreen extends StatefulWidget {
  const ExportScreen({super.key, this.embedded = false, this.servicio});

  final bool embedded;
  final ExportService? servicio;

  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends State<ExportScreen> {
  late final ExportService _servicio = widget.servicio ?? ExportService();

  DateTime? _desde;
  DateTime? _hasta;
  final Set<String> _municipios = {};
  EstadoReproductivo? _estado;
  late final Set<String> _columnas = {for (final c in camposNido) c.clave};
  bool _trabajando = false;

  List<NidoGrefaModel> _seleccion(List<NidoGrefaModel> todos) =>
      filtrarParaExportar(
        todos,
        FiltroExportacion(
          desde: _desde,
          hasta: _hasta,
          municipios: _municipios,
          estado: _estado,
        ),
      );

  Future<void> _elegirRango() async {
    final hoy = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(hoy.year - 10),
      lastDate: DateTime(hoy.year + 2, 12, 31),
      initialDateRange: _desde != null && _hasta != null
          ? DateTimeRange(start: _desde!, end: _hasta!)
          : null,
      helpText: 'Rango de fechas de la campaña',
    );
    if (r != null) {
      setState(() {
        _desde = r.start;
        _hasta = r.end;
      });
    }
  }

  Future<void> _exportar({required bool pdf}) async {
    final todos = AppScope.of(context).nidos.todos;
    final nidos = _seleccion(todos);
    final columnas = camposNido
        .where((c) => _columnas.contains(c.clave))
        .toList();
    setState(() => _trabajando = true);
    try {
      final File archivo;
      if (pdf) {
        final bytes = await _servicio.generarPdf(
          nidos,
          desde: _desde,
          hasta: _hasta,
        );
        archivo = await _servicio.guardar(
          bytes,
          ExportService.nombreArchivo('informe_grefa', 'pdf'),
        );
      } else {
        final bytes = _servicio.generarExcel(nidos, columnas);
        archivo = await _servicio.guardar(
          bytes,
          ExportService.nombreArchivo('nidos_grefa', 'xlsx'),
        );
      }
      if (!mounted) return;
      var compartido = false;
      try {
        compartido = await _servicio.compartir(
          archivo,
          texto: pdf
              ? 'Informe de campaña GREFA'
              : 'Exportación de nidos GREFA',
        );
      } catch (_) {
        compartido = false;
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 8),
            content: Text(
              compartido
                  ? 'Archivo generado: ${archivo.path}'
                  : 'Archivo guardado en: ${archivo.path}',
            ),
          ),
        );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('No se pudo exportar: $e')));
    } finally {
      if (mounted) setState(() => _trabajando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nidosCtrl = AppScope.of(context).nidos;
    return ListenableBuilder(
      listenable: nidosCtrl,
      builder: (context, _) {
        final todos = nidosCtrl.todos;
        final seleccion = _seleccion(todos);
        final municipios = nidosCtrl.municipios;
        final cuerpo = Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _filtros(municipios),
                const SizedBox(height: 16),
                _selectorColumnas(),
                const SizedBox(height: 16),
                _acciones(seleccion.length),
              ],
            ),
          ),
        );
        if (widget.embedded) return cuerpo;
        return Scaffold(
          appBar: AppBar(title: const Text('Exportar datos')),
          body: cuerpo,
        );
      },
    );
  }

  Widget _filtros(List<String> municipios) {
    final rango = _desde == null || _hasta == null
        ? 'Toda la campaña'
        : '${formatoFecha.format(_desde!)} - ${formatoFecha.format(_hasta!)}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Filtros', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('btn-rango'),
                    onPressed: _elegirRango,
                    icon: const Icon(Icons.date_range),
                    label: Text('Rango de campaña: $rango'),
                  ),
                ),
                if (_desde != null)
                  IconButton(
                    tooltip: 'Quitar rango',
                    icon: const Icon(Icons.clear),
                    onPressed: () => setState(() {
                      _desde = null;
                      _hasta = null;
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Estado reproductivo',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 4),
            SegmentedButton<EstadoReproductivo?>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: null, label: Text('Todos')),
                ButtonSegment(
                  value: EstadoReproductivo.exito,
                  label: Text('Éxito'),
                ),
                ButtonSegment(
                  value: EstadoReproductivo.fracaso,
                  label: Text('Fracaso'),
                ),
              ],
              selected: {
                _estado == EstadoReproductivo.enCurso ? null : _estado,
              },
              onSelectionChanged: (s) => setState(() => _estado = s.first),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text(
                  'Municipios',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => setState(_municipios.clear),
                  child: const Text('Todos'),
                ),
              ],
            ),
            if (municipios.isEmpty)
              const Text('Aún no hay municipios registrados.')
            else
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final m in municipios)
                    FilterChip(
                      label: Text(m),
                      selected: _municipios.any(
                        (s) => normalizarTexto(s) == normalizarTexto(m),
                      ),
                      onSelected: (sel) => setState(() {
                        sel
                            ? _municipios.add(m)
                            : _municipios.removeWhere(
                                (s) => normalizarTexto(s) == normalizarTexto(m),
                              );
                      }),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _selectorColumnas() {
    final grupos = camposPorFase();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Columnas del Excel (${_columnas.length} de ${camposNido.length})',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                TextButton(
                  onPressed: () => setState(
                    () => _columnas.addAll(camposNido.map((c) => c.clave)),
                  ),
                  child: const Text('Todas'),
                ),
                TextButton(
                  onPressed: () => setState(_columnas.clear),
                  child: const Text('Ninguna'),
                ),
              ],
            ),
            for (final e in grupos.entries)
              ExpansionTile(
                key: PageStorageKey(e.key.name),
                tilePadding: EdgeInsets.zero,
                initiallyExpanded: true,
                title: Text(
                  '${e.key.titulo} (${e.value.where((c) => _columnas.contains(c.clave)).length}/${e.value.length})',
                ),
                trailing: Checkbox(
                  tristate: true,
                  value: _estadoFase(e.value),
                  onChanged: (_) => setState(() {
                    final todas = e.value.every(
                      (c) => _columnas.contains(c.clave),
                    );
                    for (final c in e.value) {
                      todas
                          ? _columnas.remove(c.clave)
                          : _columnas.add(c.clave);
                    }
                  }),
                ),
                children: [
                  Wrap(
                    children: [
                      for (final c in e.value)
                        SizedBox(
                          width: 280,
                          child: CheckboxListTile(
                            dense: true,
                            controlAffinity: ListTileControlAffinity.leading,
                            contentPadding: EdgeInsets.zero,
                            title: Text(c.etiqueta),
                            value: _columnas.contains(c.clave),
                            onChanged: (v) => setState(
                              () => v == true
                                  ? _columnas.add(c.clave)
                                  : _columnas.remove(c.clave),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  bool? _estadoFase(List<NidoCampo> campos) {
    final n = campos.where((c) => _columnas.contains(c.clave)).length;
    if (n == 0) return false;
    if (n == campos.length) return true;
    return null;
  }

  Widget _acciones(int nidos) {
    final sinDatos = nidos == 0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$nidos nido(s) cumplen los filtros',
              key: const Key('texto-seleccion'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  key: const Key('btn-excel'),
                  onPressed: _trabajando || sinDatos || _columnas.isEmpty
                      ? null
                      : () => _exportar(pdf: false),
                  icon: const Icon(Icons.table_chart),
                  label: const Text('Exportar a Excel (.xlsx)'),
                ),
                FilledButton.tonalIcon(
                  key: const Key('btn-pdf'),
                  onPressed: _trabajando || sinDatos
                      ? null
                      : () => _exportar(pdf: true),
                  icon: const Icon(Icons.picture_as_pdf),
                  label: const Text('Generar Informe PDF'),
                ),
                if (_trabajando)
                  const Padding(
                    padding: EdgeInsets.all(8),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
              ],
            ),
            if (!sinDatos && _columnas.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Selecciona al menos una columna para el Excel.'),
              ),
          ],
        ),
      ),
    );
  }
}
