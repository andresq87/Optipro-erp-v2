require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ÓpticaPro API corriendo en http://localhost:${PORT}`));
