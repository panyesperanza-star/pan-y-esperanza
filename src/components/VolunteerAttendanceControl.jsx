import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertTriangle, CheckCircle2, Clock, LogIn, LogOut, QrCode, ScanLine, Search, TimerReset, UserRoundCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { FormField, inputClass } from './FormField';
import { parseOfficialCredentialQr } from '../lib/credentials';
import { formatDate, formatDateTime, normalize } from '../lib/formatters';
import { userFullName } from '../lib/personIdentity';

const ACTIVITY_TYPES = ['General', 'Reparto', 'Campaña', 'Evento', 'Agenda', 'Formación', 'Otro'];
const EXCESSIVE_SHIFT_MINUTES = 12 * 60;

export function VolunteerAttendanceControl({ data = {}, volunteers = [], entries = [], actions, currentUser, canManage }) {
  const [activityType, setActivityType] = useState('General');
  const [activityLabel, setActivityLabel] = useState('Voluntariado');
  const [manualTerm, setManualTerm] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const scannerRegionId = useRef(`volunteer-attendance-reader-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const scanLockedRef = useRef(false);
  const usbBufferRef = useRef('');
  const usbLastKeyAtRef = useRef(0);
  const processScanRef = useRef(null);

  const presentEntries = useMemo(() => entries.filter(isOpenAttendanceEntry), [entries]);
  const manualResults = useMemo(() => searchVolunteersForAttendance(volunteers, data, manualTerm).slice(0, 8), [volunteers, data, manualTerm]);

  processScanRef.current = async (rawValue, method = 'usb') => {
    await processCredentialScan(rawValue, method);
  };

  useEffect(() => {
    function handleKeyDown(event) {
      if (!canManage || !isUsbReaderEventAllowed(event)) return;
      const now = Date.now();
      if (now - usbLastKeyAtRef.current > 600) usbBufferRef.current = '';
      usbLastKeyAtRef.current = now;

      if (event.key === 'Enter') {
        const rawValue = normalizeUsbValue(usbBufferRef.current);
        usbBufferRef.current = '';
        if (!rawValue) return;
        event.preventDefault();
        processScanRef.current?.(rawValue, 'usb');
        return;
      }

      if (event.key && event.key.length === 1) {
        usbBufferRef.current += event.key;
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [canManage]);

  useEffect(() => () => {
    stopCamera();
  }, []);

  async function processCredentialScan(rawValue, method) {
    setError('');
    const resolved = resolveVolunteerFromCredential(data, volunteers, rawValue);
    if (resolved.error) {
      setError(resolved.error);
      setLastResult({ type: 'error', message: resolved.error, rawValue });
      return;
    }
    await registerAttendance(resolved.volunteer, method, resolved.credentialId);
  }

  async function registerAttendance(volunteer, method = 'manual', credentialUid = '') {
    if (!canManage) return;
    setError('');
    try {
      const result = await actions.toggleVolunteerAttendance({
        volunteer_id: volunteer.id,
        person_identity_id: volunteer.person_identity_id || null,
        method,
        credential_uid: credentialUid,
        activity_type: activityType,
        activity_label: activityLabel || activityType,
        device_info: browserDeviceLabel()
      });
      const minutes = result.entry?.total_minutes || 0;
      setLastResult({
        type: result.type,
        message: result.message,
        volunteer,
        entry: result.entry,
        minutes
      });
      setManualTerm('');
    } catch (err) {
      const message = err.message || 'No se pudo registrar el fichaje.';
      setError(message);
      setLastResult({ type: 'error', message, volunteer });
    } finally {
      window.setTimeout(() => {
        scanLockedRef.current = false;
      }, 1200);
    }
  }

  async function startCamera() {
    if (!canManage || cameraActive) return;
    setCameraError('');
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras?.length) throw new Error('No se ha encontrado ninguna cámara disponible.');
      const preferred = cameras.find((camera) => /back|rear|environment|trasera/i.test(camera.label || '')) || cameras[0];
      const scanner = new Html5Qrcode(scannerRegionId, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
      scannerRef.current = scanner;
      scanLockedRef.current = false;
      await scanner.start(
        { deviceId: { exact: preferred.id } },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1.777778 },
        (decodedText) => {
          if (scanLockedRef.current) return;
          scanLockedRef.current = true;
          processCredentialScan(decodedText, 'qr');
        }
      );
      setCameraActive(true);
    } catch (err) {
      setCameraError(err.message || 'No se pudo iniciar la cámara.');
      setCameraActive(false);
    }
  }

  async function stopCamera() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch (err) {
      console.warn('[ALTHEMON] No se pudo cerrar el lector QR de voluntariado:', err);
    } finally {
      setCameraActive(false);
    }
  }

  const incidentEntries = entries.filter((entry) => attendanceIncidentType(entry));

  return (
    <section className="mb-4 grid gap-4 rounded-md border border-brand-100 bg-white p-4 shadow-panel xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Asistencia y control horario</p>
            <h2 className="mt-1 text-xl font-black text-ink">Sala de control de voluntariado</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Fichaje por QR, lector USB o búsqueda manual. Siempre usa la identidad única del voluntario.</p>
          </div>
          <div className="rounded-md bg-brand-50 px-4 py-3 text-right">
            <p className="text-xs font-bold uppercase text-brand-700">Voluntarios presentes ahora</p>
            <p className="text-3xl font-black text-brand-800">{presentEntries.length}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {presentEntries.slice(0, 6).map((entry) => {
            const volunteer = volunteers.find((item) => item.id === entry.volunteer_id);
            return <PresenceCard key={entry.id} entry={entry} volunteer={volunteer} />;
          })}
          {!presentEntries.length && <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500 md:col-span-3">No hay voluntarios fichados como presentes ahora.</p>}
        </div>

        {incidentEntries.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            <div className="flex items-center gap-2"><AlertTriangle size={18} /> {incidentEntries.length} incidencia(s) de fichaje requieren revisión.</div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Actividad">
            <select className={inputClass} value={activityType} onChange={(event) => setActivityType(event.target.value)} disabled={!canManage}>
              {ACTIVITY_TYPES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </FormField>
          <FormField label="Detalle">
            <input className={inputClass} value={activityLabel} onChange={(event) => setActivityLabel(event.target.value)} placeholder="Reparto, campaña o evento" disabled={!canManage} />
          </FormField>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button type="button" onClick={startCamera} disabled={!canManage || cameraActive}><ScanLine size={18} /> Escanear QR</Button>
          <Button type="button" variant="secondary" onClick={stopCamera} disabled={!cameraActive}>Detener cámara</Button>
        </div>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
          <div id={scannerRegionId} className="min-h-[12rem] w-full" />
          {!cameraActive && <div className="p-4 text-center text-sm font-semibold text-slate-500"><QrCode className="mx-auto mb-2" size={28} /> Cámara detenida. El lector USB permanece en escucha.</div>}
        </div>
        {cameraError && <p className="mt-2 rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700">{cameraError}</p>}

        <div className="mt-4">
          <FormField label="Búsqueda manual">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input className={`${inputClass} pl-9`} value={manualTerm} onChange={(event) => setManualTerm(event.target.value)} placeholder="Nombre, código, DNI, teléfono o credencial" disabled={!canManage} />
          </div>
          </FormField>
        </div>
        {manualTerm.trim() && (
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white">
            {manualResults.map((volunteer) => (
              <button key={volunteer.id} type="button" className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-brand-50" onClick={() => registerAttendance(volunteer, 'manual')}>
                <VolunteerAvatar volunteer={volunteer} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{volunteer.full_name}</p>
                  <p className="text-xs font-semibold text-slate-500">{volunteer.code} · {volunteer.status || 'Activo'}</p>
                </div>
                <PresencePill present={Boolean(openAttendanceEntryFor(entries, volunteer.id))} />
              </button>
            ))}
            {!manualResults.length && <p className="p-3 text-sm text-slate-500">Sin coincidencias.</p>}
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {lastResult && <AttendanceResult result={lastResult} />}
      </div>
    </section>
  );
}

export function VolunteerAttendanceProfilePanel({ volunteer, entries = [], corrections = [], canManage, actions }) {
  const [editing, setEditing] = useState(null);
  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.total_minutes || 0), 0);
  const openEntry = entries.find(isOpenAttendanceEntry);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <AttendanceMetric label="Estado" value={openEntry ? 'Presente' : 'No presente'} detail={openEntry ? `Entrada ${formatTime(openEntry.check_in_at)}` : 'Sin fichaje abierto'} highlight={Boolean(openEntry)} />
        <AttendanceMetric label="Horas reales" value={formatAttendanceDuration(totalMinutes)} detail="Total registrado" />
        <AttendanceMetric label="Fichajes" value={entries.length} detail="Entradas y salidas" />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-ink">Control horario</h3>
            <p className="text-sm text-slate-500">Entradas, salidas, método de identificación e incidencias.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {entries.map((entry) => {
            const entryCorrections = corrections.filter((item) => item.time_entry_id === entry.id);
            return (
              <article key={entry.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip entry={entry} />
                      <p className="font-bold text-ink">{entry.activity_label || entry.activity_type || 'Voluntariado'}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">Entrada: {formatDateTime(entry.check_in_at)} · Salida: {entry.check_out_at ? formatDateTime(entry.check_out_at) : 'Abierta'}</p>
                    <p className="text-sm text-slate-600">Horas: {formatAttendanceDuration(entry.total_minutes || elapsedMinutes(entry.check_in_at))} · Método: {methodLabel(entry.method)} · Registrado por: {entry.registered_by_name || '-'}</p>
                    {entry.incident_type && <p className="mt-1 text-sm font-bold text-amber-700">Incidencia: {entry.incident_type}</p>}
                    {entryCorrections.length > 0 && <p className="mt-1 text-xs font-semibold text-slate-500">{entryCorrections.length} corrección(es) auditadas.</p>}
                  </div>
                  {canManage && <Button type="button" variant="secondary" onClick={() => setEditing(editing === entry.id ? null : entry.id)}><TimerReset size={16} /> Corregir</Button>}
                </div>
                {editing === entry.id && <AttendanceCorrectionForm entry={entry} onCancel={() => setEditing(null)} onSubmit={async (payload) => { await actions.correctVolunteerAttendance(entry.id, payload); setEditing(null); }} />}
              </article>
            );
          })}
          {!entries.length && <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Todavía no hay fichajes registrados.</p>}
        </div>
      </section>
    </div>
  );
}

function AttendanceCorrectionForm({ entry, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({
    check_in_at: toLocalDateTimeInput(entry.check_in_at),
    check_out_at: toLocalDateTimeInput(entry.check_out_at),
    activity_label: entry.activity_label || '',
    status: entry.status || 'closed',
    reason: ''
  }));
  const [error, setError] = useState('');
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSubmit({
        check_in_at: fromLocalDateTimeInput(form.check_in_at),
        check_out_at: fromLocalDateTimeInput(form.check_out_at),
        activity_label: form.activity_label,
        status: form.status,
        reason: form.reason
      });
    } catch (err) {
      setError(err.message || 'No se pudo corregir el fichaje.');
    }
  }

  return (
    <form className="mt-3 grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2" onSubmit={submit}>
      {error && <p className="rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
      <FormField label="Entrada"><input className={inputClass} type="datetime-local" value={form.check_in_at} onChange={(event) => update('check_in_at', event.target.value)} /></FormField>
      <FormField label="Salida"><input className={inputClass} type="datetime-local" value={form.check_out_at} onChange={(event) => update('check_out_at', event.target.value)} /></FormField>
      <FormField label="Actividad"><input className={inputClass} value={form.activity_label} onChange={(event) => update('activity_label', event.target.value)} /></FormField>
      <FormField label="Estado"><select className={inputClass} value={form.status} onChange={(event) => update('status', event.target.value)}><option value="closed">Cerrado</option><option value="corrected">Corregido</option><option value="incident">Incidencia</option></select></FormField>
      <div className="sm:col-span-2"><FormField label="Motivo"><textarea className={inputClass} rows={2} required value={form.reason} onChange={(event) => update('reason', event.target.value)} /></FormField></div>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit">Guardar corrección</Button></div>
    </form>
  );
}

function PresenceCard({ entry, volunteer }) {
  if (!volunteer) return null;
  return (
    <article className="rounded-md border border-brand-100 bg-brand-50 p-3">
      <div className="flex items-center gap-3">
        <VolunteerAvatar volunteer={volunteer} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{volunteer.full_name}</p>
          <p className="text-xs font-semibold text-brand-700">Entrada {formatTime(entry.check_in_at)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm font-bold text-brand-800">Tiempo actual: {formatAttendanceDuration(elapsedMinutes(entry.check_in_at))}</p>
      <p className="text-xs text-slate-600">{entry.activity_label || entry.activity_type || 'Voluntariado'}</p>
    </article>
  );
}

function AttendanceResult({ result }) {
  const positive = ['entry', 'exit'].includes(result.type);
  return (
    <div className={`mt-3 rounded-md border p-3 text-sm ${positive ? 'border-brand-100 bg-brand-50 text-brand-800' : 'border-red-100 bg-red-50 text-red-700'}`}>
      <div className="flex items-center gap-2 font-black">{result.type === 'entry' ? <LogIn size={18} /> : result.type === 'exit' ? <LogOut size={18} /> : <AlertTriangle size={18} />} {result.message}</div>
      {result.volunteer && <p className="mt-1 font-semibold">{result.volunteer.full_name}</p>}
      {result.type === 'exit' && <p className="text-xs font-semibold">Total: {formatAttendanceDuration(result.minutes)}</p>}
    </div>
  );
}

function VolunteerAvatar({ volunteer }) {
  const photo = volunteer?.photo_data_url || volunteer?.profile_photo || '';
  if (photo) return <img src={photo} alt="" className="h-11 w-11 rounded-full object-cover" />;
  return <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-sm font-black text-white">{initials(volunteer?.full_name)}</span>;
}

function AttendanceMetric({ label, value, detail, highlight = false }) {
  return (
    <article className={`rounded-md border p-4 ${highlight ? 'border-brand-100 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-ink">{value}</p>
      <p className="text-sm text-slate-500">{detail}</p>
    </article>
  );
}

function PresencePill({ present }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${present ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600'}`}>{present ? 'Presente' : 'No presente'}</span>;
}

function StatusChip({ entry }) {
  if (isOpenAttendanceEntry(entry)) return <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-1 text-xs font-bold text-brand-800"><Clock size={12} /> Presente</span>;
  if (entry.status === 'incident') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800"><AlertTriangle size={12} /> Incidencia</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"><CheckCircle2 size={12} /> Cerrado</span>;
}

export function volunteerTimeEntriesFor(dataOrEntries, volunteerId) {
  const source = Array.isArray(dataOrEntries) ? dataOrEntries : dataOrEntries?.volunteer_time_entries || [];
  return source
    .filter((entry) => entry.volunteer_id === volunteerId)
    .sort((left, right) => new Date(right.check_in_at || right.created_at || 0) - new Date(left.check_in_at || left.created_at || 0));
}

export function volunteerAttendancePresence(entries = [], volunteerId) {
  return openAttendanceEntryFor(entries, volunteerId);
}

export function volunteerAttendanceStats(entries = []) {
  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.total_minutes || 0), 0);
  const open = entries.find(isOpenAttendanceEntry) || null;
  return { totalMinutes, open, totalEntries: entries.length };
}

