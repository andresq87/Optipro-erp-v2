# ÓpticaPro ERP — Backend + Front-end

API REST en Node.js + Express + SQLite (módulo `node:sqlite` incluido en Node.js — no requiere
instalar compiladores ni Visual Studio) que le da funcionalidad real al ERP. El propio servidor
también sirve el front-end (carpeta `public/`), así que **solo necesitas correr un comando** y
abrir una URL — no hace falta un segundo servidor para el HTML.

**Requiere Node.js 22.5 o superior** (usa `node -v` para verificar).

## Cómo ponerlo en marcha (uso local)

```bash
npm install
cp .env.example .env      # revisa el archivo, no es obligatorio cambiar nada para probar en local
node server.js              # crea el superadmin automáticamente e inicia todo en un solo puerto
```

Abre **http://localhost:3001** en tu navegador — ahí mismo está el ERP, ya conectado.

El superadmin (`admin@opticapro.co` / `Admin1234` por defecto, o lo que hayas puesto en
`ADMIN_EMAIL`/`ADMIN_PASSWORD` en tu `.env`) se crea automáticamente la primera vez que arranca
el servidor. No necesitas correr ningún comando de siembra a mano para tener un sistema funcional.

### Datos de ejemplo (opcional, solo para practicar)

Si quieres tener usuarios de prueba con distintos roles, productos, mensajes y prospectos de
ejemplo para explorar el sistema, corre además:

```bash
node seed.js
```

Esto NO se ejecuta nunca automáticamente (ni en local ni en producción) — es una acción manual
que tú decides correr, para no ensuciar un sistema real con datos falsos.

| Rol | Correo | Contraseña |
|---|---|---|
| Superadmin | admin@opticapro.co | Admin1234 |
| Optómetra | c.ramos@opticapro.co | Optometra1 |
| Vendedor/a | m.vera@opticapro.co | Vendedor1 |
| Contador/a | l.mendoza@opticapro.co | Contador1 |

## Ponerlo en internet

Ver **[DEPLOY.md](./DEPLOY.md)** — guía paso a paso para Railway o Render, incluyendo cómo
configurar un disco persistente para que la base de datos no se borre en cada despliegue.

## Matriz de permisos

Ya **no** vive en código — se guarda en la tabla `permisos` de la base de datos y es 100%
editable desde la interfaz: entra a **Usuarios y Roles**, baja hasta "Matriz de Permisos", y
marca o desmarca las casillas. El cambio aplica de inmediato, sin reiniciar el servidor.

**Solo el superadmin puede modificar la matriz** — esa regla sí está fija en el código
(`middleware/auth.js`) y no se puede cambiar desde la UI, precisamente para que nadie pueda
otorgarse permisos a sí mismo. El superadmin, además, siempre tiene acceso total a todo el
sistema por diseño: no aparece como columna editable en la matriz.

Reglas de seguridad adicionales que están fijas en el código (no configurables, para evitar que
alguien escale privilegios así tenga el permiso de "gestionar usuarios"):
- Solo un superadmin puede crear, editar o eliminar a **otro** superadmin.
- Nadie puede eliminar su propio usuario ni al último superadmin activo del sistema.

Endpoints: `GET /api/permisos` (cualquier usuario autenticado puede consultarla),
`PUT /api/permisos` (solo superadmin, body `{accion, rol, permitido}`).

## Probar que funciona

```bash
curl http://localhost:3001/api/health
```

## Endpoints implementados

