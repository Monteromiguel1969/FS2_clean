// Manual de ayuda del panel + ayuda contextual (botón «?» en cada pantalla, tecla F1).
// El contenido es HTML estático propio (no contiene datos de usuarios).

/** Capítulos del índice, en orden. */
export const GRUPOS = [
  ['inicio', 'Primeros pasos'],
  ['nidos', 'Panel de nidos'],
  ['ficha', 'Ficha del nido'],
  ['informes', 'Informes técnicos'],
  ['contratos', 'Contratos, parcelas y propietarios'],
  ['otros', 'Más información'],
];

const enl = (id, texto) => `<a href="#" data-ayuda="${id}">${texto}</a>`;

export const MANUAL = [
  // ───────────────────────────── PRIMEROS PASOS ─────────────────────────────
  {
    id: 'inicio', grupo: 'inicio', titulo: 'Bienvenida: qué es este panel y cómo usar la ayuda',
    html: `
<p>El <b>Panel GREFA · Campaña Aguilucho</b> es la versión web de la gestión de la campaña. Comparte datos con la app de campo (Android), de modo que lo que se anota en el campo aparece aquí en cuestión de segundos y viceversa.</p>
<h4>Qué se puede hacer</h4>
<ul>
  <li><b>Seguir los nidos</b>: indicadores, filtros, tabla y mapa (${enl('indicadores', 'indicadores')}, ${enl('filtros', 'filtros')}, ${enl('tabla', 'tabla')}, ${enl('mapa', 'mapa')}).</li>
  <li><b>Crear y editar nidos</b> con las 4 fases de la campaña (${enl('ficha', 'ficha del nido')}, ${enl('nuevo-nido', 'nuevo nido')}).</li>
  <li><b>Exportar</b> los datos a Excel/CSV (${enl('csv', 'exportar CSV')}).</li>
  <li><b>Emitir informes técnicos</b> editables en PDF o Word (${enl('informes', 'informes')}).</li>
  <li><b>Gestionar contratos</b>: propietarios, parcelas, convenios firmados, compensación económica y catálogo de ayudas (${enl('contratos', 'contratos')}).</li>
  <li><b>Leer convenios ya firmados</b> con Mistral y asociarlos automáticamente a lo ya registrado (${enl('leer-firmados', 'leer convenios firmados')}).</li>
  <li><b>Saber qué nidos tienen contrato</b> gracias al semáforo (${enl('semaforo', 'semáforo de contrato')}).</li>
</ul>
<h4>Cómo se usa esta ayuda</h4>
<ul>
  <li>El botón <b>Ayuda</b> de la cabecera abre este manual completo.</li>
  <li>Junto al título de cada pantalla, ventana o apartado hay un botón redondo <span class="btn-ayuda-demo">?</span>: abre el manual <b>directamente en la explicación de esa pantalla</b>.</li>
  <li>La tecla <kbd>F1</kbd> hace lo mismo desde cualquier pantalla (abre la ayuda de la ventana que tengas delante).</li>
  <li>El buscador del manual filtra los apartados que contienen lo que escribas.</li>
  <li>Puedes <b>imprimir</b> el manual o <b>descargarlo</b> como archivo HTML para consultarlo sin conexión.</li>
</ul>
<p class="ay-nota">Si es tu primera vez, lee ${enl('conceptos', 'Conceptos básicos')} y ${enl('flujos', 'Flujos de trabajo recomendados')}.</p>`,
  },
  {
    id: 'conceptos', grupo: 'inicio', titulo: 'Conceptos básicos: nido, parcela, propietario y convenio',
    html: `
<table class="ay-tabla">
  <tr><th>Concepto</th><th>Qué es</th></tr>
  <tr><td><b>Nido</b></td><td>Un nido de aguilucho seguido durante la campaña. Tiene 4 fases (ubicación, incubación, seguimiento y cosecha/balance). Es lo que se anota en el campo.</td></tr>
  <tr><td><b>Campaña</b></td><td>El año de trabajo. La campaña de un nido es el año de su fecha de incubación (o, si falta, de la primera fecha que tenga).</td></tr>
  <tr><td><b>Propietario</b></td><td>La persona o entidad titular de las parcelas y firmante del convenio (particular, representante de una C.B./SAT, o entidad).</td></tr>
  <tr><td><b>Parcela</b></td><td>La finca, identificada por SIGPAC (polígono, parcela y recinto) o por su referencia catastral. Puede tener varios propietarios y varios nidos a lo largo de los años.</td></tr>
  <tr><td><b>Convenio</b></td><td>El contrato de compensación entre GREFA y el propietario para una campaña. Tiene estado, fechas de firma y vigencia, parcelas, ayudas, importe y pagos.</td></tr>
  <tr><td><b>Línea del convenio</b></td><td>Cada parcela incluida en un convenio, con su superficie, uso, ayudas aplicadas e importe.</td></tr>
  <tr><td><b>Ayuda (código 1-9)</b></td><td>Cada medida compensable del Anexo I del convenio, con su importe (€/ha, €/año, fijo o variable).</td></tr>
  <tr><td><b>Semáforo</b></td><td>El estado del contrato de un nido (verde, naranja, rojo o gris). Ver ${enl('semaforo', 'semáforo')}.</td></tr>
</table>
<h4>Cómo se relacionan</h4>
<pre class="ay-esquema">Propietario ──&lt; Convenio (campaña) ──&lt; Línea ──&gt; Parcela &lt;── Nido
                                       │
                                       └ superficie, uso, ayudas e importe</pre>
<p>El contrato <b>se aplica a la parcela</b>, no directamente al nido. El nido hereda el estado del contrato de la parcela a la que está vinculado, en la campaña del nido. Así, si una parcela tiene varios nidos (o nidos de años distintos), cada uno queda cubierto por el convenio de su campaña.</p>
<p>El nido se vincula a su parcela de dos maneras: <b>vínculo explícito</b> (lo marcas tú o se propone al guardar un convenio) o, si no lo hay, por <b>coincidencia de la referencia catastral</b>.</p>`,
  },
  {
    id: 'acceso', grupo: 'inicio', titulo: 'Acceso: iniciar sesión, crear cuenta y recuperar la contraseña',
    html: `
<h4>Iniciar sesión</h4>
<ol>
  <li>Escribe tu correo y tu contraseña y pulsa <b>Entrar</b>.</li>
  <li>Si el correo aún no está confirmado, el panel lo avisa: abre el enlace que te llegó por correo.</li>
</ol>
<h4>Crear una cuenta</h4>
<ol>
  <li>Pulsa <b>Crear cuenta (@grefa.org)</b>.</li>
  <li>Indica tu nombre completo, tu correo <b>@grefa.org</b> y una contraseña de <b>al menos 8 caracteres</b> (repítela).</li>
  <li>Pulsa <b>Crear cuenta</b>. Recibirás un correo: abre el enlace para confirmarla y vuelve a iniciar sesión.</li>
</ol>
<p class="ay-nota">Solo se admiten correos <b>@grefa.org</b>. Con otro dominio la cuenta no se crea.</p>
<h4>He olvidado mi contraseña</h4>
<p>Pulsa <b>He olvidado mi contraseña</b>, escribe tu correo y <b>Enviar enlace</b>. Te llegará un correo para elegir una contraseña nueva (mira también el spam).</p>
<h4>Salir</h4>
<p>El botón <b>Salir</b> de la cabecera cierra la sesión.</p>
<p>Si el panel se usa en modo <b>piloto sin login</b>, verás «Acceso sin login (piloto)» arriba y no se pedirá usuario; en ese modo no se distingue entre usuarios.</p>`,
  },
  {
    id: 'cambiar-clave', grupo: 'inicio', titulo: 'Cambiar la contraseña',
    html: `
<ol>
  <li>Pulsa <b>Cambiar contraseña</b> en la cabecera.</li>
  <li>Escribe la contraseña nueva (mínimo 8 caracteres) y repítela.</li>
  <li>Pulsa <b>Cambiar</b>. Verás «Contraseña cambiada correctamente» y la ventana se cierra sola.</li>
</ol>
<p>Si las dos contraseñas no coinciden o es demasiado corta, el panel lo indica y no cambia nada.</p>`,
  },
  {
    id: 'roles', grupo: 'inicio', titulo: 'Permisos: qué puede hacer cada usuario',
    html: `
<table class="ay-tabla">
  <tr><th>Acción</th><th>Usuario @grefa.org</th><th>Administrador</th></tr>
  <tr><td>Ver nidos, mapa, informes y contratos</td><td>Sí</td><td>Sí</td></tr>
  <tr><td>Crear y editar nidos</td><td>Sí</td><td>Sí</td></tr>
  <tr><td>Crear y editar propietarios, parcelas, convenios, pagos y ayudas</td><td>Sí</td><td>Sí</td></tr>
  <tr><td>Subir documentos de contratos</td><td>Sí</td><td>Sí</td></tr>
  <tr><td>Leer convenios firmados con Mistral</td><td>Sí</td><td>Sí</td></tr>
  <tr><td><b>Eliminar</b> nidos</td><td>No</td><td>Sí</td></tr>
  <tr><td><b>Eliminar</b> convenios, parcelas, propietarios y documentos</td><td>No</td><td>Sí</td></tr>
</table>
<p>El administrador es el usuario <b>aquilagestion@grefa.org</b> (aparece como «administrador» en la cabecera). Los botones <b>Eliminar</b> solo se muestran a quien puede usarlos.</p>
<p>Los datos de contratos solo son accesibles para usuarios con sesión iniciada con un correo @grefa.org.</p>`,
  },

  // ───────────────────────────── PANEL DE NIDOS ─────────────────────────────
  {
    id: 'cabecera', grupo: 'nidos', titulo: 'La cabecera: botones y estado',
    html: `
<table class="ay-tabla">
  <tr><th>Elemento</th><th>Para qué sirve</th></tr>
  <tr><td>Correo / «administrador»</td><td>Muestra con qué usuario has entrado.</td></tr>
  <tr><td>«N nidos» / «Cargando…»</td><td>Número de nidos cargados (todos, sin filtrar).</td></tr>
  <tr><td><b>● En vivo</b></td><td>Conexión en tiempo real: los cambios de la app de campo aparecen al instante. «○ Conectando…» es transitorio. «○ Sin tiempo real» significa que el panel se actualiza solo cada 90 segundos.</td></tr>
  <tr><td><b>Actualizar</b></td><td>Vuelve a leer todos los datos ahora mismo.</td></tr>
  <tr><td><b>Mapa de nidos</b></td><td>Salta a la vista de mapa con los nidos filtrados. Ver ${enl('mapa', 'mapa')}.</td></tr>
  <tr><td><b>Presentación</b></td><td>Descarga un PowerPoint (.pptx) con los nidos filtrados. Ver ${enl('presentacion', 'Presentación')}.</td></tr>
  <tr><td><b>Exportar CSV</b></td><td>Descarga los nidos filtrados. Ver ${enl('csv', 'exportar CSV')}.</td></tr>
  <tr><td><b>Informes</b></td><td>Emite informes técnicos editables. Ver ${enl('informes', 'informes')}.</td></tr>
  <tr><td><b>Contratos</b></td><td>Abre parcelas, propietarios, convenios, compensación y ayudas. Ver ${enl('contratos', 'contratos')}.</td></tr>
  <tr><td><b>+ Nuevo nido</b></td><td>Crea un nido. Ver ${enl('nuevo-nido', 'nuevo nido')}.</td></tr>
  <tr><td><b>Ayuda</b></td><td>Abre este manual.</td></tr>
  <tr><td>Cambiar contraseña / Salir</td><td>Gestión de tu sesión (solo con login). Ver ${enl('cambiar-clave', 'cambiar contraseña')}.</td></tr>
</table>`,
  },
  {
    id: 'indicadores', grupo: 'nidos', titulo: 'Indicadores (KPI) de la parte superior',
    html: `
<p>Las tarjetas resumen <b>los nidos que cumplen los filtros actuales</b> (si no hay filtros, todos). Cambian al instante cuando filtras.</p>
<table class="ay-tabla">
  <tr><th>Indicador</th><th>Cómo se calcula</th></tr>
  <tr><td>Nidos</td><td>Número de nidos de la selección.</td></tr>
  <tr><td>Con éxito / Fracaso</td><td>Nidos cuyo «Resultado reproductivo» es Éxito o Fracaso.</td></tr>
  <tr><td>En curso</td><td>Los que aún no tienen resultado (total − éxito − fracaso).</td></tr>
  <tr><td>Tasa de éxito (cerrados)</td><td>Éxitos ÷ (éxitos + fracasos). Solo cuenta los nidos ya cerrados; si no hay ninguno, muestra «—».</td></tr>
  <tr><td>Pollos nacidos / volados / muertos</td><td>Suma de «Pollos nacidos», «Total pollos volados» y «Total pollos muertos» de la selección.</td></tr>
</table>`,
  },
  {
    id: 'filtros', grupo: 'nidos', titulo: 'Buscar y filtrar nidos',
    html: `
<p>Los filtros se combinan entre sí (se aplican todos a la vez) y afectan a los indicadores, la tabla, el mapa, las causas de fracaso, el <b>CSV</b> y los <b>informes</b> (cuando eliges «selección actual»).</p>
<ul>
  <li><b>Buscador</b>: busca en etiqueta, numeración, propietario y municipio. Ignora mayúsculas y tildes.</li>
  <li><b>País → Comunidad → Provincia → Localidad</b>: filtros en cascada. Al elegir uno, los de abajo solo ofrecen valores que existen dentro de esa selección; si cambias un nivel superior, los inferiores se reinician.</li>
  <li><b>Especie</b>: cenizo, pálido o lagunero.</li>
  <li><b>Proyecto</b>: LIFE, Compensatorias o USANOS.</li>
  <li><b>Estado</b>: Éxito, Fracaso o En curso (según el resultado reproductivo).</li>
  <li><b>Contrato</b> (aparece cuando están creadas las tablas de contratos): Firmado vigente · Pendiente de firma / caduca pronto · Sin contrato / caducado · Sin parcela vinculada. Ver ${enl('semaforo', 'semáforo')}.</li>
  <li><b>Limpiar</b>: quita todos los filtros.</li>
</ul>
<p class="ay-nota">Si «no hay nidos con estos filtros», pulsa <b>Limpiar</b>. Para ver qué nidos necesitan atención con el contrato, usa el filtro <b>Contrato → Sin contrato / caducado</b>.</p>`,
  },
  {
    id: 'tabla', grupo: 'nidos', titulo: 'Vista Tabla',
    html: `
<ul>
  <li>Cada fila es un nido. <b>Haz clic en una fila</b> para abrir su ${enl('ficha', 'ficha')}.</li>
  <li><b>Ordenar</b>: haz clic en el encabezado de una columna; otro clic invierte el orden (▲ ascendente, ▼ descendente).</li>
  <li>Columnas: Nº, Etiqueta, Localidad, Provincia, Especie, Estado final, Estado (Éxito/Fracaso/En curso), <b>Contrato</b> (punto de semáforo), pollos Nacidos/Volados/Muertos e Intervención.</li>
  <li>La columna <b>Contrato</b> solo aparece si las tablas de contratos existen. Pasa el ratón por el punto para ver su significado.</li>
  <li>La tabla muestra como máximo <b>1.500 nidos</b>; usa los filtros si hay más.</li>
</ul>`,
  },
  {
    id: 'mapa', grupo: 'nidos', titulo: 'Vista Mapa',
    html: `
<ul>
  <li>Se abre con la pestaña <b>Mapa</b> o con el botón <b>Mapa de nidos</b> de la cabecera.</li>
  <li>Cada punto es un nido con coordenadas UTM válidas. <b>Pasa el ratón</b> para ver etiqueta, localidad, especie y resultado; <b>haz clic</b> para abrir su ficha completa.</li>
  <li>Debajo del título se indica cuántos nidos están ubicados y cuántos <b>no tienen coordenadas</b> (esos no se dibujan).</li>
  <li><b>Color</b> (solo con contratos): elige entre <i>Resultado de la nidificación</i> (verde éxito, rojo fracaso, naranja en curso) o <i>Contrato de la parcela</i> (verde firmado, naranja pendiente o a punto de caducar, rojo sin contrato, gris sin parcela).</li>
  <li>El mapa se reencuadra al cambiar los filtros, no en cada actualización en vivo.</li>
  <li>El selector <b>Fondo</b> de la cabecera cambia entre <i>Mapa</i> (OpenStreetMap) y <i>Ortofoto</i> (PNOA, Instituto Geográfico Nacional). Afecta también a los mapas de los informes y se recuerda en este navegador. Necesita conexión a internet.</li>
</ul>`,
  },
  {
    id: 'causas', grupo: 'nidos', titulo: 'Panel «Causas de fracaso»',
    html: `
<p>Lista las causas anotadas en los nidos con resultado <b>Fracaso</b> de la selección actual, ordenadas de mayor a menor, con una barra proporcional. Los fracasos sin causa indicada aparecen como «Sin causa indicada».</p>
<p>La causa se anota en la ficha del nido, en la fase 4 (<i>Causas de fracaso</i>). Si no hay fracasos en la selección, el panel lo indica.</p>`,
  },
  {
    id: 'importar', grupo: 'nidos', titulo: 'Importar Excel (.xlsx)',
    html: `
<ol>
  <li>Pulsa <b>Importar Excel</b> y elige un fichero <code>.xlsx</code>. La <b>primera fila</b> debe tener los nombres de los campos (como en la ficha, o el nombre técnico).</li>
  <li>Revisa la vista previa: nidos nuevos, nidos que se completan, columnas reconocidas, ignoradas y avisos.</li>
  <li>Pulsa <b>Importar</b>.</li>
</ol>
<ul>
  <li>Si falta una columna o una celda está vacía, ese campo queda en blanco (o como estaba).</li>
  <li>Las columnas de más se ignoran. <b>Nunca se borra</b> ningún nido que no venga en el fichero.</li>
  <li><b>Proyecto</b> y <b>Campaña</b> solo se asignan si el fichero trae esas columnas; si no, se dejan en blanco. Son campos distintos. Una columna <b>Año</b> se toma como campaña (si hay también «Campaña», manda esta).</li>
  <li>Un nido que ya existe (misma numeración o etiqueta, con proyecto y campaña compatibles) solo se completa con las celdas que traen valor.</li>
  <li>La campaña necesita haber ejecutado <code>migracion_campana.sql</code> en Supabase.</li>
</ul>`,
  },
  {
    id: 'presentacion', grupo: 'nidos', titulo: 'Presentación PowerPoint',
    html: `
<p>El botón <b>Presentación</b> (junto a <b>Informes</b>) descarga un <code>.pptx</code> con la selección actual de nidos (mismos filtros que el informe): portada con el ámbito, totales, mapa y tabla de nidos. Las celdas sin dato quedan en blanco. Abre en PowerPoint y se puede importar a Google Slides desde Drive.</p>`,
  },
  {
    id: 'csv', grupo: 'nidos', titulo: 'Exportar a CSV (Excel)',
    html: `
<ol>
  <li>Aplica los filtros que quieras (se exporta solo lo que ves en la selección).</li>
  <li>Pulsa <b>Exportar CSV</b>. Se abre una lista con los campos agrupados por las 4 fases (todos marcados por defecto): quita los que no quieras, o usa «Quitar fase» / «Quitar todos».</li>
  <li>Pulsa <b>Descargar CSV</b>. Se descarga <code>nidos_aguiluchos_AAAA-MM-DD.csv</code> solo con los campos marcados.</li>
  <li>Ábrelo con Excel: usa «;» como separador y codificación UTF-8, por lo que se ve bien en español.</li>
</ol>
<p>Si dejas todo marcado incluye las 43 columnas del nido (todas las fases). Las listas se separan con «;» y las casillas se exportan como Sí/No.</p>
<p>La compensación económica tiene su propio CSV en ${enl('compensacion', 'Contratos → Compensación')}.</p>`,
  },

  // ───────────────────────────── FICHA DEL NIDO ─────────────────────────────
  {
    id: 'ficha', grupo: 'ficha', titulo: 'La ficha del nido: ver, editar, guardar y eliminar',
    html: `
<p>Se abre al hacer clic en un nido de la tabla o del mapa (o con <b>+ Nuevo nido</b>).</p>
<h4>Qué contiene</h4>
<ul>
  <li><b>Presentación</b>: «Completa» (todas las fases seguidas) o «Por fases» (una pestaña por fase). Tu elección se recuerda en este navegador. Ver ${enl('ficha-fases', 'las 4 fases')}.</li>
  <li>El bloque <b>Parcela y contrato</b> (si hay contratos): semáforo, parcela, convenio y acciones. Ver ${enl('ficha-contrato', 'Parcela y contrato')}.</li>
  <li>Cálculos automáticos: <i>fecha estimada de eclosión</i> (incubación + 30 días) y <i>balance</i> de pollos (nacidos = volados + muertos + sin determinar).</li>
  <li>Enlace «Abrir en Google Maps» cuando el nido tiene coordenadas.</li>
</ul>
<h4>Guardar</h4>
<ol>
  <li>Modifica los campos que necesites.</li>
  <li>Pulsa <b>Guardar nido</b>. Si algo no es válido, aparece un aviso en rojo abajo y no se guarda.</li>
</ol>
<p>Se comprueba que: haya <b>etiqueta o numeración</b>; <b>volados + muertos</b> no superen a los <b>nacidos</b>; y que las <b>coordenadas UTM</b> sean plausibles para España.</p>
<h4>Otros botones</h4>
<ul>
  <li><b>Informe del nido</b>: genera el informe técnico individual editable (${enl('informes', 'informes')}).</li>
  <li><b>Eliminar</b> (solo administrador): marca el nido como borrado; desaparece del panel y de la app tras sincronizar. Pide confirmación.</li>
  <li><b>Cerrar</b>: cierra sin guardar.</li>
</ul>
<p class="ay-nota"><b>Ediciones simultáneas.</b> Si otra persona guardó una versión más reciente del mismo nido, se conserva la suya («la última escritura gana») y el panel te lo avisa.</p>`,
  },
  {
    id: 'ficha-fases', grupo: 'ficha', titulo: 'Las 4 fases de la ficha y sus campos',
    html: `
<h4>Fase 1 · Ubicación e identificación</h4>
<p>Numeración, <b>etiqueta</b>, proyecto (LIFE / Compensatorias / USANOS), <b>propietario</b> y teléfono, URL de Google Maps, municipio, provincia, <b>referencia catastral</b>, especie, territorio (Seguro, Probable, Posible, Descartado), <b>coordenadas UTM X/Y</b> (Este/Norte, en metros) y sustrato (cebada, trigo, barbecho…).</p>
<p class="ay-nota">Importante para contratos: el <b>propietario</b> y el <b>teléfono</b> sirven para proponer automáticamente los nidos de un titular al guardar un convenio, y la <b>referencia catastral</b> vincula el nido a su parcela si coincide.</p>
<h4>Fase 2 · Incubación</h4>
<p>Fecha de incubación (<b>define la campaña del nido</b>), fecha de eclosión, nº de huevos de entrada, tamaño de puesta y fecha de entrada al nido. Debajo se calcula la eclosión estimada (incubación + 30 días).</p>
<h4>Fase 3 · Seguimiento y manejo</h4>
<p>Pollos nacidos, huevos no eclosionados, edad en días, anillas (PVC y metálica), <b>intervención</b> (casilla), tipo de manejo (Dron, Rodal, Compensación) y dos cuadros de observaciones.</p>
<h4>Fase 4 · Cosecha y balance</h4>
<p>Fecha de vuelo y de cosecha, pollos volados y muertos (pre-cosecha, en cosecha y post-cosecha, y totales), «¿Vuelan los pollos?», <b>estado final</b>, <b>resultado reproductivo</b> (Éxito/Fracaso), causas de fracaso y estado del fracaso (huevos, pollos o ambos). Debajo se muestra el balance de pollos.</p>
<p>El <b>resultado reproductivo</b> es el que decide si el nido cuenta como éxito, fracaso o en curso en todo el panel.</p>`,
  },
  {
    id: 'nuevo-nido', grupo: 'ficha', titulo: 'Crear un nido nuevo',
    html: `
<ol>
  <li>Pulsa <b>+ Nuevo nido</b> en la cabecera.</li>
  <li>Rellena como mínimo la <b>etiqueta</b> o la numeración. Cuantos más datos (propietario, teléfono, referencia catastral, coordenadas), más fácil será enlazarlo luego con su parcela y contrato.</li>
  <li>Pulsa <b>Guardar nido</b>.</li>
</ol>
<p>Hasta que se guarda por primera vez no aparece el bloque «Parcela y contrato» ni el botón «Informe del nido».</p>
<p>Los nidos creados desde la <b>app de campo</b> (por ejemplo con «Nido en mi posición» por GPS) aparecen aquí al sincronizar.</p>`,
  },
  {
    id: 'ficha-contrato', grupo: 'ficha', titulo: 'Bloque «Parcela y contrato» de la ficha',
    html: `
<p>Aparece en la ficha de los nidos ya guardados cuando las tablas de contratos están disponibles. Muestra:</p>
<ul>
  <li>El <b>semáforo</b> del nido y su campaña. Ver ${enl('semaforo', 'semáforo')}.</li>
  <li>La <b>parcela</b> vinculada (y si el vínculo es explícito o «por referencia catastral»).</li>
  <li>El <b>convenio</b> de esa parcela en la campaña del nido (propietario, estado y vigencia).</li>
</ul>
<h4>Acciones según la situación</h4>
<table class="ay-tabla">
  <tr><th>Situación</th><th>Botones</th></tr>
  <tr><td>Nido con parcela y convenio</td><td><b>Ver parcela</b> · <b>Abrir convenio</b> · <b>Desvincular</b> (solo si el vínculo es explícito)</td></tr>
  <tr><td>Nido con parcela pero sin convenio esa campaña</td><td><b>Crear convenio</b>: abre un convenio nuevo con esa parcela ya incluida.</td></tr>
  <tr><td>Nido sin parcela</td><td><b>Vincular a una parcela existente</b> (elige en la lista y pulsa Vincular) o <b>Crear parcela con los datos del nido</b> (rellena provincia, municipio, referencia catastral y coordenadas del nido y lo vincula).</td></tr>
</table>
<p class="ay-nota">Al guardar un convenio (nuevo o leído de un PDF) también se pueden vincular los nidos desde el propio convenio. Ver ${enl('cv-nidos', 'Nidos de este titular')}.</p>`,
  },

  // ───────────────────────────── INFORMES ─────────────────────────────
  {
    id: 'informes', grupo: 'informes', titulo: 'Emitir informes técnicos (PDF / Word)',
    html: `
<p>Genera un informe con los datos y cifras calculados automáticamente. El texto es un <b>borrador que editas libremente</b> antes de emitirlo.</p>
<h4>Pasos</h4>
<ol>
  <li>Pulsa <b>Informes</b> en la cabecera (o <b>Informe del nido</b> dentro de una ficha para un informe individual).</li>
  <li><b>Nidos incluidos</b>: «Selección actual del panel» (respeta los filtros) o «Todos los nidos de la campaña».</li>
  <li>Rellena <b>título</b>, <b>referencia</b> (se propone una), <b>destinatario</b> (opcional), <b>elaborado por</b> y <b>cargo</b>. Autor, cargo y destinatario se recuerdan en este navegador.</li>
  <li>Marca las <b>secciones</b>: objeto y alcance, resumen ejecutivo, resultados por especie, por comunidad, por provincia y por localidad, causas de fracaso, intervenciones, relación de nidos y justificaciones, observaciones y conclusiones, y (opcional) anexo con una ficha técnica por nido.</li>
  <li>Elige los <b>mapas de localización</b>: general, por comunidades, por provincias y/o por localidades. Más niveles = más mapas y más tiempo de generación.</li>
  <li>Pulsa <b>Generar borrador</b> y revisa el documento en el editor. Ver ${enl('informe-editor', 'editor de informes')}.</li>
</ol>
<p class="ay-nota">Los mapas usan el fondo que elijas en el selector <b>Fondo</b> (Mapa de OpenStreetMap u Ortofoto PNOA del IGN); sin conexión solo se dibujan los puntos. Los nidos sin coordenadas se mencionan pero no se dibujan.</p>`,
  },
  {
    id: 'informe-editor', grupo: 'informes', titulo: 'Editor de documentos (informes, borradores de convenio y RGPD)',
    html: `
<p>Es el mismo editor para los informes técnicos y para los borradores de convenio y de consentimiento RGPD.</p>
<ul>
  <li><b>Editar</b>: haz clic en cualquier parte del documento y escribe (textos, tablas, justificaciones, conclusiones).</li>
  <li>Barra de formato: <b>N</b> negrita, <i>K</i> cursiva, <u>S</u> subrayado, lista con viñetas, deshacer y rehacer.</li>
  <li><b>← Volver</b> (cuando existe): regresa a la configuración; se pierden las ediciones del borrador (pide confirmación).</li>
  <li><b>Imprimir / PDF</b>: abre el diálogo de impresión del navegador; elige «Guardar como PDF».</li>
  <li><b>Descargar Word</b>: archivo <code>.doc</code> editable en Word o LibreOffice.</li>
  <li><b>Descargar HTML</b>: archivo autocontenido.</li>
</ul>
<p class="ay-nota">Las ediciones viven solo en la ventana abierta: si la cierras sin descargar o imprimir, se pierden. Descarga el documento antes de cerrar.</p>`,
  },

  // ───────────────────────────── CONTRATOS ─────────────────────────────
  {
    id: 'contratos', grupo: 'contratos', titulo: 'Contratos: visión general y cómo empezar',
    html: `
<p>El botón <b>Contratos</b> abre una ventana con 5 pestañas:</p>
<table class="ay-tabla">
  <tr><th>Pestaña</th><th>Para qué sirve</th></tr>
  <tr><td>${enl('convenios', 'Convenios')}</td><td>Lista de convenios; crear, editar y leer los ya firmados.</td></tr>
  <tr><td>${enl('parcelas', 'Parcelas')}</td><td>Fincas registradas, sus propietarios, nidos y convenio de la campaña actual.</td></tr>
  <tr><td>${enl('propietarios', 'Propietarios')}</td><td>Personas y entidades titulares, con sus datos y consentimiento RGPD.</td></tr>
  <tr><td>${enl('compensacion', 'Compensación')}</td><td>Dinero comprometido, pagado y pendiente por campaña y convenio.</td></tr>
  <tr><td>${enl('ayudas', 'Ayudas')}</td><td>Catálogo de códigos de ayuda (Anexo I) con sus importes.</td></tr>
</table>
<h4>Antes de empezar (administrador)</h4>
<ul>
  <li>Las tablas se crean una sola vez ejecutando <code>aguiluchos/supabase/contratos_parcelas.sql</code> en el SQL Editor de Supabase. Si no están, el panel muestra «Faltan las tablas de contratos» y no aparecen el semáforo ni el filtro de contrato.</li>
  <li>Para leer convenios firmados con Mistral hace falta la variable <code>MISTRAL_API_KEY</code> en Vercel.</li>
</ul>
<h4>Avisos de caducidad</h4>
<p>Arriba de la ventana se listan los convenios <b>firmados</b> que caducan en 60 días o menos, o que ya caducaron, según su fecha de «Vigencia hasta».</p>
<p>Para ver el orden recomendado de trabajo, consulta ${enl('flujos', 'Flujos de trabajo')}.</p>`,
  },
  {
    id: 'semaforo', grupo: 'contratos', titulo: 'El semáforo de contrato de un nido',
    html: `
<p>Indica si el nido está cubierto por un convenio <b>en su campaña</b>. Aparece en la tabla (columna Contrato), en el filtro «Contrato», en el color del mapa y en la ficha.</p>
<table class="ay-tabla">
  <tr><th>Color</th><th>Estado</th><th>Cuándo ocurre</th></tr>
  <tr><td><span class="sem" style="background:#2e6b3a"></span></td><td>Contrato firmado</td><td>Convenio firmado y vigente (o sin fecha de fin).</td></tr>
  <tr><td><span class="sem" style="background:#e08a1e"></span></td><td>Firmado: caduca pronto</td><td>Firmado, a 60 días o menos de caducar.</td></tr>
  <tr><td><span class="sem" style="background:#e08a1e"></span></td><td>Pendiente de firma</td><td>Convenio en borrador o enviado a firma.</td></tr>
  <tr><td><span class="sem" style="background:#c0392b"></span></td><td>Sin contrato</td><td>La parcela no tiene convenio esa campaña, o fue rechazado.</td></tr>
  <tr><td><span class="sem" style="background:#c0392b"></span></td><td>Contrato caducado</td><td>Estado «Caducado» o vigencia ya pasada.</td></tr>
  <tr><td><span class="sem" style="background:#8a8f8c"></span></td><td>Sin parcela vinculada</td><td>El nido no está vinculado a ninguna parcela ni coincide su referencia catastral.</td></tr>
</table>
<h4>Cómo se calcula</h4>
<ol>
  <li>Se busca la <b>parcela</b> del nido: vínculo explícito o, si no hay, la referencia catastral.</li>
  <li>Se calcula la <b>campaña del nido</b> (año de la incubación).</li>
  <li>Se busca el convenio que incluye esa parcela <b>en esa campaña</b>. Si hay varios, manda el más avanzado (firmado, enviado, borrador…).</li>
</ol>
<p class="ay-nota">El filtro «Sin contrato / caducado» agrupa los rojos; «Pendiente de firma / caduca pronto», los naranjas.</p>`,
  },
  {
    id: 'convenios', grupo: 'contratos', titulo: 'Pestaña Convenios',
    html: `
<ul>
  <li><b>Buscar</b> por propietario, zona del programa o parcela; filtrar por <b>campaña</b> y por <b>estado</b> (Borrador, Enviado a firma, Firmado, Caducado, Rechazado).</li>
  <li>Columnas: campaña, propietario, nº de parcelas, importe, estado, fecha de firma y vigencia hasta. Se ordenan por campaña (la más reciente primero).</li>
  <li><b>Haz clic en una fila</b> para abrir y editar el convenio. Ver ${enl('convenio-editor', 'editor de convenio')}.</li>
  <li><b>+ Nuevo convenio</b>: crea uno desde cero. Ver ${enl('contratos-nuevos', 'contratos nuevos')}.</li>
  <li><b>Leer convenios firmados</b>: sube PDF o fotos y Mistral rellena el convenio. Ver ${enl('leer-firmados', 'leer convenios firmados')}.</li>
</ul>
<h4>Estados de un convenio</h4>
<table class="ay-tabla">
  <tr><td><b>Borrador</b></td><td>En preparación; aún no se ha enviado.</td></tr>
  <tr><td><b>Enviado a firma</b></td><td>Entregado al propietario, a la espera de la firma.</td></tr>
  <tr><td><b>Firmado</b></td><td>Firmado por ambas partes. Obliga a indicar la fecha de firma. Es el único estado que cubre al nido (junto con su vigencia).</td></tr>
  <tr><td><b>Caducado</b></td><td>Terminó su vigencia (también se detecta solo por la fecha).</td></tr>
  <tr><td><b>Rechazado</b></td><td>El propietario no lo firmó; no cubre ningún nido.</td></tr>
</table>`,
  },
  {
    id: 'convenio-editor', grupo: 'contratos', titulo: 'Editor de convenio: visión general',
    html: `
<p>Se abre con <b>+ Nuevo convenio</b> o al hacer clic en un convenio. Tiene estos apartados (cada uno con su propio «?»):</p>
<ol>
  <li>${enl('cv-titular', 'Titular y campaña')}</li>
  <li>${enl('cv-firma', 'Firma y vigencia')}</li>
  <li>${enl('cv-parcelas', 'Parcelas del convenio')}</li>
  <li>${enl('cv-nidos', 'Nidos de este titular')}</li>
  <li>${enl('cv-compensacion', 'Compensación económica')}</li>
  <li>${enl('cv-documentos', 'Documentos')}</li>
  <li>Observaciones (texto libre)</li>
</ol>
<h4>Botones del pie</h4>
<ul>
  <li><b>Guardar convenio</b>: valida y guarda todo (propietario nuevo, parcelas nuevas, convenio, líneas, pagos, documentos y vínculos con nidos).</li>
  <li><b>Borrador del convenio</b>: genera el documento editable para imprimir y firmar. Ver ${enl('borradores', 'borradores')}.</li>
  <li><b>Eliminar</b> (solo administrador, convenios ya guardados).</li>
</ul>
<h4>Qué se valida al guardar</h4>
<ul>
  <li>Hay que elegir el <b>propietario</b> (titular).</li>
  <li>La <b>campaña</b> debe ser un año válido.</li>
  <li>Debe haber <b>al menos una parcela</b>, sin repetir.</li>
  <li>Un convenio <b>Firmado</b> necesita <b>fecha de firma</b>.</li>
  <li>La vigencia no puede terminar antes de empezar.</li>
  <li>Una parcela solo puede estar en <b>un convenio por campaña</b>.</li>
</ul>`,
  },
  {
    id: 'cv-titular', grupo: 'contratos', titulo: 'Convenio · Titular y campaña',
    html: `
<ul>
  <li><b>Propietario (titular)</b>: elige uno de la lista (se muestra con su NIF) o <b>➕ Propietario nuevo…</b> para dar de alta uno ahí mismo. Con propietario nuevo aparece un bloque con sus datos (nombre, tipo, entidad, NIF, REGEPA, teléfono, correo, dirección, IBAN, consentimiento RGPD). Si el NIF ya existe, se reutiliza el propietario registrado.</li>
  <li><b>Campaña (año)</b>: el año al que se aplica el convenio. Determina qué nidos cubre.</li>
  <li><b>Estado</b>: ver ${enl('convenios', 'estados del convenio')}.</li>
  <li><b>Programa</b>: por defecto «Compensatorias esteparias · Comunidad de Madrid». Determina qué catálogo de ayudas se usa.</li>
  <li><b>Zona del programa</b>: texto libre (por ejemplo, la ZEPA o la zona de actuación).</li>
</ul>`,
  },
  {
    id: 'cv-firma', grupo: 'contratos', titulo: 'Convenio · Firma y vigencia',
    html: `
<ul>
  <li><b>Fecha de firma</b>: obligatoria si el estado es Firmado.</li>
  <li><b>Vigencia desde / hasta</b>: periodo de validez. Si hay «hasta», el convenio pasa a «caduca pronto» 60 días antes y a «caducado» cuando se supera. Si la dejas vacía, no caduca.</li>
  <li><b>Lugar de firma</b>, <b>Firma por GREFA</b> y <b>Cargo</b>: aparecen en el borrador del convenio. Por defecto se propone el Secretario General de GREFA.</li>
</ul>`,
  },
  {
    id: 'cv-parcelas', grupo: 'contratos', titulo: 'Convenio · Parcelas del convenio (líneas)',
    html: `
<p>Cada línea es una parcela del convenio con su superficie, uso, ayudas e importe.</p>
<ol>
  <li>Pulsa <b>+ Añadir parcela</b>.</li>
  <li>Elige una <b>parcela ya registrada</b> en la lista o <b>➕ Parcela nueva…</b> e introduce municipio, SIGPAC (polígono, parcela, recinto) y referencia catastral. Las parcelas nuevas se crean al guardar el convenio; si ya existe otra con el mismo SIGPAC, se reutiliza.</li>
  <li>Indica <b>superficie (ha)</b> y <b>uso</b> (TA, PS…).</li>
  <li>Marca los <b>códigos de ayuda</b> (1-9) que se aplican a esa parcela.</li>
  <li>Pulsa <b>Calcular €</b> para proponer el importe de la línea: suma de las ayudas marcadas (las de «€/ha» se multiplican por la superficie; las «€/año» y «fijo» se suman tal cual). Las ayudas «Variable» (p. ej., lonja) <b>no se calculan solas</b>: escribe el importe a mano.</li>
  <li><b>Quitar</b> elimina la línea.</li>
</ol>
<p class="ay-nota">Una parcela solo puede aparecer en un convenio por campaña. Si ya está en otro, el panel avisa: «Una de las parcelas ya figura en otro convenio de esa campaña».</p>
<p>Si una parcela registrada no tiene propietario, al guardar queda asociada al titular del convenio.</p>`,
  },
  {
    id: 'cv-nidos', grupo: 'contratos', titulo: 'Convenio · Nidos de este titular',
    html: `
<p>Propone los <b>nidos aún sin parcela</b> que parecen ser del titular, para vincularlos a las parcelas del convenio al guardar.</p>
<ul>
  <li>Se buscan por el <b>nombre del propietario</b> del nido (deben coincidir al menos 2 palabras) o por el <b>teléfono</b> (últimos 9 dígitos).</li>
  <li>Los que coinciden por <b>nombre</b> salen <b>marcados</b>; los que solo coinciden por teléfono, sin marcar. Desmarca los que no correspondan.</li>
  <li>Para cada nido elige <b>a cuál de las parcelas del convenio</b> pertenece.</li>
  <li>Al guardar, los marcados quedan vinculados a su parcela y heredan el contrato (semáforo).</li>
</ul>
<p class="ay-nota">Esto depende de que el nido tenga rellenos «Propietario» o «Teléfono» en su ficha. Si no, vincula el nido a mano desde su ficha (${enl('ficha-contrato', 'Parcela y contrato')}).</p>`,
  },
  {
    id: 'cv-compensacion', grupo: 'contratos', titulo: 'Convenio · Compensación económica y pagos',
    html: `
<ul>
  <li><b>Importe total del convenio (€)</b>: lo comprometido. <b>Total = suma de las líneas</b> lo calcula con los importes de las parcelas.</li>
  <li><b>% que se abona a la firma</b>: por defecto 60 %.</li>
  <li><b>Generar pagos (firma / finalización)</b>: crea dos pagos, «Pago a la firma» (el % indicado) y «Pago a la finalización» (el resto).</li>
  <li><b>+ Añadir pago</b>: añade un pago manual con concepto, importe, fecha prevista, <b>fecha en que se pagó</b> y estado (<b>Pendiente</b> / <b>Pagado</b>). El botón × lo quita.</li>
</ul>
<p>Cuando se paga, cambia el estado a <b>Pagado</b> y anota la fecha: así se refleja en ${enl('compensacion', 'Compensación')}.</p>`,
  },
  {
    id: 'cv-documentos', grupo: 'contratos', titulo: 'Convenio · Documentos adjuntos',
    html: `
<p>Los documentos se guardan en un <b>almacén privado</b> (nadie sin sesión puede verlos).</p>
<ol>
  <li>Elige el <b>tipo</b>: Convenio firmado, Consentimiento RGPD, Copia del DNI, Certificado de titularidad de la cuenta, Hoja catastral, Croquis / salida gráfica SIGPAC u Otro.</li>
  <li>Selecciona el archivo y pulsa <b>Subir</b>.</li>
  <li><b>Abrir</b> genera un enlace temporal (5 minutos) para verlo. <b>Borrar</b> (solo administrador) lo elimina.</li>
</ol>
<p class="ay-nota">Si el convenio aún no está guardado, los archivos quedan en espera y se registran al pulsar <b>Guardar convenio</b>. Los propietarios tienen también su propia sección de documentos.</p>
<p>Si subes el <b>mismo PDF</b> que ya existe (se compara su huella), el sistema lo detecta para evitar duplicados al leer convenios firmados.</p>`,
  },
  {
    id: 'leer-firmados', grupo: 'contratos', titulo: 'Leer convenios ya firmados con Mistral',
    html: `
<p>Convierte los PDF o fotos de convenios firmados en convenios del panel, <b>asociándolos automáticamente</b> a los propietarios, parcelas y nidos ya registrados. Tú siempre revisas antes de guardar.</p>
<h4>Pasos</h4>
<ol>
  <li>En <b>Contratos → Convenios</b> pulsa <b>Leer convenios firmados</b>.</li>
  <li>Elige <b>uno o varios</b> archivos (PDF o imagen) y pulsa <b>Subir y leer</b>.</li>
  <li>Espera: cada convenio tarda unos <b>10-40 segundos</b>. Mientras revisas uno, el siguiente se va leyendo.</li>
  <li>Se abre el <b>editor de convenio ya relleno</b> con un aviso: «Datos leídos automáticamente… Compruébalos con el original». Revisa especialmente <b>NIF, SIGPAC, importes y ayudas</b>, y las «dudas» que señale la lectura.</li>
  <li>Revisa los <b>nidos propuestos</b> (${enl('cv-nidos', 'Nidos de este titular')}) y pulsa <b>Guardar convenio</b>.</li>
  <li>Se pasa al siguiente. Al terminar verás el resumen: guardados, saltados y errores.</li>
</ol>
<h4>Qué asocia automáticamente</h4>
<ul>
  <li><b>Propietario</b>: por NIF y, si no, por nombre. Si ya existe, lo reutiliza; si no, propone crearlo.</li>
  <li><b>Parcelas</b>: por SIGPAC (municipio, polígono, parcela y recinto; los ceros a la izquierda no importan). Las ya registradas se reutilizan; si no tenían propietario, se les asigna el titular.</li>
  <li><b>Nidos</b>: por nombre o teléfono del propietario del nido.</li>
  <li><b>Documento</b>: el PDF queda guardado como «Convenio firmado» del convenio.</li>
  <li><b>Pagos</b>: se proponen con el reparto firma/finalización leído.</li>
</ul>
<h4>Casos especiales</h4>
<ul>
  <li><b>PDF repetido</b>: se omite («ya estaba subido»).</li>
  <li><b>No se pudo leer</b>: el archivo queda adjunto y el formulario vacío para rellenarlo a mano.</li>
  <li><b>Cierras el editor sin guardar</b>: ese convenio no se guarda y se pasa al siguiente.</li>
</ul>
<h4>Privacidad y límites</h4>
<ul>
  <li>El documento se envía a <b>Mistral</b> solo para leerlo. No se guarda su texto. El <b>IBAN se enmascara en el servidor</b>: solo se guardan los 4 últimos dígitos.</li>
  <li>La lectura de textos <b>manuscritos</b> puede fallar. No des por bueno ningún dato sin comprobarlo con el original.</li>
  <li>El administrador debe haber configurado <code>MISTRAL_API_KEY</code> en Vercel. Si no, el panel dice «Falta configurar MISTRAL_API_KEY».</li>
  <li>Recomendación: prueba primero con <b>un</b> convenio antes de cargar todos.</li>
</ul>`,
  },
  {
    id: 'contratos-nuevos', grupo: 'contratos', titulo: 'Contratos nuevos: del borrador a la firma',
    html: `
<ol>
  <li>Da de alta el <b>propietario</b> y sus <b>parcelas</b> (o créalos desde el propio convenio).</li>
  <li><b>Contratos → Convenios → + Nuevo convenio</b>: elige titular, campaña, parcelas, ayudas e importes. Deja el estado en <b>Borrador</b>.</li>
  <li>Pulsa <b>Borrador del convenio</b> para generar el documento con todos los datos; edítalo si hace falta e <b>imprímelo o descárgalo</b> en PDF/Word. Ver ${enl('borradores', 'borradores')}.</li>
  <li>Cambia el estado a <b>Enviado a firma</b> cuando lo entregues.</li>
  <li>Cuando vuelva firmado: estado <b>Firmado</b>, <b>fecha de firma</b> y <b>vigencia</b>, y sube el PDF escaneado en <b>Documentos</b> como «Convenio firmado».</li>
  <li>Genera los <b>pagos</b> y vincula los <b>nidos</b> del titular.</li>
</ol>
<p>También pide al propietario el <b>consentimiento RGPD</b> (genera su borrador desde el propietario) y archívalo en sus documentos.</p>`,
  },
  {
    id: 'borradores', grupo: 'contratos', titulo: 'Borradores del convenio y del consentimiento RGPD',
    html: `
<ul>
  <li><b>Borrador del convenio</b> (en el editor de convenio): documento con las partes (propietario y GREFA), el programa, la tabla de parcelas con las columnas de ayudas 1-9 marcadas, los importes y el reparto de pagos, y la mención al anexo catastral.</li>
  <li><b>Borrador RGPD</b> (en el editor de propietario): consentimiento informado para el tratamiento de sus datos personales, con sus datos precargados.</li>
</ul>
<p>Ambos se abren en el editor de documentos: ${enl('informe-editor', 'editor de documentos')}. Edita lo que necesites y descarga o imprime.</p>
<p class="ay-nota">Los borradores se generan con los datos <b>guardados o escritos</b> en el formulario. Revísalos siempre antes de firmar: el modelo jurídico definitivo es responsabilidad de GREFA.</p>`,
  },
  {
    id: 'parcelas', grupo: 'contratos', titulo: 'Pestaña Parcelas',
    html: `
<ul>
  <li>Lista de fincas con: parcela (SIGPAC y referencia), municipio, provincia, superficie, propietarios, <b>número de nidos</b> vinculados y <b>estado del convenio del año en curso</b>.</li>
  <li><b>Buscar</b> por parcela, municipio o referencia catastral.</li>
  <li><b>Haz clic en una fila</b> para abrir la parcela. Ver ${enl('parcela-editor', 'editor de parcela')}.</li>
  <li><b>+ Nueva parcela</b>: da de alta una parcela manualmente.</li>
</ul>
<p>Para vincular un nido concreto a una parcela, lo más cómodo es hacerlo desde la ficha del nido (${enl('ficha-contrato', 'Parcela y contrato')}).</p>`,
  },
  {
    id: 'parcela-editor', grupo: 'contratos', titulo: 'Editor de parcela',
    html: `
<ul>
  <li><b>Identificación</b>: país, provincia y municipio; SIGPAC (provincia, MUN, AGR, ZONA, POL, PAR, REC) y referencia catastral. Hace falta <b>polígono y parcela</b> (SIGPAC) <b>o</b> la referencia catastral.</li>
  <li><b>Superficie (ha)</b>, <b>uso</b> y <b>latitud / longitud</b> (opcionales; sirven para localizarla), zona del programa y notas.</li>
  <li>Una vez guardada: <b>Propietarios de la parcela</b> (elige uno y pulsa <b>Añadir</b>, o <b>Nuevo propietario…</b>; <b>Quitar</b> lo desasigna), <b>Nidos en esta parcela</b> y <b>Convenios que la incluyen</b>.</li>
  <li><b>Eliminar</b> (administrador): solo si no hay convenios que la usen.</li>
</ul>
<p>No puede haber dos parcelas con la misma identificación SIGPAC («Ya existe una parcela con esa identificación SIGPAC»).</p>`,
  },
  {
    id: 'propietarios', grupo: 'contratos', titulo: 'Pestaña Propietarios',
    html: `
<ul>
  <li>Lista con nombre (y entidad), NIF, tipo, teléfono, nº de convenios y si tiene el <b>consentimiento RGPD</b> (✔).</li>
  <li><b>Buscar</b> por nombre, NIF o entidad.</li>
  <li><b>Haz clic en una fila</b> para abrir el propietario. Ver ${enl('propietario-editor', 'editor de propietario')}.</li>
  <li><b>+ Nuevo propietario</b>: alta manual.</li>
</ul>`,
  },
  {
    id: 'propietario-editor', grupo: 'contratos', titulo: 'Editor de propietario',
    html: `
<ul>
  <li><b>Actúa como</b>: particular, representante de C.B./SAT… o entidad (en ese caso indica la entidad que representa).</li>
  <li>Nombre y apellidos / razón social (obligatorio), DNI/NIF/CIF, nº de REGEPA, teléfono, correo y dirección.</li>
  <li><b>IBAN</b>: escríbelo completo; el navegador lo enmascara antes de guardar y <b>solo se conservan los 4 últimos dígitos</b>. Nunca se almacena el IBAN completo.</li>
  <li><b>Consentimiento RGPD firmado</b> y su fecha. <b>Borrador RGPD</b> genera el documento para que lo firme.</li>
  <li><b>Documentos del propietario</b>: consentimiento RGPD, DNI, titularidad de la cuenta u otros.</li>
  <li><b>Convenios</b>: lista de los suyos (campaña, estado, importe).</li>
</ul>
<p>No puede haber dos propietarios con el mismo NIF («Ya existe un propietario con ese NIF»). <b>Eliminar</b> es solo para el administrador y falla si el propietario tiene convenios.</p>`,
  },
  {
    id: 'compensacion', grupo: 'contratos', titulo: 'Pestaña Compensación',
    html: `
<p>Resume el dinero de los convenios. Solo cuentan los convenios <b>firmados</b> (o caducados tras firmarse).</p>
<ul>
  <li><b>Por campaña</b>: nº de convenios, comprometido, pagado y pendiente.</li>
  <li><b>Por convenio</b>: lo mismo para cada uno; haz clic en una fila para abrir el convenio.</li>
  <li><b>Comprometido</b> = importe total del convenio (o la suma de sus pagos si no se indicó total). <b>Pagado</b> = suma de los pagos en estado «Pagado». <b>Pendiente</b> = comprometido − pagado.</li>
  <li><b>Descargar CSV</b>: exporta la tabla por convenio (separador «;», para Excel).</li>
</ul>
<p class="ay-nota">Si los números no cuadran, revisa en cada convenio que los pagos realizados estén marcados como <b>Pagado</b>.</p>`,
  },
  {
    id: 'ayudas', grupo: 'contratos', titulo: 'Pestaña Ayudas: catálogo del Anexo I',
    html: `
<p>Define los <b>códigos de ayuda (1-9)</b> del convenio con su descripción, unidad e importe, por <b>programa</b> y <b>campaña</b>. Se usa para marcar ayudas en las líneas del convenio y calcular importes.</p>
<ol>
  <li>Pulsa <b>Editar catálogo de ayudas</b>.</li>
  <li>Elige el <b>programa</b> y la <b>campaña</b>.</li>
  <li>Edita cada código: <b>descripción</b>, <b>unidad</b> (€/ha, €/año, € fijo o Variable), <b>importe</b> y <b>nota</b>.</li>
  <li><b>+ Añadir código</b> crea uno más. <b>Copiar a otra campaña…</b> duplica el catálogo para el año siguiente (luego ajusta los importes).</li>
  <li>Pulsa <b>Guardar catálogo</b>.</li>
</ol>
<p class="ay-nota">Las ayudas «Variable» (por ejemplo, las referidas a la lonja) no se calculan solas: el importe de la línea se escribe a mano. Las descripciones iniciales son provisionales hasta completar el Anexo I del convenio.</p>`,
  },

  // ───────────────────────────── MÁS INFORMACIÓN ─────────────────────────────
  {
    id: 'flujos', grupo: 'otros', titulo: 'Flujos de trabajo recomendados',
    html: `
<h4>A. Cargar los convenios que ya están firmados</h4>
<ol>
  <li>Prueba con <b>un</b> PDF: ${enl('leer-firmados', 'Leer convenios firmados')}.</li>
  <li>Comprueba NIF, parcelas, ayudas e importes con el original y guarda.</li>
  <li>Carga el resto por lotes. Comprueba en <b>Parcelas</b> que quedaron con propietario y en el <b>mapa</b> (color «Contrato») los nidos.</li>
</ol>
<h4>B. Preparar contratos de una campaña nueva</h4>
<ol>
  <li><b>Ayudas</b> → copia el catálogo a la nueva campaña y ajusta importes.</li>
  <li>Alta de propietarios y parcelas; convenio nuevo → <b>Borrador del convenio</b> → firma → subir el PDF → estado Firmado.</li>
  <li>Genera los pagos y vincula los nidos.</li>
</ol>
<h4>C. Durante la campaña de campo</h4>
<ol>
  <li>Usa el filtro <b>Contrato → Sin contrato / caducado</b> para ver qué nidos no tienen cobertura y hay que gestionar.</li>
  <li>Filtra «Sin parcela vinculada» para enlazar nidos con su parcela.</li>
  <li>Vigila los <b>avisos de caducidad</b> al abrir Contratos.</li>
</ol>
<h4>D. Cierre de campaña</h4>
<ol>
  <li>Revisa que todos los nidos tengan su resultado reproductivo y causas de fracaso.</li>
  <li>Emite el <b>informe técnico</b> (${enl('informes', 'Informes')}) y descarga el <b>CSV</b> de nidos.</li>
  <li>En <b>Compensación</b> revisa lo pagado y pendiente y descarga el CSV.</li>
</ol>`,
  },
  {
    id: 'app-movil', grupo: 'otros', titulo: 'La app de campo (Android) y su relación con el panel',
    html: `
<ul>
  <li>La app <b>Aguiluchos</b> trabaja sin cobertura: guarda los nidos en el móvil y los <b>sincroniza</b> cuando hay conexión (botón de sincronizar, al abrirla y al volver a ella).</li>
  <li>Permite crear nidos, editar las 4 fases, crear un nido en tu <b>posición GPS</b>, ver la lista y el mapa, filtrar, exportar informes e importar desde Excel.</li>
  <li><b>Radar de nidos</b> (versión 1.7.0, icono de radar en la barra superior): muestra los nidos cercanos a tu posición GPS en un radar con el norte arriba. Amplía o reduce el <b>radio</b> (100 m, 250 m, 500 m, 1 km, 2 km, 5 km, 10 km y 25 km) con los botones + y −, el deslizador o pellizcando. Debajo, la lista ordenada por distancia con el rumbo (N, NE, E…). Toca un nido para ver su distancia y rumbo, abrir su ficha o llegar con Google Maps. Funciona sin cobertura (solo necesita el GPS) y solo muestra los nidos que tienen coordenadas.</li>
  <li>Lo que se anota en la app aparece en este panel y viceversa. Si dos personas editan el mismo nido, se conserva la versión más reciente.</li>
  <li><b>Contratos y parcelas en la app</b> (versión 1.6.0): pantalla de consulta <b>solo lectura</b> con convenios y parcelas, buscador, llamada al titular y apertura de la parcela en el mapa. En la ficha del nido hay un bloque «Parcela y contrato» y en la lista, una etiqueta de semáforo. Se guarda una copia en el móvil para verlo sin cobertura.</li>
  <li>La app <b>no descarga</b> NIF, IBAN, direcciones ni importes de los convenios.</li>
  <li>Los contratos, parcelas y vínculos se <b>crean y editan solo desde este panel</b>.</li>
</ul>`,
  },
  {
    id: 'privacidad', grupo: 'otros', titulo: 'Privacidad y protección de datos',
    html: `
<ul>
  <li><b>Acceso</b>: solo usuarios con sesión y correo @grefa.org pueden ver o modificar contratos.</li>
  <li><b>IBAN</b>: nunca se guarda completo. Se enmascara en el navegador, se vuelve a enmascarar en el servidor al leer un PDF y la base de datos rechaza cualquier valor que no esté enmascarado.</li>
  <li><b>Documentos</b> (convenios, DNI, titularidad de cuenta…): almacén privado; se abren con enlaces temporales de 5 minutos.</li>
  <li><b>Mistral</b>: al leer un convenio firmado, el documento se envía a Mistral únicamente para extraer los datos. No se conserva el texto leído.</li>
  <li><b>Consentimiento RGPD</b>: se registra por propietario (casilla, fecha y documento firmado).</li>
  <li><b>App móvil</b>: la consulta de contratos no incluye NIF, IBAN, dirección ni importes.</li>
  <li><b>Eliminar</b> documentos y registros está reservado al administrador.</li>
</ul>`,
  },
  {
    id: 'problemas', grupo: 'otros', titulo: 'Solución de problemas y mensajes frecuentes',
    html: `
<table class="ay-tabla">
  <tr><th>Mensaje o síntoma</th><th>Qué significa y qué hacer</th></tr>
  <tr><td>«Faltan las tablas de contratos en Supabase»</td><td>No se ha ejecutado <code>contratos_parcelas.sql</code>. Pídele al administrador que lo ejecute en el SQL Editor de Supabase.</td></tr>
  <tr><td>No veo el semáforo ni el filtro «Contrato»</td><td>Mismo caso: las tablas no existen o no hay permisos. También se oculta si falla la carga.</td></tr>
  <tr><td>«No tienes permiso para esta operación»</td><td>Tu sesión caducó o tu correo no es @grefa.org. Cierra sesión y vuelve a entrar.</td></tr>
  <tr><td>«Una de las parcelas ya figura en otro convenio de esa campaña»</td><td>Una parcela solo puede estar en un convenio por campaña. Quítala de uno o cambia la campaña.</td></tr>
  <tr><td>«Ya existe un propietario con ese NIF»</td><td>Elige al propietario existente en la lista en vez de crear otro.</td></tr>
  <tr><td>«Ya existe una parcela con esa identificación SIGPAC»</td><td>Usa la parcela ya registrada.</td></tr>
  <tr><td>«No se puede completar: hay datos relacionados»</td><td>Intentas borrar algo que otro registro usa (p. ej. un propietario con convenios). Elimina antes lo relacionado.</td></tr>
  <tr><td>Un convenio firmado «necesita la fecha de firma»</td><td>Rellena «Fecha de firma» en «Firma y vigencia».</td></tr>
  <tr><td>«Falta configurar MISTRAL_API_KEY» al leer un PDF</td><td>El administrador debe añadir la clave en Vercel y redesplegar.</td></tr>
  <tr><td>«Inicia sesión para leer contratos»</td><td>La sesión caducó. Vuelve a entrar con tu correo @grefa.org.</td></tr>
  <tr><td>«No se pudo leer automáticamente…»</td><td>El PDF no se pudo interpretar (borroso, formato raro). Queda adjunto: rellena el convenio a mano.</td></tr>
  <tr><td>La lectura tarda mucho</td><td>Cada documento puede tardar hasta un minuto. Espera sin cerrar la ventana.</td></tr>
  <tr><td>Un nido sale «Sin parcela vinculada»</td><td>Vincúlalo desde su ficha, o guarda un convenio cuyo titular coincida con su propietario/teléfono para que se proponga.</td></tr>
  <tr><td>Un nido sale «Sin contrato» pero el propietario tiene convenio</td><td>El convenio es de otra campaña o la parcela del nido no está en él. Comprueba la fecha de incubación del nido y las parcelas del convenio.</td></tr>
  <tr><td>Los datos no se actualizan</td><td>Mira el indicador «En vivo». Si no es verde, el panel se actualiza cada 90 s; pulsa <b>Actualizar</b>.</td></tr>
  <tr><td>«Otro operario había guardado una versión más reciente»</td><td>Se conservó la versión más nueva. Recarga el nido y repite tu cambio si hace falta.</td></tr>
  <tr><td>Los mapas del informe salen sin fondo</td><td>Sin conexión solo se dibujan los puntos. Vuelve a generarlos con internet.</td></tr>
  <tr><td>El PDF no se descarga</td><td>El botón abre el diálogo de impresión: elige «Guardar como PDF» como impresora.</td></tr>
  <tr><td>No veo el botón Eliminar</td><td>Solo lo ve el administrador.</td></tr>
  <tr><td>No puedo ver el IBAN completo</td><td>Es intencionado: solo se guardan los 4 últimos dígitos.</td></tr>
</table>
<p>Si el problema persiste, anota el mensaje exacto y avisa al administrador.</p>`,
  },
  {
    id: 'glosario', grupo: 'otros', titulo: 'Glosario',
    html: `
<table class="ay-tabla">
  <tr><td><b>Anexo I</b></td><td>Parte del convenio que describe las ayudas (códigos 1-9) y sus importes.</td></tr>
  <tr><td><b>Campaña</b></td><td>Año de la temporada reproductora y del convenio.</td></tr>
  <tr><td><b>Compensatorias</b></td><td>Proyecto/programa de compensación a propietarios por proteger nidos en sus parcelas.</td></tr>
  <tr><td><b>Last-Write-Wins</b></td><td>Regla de conflictos: gana la versión guardada más recientemente.</td></tr>
  <tr><td><b>OCR</b></td><td>Reconocimiento de texto en documentos escaneados; lo hace Mistral al leer convenios.</td></tr>
  <tr><td><b>REGEPA</b></td><td>Registro de explotación agraria del propietario.</td></tr>
  <tr><td><b>Rodal</b></td><td>Zona sin cosechar alrededor de un nido para proteger a los pollos.</td></tr>
  <tr><td><b>SIGPAC</b></td><td>Sistema de identificación de parcelas agrícolas: provincia, municipio, agregado, zona, polígono, parcela y recinto.</td></tr>
  <tr><td><b>Semáforo</b></td><td>Indicador de color del contrato de cada nido.</td></tr>
  <tr><td><b>UTM</b></td><td>Sistema de coordenadas en metros (X = Este, Y = Norte) usado en las fichas de nido.</td></tr>
  <tr><td><b>Vínculo explícito</b></td><td>Unión nido–parcela marcada por una persona (frente a la deducida por referencia catastral).</td></tr>
  <tr><td><b>RGPD</b></td><td>Reglamento General de Protección de Datos; requiere el consentimiento informado del propietario.</td></tr>
</table>`,
  },
];

