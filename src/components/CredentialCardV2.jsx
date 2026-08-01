import frontTemplateUrl from '../assets/credential-v2/front-template.png';
import backTemplateUrl from '../assets/credential-v2/back-template.png';
import { formatDate } from '../lib/formatters';
import './CredentialCardV2.css';

export function CredentialCardV2({ side = 'front', credential, qrDataUrl, photoUrl }) {
  if (side === 'back') {
    return (
      <article className="credential-card-v2" data-credential-v2-card data-credential-v2-side="back">
        <img className="credential-card-v2__template" src={backTemplateUrl} alt="Reverso de la credencial" />
      </article>
    );
  }

  const displayName = credentialDisplayName(credential.name);
  const nameSize = credentialNameSize(displayName);
  const type = credentialTypeParts(credential.roleLabel || credential.accreditationLabel || credential.typeLabel);

  return (
    <article className="credential-card-v2" data-credential-v2-card data-credential-v2-side="front">
      <img className="credential-card-v2__template" src={frontTemplateUrl} alt="" aria-hidden="true" />

      {photoUrl ? (
        <img className="credential-card-v2__photo" src={photoUrl} alt={`Foto de ${credential.name}`} />
      ) : (
        <div className="credential-card-v2__photo credential-card-v2__photo--empty" aria-label="Sin fotografia">
          {initials(credential.name)}
        </div>
      )}

      <div className="credential-card-v2__type" aria-label={type.full}>
        <span>{type.main}</span>
        {type.accent && <strong>{type.accent}</strong>}
      </div>

      <div className="credential-card-v2__name" style={{ '--credential-v2-name-size': nameSize }}>
        {displayName}
      </div>

      <strong className="credential-card-v2__value credential-card-v2__value--code">{credential.code}</strong>
      <strong className="credential-card-v2__value credential-card-v2__value--date">{formatDate(credential.issuedAt)}</strong>
      <strong className="credential-card-v2__value credential-card-v2__value--status">{credential.status}</strong>

      <div className="credential-card-v2__qr">
        {qrDataUrl ? <img src={qrDataUrl} alt="Codigo QR" /> : <span />}
      </div>
    </article>
  );
}

function credentialDisplayName(value) {
  const parts = cleanText(value).split(/\s+/).filter(Boolean);
  return parts[0] || cleanText(value) || 'Persona';
}

function credentialNameSize(value) {
  const length = cleanText(value).length;
  if (length > 20) return '6.1cqw';
  if (length > 16) return '6.8cqw';
  if (length > 12) return '7.55cqw';
  return '8.45cqw';
}

function credentialTypeParts(value) {
  const full = cleanText(value).toUpperCase();
  if (!full) return { full: 'CREDENCIAL', main: 'CREDENCIAL', accent: '' };
  if (full.includes(' ACREDITADO')) {
    return {
      full,
      main: full.replace(/\s+ACREDITADO.*/, ''),
      accent: 'ACREDITADO'
    };
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
    .join('') || 'PY';
}

function cleanText(value) {
  return String(value || '').trim();
}
