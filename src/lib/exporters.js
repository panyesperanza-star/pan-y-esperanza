import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';
import { resolveBeneficiaryPhotoUrl } from './beneficiaryPhotos';
import { formatDate, formatDateTime, nextReceiptNumber } from './formatters';

export function exportExcel(filename, sheets) {
  const book = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const worksheet = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    applyExcelTableLayout(worksheet, rows);
    XLSX.utils.book_append_sheet(book, worksheet, sheet.name);
  });
  XLSX.writeFile(book, `${filename}.xlsx`);
}

function applyExcelTableLayout(worksheet, rows) {
  if (!rows.length || !worksheet['!ref']) return;
  const headers = Object.keys(rows[0]);
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  worksheet['!cols'] = headers.map((header) => {
    const contentWidth = rows.reduce((width, row) => Math.max(width, String(row[header] ?? '').length + 2), String(header).length + 2);
    return { wch: Math.min(48, Math.max(12, contentWidth)) };
  });
}

export async function printBeneficiaryPdf(beneficiary, deliveries) {
  const doc = new jsPDF();
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(17);
  doc.text('Resumen del expediente - Pan y Esperanza', 52, 20);
  doc.setFontSize(11);
  const fields = [
    ['Código', beneficiary.code],
    ['Nombre', beneficiary.full_name],
    ['DNI/NIE / NIE O PASAPORTE', beneficiary.document_id || '-'],
    ['Dirección completa', beneficiary.address_full || '-'],
    ['Código postal', beneficiary.postal_code || '-'],
    ['Teléfono', beneficiary.phone || '-'],
    ['Unidad familiar', `${beneficiary.family_members || 0} miembros, ${beneficiary.minors_count || 0} menores`],
    ['Situación', beneficiary.situation],
    ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo'],
    ['Ayuda solicitada', beneficiary.requested_help || '-'],
    ['Fecha alta', formatDate(beneficiary.joined_at)],
    ['Última ayuda', formatDate(beneficiary.last_help_at)],
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
  const reportObjectives = getReportObjectives(history);
  const familyStats = getFamilyStats(beneficiary, familyMembers);
  const latestAttention = getLatestSocialAttention(timeline);
  const responsible = reportResponsible(currentUser);
  const photo = await getBeneficiaryReportPhoto(beneficiary);

  await drawInstitutionalReportCover(doc, {
    orgName,
    beneficiary,
    family,
    familyStats,
    generatedAt,
    latestAttention,
    photo
  });

  const reportContext = { orgName, beneficiary, generatedAt };
  doc.addPage();
  drawInstitutionalPageHeader(doc, reportContext);
  let y = 34;

  y = drawInstitutionalSectionTitle(doc, '1. PRESENTACIÓN', y, reportContext);
  y = drawReportParagraph(doc, buildInstitutionalPresentationText(orgName), y, { context: reportContext, lead: true });

  y = drawInstitutionalSectionTitle(doc, '2. IDENTIFICACIÓN', y + 8, reportContext);
  y = drawIdentificationNarrative(doc, beneficiary, family, familyStats, y, reportContext);

  y = drawInstitutionalSectionTitle(doc, '3. CONTEXTO FAMILIAR', y + 8, reportContext);
  y = drawReportParagraph(doc, buildFamilyContextText(beneficiary, family, familyMembers, familyStats), y, { context: reportContext });

  y = drawInstitutionalSectionTitle(doc, '4. MOTIVO DE LA ATENCIÓN', y + 8, reportContext);
  y = drawReportParagraph(doc, buildAttentionReasonText(beneficiary, history), y, { context: reportContext });

  y = drawInstitutionalSectionTitle(doc, '5. HISTORIA DE LA INTERVENCIÓN', y + 8, reportContext);
  drawInterventionChronology(doc, timeline, y, reportContext);

  doc.addPage();
  drawInstitutionalPageHeader(doc, reportContext);
  y = 34;

  y = drawInstitutionalSectionTitle(doc, '6. EVOLUCIÓN', y, reportContext);
  y = drawReportParagraph(doc, buildSocialInterventionSummary(beneficiary, timeline), y, { context: reportContext });

  y = drawInstitutionalSectionTitle(doc, '7. SITUACIÓN ACTUAL', y + 10, reportContext);
  y = drawReportParagraph(doc, buildCurrentSituationText(beneficiary, timeline, latestAttention, reportObjectives), y, { context: reportContext });

  y = drawInstitutionalSectionTitle(doc, '8. RECURSOS MOVILIZADOS', y + 10, reportContext);
  y = drawMobilizedResources(doc, buildMobilizedResources(timeline), y, reportContext);

  y = drawInstitutionalSectionTitle(doc, '9. OBSERVACIONES', y + 10, reportContext);
  y = drawReportObservations(doc, getReportObservations(beneficiary, family, timeline, history), y, reportContext);

  doc.addPage();
  drawInstitutionalPageHeader(doc, reportContext);
  y = 42;

  y = drawInstitutionalSectionTitle(doc, '10. VALORACIÓN DE LA ENTIDAD', y, reportContext);
  y = drawReportParagraph(doc, buildEntityAssessmentText(beneficiary, timeline, reportObjectives), y, { context: reportContext });

  y = drawInstitutionalSectionTitle(doc, '11. CONCLUSIÓN', y + 16, reportContext);
  y = drawReportParagraph(doc, buildSocialAttentionConclusion(beneficiary, timeline), y, { context: reportContext });

  y = drawInstitutionalSectionTitle(doc, '12. RESPONSABLE', y + 18, reportContext);
  drawInstitutionalSignature(doc, responsible, generatedAt, y, reportContext);

  drawSocialAttentionFooterOnAllPages(doc);
  doc.save(`Informe-atencion-social-${safePdfFilename(beneficiary.code || beneficiary.full_name || 'beneficiario')}.pdf`);
}

export async function printDeliveryReceiptPdf(delivery, beneficiary, deliveries = []) {
  const { doc, receiptNumber } = await createDeliveryReceiptPdf(delivery, beneficiary, deliveries);
  doc.save(`Justificante-${receiptNumber}.pdf`);
}

export async function printAttendanceJustificationPdf(appointment, beneficiary = {}, organization = {}) {
  const { doc, filename } = await createAttendanceJustificationPdf(appointment, beneficiary, organization);
  doc.save(filename);
}

export async function createAttendanceJustificationPdf(appointment, beneficiary = {}, organization = {}) {
  const doc = new jsPDF();
  const orgName = organization.name || 'Asociación Pan y Esperanza';
  const personName = beneficiary.full_name || appointment.beneficiaryName || appointment.meta?.beneficiary_name || '-';
  const documentId = beneficiary.document_id || appointment.beneficiaryDocumentId || '-';
  const startAt = appointment.appointmentAt || appointment.meta?.appointment_at || '';
  const startTime = appointment.entryTime || appointment.meta?.entry_time || String(startAt || '').slice(11, 16) || '-';
  const endTime = appointment.exitTime || appointment.meta?.exit_time || appointmentEndTime(startAt, appointment.duration || appointment.meta?.duration);
  const issuedAt = new Date().toISOString();

  doc.setFillColor(246, 249, 246);
  doc.rect(0, 0, 210, 42, 'F');
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(10);
  doc.setTextColor(80, 95, 88);
  doc.text(orgName, 52, 17);
  doc.setFontSize(18);
  doc.setTextColor(28, 45, 38);
  doc.text('JUSTIFICANTE DE ASISTENCIA', 52, 28);
  doc.setFontSize(9);
  doc.setTextColor(91, 105, 98);
  doc.text(`Fecha de emisión: ${formatDate(issuedAt)}`, 52, 35);

  autoTable(doc, {
    startY: 58,
    body: [
      ['Nombre de la persona', personName],
      ['Documento identificativo', documentId],
      ['Fecha', formatDate(startAt)],
      ['Hora de inicio', startTime],
      ['Hora de finalización', endTime],
      ['Lugar', appointment.place || appointment.meta?.place || '-'],
      ['Motivo de la cita', appointment.type || appointment.meta?.appointment_type || 'Cita'],
      ['Responsable', appointment.responsible || appointment.meta?.responsible || '-']
    ],
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3, textColor: [23, 33, 27] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: [36, 126, 80] }, 1: { cellWidth: 125 } },
    margin: { left: 14, right: 14 }
  });

  const y = doc.lastAutoTable.finalY + 18;
  doc.setFontSize(11);
  doc.setTextColor(28, 45, 38);
  doc.text(doc.splitTextToSize('La Asociación Pan y Esperanza hace constar que la persona anteriormente identificada ha asistido a la actividad indicada en la fecha y horario señalados.', 180), 14, y);

  const signatureY = 178;
  doc.setDrawColor(208, 216, 212);
  doc.roundedRect(14, signatureY, 82, 34, 2, 2);
  doc.roundedRect(114, signatureY, 82, 34, 2, 2);
  doc.setFontSize(9);
  doc.setTextColor(28, 45, 38);
  doc.text('Firma del responsable', 18, signatureY + 9);
  doc.text('Sello de la entidad', 118, signatureY + 9);

  doc.setDrawColor(36, 126, 80);
  doc.line(18, signatureY + 25, 88, signatureY + 25);
  doc.line(118, signatureY + 25, 188, signatureY + 25);

  doc.setFontSize(8);
  doc.setTextColor(91, 105, 98);
  doc.text(doc.splitTextToSize('Documento emitido por la Asociación Pan y Esperanza con fines justificativos e informativos. La información procede de la cita registrada en la agenda interna de la entidad.', 180), 14, 270);
  return {
    doc,
    filename: `Justificante-asistencia-${safePdfFilename(personName)}-${safePdfFilename(formatDate(startAt))}.pdf`
  };
}

