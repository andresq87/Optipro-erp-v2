const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../db/db');
const { verificarToken, requierePermiso } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

function rangoDelMes(mes) {
  // mes viene como 'YYYY-MM'; si no se envía, usa el mes actual
  const base = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 7);
  return { desde: base + '-01', hasta: base + '-31', etiqueta: base };
}

// ==== VENTAS ====
router.get('/ventas', requierePermiso('reportes_ventas'), async (req, res) => {
  const { formato, mes } = req.query;
  const { desde, hasta, etiqueta } = rangoDelMes(mes);
  const ventas = db.prepare(
    `SELECT v.*, p.nombres, p.apellidos FROM ventas v
     LEFT JOIN pacientes p ON p.id = v.paciente_id
     WHERE date(v.creado_en) BETWEEN ? AND ?
     ORDER BY v.creado_en ASC`
  ).all(desde, hasta);
  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);

  if (formato === 'pdf') {
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-ventas-${etiqueta}.pdf"`);
    doc.pipe(res);
    doc.fontSize(18).text('ÓpticaPro — Reporte de Ventas', { align: 'center' });
    doc.fontSize(11).text(`Periodo: ${etiqueta}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Total de ventas: ${ventas.length}    Monto total: $${totalVentas.toLocaleString('es-CO')}`);
    doc.moveDown();
    ventas.forEach(v => {
      doc.fontSize(10).text(
        `${v.creado_en}  |  Factura ${v.numero_factura}  |  ${v.nombres ? v.nombres + ' ' + v.apellidos : 'Cliente ocasional'}  |  ${v.metodo_pago}  |  $${v.total.toLocaleString('es-CO')}`
      );
    });
    doc.end();
    return;
  }

  if (formato === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ventas ' + etiqueta);
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Factura', key: 'factura', width: 20 },
      { header: 'Cliente', key: 'cliente', width: 25 },
      { header: 'Método de pago', key: 'metodo', width: 15 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'IVA', key: 'iva', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Estado', key: 'estado', width: 14 },
    ];
    ventas.forEach(v => ws.addRow({
      fecha: v.creado_en, factura: v.numero_factura,
      cliente: v.nombres ? v.nombres + ' ' + v.apellidos : 'Cliente ocasional',
      metodo: v.metodo_pago, subtotal: v.subtotal, iva: v.iva, total: v.total, estado: v.estado_pago
    }));
    ws.addRow({});
    ws.addRow({ factura: 'TOTAL', total: totalVentas });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-ventas-${etiqueta}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
    return;
  }

  res.json({ mes: etiqueta, totalVentas, cantidad: ventas.length, ventas });
});

// ==== CLÍNICO (historias clínicas del mes) ====
router.get('/clinico', requierePermiso('reportes_clinico'), async (req, res) => {
  const { formato, mes } = req.query;
  const { desde, hasta, etiqueta } = rangoDelMes(mes);
  const historias = db.prepare(
    `SELECT h.*, p.nombres, p.apellidos, u.nombre AS optometra FROM historias_clinicas h
     JOIN pacientes p ON p.id = h.paciente_id
     LEFT JOIN usuarios u ON u.id = h.optometra_id
     WHERE date(h.fecha) BETWEEN ? AND ?
     ORDER BY h.fecha ASC`
  ).all(desde, hasta);

  if (formato === 'pdf') {
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-clinico-${etiqueta}.pdf"`);
    doc.pipe(res);
    doc.fontSize(18).text('ÓpticaPro — Reporte Clínico', { align: 'center' });
    doc.fontSize(11).text(`Periodo: ${etiqueta}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Historias clínicas registradas: ${historias.length}`);
    doc.moveDown();
    historias.forEach(h => {
      doc.fontSize(10).text(
        `${h.fecha}  |  ${h.nombres} ${h.apellidos}  |  OD: ${h.od_esfera ?? '—'}/${h.od_cilindro ?? '—'}  OI: ${h.oi_esfera ?? '—'}/${h.oi_cilindro ?? '—'}  |  ${h.optometra || '—'}`
      );
    });
    doc.end();
    return;
  }

  if (formato === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clínico ' + etiqueta);
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Paciente', key: 'paciente', width: 25 },
      { header: 'OD Esfera', key: 'ode', width: 10 },
      { header: 'OD Cilindro', key: 'odc', width: 10 },
      { header: 'OI Esfera', key: 'oie', width: 10 },
      { header: 'OI Cilindro', key: 'oic', width: 10 },
      { header: 'Diagnóstico', key: 'diag', width: 20 },
      { header: 'Optómetra', key: 'opt', width: 20 },
    ];
    historias.forEach(h => ws.addRow({
      fecha: h.fecha, paciente: h.nombres + ' ' + h.apellidos,
      ode: h.od_esfera, odc: h.od_cilindro, oie: h.oi_esfera, oic: h.oi_cilindro,
      diag: h.diagnostico, opt: h.optometra
    }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-clinico-${etiqueta}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
    return;
  }

  res.json({ mes: etiqueta, cantidad: historias.length, historias });
});

// ==== INVENTARIO (foto actual del stock) ====
router.get('/inventario', requierePermiso('reportes_inventario'), async (req, res) => {
  const { formato } = req.query;
  const productos = db.prepare(
    `SELECT p.*, c.nombre AS categoria FROM productos p
     LEFT JOIN categorias_producto c ON c.id = p.categoria_id
     WHERE p.activo = 1 ORDER BY c.nombre, p.nombre`
  ).all();
  const valorTotal = productos.reduce((s, p) => s + p.precio * p.stock, 0);
  const hoy = new Date().toISOString().slice(0, 10);

  if (formato === 'pdf') {
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-inventario-${hoy}.pdf"`);
    doc.pipe(res);
    doc.fontSize(18).text('ÓpticaPro — Reporte de Inventario', { align: 'center' });
    doc.fontSize(11).text(`Corte al: ${hoy}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Ítems activos: ${productos.length}    Valor total en stock: $${valorTotal.toLocaleString('es-CO')}`);
    doc.moveDown();
    productos.forEach(p => {
      doc.fontSize(10).text(`${p.nombre}  |  ${p.categoria || '—'}  |  Stock: ${p.stock}  |  Mínimo: ${p.stock_minimo}  |  $${p.precio.toLocaleString('es-CO')}`);
    });
    doc.end();
    return;
  }

  if (formato === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventario ' + hoy);
    ws.columns = [
      { header: 'Producto', key: 'nombre', width: 28 },
      { header: 'Categoría', key: 'categoria', width: 16 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Mínimo', key: 'minimo', width: 10 },
      { header: 'Precio', key: 'precio', width: 14 },
      { header: 'Valor en stock', key: 'valor', width: 16 },
    ];
    productos.forEach(p => ws.addRow({
      nombre: p.nombre, categoria: p.categoria, stock: p.stock,
      minimo: p.stock_minimo, precio: p.precio, valor: p.precio * p.stock
    }));
    ws.addRow({});
    ws.addRow({ nombre: 'VALOR TOTAL', valor: valorTotal });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-inventario-${hoy}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
    return;
  }

  res.json({ corte: hoy, cantidad: productos.length, valorTotal, productos });
});

module.exports = router;