| Módulo | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `GET/POST/PUT/DELETE /api/auth/usuarios[/:id]` (gestión solo superadmin) |
| Pacientes | `GET/POST /api/pacientes`, `GET/PUT/DELETE /api/pacientes/:id` |
| Inventario | `GET/POST/PUT/DELETE /api/productos[/:id]`, `GET /api/productos/categorias`, `GET /api/productos/bajo-stock`, `PUT /api/productos/:id/stock` |
| Ventas/POS | `GET/POST /api/ventas`, `GET /api/ventas/:id` |
| Citas/Agenda | `GET/POST /api/citas`, `POST /api/citas/:id/recordatorio` (envío manual), `PUT /api/citas/:id/estado` |
| Mensajes/Chat | `GET /api/mensajes`, `GET /api/mensajes/:contacto_ref`, `POST /api/mensajes`, `GET /api/mensajes/no-leidos/total` |
| Historias clínicas | `POST /api/historias`, `GET /api/historias/:id` |
| CRM | `GET/POST/PUT/DELETE /api/prospectos[/:id]`, `PUT /api/prospectos/:id/etapa`, `GET /api/prospectos/:id/auditoria`, `GET /api/crm/resumen`, `GET /api/crm/pacientes/:id` |
| Reportes | `GET /api/reportes/ventas`, `/clinico`, `/inventario` — parámetros `?formato=xlsx\|pdf&mes=YYYY-MM` |
| Configuración | `GET/PUT /api/configuracion` (edición solo superadmin, incluye logo en base64) |

Todas las rutas (excepto `/health` y `/login`) requieren el header:
`Authorization: Bearer <token>` obtenido del login.

## Auditoría del CRM

Cada creación, edición, movimiento de etapa o eliminación de un prospecto queda registrada en la
tabla `auditoria_prospectos` con usuario, fecha y detalle exacto. Esta tabla **solo admite
inserciones** — ninguna ruta la modifica ni la borra, ni siquiera al eliminar el prospecto (el
registro de auditoría permanece aunque el prospecto ya no exista). Consúltala con
`GET /api/prospectos/:id/auditoria`.

## Recordatorios de citas por WhatsApp

Al crear una cita puedes elegir `recordatorio_modo`: `automatico` (se envía apenas se guarda la
cita), `manual` (queda pendiente hasta que alguien presione "Enviar" en la agenda) o `ninguno`.
El "envío" actual guarda el mensaje dentro del propio módulo de Mensajes del ERP — para conectarlo
a un WhatsApp real hace falta contratar la API de WhatsApp Business (Meta) o un proveedor como
Twilio, y reemplazar la función `crearRecordatorio()` en `routes/citas.js`.

## Historial de Auditoría (módulo nuevo)

Página **Auditoría** en el menú lateral, visible solo para el superadmin (regla fija, no
configurable). Registra automáticamente cada acción relevante del sistema: usuarios creados,
editados o eliminados; cambios y reseteos de contraseña; productos creados, editados, eliminados
o con ajuste de stock; prospectos del CRM creados, editados, movidos o eliminados; cambios en la
configuración de la empresa; y otorgamiento o revocación de permisos.

Se puede filtrar por módulo y rango de fechas, y descargar en Excel con el botón correspondiente.
La tabla `auditoria` es **de solo inserción**: ninguna ruta de la API la actualiza ni la borra,
ni siquiera hay un endpoint para hacerlo — es un registro histórico permanente, ni el superadmin
puede alterarlo desde la aplicación.

Endpoints: `GET /api/auditoria` (filtros `?modulo=&desde=&hasta=`), `GET /api/auditoria/excel`
(mismos filtros, descarga `.xlsx`). Ambos exclusivos para superadmin.

## Cambio de contraseña y cierre de sesión

- Cualquier usuario autenticado puede cambiar su propia contraseña desde el menú de su nombre
  (esquina superior derecha) → "Cambiar contraseña". Pide la contraseña actual para confirmarla.
  Endpoint: `PUT /api/auth/cambiar-password`.
