import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

final DateFormat formatoFecha = DateFormat('dd/MM/yyyy', 'es');

/// Texto libre (una o varias líneas).
class CampoTexto extends StatelessWidget {
  const CampoTexto({
    super.key,
    required this.etiqueta,
    required this.valor,
    required this.onChanged,
    this.maxLines = 1,
    this.minLines,
    this.teclado,
    this.validador,
    this.sufijo,
    this.ayuda,
  });

  final String etiqueta;
  final String? valor;
  final ValueChanged<String?> onChanged;
  final int maxLines;
  final int? minLines;
  final TextInputType? teclado;
  final String? Function(String?)? validador;
  final Widget? sufijo;
  final String? ayuda;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: valor,
      maxLines: maxLines,
      minLines: minLines,
      keyboardType: teclado ?? (maxLines > 1 ? TextInputType.multiline : null),
      validator: validador,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      decoration: InputDecoration(
        labelText: etiqueta,
        helperText: ayuda,
        suffixIcon: sufijo,
        alignLabelWithHint: maxLines > 1,
      ),
      onChanged: (v) => onChanged(v.trim().isEmpty ? null : v),
    );
  }
}

/// Número decimal (coordenadas).
class CampoDecimal extends StatelessWidget {
  const CampoDecimal({
    super.key,
    required this.etiqueta,
    required this.valor,
    required this.onChanged,
    this.minimo,
    this.maximo,
  });

  final String etiqueta;
  final double? valor;
  final ValueChanged<double?> onChanged;
  final double? minimo;
  final double? maximo;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: valor?.toString(),
      keyboardType: const TextInputType.numberWithOptions(
        decimal: true,
        signed: true,
      ),
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,\-]')),
      ],
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: (v) {
        if (v == null || v.trim().isEmpty) return null;
        final d = double.tryParse(v.trim().replaceAll(',', '.'));
        if (d == null) return 'Número no válido';
        if (minimo != null && d < minimo!) return 'Mínimo $minimo';
        if (maximo != null && d > maximo!) return 'Máximo $maximo';
        return null;
      },
      decoration: InputDecoration(labelText: etiqueta),
      onChanged: (v) =>
          onChanged(double.tryParse(v.trim().replaceAll(',', '.'))),
    );
  }
}

/// Contador entero con botones − / +.
class CampoContador extends StatefulWidget {
  const CampoContador({
    super.key,
    required this.etiqueta,
    required this.valor,
    required this.onChanged,
    this.maximo = 999,
  });

  final String etiqueta;
  final int? valor;
  final ValueChanged<int?> onChanged;
  final int maximo;

  @override
  State<CampoContador> createState() => _CampoContadorState();
}

class _CampoContadorState extends State<CampoContador> {
  late final TextEditingController _ctrl = TextEditingController(
    text: widget.valor?.toString() ?? '',
  );

  @override
  void didUpdateWidget(CampoContador old) {
    super.didUpdateWidget(old);
    final actual = int.tryParse(_ctrl.text);
    if (widget.valor != actual) {
      _ctrl.text = widget.valor?.toString() ?? '';
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _cambiar(int delta) {
    final nuevo = ((int.tryParse(_ctrl.text) ?? 0) + delta).clamp(
      0,
      widget.maximo,
    );
    _ctrl.text = '$nuevo';
    widget.onChanged(nuevo);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(
        labelText: widget.etiqueta,
        contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Restar uno',
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: () => _cambiar(-1),
          ),
          Expanded(
            child: TextField(
              controller: _ctrl,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                border: InputBorder.none,
                hintText: '—',
                isDense: true,
              ),
              onChanged: (v) => widget.onChanged(int.tryParse(v)),
            ),
          ),
          IconButton(
            tooltip: 'Sumar uno',
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () => _cambiar(1),
          ),
        ],
      ),
    );
  }
}

/// Selector de fecha con botón de borrado.
class CampoFecha extends StatelessWidget {
  const CampoFecha({
    super.key,
    required this.etiqueta,
    required this.valor,
    required this.onChanged,
  });

  final String etiqueta;
  final DateTime? valor;
  final ValueChanged<DateTime?> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(4),
      onTap: () async {
        final hoy = DateTime.now();
        final r = await showDatePicker(
          context: context,
          initialDate: valor ?? hoy,
          firstDate: DateTime(hoy.year - 10),
          lastDate: DateTime(hoy.year + 2, 12, 31),
          helpText: etiqueta,
        );
        if (r != null) onChanged(DateTime(r.year, r.month, r.day));
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: etiqueta,
          suffixIcon: valor == null
              ? const Icon(Icons.calendar_today_outlined, size: 20)
              : IconButton(
                  tooltip: 'Borrar fecha',
                  icon: const Icon(Icons.clear, size: 20),
                  onPressed: () => onChanged(null),
                ),
        ),
        child: Text(
          valor == null ? 'Sin fecha' : formatoFecha.format(valor!),
          style: valor == null
              ? TextStyle(color: Theme.of(context).hintColor)
              : null,
        ),
      ),
    );
  }
}

/// Desplegable que tolera valores fuera del catálogo (p. ej. venidos del panel
/// web) añadiéndolos como opción.
class CampoDesplegable extends StatelessWidget {
  const CampoDesplegable({
    super.key,
    required this.etiqueta,
    required this.valor,
    required this.opciones,
    required this.onChanged,
    this.textoVacio = 'Sin definir',
  });

  final String etiqueta;
  final String? valor;
  final List<String> opciones;
  final ValueChanged<String?> onChanged;
  final String textoVacio;

  @override
  Widget build(BuildContext context) {
    final lista = [
      ...opciones,
      if (valor != null && !opciones.contains(valor)) valor!,
    ];
    return DropdownButtonFormField<String?>(
      initialValue: valor,
      isExpanded: true,
      decoration: InputDecoration(labelText: etiqueta),
      items: [
        DropdownMenuItem<String?>(
          value: null,
          child: Text(
            textoVacio,
            style: TextStyle(color: Theme.of(context).hintColor),
          ),
        ),
        for (final o in lista)
          DropdownMenuItem<String?>(
            value: o,
            child: Text(o, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: onChanged,
    );
  }
}

/// Cabecera de sección dentro de una pestaña.
class TituloSeccion extends StatelessWidget {
  const TituloSeccion(this.texto, {super.key});
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Text(
        texto,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}

/// Distribuye hijos en columnas en pantallas anchas y en una sola en estrechas.
class FilaAdaptable extends StatelessWidget {
  const FilaAdaptable({
    super.key,
    required this.children,
    this.columnasMax = 2,
  });

  final List<Widget> children;
  final int columnasMax;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final cols = c.maxWidth >= 560 ? columnasMax : 1;
        const sep = 12.0;
        final ancho = (c.maxWidth - sep * (cols - 1)) / cols;
        return Wrap(
          spacing: sep,
          runSpacing: 12,
          children: [
            for (final w in children) SizedBox(width: ancho, child: w),
          ],
        );
      },
    );
  }
}