export function volunteerAttendanceTimelineRows(entries = [], history = []) {
  const historyEntryIds = new Set(history.map((item) => readHistoryTimeEntryId(item.notes)).filter(Boolean));
  return entries
    .filter((entry) => !historyEntryIds.has(entry.id))
    .map((entry) => ({
      id: `attendance-${entry.id}`,
      date: entry.check_out_at || entry.check_in_at || entry.created_at,
      activity: isOpenAttendanceEntry(entry) ? 'Fichaje abierto' : `Participó en ${entry.activity_label || entry.activity_type || 'voluntariado'} · ${formatAttendanceDuration(entry.total_minutes || 0)}`,
      hours: entry.total_minutes ? Math.round((Number(entry.total_minutes) / 60) * 100) / 100 : null,
      notes: `Entrada ${formatDateTime(entry.check_in_at)} · Salida ${entry.check_out_at ? formatDateTime(entry.check_out_at) : 'pendiente'} · ${methodLabel(entry.method)}`
    }));
}

export function formatAttendanceDuration(minutes = 0) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (!hours) return `${mins} min`;
  return `${hours} h ${String(mins).padStart(2, '0')} min`;
}

export function isOpenAttendanceEntry(entry = {}) {
  return entry.status === 'open' && !entry.check_out_at;
}

