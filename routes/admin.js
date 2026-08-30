const express = require('express');
const db = require('../db/db');
const { verificarToken, soloRoles } = require('../middleware/auth');
const { registrarAuditoria } = require('../db/auditoria');

const router = express.Router();
router.use(verificarToken);

// POST /api/admin/restablecer — borra TODA la información operativa (pacientes, ventas,
// inventario, mensajes, prospectos, citas, historias clínicas) y elimina los usuarios que
// no sean superadmin, dejando el sistema listo para empezar a usarse con datos reales.
// NO toca: configuración de la empresa, matriz de permisos, ni las cuentas superadmin.
// Regla fija en el código (no editable desde la matriz): SOLO superadmin puede hacerlo,
// y requiere escribir la frase exacta de confirmación para evitar un borrado accidental.
router.post('/restablecer', soloRoles('superadmin'), (req, res) => {
  const FRASE = 'BORRAR TODO';
  if (req.body.confirmacion !== FRASE) {
    return res.status(400).json({ error: `Debes enviar la confirmación exacta: "${FRASE}"` });
  }
  try {
    db.exec('BEGIN');
    db.exec('DELETE FROM venta_items');
    db.exec('DELETE FROM ventas');
    db.exec('DELETE FROM historias_clinicas');
    db.exec('DELETE FROM citas');
    db.exec('DELETE FROM pacientes');
    db.exec('DELETE FROM productos');
    db.exec('DELETE FROM categorias_producto');
    db.exec('DELETE FROM mensajes');
    db.exec('DELETE FROM auditoria_prospectos');
    db.exec('DELETE FROM prospectos');
    db.prepare("DELETE FROM usuarios WHERE rol != 'superadmin'").run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo restablecer el sistema: ' + e.message });
  }
  registrarAuditoria('sistema', null, req.usuario, 'restablecimiento_total',
    'Se restableció el sistema a estado inicial: se eliminaron pacientes, productos, ventas, mensajes, prospectos, citas, historias clínicas y usuarios no-superadmin');
  res.json({ restablecido: true });
});

module.exports = router;
