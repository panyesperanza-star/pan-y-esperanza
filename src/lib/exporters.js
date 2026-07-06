import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';
import { resolveBeneficiaryPhotoUrl } from './beneficiaryPhotos';
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
  doc.text('Resumen del expediente - Pan y Esperanza', 52, 20);
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
  doc.save(`Resumen-expediente-${beneficiary.code}.pdf`);
}

export async function printSocialAttentionReportPdf({
  beneficiary,
  family = null,
  familyMembers = [],
  deliveries = [],
  history = [],
  organization = {},
  currentUser = null
}) {
  const doc = new jsPDF();
  const orgName = organization.name || 'Asociación Pan y Esperanza';
  const generatedAt = new Date().toISOString();
  const activeDeliveries = (deliveries || []).filter((item) => item.status !== 'Anulada');
  const timeline = buildSocialAttentionTimeline(activeDeliveries, history);
  const familyStats = getFamilyStats(beneficiary, familyMembers);
  const latestAttention = getLatestSocialAttention(timeline);
  const responsible = reportResponsible(currentUser);
  const photo = await getBeneficiaryReportPhoto(beneficiary);

  await drawSocialAttentionCover(doc, { orgName, beneficiary, generatedAt, photo });
  let y = 102;

  y = drawProfessionalSectionTitle(doc, '1', 'IDENTIFICACIÓN', y);
  y = drawIdentificationCards(doc, beneficiary, family, familyStats, y);

  y = drawProfessionalSectionTitle(doc, '2', 'CONTEXTO FAMILIAR', y + 6);
  y = drawNarrativeCard(doc, buildFamilyContextText(beneficiary, family, familyMembers, familyStats), y, { accent: true });

  y = drawProfessionalSectionTitle(doc, '3', 'MOTIVO DE LA ATENCIÓN', y + 6);
  const attentionReason = buildAttentionReasonText(beneficiary, history);
  y = attentionReason
    ? drawNarrativeBlock(doc, attentionReason, y)
    : drawManualCompletionBlock(doc, y, 30, 'Espacio reservado para completar el motivo de la atención cuando la información disponible sea insuficiente.');

  y = drawProfessionalSectionTitle(doc, '4', 'HISTORIAL DE INTERVENCIÓN', y + 7);
  y = drawInterventionTimelineTable(doc, timeline, y);

  y = drawProfessionalSectionTitle(doc, '5', 'RESUMEN DE LA INTERVENCIÓN', y + 8);
  y = drawNarrativeBlock(doc, buildSocialInterventionSummary(beneficiary, timeline), y);

  y = drawProfessionalSectionTitle(doc, '6', 'SITUACIÓN ACTUAL', y + 7);
  y = drawCurrentSituationCards(doc, beneficiary, timeline, latestAttention, y);

  y = drawProfessionalSectionTitle(doc, '7', 'VALORACIÓN DE LA ENTIDAD', y + 7);
  y = drawNarrativeCard(doc, buildEntityAssessmentText(beneficiary, timeline), y, { accent: true });

  y = drawProfessionalSectionTitle(doc, '8', 'OBSERVACIONES', y + 7);
  y = beneficiary.notes
    ? drawNarrativeBlock(doc, beneficiary.notes, y, { minHeight: 34 })
    : drawManualCompletionBlock(doc, y, 34, 'Espacio reservado para observaciones complementarias.');

  y = drawProfessionalSectionTitle(doc, '9', 'CONCLUSIÓN', y + 7);
  y = drawNarrativeBlock(doc, buildSocialAttentionConclusion(), y);

  y = drawProfessionalSectionTitle(doc, '10', 'RESPONSABLE', y + 7);
  drawResponsibleSignature(doc, responsible, generatedAt, y);

  drawSocialAttentionFooterOnAllPages(doc);
  doc.save(`Informe-atencion-social-${safePdfFilename(beneficiary.code || beneficiary.full_name || 'beneficiario')}.pdf`);
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

  let signatureY = doc.lastAutoTable.finalY + 20;
  if (signatureY > 215) {
    doc.addPage();
    signatureY = 28;
  }
  doc.setFontSize(12);
  doc.text('Firma del beneficiario', 14, signatureY);
  doc.text('Firma del responsable', 112, signatureY);
  doc.setDrawColor(180, 190, 185);
  doc.roundedRect(14, signatureY + 4, 80, 36, 2, 2);
  doc.roundedRect(112, signatureY + 4, 80, 36, 2, 2);
  if (delivery.signature_data_url) {
    const signature = await compressDataUrlImage(delivery.signature_data_url, 520, 180, 0.74);
    doc.addImage(signature.dataUrl, signature.format, 14, signatureY + 5, 80, 32);
  } else {
    doc.setFontSize(10);
    doc.text('Sin firma registrada', 14, signatureY + 12);
  }
  if (delivery.responsible_signature_data_url) {
    const responsibleSignature = await compressDataUrlImage(delivery.responsible_signature_data_url, 520, 180, 0.74);
    doc.addImage(responsibleSignature.dataUrl, responsibleSignature.format, 112, signatureY + 5, 80, 32);
  }

  drawReceiptLegalFooter(doc);

  return { doc, receiptNumber };
}

