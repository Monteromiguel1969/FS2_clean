import 'package:flutter/material.dart';

/// Puntos de corte para pasar de layout móvil a layout de escritorio/tablet.
abstract final class Breakpoints {
  static const double wide = 900;
  static bool isWide(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= wide;
}

/// Rejilla de campos de formulario que se adapta al ancho disponible:
/// 1 columna en móvil, 2 en pantallas anchas.
class FormGrid extends StatelessWidget {
  const FormGrid({
    super.key,
    required this.children,
    this.spacing = 12,
    this.maxColumns = 2,
    this.minColumnWidth = 320,
  });

  final List<Widget> children;
  final double spacing;
  final int maxColumns;
  final double minColumnWidth;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final cols = (c.maxWidth / minColumnWidth).floor().clamp(1, maxColumns);
      final w = (c.maxWidth - spacing * (cols - 1)) / cols;
      return Wrap(
        spacing: spacing,
        runSpacing: spacing,
        children: [for (final ch in children) SizedBox(width: w, child: ch)],
      );
    });
  }
}

/// Título de sección dentro de un formulario.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 10),
        child: Text(text,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w600)),
      );
}
