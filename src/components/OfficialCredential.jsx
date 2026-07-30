import { Ban, CheckCircle2, Clock3, Download, IdCard, Printer, RefreshCw, ShieldOff } from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier } from '../lib/credentials';
import { formatDate } from '../lib/formatters';
import { Button } from './Button';
import { Modal } from './Modal';
import credentialBackUrl from '../assets/credential-back-pan-y-esperanza.png';
import credentialHologramUrl from '../assets/credential-master-hologram.png';
import credentialLogoUrl from '../assets/credential-master-logo.png';
import './OfficialCredential.css';

const KIND_LABELS = {
  beneficiary: 'Beneficiario',
  volunteer: 'Voluntario',
  collaborator: 'Colaborador',
  donor: 'Donante',
  user: 'Usuario del ERP'
};

const KIND_FALLBACK_CODES = {
  beneficiary: 'PYE-00000',
  volunteer: 'VOL-00000',
  collaborator: 'COL-00000',
  donor: 'DON-00000',
  user: 'USR-00000'
};

const CREDENTIAL_PDF_WIDTH_MM = 110;
const CREDENTIAL_PDF_HEIGHT_MM = 85;
const CREDENTIAL_PDF_SIDES = ['front', 'back'];

export function OfficialCredentialButton({ kind, subject, actions = null, variant = 'secondary', className = '' }) {
  const [open, setOpen] = useState(false);
  const credential = useMemo(() => buildOfficialCredential(kind, subject), [kind, subject]);

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <IdCard size={16} /> Generar credencial
      </Button>
      {open && (
        <Modal title="Credencial oficial" onClose={() => setOpen(false)} wide>
          <OfficialCredentialPreview credential={credential} actions={actions} />
        </Modal>
      )}
    </>
  );
}

