import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';
import { formatDate, formatDateTime, nextReceiptNumber } from './formatters';

export function exportExcel(filename, sheets) {
  const book = XLSX.utils.book_new();
  sheets.forEach((sheet) => XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sheet.rows), sheet.name));
  XLSX.writeFile(book, `${filename}.xlsx`);
}

export async function printBeneficiaryPdf(beneficiary, deliveries) {
  const doc = new jsPDF();
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(17);
  doc.text('Ficha de beneficiario - Pan y Esperanza', 52, 20);
  doc.setFontSize(11);
  const fields = [
    ['Codigo', beneficiary.code],
    ['Nombre', beneficiary.full_name],
    ['DNI/NIE / NIE O PASAPORTE', beneficiary.document_id || '-'],
    ['Direccion completa', beneficiary.address_full || '-'],
    ['Codigo postal', beneficiary.postal_code || '-'],
    ['Telefono', beneficiary.phone || '-'],
    ['Unidad familiar', `${beneficiary.family_members || 0} miembros, ${beneficiary.minors_count || 0} menores`],
    ['Situacion', beneficiary.situation],
    ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo'],
    ['Ayuda solicitada', beneficiary.requested_help || '-'],
    ['Fecha alta', formatDate(beneficiary.joined_at)],
    ['Ultima ayuda', formatDate(beneficiary.last_help_at)],
    ['Observaciones', beneficiary.notes || '-']
  ];
  autoTable(doc, { startY: 34, body: fields, styles: { fontSize: 9 }, columnStyles: { 0: { fontStyle: 'bold' } } });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Fecha', 'Tipo', 'Cantidad', 'Responsable', 'Firma', 'Observaciones']],
    body: deliveries.map((item) => [formatDate(item.delivered_at), item.help_type, item.quantity || '-', item.responsible || '-', item.signature_data_url ? 'Disponible' : 'No', item.notes || '-']),
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 8 }
  });
  doc.save(`Ficha-${beneficiary.code}.pdf`);
}

export async function printDeliveryReceiptPdf(delivery, beneficiary, deliveries = []) {
  const { doc, receiptNumber } = await createDeliveryReceiptPdf(delivery, beneficiary, deliveries);
  doc.save(`Justificante-${receiptNumber}.pdf`);
}

export async function createDeliveryReceiptPdf(delivery, beneficiary, deliveries = [], organization = {}) {
  const doc = new jsPDF();
  const receiptNumber = delivery.receipt_number || nextReceiptNumber(deliveries, delivery.delivered_at);
  const generatedAt = new Date();
  const productRows = getReceiptProductRows(delivery);

  await drawReceiptHeaderClean(doc, receiptNumber, generatedAt, organization);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('JUSTIFICANTE DE ENTREGA DE AYUDA SOCIAL', 14, 46);

  drawPdfSectionTitle(doc, 'DATOS DEL BENEFICIARIO', 58);
  autoTable(doc, {
    startY: 63,
    body: [
      ['Beneficiario', beneficiary?.full_name || delivery.beneficiary_name || '-'],
      ['Codigo beneficiario', beneficiary?.code || '-'],
      ['Documento identificativo', beneficiary?.document_id || '-']
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } }
  });

  drawPdfSectionTitle(doc, 'DATOS DE LA ENTREGA', doc.lastAutoTable.finalY + 10);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 15,
    body: [
      ['Fecha y hora de entrega', formatDateTime(delivery.reception_at || delivery.delivered_at)],
      ['Responsable', delivery.responsible || '-'],
      ['Tipo de ayuda', delivery.help_type || '-'],
      ['Observaciones', delivery.notes || '-']
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } }
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Producto entregado', 'Cantidad']],
    body: productRows,
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 9 }
  });

  const signatureY = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(12);
  doc.text('Firma del beneficiario', 14, signatureY);
  doc.text('Firma del responsable', 112, signatureY);
  doc.setDrawColor(180, 190, 185);
  doc.roundedRect(14, signatureY + 4, 80, 36, 2, 2);
  doc.roundedRect(112, signatureY + 4, 80, 36, 2, 2);
  if (delivery.signature_data_url) {
    doc.addImage(delivery.signature_data_url, 'PNG', 14, signatureY + 5, 80, 32);
  } else {
    doc.setFontSize(10);
    doc.text('Sin firma registrada', 14, signatureY + 12);
  }
  if (delivery.responsible_signature_data_url) {
    doc.addImage(delivery.responsible_signature_data_url, 'PNG', 112, signatureY + 5, 80, 32);
  }

  drawReceiptLegalFooter(doc);

  return { doc, receiptNumber };
}

