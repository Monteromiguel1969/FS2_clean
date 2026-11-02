/// Configuración inyectada en compilación con `--dart-define`.
///
/// ```
/// flutter run \
///   --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
///   --dart-define=SUPABASE_ANON_KEY=eyJ...
/// ```
///
/// Si no se definen, la app funciona 100 % offline y la sincronización queda
/// deshabilitada.
abstract final class Env {
  static const String placeholderUrl = 'TU_SUPABASE_URL';
  static const String placeholderAnonKey = 'TU_SUPABASE_ANON_KEY';

  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: placeholderUrl,
  );
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: placeholderAnonKey,
  );

  /// Bucket de Supabase Storage para las fotografías.
  static const String bucketFotos = String.fromEnvironment(
    'SUPABASE_BUCKET',
    defaultValue: 'nidos-fotos',
  );

  /// Tabla remota.
  static const String tablaNidos = 'nidos_grefa';

  static bool get supabaseConfigurado =>
      esConfiguracionValida(supabaseUrl, supabaseAnonKey);

  static bool esConfiguracionValida(String url, String anonKey) {
    if (url.isEmpty || anonKey.isEmpty) return false;
    if (url == placeholderUrl || anonKey == placeholderAnonKey) return false;
    final uri = Uri.tryParse(url);
    return uri != null && uri.hasScheme && uri.host.isNotEmpty;
  }
}