export async function createDeliveryReceiptPdf(delivery, beneficiary, deliveries = [], organization = {}) {
  const doc = new jsPDF();
  const receiptNumber = delivery.receipt_number || nextReceiptNumber(deliveries, delivery.delivered_at);
  const generatedAt = new Date();
  const productRows = getReceiptProductRows(delivery);
  const orgName = organization.name || 'Asociación Pan y Esperanza';
  const beneficiaryName = beneficiary?.full_name || delivery.beneficiary_name || '-';
  const familyLabel = receiptFamilyLabel(beneficiary, delivery);
  const qrDataUrl = await QRCode.toDataURL(receiptQrPayload({ receiptNumber, delivery, beneficiary, orgName }), { margin: 1, width: 140 });

  await drawOfficialReceiptHeader(doc, { orgName, receiptNumber, generatedAt, organization, qrDataUrl });

  drawPdfSectionTitle(doc, 'DATOS DE LA ENTREGA', 58);
  autoTable(doc, {
    startY: 63,
    body: [
      ['Número de justificante', receiptNumber],
      ['Fecha de entrega', formatDateTime(delivery.reception_at || delivery.delivered_at)],
      ['Beneficiario', beneficiaryName],
      ['Unidad familiar', familyLabel],
      ['Responsable', delivery.responsible || '-']
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [23, 33, 27] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48, textColor: [36, 126, 80] }, 1: { cellWidth: 132 } },
    margin: { left: 14, right: 14 }
  });

  drawPdfSectionTitle(doc, 'PRODUCTOS ENTREGADOS', doc.lastAutoTable.finalY + 10);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 15,
    head: [['Producto entregado', 'Cantidad']],
    body: productRows,
    headStyles: { fillColor: [36, 126, 80] },
    alternateRowStyles: { fillColor: [247, 250, 246] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 38, halign: 'right' } },
    margin: { left: 14, right: 14 }
  });

  const observationsY = drawReceiptObservations(doc, delivery.notes, doc.lastAutoTable.finalY + 12);
  let signatureY = observationsY + 15;
  if (signatureY > 210) {
    doc.addPage();
    signatureY = 28;
    drawReceiptPageMark(doc, orgName, receiptNumber);
  }
  await drawReceiptSignatures(doc, delivery, signatureY);

  drawReceiptLegalFooter(doc, orgName);

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