export async function downloadReceiptsZip(filename, receiptEntries, allDeliveries = []) {
  const blob = await createReceiptsZipBlob(receiptEntries, allDeliveries);
  downloadBlob(blob, `${filename}.zip`);
}

export async function createReceiptsZipBlob(receiptEntries, allDeliveries = []) {
  const zip = new JSZip();
  const deliveries = receiptEntries.map((entry) => entry.delivery);
  for (const entry of receiptEntries) {
    const { doc, receiptNumber } = await createDeliveryReceiptPdf(entry.delivery, entry.beneficiary, allDeliveries);
    zip.file(`Justificante-${receiptNumber}.pdf`, doc.output('blob'));
  }
  const summaryDoc = await createDeliveriesSummaryDocument(deliveries);
  zip.file('Resumen-entregas.pdf', summaryDoc.output('blob'));
  return zip.generateAsync({ type: 'blob' });
}

export async function createReceiptEmailAttachments(receiptEntries, allDeliveries = [], options = {}) {
  const attachments = [];
  for (const entry of receiptEntries) {
    const { doc, receiptNumber } = await createDeliveryReceiptPdf(entry.delivery, entry.beneficiary, allDeliveries, options.organization || {});
    const blob = doc.output('blob');
    attachments.push({
      filename: `Justificante-${receiptNumber}.pdf`,
      blob,
      size: blob.size,
      contentType: 'application/pdf'
    });
  }
  if (options.includeSummary) {
    const summaryDoc = await createDeliveriesSummaryDocument(receiptEntries.map((entry) => entry.delivery));
    const summaryBlob = summaryDoc.output('blob');
    attachments.push({
      filename: 'Resumen-entregas.pdf',
      blob: summaryBlob,
      size: summaryBlob.size,
      contentType: 'application/pdf'
    });
  }
  return attachments;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function drawReceiptHeaderClean(doc, receiptNumber, generatedAt, organization = {}) {
  await addOfficialLogo(doc, 14, 10, 28, 22);
  doc.setTextColor(23, 33, 27);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(organization.name || 'Pan y Esperanza', 48, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('CIF: EN TRÁMITE', 48, 22);
  doc.text('info@panyesperanza.org', 48, 27);
  doc.text('www.panyesperanza.org', 48, 32);
  doc.setFontSize(9);
  doc.text(`Nº Justificante: ${receiptNumber}`, 142, 18);
  doc.text(`Fecha de emisión: ${formatDateTime(generatedAt.toISOString())}`, 142, 25);
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 38, 196, 38);
}

function drawPdfSectionTitle(doc, title, y) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(36, 126, 80);
  doc.text(title, 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(23, 33, 27);
}

function drawReceiptLegalFooter(doc) {
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 272, 196, 272);
  doc.setFontSize(8);
  doc.setTextColor(96, 112, 100);
  doc.text('Este documento acredita la entrega de ayuda social realizada por Pan y Esperanza.', 14, 279);
  doc.text('Documento generado electrónicamente por el Sistema de Gestión Pan y Esperanza.', 14, 285);
  doc.setTextColor(23, 33, 27);
}

function getReceiptProductRows(delivery) {
  if (Array.isArray(delivery.items) && delivery.items.length) {
    return delivery.items.map((item) => [
      item.name || item.inventory_item_name || item.product || '-',
      item.quantity || '-'
    ]);
  }

  return [[
    delivery.inventory_item_name || delivery.product || delivery.help_type || 'Ayuda entregada',
    delivery.quantity || '-'
  ]];
}

