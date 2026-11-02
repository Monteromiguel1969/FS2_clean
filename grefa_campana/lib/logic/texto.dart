const String _conTilde = 'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ';
const String _sinTilde = 'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN';

/// Minúsculas, sin tildes y sin espacios sobrantes (para comparar y buscar).
String normalizarTexto(String? s) {
  if (s == null) return '';
  final b = StringBuffer();
  for (final r in s.trim().toLowerCase().runes) {
    final ch = String.fromCharCode(r);
    final i = _conTilde.indexOf(ch);
    b.write(i >= 0 ? _sinTilde[i].toLowerCase() : ch);
  }
  return b.toString();
}
