const MOJIBAKE_HINTS = /[\u00c2\u00c3\u00e2\ufffd]/;
const WINDOWS_1252_REPLACEMENTS = [
  ['\u00e2\u20ac\u2122', '\u2019'],
  ['\u00e2\u20ac\u02dc', '\u2018'],
  ['\u00e2\u20ac\u0153', '\u201c'],
  ['\u00e2\u20ac\u009d', '\u201d'],
  ['\u00e2\u20ac\u009c', '\u201c'],
  ['\u00e2\u20ac\u201d', '\u2014'],
  ['\u00e2\u20ac\u201c', '\u2013'],
  ['\u00e2\u20ac\u00a6', '\u2026'],
  ['\u00e2\u20ac\u00a2', '\u2022'],
  ['\u00e2\u201a\u00ac', '\u20ac']
];

function mojibakeScore(text) {
  if (typeof text !== 'string' || !text) return 0;
  const matches = text.match(/[\u00c2\u00c3\u00e2\ufffd]|\u00e2[\u0080-\u00bf]{1,2}/g);
  return matches ? matches.length : 0;
}

function decodeLatin1Utf8(text) {
  if (typeof TextDecoder === 'undefined') return text;
  const decoder = new TextDecoder('utf-8');
  const bytes = [];
  let segment = '';
  let result = '';

  const flush = () => {
    if (!bytes.length) return;
    const decoded = decoder.decode(new Uint8Array(bytes));
    result += mojibakeScore(decoded) < mojibakeScore(segment) ? decoded : segment;
    bytes.length = 0;
    segment = '';
  };

  for (const char of text) {
    const code = char.codePointAt(0);
    if (code > 255) {
      flush();
      result += char;
    } else {
      bytes.push(code);
      segment += char;
    }
  }
  flush();
  return result;
}

function repairWindows1252Mojibake(text) {
  return WINDOWS_1252_REPLACEMENTS.reduce(
    (result, [broken, fixed]) => result.split(broken).join(fixed),
    text
  );
}

export function repairMojibakeText(value) {
  if (typeof value !== 'string' || !MOJIBAKE_HINTS.test(value)) return value;

  const windowsFixed = repairWindows1252Mojibake(value);
  const decoded = decodeLatin1Utf8(windowsFixed);
  return [windowsFixed, decoded].reduce(
    (best, candidate) => (mojibakeScore(candidate) < mojibakeScore(best) ? candidate : best),
    value
  );
}

export function repairMojibakeDeep(value) {
  if (typeof value === 'string') return repairMojibakeText(value);
  if (Array.isArray(value)) return value.map((item) => repairMojibakeDeep(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, repairMojibakeDeep(item)])
  );
}
