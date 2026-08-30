require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { sembrarEsencial } = require('./seed');

// ==== Verificaciones de seguridad antes de arrancar en producción ====
const esProduccion = process.env.NODE_ENV === 'production';
if (esProduccion && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'cambia-esto-en-produccion')) {
  console.error('❌ ERROR: Debes definir la variable de entorno JWT_SECRET en producción.');
  console.error('   Genera una clave larga y aleatoria, por ejemplo con: openssl rand -base64 48');
  process.exit(1);
}

// Crea el superadmin (si no existe ninguno), las categorías base y la matriz de permisos
// por defecto. Es seguro que esto corra en cada arranque: nunca duplica ni sobreescribe datos.
sembrarEsencial();

const authRoutes = require('./routes/auth');
const pacientesRoutes = require('./routes/pacientes');
const productosRoutes = require('./routes/productos');
const ventasRoutes = require('./routes/ventas');
const mensajesRoutes = require('./routes/mensajes');
const citasRoutes = require('./routes/citas');
const historiasRoutes = require('./routes/historias');
const crmRoutes = require('./routes/crm');
const prospectosRoutes = require('./routes/prospectos');
const reportesRoutes = require('./routes/reportes');
const configuracionRoutes = require('./routes/configuracion');
const permisosRoutes = require('./routes/permisos');
const auditoriaRoutes = require('./routes/auditoria');
const adminRoutes = require('./routes/admin');

const app = express();

// Detrás de un proxy (Railway, Render, etc.) para que express-rate-limit identifique
// correctamente la IP real de cada visitante en vez de la IP del proxy.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // el front-end es un solo HTML con estilos/scripts inline
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || true, // restringe a tu dominio en producción (ver .env.example)
}));
app.use(express.json({ limit: '5mb' })); // 5mb por el logo en base64 de Configuración

// Límite de intentos de login: 20 intentos cada 15 minutos por IP, para dificultar fuerza bruta.
const limitadorLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', limitadorLogin);
app.use('/api/auth/cambiar-password', limitadorLogin);

app.get('/api/health', (req, res) => res.json({ status: 'ok', servicio: 'ÓpticaPro ERP API' }));

app.use('/api/auth', authRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/mensajes', mensajesRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/historias', historiasRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/prospectos', prospectosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/permisos', permisosRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/admin', adminRoutes);

// Sirve el front-end (public/index.html) desde el mismo servidor: así solo necesitas
// desplegar UN servicio, sin preocuparte por CORS entre dos dominios distintos.
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next(); // deja pasar rutas de API no encontradas -> 404 normal
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ÓpticaPro API + front-end corriendo en http://localhost:${PORT}`);
  if (!esProduccion) console.log('(NODE_ENV no está en "production" — modo desarrollo)');
});
