import { Download, IdCard, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier } from '../lib/credentials';
import { formatDate } from '../lib/formatters';
import { Button } from './Button';
import { Modal } from './Modal';
import credentialBackUrl from '../assets/credential-back-pan-y-esperanza.png';
import credentialLogoUrl from '../assets/credential-logo-pan-y-esperanza.jpeg';
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
const CREDENTIAL_PDF_HEIGHT_MM = 80;
const CREDENTIAL_PDF_SIDES = ['front', 'back'];

export function OfficialCredentialButton({ kind, subject, variant = 'secondary', className = '' }) {
  const [open, setOpen] = useState(false);
  const credential = useMemo(() => buildOfficialCredential(kind, subject), [kind, subject]);

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <IdCard size={16} /> Generar credencial
      </Button>
      {open && (
        <Modal title="Credencial oficial" onClose={() => setOpen(false)} wide>
          <OfficialCredentialPreview credential={credential} />
        </Modal>
      )}
    </>
  );
}

function OfficialCredentialPreview({ credential }) {
  const printAreaRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qrDataUrl = useCredentialQr(credential);

  function printCredential() {
    setError('');
    window.print();
  }

  async function downloadCredentialPdf() {
    const printArea = printAreaRef.current;
    if (!printArea) return;
    setBusy(true);
    setError('');
    try {
      await waitForAssets(printArea);
      const pages = getCredentialPdfPages(printArea);
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
        throw new Error(`El PDF debe tener ${CREDENTIAL_PDF_SIDES.length} paginas y contiene ${pdf.getNumberOfPages()}.`);
      }
      pdf.save(`Credencial-${safeFilename(credential.code || credential.name)}.pdf`);
    } catch (downloadError) {
      console.error('[OfficialCredential] No se pudo generar el PDF', downloadError);
      setError('No se ha podido descargar el PDF. Puedes imprimir la credencial desde la vista previa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="official-credential-preview">
      <div className="official-credential-preview-actions">
        <div>
          <p className="text-sm font-bold text-ink">{credential.name}</p>
          <p className="text-xs font-semibold text-slate-500">{credential.typeLabel} · {credential.code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={printCredential}>
            <Printer size={16} /> Imprimir
          </Button>
          <Button type="button" onClick={downloadCredentialPdf} disabled={busy}>
            <Download size={16} /> {busy ? 'Generando...' : 'Descargar PDF'}
          </Button>
        </div>
      </div>

      {error && <div className="official-credential-error" role="alert">{error}</div>}

      <div className="official-credential-print-area" ref={printAreaRef}>
        <div className="official-credential-pages">
          <section className="official-credential-page" data-credential-side="front" aria-label="Anverso de la credencial">
            <CredentialFront credential={credential} qrDataUrl={qrDataUrl} />
          </section>
          <section className="official-credential-page" data-credential-side="back" aria-label="Reverso de la credencial">
            <img className="official-credential-back-image" src={credentialBackUrl} alt="Reverso de la credencial" />
          </section>
        </div>
      </div>

      <p className="official-credential-preview-note">
        El PDF genera dos paginas independientes: pagina 1 anverso y pagina 2 reverso, preparadas para funda A7 de 110 x 80 mm.
      </p>
    </div>
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
  const nameParts = splitCredentialName(credential.name);
  const nameTone = credential.name.length > 29 ? 'official-credential-name--compact' : credential.name.length > 21 ? 'official-credential-name--narrow' : '';
  return (
    <article className="official-credential-card">
      <div className="official-credential-header">
        <div className="official-credential-header-arc" aria-hidden="true" />
        <div className="official-credential-header-heart" aria-hidden="true">♡</div>
      </div>
      <img className="official-credential-logo" src={credentialLogoUrl} alt="Pan y Esperanza" />
      <div className="official-credential-brand">Pan y Esperanza</div>
      <div className="official-credential-subtitle">Juntos llevamos esperanza</div>
      <div className="official-credential-kind">{credential.accreditationLabel}</div>
      <CredentialPhoto credential={credential} />
      <div className={`official-credential-name ${nameTone}`}>
        <span>{nameParts.first}</span>
        {nameParts.rest && <span>{nameParts.rest}</span>}
      </div>
      <div className="official-credential-details">
        <CredentialDetail icon="id" label="Codigo:" value={credential.code} />
        <CredentialDetail icon="calendar" label="Desde:" value={formatDate(credential.issuedAt)} />
        <CredentialDetail icon="shield" label="Estado:" value={credential.status} accent />
      </div>
      <div className="official-credential-qr-frame">
        {qrDataUrl ? <img className="official-credential-qr" src={qrDataUrl} alt="Codigo QR" /> : <div className="official-credential-qr-loading" />}
      </div>
      <div className="official-credential-footer-line" />
      <div className="official-credential-footer-text">
        Credencial oficial de Pan y Esperanza.<br />
        Su uso es personal e intransferible.
      </div>
      <div className="official-credential-heart-wrap" aria-hidden="true">
        <span />
        <b>♥</b>
        <span />
      </div>
      <div className="official-credential-althemon">Generado por ALTHEMON&reg;</div>
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

function CredentialDetail({ icon, label, value, accent = false }) {
  return (
    <div className="official-credential-detail-row">
      <CredentialIcon type={icon} />
      <span>{label}</span>
      <strong className={accent ? 'official-credential-state' : ''}>{value || '-'}</strong>
    </div>
  );
}

function CredentialIcon({ type }) {
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
    const payload = {
      type: 'official-credential',
      credential_kind: credential.kind,
      credential_id: credential.credentialId,
      subject_id: credential.subjectId,
      code: credential.code
    };
    QRCode.toDataURL(JSON.stringify(payload), { margin: 1, width: 420, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch((error) => {
        console.error('[OfficialCredential] No se pudo generar QR', error);
        if (active) setQrDataUrl('');
      });
    return () => { active = false; };
  }, [credential.kind, credential.credentialId, credential.subjectId, credential.code]);
  return qrDataUrl;
}

function buildOfficialCredential(kind, subject = {}) {
  const normalizedKind = KIND_LABELS[kind] ? kind : 'beneficiary';
  const name = credentialName(normalizedKind, subject);
  const code = credentialCode(normalizedKind, subject);
  const subjectId = cleanText(subject.id || code);
  return {
    kind: normalizedKind,
    typeLabel: KIND_LABELS[normalizedKind],
    accreditationLabel: credentialAccreditationLabel(normalizedKind, subject),
    name,
    code,
    subjectId,
    credentialId: buildCredentialSecureIdentifier({ kind: normalizedKind, subjectId, code }),
    issuedAt: subject.joined_at || subject.created_at || subject.registered_at || subject.start_date || new Date().toISOString(),
    status: statusLabel(subject),
    photoSource: credentialPhotoSource(subject),
    photoKey: credentialPhotoKey(subject),
    photoVersion: cleanText(subject.updated_at || subject.photo_updated_at || subject.created_at || subject.id || code)
  };
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
    const role = cleanText(subject.role);
    const position = cleanText(subject.position);
    if (position && role && position.toLowerCase() !== role.toLowerCase()) return `${position} · ${role}`;
    return role || position || 'Usuario del ERP';
  }
  return `${KIND_LABELS[kind]} acreditado`;
}

function cacheProofPhotoUrl(url, version) {
  const cleanUrl = cleanText(url);
  if (!cleanUrl || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) return cleanUrl;
  const separator = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${separator}v=${encodeURIComponent(cleanText(version) || Date.now().toString())}`;
}

function statusLabel(subject = {}) {
  if (subject.status) return cleanText(subject.status);
  if (subject.is_active === false) return 'Inactivo';
  return 'Activo';
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