function openAttendanceEntryFor(entries = [], volunteerId) {
  return entries.find((entry) => entry.volunteer_id === volunteerId && isOpenAttendanceEntry(entry)) || null;
}

function attendanceIncidentType(entry = {}) {
  if (entry.incident_type) return entry.incident_type;
  if (isOpenAttendanceEntry(entry) && elapsedMinutes(entry.check_in_at) > EXCESSIVE_SHIFT_MINUTES) return 'Fichaje excesivamente largo';
  return '';
}

function resolveVolunteerFromCredential(data, volunteers, rawValue) {
  const payload = parseOfficialCredentialQr(rawValue);
  const credentialId = normalizeCredentialIdentifier(payload?.credential_id || payload?.credential_uid || rawValue);
  if (!payload && !credentialId) return { error: 'QR no reconocido.' };

  const registryEntry = (data.official_credential_registry || []).find((entry) => normalizeCredentialIdentifier(entry.credential_uid) === credentialId);
  if (registryEntry) {
    if (registryEntry.status && registryEntry.status !== 'active') return { error: 'Credencial anulada o no activa.' };
    if (registryEntry.subject_type === 'user') {
      const user = (data.app_users || []).find((item) => item.id === registryEntry.subject_id) || null;
      if (!user?.participates_as_volunteer) {
        return { error: 'Esta credencial de Usuario ERP no tiene activada la participacion como voluntario.' };
      }
    }
    const volunteer = volunteerFromCredentialRegistry(registryEntry, data, volunteers);
    if (!volunteer) return { error: registryEntry.subject_type === 'user' ? 'El usuario ERP participa como voluntario, pero no tiene expediente de voluntariado vinculado.' : 'La credencial no pertenece a un voluntario vinculado.' };
    return { volunteer, credentialId: registryEntry.credential_uid || credentialId };
  }

  const direct = volunteers.find((volunteer) => credentialMatchesVolunteer(volunteer, credentialId));
  if (direct) return { volunteer: direct, credentialId };
  return { error: 'Credencial no localizada en voluntariado.' };
}