function OfficialCredentialPreview({ credential, actions = null }) {
  const printAreaRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [localCredential, setLocalCredential] = useState(credential);
  const qrDataUrl = useCredentialQr(localCredential);

  useEffect(() => {
    setLocalCredential(credential);
  }, [credential]);

  async function runCredentialAction(actionName, label, options = {}) {
    if (!actions?.manageOfficialCredential) {
      setError('La gestión de credenciales requiere Supabase actualizado.');
      return null;
    }
    const reason = options.requireReason ? window.prompt(`Motivo para ${label.toLowerCase()}:`) : '';
    if (reason === null) return null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await actions.manageOfficialCredential(localCredential, actionName, reason || '');
      if (updated) {
        setLocalCredential((current) => ({
          ...current,
          credentialUid: updated.credential_uid || current.credentialUid,
          credentialId: updated.credential_uid || current.credentialId,
          issuedAt: updated.issued_at || current.issuedAt,
          credentialStatus: updated.status || current.credentialStatus,
          status: statusLabelFromRegistry(updated.status) || current.status,
          credentialStatusReason: updated.status_reason || '',
          expiresAt: updated.expires_at || current.expiresAt,
          qrVersion: updated.qr_version || current.qrVersion,
          printCount: updated.print_count ?? current.printCount,
          lastPrintedAt: updated.last_printed_at || current.lastPrintedAt,
          lastValidatedAt: updated.last_validated_at || current.lastValidatedAt,
          replacesCredentialUid: updated.replaces_credential_uid || current.replacesCredentialUid,
          replacedByCredentialUid: updated.replaced_by_credential_uid || current.replacedByCredentialUid
        }));
      }
      setNotice(`${label} registrado correctamente.`);
      return updated;
    } catch (actionError) {
      console.error('[OfficialCredential] No se pudo gestionar la credencial', actionError);
      setError(actionError?.message || 'No se ha podido gestionar la credencial.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function printCredential() {
    const printArea = printAreaRef.current;
    if (!printArea) return;
    setError('');
    setBusy(true);
    let printHost = null;
    try {
      await waitForAssets(printArea);
      printHost = createCredentialCloneHost(printArea, 'official-credential-print-host');
      document.body.appendChild(printHost);
      document.body.classList.add('official-credential-printing');
      await waitForAssets(printHost);
      await nextAnimationFrame();
      window.print();
      await actions?.manageOfficialCredential?.(localCredential, 'print', '');
      setNotice('Impresión registrada correctamente.');
    } catch (printError) {
      console.error('[OfficialCredential] No se pudo preparar la impresión', printError);
      setError('No se ha podido preparar la impresión. Puedes descargar el PDF e imprimirlo.');
    } finally {
      document.body.classList.remove('official-credential-printing');
      printHost?.remove();
      setBusy(false);
    }
  }

  async function downloadCredentialPdf() {
    const printArea = printAreaRef.current;
    if (!printArea) return;
    setBusy(true);
    setError('');
    let renderHost = null;
    try {
      await waitForAssets(printArea);
      renderHost = createCredentialCloneHost(printArea, 'official-credential-pdf-host');
      document.body.appendChild(renderHost);
      await waitForAssets(renderHost);
      await nextAnimationFrame();
      const pages = getCredentialPdfPages(renderHost);
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [CREDENTIAL_PDF_WIDTH_MM, CREDENTIAL_PDF_HEIGHT_MM],
        compress: true
      });
      for (let index = 0; index < pages.length; index += 1) {
        if (index > 0) pdf.addPage([CREDENTIAL_PDF_WIDTH_MM, CREDENTIAL_PDF_HEIGHT_MM], 'landscape');
        pdf.setPage(index + 1);
        const dataUrl = await renderElementToPng(pages[index]);
        pdf.addImage(dataUrl, 'PNG', 0, 0, CREDENTIAL_PDF_WIDTH_MM, CREDENTIAL_PDF_HEIGHT_MM);
      }
      if (pdf.getNumberOfPages() !== CREDENTIAL_PDF_SIDES.length) {
        throw new Error(`El PDF debe tener ${CREDENTIAL_PDF_SIDES.length} páginas y contiene ${pdf.getNumberOfPages()}.`);
      }
      pdf.save(`Credencial-${safeFilename(localCredential.code || localCredential.name)}.pdf`);
      await actions?.manageOfficialCredential?.(localCredential, 'download_pdf', '');
      setNotice('Descarga registrada correctamente.');
    } catch (downloadError) {
      console.error('[OfficialCredential] No se pudo generar el PDF', downloadError);
      setError('No se ha podido descargar el PDF. Puedes imprimir la credencial desde la vista previa.');
    } finally {
      renderHost?.remove();
      setBusy(false);
    }
  }

  return (
    <div className="official-credential-preview">
      <div className="official-credential-preview-actions">
        <div>
          <p className="text-sm font-bold text-ink">{localCredential.name}</p>
          <p className="text-xs font-semibold text-slate-500">{localCredential.typeLabel} · {localCredential.code}</p>
          <p className="text-xs font-semibold text-brand-700">ID: {localCredential.credentialUid || localCredential.credentialId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={printCredential} disabled={busy}>
            <Printer size={16} /> Reimprimir
          </Button>
          <Button type="button" onClick={downloadCredentialPdf} disabled={busy}>
            <Download size={16} /> {busy ? 'Generando...' : 'Descargar PDF'}
          </Button>
        </div>
      </div>

      {error && <div className="official-credential-error" role="alert">{error}</div>}
      {notice && <div className="mb-3 rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700" role="status">{notice}</div>}

      <div className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[1fr_auto]">
        <div>
          <p className="font-bold text-ink">Estado: {statusLabelFromRegistry(localCredential.credentialStatus) || localCredential.status}</p>
          <p className="mt-1 text-xs text-slate-500">
            Impresiones: {Number(localCredential.printCount || 0)} · QR v{Number(localCredential.qrVersion || 1)}
            {localCredential.expiresAt ? ` · Caduca: ${formatDate(localCredential.expiresAt)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => runCredentialAction('replace', 'Sustituir credencial', { requireReason: true })} disabled={busy || localCredential.credentialStatus === 'revoked'}>
            <RefreshCw size={16} /> Sustituir credencial
          </Button>
          <Button type="button" variant="secondary" onClick={() => runCredentialAction('suspend', 'Suspender', { requireReason: true })} disabled={busy}>
            <Ban size={16} /> Suspender
          </Button>
          <Button type="button" variant="secondary" onClick={() => runCredentialAction('reactivate', 'Reactivar')} disabled={busy}>
            <CheckCircle2 size={16} /> Reactivar
          </Button>
          <Button type="button" variant="secondary" onClick={() => runCredentialAction('expire', 'Caducar', { requireReason: true })} disabled={busy}>
            <Clock3 size={16} /> Caducar
          </Button>
          <Button type="button" variant="danger" onClick={() => runCredentialAction('revoke', 'Revocar', { requireReason: true })} disabled={busy}>
            <ShieldOff size={16} /> Revocar
          </Button>
        </div>
      </div>

      <div className="official-credential-print-area" ref={printAreaRef}>
        <div className="official-credential-pages">
          <section className="official-credential-page" data-credential-side="front" aria-label="Anverso de la credencial">
            <CredentialFront credential={localCredential} qrDataUrl={qrDataUrl} />
          </section>
          <section className="official-credential-page" data-credential-side="back" aria-label="Reverso de la credencial">
            <img className="official-credential-back-image" src={credentialBackUrl} alt="Reverso de la credencial" />
          </section>
        </div>
      </div>

      <p className="official-credential-preview-note">
        El PDF genera dos páginas independientes: página 1 anverso y página 2 reverso, preparadas para funda A7 de 110 x 85 mm.
      </p>

      <CredentialHistory history={localCredential.credentialHistory} currentCredentialUid={localCredential.credentialUid || localCredential.credentialId} />
    </div>
  );
}

function CredentialHistory({ history = {}, currentCredentialUid = '' }) {
  const credentials = Array.isArray(history.credentials) ? history.credentials : [];
  const events = Array.isArray(history.events) ? history.events : [];
  if (!credentials.length && !events.length) return null;

  return (
    <section className="mt-4 rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Historial de credenciales</h3>
          <p className="text-xs text-slate-500">Visible solo para usuarios autorizados del ERP.</p>
        </div>
      </div>

      {credentials.length > 0 && (
        <div className="mt-3 grid gap-2">
          {credentials.slice(0, 6).map((item) => (
            <div key={item.credential_uid} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-slate-900">{item.credential_uid}</strong>
                <span className="font-bold uppercase text-brand-700">
                  {item.credential_uid === currentCredentialUid ? 'Actual · ' : ''}{statusLabelFromRegistry(item.status) || item.status || 'ACTIVA'}
                </span>
              </div>
              <p className="mt-1">
                Emisión: {formatDate(item.issued_at || item.created_at)}
                {item.revoked_at ? ` · Revocación: ${formatDate(item.revoked_at)}` : ''}
              </p>
              {item.status_reason && <p className="mt-1">Motivo: {item.status_reason}</p>}
              {item.replaced_by_credential_uid && <p className="mt-1">Sustituida por: {item.replaced_by_credential_uid}</p>}
              {item.replaces_credential_uid && <p className="mt-1">Sustituye a: {item.replaces_credential_uid}</p>}
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">Últimas acciones</p>
          <div className="grid gap-1.5 text-xs text-slate-600">
            {events.slice(0, 6).map((event) => (
              <p key={event.id || `${event.credential_uid}-${event.event_type}-${event.created_at}`}>
                <strong>{formatDate(event.created_at)}</strong> · {credentialEventLabel(event.event_type)}
                {event.actor_name ? ` · ${event.actor_name}` : ''}
                {event.reason ? ` · ${event.reason}` : ''}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function getCredentialPdfPages(printArea) {
  const pages = CREDENTIAL_PDF_SIDES.map((side) => printArea.querySelector(`[data-credential-side="${side}"]`));
  if (pages.some((page) => !page)) {
    throw new Error('No se han encontrado exactamente el anverso y el reverso de la credencial.');
  }
  return pages;
}

function CredentialFront({ credential, qrDataUrl }) {
  const typeLines = credentialTypeLines(credential.roleLabel || credential.accreditationLabel || credential.kind);
  const nameLayout = credentialNameLayout(credential.name);

  return (
    <article className="official-credential-card" data-credential-kind={credential.kind}>
      <div className="official-credential-header">
        <img className="official-credential-logo" src={credentialLogoUrl} alt="Pan y Esperanza" />
        <div className="official-credential-brand-block">
          <div className="official-credential-brand">PAN Y ESPERANZA</div>
          <div className="official-credential-subtitle">JUNTOS LLEVAMOS <span>ESPERANZA.</span></div>
          <div className="official-credential-header-rule" aria-hidden="true">
            <span />
            <b>&hearts;</b>
            <span />
          </div>
        </div>
        <div className="official-credential-header-divider" aria-hidden="true" />
        <div className="official-credential-kind">
          <b>&#9825;</b>
          <span>{typeLines.main}</span>
          <strong>{typeLines.accent}</strong>
        </div>
        <div className="official-credential-leaves" aria-hidden="true" />
      </div>

      <CredentialPhoto credential={credential} />
      <div className={`official-credential-name ${nameLayout.className}`}>
        {nameLayout.lines.map((line) => <span key={line}>{line}</span>)}
      </div>
      <div className="official-credential-name-rule" aria-hidden="true">
        <span />
        <b>&hearts;</b>
        <span />
      </div>

      <div className="official-credential-details">
        <CredentialDetail icon="id" label="CÓDIGO" value={credential.code} subvalue={credential.credentialUid ? `ID: ${credential.credentialUid}` : ''} />
        <CredentialDetail icon="calendar" label="DESDE" value={formatDate(credential.issuedAt)} />
        <CredentialDetail icon="shield" label="ESTADO" value={credential.status} accent />
      </div>

      <div className="official-credential-qr-frame">
        {qrDataUrl ? <img className="official-credential-qr" src={qrDataUrl} alt="Código QR" /> : <div className="official-credential-qr-loading" />}
        <div className="official-credential-qr-label">
          <CredentialIcon type="shield" />
          <span>CREDENCIAL OFICIAL</span>
        </div>
      </div>

      <div className="official-credential-watermark" aria-hidden="true" />
      <div className="official-credential-footer">
        <div className="official-credential-footer-cell">
          <span className="official-credential-footer-icon"><CredentialIcon type="heart-shield" /></span>
          <p><strong>Documento oficial de Pan y Esperanza</strong><br />Personal e intransferible.</p>
        </div>
        <div className="official-credential-footer-cell">
          <span className="official-credential-footer-icon"><CredentialIcon type="id" /></span>
          <p><strong>Presentación obligatoria</strong><br />cuando sea requerida.</p>
        </div>
      </div>
      <img className="official-credential-hologram" src={credentialHologramUrl} alt="" aria-hidden="true" />
    </article>
  );
}

function CredentialFrontLegacy({ credential, qrDataUrl }) {
  const nameParts = splitCredentialName(credential.name);
  const nameTone = credential.name.length > 29 ? 'official-credential-name--compact' : credential.name.length > 21 ? 'official-credential-name--narrow' : '';
  return (
    <article className="official-credential-card">
      <div className="official-credential-header">
        <div className="official-credential-header-arc" aria-hidden="true" />
        <div className="official-credential-header-heart" aria-hidden="true">&#9825;</div>
      </div>
      <img className="official-credential-logo" src={credentialLogoUrl} alt="Pan y Esperanza" />
      <div className="official-credential-brand">Pan y Esperanza</div>
      <div className="official-credential-subtitle">Juntos llevamos esperanza</div>
      <CredentialPhoto credential={credential} />
      <div className={`official-credential-name ${nameTone}`}>
        <span>{nameParts.first}</span>
        {nameParts.rest && <span>{nameParts.rest}</span>}
      </div>
      <div className="official-credential-role">{credential.accreditationLabel}</div>
      <div className="official-credential-details">
        <CredentialDetail icon="id" label="Código:" value={credential.code} />
        <CredentialDetail icon="calendar" label="Desde:" value={formatDate(credential.issuedAt)} />
        <CredentialDetail icon="shield" label="Estado:" value={credential.status} accent />
      </div>
      <div className="official-credential-qr-frame">
        {qrDataUrl ? <img className="official-credential-qr" src={qrDataUrl} alt="Código QR" /> : <div className="official-credential-qr-loading" />}
      </div>
      <div className="official-credential-footer-line" />
      <div className="official-credential-footer-text">
        Credencial oficial de Pan y Esperanza.<br />
        Su uso es personal e intransferible.
      </div>
      <div className="official-credential-heart-wrap" aria-hidden="true">
        <span />
        <b>&hearts;</b>
        <span />
      </div>
    </article>
  );
}

function CredentialPhoto({ credential }) {
  const photoUrl = useCredentialPhotoUrl(credential);
  const [failedUrl, setFailedUrl] = useState('');

  useEffect(() => {
    setFailedUrl('');
  }, [photoUrl]);

  if (photoUrl && photoUrl !== failedUrl) {
    return (
      <img
        key={photoUrl}
        className="official-credential-photo"
        src={photoUrl}
        alt={`Foto de ${credential.name}`}
        onError={() => {
          console.error('[OfficialCredential] No se pudo cargar la foto del expediente', {
            kind: credential.kind,
            subjectId: credential.subjectId,
            photoSource: credential.photoSource
          });
          setFailedUrl(photoUrl);
        }}
      />
    );
  }
  return (
    <div className="official-credential-photo official-credential-photo--empty" aria-label="Sin fotografia">
      <span>{initials(credential.name)}</span>
    </div>
  );
}

function useCredentialPhotoUrl(credential) {
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    let active = true;

    async function resolvePhoto() {
      setPhotoUrl('');
      try {
        const source = credential.photoSource || {};
        const resolved = credential.kind === 'beneficiary'
          ? await resolveBeneficiaryPhotoUrl(source)
          : credentialPhotoUrl(source);
        if (active) setPhotoUrl(cacheProofPhotoUrl(resolved, credential.photoVersion));
      } catch (error) {
        console.error('[OfficialCredential] No se pudo resolver la foto vigente del expediente', error);
        if (active) setPhotoUrl('');
      }
    }

    resolvePhoto();
    return () => {
      active = false;
    };
  }, [credential.kind, credential.photoKey, credential.photoVersion]);

  return photoUrl;
}

function CredentialDetail({ icon, label, value, subvalue = '', accent = false }) {
  return (
    <div className={`official-credential-detail-row official-credential-detail-row--${icon}`}>
      <span className="official-credential-detail-icon">
        <CredentialIcon type={icon} />
      </span>
      <span className="official-credential-detail-label">{label}</span>
      <strong className={accent ? 'official-credential-state' : ''}>{value || '-'}</strong>
      {subvalue && <span className="official-credential-detail-subvalue">{subvalue}</span>}
    </div>
  );
}

function CredentialIcon({ type }) {
  if (type === 'heart-shield') {
    return (
      <svg className="official-credential-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M12 3 20 6v6c0 5-3.4 8.6-8 9-4.6-.4-8-4-8-9V6l8-3Z" />
        <path d="M8.5 10.5c0-1.1.8-1.9 1.9-1.9.7 0 1.3.3 1.6.9.3-.6.9-.9 1.6-.9 1.1 0 1.9.8 1.9 1.9 0 1.9-3.5 4.1-3.5 4.1s-3.5-2.2-3.5-4.1Z" />
      </svg>
    );
  }
  if (type === 'calendar') {
    return (
      <svg className="official-credential-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </svg>
    );
  }
  if (type === 'shield') {
    return (
      <svg className="official-credential-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M12 3 20 6v6c0 5-3.4 8.6-8 9-4.6-.4-8-4-8-9V6l8-3Z" />
        <path d="m8.8 12.1 2.1 2.1 4.4-4.5" />
      </svg>
    );
  }
  return (
    <svg className="official-credential-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M12 9h6M12 13h6M6 16h5" />
    </svg>
  );
}

function useCredentialQr(credential) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    let active = true;
    const payload = credentialVerificationUrl(credential);
    QRCode.toDataURL(payload, { margin: 1, width: 420, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch((error) => {
        console.error('[OfficialCredential] No se pudo generar QR', error);
        if (active) setQrDataUrl('');
      });
    return () => { active = false; };
  }, [credential.credentialId, credential.qrVersion]);
  return qrDataUrl;
}

function buildOfficialCredential(kind, subject = {}) {
  const normalizedKind = KIND_LABELS[kind] ? kind : 'beneficiary';
  const name = credentialName(normalizedKind, subject);
  const code = credentialCode(normalizedKind, subject);
  const subjectId = cleanText(subject.id || code);
  const storedCredentialUid = credentialStoredUid(subject);
  const legacyCredentialId = buildCredentialSecureIdentifier({ kind: normalizedKind, subjectId, code });
  return {
    kind: normalizedKind,
    typeLabel: KIND_LABELS[normalizedKind],
    accreditationLabel: credentialAccreditationLabel(normalizedKind, subject),
    roleLabel: credentialRoleLabel(normalizedKind, subject),
    name,
    code,
    subjectId,
    credentialUid: storedCredentialUid,
    credentialId: storedCredentialUid || legacyCredentialId,
    legacyCredentialId,
    issuedAt: subject.credential_issued_at || subject.joined_at || subject.created_at || subject.registered_at || subject.start_date || new Date().toISOString(),
    expiresAt: subject.credential_expires_at || subject.expires_at || null,
    qrVersion: subject.credential_qr_version || 1,
    credentialStatus: subject.credential_status || 'active',
    credentialStatusReason: subject.credential_status_reason || '',
    replacesCredentialUid: subject.credential_replaces_uid || null,
    replacedByCredentialUid: subject.credential_replaced_by_uid || null,
    credentialHistory: subject.credential_history || null,
    printCount: subject.credential_print_count || 0,
    lastPrintedAt: subject.credential_last_printed_at || null,
    lastValidatedAt: subject.credential_last_validated_at || null,
    status: statusLabel(subject),
    photoSource: credentialPhotoSource(subject),
    photoKey: credentialPhotoKey(subject),
    photoVersion: cleanText(subject.updated_at || subject.photo_updated_at || subject.created_at || subject.id || code)
  };
}

function credentialStoredUid(subject = {}) {
  return cleanText(subject.credential_uid || subject.official_credential_id || subject.credential_id);
}

function credentialVerificationUrl(credential = {}) {
  const credentialUid = cleanText(credential.credentialId || credential.credentialUid);
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://www.panyesperanza.org';
  const url = new URL(`/verificar-credencial/${encodeURIComponent(credentialUid)}`, origin);
  if (credential.qrVersion) url.searchParams.set('v', String(credential.qrVersion));
  return url.toString();
}

function credentialPhotoUrl(subject = {}) {
  return (
    subject.photo_data_url ||
    subject.photo_url ||
    subject.avatar_url ||
    subject.profile_photo ||
    subject.logo_data_url ||
    subject.logo_url ||
    ''
  );
}

function credentialPhotoSource(subject = {}) {
  return {
    photo_data_url: subject.photo_data_url,
    photo_url: subject.photo_url,
    photo: subject.photo,
    avatar_url: subject.avatar_url,
    profile_photo: subject.profile_photo,
    logo_data_url: subject.logo_data_url,
    logo_url: subject.logo_url
  };
}

function credentialPhotoKey(subject = {}) {
  return [
    subject.photo_url,
    subject.photo,
    subject.avatar_url,
    subject.profile_photo,
    subject.photo_data_url,
    subject.logo_data_url,
    subject.logo_url
  ].map(cleanText).join('|');
}

function credentialName(kind, subject = {}) {
  if (kind === 'user') {
    const fullName = [subject.first_name, subject.last_name].filter(Boolean).join(' ').trim();
    return cleanText(subject.full_name || fullName || subject.name || subject.email || KIND_LABELS.user);
  }
  return cleanText(subject.full_name || subject.name || subject.business_name || subject.company_name || subject.contact_name || subject.email || KIND_LABELS[kind]);
}

function credentialCode(kind, subject = {}) {
  return cleanText(
    subject.code ||
    subject.beneficiary_code ||
    subject.volunteer_code ||
    subject.collaborator_code ||
    subject.donor_code ||
    subject.user_code ||
    subject.employee_code ||
    KIND_FALLBACK_CODES[kind]
  );
}

function credentialAccreditationLabel(kind, subject = {}) {
  if (kind === 'user') {
    const position = cleanText(subject.position);
    return position || 'Usuario del ERP';
  }
  return `${KIND_LABELS[kind]} acreditado`;
}

function credentialRoleLabel(kind, subject = {}) {
  const explicit = cleanText(
    subject.credential_role ||
    subject.role_label ||
    subject.position ||
    subject.cargo ||
    subject.title
  );
  if (explicit) return explicit.toUpperCase();
  if (kind === 'volunteer') return 'VOLUNTARIO ACREDITADO';
  if (kind === 'collaborator') return 'COLABORADOR';
  if (kind === 'donor') return 'DONANTE';
  if (kind === 'user') return 'USUARIO DEL ERP';
  return 'BENEFICIARIO';
}

function credentialTypeLines(value) {
  const label = cleanText(value).toUpperCase();
  if (!label) return { main: 'CREDENCIAL', accent: 'OFICIAL' };
  if (label.includes(' ACREDITADO')) {
    return { main: label.replace(/\s+ACREDITADO.*/, ''), accent: 'ACREDITADO' };
  }
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { main: parts[0] || 'CREDENCIAL', accent: '' };
  return { main: parts.slice(0, -1).join(' '), accent: parts.at(-1) };
}

function credentialNameLayout(name) {
  const cleanName = cleanText(name);
  const displayName = cleanName.split(/\s+/).filter(Boolean)[0] || cleanName;
  const tone = credentialNameTone(displayName);
  return {
    lines: [displayName],
    className: tone
  };
}

function credentialNameTone(name) {
  const length = cleanText(name).length;
  if (length > 44) return 'official-credential-name--micro';
  if (length > 36) return 'official-credential-name--tiny';
  if (length > 29) return 'official-credential-name--compact';
  if (length > 20) return 'official-credential-name--narrow';
  return '';
}

function splitCredentialDisplayName(name) {
  const parts = cleanText(name).split(/\s+/).filter(Boolean);
  if (parts.length < 4) return [cleanText(name)];
  const surnameStart = Math.max(1, parts.length - 2);
  return [
    parts.slice(0, surnameStart).join(' '),
    parts.slice(surnameStart).join(' ')
  ];
}

function cacheProofPhotoUrl(url, version) {
  const cleanUrl = cleanText(url);
  if (!cleanUrl || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) return cleanUrl;
  const separator = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${separator}v=${encodeURIComponent(cleanText(version) || Date.now().toString())}`;
}

function statusLabel(subject = {}) {
  const registryStatus = statusLabelFromRegistry(subject.credential_status);
  if (registryStatus) return registryStatus;
  if (subject.status) return cleanText(subject.status).toUpperCase();
  if (subject.is_active === false) return 'INACTIVO';
  return 'ACTIVO';
}

function statusLabelFromRegistry(value) {
  const status = cleanText(value).toLowerCase();
  if (status === 'active') return 'ACTIVO';
  if (status === 'suspended') return 'SUSPENDIDA';
  if (status === 'revoked') return 'REVOCADA';
  if (status === 'expired') return 'CADUCADA';
  return '';
}

function credentialEventLabel(value) {
  const event = cleanText(value).toLowerCase();
  if (event === 'created') return 'Credencial emitida';
  if (event === 'replaced') return 'Credencial sustituida';
  if (event === 'revoke') return 'Credencial revocada';
  if (event === 'suspend') return 'Credencial suspendida';
  if (event === 'reactivate') return 'Credencial reactivada';
  if (event === 'expire') return 'Credencial caducada';
  if (event === 'print' || event === 'reprint') return 'Impresión registrada';
  if (event === 'download_pdf') return 'PDF descargado';
  if (event === 'validated_public') return 'Validación pública';
  if (event === 'validation_rejected') return 'Validación rechazada';
  return value || 'Acción registrada';
}

function splitCredentialName(name) {
  const parts = cleanText(name).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || 'Persona', rest: '' };
  return {
    first: parts[0],
    rest: parts.slice(1).join(' ')
  };
}

function initials(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PY';
}

function cleanText(value) {
  return String(value || '').trim();
}

async function waitForAssets(root) {
  if (document.fonts?.ready) await document.fonts.ready;
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }
    if (image.decode) await image.decode().catch(() => {});
  }));
}