export async function downloadReceiptsZip(filename, receiptEntries, allDeliveries = [], options = {}) {
  const blob = await createReceiptsZipBlob(receiptEntries, allDeliveries, options);
  downloadBlob(blob, `${filename}.zip`);
}

export async function createReceiptsZipBlob(receiptEntries, allDeliveries = [], options = {}) {
  const zip = new JSZip();
  const deliveries = receiptEntries.map((entry) => entry.delivery);
  for (const [index, entry] of receiptEntries.entries()) {
    const { doc, receiptNumber } = await createDeliveryReceiptPdf(entry.delivery, entry.beneficiary, allDeliveries, options.organization || {});
    const suffix = receiptEntries.filter((item) => (item.delivery.receipt_number || '') === receiptNumber).length > 1 ? `-${index + 1}` : '';
    zip.file(`Justificante-${receiptNumber}${suffix}.pdf`, doc.output('blob'));
  }
  if (options.includeSummary) {
    const summaryDoc = await createDeliveriesSummaryDocument(deliveries);
    zip.file('Resumen-entregas.pdf', summaryDoc.output('blob'));
  }
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
  const activeDeliveries = data.deliveries.filter((item) => item.status !== 'Anulada');
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
      ['Entregas registradas', activeDeliveries.length],
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
  const summaryRows = deliveries.flatMap((delivery) => getReceiptProductRows(delivery).map(([product, quantity]) => ({ delivery, product, quantity })));
  const totalProducts = summaryRows.reduce((total, item) => total + Number(item.quantity || 0), 0);
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
    body: summaryRows.map(({ delivery, product, quantity }) => [
      formatDate(delivery.delivered_at),
      formatTime(delivery.reception_at || delivery.delivered_at),
      delivery.beneficiary_name || '-',
      delivery.responsible || '-',
      product,
      quantity,
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
      const maxSide = 420;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.74),
        format: 'JPEG',
        width: canvas.width,
        height: canvas.height
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

async function drawSocialAttentionCover(doc, { orgName, beneficiary, generatedAt, photo }) {
  doc.setFillColor(244, 248, 245);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(36, 126, 80);
  doc.rect(0, 0, 210, 38, 'F');
  await addOfficialLogo(doc, 14, 9, 30, 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(orgName, 50, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Documento informativo para entidades colaboradoras y administraciones públicas', 50, 24);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 46, 182, 46, 3, 3, 'F');
  doc.setDrawColor(219, 229, 220);
  doc.roundedRect(14, 46, 182, 46, 3, 3);
  doc.setTextColor(23, 33, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('INFORME DE ATENCIÓN SOCIAL', 24, 62);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Número de expediente: ${beneficiary.code || '-'}`, 24, 75);
  doc.text(`Fecha de emisión: ${formatDate(generatedAt)}`, 24, 82);

  doc.setDrawColor(198, 210, 202);
  doc.roundedRect(158, 52, 28, 32, 2, 2);
  if (photo?.dataUrl) {
    doc.addImage(photo.dataUrl, photo.format || 'JPEG', 159, 53, 26, 30);
  } else {
    doc.setFillColor(239, 246, 241);
    doc.roundedRect(159, 53, 26, 30, 2, 2, 'F');
    doc.setTextColor(36, 126, 80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(reportInitials(beneficiary.full_name), 172, 70, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(96, 112, 100);
  doc.text(photo?.dataUrl ? 'Fotografía del expediente' : 'Fotografía no disponible', 172, 89, { align: 'center' });
  doc.setTextColor(23, 33, 27);
}

function drawProfessionalSectionTitle(doc, number, title, y) {
  y = ensureSocialSpace(doc, y, 16);
  doc.setFillColor(36, 126, 80);
  doc.roundedRect(14, y - 5, 9, 9, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(String(number), 18.5, y + 1, { align: 'center' });
  doc.setTextColor(23, 33, 27);
  doc.setFontSize(11);
  doc.text(title, 28, y + 1);
  doc.setDrawColor(219, 229, 220);
  doc.line(28, y + 4, 196, y + 4);
  doc.setFont('helvetica', 'normal');
  return y + 11;
}

function drawIdentificationCards(doc, beneficiary, family, familyStats, y) {
  return drawInfoCards(doc, [
    ['Nombre', beneficiary.full_name || '-'],
    ['Documento', beneficiary.document_id || '-'],
    ['Fecha de nacimiento', formatDate(beneficiary.birth_date)],
    ['Dirección', [beneficiary.address_full || family?.address, beneficiary.postal_code].filter(Boolean).join(' - ') || '-'],
    ['Teléfono', beneficiary.phone || '-'],
    ['Unidad familiar', family ? `${family.family_code || '-'} - ${family.responsible_name || 'sin responsable registrado'}` : 'Sin unidad familiar vinculada'],
    ['Adultos', String(familyStats.adults)],
    ['Menores', String(familyStats.minors)],
    ['Fecha de alta', formatDate(beneficiary.joined_at)],
    ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo']
  ], y, { columns: 2 });
}

function drawInfoCards(doc, items, y, options = {}) {
  const columns = options.columns || 2;
  const gap = 4;
  const cardWidth = (182 - gap * (columns - 1)) / columns;
  const cardHeight = options.cardHeight || 18;
  let currentY = y;
  items.forEach((item, index) => {
    if (index % columns === 0) currentY = ensureSocialSpace(doc, currentY, cardHeight + 4);
    const column = index % columns;
    const x = 14 + column * (cardWidth + gap);
    const boxY = currentY;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(219, 229, 220);
    doc.roundedRect(x, boxY, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(96, 112, 100);
    doc.text(String(item[0]).toUpperCase(), x + 3, boxY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(23, 33, 27);
    const valueLines = doc.splitTextToSize(String(item[1] || '-'), cardWidth - 6).slice(0, 2);
    doc.text(valueLines, x + 3, boxY + 11);
    if (column === columns - 1 || index === items.length - 1) currentY += cardHeight + 4;
  });
  return currentY;
}

function drawNarrativeCard(doc, text, y, options = {}) {
  const lines = doc.splitTextToSize(String(text || '-'), 168);
  const height = Math.max(options.minHeight || 26, lines.length * 5 + 12);
  y = ensureSocialSpace(doc, y, height + 2);
  doc.setFillColor(options.accent ? 247 : 255, options.accent ? 251 : 255, options.accent ? 248 : 255);
  doc.setDrawColor(options.accent ? 190 : 219, options.accent ? 215 : 229, options.accent ? 199 : 220);
  doc.roundedRect(14, y, 182, height, 3, 3, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(45, 56, 49);
  doc.text(lines, 21, y + 10);
  doc.setTextColor(23, 33, 27);
  return y + height + 2;
}

function drawNarrativeBlock(doc, text, y, options = {}) {
  const lines = doc.splitTextToSize(String(text || '-'), 174);
  let index = 0;
  let firstChunk = true;
  while (index < lines.length) {
    y = ensureSocialSpace(doc, y, 26);
    const availableHeight = Math.max(24, 258 - y);
    const maxLines = Math.max(1, Math.floor((availableHeight - 10) / 5));
    const chunk = lines.slice(index, index + maxLines);
    const minHeight = firstChunk ? options.minHeight || 24 : 18;
    const height = Math.max(minHeight, chunk.length * 5 + 10);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 228);
    doc.roundedRect(14, y, 182, height, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(45, 56, 49);
    doc.text(chunk, 18, y + 8);
    doc.setTextColor(23, 33, 27);
    y += height + 2;
    index += chunk.length;
    firstChunk = false;
  }
  return y;
}

function drawManualCompletionBlock(doc, y, height, helperText) {
  y = ensureSocialSpace(doc, y, height + 4);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(198, 210, 202);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.roundedRect(14, y, 182, height, 2, 2, 'FD');
  doc.setLineDashPattern([], 0);
  doc.setFontSize(8.5);
  doc.setTextColor(112, 126, 116);
  doc.text(doc.splitTextToSize(helperText, 170), 20, y + 8);
  doc.setTextColor(23, 33, 27);
  return y + height + 2;
}

function drawInterventionTimelineTable(doc, timeline, y) {
  y = ensureSocialSpace(doc, y, 36);
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Tipo de ayuda', 'Descripción', 'Responsable', 'Observaciones']],
    body: timeline.length ? timeline.map((item) => [
      formatDate(item.date),
      item.type || '-',
      item.description || '-',
      item.responsible || '-',
      item.observations || '-'
    ]) : [['-', 'Sin intervenciones registradas', 'No constan actuaciones en el expediente consultado.', '-', '-']],
    styles: { fontSize: 8, cellPadding: 2.1, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [36, 126, 80], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 34 },
      2: { cellWidth: 54 },
      3: { cellWidth: 32 },
      4: { cellWidth: 40 }
    },
    margin: { left: 14, right: 14 }
  });
  return (doc.lastAutoTable?.finalY || y) + 4;
}

function drawCurrentSituationCards(doc, beneficiary, timeline, latestAttention, y) {
  return drawInfoCards(doc, [
    ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo'],
    ['Última atención', latestAttention ? `${formatDate(latestAttention.date)} - ${latestAttention.type}` : 'Sin atenciones registradas'],
    ['Total intervenciones', String(timeline.length)],
    ['Seguimiento', timeline.length > 1 ? 'Seguimiento con continuidad registrada' : timeline.length === 1 ? 'Seguimiento puntual registrado' : 'Sin seguimiento registrado'],
    ['Observaciones relevantes', beneficiary.notes || 'Sin observaciones registradas']
  ], y, { columns: 2, cardHeight: 22 });
}

function drawResponsibleSignature(doc, responsible, generatedAt, y) {
  y = ensureSocialSpace(doc, y, 44);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(219, 229, 220);
  doc.roundedRect(14, y, 182, 38, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(96, 112, 100);
  doc.text('Nombre', 20, y + 8);
  doc.text('Cargo', 20, y + 17);
  doc.text('Fecha', 20, y + 26);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(23, 33, 27);
  doc.text(responsible.name || 'Nombre y apellidos', 44, y + 8);
  doc.text(responsible.position || 'Responsable de atención', 44, y + 17);
  doc.text(formatDate(generatedAt), 44, y + 26);
  doc.setDrawColor(150, 164, 154);
  doc.line(120, y + 25, 184, y + 25);
  doc.setFontSize(8);
  doc.setTextColor(96, 112, 100);
  doc.text('Firma', 146, y + 31, { align: 'center' });
  doc.setTextColor(23, 33, 27);
}

function ensureSocialSpace(doc, y, neededHeight) {
  if (y + neededHeight <= 260) return y;
  doc.addPage();
  return 18;
}

function drawSocialAttentionFooter(doc) {
  const text = 'Este informe ha sido elaborado por la Asociación Pan y Esperanza con fines exclusivamente informativos. La información contenida procede del expediente interno de la entidad y refleja las actuaciones realizadas hasta la fecha de emisión.';
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 270, 196, 270);
  doc.setFontSize(7.5);
  doc.setTextColor(96, 112, 100);
  doc.text(doc.splitTextToSize(text, 182), 14, 276);
  doc.setTextColor(23, 33, 27);
}

function drawSocialAttentionFooterOnAllPages(doc) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawSocialAttentionFooter(doc);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 132, 124);
    doc.text(`Pagina ${page} de ${total}`, 178, 288);
    doc.setTextColor(23, 33, 27);
  }
}

function buildSocialAttentionTimeline(deliveries = [], history = []) {
  const deliveryRows = deliveries.map((delivery) => ({
    date: delivery.delivered_at || delivery.reception_at || delivery.created_at,
    type: delivery.help_type || 'Ayuda entregada',
    description: delivery.inventory_item_name || delivery.product || 'Atención registrada por la entidad.',
    responsible: delivery.responsible || delivery.created_by || '',
    observations: delivery.notes || ''
  }));
  const historyRows = history.map((item) => ({
    date: item.date || item.created_at,
    type: item.entry_type || 'Seguimiento',
    description: item.notes || 'Anotación de seguimiento registrada.',
    responsible: item.user_name || item.created_by || item.user || '',
    observations: ''
  }));
  return [...deliveryRows, ...historyRows]
    .filter((item) => item.date || item.description)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

function getInitialSocialObservation(history = []) {
  const sorted = [...history].sort((a, b) => String(a.date || a.created_at || '').localeCompare(String(b.date || b.created_at || '')));
  return sorted.find((item) => {
    const type = normalizeTextForReport(item.entry_type);
    return type.includes('primera') || type.includes('inicial');
  }) || null;
}

function buildFamilyContextText(beneficiary, family, familyMembers = [], familyStats) {
  const parts = [];
  if (family) {
    parts.push(`La persona beneficiaria consta vinculada a la unidad familiar ${family.family_code || 'sin código registrado'}.`);
    if (family.responsible_name) parts.push(`La persona responsable familiar registrada es ${family.responsible_name}.`);
    if (family.status) parts.push(`La situación familiar registrada es "${family.status}".`);
    if (family.notes) parts.push(`Observación familiar registrada: ${family.notes}`);
  } else {
    parts.push('No consta unidad familiar vinculada en el expediente.');
  }
  if (familyMembers.length) {
    const members = familyMembers
      .map((member) => `${member.full_name || 'Miembro sin nombre'}${member.family_relationship ? ` (${member.family_relationship})` : ''}`)
      .join('; ');
    parts.push(`Composición registrada: ${members}.`);
  } else {
    parts.push(`Composición registrada: ${familyStats.adults} adulto${familyStats.adults === 1 ? '' : 's'} y ${familyStats.minors} menor${familyStats.minors === 1 ? '' : 'es'}.`);
  }
  if (beneficiary.situation) parts.push(`Situación individual registrada: "${beneficiary.situation}".`);
  return parts.join(' ');
}

function buildAttentionReasonText(beneficiary, history = []) {
  const initialObservation = getInitialSocialObservation(history);
  if (initialObservation?.notes) return initialObservation.notes;
  const parts = [];
  if (beneficiary.requested_help) parts.push(`El expediente registra una demanda de atención vinculada a ${lowerFirst(beneficiary.requested_help)}.`);
  if (beneficiary.situation) parts.push(`La situación registrada en el expediente es "${beneficiary.situation}".`);
  if (beneficiary.notes) parts.push(`Como observación relevante consta: ${beneficiary.notes}`);
  return parts.join(' ');
}

function buildSocialInterventionSummary(beneficiary, timeline) {
  const parts = [
    `${beneficiary.full_name || 'La persona beneficiaria'} figura en el expediente de la Asociación Pan y Esperanza${beneficiary.joined_at ? ` desde el ${formatDate(beneficiary.joined_at)}` : ''}.`
  ];
  if (timeline.length) {
    const helpTypes = uniqueReportValues(timeline.map((item) => item.type)).slice(0, 3).join(', ');
    parts.push(`Desde entonces constan ${timeline.length} intervención${timeline.length === 1 ? '' : 'es'} registrada${timeline.length === 1 ? '' : 's'}${helpTypes ? ` relacionadas con: ${helpTypes}` : ''}.`);
    parts.push('La frecuencia de atención se determina a partir de las actuaciones registradas por la entidad en el expediente.');
  } else {
    parts.push('No constan intervenciones registradas en el historial consultado.');
  }
  return parts.join(' ');
}

function buildSocialAttentionConclusion() {
  return 'La información contenida en este informe refleja la atención prestada por la Asociación Pan y Esperanza en el marco de su actividad social. El presente documento tiene carácter informativo y resume las actuaciones realizadas con la persona beneficiaria hasta la fecha de emisión.';
}

function buildEntityAssessmentText(beneficiary, timeline) {
  const parts = [];
  if (beneficiary.is_active) {
    parts.push('Con la información obrante en el expediente, la Asociación considera conveniente mantener el seguimiento de la persona beneficiaria.');
  } else {
    parts.push('Con la información obrante en el expediente, la persona beneficiaria no consta actualmente como expediente activo.');
  }
  if (timeline.length) {
    parts.push(`La valoración institucional se basa en las ${timeline.length} actuación${timeline.length === 1 ? '' : 'es'} registrada${timeline.length === 1 ? '' : 's'} en el sistema de la entidad.`);
  }
  parts.push('Esta valoración tiene carácter institucional e informativo y no constituye diagnóstico profesional ni valoración clínica.');
  return parts.join(' ');
}

function getLatestSocialAttention(timeline = []) {
  return [...timeline].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
}

function getFamilyStats(beneficiary, familyMembers = []) {
  const members = Array.isArray(familyMembers) ? familyMembers : [];
  const total = members.length || Number(beneficiary.family_members || 1);
  const datedMembers = members.filter((member) => member.birth_date);
  const datedMinors = datedMembers.filter((member) => ageFromDate(member.birth_date) !== null && ageFromDate(member.birth_date) < 18).length;
  const minors = datedMembers.length ? datedMinors : Math.min(total, Number(beneficiary.minors_count || 0));
  return { total, minors, adults: Math.max(0, total - minors) };
}

function ageFromDate(value) {
  if (!value) return null;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function currentUserNameForReport(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email || '';
}

function reportResponsible(user) {
  const name = currentUserNameForReport(user);
  const rawPosition = String(user?.position || user?.role || 'Responsable de atención').trim();
  const normalized = normalizeTextForReport(rawPosition);
  const compactPosition = normalized.replace(/\s+/g, '');
  const position = compactPosition.includes('trabajadorsocial') || compactPosition.includes('trabajadorasocial')
    ? 'Responsable de atención'
    : rawPosition;
  return { name, position };
}

async function getBeneficiaryReportPhoto(beneficiary) {
  const source = await resolveBeneficiaryPhotoUrl(beneficiary).catch(() => null);
  if (!source) return null;
  return prepareReportImage(source, 360, 420, 0.78).catch(() => null);
}

function prepareReportImage(source, maxWidth, maxHeight, quality = 0.78) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * ratio));
        const height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), format: 'JPEG' });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function reportInitials(name = '') {
  return String(name || 'PE')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'PE';
}

function lowerFirst(value = '') {
  const text = String(value || '').trim();
  return text ? `${text[0].toLowerCase()}${text.slice(1)}` : '';
}

function uniqueReportValues(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = normalizeTextForReport(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeTextForReport(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function safePdfFilename(value) {
  return String(value || 'documento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'documento';
}

async function addOfficialLogo(doc, x, y, maxWidth, maxHeight) {
  const logo = await getOfficialLogo();
  const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = logo.width * ratio;
  const height = logo.height * ratio;
  doc.addImage(logo.dataUrl, logo.format || 'JPEG', x, y, width, height);
}

function compressDataUrlImage(dataUrl, maxWidth, maxHeight, quality = 0.75) {
  if (!dataUrl) return Promise.resolve({ dataUrl, format: 'PNG' });
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * ratio));
      const height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), format: 'JPEG' });
    };
    image.onerror = () => resolve({ dataUrl, format: dataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG' });
    image.src = dataUrl;
  });
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