function volunteerFromCredentialRegistry(entry, data, volunteers) {
  if (entry.subject_type === 'volunteer') return volunteers.find((volunteer) => volunteer.id === entry.subject_id) || null;
  if (entry.subject_type === 'user') {
    const user = (data.app_users || []).find((item) => item.id === entry.subject_id) || null;
    if (!user?.person_identity_id) return null;
    return volunteers.find((volunteer) => volunteer.person_identity_id && volunteer.person_identity_id === user.person_identity_id) || null;
  }
  if (entry.person_identity_id) {
    return volunteers.find((volunteer) => volunteer.person_identity_id && volunteer.person_identity_id === entry.person_identity_id) || null;
  }
  return null;
}

function credentialMatchesVolunteer(volunteer, value) {
  return [volunteer.code, volunteer.credential_uid, volunteer.official_credential_id, volunteer.credential_id, volunteer.credential_short_id, volunteer.official_credential_short_id]
    .some((item) => normalizeCredentialIdentifier(item) === value);
}

function searchVolunteersForAttendance(volunteers = [], data = {}, term = '') {
  const needle = normalize(term);
  if (!needle) return [];
  return volunteers.filter((volunteer) => {
    const linkedUser = linkedUserForVolunteer(volunteer, data.app_users || []);
    const haystack = normalize([
      volunteer.full_name,
      volunteer.code,
      volunteer.document_id,
      volunteer.phone,
      volunteer.email,
      volunteer.credential_uid,
      volunteer.official_credential_id,
      volunteer.credential_id,
      volunteer.credential_short_id,
      volunteer.official_credential_short_id,
      linkedUser?.email,
      userFullName(linkedUser)
    ].filter(Boolean).join(' '));
    return haystack.includes(needle);
  });
}

