import { Keyboard, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier } from '../lib/credentials';
import { normalize } from '../lib/formatters';
import { Button } from './Button';

export function BeneficiaryQuickSearch({
  data = {},
  beneficiaries,
  credentialDirectory,
  onSelect,
  selectedBeneficiaryId = '',
  label = 'Buscador inteligente',
  placeholder = 'Nombre, PYE, DNI, telefono o credencial',
  helperText = 'Localiza por nombre, codigo PYE, documento, telefono, codigo de credencial o ID corto.',
  emptyText = 'No hay coincidencias con esa busqueda.',
  className = ''
}) {
  const [query, setQuery] = useState('');
  const rows = beneficiaries || data.beneficiaries || [];
  const directory = useMemo(
    () => credentialDirectory || buildBeneficiaryCredentialDirectory(data || {}),
    [credentialDirectory, data]
  );
  const matches = useMemo(
    () => findBeneficiaryMatches(query, rows, directory),
    [query, rows, directory]
  );
  const hasQuery = Boolean(String(query || '').trim());

  function submit(event) {
    event.preventDefault();
    if (matches.length === 1) {
      onSelect?.(matches[0].beneficiary, matches[0].entry, matches[0]);
    }
  }

  return (
    <section className={className}>
      <form className="rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={submit}>
        <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</label>
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
          />
          <Button type="submit" className="h-12 px-4" aria-label="Buscar beneficiario">
            <Search size={18} />
          </Button>
        </div>
        {helperText && (
          <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Keyboard size={14} /> {helperText}
          </p>
        )}
      </form>

      {hasQuery && matches.length > 0 && (
        <div className="mt-3 grid gap-2">
          {matches.map((item) => (
            <button
              key={item.beneficiary.id}
              type="button"
              onClick={() => onSelect?.(item.beneficiary, item.entry, item)}
              className={`grid grid-cols-[3.75rem_1fr] items-center gap-3 rounded-2xl border bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50 ${
                selectedBeneficiaryId === item.beneficiary.id ? 'border-brand-400 bg-brand-50 shadow-sm' : 'border-slate-200'
              }`}
            >
              <BeneficiaryQuickSearchPhoto beneficiary={item.beneficiary} />
              <span className="min-w-0">
                <span className="block truncate font-black text-ink">{item.beneficiary.full_name}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  {item.beneficiary.code || 'Sin codigo PYE'} - {item.familyPeople} persona(s) - {item.status}
                </span>
                <span className="mt-1 block truncate text-xs font-bold text-brand-700">{item.matchLabel}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {String(query || '').trim().length >= 2 && !matches.length && (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{emptyText}</p>
      )}
    </section>
  );
}

function BeneficiaryQuickSearchPhoto({ beneficiary }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function resolvePhoto() {
      const direct = beneficiary.photo_data_url || beneficiary.photo_url || beneficiary.avatar_url || '';
      if (direct) {
        if (!cancelled) setSrc(direct);
        return;
      }
      const photo = await resolveBeneficiaryPhotoUrl(beneficiary).catch(() => '');
      if (!cancelled) setSrc(photo || '');
    }
    resolvePhoto();
    return () => { cancelled = true; };
  }, [beneficiary]);

  if (src) {
    return <img src={src} alt={beneficiary.full_name || 'Beneficiario'} className="h-14 w-14 rounded-2xl bg-white object-cover shadow-sm" />;
  }
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 shadow-inner">
      <UserRound size={28} />
    </span>
  );
}

export function buildBeneficiaryCredentialDirectory(data = {}) {
  const beneficiaries = data.beneficiaries || [];
  const bySubject = new Map(beneficiaries.map((record) => [record.id, record]));
  const entries = beneficiaries.map((record) => toBeneficiaryDirectoryEntry(record)).filter(Boolean);
  const byCredentialId = new Set(entries.map((entry) => normalizeCredentialIdentifier(entry.credentialId)));

  (data.official_credential_registry || []).forEach((credential) => {
    const credentialId = normalizeCredentialIdentifier(credential.credential_uid);
    if (!credentialId || byCredentialId.has(credentialId)) return;
    const isBeneficiary = credential.subject_type === 'beneficiary';
    const record = isBeneficiary ? bySubject.get(credential.subject_id) : null;
    entries.push({
      kind: credential.subject_type || 'unknown',
      record: credential.status === 'active' && record ? record : null,
      credentialId,
      legacyCredentialId: '',
      subjectId: credential.subject_id,
      legacyCode: record?.code || '',
      credentialStatus: credential.status || 'revoked',
      credentialStatusReason: credential.status_reason || '',
      credentialQrVersion: Number.parseInt(String(credential.qr_version || 1), 10) || 1,
      invalidCredential: !isBeneficiary || credential.status !== 'active' || !record,
      message: !isBeneficiary ? 'La credencial no pertenece a un beneficiario.' : invalidCredentialMessage(credential.status, credential.status_reason)
    });
    byCredentialId.add(credentialId);
  });

  return entries;
}

export function toBeneficiaryDirectoryEntry(record = {}) {
  const subjectId = record.id || record.code || null;
  const storedCredentialId = normalizeCredentialIdentifier(record.credential_uid || record.official_credential_id || record.credential_id);
  const legacyCredentialId = buildCredentialSecureIdentifier({ kind: 'beneficiary', subjectId, code: record.code });
  const credentialId = storedCredentialId || legacyCredentialId;
  if (!credentialId) return null;
  return {
    kind: 'beneficiary',
    record,
    credentialId,
    legacyCredentialId,
    subjectId,
    legacyCode: record.code,
    credentialStatus: record.credential_status || 'active',
    credentialStatusReason: record.credential_status_reason || '',
    credentialQrVersion: Number.parseInt(String(record.credential_qr_version || 1), 10) || 1,
    invalidCredential: record.credential_status && record.credential_status !== 'active'
  };
}

export function findBeneficiaryMatches(query, beneficiaries = [], directory = []) {
  const clean = normalize(query).replace(/\s+/g, ' ');
  const compact = clean.replace(/\s+/g, '');
  if (!compact) return [];
  const entryByBeneficiaryId = new Map(
    directory
      .filter((entry) => entry.kind === 'beneficiary' && entry.record?.id)
      .map((entry) => [entry.record.id, entry])
  );
  return beneficiaries
    .map((beneficiary) => {
      const entry = entryByBeneficiaryId.get(beneficiary.id) || toBeneficiaryDirectoryEntry(beneficiary);
      const values = beneficiarySearchValues(beneficiary, entry);
      const matchedValue = values.find((value) => {
        const normalized = normalize(value);
        return normalized.includes(clean) || normalized.replace(/\s+/g, '').includes(compact);
      });
      if (!matchedValue) return null;
      return {
        beneficiary,
        entry,
        status: beneficiaryStatus(beneficiary),
        familyPeople: beneficiaryFamilyPeople(beneficiary, beneficiaries),
        matchLabel: searchMatchLabel(matchedValue, beneficiary, entry)
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

export function beneficiaryStatus(beneficiary = {}) {
  if (beneficiary.is_active === false) return 'Inactivo';
  return beneficiary.status || beneficiary.situation || 'Activo';
}

export function beneficiaryDocument(beneficiary = {}) {
  return beneficiary.document_id || beneficiary.dni || beneficiary.nie || beneficiary.passport || beneficiary.document || '';
}

export function beneficiaryPhone(beneficiary = {}) {
  return beneficiary.phone || beneficiary.mobile || beneficiary.telephone || beneficiary.contact_phone || '';
}

export function invalidCredentialMessage(status, reason = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'revoked') return 'CREDENCIAL ANULADA';
  if (normalizedStatus === 'expired') return 'Esta credencial ha caducado y ya no es valida.';
  if (normalizedStatus === 'suspended') return 'Esta credencial esta suspendida temporalmente.';
  if (normalizedStatus === 'inactive') return 'Esta credencial esta inactiva.';
  return reason || 'Esta credencial ya no es valida.';
}

export function normalizeCredentialIdentifier(value) {
  return String(value || '').trim();
}

function beneficiarySearchValues(beneficiary = {}, entry = {}) {
  return uniqueValues([
    beneficiary.full_name,
    beneficiary.code,
    beneficiaryDocument(beneficiary),
    beneficiaryPhone(beneficiary),
    beneficiary.credential_uid,
    beneficiary.official_credential_id,
    beneficiary.credential_id,
    beneficiary.credential_short_id,
    beneficiary.official_credential_short_id,
    entry.credentialId,
    entry.legacyCredentialId,
    shortCredentialSearchId(entry)
  ]);
}

function searchMatchLabel(value, beneficiary = {}, entry = {}) {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return beneficiary.code || shortCredentialSearchId(entry) || '';
  const shortId = shortCredentialSearchId(entry);
  if (shortId && normalize(cleanValue) === normalize(shortId)) return `ID credencial: ${shortId}`;
  if ([entry.credentialId, entry.legacyCredentialId, beneficiary.credential_uid, beneficiary.official_credential_id, beneficiary.credential_id].some((item) => normalize(item) === normalize(cleanValue))) {
    return `Credencial: ${shortId || cleanValue}`;
  }
  if (normalize(cleanValue) === normalize(beneficiary.code)) return `Codigo PYE: ${beneficiary.code}`;
  if (normalize(cleanValue) === normalize(beneficiaryDocument(beneficiary))) return `Documento: ${beneficiaryDocument(beneficiary)}`;
  if (normalize(cleanValue) === normalize(beneficiaryPhone(beneficiary))) return `Telefono: ${beneficiaryPhone(beneficiary)}`;
  return beneficiary.code ? `Codigo PYE: ${beneficiary.code}` : cleanValue;
}

function beneficiaryFamilyPeople(beneficiary = {}, beneficiaries = []) {
  if (beneficiary.family_id) {
    const members = beneficiaries.filter((item) => item.family_id === beneficiary.family_id && item.is_active !== false);
    return Math.max(members.length, 1);
  }
  return Math.max(Number(beneficiary.family_members || beneficiary.family_size || beneficiary.household_size || 1), 1);
}

function shortCredentialSearchId(entry = {}) {
  const source = String(entry.credentialId || entry.legacyCredentialId || entry.record?.credential_uid || entry.record?.official_credential_id || entry.record?.credential_id || entry.record?.code || '').trim();
  const prefix = credentialSearchPrefix(entry.kind, source);
  const yearSerial = source.match(/^[A-Z]{2,4}-\d{4}-(\d+)$/i);
  const digits = yearSerial?.[1] || (source.match(/\d+/g) || []).join('');
  if (!digits) return '';
  return `${prefix}-${digits.slice(-6).padStart(6, '0')}`;
}

function credentialSearchPrefix(kind, value) {
  const clean = String(value || '').trim().toUpperCase();
  const match = clean.match(/^([A-Z]{2,4})-/);
  const rawPrefix = match?.[1] || '';
  if (rawPrefix === 'PYE') return 'PE';
  if (rawPrefix) return rawPrefix;
  if (kind === 'volunteer') return 'VOL';
  if (kind === 'collaborator') return 'COL';
  if (kind === 'donor') return 'DON';
  if (kind === 'user') return 'USR';
  return 'PE';
}

function uniqueValues(values = []) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}
