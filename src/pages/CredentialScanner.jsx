import { AlertTriangle, BadgeCheck, BriefcaseBusiness, Camera, CheckCircle2, Heart, IdCard, PackageCheck, ScanLine, ShieldCheck, UserRound, UserRoundCheck, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier, parseOfficialCredentialQr } from '../lib/credentials';
import { formatDate, formatDateTime, normalize } from '../lib/formatters';

const KIND_META = {
  beneficiary: { label: 'Beneficiario', icon: UserRound, tone: 'brand' },
  volunteer: { label: 'Voluntario', icon: UserRoundCheck, tone: 'blue' },
  collaborator: { label: 'Colaborador', icon: BriefcaseBusiness, tone: 'amber' },
  donor: { label: 'Donante', icon: Heart, tone: 'rose' }
};

export function CredentialScanner({ data, onNavigate }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const detectorRef = useRef(null);
  const scanningRef = useRef(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanStatus, setScanStatus] = useState('Esperando lectura de credencial.');
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const directory = useMemo(() => buildCredentialDirectory(data || {}), [data]);

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setScanError('');
    setCameraError('');
    setScanStatus('Activando camara...');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este dispositivo no permite abrir la camara desde el navegador.');
      setScanStatus('Camara no disponible.');
      return;
    }
    if (!('BarcodeDetector' in window)) {
      setCameraError('Este navegador no incluye lector QR nativo. Prueba con Chrome, Edge, Safari actualizado o un dispositivo movil moderno.');
      setScanStatus('Lector QR no disponible.');
      return;
    }

    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setScanStatus('Enfoca el QR de la credencial.');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanningRef.current = true;
      detectFrame();
    } catch (error) {
      console.error('[CredentialScanner] No se pudo abrir la camara', error);
      setCameraError(error?.message || 'No se ha podido abrir la camara.');
      setScanStatus('Camara no disponible.');
      stopCamera();
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  }

  async function detectFrame() {
    if (!scanningRef.current || !detectorRef.current || !videoRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      const rawValue = codes?.[0]?.rawValue;
      if (rawValue) {
        stopCamera();
        handleCredential(rawValue);
        return;
      }
    } catch (error) {
      console.warn('[CredentialScanner] Error leyendo QR', error);
    }
    frameRef.current = requestAnimationFrame(detectFrame);
  }

  function handleCredential(rawValue) {
    const payload = parseOfficialCredentialQr(rawValue);
    if (!payload) {
      setResult(null);
      setScanError('El QR escaneado no corresponde a una credencial oficial de Pan y Esperanza.');
      setScanStatus('Credencial no reconocida.');
      return;
    }
    const match = findCredentialMatch(payload, directory);
    if (!match) {
      setResult(null);
      setScanError('La credencial es oficial, pero no se ha encontrado una persona activa con ese identificador en el ERP.');
      setScanStatus('Credencial no localizada.');
      return;
    }
    setResult(match);
    setScanError('');
    setScanStatus('Credencial identificada correctamente.');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escanear credencial"
        description="Lector QR integrado en ALTHEMON para identificar credenciales oficiales sin exponer datos personales en el QR."
        actions={<Button onClick={isCameraActive ? stopCamera : startCamera}>{isCameraActive ? <XCircle size={16} /> : <Camera size={16} />} {isCameraActive ? 'Cerrar camara' : 'Abrir camara'}</Button>}
      />

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-700">Lector oficial</p>
              <h3 className="mt-1 text-xl font-black text-ink">Camara del dispositivo</h3>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${isCameraActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {isCameraActive ? 'Escaneando' : 'En espera'}
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            {isCameraActive ? (
              <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
                <ScanLine size={46} />
                <p className="text-lg font-black">Pulsa "Abrir camara" y enfoca el QR.</p>
                <p className="max-w-md text-sm text-slate-300">El escaneo se realiza en este navegador. No se instala ninguna aplicacion externa.</p>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm font-semibold text-brand-800">
            <p>{scanStatus}</p>
          </div>
          {cameraError && <AlertBox tone="amber" text={cameraError} />}
          {scanError && <AlertBox tone="red" text={scanError} />}
        </article>

        <CredentialResult result={result} data={data || {}} onNavigate={onNavigate} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 text-brand-700" size={22} />
          <div>
            <h3 className="text-lg font-black text-ink">Seguridad del QR</h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
              El QR no contiene usuario, contraseña, PIN ni datos personales. Solo incluye un identificador interno opaco que ALTHEMON compara con los registros autorizados cargados en el ERP.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function CredentialResult({ result, data, onNavigate }) {
  if (!result) {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-full min-h-[24rem] flex-col items-center justify-center text-center">
          <IdCard className="text-slate-300" size={54} />
          <h3 className="mt-4 text-xl font-black text-ink">Resultado del escaneo</h3>
          <p className="mt-2 max-w-sm text-sm text-slate-600">Cuando escanees una credencial oficial, aqui aparecera la informacion operativa correspondiente.</p>
        </div>
      </article>
    );
  }

  if (result.kind === 'beneficiary') return <BeneficiaryScanResult result={result} data={data} onNavigate={onNavigate} />;
  if (result.kind === 'volunteer') return <VolunteerScanResult result={result} data={data} />;
  if (result.kind === 'collaborator') return <CollaboratorScanResult result={result} data={data} />;
  return <DonorScanResult result={result} data={data} />;
}

function BeneficiaryScanResult({ result, data, onNavigate }) {
  const beneficiary = result.record;
  const deliveries = (data.deliveries || []).filter((delivery) => delivery.beneficiary_id === beneficiary.id && isActiveDelivery(delivery));
  const lastDelivery = latestByDate(deliveries, 'delivered_at');
  const receivedToday = deliveries.some((delivery) => sameDay(delivery.delivered_at || delivery.created_at, new Date()));
  const status = beneficiary.is_active === false ? 'Inactivo' : 'Activo';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <ResultHeader result={result} status={status} />
      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
        <CredentialPersonPhoto kind="beneficiary" record={beneficiary} />
        <div className="grid gap-3">
          <InfoRow label="Codigo" value={beneficiary.code || '-'} />
          <InfoRow label="Estado" value={status} />
          <InfoRow label="Ultima entrega" value={lastDelivery ? `${formatDate(lastDelivery.delivered_at || lastDelivery.created_at)} · ${lastDelivery.help_type || 'Ayuda'}` : 'Sin entregas registradas'} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">¿Ha recibido ayuda hoy?</p>
            <p className={`mt-1 text-2xl font-black ${receivedToday ? 'text-emerald-700' : 'text-amber-700'}`}>{receivedToday ? 'SI' : 'NO'}</p>
            {receivedToday ? (
              <p className="mt-2 text-sm font-semibold text-emerald-700">Entrega ya registrada hoy. No se permite registrar otra desde el escaneo.</p>
            ) : (
              <Button className="mt-3 w-full sm:w-auto" onClick={() => onNavigate?.({ moduleId: 'deliveries', filter: 'registrar-entrega', profileId: beneficiary.id })}>
                <PackageCheck size={16} /> Registrar entrega
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function VolunteerScanResult({ result }) {
  const volunteer = result.record;
  const functions = [volunteer.role, volunteer.position, volunteer.availability, volunteer.notes].filter(Boolean).join(' · ') || 'Funciones pendientes de registrar';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <ResultHeader result={result} status={volunteer.status || (volunteer.is_active === false ? 'Inactivo' : 'Activo')} />
      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
        <CredentialPersonPhoto kind="volunteer" record={volunteer} />
        <div className="grid gap-3">
          <InfoRow label="Funciones" value={functions} />
          <InfoRow label="Ultimo acceso" value={volunteer.last_access_at || volunteer.last_login_at ? formatDateTime(volunteer.last_access_at || volunteer.last_login_at) : '-'} />
          <Button variant="secondary" className="w-full sm:w-auto" disabled><UserRoundCheck size={16} /> Registrar entrada</Button>
          <p className="text-xs font-semibold text-slate-500">Preparado para control de voluntariado en una fase posterior.</p>
        </div>
      </div>
    </article>
  );
}

function CollaboratorScanResult({ result, data }) {
  const collaborator = result.record;
  const donations = (data.donations || []).filter((donation) => donation.collaborator_id === collaborator.id || normalize(donation.donor_email) === normalize(collaborator.email || collaborator.access_email));
  const lastDonation = latestByDate(donations, 'donated_at');
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <ResultHeader result={result} status={collaborator.status || (collaborator.is_active === false ? 'Inactivo' : 'Activo')} />
      <div className="mt-5 grid gap-3">
        <InfoRow label="Empresa" value={collaborator.name || collaborator.business_name || collaborator.company_name || '-'} />
        <InfoRow label="Responsable" value={collaborator.contact_name || collaborator.responsible || '-'} />
        <InfoRow label="Ultima colaboracion" value={lastDonation ? `${formatDate(lastDonation.donated_at || lastDonation.created_at)} · ${lastDonation.donation_type || 'Colaboracion'}` : 'Sin colaboraciones registradas'} />
      </div>
    </article>
  );
}

function DonorScanResult({ result, data }) {
  const donor = result.record;
  const donations = (data.donations || []).filter((donation) => donation.donor_id === donor.id || normalize(donation.donor_email) === normalize(donor.email || donor.access_email));
  const lastDonation = latestByDate(donations, 'donated_at');
  const total = donations.reduce((sum, donation) => sum + Number(donation.amount || donation.estimated_value || 0), 0);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <ResultHeader result={result} status={donor.status || (donor.is_active === false ? 'Inactivo' : 'Activo')} />
      <div className="mt-5 grid gap-3">
        <InfoRow label="Ultima donacion" value={lastDonation ? `${formatDate(lastDonation.donated_at || lastDonation.created_at)} · ${lastDonation.donation_type || 'Donacion'}` : 'Sin donaciones registradas'} />
        <InfoRow label="Valor acumulado" value={formatMoney(total)} />
      </div>
    </article>
  );
}

function ResultHeader({ result, status }) {
  const meta = KIND_META[result.kind] || KIND_META.beneficiary;
  const Icon = meta.icon;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-brand-50 p-3 text-brand-700"><Icon size={24} /></span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-700">{meta.label}</p>
          <h3 className="mt-1 text-2xl font-black text-ink">{result.name}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{result.code || 'Sin codigo visible'}</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
        <CheckCircle2 size={14} /> {status}
      </span>
    </div>
  );
}

function CredentialPersonPhoto({ kind, record }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function resolvePhoto() {
      const direct = record.photo_data_url || record.photo_url || record.avatar_url || record.logo_data_url || record.logo_url || '';
      if (direct) {
        if (!cancelled) setSrc(direct);
        return;
      }
      if (kind === 'beneficiary') {
        const photo = await resolveBeneficiaryPhotoUrl(record).catch(() => '');
        if (!cancelled) setSrc(photo || '');
      } else if (!cancelled) {
        setSrc('');
      }
    }
    resolvePhoto();
    return () => { cancelled = true; };
  }, [kind, record]);

  if (src) return <img src={src} alt={record.full_name || record.name || 'Persona'} className="h-36 w-28 rounded-2xl bg-slate-100 object-contain" />;
  return (
    <div className="flex h-36 w-28 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
      <UserRound size={36} />
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-ink">{value || '-'}</p>
    </div>
  );
}