async function drawOfficialReceiptHeader(doc, { orgName, receiptNumber, generatedAt, organization = {}, qrDataUrl }) {
  doc.setFillColor(247, 250, 246);
  doc.rect(0, 0, 210, 50, 'F');
  await addOfficialLogo(doc, 14, 9, 30, 24);
  doc.setTextColor(23, 33, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(orgName, 50, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text([organization.cif || 'CIF: EN TRÁMITE', organization.email || 'info@panyesperanza.org', organization.phone || ''].filter(Boolean), 50, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(36, 126, 80);
  doc.text('JUSTIFICANTE OFICIAL DE ENTREGA', 14, 43);
  doc.setTextColor(23, 33, 27);
  doc.setFontSize(9);
  doc.text(`Nº ${receiptNumber}`, 142, 18);
  doc.text(`Emisión: ${formatDateTime(generatedAt.toISOString())}`, 142, 25);
  doc.addImage(qrDataUrl, 'PNG', 176, 31, 20, 20);
  doc.setDrawColor(36, 126, 80);
  doc.setLineWidth(0.6);
  doc.line(14, 51, 196, 51);
  doc.setLineWidth(0.2);
}

function drawPdfSectionTitle(doc, title, y) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(36, 126, 80);
  doc.text(title, 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(23, 33, 27);
}

function drawReceiptObservations(doc, notes, y) {
  drawPdfSectionTitle(doc, 'OBSERVACIONES', y);
  const text = notes || 'Sin observaciones registradas.';
  const lines = doc.splitTextToSize(text, 176);
  doc.setFillColor(247, 250, 246);
  doc.roundedRect(14, y + 4, 182, Math.max(18, lines.length * 5 + 8), 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(23, 33, 27);
  doc.text(lines, 18, y + 12);
  return y + Math.max(26, lines.length * 5 + 16);
}

async function drawReceiptSignatures(doc, delivery, y) {
  drawPdfSectionTitle(doc, 'FIRMAS', y);
  const leftX = 14;
  const rightX = 112;
  doc.setFontSize(9);
  doc.setTextColor(23, 33, 27);
  doc.text('Firma del beneficiario', leftX, y + 10);
  doc.text('Firma del responsable', rightX, y + 10);
  doc.setDrawColor(180, 190, 185);
  doc.roundedRect(leftX, y + 14, 80, 36, 2, 2);
  doc.roundedRect(rightX, y + 14, 80, 36, 2, 2);
  if (delivery.signature_data_url) {
    const signature = await compressDataUrlImage(delivery.signature_data_url, 520, 180, 0.74);
    doc.addImage(signature.dataUrl, signature.format, leftX, y + 15, 80, 32);
  } else {
    doc.setFontSize(8);
    doc.setTextColor(96, 112, 100);
    doc.text('Sin firma registrada', leftX + 4, y + 26);
  }
  if (delivery.responsible_signature_data_url) {
    const responsibleSignature = await compressDataUrlImage(delivery.responsible_signature_data_url, 520, 180, 0.74);
    doc.addImage(responsibleSignature.dataUrl, responsibleSignature.format, rightX, y + 15, 80, 32);
  }
}

function drawReceiptPageMark(doc, orgName, receiptNumber) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(36, 126, 80);
  doc.text(`${orgName} · Justificante ${receiptNumber}`, 14, 16);
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 20, 196, 20);
  doc.setTextColor(23, 33, 27);
}

function drawReceiptLegalFooter(doc, orgName = 'Asociación Pan y Esperanza') {
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 272, 196, 272);
  doc.setFontSize(8);
  doc.setTextColor(96, 112, 100);
  doc.text(`Este documento acredita la entrega de ayuda social realizada por ${orgName}.`, 14, 279);
  doc.text('Documento generado electrónicamente. La información queda archivada para trazabilidad, auditoría y seguimiento interno.', 14, 285);
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

function receiptFamilyLabel(beneficiary, delivery) {
  if (delivery.family_name) return delivery.family_name;
  const total = Number(beneficiary?.family_members || 0);
  const minors = Number(beneficiary?.minors_count || 0);
  if (total || minors) return `${total || '-'} miembros${minors ? ` · ${minors} menores` : ''}`;
  return 'No registrada';
}

function receiptQrPayload({ receiptNumber, delivery, beneficiary, orgName }) {
  return [
    `Justificante: ${receiptNumber}`,
    `Asociación: ${orgName}`,
    `Fecha: ${formatDateTime(delivery.reception_at || delivery.delivered_at)}`,
    `Beneficiario: ${beneficiary?.full_name || delivery.beneficiary_name || '-'}`,
    `Responsable: ${delivery.responsible || '-'}`
  ].join('\n');
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
      ['Ingresos tesorería', formatMoney(treasuryIncome)],
      ['Gastos tesorería', formatMoney(treasuryExpenses)],
      ['Saldo tesorería', formatMoney(treasuryIncome - treasuryExpenses)],
      ['Voluntarios', data.volunteers.length]
    ],
    headStyles: { fillColor: [36, 126, 80] }
  });
  doc.save('Informe-Pan-y-Esperanza.pdf');
}

export async function printDonationCertificatePdf(donation, organization = {}, donationView = {}) {
  const doc = new jsPDF();
  const orgName = organization.name || 'Asociación Pan y Esperanza';
  const donatedAt = donation.donated_at || donationView.date || donation.created_at;
  const certificateNumber = donation.reference || extractDonationReference(donation.notes) || donationView.reference || `DON-CERT-${new Date(donatedAt || Date.now()).getFullYear()}-${String(donation.id || donationView.id || '000001').slice(-6)}`;
  const qr = await QRCode.toDataURL(JSON.stringify({
    type: 'certificado-donacion',
    number: certificateNumber,
    donor: donation.donor || donationView.donor,
    date: donatedAt
  }));

  doc.setFillColor(246, 249, 246);
  doc.rect(0, 0, 210, 42, 'F');
  await addOfficialLogo(doc, 14, 11, 34, 18);
  doc.setFontSize(10);
  doc.setTextColor(80, 95, 88);
  doc.text(orgName, 52, 17);
  doc.setFontSize(18);
  doc.setTextColor(28, 45, 38);
  doc.text('CERTIFICADO DE DONACIÓN', 52, 27);
  doc.setFontSize(9);
  doc.setTextColor(91, 105, 98);
  doc.text(`Número de certificado: ${certificateNumber}`, 52, 34);
  doc.addImage(qr, 'PNG', 166, 9, 26, 26);

  doc.setTextColor(28, 45, 38);
  doc.setFontSize(11);
  doc.text('Datos de la entidad', 14, 55);
  autoTable(doc, {
    startY: 60,
    body: [
      ['Entidad', orgName],
      ['CIF', organization.cif || '-'],
      ['Dirección', organization.address || '-']
    ],
    styles: { fontSize: 9, cellPadding: 2.2 },
    columnStyles: { 0: { fontStyle: 'bold' } }
  });

  doc.setFontSize(11);
  doc.text('Datos de la donación', 14, doc.lastAutoTable.finalY + 11);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 16,
    body: [
      ['Donante', donation.donor || donationView.donor || '-'],
      ['Tipo de donante', donation.donor_kind || donationView.donorKind || '-'],
      ['Tipo de donación', donation.donation_type || donationView.concept || '-'],
      ['Fecha', formatDate(donatedAt)],
      ['Responsable', donation.responsible || donation.created_by_name || donationView.responsible || '-']
    ],
    styles: { fontSize: 9, cellPadding: 2.2 },
    columnStyles: { 0: { fontStyle: 'bold' } }
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Producto o concepto', 'Cantidad', 'Valor estimado']],
    body: buildDonationProductRows(donation, donationView),
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 9, cellPadding: 2.5 }
  });

  const observations = String(donation.notes || donationView.notes || '').replace(/^Referencia:\s*.*$/gim, '').trim();
  if (observations) {
    doc.setFontSize(10);
    doc.text('Observaciones', 14, doc.lastAutoTable.finalY + 12);
    doc.setFontSize(9);
    doc.setTextColor(72, 84, 78);
    doc.text(doc.splitTextToSize(observations, 182), 14, doc.lastAutoTable.finalY + 18);
    doc.setTextColor(28, 45, 38);
  }

  const signatureY = 224;
  doc.setDrawColor(208, 216, 212);
  doc.roundedRect(14, signatureY, 82, 30, 2, 2);
  doc.roundedRect(114, signatureY, 82, 30, 2, 2);
  doc.setFontSize(9);
  doc.text('Firma del responsable', 18, signatureY + 8);
  doc.text('Firma / sello de la entidad', 118, signatureY + 8);

  doc.setFontSize(8);
  doc.setTextColor(91, 105, 98);
  doc.text(doc.splitTextToSize('Este certificado acredita la donación registrada por la Asociación Pan y Esperanza en su sistema interno de gestión. El documento se emite con fines justificativos e informativos para el donante y para las entidades que proceda.', 180), 14, 270);
  doc.save(`Certificado-donacion-${safePdfFilename(certificateNumber)}.pdf`);
}

