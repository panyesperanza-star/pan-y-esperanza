import { Ban, CheckCircle2, Clock3, Download, IdCard, Printer, RefreshCw, ShieldOff } from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import frontMasterUrl from '../assets/official-credential-v2/front-master.png';
import backMasterUrl from '../assets/official-credential-v2/back-master.png';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier } from '../lib/credentials';
import { formatDate } from '../lib/formatters';
import { Button } from './Button';
import { Modal } from './Modal';
import './OfficialCredentialV2.css';

const KIND_LABELS = {
  beneficiary: 'Beneficiario',
  volunteer: 'Voluntario',
  collaborator: 'Colaborador',
  donor: 'Donante',
  user: 'Usuario ERP'
};

const KIND_CODES = {
  beneficiary: 'PYE-00000',
  volunteer: 'VOL-00000',
  collaborator: 'COL-00000',
  donor: 'DON-00000',
  user: 'USR-00000'
};

const PDF_WIDTH_MM = 110;
const PDF_HEIGHT_MM = 80;
const PDF_SIDES = ['front', 'back'];

export function OfficialCredentialButton({ kind, subject, actions = null, variant = 'secondary', className = '' }) {
  const [open, setOpen] = useState(false);
  const credential = useMemo(() => buildOfficialCredentialV2(kind, subject), [kind, subject]);

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <IdCard size={16} /> Generar credencial
      </Button>
      {open && (
        <Modal title="Credencial oficial" onClose={() => setOpen(false)} wide>
          <OfficialCredentialV2Preview credential={credential} actions={actions} />
        </Modal>
      )}
    </>
  );
}