function createCredentialCloneHost(printArea, className) {
  const pages = printArea.querySelector('.official-credential-pages');
  if (!pages) throw new Error('No se ha encontrado el area de credenciales para imprimir.');
  const host = document.createElement('div');
  host.className = className;
  host.setAttribute('aria-hidden', 'true');
  host.appendChild(pages.cloneNode(true));
  return host;
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function renderElementToPng(element) {
  const rect = element.getBoundingClientRect();
  const scale = 2.5;
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const clone = element.cloneNode(true);
  await inlineImages(element, clone);
  inlineComputedStyles(element, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function inlineComputedStyles(source, target) {
  const computed = window.getComputedStyle(source);
  const style = Array.from(computed)
    .map((property) => `${property}:${computed.getPropertyValue(property)};`)
    .join('');
  target.setAttribute('style', style);
  Array.from(source.children).forEach((child, index) => {
    if (target.children[index]) inlineComputedStyles(child, target.children[index]);
  });
}

async function inlineImages(source, target) {
  const sourceImages = Array.from(source.querySelectorAll('img'));
  const targetImages = Array.from(target.querySelectorAll('img'));
  await Promise.all(sourceImages.map(async (image, index) => {
    const targetImage = targetImages[index];
    if (!targetImage) return;
    const sourceUrl = image.currentSrc || image.src;
    if (!sourceUrl || sourceUrl.startsWith('data:')) return;
    try {
      targetImage.setAttribute('src', await imageToDataUrl(sourceUrl));
    } catch {
      targetImage.setAttribute('src', sourceUrl);
    }
  }));
}

async function imageToDataUrl(url) {
  const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function safeFilename(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'credencial';
}