export async function printDonorProfilePdf(profile, organization = {}) {
  const doc = new jsPDF();
  const orgName = organization.name || 'Asociación Pan y Esperanza';
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.setTextColor(28, 45, 38);
  doc.text('Expediente del Donante', 52, 20);
  doc.setFontSize(10);
  doc.setTextColor(91, 105, 98);
  doc.text(`${orgName} · Emitido el ${formatDate(new Date().toISOString())}`, 52, 28);

  autoTable(doc, {
    startY: 40,
    body: [
      ['Nombre', profile.name],
      ['Tipo', profile.kind || '-'],
      ['Persona de contacto', profile.contactPerson || '-'],
      ['Documento', profile.documentId || '-'],
      ['Teléfono', profile.phone || '-'],
      ['Email', profile.email || '-'],
      ['Dirección', profile.address || '-'],
      ['Estado', profile.archived ? 'Archivado' : 'Activo']
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } }
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Indicador', 'Valor']],
    body: [
      ['Número total de donaciones', profile.totalDonations || 0],
      ['Dinero donado', formatMoney(profile.moneyDonated)],
      ['Valor social donado', formatMoney(profile.socialDonated)],
      ['Primera donación', formatDate(profile.firstDonation)],
      ['Última donación', formatDate(profile.lastDonation)]
    ],
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 9 }
  });

  appendDonorHistoryTable(doc, profile, doc.lastAutoTable.finalY + 10, 'Historial de donaciones');
  appendSimplePdfSection(doc, 'Certificados', profile.donations.filter((item) => item.rawDonation).map((item) => `${formatDate(item.date)} · ${item.concept} · ${extractDonationReference(item.rawDonation?.notes) || item.rawDonation?.reference || 'Certificado'}`));
  appendSimplePdfSection(doc, 'Comunicaciones', profile.communications.map((item) => `${formatDateTime(item.sent_at || item.created_at)} · ${item.subject || 'Comunicación'} · ${item.status || item.result || '-'}`));
  appendSimplePdfSection(doc, 'Observaciones', [profile.observations || 'No hay observaciones generales registradas.']);
  doc.save(`Expediente-donante-${safePdfFilename(profile.name)}.pdf`);
}

export async function printDonorHistoryPdf(profile, organization = {}) {
  const doc = new jsPDF();
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.setTextColor(28, 45, 38);
  doc.text('Historial de Donaciones', 52, 20);
  doc.setFontSize(10);
  doc.setTextColor(91, 105, 98);
  doc.text(`${profile.name} · ${organization.name || 'Asociación Pan y Esperanza'} · ${formatDate(new Date().toISOString())}`, 52, 28);
  appendDonorHistoryTable(doc, profile, 42, 'Historial cronológico');
  doc.save(`Historial-donaciones-${safePdfFilename(profile.name)}.pdf`);
}

export async function createPortalAccessPdf({
  portalLabel = 'Portal privado',
  name = '',
  code = '',
  identifier = '',
  email = '',
  accessUrl = '',
  temporaryPin = '',
  organization = {}
} = {}) {
  const doc = new jsPDF();
  const orgName = organization.name || 'Asociacion Pan y Esperanza';
  const issuedAt = new Date().toISOString();
  const accessRows = [
    ['Nombre', name || '-'],
    ['Codigo', code || '-'],
    ['Portal', portalLabel],
    ['URL de acceso', accessUrl || '-']
  ];
  if (identifier) accessRows.push(['Identificador privado', identifier]);
  if (email) accessRows.push(['Email de acceso', email]);
  accessRows.push(['PIN', temporaryPin || 'No se muestra porque ya fue cambiado o no se ha generado en esta accion.']);

  doc.setFillColor(246, 249, 246);
  doc.rect(0, 0, 210, 46, 'F');
  await addOfficialLogo(doc, 14, 11, 34, 18);
  doc.setFontSize(10);
  doc.setTextColor(80, 95, 88);
  doc.text(orgName, 52, 17);
  doc.setFontSize(18);
  doc.setTextColor(28, 45, 38);
  doc.text('Datos de acceso', 52, 28);
  doc.setFontSize(9);
  doc.setTextColor(91, 105, 98);
  doc.text(`Emitido el ${formatDateTime(issuedAt)}`, 52, 35);

  autoTable(doc, {
    startY: 58,
    body: accessRows,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3, textColor: [23, 33, 27] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48, textColor: [36, 126, 80] }, 1: { cellWidth: 132 } },
    margin: { left: 14, right: 14 }
  });

  const instructionsY = doc.lastAutoTable.finalY + 14;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(28, 45, 38);
  doc.text('Instrucciones', 14, instructionsY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(72, 84, 78);
  const instructions = [
    '1. Accede a la URL indicada.',
    identifier ? '2. Introduce tu identificador privado y tu PIN.' : '2. Introduce tu email de acceso.',
    '3. Solicita el codigo OTP y escribe el codigo recibido.',
    '4. Si pierdes estos datos, contacta con Pan y Esperanza.'
  ];
  doc.text(doc.splitTextToSize(instructions.join('\n'), 180), 14, instructionsY + 8);

  doc.setFillColor(247, 250, 246);
  doc.roundedRect(14, 232, 182, 28, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setTextColor(91, 105, 98);
  doc.text(doc.splitTextToSize('Documento privado. No compartas tus datos de acceso. Pan y Esperanza nunca solicitara tu PIN completo por telefono o redes sociales.', 170), 20, 244);
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 272, 196, 272);
  doc.text('Asociacion Pan y Esperanza - Acceso privado', 14, 280);

  return {
    doc,
    filename: `Acceso-${safePdfFilename(portalLabel)}-${safePdfFilename(code || name || identifier || email || 'portal')}.pdf`
  };
}

