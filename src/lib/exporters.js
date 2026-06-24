import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import QRCode from 'qrcode';
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
  const qrPayload = [
    `Justificante: ${receiptNumber}`,
    `Beneficiario: ${beneficiary?.full_name || delivery.beneficiary_name || '-'}`,
    `Fecha de entrega: ${formatDate(delivery.delivered_at)}`
  ].join('\n');
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 128 });

  await drawReceiptHeader(doc, receiptNumber, generatedAt, organization);

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Justificante de entrega', 14, 45);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Documento individual para la persona beneficiaria', 14, 51);

  autoTable(doc, {
    startY: 58,
    body: [
      ['Numero de justificante', receiptNumber],
      ['Beneficiario', beneficiary?.full_name || delivery.beneficiary_name || '-'],
      ['Codigo beneficiario', beneficiary?.code || '-'],
      ['DNI/NIE / NIE O PASAPORTE beneficiario', beneficiary?.document_id || '-'],
      ['Direccion', beneficiary?.address_full || '-'],
      ['Familia', delivery.family_name || '-'],
      ['Fecha y hora de entrega', formatDateTime(delivery.reception_at || delivery.delivered_at)],
      ['Fecha y hora de recepcion', formatDateTime(delivery.reception_at)],
      ['Responsable', delivery.responsible || '-'],
      ['Tipo de ayuda', delivery.help_type || '-'],
      ['Nombre del receptor', delivery.receiver_name || '-'],
      ['DNI/NIE / NIE O PASAPORTE del receptor', delivery.receiver_document_id || '-'],
      ['Observaciones', delivery.notes || '-']
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold' } }
  });

  const qrY = 62;
  doc.addImage(qrDataUrl, 'PNG', 160, qrY, 34, 34);
  doc.setFontSize(7);
  doc.text('QR de verificacion', 162, qrY + 39);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Producto o ayuda entregada', 'Tipo de ayuda', 'Cantidad']],
    body: productRows,
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 9 }
  });

  const declarationY = doc.lastAutoTable.finalY + 12;
  doc.setFillColor(244, 251, 247);
  doc.roundedRect(14, declarationY, 182, 14, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 27);
  doc.text('Declaro haber recibido la ayuda descrita en este documento.', 18, declarationY + 9);

  const signatureY = declarationY + 27;
  doc.setFontSize(12);
  doc.text('Firma del receptor', 14, signatureY);
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

  drawStamp(doc, 156, signatureY + 52);
  drawReceiptFooter(doc, organization);

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

async function drawReceiptHeader(doc, receiptNumber, generatedAt, organization = {}) {
  doc.setFillColor(36, 126, 80);
  doc.rect(0, 0, 210, 36, 'F');
  await addOfficialLogo(doc, 12, 7, 24, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(organization.name || 'Pan y Esperanza', 38, 15);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Justificante profesional de entrega de ayuda', 38, 24);
  doc.setFontSize(9);
  doc.text(receiptNumber, 148, 14);
  doc.text(`Generado: ${formatDateTime(generatedAt.toISOString())}`, 148, 22);
  doc.setFontSize(7);
  doc.text([organization.cif || 'CIF G00000000', organization.address, organization.phone, organization.email || 'info@panyesperanza.org'].filter(Boolean).join(' · '), 38, 31);
  doc.setTextColor(23, 33, 27);
}

function drawStamp(doc, x, y) {
  doc.setDrawColor(36, 126, 80);
  doc.setTextColor(36, 126, 80);
  doc.circle(x, y, 18);
  doc.circle(x, y, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('PAN Y', x, y - 3, { align: 'center' });
  doc.text('ESPERANZA', x, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('ENTREGA REGISTRADA', x, y + 12, { align: 'center' });
  doc.setTextColor(23, 33, 27);
}

function getReceiptProductRows(delivery) {
  if (Array.isArray(delivery.items) && delivery.items.length) {
    return delivery.items.map((item) => [
      item.name || item.inventory_item_name || item.product || '-',
      item.help_type || delivery.help_type || '-',
      item.quantity || '-'
    ]);
  }

  return [[
    delivery.inventory_item_name || delivery.product || delivery.help_type || 'Ayuda entregada',
    delivery.help_type || '-',
    delivery.quantity || '-'
  ]];
}

function drawReceiptFooter(doc, organization = {}) {
  const y = 286;
  const footer = [
    organization.name || 'Pan y Esperanza',
    organization.cif,
    organization.address,
    organization.phone,
    organization.email || 'info@panyesperanza.org'
  ].filter(Boolean).join(' · ');
  doc.setDrawColor(219, 229, 220);
  doc.line(14, y - 6, 196, y - 6);
  doc.setFontSize(7);
  doc.setTextColor(96, 112, 100);
  doc.text(footer, 105, y, { align: 'center', maxWidth: 180 });
  doc.setTextColor(23, 33, 27);
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
  const productTotals = groupTotals(deliveries, 'inventory_item_name');
  const responsibleTotals = groupTotals(deliveries, 'responsible');

  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.text('Informe de entregas - Pan y Esperanza', 52, 20);
  autoTable(doc, {
    startY: 34,
    head: [['Indicador', 'Valor']],
    body: [
      ['Numero de entregas', deliveries.length],
      ['Beneficiarios atendidos', beneficiaries.size],
      ['Productos distintos', Object.keys(productTotals).length],
      ['Responsables distintos', Object.keys(responsibleTotals).length]
    ],
    headStyles: { fillColor: [36, 126, 80] }
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Producto', 'Cantidad total']],
    body: Object.entries(productTotals),
    headStyles: { fillColor: [36, 126, 80] }
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Responsable', 'Entregas']],
    body: Object.entries(responsibleTotals),
    headStyles: { fillColor: [36, 126, 80] }
  });
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
