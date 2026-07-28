export function buildCredentialSecureIdentifier({ kind = 'person', subjectId = '', code = '' } = {}) {
  const normalizedKind = String(kind || 'person').trim().toLowerCase();
  const subject = String(subjectId || code || '').trim();
  if (!subject) return '';
  return `althemon-${normalizedKind}-${hashCredentialSubject(`${normalizedKind}|${subject}`)}`;
}

export function parseOfficialCredentialQr(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    if (payload?.type !== 'official-credential') return null;
    return payload;
  } catch {
    return null;
  }
}

function hashCredentialSubject(value) {
  const text = String(value || '');
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    first ^= char;
    first = Math.imul(first, 16777619);
    second ^= char + index;
    second = Math.imul(second, 2246822519);
  }
  const partA = (first >>> 0).toString(36).padStart(7, '0');
  const partB = (second >>> 0).toString(36).padStart(7, '0');
  return `${partA}${partB}`;
}