/** Pestaña de Contratos → sección de ayuda. */
export const AYUDA_TAB = {
  convenios: 'convenios', parcelas: 'parcelas', propietarios: 'propietarios', compensacion: 'compensacion', ayudas: 'ayudas',
};

// ── Utilidades de texto ──────────────────────────────────────────────────────
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const textoPlano = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Botón «?» que abre el manual en la sección indicada. */
export const ayudaBtn = (id, titulo = 'Ayuda de esta pantalla (F1)') =>
  `<button type="button" class="btn-ayuda" data-ayuda="${esc(id)}" title="${esc(titulo)}" aria-label="${esc(titulo)}">?</button>`;

export const seccion = (id) => MANUAL.find((s) => s.id === id);

/** Ids de sección usados en enlaces internos del manual. */
export const idsEnlazadosEnManual = () => [...new Set(MANUAL.flatMap((s) => [...s.html.matchAll(/data-ayuda="([^"]+)"/g)].map((m) => m[1])))];

const CSS_MANUAL = `body{font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;color:#1d2a1f;max-width:900px;margin:24px auto;padding:0 16px}
h1{color:#1f4a28}h2{color:#2e6b3a;border-bottom:2px solid #2e6b3a;padding-bottom:4px;margin-top:34px}h3{margin:26px 0 6px;color:#1f4a28}h4{margin:16px 0 4px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #d9dfd6;padding:6px 9px;text-align:left;vertical-align:top}th{background:#eef2ec}
pre{background:#f3f5f2;padding:10px;border-radius:8px;overflow:auto}code{background:#f3f5f2;padding:1px 5px;border-radius:4px}kbd{border:1px solid #bbb;border-radius:4px;padding:0 5px;background:#fafafa}
.ay-nota{background:#fdf3e0;border-left:4px solid #e08a1e;padding:8px 12px;border-radius:4px}.sem{display:inline-block;width:14px;height:14px;border-radius:50%}
.btn-ayuda-demo{display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:#2e6b3a;color:#fff;font-weight:700;font-size:12px}
a{color:#2c6fa8}@media print{a{color:inherit;text-decoration:none}h3{page-break-after:avoid}table,pre{page-break-inside:avoid}}`;

/** Manual completo como documento HTML autocontenido (para descargar o imprimir). */
export function manualHtmlCompleto() {
  const porGrupo = GRUPOS.map(([g, nombre]) => `<h2>${esc(nombre)}</h2>${MANUAL.filter((s) => s.grupo === g)
    .map((s) => `<section id="${esc(s.id)}"><h3>${esc(s.titulo)}</h3>${s.html.replace(/<a href="#" data-ayuda="([^"]+)">/g, '<a href="#$1">')}</section>`).join('')}`).join('');
  const indice = `<h2>Índice</h2><ul>${GRUPOS.map(([g, nombre]) => `<li><b>${esc(nombre)}</b><ul>${MANUAL.filter((s) => s.grupo === g)
    .map((s) => `<li><a href="#${esc(s.id)}">${esc(s.titulo)}</a></li>`).join('')}</ul></li>`).join('')}</ul>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Manual del Panel GREFA · Campaña Aguilucho</title><style>${CSS_MANUAL}</style></head>
<body><h1>Manual del Panel GREFA · Campaña Aguilucho</h1><p>Guía completa de uso del panel de nidos, informes y contratos.</p>${indice}${porGrupo}</body></html>`;
}

// ── Ventana de ayuda ─────────────────────────────────────────────────────────
let dlg = null;

function construir() {
  dlg = document.createElement('dialog');
  dlg.className = 'dlg-ayuda';
  dlg.innerHTML = `<div class="dlg-cab"><h2>Ayuda del panel</h2>
      <button type="button" class="btn" id="ay-imprimir" title="Imprime o guarda el manual completo en PDF">Imprimir manual</button>
      <button type="button" class="btn" id="ay-descargar" title="Descarga el manual como archivo HTML">Descargar</button>
      <button type="button" class="btn" id="ay-cerrar">Cerrar</button></div>
    <div class="ay-cuerpo">
      <nav class="ay-indice"><input type="search" id="ay-q" placeholder="Buscar en la ayuda…" autocomplete="off" />
        <div id="ay-toc">${GRUPOS.map(([g, nombre]) => `<div class="ay-grupo" data-g="${g}"><b>${esc(nombre)}</b>${MANUAL.filter((s) => s.grupo === g)
          .map((s) => `<a href="#" data-ir="${esc(s.id)}">${esc(s.titulo)}</a>`).join('')}</div>`).join('')}</div></nav>
      <article id="ay-contenido">${MANUAL.map((s) => `<section class="ay-sec" id="ay-sec-${esc(s.id)}" data-sec="${esc(s.id)}"><h3>${esc(s.titulo)}</h3>${s.html}</section>`).join('')}
        <p class="ay-vacio" id="ay-vacio" hidden>No hay apartados con esa búsqueda.</p></article>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#ay-cerrar').onclick = () => dlg.close();
  dlg.querySelector('#ay-q').oninput = (ev) => filtrar(ev.target.value);
  dlg.querySelector('#ay-toc').onclick = (ev) => {
    const a = ev.target.closest('[data-ir]');
    if (!a) return;
    ev.preventDefault();
    irA(a.dataset.ir);
  };
  dlg.querySelector('#ay-descargar').onclick = () => {
    const blob = new Blob([manualHtmlCompleto()], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'manual-panel-grefa.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  dlg.querySelector('#ay-imprimir').onclick = () => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.srcdoc = manualHtmlCompleto();
    f.onload = () => {
      f.contentWindow.focus();
      f.contentWindow.print();
      setTimeout(() => f.remove(), 60_000);
    };
    document.body.appendChild(f);
  };
}

function filtrar(texto) {
  const q = norm(texto).trim();
  let visibles = 0;
  for (const s of MANUAL) {
    const ok = !q || norm(`${s.titulo} ${textoPlano(s.html)}`).includes(q);
    const sec = dlg.querySelector(`#ay-sec-${s.id}`);
    const enlace = dlg.querySelector(`[data-ir="${s.id}"]`);
    if (sec) sec.hidden = !ok;
    if (enlace) enlace.hidden = !ok;
    if (ok) visibles += 1;
  }
  dlg.querySelectorAll('.ay-grupo').forEach((g) => { g.hidden = ![...g.querySelectorAll('[data-ir]')].some((a) => !a.hidden); });
  dlg.querySelector('#ay-vacio').hidden = visibles > 0;
}

function irA(id) {
  const q = dlg.querySelector('#ay-q');
  if (q.value) { q.value = ''; filtrar(''); }
  const sec = dlg.querySelector(`#ay-sec-${id}`);
  if (!sec) return;
  dlg.querySelectorAll('.ay-activa').forEach((e) => e.classList.remove('ay-activa'));
  dlg.querySelectorAll('[data-ir].activa').forEach((e) => e.classList.remove('activa'));
  dlg.querySelector(`[data-ir="${id}"]`)?.classList.add('activa');
  sec.classList.add('ay-activa');
  sec.scrollIntoView({ block: 'start' });
  setTimeout(() => sec.classList.remove('ay-activa'), 2200);
}

/** Abre el manual (opcionalmente en una sección concreta). */
export function abrirAyuda(id = 'inicio') {
  if (!dlg) construir();
  if (!dlg.open) dlg.showModal();
  irA(seccion(id) ? id : 'inicio');
  dlg.querySelector('#ay-contenido').focus?.();
}

/** Instala los atajos globales: clic en cualquier [data-ayuda] y tecla F1. */
export function iniciarAyuda() {
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest?.('[data-ayuda]');
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    abrirAyuda(el.dataset.ayuda);
  }, true);
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'F1') return;
    ev.preventDefault();
    if (dlg?.open) return;
    const abiertos = [...document.querySelectorAll('dialog[open]')];
    const ctx = abiertos.reverse().map((d) => d.querySelector('[data-ayuda]')).find(Boolean);
    abrirAyuda(ctx?.dataset.ayuda ?? (document.querySelector('.login') ? 'acceso' : 'inicio'));
  });
}
