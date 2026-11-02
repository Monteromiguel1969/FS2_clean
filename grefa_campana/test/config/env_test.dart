import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/config/env.dart';

void main() {
  test(
    'sin --dart-define la configuración de Supabase es inválida (modo offline)',
    () {
      expect(Env.supabaseUrl, Env.placeholderUrl);
      expect(Env.supabaseAnonKey, Env.placeholderAnonKey);
      expect(Env.supabaseConfigurado, isFalse);
    },
  );

  test('esConfiguracionValida', () {
    expect(
      Env.esConfiguracionValida('https://abc.supabase.co', 'eyJ...'),
      isTrue,
    );
    expect(Env.esConfiguracionValida(Env.placeholderUrl, 'eyJ...'), isFalse);
    expect(
      Env.esConfiguracionValida(
        'https://abc.supabase.co',
        Env.placeholderAnonKey,
      ),
      isFalse,
    );
    expect(Env.esConfiguracionValida('', 'x'), isFalse);
    expect(Env.esConfiguracionValida('no-es-url', 'x'), isFalse);
  });
}
