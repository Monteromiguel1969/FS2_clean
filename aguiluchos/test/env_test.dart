import 'package:aguiluchos/config/env.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('placeholders por defecto => Supabase no configurado', () {
    expect(Env.supabaseUrl, 'TU_SUPABASE_URL');
    expect(Env.supabaseAnonKey, 'TU_SUPABASE_ANON_KEY');
    expect(Env.isSupabaseConfigured, isFalse);
  });

  test('isConfigured valida URL y clave', () {
    expect(Env.isConfigured('https://abc.supabase.co', 'eyJ123'), isTrue);
    expect(Env.isConfigured('TU_SUPABASE_URL', 'eyJ123'), isFalse);
    expect(Env.isConfigured('https://abc.supabase.co', 'TU_SUPABASE_ANON_KEY'), isFalse);
    expect(Env.isConfigured('https://abc.supabase.co', ''), isFalse);
  });
}