- Un usuario con permiso `usuarios_gestionar` puede además **restablecer** la contraseña de otro
  usuario desde el botón de editar en la tabla de Usuarios (campo opcional "Restablecer
  contraseña"), sin necesitar la contraseña anterior.
- El mismo menú tiene "Cerrar sesión", que borra la sesión guardada en el navegador y vuelve a
  mostrar la pantalla de login para que otra persona pueda entrar con su propio usuario.

## Recuperación de contraseña por correo (¿olvidaste tu contraseña?)

En la pantalla de login hay un enlace "¿Olvidaste tu contraseña?". El flujo completo:

1. El usuario escribe su correo → `POST /api/auth/olvide-password`. Por seguridad, la respuesta
   es siempre el mismo mensaje genérico, exista o no ese correo registrado (así nadie puede usar
   este formulario para averiguar qué correos están dados de alta).
2. Si el correo existe, se genera un enlace de un solo uso que vence en 1 hora y se envía por
   correo con el asunto "Restablecer tu contraseña — ÓpticaPro ERP".
3. Al abrir el enlace (`tu-dominio.com/?reset=TOKEN`), la propia página detecta el parámetro y
   muestra directamente el formulario para elegir la nueva contraseña — no hace falta iniciar
   sesión primero.
4. Una vez cambiada, el enlace queda invalidado: no se puede volver a usar.

**Configurar el envío real de correos** (`.env`): agrega `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS` y `SMTP_FROM`. La forma más simple y gratuita es con Gmail:

1. Activa la verificación en 2 pasos en tu cuenta de Gmail.
2. Ve a `myaccount.google.com/apppasswords` y genera una "contraseña de aplicación".
3. Usa esa contraseña de 16 caracteres (no la de tu cuenta normal) en `SMTP_PASS`.

Si no configuras estas variables, el sistema sigue funcionando: el enlace de recuperación queda
impreso en los logs del servidor en vez de enviarse por correo — útil para probar en tu PC, pero
**debes configurarlo en producción** para que la recuperación funcione de verdad para tus usuarios.

Opcional: define `APP_URL` con la URL pública de tu ERP ya desplegado, para que el enlace del
correo apunte siempre ahí (si no la defines, se calcula sola a partir de la petición).

## Front-end incluido

El ERP completo (login real, pacientes, POS/ventas, mensajes/chat, citas con calendario semanal
y recordatorios, inventario, usuarios con matriz de permisos editable en vivo, dashboard, recetas,
pipeline CRM con Kanban y auditoría visible, reportes en Excel/PDF, configuración con logo, e
historial de auditoría general) vive en `public/index.html` y el propio `server.js` lo sirve —
por eso basta con abrir `http://localhost:3001` (o tu URL de producción) sin ningún paso extra.

También queda una copia de referencia en `OpticaPro_ERP_conectado.html` (fuera de la carpeta
`public/`) por si quieres inspeccionar el código por separado — pero la que realmente se usa al
correr el servidor es la de `public/`. Si editas una, recuerda copiar el cambio a la otra.

## Lo que ya está listo para producción

- ✅ El superadmin se crea automáticamente al arrancar, con credenciales configurables por variable de entorno (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) en vez de quedar hardcodeadas.
- ✅ El servidor se niega a arrancar en producción si no defines un `JWT_SECRET` seguro.
- ✅ Cabeceras de seguridad HTTP (`helmet`) y límite de intentos de login (`express-rate-limit`) para dificultar ataques de fuerza bruta.
- ✅ Front-end y backend en un solo servicio (sin problemas de CORS entre dominios distintos).
- ✅ Guía de despliegue paso a paso en [DEPLOY.md](./DEPLOY.md) (Railway y Render).

## Lo que falta para producción

1. **Pagos reales**: integrar un agregador colombiano (Wompi, ePayco o PayU) para Nequi/Daviplata/PSE — hoy el campo `estado_pago` queda en `procesando` esperando confirmación real vía webhook.
2. **Facturación DIAN**: conectar un proveedor autorizado (Alegra, Siigo, Factus) para generar el CUFE real — hoy el campo `estado_dian` es solo un dato guardado, sin envío real.
3. **WhatsApp real**: contratar la API de WhatsApp Business o un proveedor como Twilio para que los recordatorios y mensajes salgan de verdad (ver sección de arriba).
4. **Migrar SQLite → PostgreSQL** si crece a varias sucursales con muchos usuarios concurrentes (ver DEPLOY.md).
5. **Respaldos automáticos** de la base de datos — Railway/Render no hacen backup automático del volumen por defecto; considera un script periódico que copie `db/opticapro.db` a almacenamiento externo (ej. un bucket de S3) si los datos son críticos.
