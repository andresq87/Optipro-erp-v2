const nodemailer = require('nodemailer');

// Configura el envío de correos vía SMTP (variables de entorno SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS, SMTP_FROM). Si no están definidas, el correo NO se envía de verdad
// pero el enlace queda impreso en los logs del servidor — útil para desarrollo local sin
// tener que configurar un proveedor de correo real.
let transportador = null;
function obtenerTransportador() {
  if (transportador) return transportador;
  if (!process.env.SMTP_HOST) return null;
  transportador = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transportador;
}

async function enviarCorreo(destinatario, asunto, html) {
  const t = obtenerTransportador();
  if (!t) {
    console.log('⚠️  SMTP no configurado — no se envió correo real. Contenido:');
    console.log(`Para: ${destinatario} | Asunto: ${asunto}\n${html}`);
    return { enviado: false, motivo: 'SMTP no configurado' };
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: asunto,
    html,
  });
  return { enviado: true };
}

module.exports = { enviarCorreo };
