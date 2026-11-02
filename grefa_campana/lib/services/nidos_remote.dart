import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/env.dart';

/// Contrato del backend remoto. Permite sustituirlo en tests y trabajar
/// sin Supabase configurado.
abstract class NidosRemote {
  /// Filas con `updated_at >= desde` (o todas si es `null`), por antigüedad
  /// ascendente. Gestiona la paginación internamente.
  Future<List<Map<String, dynamic>>> obtenerCambios({DateTime? desde});

  Future<Map<String, dynamic>?> obtenerPorId(String id);

  /// Hace upsert de [json]. Devuelve la fila resultante, o `null` si el
  /// servidor rechazó la escritura por ser más antigua que la almacenada
  /// (Last-Write-Wins en servidor).
  Future<Map<String, dynamic>?> upsert(Map<String, dynamic> json);

  /// Sube [archivo] a `<nidoId>/<nombre>` y devuelve su URL pública.
  Future<String> subirImagen({
    required String nidoId,
    required File archivo,
    required String nombre,
  });
}

/// Implementación sobre Supabase (PostgREST + Storage).
class SupabaseNidosRemote implements NidosRemote {
  SupabaseNidosRemote(this._client, {String? bucket})
    : _bucket = bucket ?? Env.bucketFotos;

  final SupabaseClient _client;
  final String _bucket;

  static const int _pagina = 500;

  @override
  Future<List<Map<String, dynamic>>> obtenerCambios({DateTime? desde}) async {
    final resultado = <Map<String, dynamic>>[];
    var offset = 0;
    while (true) {
      var q = _client.from(Env.tablaNidos).select();
      if (desde != null) {
        q = q.gte('updated_at', desde.toUtc().toIso8601String());
      }
      final filas = await q
          .order('updated_at', ascending: true)
          .order('id', ascending: true)
          .range(offset, offset + _pagina - 1);
      resultado.addAll(filas.cast<Map<String, dynamic>>());
      if (filas.length < _pagina) break;
      offset += _pagina;
    }
    return resultado;
  }

  @override
  Future<Map<String, dynamic>?> obtenerPorId(String id) {
    return _client.from(Env.tablaNidos).select().eq('id', id).maybeSingle();
  }

  @override
  Future<Map<String, dynamic>?> upsert(Map<String, dynamic> json) async {
    final filas = await _client.from(Env.tablaNidos).upsert(json).select();
    return filas.isEmpty ? null : filas.first;
  }

  @override
  Future<String> subirImagen({
    required String nidoId,
    required File archivo,
    required String nombre,
  }) async {
    final ruta = '$nidoId/$nombre';
    await _client.storage
        .from(_bucket)
        .upload(
          ruta,
          archivo,
          fileOptions: FileOptions(
            upsert: true,
            contentType: _contentType(nombre),
          ),
        );
    return _client.storage.from(_bucket).getPublicUrl(ruta);
  }

  static String _contentType(String nombre) {
    final n = nombre.toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }
}