function OfficialCredentialV2Preview({ credential, actions = null }) {
  const printAreaRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [localCredential, setLocalCredential] = useState(credential);
  const photoUrl = useCredentialPhotoUrl(localCredential);
  const qrDataUrl = useCredentialQr(localCredential);

  useEffect(() => {
    setLocalCredential(credential);
  }, [credential]);

  async function runCredentialAction(actionName, label, options = {}) {
    if (!actions?.manageOfficialCredential) {
      setError('La gestion de credenciales requiere Supabase actualizado.');
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
          expiresAt: updated.expires_at || current.expiresAt,
          qrVersion: updated.qr_version || current.qrVersion,
          credentialStatus: updated.status || current.credentialStatus,
          credentialStatusReason: updated.status_reason || '',
          status: statusLabelFromRegistry(updated.status) || current.status,
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
      console.error('[OfficialCredentialV2] No se pudo gestionar la credencial', actionError);
      setError(actionError?.message || 'No se ha podido gestionar la credencial.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function printCredential() {
    const printArea = printAreaRef.current;
    if (!printArea) return;
    setBusy(true);
    setError('');
    let printHost = null;
    try {
      await waitForAssets(printArea);
      printHost = createCredentialCloneHost(printArea, 'official-credential-v2-print-host');
      document.body.appendChild(printHost);
      document.body.classList.add('official-credential-v2-printing');
      await waitForAssets(printHost);
      await nextAnimationFrame();
      window.print();
      await actions?.manageOfficialCredential?.(localCredential, 'print', '');
      setNotice('Impresion registrada correctamente.');
    } catch (printError) {
      console.error('[OfficialCredentialV2] No se pudo preparar la impresion', printError);
      setError('No se ha podido preparar la impresion. Puedes descargar el PDF e imprimirlo.');
    } finally {
      document.body.classList.remove('official-credential-v2-printing');
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
      renderHost = createCredentialCloneHost(printArea, 'official-credential-v2-pdf-host');
      document.body.appendChild(renderHost);
      await waitForAssets(renderHost);
      await nextAnimationFrame();

      const pages = getCredentialPdfPages(renderHost);
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [PDF_WIDTH_MM, PDF_HEIGHT_MM],
        compress: true
      });

      for (let index = 0; index < pages.length; index += 1) {
        if (index > 0) pdf.addPage([PDF_WIDTH_MM, PDF_HEIGHT_MM], 'landscape');
        pdf.setPage(index + 1);
        const dataUrl = await renderElementToPng(pages[index]);
        pdf.addImage(dataUrl, 'PNG', 0, 0, PDF_WIDTH_MM, PDF_HEIGHT_MM, undefined, 'FAST');
      }

      if (pdf.getNumberOfPages() !== PDF_SIDES.length) {
        throw new Error(`El PDF debe tener ${PDF_SIDES.length} paginas y contiene ${pdf.getNumberOfPages()}.`);
      }

      pdf.save(`Credencial-${safeFilename(localCredential.code || localCredential.name)}.pdf`);
      await actions?.manageOfficialCredential?.(localCredential, 'download_pdf', '');
      setNotice('Descarga registrada correctamente.');
    } catch (downloadError) {
      console.error('[OfficialCredentialV2] No se pudo generar el PDF', downloadError);
      setError('No se ha podido descargar el PDF. Puedes imprimir la credencial desde la vista previa.');
    } finally {
      renderHost?.remove();
      setBusy(false);
    }
  }

  return (
    <div className="official-credential-v2-preview">
      <div className="official-credential-v2-toolbar">
        <div>
          <p className="text-sm font-bold text-ink">{localCredential.name}</p>
          <p className="text-xs font-semibold text-slate-500">{localCredential.typeLabel} - {localCredential.code}</p>
          <p className="text-xs font-semibold text-brand-700">ID: {localCredential.credentialUid || localCredential.credentialId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={printCredential} disabled={busy}>
            <Printer size={16} /> Imprimir
          </Button>
          <Button type="button" onClick={downloadCredentialPdf} disabled={busy}>
            <Download size={16} /> {busy ? 'Generando...' : 'Descargar PDF'}
          </Button>
        </div>
      </div>

      {error && <div className="official-credential-v2-alert" role="alert">{error}</div>}
      {notice && <div className="official-credential-v2-notice" role="status">{notice}</div>}

      <div className="official-credential-v2-management">
        <div>
          <p className="text-sm font-bold text-ink">Estado: {statusLabelFromRegistry(localCredential.credentialStatus) || localCredential.status}</p>
          <p className="mt-1 text-xs text-slate-500">
            Impresiones: {Number(localCredential.printCount || 0)} - QR v{Number(localCredential.qrVersion || 1)}
            {localCredential.expiresAt ? ` - Caduca: ${formatDate(localCredential.expiresAt)}` : ''}
          </p>
        </div>
        <div className="official-credential-v2-management__actions">
          <Button type="button" variant="secondary" onClick={() => runCredentialAction('replace', 'Sustituir credencial', { requireReason: true })} disabled={busy || localCredential.credentialStatus === 'revoked'}>
            <RefreshCw size={16} /> Sustituir
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

      <div ref={printAreaRef}>
        <div className="official-credential-v2-pages" data-official-credential-v2-pages>
          <section className="official-credential-v2-page" data-official-credential-v2-page="front" aria-label="Anverso de la credencial">
            <OfficialCredentialV2Card side="front" credential={localCredential} photoUrl={photoUrl} qrDataUrl={qrDataUrl} />
          </section>
          <section className="official-credential-v2-page" data-official-credential-v2-page="back" aria-label="Reverso de la credencial">
            <OfficialCredentialV2Card side="back" credential={localCredential} photoUrl={photoUrl} qrDataUrl={qrDataUrl} />
          </section>
        </div>
      </div>

      <p className="official-credential-v2-note">
        El PDF genera dos paginas independientes: pagina 1 anverso y pagina 2 reverso, preparadas para A7 de 110 x 80 mm.
      </p>

      <CredentialHistoryV2 history={localCredential.credentialHistory} currentCredentialUid={localCredential.credentialUid || localCredential.credentialId} />
    </div>
  );
}

function OfficialCredentialV2Card({ side, credential, photoUrl, qrDataUrl }) {
  const type = credentialTypeParts(credential.roleLabel || credential.accreditationLabel || credential.typeLabel);
  if (side === 'back') {
    const replaceBackType = type.full !== 'VOLUNTARIO ACREDITADO';
    return (
      <article className="official-credential-v2-card official-credential-v2-card--back" data-official-credential-v2-card="back">
        <img className="official-credential-v2-template" src={backMasterUrl} alt="Reverso oficial de la credencial" />
        {replaceBackType && <div className="official-credential-v2-back-type-mask" aria-hidden="true" />}
        {replaceBackType && (
          <div className="official-credential-v2-back-type" aria-label={type.full}>
            <span>{type.main}</span>
            {type.accent && <strong>{type.accent}</strong>}
          </div>
        )}
      </article>
    );
  }

  const displayName = credentialDisplayName(credential.name);
  const formattedDate = formatDate(credential.issuedAt);
  const credentialUid = credential.credentialUid || credential.credentialId;
  const replaceType = type.full !== 'VOLUNTARIO ACREDITADO';
  const replaceName = displayName !== 'Amadilia';
  const replaceCode = credential.code !== 'VOL-24789' || credentialUid !== 'PE-2026-00024789';
  const replaceDate = formattedDate !== '28/07/2026';
  const replaceStatus = credential.status !== 'ACTIVO';

  return (
    <article className="official-credential-v2-card official-credential-v2-card--front" data-official-credential-v2-card="front">
      <img className="official-credential-v2-template" src={frontMasterUrl} alt="" aria-hidden="true" />

      {replaceType && <div className="official-credential-v2-mask official-credential-v2-mask--type" aria-hidden="true" />}
      {replaceName && <div className="official-credential-v2-mask official-credential-v2-mask--name" aria-hidden="true" />}
      {replaceCode && <div className="official-credential-v2-mask official-credential-v2-mask--code" aria-hidden="true" />}
      {replaceDate && <div className="official-credential-v2-mask official-credential-v2-mask--date" aria-hidden="true" />}
      {replaceStatus && <div className="official-credential-v2-mask official-credential-v2-mask--status" aria-hidden="true" />}

      {photoUrl ? (
        <img className="official-credential-v2-photo" src={photoUrl} alt={`Foto de ${credential.name}`} />
      ) : (
        <div className="official-credential-v2-photo official-credential-v2-photo--empty" aria-label="Sin fotografia">
          {initials(credential.name)}
        </div>
      )}

      {replaceType && (
        <div className="official-credential-v2-type" aria-label={type.full}>
          <span>{type.main}</span>
          {type.accent && <strong>{type.accent}</strong>}
        </div>
      )}

      {replaceName && (
        <div className="official-credential-v2-name" style={{ '--credential-name-size': credentialNameSize(displayName) }}>
          {displayName}
        </div>
      )}

      {replaceCode && (
        <>
          <strong className="official-credential-v2-code">{credential.code}</strong>
          <span className="official-credential-v2-id">ID: {credentialUid}</span>
        </>
      )}
      {replaceDate && <strong className="official-credential-v2-date">{formattedDate}</strong>}
      {replaceStatus && <strong className="official-credential-v2-status">{credential.status}</strong>}

      <div className="official-credential-v2-qr">
        {qrDataUrl ? <img src={qrDataUrl} alt="Codigo QR" /> : <span />}
      </div>
    </article>
  );
}

function CredentialHistoryV2({ history = {}, currentCredentialUid = '' }) {
  const credentials = Array.isArray(history?.credentials) ? history.credentials : [];
  const events = Array.isArray(history?.events) ? history.events : [];
  if (!credentials.length && !events.length) return null;

  return (
    <section className="official-credential-v2-history">
      <h3 className="text-sm font-bold text-ink">Historial de credenciales</h3>
      <p className="text-xs text-slate-500">Visible solo para usuarios autorizados del ERP.</p>

      {credentials.length > 0 && (
        <div className="official-credential-v2-history__list">
          {credentials.slice(0, 6).map((item) => (
            <div key={item.credential_uid} className="official-credential-v2-history__item">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-slate-900">{item.credential_uid}</strong>
                <span className="font-bold uppercase text-brand-700">
                  {item.credential_uid === currentCredentialUid ? 'Actual - ' : ''}{statusLabelFromRegistry(item.status) || item.status || 'ACTIVA'}
                </span>
              </div>
              <p className="mt-1">
                Emision: {formatDate(item.issued_at || item.created_at)}
                {item.revoked_at ? ` - Revocacion: ${formatDate(item.revoked_at)}` : ''}
              </p>
              {item.status_reason && <p className="mt-1">Motivo: {item.status_reason}</p>}
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="official-credential-v2-history__list">
          {events.slice(0, 6).map((event) => (
            <p key={event.id || `${event.credential_uid}-${event.event_type}-${event.created_at}`} className="text-xs text-slate-600">
              <strong>{formatDate(event.created_at)}</strong> - {credentialEventLabel(event.event_type)}
              {event.actor_name ? ` - ${event.actor_name}` : ''}
              {event.reason ? ` - ${event.reason}` : ''}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function buildOfficialCredentialV2(kind, subject = {}) {
  const normalizedKind = KIND_LABELS[kind] ? kind : 'beneficiary';
  const name = credentialName(normalizedKind, subject);
  const code = credentialCode(normalizedKind, subject);
  const subjectId = cleanText(subject.id || code);
  const storedCredentialUid = cleanText(subject.credential_uid || subject.official_credential_id || subject.credential_id);
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

function useCredentialQr(credential) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(credentialVerificationUrl(credential), { margin: 1, width: 480, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch((error) => {
        console.error('[OfficialCredentialV2] No se pudo generar QR', error);
        if (active) setQrDataUrl('');
      });
    return () => { active = false; };
  }, [credential.credentialId, credential.qrVersion]);
  return qrDataUrl;
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
      } catch (photoError) {
        console.error('[OfficialCredentialV2] No se pudo resolver la foto vigente del expediente', photoError);
        if (active) setPhotoUrl('');
      }
    }
    resolvePhoto();
    return () => { active = false; };
  }, [credential.kind, credential.photoKey, credential.photoVersion]);
  return photoUrl;
}

function getCredentialPdfPages(printArea) {
  const pages = PDF_SIDES.map((side) => printArea.querySelector(`[data-official-credential-v2-page="${side}"]`));
  if (pages.some((page) => !page)) {
    throw new Error('No se han encontrado exactamente el anverso y el reverso de la credencial.');
  }
  return pages;
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
    KIND_CODES[kind]
  );
}

function credentialAccreditationLabel(kind, subject = {}) {
  if (kind === 'user') return cleanText(subject.position || subject.cargo || subject.title || 'Usuario ERP');
  if (kind === 'volunteer') return 'Voluntario acreditado';
  if (kind === 'collaborator') return 'Colaborador acreditado';
  if (kind === 'donor') return 'Donante acreditado';
  return 'Beneficiario acreditado';
}

function credentialRoleLabel(kind, subject = {}) {
  return cleanText(subject.credential_role || subject.role_label || subject.position || subject.cargo || subject.title || credentialAccreditationLabel(kind, subject));
}

function credentialPhotoUrl(subject = {}) {
  return cleanText(subject.photo_data_url || subject.photo_url || subject.avatar_url || subject.profile_photo || '');
}

function credentialPhotoSource(subject = {}) {
  return {
    photo_data_url: subject.photo_data_url,
    photo_url: subject.photo_url,
    photo: subject.photo,
    avatar_url: subject.avatar_url,
    profile_photo: subject.profile_photo
  };
}

function credentialPhotoKey(subject = {}) {
  return [
    subject.photo_url,
    subject.photo,
    subject.avatar_url,
    subject.profile_photo,
    subject.photo_data_url
  ].map(cleanText).join('|');
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
  if (event === 'print' || event === 'reprint') return 'Impresion registrada';
  if (event === 'download_pdf') return 'PDF descargado';
  if (event === 'validated_public') return 'Validacion publica';
  if (event === 'validation_rejected') return 'Validacion rechazada';
  return value || 'Accion registrada';
}

function credentialDisplayName(value) {
  const parts = cleanText(value).split(/\s+/).filter(Boolean);
  return parts[0] || cleanText(value) || 'Persona';
}

function credentialNameSize(value) {
  const length = cleanText(value).length;
  if (length > 18) return '6.0cqw';
  if (length > 14) return '6.7cqw';
  if (length > 10) return '7.4cqw';
  return '8.25cqw';
}

function credentialTypeParts(value) {
  const full = cleanText(value).toUpperCase();
  if (!full) return { full: 'CREDENCIAL', main: 'CREDENCIAL', accent: '' };
  if (full.includes(' ACREDITADO')) {
    return { full, main: full.replace(/\s+ACREDITADO.*/, ''), accent: 'ACREDITADO' };
  }
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { full, main: words[0] || full, accent: '' };
  return { full, main: words.slice(0, -1).join(' '), accent: words.at(-1) };
}

function initials(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PE';
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
  const pages = printArea.querySelector('[data-official-credential-v2-pages]');
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