export async function exportReportPdf(data) {
  const doc = new jsPDF();
  const treasuryIncome = (data.treasury_incomes || []).reduce((total, item) => total + Number(item.amount || 0), 0);
  const treasuryExpenses = (data.treasury_expenses || []).reduce((total, item) => total + Number(item.amount || 0), 0);
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.text('Informe Pan y Esperanza', 52, 20);
  autoTable(doc, {
    startY: 34,
    head: [['Indicador', 'Valor']],
    body: [
      ['Beneficiarios activos', data.beneficiaries.filter((item) => item.is_active).length],
      ['Familias', data.families?.length || 0],
      ['Entregas registradas', data.deliveries.length],
      ['Productos inventario', data.inventory_items.length],
      ['Donaciones', data.donations?.length || 0],
      ['Ingresos tesoreria', formatMoney(treasuryIncome)],
      ['Gastos tesoreria', formatMoney(treasuryExpenses)],
      ['Saldo tesoreria', formatMoney(treasuryIncome - treasuryExpenses)],
      ['Voluntarios', data.volunteers.length]
    ],
    headStyles: { fillColor: [36, 126, 80] }
  });
  doc.save('Informe-Pan-y-Esperanza.pdf');
}

export async function printDonationCertificatePdf(donation, organization = {}) {
  const doc = new jsPDF();
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.text('Certificado de donacion', 52, 20);
  autoTable(doc, {
    startY: 36,
    body: [
      ['Entidad', organization.name || 'Pan y Esperanza'],
      ['CIF', organization.cif || '-'],
      ['Direccion', organization.address || '-'],
      ['Donante', donation.donor || '-'],
      ['Tipo donante', donation.donor_kind || '-'],
      ['Tipo donacion', donation.donation_type || '-'],
      ['Fecha', formatDate(donation.donated_at)],
      ['Valor estimado', `${donation.estimated_value || 0} EUR`],
      ['Observaciones', donation.notes || '-']
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold' } }
  });
  doc.save(`Certificado-donacion-${donation.donor || donation.id}.pdf`);
}

export async function exportTreasuryPdf(data, indicators) {
  const doc = new jsPDF();
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.text('Informe de tesoreria - Pan y Esperanza', 52, 20);
  autoTable(doc, {
    startY: 34,
    head: [['Indicador', 'Importe']],
    body: [
      ['Saldo actual', formatMoney(indicators.currentBalance)],
      ['Total ingresos', formatMoney(indicators.totalIncome)],
      ['Total gastos', formatMoney(indicators.totalExpenses)],
      ['Pendiente de devolver', formatMoney(indicators.pendingLoans)],
      ['Balance mensual', formatMoney(indicators.monthlyBalance)]
    ],
    headStyles: { fillColor: [36, 126, 80] }
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Fecha', 'Concepto', 'Importe', 'Donante', 'Forma de pago']],
    body: (data.treasury_incomes || []).map((item) => [formatDate(item.income_at), item.concept, formatMoney(item.amount), item.donor || '-', item.payment_method || '-']),
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 8 }
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Fecha', 'Concepto', 'Importe', 'Proveedor', 'Responsable']],
    body: (data.treasury_expenses || []).map((item) => [formatDate(item.expense_at), item.concept, formatMoney(item.amount), item.supplier || '-', item.responsible || '-']),
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 8 }
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Persona', 'Fecha', 'Concepto', 'Importe', 'Estado', 'Devolucion']],
    body: (data.treasury_loans || []).map((item) => [item.person, formatDate(item.loan_at), item.concept, formatMoney(item.amount), item.status, formatDate(item.returned_at)]),
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 8 }
  });
  doc.save('Informe-tesoreria-Pan-y-Esperanza.pdf');
}

