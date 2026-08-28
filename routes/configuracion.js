const express = require('express');
const db = require('../db/db');
const { verificarToken, requierePermiso } = require('../middleware/auth');
const { registrarAuditoria } = require('../db/auditoria');

const router = express.Router();
router.use(verificarToken);

function asegurarFila() {
  const existe = db.prepare('SELECT id FROM configuracion WHERE id = 1').get();
  if (!existe) {
    db.prepare(
      `INSERT INTO configuracion (id, nombre_comercial, nit, telefono, whatsapp, direccion, correo, sitio_web)
       VALUES (1, 'Óptica Premium S.A.S.', '901.234.567-8', '+57 (1) 234 5678', '+57 300 521 4487', 'Cra. 15 #93-47, Bogotá, Colombia', 'info@opticapremium.co', 'www.opticapremium.co')`
    ).run();
  }
}

// GET /api/configuracion — cualquier usuario autenticado puede leerla (para mostrar el logo, etc.)
router.get('/', (req, res) => {
  asegurarFila();
  const config = db.prepare('SELECT * FROM configuracion WHERE id = 1').get();
  res.json(config);
});

// PUT /api/configuracion — solo superadmin
// body: { nombre_comercial, nit, telefono, whatsapp, direccion, correo, sitio_web, logo_base64 }
router.put('/', requierePermiso('configuracion_editar'), (req, res) => {
  asegurarFila();
  const nombre_comercial = req.body.nombre_comercial ?? null;
  const nit = req.body.nit ?? null;
  const telefono = req.body.telefono ?? null;
  const whatsapp = req.body.whatsapp ?? null;
  const direccion = req.body.direccion ?? null;
  const correo = req.body.correo ?? null;
  const sitio_web = req.body.sitio_web ?? null;
  const logo_base64 = req.body.logo_base64 ?? null;
  db.prepare(
    `UPDATE configuracion SET
       nombre_comercial = COALESCE(?, nombre_comercial),
       nit = COALESCE(?, nit),
       telefono = COALESCE(?, telefono),
       whatsapp = COALESCE(?, whatsapp),
       direccion = COALESCE(?, direccion),
       correo = COALESCE(?, correo),
       sitio_web = COALESCE(?, sitio_web),
       logo_base64 = COALESCE(?, logo_base64)
     WHERE id = 1`
  ).run(nombre_comercial, nit, telefono, whatsapp, direccion, correo, sitio_web, logo_base64);
  registrarAuditoria('configuracion', 1, req.usuario, 'editado', 'Datos de la empresa actualizados' + (logo_base64 ? ' (incluye logo nuevo)' : ''));
  const config = db.prepare('SELECT * FROM configuracion WHERE id = 1').get();
  res.json(config);
});

module.exports = router;