function AlertBox({ tone, text }) {
  const classes = tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div className={`mt-4 flex gap-2 rounded-xl border p-4 text-sm font-semibold ${classes}`} role="alert">
      <AlertTriangle size={18} /> {text}
    </div>
  );
}

function buildCredentialDirectory(data) {
  const entries = [];
  (data.beneficiaries || []).forEach((record) => entries.push(toDirectoryEntry('beneficiary', record, record.full_name || 'Beneficiario', record.code)));
  (data.volunteers || []).forEach((record) => entries.push(toDirectoryEntry('volunteer', record, record.full_name || record.name || 'Voluntario', record.code || record.volunteer_code)));
  (data.collaborators || []).forEach((record) => entries.push(toDirectoryEntry('collaborator', record, record.name || record.business_name || record.company_name || record.contact_name || 'Colaborador', record.code || record.collaborator_code)));
  (data.donors || []).forEach((record) => entries.push(toDirectoryEntry('donor', record, record.name || record.company_name || record.full_name || record.email || 'Donante', record.code || record.donor_code)));
  return entries.filter(Boolean);
}

function toDirectoryEntry(kind, record, name, code) {
  const subjectId = record.id || code || null;
  const credentialId = buildCredentialSecureIdentifier({ kind, subjectId, code });
  if (!credentialId) return null;
  return { kind, record, name, code, credentialId, subjectId, legacyCode: code };
}

