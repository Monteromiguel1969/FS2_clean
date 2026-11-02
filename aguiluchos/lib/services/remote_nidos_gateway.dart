import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/nido_grefa_model.dart';

/// Un cambio remoto con su marca de servidor (cursor de sync incremental).
class RemoteChange {
  const RemoteChange(this.nido, this.serverUpdatedAt);
  final NidoGrefaModel nido;
  final DateTime serverUpdatedAt;
}

/// El servidor rechazó un registro concreto (datos/constraint/RLS). No indica
/// fallo de red: se puede seguir con el resto de registros.
class RemoteRejectedException implements Exception {
  RemoteRejectedException(this.message);
  final String message;
  @override
  String toString() => 'RemoteRejectedException: $message';
}

/// Abstracción del backend: permite probar [SyncService] sin red.
abstract class RemoteNidosGateway {
  /// Cambios con `server_updated_at >= since`, ordenados, paginados.
  Future<List<RemoteChange>> fetchChanges({
    DateTime? since,
    required int offset,
    required int limit,
  });

  /// Inserta/actualiza y devuelve la fila tal como quedó almacenada.
  Future<NidoGrefaModel> upsert(NidoGrefaModel nido);

  /// Sube una foto y devuelve su URL pública.
  Future<String> uploadImage({required String nidoId, required File file});
}

class SupabaseNidosGateway implements RemoteNidosGateway {
  SupabaseNidosGateway(this._client);

  static const tabla = 'nidos_grefa';
  static const bucket = 'nidos-fotos';

  final SupabaseClient _client;

  @override
  Future<List<RemoteChange>> fetchChanges({
    DateTime? since,
    required int offset,
    required int limit,
  }) async {
    var q = _client.from(tabla).select();
    if (since != null) {
      q = q.gte('server_updated_at', since.toUtc().toIso8601String());
    }
    final rows = await q
        .order('server_updated_at', ascending: true)
        .order('id', ascending: true)
        .range(offset, offset + limit - 1);
    return [
      for (final r in rows)
        RemoteChange(
          NidoGrefaModel.fromJson(r),
          DateTime.parse(r['server_updated_at'] as String).toUtc(),
        ),
    ];
  }

  @override
  Future<NidoGrefaModel> upsert(NidoGrefaModel nido) async {
    try {
      final row = await _client
          .from(tabla)
          .upsert(nido.toJson(), onConflict: 'id')
          .select()
          .single();
      return NidoGrefaModel.fromJson(row);
    } on PostgrestException catch (e) {
      // Códigos PGRST/22xxx/23xxx/42xxx: el servidor entendió y rechazó.
      throw RemoteRejectedException('${e.code}: ${e.message}');
    }
  }

  @override
  Future<String> uploadImage({required String nidoId, required File file}) async {
    final name = p.basename(file.path);
    final path = '$nidoId/$name';
    await _client.storage.from(bucket).upload(
          path,
          file,
          fileOptions: FileOptions(
            upsert: true,
            contentType: _contentType(name),
          ),
        );
    return _client.storage.from(bucket).getPublicUrl(path);
  }

  static String _contentType(String name) {
    switch (p.extension(name).toLowerCase()) {
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.heic':
        return 'image/heic';
      default:
        return 'image/jpeg';
    }
  }
}
