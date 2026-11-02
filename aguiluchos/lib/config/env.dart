/// Configuración inyectada en compilación con `--dart-define`.
///
/// ```
/// flutter run \
///   --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
///   --dart-define=SUPABASE_ANON_KEY=eyJ...
/// ```
abstract final class Env {
  static const supabaseUrl =
      String.fromEnvironment('SUPABASE_URL', defaultValue: 'TU_SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY',
      defaultValue: 'TU_SUPABASE_ANON_KEY');

  static bool get isSupabaseConfigured =>
      isConfigured(supabaseUrl, supabaseAnonKey);

  /// `true` si ambos valores son reales (no los placeholders por defecto).
  static bool isConfigured(String url, String anonKey) {
    final uri = Uri.tryParse(url);
    return uri != null &&
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.host.isNotEmpty &&
        anonKey.isNotEmpty &&
        anonKey != 'TU_SUPABASE_ANON_KEY';
  }
}