function findCredentialMatch(payload, directory) {
  const kind = payload.credential_kind || payload.kind || 'person';
  const candidateIds = new Set([
    payload.credential_id,
    payload.subject_id ? buildCredentialSecureIdentifier({ kind, subjectId: payload.subject_id, code: payload.code }) : '',
    payload.code ? buildCredentialSecureIdentifier({ kind, subjectId: payload.code, code: payload.code }) : ''
  ].filter(Boolean));
  return directory.find((entry) => entry.kind === kind && (candidateIds.has(entry.credentialId) || payload.subject_id === entry.subjectId || payload.code === entry.legacyCode)) || null;
}

function latestByDate(items = [], field) {
  return [...items]
    .filter(Boolean)
    .sort((a, b) => String(b[field] || b.created_at || '').localeCompare(String(a[field] || a.created_at || '')))[0] || null;
}

function sameDay(value, date) {
  if (!value) return false;
  const target = new Date(value);
  return target.getFullYear() === date.getFullYear()
    && target.getMonth() === date.getMonth()
    && target.getDate() === date.getDate();
}

function isActiveDelivery(delivery = {}) {
  const status = normalize(`${delivery.status || ''} ${delivery.state || ''}`);
  return !status.includes('anulad') && !status.includes('cancel');
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}
