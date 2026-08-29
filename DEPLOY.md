# Cómo poner ÓpticaPro ERP en internet

Esta guía asume que ya tienes el proyecto funcionando en tu computador (backend + `node
server.js`). Ahora vamos a subirlo a una plataforma gratuita para que sea accesible desde
cualquier lugar con una URL pública.

Recomendamos **Railway** o **Render** — ambas tienen plan gratuito, soportan Node.js sin
configuración especial, y permiten un "disco persistente" para que la base de datos SQLite no se
borre cada vez que se reinicia el servidor (esto es importante: sin disco persistente, perderías
todos tus datos en cada despliegue).

## Antes de empezar: sube el proyecto a GitHub

Ambas plataformas se conectan a un repositorio de GitHub. Si no sabes usar Git:

1. Crea una cuenta en [github.com](https://github.com) si no tienes.
2. Crea un repositorio nuevo (botón verde "New").
3. Sube la carpeta `opticapro-backend` completa usando la opción "uploading an existing file" en
   la página del repositorio (arrastra los archivos, **excepto** la carpeta `node_modules` y el
   archivo `.env` si ya lo creaste — el `.gitignore` ya los excluye si usas Git desde la terminal).

## Opción A — Railway (recomendada, la más simple)

1. Entra a [railway.app](https://railway.app) y crea una cuenta (puedes usar tu cuenta de GitHub).
2. Clic en "New Project" → "Deploy from GitHub repo" → selecciona tu repositorio.
3. Railway detecta que es un proyecto Node.js automáticamente y lo despliega.
4. Ve a la pestaña **Variables** del servicio y agrega:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = (genera una clave larga y aleatoria — puedes usar [este generador](https://generate-secret.vercel.app/64) o pedirle a Claude que te genere una)
   - `ADMIN_EMAIL` = tu correo real de administrador
   - `ADMIN_PASSWORD` = una contraseña fuerte que tú elijas
5. Ve a la pestaña **Settings** → **Volumes** → agrega un volumen montado en la ruta `/app/db`
   (así la base de datos sobrevive a cada despliegue nuevo).
6. Railway te da una URL pública automáticamente (algo como `tuproyecto.up.railway.app`) en la
   pestaña **Settings** → **Networking** → "Generate Domain".
7. Abre esa URL — ya deberías ver la pantalla de login del ERP, con el usuario que definiste en
   `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Opción B — Render

1. Entra a [render.com](https://render.com) y crea una cuenta.
2. Clic en "New" → "Web Service" → conecta tu repositorio de GitHub.
3. Configuración:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. En la pestaña **Environment**, agrega las mismas variables que en Railway (arriba).
5. En la pestaña **Disks**, agrega un disco persistente montado en `/opt/render/project/src/db`
   (ajusta la ruta según lo que Render te indique como la carpeta de tu proyecto).
6. Render te da una URL pública tipo `tuproyecto.onrender.com`.

**Nota sobre el plan gratuito de Render**: el servicio "se duerme" tras 15 minutos sin uso, y
tarda unos 30-50 segundos en despertar la primera vez que alguien lo visita después de estar
inactivo. Railway no tiene esta limitación en su plan gratuito (pero sí un límite de horas al
mes). Para un negocio real en producción constante, vale la pena evaluar el plan pagado de
cualquiera de las dos (son económicos, unos pocos dólares al mes).

## Después de desplegar, en cualquiera de las dos opciones

1. Entra con el correo y contraseña que definiste en `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
2. Ve a **Usuarios y Roles** y crea las cuentas reales de tu equipo (optómetras, vendedores,
   etc.) — **no** uses los usuarios de ejemplo (`c.ramos@opticapro.co`, etc.), esos son solo para
   pruebas locales y nunca se crean automáticamente en producción.
3. Ve a **Configuración** y actualiza los datos reales de tu óptica (nombre, NIT, teléfono, logo).
4. Empieza a cargar tu inventario real desde el módulo de Inventario.

## Diferencias entre correr localmente y en producción

| | Local (tu PC) | Producción (Railway/Render) |
|---|---|---|
| Comando para iniciar | `node server.js` | Automático, la plataforma lo hace |
| Base de datos | Se borra si borras `db/opticapro.db` | Persiste gracias al volumen/disco configurado |
| Usuario inicial | `admin@opticapro.co` / `Admin1234` (o los que pongas en `.env`) | Los que definas en las variables de entorno `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| Datos de ejemplo | Solo si corres `node seed.js` manualmente | Nunca se crean automáticamente |
| HTTPS | No (http://localhost) | Sí, automático (ambas plataformas lo dan gratis) |

## Cuándo migrar de SQLite a PostgreSQL

SQLite (lo que usa este proyecto) funciona bien para una sola óptica con un puñado de usuarios
usando el sistema al mismo tiempo. Si tu negocio crece a varias sucursales con muchos usuarios
concurrentes, considera migrar a PostgreSQL (Railway y Render también lo ofrecen como servicio
adicional gratuito/económico) — es un cambio que se puede hacer más adelante sin rediseñar el
resto del sistema, ya que las consultas SQL son casi idénticas entre ambos motores.