export async function printPortalAccessPdf(payload = {}) {
  const { doc, filename } = await createPortalAccessPdf(payload);
  doc.save(filename);
  return { doc, filename };
}

export async function exportTreasuryPdf(data, indicators) {
  const doc = new jsPDF();
  await addOfficialLogo(doc, 14, 10, 34, 18);
  doc.setFontSize(16);
  doc.text('Informe de tesorería - Pan y Esperanza', 52, 20);
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
    head: [['Persona', 'Fecha', 'Concepto', 'Importe', 'Estado', 'Devolución']],
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
    { name: 'Préstamos', rows: data.treasury_loans || [] },
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

async function drawInstitutionalReportCover(doc, { orgName, beneficiary, family, familyStats, generatedAt, latestAttention, photo }) {
  doc.setFillColor(252, 253, 250);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(36, 126, 80);
  doc.rect(0, 0, 210, 7, 'F');
  await addOfficialLogo(doc, 24, 24, 34, 24);

  doc.setTextColor(23, 33, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(orgName, 105, 32, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(96, 112, 100);
  doc.text('Documento institucional de seguimiento social', 105, 40, { align: 'center' });

  doc.setDrawColor(186, 205, 193);
  doc.line(34, 60, 176, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(23, 33, 27);
  doc.text('INFORME DE ATENCIÓN SOCIAL', 105, 82, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Número de expediente: ${beneficiary.code || '-'}`, 105, 97, { align: 'center' });
  doc.text(`Fecha de emisión: ${formatDate(generatedAt)}`, 105, 105, { align: 'center' });

  const photoX = 138;
  const photoY = 124;
  doc.setDrawColor(168, 186, 176);
  doc.rect(photoX, photoY, 38, 48);
  if (photo?.dataUrl) {
    doc.addImage(photo.dataUrl, photo.format || 'JPEG', photoX + 1, photoY + 1, 36, 46);
  } else {
    doc.setFillColor(239, 246, 241);
    doc.rect(photoX + 1, photoY + 1, 36, 46, 'F');
    doc.setTextColor(36, 126, 80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(reportInitials(beneficiary.full_name), photoX + 19, photoY + 27, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(96, 112, 100);
  doc.text(photo?.dataUrl ? 'Fotografía del expediente' : 'Fotografía no disponible', photoX + 19, photoY + 54, { align: 'center' });

  doc.setTextColor(23, 33, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(beneficiary.full_name || 'Persona beneficiaria', 24, 136, { maxWidth: 100 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(45, 56, 49);
  doc.text(beneficiary.is_active ? 'Expediente activo' : 'Expediente inactivo', 24, 150);

  let y = 171;
  y = drawCoverDetail(doc, 'Unidad familiar', family ? `${family.family_code || '-'} · ${family.responsible_name || 'sin responsable registrado'}` : 'Sin unidad familiar vinculada', 24, y);
  y = drawCoverDetail(doc, 'Miembros', `${familyStats.total} miembro${familyStats.total === 1 ? '' : 's'} registrados`, 24, y);
  y = drawCoverDetail(doc, 'Menores', `${familyStats.minors} menor${familyStats.minors === 1 ? '' : 'es'} registrados`, 24, y);
  y = drawCoverDetail(doc, 'Fecha de alta', formatDate(beneficiary.joined_at), 24, y);
  drawCoverDetail(doc, 'Última intervención', latestAttention ? `${formatDate(latestAttention.date)} · ${latestAttention.type || 'Atención registrada'}` : 'Sin intervenciones registradas', 24, y);

  doc.setDrawColor(186, 205, 193);
  doc.line(34, 242, 176, 242);
  doc.setFontSize(8.5);
  doc.setTextColor(96, 112, 100);
  doc.text('Documento confidencial elaborado a partir de la información obrante en el expediente interno de la entidad.', 105, 252, { align: 'center', maxWidth: 150 });
  doc.setTextColor(23, 33, 27);
}

function drawCoverDetail(doc, label, value, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(96, 112, 100);
  doc.text(String(label || '').toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 27);
  doc.text(doc.splitTextToSize(String(value || '-'), 102).slice(0, 2), x, y + 6);
  return y + 18;
}

function drawInstitutionalPageHeader(doc, { orgName, beneficiary, generatedAt }) {
  doc.setFillColor(36, 126, 80);
  doc.rect(0, 0, 210, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(23, 33, 27);
  doc.text(orgName, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(96, 112, 100);
  doc.text(`Informe de Atención Social · Expediente ${beneficiary.code || '-'}`, 14, 22);
  doc.text(formatDate(generatedAt), 196, 16, { align: 'right' });
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 27, 196, 27);
  doc.setTextColor(23, 33, 27);
}

function drawInstitutionalSectionTitle(doc, title, y, context = null) {
  if (context) y = ensureInstitutionalSpace(doc, y, 16, context);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.2);
  doc.setTextColor(23, 33, 27);
  doc.text(title, 14, y);
  doc.setDrawColor(36, 126, 80);
  doc.line(14, y + 3.5, 63, y + 3.5);
  doc.setDrawColor(219, 229, 220);
  doc.line(64, y + 3.5, 196, y + 3.5);
  doc.setFont('helvetica', 'normal');
  return y + 12;
}

function drawIdentificationNarrative(doc, beneficiary, family, familyStats, y, context) {
  const referenceName = getFamilyReferenceName(beneficiary, family);
  return drawInstitutionalFacts(doc, [
    ['Nombre completo', beneficiary.full_name || '-'],
    ['Documento', beneficiary.document_id || '-'],
    ['Fecha de nacimiento', formatDate(beneficiary.birth_date)],
    ['Unidad familiar', family ? `${family.family_code || '-'} · ${family.responsible_name || 'sin responsable registrado'}` : 'Sin unidad familiar vinculada'],
    ['Persona de referencia', referenceName],
    ['Teléfono', beneficiary.phone || '-'],
    ['Dirección', [beneficiary.address_full || family?.address, beneficiary.postal_code].filter(Boolean).join(' - ') || '-'],
    ['Composición registrada', `${familyStats.adults} adulto${familyStats.adults === 1 ? '' : 's'} y ${familyStats.minors} menor${familyStats.minors === 1 ? '' : 'es'}`],
    ['Fecha de alta', formatDate(beneficiary.joined_at)],
    ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo']
  ], y, context);
}

function drawInstitutionalFacts(doc, items, y, context) {
  const columns = 2;
  const gap = 10;
  const columnWidth = (182 - gap) / columns;
  let currentY = y;
  items.forEach((item, index) => {
    if (index % columns === 0) currentY = ensureInstitutionalSpace(doc, currentY, 16, context);
    const column = index % columns;
    const x = 14 + column * (columnWidth + gap);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(96, 112, 100);
    doc.text(String(item[0]).toUpperCase(), x, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.4);
    doc.setTextColor(23, 33, 27);
    doc.text(doc.splitTextToSize(String(item[1] || '-'), columnWidth).slice(0, 2), x, currentY + 5.7);
    if (column === columns - 1 || index === items.length - 1) currentY += 17;
  });
  return currentY + 2;
}

function drawReportParagraph(doc, text, y, options = {}) {
  const context = options.context || null;
  const x = options.x || 14;
  const width = options.width || 182;
  const lineHeight = options.lineHeight || (options.lead ? 6.2 : 5.8);
  const gap = options.gap ?? 5;
  const lines = doc.splitTextToSize(String(text || '-'), width);
  let index = 0;
  while (index < lines.length) {
    y = context ? ensureInstitutionalSpace(doc, y, lineHeight * 2, context) : y;
    const maxLines = Math.max(1, Math.floor((262 - y) / lineHeight));
    const chunk = lines.slice(index, index + maxLines);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(options.fontSize || (options.lead ? 10.4 : 10));
    doc.setTextColor(45, 56, 49);
    doc.text(chunk, x, y, { lineHeightFactor: 1.35 });
    y += chunk.length * lineHeight + gap;
    index += chunk.length;
  }
  doc.setTextColor(23, 33, 27);
  return y;
}

function drawInterventionChronology(doc, timeline, y, context) {
  if (!timeline.length) {
    return drawReportParagraph(doc, 'No constan intervenciones registradas en el expediente consultado.', y, { context });
  }

  let currentY = y;
  timeline.forEach((item) => {
    const narrativeLines = doc.splitTextToSize(buildInterventionStoryText(item), 142);
    const responsibleLines = doc.splitTextToSize(`Responsable: ${item.responsible || 'No registrado'}`, 126);
    const observationLines = item.observations ? doc.splitTextToSize(`Observaciones: ${item.observations}`, 126) : [];
    const itemHeight = Math.max(34, 16 + narrativeLines.length * 5.4 + responsibleLines.length * 5 + observationLines.length * 5);
    currentY = ensureInstitutionalSpace(doc, currentY, itemHeight + 6, context);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.2);
    doc.setTextColor(23, 33, 27);
    doc.text(formatDate(item.date), 14, currentY + 5);
    doc.setFontSize(9.4);
    doc.text(item.type || 'Atención registrada', 14, currentY + 13);

    let lineY = currentY + 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(45, 56, 49);
    doc.text(narrativeLines, 50, lineY, { lineHeightFactor: 1.32 });
    lineY += narrativeLines.length * 5.4 + 2;
    doc.text(responsibleLines, 50, lineY, { lineHeightFactor: 1.28 });
    lineY += responsibleLines.length * 5;
    if (observationLines.length) {
      doc.text(observationLines, 50, lineY, { lineHeightFactor: 1.28 });
    }

    doc.setDrawColor(226, 232, 228);
    doc.line(50, currentY + itemHeight, 196, currentY + itemHeight);
    currentY += itemHeight + 7;
  });
  doc.setTextColor(23, 33, 27);
  return currentY;
}

function drawMobilizedResources(doc, resources, y, context) {
  if (!resources.length) {
    return drawReportParagraph(doc, 'No constan recursos movilizados registrados en el historial de intervención consultado.', y, { context });
  }
  let currentY = y;
  resources.forEach((resource) => {
    currentY = ensureInstitutionalSpace(doc, currentY, 11, context);
    doc.setFillColor(36, 126, 80);
    doc.circle(17, currentY - 1.5, 1.4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45, 56, 49);
    doc.text(resource, 23, currentY);
    currentY += 9;
  });
  doc.setTextColor(23, 33, 27);
  return currentY + 2;
}

function drawReportObservations(doc, observations, y, context) {
  if (!observations.length) {
    return drawReportParagraph(doc, 'No constan observaciones adicionales registradas en el expediente consultado.', y, { context });
  }
  let currentY = y;
  observations.forEach((observation, index) => {
    currentY = drawReportParagraph(doc, `${index + 1}. ${observation}`, currentY, { context, gap: 3 });
  });
  return currentY;
}

function drawInstitutionalSignature(doc, responsible, generatedAt, y, context) {
  y = ensureInstitutionalSpace(doc, y, 68, context);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 27);
  doc.text('Responsable de la Asociación', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Nombre: ${responsible.name || 'Nombre y apellidos'}`, 14, y + 11);
  doc.text(`Cargo: ${responsible.position || 'Responsable de la Asociación'}`, 14, y + 20);
  doc.text(`Fecha: ${formatDate(generatedAt)}`, 14, y + 29);

  doc.setDrawColor(150, 164, 154);
  doc.line(14, y + 53, 82, y + 53);
  doc.setFontSize(8.5);
  doc.setTextColor(96, 112, 100);
  doc.text('Firma', 48, y + 59, { align: 'center' });
  doc.rect(128, y + 19, 50, 34);
  doc.text('Sello', 153, y + 59, { align: 'center' });
  doc.setTextColor(23, 33, 27);
}

function ensureInstitutionalSpace(doc, y, neededHeight, context) {
  if (y + neededHeight <= 262) return y;
  doc.addPage();
  if (context) drawInstitutionalPageHeader(doc, context);
  return 34;
}

function drawSocialAttentionFooter(doc) {
  const text = 'Este informe ha sido elaborado por la Asociación Pan y Esperanza con fines exclusivamente informativos. La información contenida procede del expediente interno de la entidad y refleja las actuaciones realizadas hasta la fecha de emisión. Documento confidencial.';
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 270, 196, 270);
  doc.setFontSize(7.4);
  doc.setTextColor(96, 112, 100);
  doc.text(doc.splitTextToSize(text, 154), 14, 276);
  doc.setTextColor(23, 33, 27);
}

function drawSocialAttentionFooterOnAllPages(doc) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawSocialAttentionFooter(doc);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 132, 124);
    doc.text(`Página ${page} de ${total}`, 196, 286, { align: 'right' });
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
  const historyRows = history
    .filter(isReportInterventionEntry)
    .map((item) => ({
      date: item.date || item.created_at,
      type: item.entry_type || 'Seguimiento',
      description: item.notes || 'Anotación de seguimiento registrada.',
      responsible: item.user_name || item.created_by_name || item.created_by || item.user || '',
      observations: ''
    }));
  return [...deliveryRows, ...historyRows]
    .filter((item) => item.date || item.description)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

function isReportObservationEntry(item) {
  return normalizeTextForReport(item?.entry_type) === 'observacion';
}

function isReportObjectiveEntry(item) {
  return normalizeTextForReport(item?.entry_type) === 'objetivo';
}

function isReportInterventionEntry(item) {
  return !isReportObservationEntry(item) && !isReportObjectiveEntry(item);
}

function getInitialSocialObservation(history = []) {
  const sorted = [...history].sort((a, b) => String(a.date || a.created_at || '').localeCompare(String(b.date || b.created_at || '')));
  return sorted.find((item) => {
    const type = normalizeTextForReport(item.entry_type);
    return type.includes('primera') || type.includes('inicial');
  }) || null;
}

function buildInstitutionalPresentationText(orgName) {
  return `El presente Informe de Atención Social resume la intervención realizada por ${orgName || 'la Asociación Pan y Esperanza'} con la persona beneficiaria identificada en este expediente. La información procede exclusivamente del expediente interno de la entidad y refleja las actuaciones registradas hasta la fecha de emisión.`;
}

function buildFamilyContextText(beneficiary, family, familyMembers = [], familyStats) {
  const parts = [];
  if (family) {
    parts.push(`La persona beneficiaria consta vinculada a la unidad familiar ${family.family_code || 'sin código registrado'}.`);
    parts.push(`Según la información registrada, la unidad familiar está compuesta por ${familyStats.total} miembro${familyStats.total === 1 ? '' : 's'}, de los cuales ${familyStats.minors} figura${familyStats.minors === 1 ? '' : 'n'} como menor${familyStats.minors === 1 ? '' : 'es'}.`);
    if (family.responsible_name) parts.push(`La persona de referencia familiar registrada es ${family.responsible_name}.`);
    if (family.status) parts.push(`La situación familiar registrada en el expediente es "${family.status}".`);
  } else {
    parts.push('No consta unidad familiar vinculada en el expediente.');
    parts.push(`La composición registrada para la persona beneficiaria indica ${familyStats.total} miembro${familyStats.total === 1 ? '' : 's'}, con ${familyStats.minors} menor${familyStats.minors === 1 ? '' : 'es'}.`);
  }
  if (familyMembers.length) {
    const members = familyMembers
      .map((member) => `${member.full_name || 'Miembro sin nombre'}${member.family_relationship ? ` (${member.family_relationship})` : ''}`)
      .join('; ');
    parts.push(`Constan como miembros de la unidad: ${members}.`);
  }
  if (beneficiary.situation) parts.push(`Situación individual registrada: "${beneficiary.situation}".`);
  if (family?.notes) parts.push(`Observación familiar registrada: ${family.notes}`);
  return parts.join(' ');
}

function buildAttentionReasonText(beneficiary, history = []) {
  const initialObservation = getInitialSocialObservation(history);
  const notes = uniqueReportValues([initialObservation?.notes, beneficiary.notes]);
  if (!notes.length) return 'No consta información suficiente para describir el motivo inicial de la atención.';
  return `El motivo de la atención se recoge a partir de las observaciones obrantes en el expediente. ${notes.join(' ')}`;
}

function buildSocialInterventionSummary(beneficiary, timeline) {
  const parts = [
    `${beneficiary.full_name || 'La persona beneficiaria'} figura en el expediente de la Asociación Pan y Esperanza${beneficiary.joined_at ? ` desde el ${formatDate(beneficiary.joined_at)}` : ''}.`
  ];
  if (timeline.length) {
    const helpTypes = uniqueReportValues(timeline.map((item) => item.type)).slice(0, 4).join(', ');
    const latest = getLatestSocialAttention(timeline);
    parts.push(`Desde entonces constan ${timeline.length} intervención${timeline.length === 1 ? '' : 'es'} registrada${timeline.length === 1 ? '' : 's'}${helpTypes ? ` relacionadas con: ${helpTypes}` : ''}.`);
    parts.push(getInterventionFrequencyText(timeline));
    if (latest) parts.push(`La última atención registrada corresponde a ${lowerFirst(latest.type || 'una actuación de seguimiento')} con fecha ${formatDate(latest.date)}.`);
  } else {
    parts.push('No constan intervenciones registradas en el historial consultado.');
  }
  return parts.join(' ');
}

function buildCurrentSituationText(beneficiary, timeline, latestAttention, objectives = []) {
  const parts = [];
  parts.push(beneficiary.is_active ? 'Actualmente la persona beneficiaria continúa en seguimiento por parte de la Asociación.' : 'Actualmente el expediente no consta como activo en los registros de la Asociación.');
  if (latestAttention) {
    parts.push(`La última ayuda o intervención registrada es ${lowerFirst(latestAttention.type || 'una atención de seguimiento')} con fecha ${formatDate(latestAttention.date)}.`);
  } else {
    parts.push('No consta una última intervención registrada en el historial consultado.');
  }
  parts.push(timeline.length > 1 ? 'El seguimiento presenta continuidad documental en el expediente.' : timeline.length === 1 ? 'Consta una intervención puntual registrada.' : 'No constan actuaciones de seguimiento registradas.');
  if (beneficiary.requested_help) parts.push(`Como necesidad o ayuda solicitada figura: ${beneficiary.requested_help}.`);
  if (beneficiary.situation) parts.push(`La situación registrada en el expediente es: ${beneficiary.situation}.`);
  if (objectives.length) parts.push(`El expediente recoge como objetivo de seguimiento: ${objectives[0]}${objectives.length > 1 ? ` Además constan otros ${objectives.length - 1} objetivo${objectives.length === 2 ? '' : 's'} registrados.` : ''}`);
  return parts.join(' ');
}

function buildMobilizedResources(timeline = []) {
  const resources = [];
  timeline.forEach((item) => {
    const source = `${item.type || ''} ${item.description || ''}`;
    const normalized = normalizeTextForReport(source);
    if (normalized.includes('alimento') || normalized.includes('comida')) {
      resources.push('Entrega de alimentos');
    } else if (normalized.includes('econom') || normalized.includes('ayuda monetaria')) {
      resources.push('Ayuda económica');
    } else if (normalized.includes('orientacion') || normalized.includes('informacion')) {
      resources.push('Información y orientación');
    } else if (normalized.includes('seguimiento')) {
      resources.push('Seguimiento registrado');
    } else if (item.type) {
      resources.push(item.type);
    }
  });
  return uniqueReportValues(resources).slice(0, 8);
}

function buildSocialAttentionConclusion(beneficiary, timeline) {
  if (!timeline.length) {
    return 'El expediente consultado identifica a la persona beneficiaria y recoge la información social disponible en la entidad, sin que consten intervenciones registradas en el historial consultado.';
  }
  const followUpText = beneficiary.is_active
    ? 'El expediente permanece abierto para su seguimiento por parte de la Asociación.'
    : 'El expediente no consta actualmente como activo en los registros consultados.';
  return `El expediente refleja una intervención de apoyo y seguimiento realizada por la Asociación Pan y Esperanza, documentada mediante las actuaciones registradas en la historia de intervención. ${followUpText} Este informe tiene carácter informativo y resume la información obrante en el expediente a la fecha de emisión.`;
}

function buildEntityAssessmentText(beneficiary, timeline, objectives = []) {
  const parts = [];
  if (beneficiary.is_active) {
    parts.push('Con la información obrante en el expediente, la Asociación considera conveniente mantener el seguimiento de la persona beneficiaria.');
  } else {
    parts.push('Con la información obrante en el expediente, la persona beneficiaria no consta actualmente como expediente activo.');
  }
  if (timeline.length) {
    parts.push(`La valoración institucional se basa en las ${timeline.length} actuación${timeline.length === 1 ? '' : 'es'} registrada${timeline.length === 1 ? '' : 's'} en el sistema de la entidad.`);
  }
  if (objectives.length) {
    parts.push('También se tienen en cuenta los objetivos de seguimiento definidos dentro del expediente social.');
  }
  parts.push('Esta valoración tiene carácter institucional e informativo y no constituye diagnóstico profesional ni valoración clínica.');
  return parts.join(' ');
}

function buildInterventionStoryText(item) {
  const type = item.type || 'atención registrada';
  const parts = [`Se registra una intervención de tipo ${lowerFirst(type)} en el expediente.`];
  if (item.description && normalizeTextForReport(item.description) !== normalizeTextForReport('Atención registrada por la entidad.')) {
    parts.push(`La descripción registrada indica: ${item.description}.`);
  }
  return parts.join(' ');
}

function getInterventionFrequencyText(timeline = []) {
  if (timeline.length <= 1) return 'La frecuencia de atención se determina a partir de la actuación registrada por la entidad.';
  const dates = timeline
    .map((item) => new Date(item.date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length < 2) return 'La frecuencia de atención se determina a partir de las actuaciones registradas por la entidad.';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const days = Math.max(1, Math.round((last.getTime() - first.getTime()) / 86400000));
  if (days <= 45) return `Las actuaciones registradas se concentran en un periodo de ${days} día${days === 1 ? '' : 's'}.`;
  return `Las actuaciones registradas se distribuyen entre el ${formatDate(first.toISOString())} y el ${formatDate(last.toISOString())}.`;
}

function getLatestSocialAttention(timeline = []) {
  return [...timeline].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
}

function getReportObservations(beneficiary, family, timeline = [], history = []) {
  return uniqueReportValues([
    beneficiary.notes,
    family?.notes,
    ...timeline.map((item) => item.observations),
    ...history.filter(isReportObservationEntry).map((item) => item.notes)
  ]);
}

function getReportObjectives(history = []) {
  return uniqueReportValues(history.filter(isReportObjectiveEntry).map((item) => item.notes));
}

function getFamilyReferenceName(beneficiary, family) {
  if (family?.responsible_name) return family.responsible_name;
  if (beneficiary.family_relationship && normalizeTextForReport(beneficiary.family_relationship).includes('responsable')) {
    return beneficiary.full_name || '-';
  }
  return 'No registrada';
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
  const rawPosition = String(user?.position || user?.role || 'Responsable de la Asociación').trim();
  const normalized = normalizeTextForReport(rawPosition);
  const compactPosition = normalized.replace(/\s+/g, '');
  const position = compactPosition.includes('trabajadorsocial') || compactPosition.includes('trabajadorasocial')
    ? 'Responsable de la Asociación'
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

function extractDonationReference(notes = '') {
  const match = String(notes || '').match(/\b[A-Z]{2,10}-\d{4}-\d{6}\b/i);
  return match?.[0]?.toUpperCase() || '';
}

function buildDonationProductRows(donation = {}, donationView = {}) {
  const product = donationView.product || donation.donation_type || donationView.concept || 'Donación monetaria';
  const quantity = donationView.quantity
    ? `${formatPlainQuantity(donationView.quantity)} ${donationView.unit || ''}`.trim()
    : donation.quantity
      ? `${formatPlainQuantity(donation.quantity)} ${donation.unit || ''}`.trim()
      : donationView.category === 'money'
        ? '1 aportación'
        : '-';
  const value = donationView.category === 'money'
    ? formatMoney(donationView.moneyAmount)
    : formatMoney(donation.estimated_value ?? donationView.socialAmount);
  return [[product, quantity, value]];
}

function appendDonorHistoryTable(doc, profile, startY, title) {
  const rows = (profile.donations || []).map((item) => [
    formatDate(item.date),
    item.category === 'money' ? 'Dinero' : 'En especie',
    item.concept || '-',
    item.product || '-',
    item.quantity ? `${formatPlainQuantity(item.quantity)} ${item.unit || ''}`.trim() : '-',
    formatMoney(item.category === 'money' ? item.moneyAmount : item.socialAmount),
    item.status || '-'
  ]);
  doc.setFontSize(11);
  doc.setTextColor(28, 45, 38);
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 5,
    head: [['Fecha', 'Tipo', 'Concepto', 'Producto', 'Cantidad', 'Valor', 'Estado']],
    body: rows.length ? rows : [['-', '-', 'No hay donaciones registradas.', '-', '-', '-', '-']],
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 8, cellPadding: 2 }
  });
}

function appendSimplePdfSection(doc, title, lines) {
  let y = doc.__donorSectionY || ((doc.lastAutoTable?.finalY || 36) + 12);
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(11);
  doc.setTextColor(28, 45, 38);
  doc.text(title, 14, y);
  doc.setFontSize(9);
  doc.setTextColor(72, 84, 78);
  const content = (lines || []).filter(Boolean);
  const text = content.length ? content.map((line) => `• ${line}`).join('\n') : '• Sin registros.';
  const wrapped = doc.splitTextToSize(text, 180);
  doc.text(wrapped, 14, y + 8);
  doc.__donorSectionY = y + 12 + (wrapped.length * 4.4);
}

function formatPlainQuantity(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function appointmentEndTime(startAt, durationText) {
  if (!startAt) return '-';
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return '-';
  const minutes = appointmentDurationMinutes(durationText);
  date.setMinutes(date.getMinutes() + minutes);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function appointmentDurationMinutes(value) {
  const text = String(value || '').toLowerCase();
  const number = Number((text.match(/\d+/) || [30])[0]);
  if (!Number.isFinite(number) || number <= 0) return 30;
  if (text.includes('hora')) return number * 60;
  return number;
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
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}