export function exportTreasuryExcel(data, indicators) {
  exportExcel('Tesoreria-Pan-y-Esperanza', [
    {
      name: 'Indicadores',
      rows: [
        { Indicador: 'Saldo actual', Importe: indicators.currentBalance },
        { Indicador: 'Total ingresos', Importe: indicators.totalIncome },
        { Indicador: 'Total gastos', Importe: indicators.totalExpenses },
        { Indicador: 'Pendiente de devolver', Importe: indicators.pendingLoans },
        { Indicador: 'Balance mensual', Importe: indicators.monthlyBalance }
      ]
    },
    { name: 'Ingresos', rows: data.treasury_incomes || [] },
    { name: 'Gastos', rows: data.treasury_expenses || [] },
    { name: 'Prestamos', rows: data.treasury_loans || [] },
    { name: 'Caja y bancos', rows: data.treasury_accounts || [] }
  ]);
}

export function exportDeliveriesSummaryPdf(deliveries) {
  createDeliveriesSummaryDocument(deliveries).then((doc) => doc.save('Informe-entregas-Pan-y-Esperanza.pdf'));
}

async function createDeliveriesSummaryDocument(deliveries) {
  const doc = new jsPDF();
  const beneficiaries = new Set(deliveries.map((item) => item.beneficiary_id).filter(Boolean));
  const totalProducts = deliveries.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const responsibles = new Set(deliveries.map((item) => item.responsible).filter(Boolean));
  const period = getDeliveriesPeriod(deliveries);

  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME OFICIAL DE ENTREGAS', 52, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Periodo consultado: ${period}`, 52, 25);
  doc.text(`Fecha de emisión: ${formatDateTime(new Date().toISOString())}`, 52, 31);
  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Hora', 'Beneficiario', 'Responsable', 'Producto', 'Cantidad', 'Tipo de ayuda']],
    body: deliveries.map((delivery) => [
      formatDate(delivery.delivered_at),
      formatTime(delivery.reception_at || delivery.delivered_at),
      delivery.beneficiary_name || '-',
      delivery.responsible || '-',
      delivery.inventory_item_name || delivery.product || '-',
      delivery.quantity || '-',
      delivery.help_type || '-'
    ]),
    headStyles: { fillColor: [36, 126, 80] }
  });
  const totalsY = Math.min((doc.lastAutoTable?.finalY || 34) + 12, 265);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DEL PERIODO', 14, totalsY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Beneficiarios atendidos: ${beneficiaries.size}`, 14, totalsY + 8);
  doc.text(`Entregas realizadas: ${deliveries.length}`, 14, totalsY + 16);
  doc.text(`Productos entregados: ${totalProducts}`, 14, totalsY + 24);
  doc.text(`Responsables participantes: ${responsibles.size}`, 14, totalsY + 32);
  drawDeliveriesReportFooter(doc);
  return doc;
}

let cachedLogo;

async function getOfficialLogo() {
  if (cachedLogo) return cachedLogo;
  cachedLogo = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };
    image.onerror = reject;
    image.src = officialLogoUrl;
  });
  return cachedLogo;
}

function getDeliveriesPeriod(deliveries) {
  const dates = deliveries.map((item) => item.delivered_at).filter(Boolean).sort();
  if (!dates.length) return 'Sin entregas seleccionadas';
  return `${formatDate(dates[0])} - ${formatDate(dates[dates.length - 1])}`;
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function drawDeliveriesReportFooter(doc) {
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 272, 196, 272);
  doc.setFontSize(8);
  doc.setTextColor(96, 112, 100);
  doc.text('Informe interno de gestión y seguimiento.', 14, 278);
  doc.text('Pan y Esperanza', 14, 283);
  doc.text('info@panyesperanza.org · www.panyesperanza.org', 14, 288);
  doc.setTextColor(23, 33, 27);
}

async function addOfficialLogo(doc, x, y, maxWidth, maxHeight) {
  const logo = await getOfficialLogo();
  const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = logo.width * ratio;
  const height = logo.height * ratio;
  doc.addImage(logo.dataUrl, 'PNG', x, y, width, height);
}

function groupTotals(deliveries, field) {
  return deliveries.reduce((acc, delivery) => {
    const key = delivery[field] || 'Sin especificar';
    const value = field === 'inventory_item_name' ? Number(delivery.quantity || 0) : 1;
    acc[key] = (acc[key] || 0) + value;
    return acc;
  }, {});
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}