function linkedUserForVolunteer(volunteer = {}, users = []) {
  if (!volunteer.person_identity_id) return null;
  return users.find((user) => user.person_identity_id === volunteer.person_identity_id) || null;
}

function isUsbReaderEventAllowed(event) {
  const target = event.target;
  if (!target) return true;
  const tag = String(target.tagName || '').toLowerCase();
  if (target.isContentEditable) return false;
  return !['input', 'textarea', 'select'].includes(tag);
}

function normalizeUsbValue(value) {
  return String(value || '').trim();
}

function normalizeCredentialIdentifier(value) {
  return String(value || '').trim().toUpperCase();
}

function browserDeviceLabel() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || navigator.platform || '';
}

function elapsedMinutes(start) {
  const startDate = new Date(start || 0);
  if (Number.isNaN(startDate.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - startDate.getTime()) / 60000));
}

function formatTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function methodLabel(value) {
  if (value === 'qr') return 'QR';
  if (value === 'usb') return 'Lector USB';
  return 'Búsqueda manual';
}

function initials(value = '') {
  return String(value || 'V').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'V';
}

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readHistoryTimeEntryId(notes) {
  try {
    const parsed = JSON.parse(String(notes || ''));
    return parsed?.time_entry_id || '';
  } catch {
    return '';
  }
}
