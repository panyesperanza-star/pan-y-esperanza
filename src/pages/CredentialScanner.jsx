import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertTriangle, BriefcaseBusiness, Camera, CheckCircle2, Heart, IdCard, Keyboard, PackageCheck, RefreshCw, ScanLine, ShieldCheck, UserRound, UserRoundCheck, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { formatAttendanceDuration } from '../components/VolunteerAttendanceControl';
import { canDo, isPlatformOwner, isSystemSuperadmin } from '../lib/auth';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier, parseOfficialCredentialQr } from '../lib/credentials';
import { formatDate, formatDateTime, normalize } from '../lib/formatters';

const KIND_META = {
  beneficiary: { label: 'Beneficiario', icon: UserRound, tone: 'brand' },
  volunteer: { label: 'Voluntario', icon: UserRoundCheck, tone: 'blue' },
  collaborator: { label: 'Colaborador', icon: BriefcaseBusiness, tone: 'amber' },
  donor: { label: 'Donante', icon: Heart, tone: 'rose' },
  user: { label: 'Usuario del ERP', icon: ShieldCheck, tone: 'brand' }
};

export function CredentialScanner({ data, actions, currentUser, onNavigate }) {
  const scannerRegionId = useRef(`credential-qr-reader-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const scanLockedRef = useRef(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanStatus, setScanStatus] = useState('Esperando lectura de credencial.');
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const directory = useMemo(() => buildCredentialDirectory(data || {}), [data]);
  const canScan = canDo(currentUser, 'credential-scanner', 'scan');
  const canManualIdentify = canDo(currentUser, 'credential-scanner', 'manual-identify');
  const canRegisterDelivery = canDo(currentUser, 'credential-scanner', 'register-delivery');
  const canRegisterVolunteerAttendance = canDo(currentUser, 'volunteers', 'edit');

  useEffect(() => () => stopCamera(), []);

  async function startCamera(cameraId = selectedCameraId) {
    if (!canScan) {
      setCameraError('Tu usuario no tiene permiso para usar la camara del lector de credenciales.');
      setScanStatus('Escaneo no autorizado.');
      return;
    }
    setScanError('');
    setCameraError('');
    setScanStatus('Activando camara...');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este dispositivo no permite abrir la camara desde el navegador.');
      setScanStatus('Camara no disponible.');
      return;
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setCameraError('El navegador solo permite usar la camara en una conexion segura HTTPS.');
      setScanStatus('Camara bloqueada por seguridad.');
      return;
    }

    try {
      await stopCamera({ silent: true });
      scanLockedRef.current = false;
      const cameras = await Html5Qrcode.getCameras();
      setCameraDevices(cameras || []);
      const targetCamera = pickCamera(cameras || [], cameraId);
      if (!targetCamera) throw new Error('No se ha encontrado ninguna camara disponible.');
      setSelectedCameraId(targetCamera.id);
      const scanner = new Html5Qrcode(scannerRegionId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });
      scannerRef.current = scanner;
      await scanner.start(
        targetCamera.id,
        { fps: 12, qrbox: qrboxForViewport },
        async (decodedText) => {
          if (scanLockedRef.current) return;
          scanLockedRef.current = true;
          setScanStatus('QR leido. Identificando credencial...');
          await stopCamera({ silent: true });
          handleCredential(decodedText);
        },
        () => {}
      );
      setIsCameraActive(true);
      setScanStatus('Enfoca el QR de la credencial.');
    } catch (error) {
      console.error('[CredentialScanner] No se pudo abrir la camara', error);
      setCameraError(cameraErrorMessage(error));
      setScanStatus('Camara no disponible.');
      await stopCamera({ silent: true });
    }
  }

  async function stopCamera(options = {}) {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    scanLockedRef.current = false;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        await scanner.clear();
      } catch (error) {
        console.warn('[CredentialScanner] No se pudo cerrar el lector QR limpiamente', error);
      }
    }
    setIsCameraActive(false);
    if (!options.silent) setScanStatus('Camara cerrada.');
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
    if (match.kind === 'beneficiary' && !match.invalidCredential && canRegisterDelivery) {
      setResult(null);
      setScanError('');
      setScanStatus('Abriendo modo reparto inteligente...');
      onNavigate?.({ moduleId: 'smart-deliveries', profileId: match.record.id });
      return;
    }
    const volunteerAttendance = resolveVolunteerAttendanceCandidate(match, data || {});
    if (volunteerAttendance.eligible) {
      registerVolunteerAttendanceFromScan(volunteerAttendance);
      return;
    }
    setResult(match);
    setScanError('');
    setScanStatus('Credencial identificada correctamente.');
  }

  async function registerVolunteerAttendanceFromScan(candidate) {
    console.info('[CredentialScanner] Diagnostico fichaje voluntariado', candidate.diagnostic);
    if (!candidate.volunteer) {
      setResult(candidate.match);
      setScanError(candidate.error || 'No se ha podido localizar el expediente de voluntariado vinculado.');
      setScanStatus('Fichaje no registrado.');
      return;
    }
    if (!canRegisterVolunteerAttendance || !actions?.toggleVolunteerAttendance) {
      setResult(candidate.match);
      setScanError('Tu usuario no tiene permiso para registrar fichajes de voluntariado.');
      setScanStatus('Fichaje no autorizado.');
      return;
    }
    try {
      setResult(null);
      setScanError('');
      setScanStatus('Registrando fichaje de voluntariado...');
      const attendance = await actions.toggleVolunteerAttendance({
        volunteer_id: candidate.volunteer.id,
        person_identity_id: candidate.volunteer.person_identity_id || candidate.appUser?.person_identity_id || null,
        method: 'qr',
        credential_uid: candidate.credentialUid,
        activity_type: 'General',
        activity_label: 'Voluntariado',
        device_info: browserDeviceLabel()
      });
      setResult({
        kind: 'volunteer-attendance',
        record: candidate.volunteer,
        name: candidate.volunteer.full_name || candidate.volunteer.name || candidate.appUser?.full_name || 'Voluntario',
        code: candidate.volunteer.code || candidate.volunteer.volunteer_code || candidate.match.code || '',
        credentialId: candidate.credentialUid,
        attendance,
        diagnostic: {
          ...candidate.diagnostic,
          router_result: attendance?.type === 'exit' ? 'SALIDA registrada' : 'ENTRADA registrada'
        }
      });
      setScanStatus(attendance?.message || 'Fichaje registrado.');
    } catch (error) {
      console.error('[CredentialScanner] No se pudo registrar el fichaje de voluntariado', error);
      setResult(candidate.match);
      setScanError(error.message || 'No se pudo registrar el fichaje de voluntariado.');
      setScanStatus('Fichaje no registrado.');
    }
  }

  function identifyManualCode(event) {
    event.preventDefault();
    if (!canManualIdentify) {
      setResult(null);
      setScanError('Tu usuario no tiene permiso para identificar credenciales manualmente.');
      setScanStatus('Identificacion manual no autorizada.');
      return;
    }
    setScanError('');
    setCameraError('');
    const match = findManualCredentialMatch(manualCode, directory);
    if (!match) {
      setResult(null);
      setScanError('No se ha encontrado ninguna credencial con ese codigo.');
      setScanStatus('Código no localizado.');
      return;
    }
    setResult(match);
    setScanStatus('Persona identificada mediante codigo manual.');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escanear credencial"
        description="Lector QR integrado en ALTHEMON para identificar credenciales oficiales sin exponer datos personales en el QR."
        actions={<Button disabled={!canScan} onClick={isCameraActive ? () => stopCamera() : () => startCamera()}>{isCameraActive ? <XCircle size={16} /> : <Camera size={16} />} {isCameraActive ? 'Cerrar camara' : 'Escanear credencial'}</Button>}
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

          <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            <div
              id={scannerRegionId}
              className="aspect-video w-full overflow-hidden bg-slate-950 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
            />
            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
                <ScanLine size={46} />
                <p className="text-lg font-black">Pulsa "Escanear credencial" y enfoca el QR.</p>
                <p className="max-w-md text-sm text-slate-300">El escaneo se realiza en este navegador. No se instala ninguna aplicacion externa.</p>
              </div>
            )}
          </div>

          {cameraDevices.length > 1 && (
            <label className="mt-4 block text-sm font-bold text-slate-700">
              Camara
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                value={selectedCameraId}
                onChange={(event) => {
                  setSelectedCameraId(event.target.value);
                  if (isCameraActive) startCamera(event.target.value);
                }}
              >
                {cameraDevices.map((camera) => <option key={camera.id} value={camera.id}>{camera.label || 'Camara disponible'}</option>)}
              </select>
            </label>
          )}

          <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm font-semibold text-brand-800">
            <p>{scanStatus}</p>
          </div>
          {cameraError && <AlertBox tone="amber" text={cameraError} action={canScan ? <Button variant="secondary" onClick={() => startCamera()}><RefreshCw size={16} /> Reintentar</Button> : null} />}
          {scanError && <AlertBox tone="red" text={scanError} />}

          <form onSubmit={identifyManualCode} className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
              <Keyboard size={16} /> Identificacion manual
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                className="min-h-11 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="PYE-00001"
                disabled={!canManualIdentify}
              />
              <Button type="submit" disabled={!canManualIdentify}>Identificar persona</Button>
            </div>
          </form>
        </article>

        <CredentialResult result={result} data={data || {}} canRegisterDelivery={canRegisterDelivery} onNavigate={onNavigate} />
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

function CredentialResult({ result, data, canRegisterDelivery, onNavigate }) {
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

  if (result.invalidCredential) return <InvalidScanResult result={result} />;
  if (result.kind === 'volunteer-attendance') return <VolunteerAttendanceScanResult result={result} />;
  if (result.kind === 'beneficiary') return <BeneficiaryScanResult result={result} data={data} canRegisterDelivery={canRegisterDelivery} onNavigate={onNavigate} />;
  if (result.kind === 'volunteer') return <VolunteerScanResult result={result} data={data} />;
  if (result.kind === 'collaborator') return <CollaboratorScanResult result={result} data={data} />;
  if (result.kind === 'user') return <UserScanResult result={result} />;
  return <DonorScanResult result={result} data={data} />;
}

function InvalidScanResult({ result }) {
  return (
    <article className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-white p-3 text-red-700"><AlertTriangle size={26} /></span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-700">Credencial no vigente</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">{result.message || 'CREDENCIAL ANULADA'}</h3>
          <p className="mt-2 max-w-md text-sm font-semibold text-red-700">
            Por seguridad no se muestran datos personales de una credencial revocada, caducada, suspendida o sustituida.
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3">
        <InfoRow label="ID de credencial" value={result.credentialId || '-'} />
        <InfoRow label="Estado" value={statusLabelFromRegistry(result.credentialStatus) || 'No vigente'} />
        <InfoRow label="Motivo" value={result.credentialStatusReason || result.message || 'Credencial no activa'} />
      </dl>
    </article>
  );
}

function BeneficiaryScanResult({ result, data, canRegisterDelivery, onNavigate }) {
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
          <InfoRow label="Código" value={beneficiary.code || '-'} />
          <InfoRow label="Estado" value={status} />
          <InfoRow label="Ultima entrega" value={lastDelivery ? `${formatDate(lastDelivery.delivered_at || lastDelivery.created_at)} · ${lastDelivery.help_type || 'Ayuda'}` : 'Sin entregas registradas'} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">¿Ha recibido ayuda hoy?</p>
            <p className={`mt-1 text-2xl font-black ${receivedToday ? 'text-emerald-700' : 'text-amber-700'}`}>{receivedToday ? 'SI' : 'NO'}</p>
            {receivedToday ? (
              <p className="mt-2 text-sm font-semibold text-emerald-700">Entrega ya registrada hoy. No se permite registrar otra desde el escaneo.</p>
            ) : (
              <Button className="mt-3 w-full sm:w-auto" disabled={!canRegisterDelivery} onClick={() => onNavigate?.({ moduleId: 'smart-deliveries', profileId: beneficiary.id })}>
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

function VolunteerAttendanceScanResult({ result }) {
  const volunteer = result.record;
  const attendance = result.attendance || {};
  const entry = attendance.entry || {};
  const isExit = attendance.type === 'exit';
  return (
    <article className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <ResultHeader result={{ ...result, kind: 'volunteer' }} status={isExit ? 'Jornada finalizada' : 'Jornada iniciada'} />
      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
        <CredentialPersonPhoto kind="volunteer" record={volunteer} />
        <div className="grid gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{isExit ? 'SALIDA registrada' : 'ENTRADA registrada'}</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{volunteer.full_name || volunteer.name || 'Voluntario'}</p>
          </div>
          <InfoRow label="Credencial utilizada" value={result.credentialId || '-'} />
          <InfoRow label="Entrada" value={entry.check_in_at ? formatDateTime(entry.check_in_at) : '-'} />
          {isExit && <InfoRow label="Salida" value={entry.check_out_at ? formatDateTime(entry.check_out_at) : '-'} />}
          {isExit && <InfoRow label="Duracion" value={formatAttendanceDuration(entry.total_minutes || 0)} />}
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

function UserScanResult({ result }) {
  const user = result.record;
  const status = user.status || (user.is_active === false ? 'Inactivo' : 'Activo');
  const role = [user.position, user.role].filter(Boolean).join(' · ') || 'Rol interno';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <ResultHeader result={result} status={status} />
      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
        <CredentialPersonPhoto kind="user" record={user} />
        <div className="grid gap-3">
          <InfoRow label="Cargo y rol" value={role} />
          <InfoRow label="Ultimo acceso" value={user.last_access_at ? formatDateTime(user.last_access_at) : '-'} />
          <Button variant="secondary" className="w-full sm:w-auto" disabled><ShieldCheck size={16} /> Validacion interna</Button>
          <p className="text-xs font-semibold text-slate-500">Preparado para control de acceso, fichaje y operaciones internas.</p>
        </div>
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
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand-700">ID: {result.credentialId}</p>
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
      const direct = record.photo_data_url || record.photo_url || record.avatar_url || record.profile_photo || record.logo_data_url || record.logo_url || '';
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

function AlertBox({ tone, text, action = null }) {
  const classes = tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${classes}`} role="alert">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
        <p>{text}</p>
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function buildCredentialDirectory(data) {
  const entries = [];
  (data.beneficiaries || []).forEach((record) => entries.push(toDirectoryEntry('beneficiary', record, record.full_name || 'Beneficiario', record.code)));
  (data.volunteers || []).forEach((record) => entries.push(toDirectoryEntry('volunteer', record, record.full_name || record.name || 'Voluntario', record.code || record.volunteer_code)));
  (data.collaborators || []).forEach((record) => entries.push(toDirectoryEntry('collaborator', record, record.name || record.business_name || record.company_name || record.contact_name || 'Colaborador', record.code || record.collaborator_code)));
  (data.donors || []).forEach((record) => entries.push(toDirectoryEntry('donor', record, record.name || record.company_name || record.full_name || record.email || 'Donante', record.code || record.donor_code)));
  const erpUsers = (data.app_users || []).filter((record) => !isSystemSuperadmin(record) && !isPlatformOwner(record));
  erpUsers.forEach((record, index, source) => entries.push(toDirectoryEntry('user', record, userDisplayName(record), userCredentialCode(record, source))));
  const subjectEntries = entries.filter(Boolean);
  const bySubject = new Map(subjectEntries.map((entry) => [`${entry.kind}:${entry.subjectId}`, entry]));
  const byCredentialId = new Set(subjectEntries.map((entry) => normalizeCredentialIdentifier(entry.credentialId)));

  (data.official_credential_registry || []).forEach((credential) => {
    const credentialId = normalizeCredentialIdentifier(credential.credential_uid);
    if (!credentialId || byCredentialId.has(credentialId)) return;
    const subjectEntry = bySubject.get(`${credential.subject_type}:${credential.subject_id}`);
    subjectEntries.push(toRegistryCredentialEntry(credential, subjectEntry));
    byCredentialId.add(credentialId);
  });

  return subjectEntries.filter(Boolean);
}

function toDirectoryEntry(kind, record, name, code) {
  const subjectId = record.id || code || null;
  const storedCredentialId = normalizeCredentialIdentifier(record.credential_uid || record.official_credential_id || record.credential_id);
  const legacyCredentialId = buildCredentialSecureIdentifier({ kind, subjectId, code });
  const credentialId = storedCredentialId || legacyCredentialId;
  if (!credentialId) return null;
  return {
    kind,
    record,
    name,
    code,
    credentialId,
    legacyCredentialId,
    subjectId,
    legacyCode: code,
    credentialStatus: record.credential_status || 'active',
    credentialStatusReason: record.credential_status_reason || '',
    credentialQrVersion: Number.parseInt(String(record.credential_qr_version || 1), 10) || 1
  };
}

function toRegistryCredentialEntry(credential = {}, subjectEntry = null) {
  const credentialId = normalizeCredentialIdentifier(credential.credential_uid);
  return {
    kind: credential.subject_type || subjectEntry?.kind || 'beneficiary',
    record: credential.status === 'active' ? subjectEntry?.record || null : null,
    name: credential.status === 'active' ? subjectEntry?.name || '' : '',
    code: credential.status === 'active' ? subjectEntry?.code || '' : '',
    credentialId,
    legacyCredentialId: '',
    subjectId: credential.subject_id,
    legacyCode: subjectEntry?.legacyCode || '',
    credentialStatus: credential.status || 'revoked',
    credentialStatusReason: credential.status_reason || '',
    credentialQrVersion: Number.parseInt(String(credential.qr_version || 1), 10) || 1,
    invalidCredential: credential.status !== 'active',
    revokedAt: credential.revoked_at || null,
    message: invalidCredentialMessage(credential.status, credential.status_reason)
  };
}

function findCredentialMatch(payload, directory) {
  const kind = payload.credential_kind || (payload.kind && payload.kind !== 'official-credential' ? payload.kind : '');
  const scannedCredentialId = normalizeCredentialIdentifier(payload.credential_id || payload.credential_uid);
  const scannedQrVersion = Number.parseInt(String(payload.qr_version || ''), 10);
  const candidateIds = new Set([
    scannedCredentialId,
    payload.subject_id ? buildCredentialSecureIdentifier({ kind, subjectId: payload.subject_id, code: payload.code }) : '',
    payload.code ? buildCredentialSecureIdentifier({ kind, subjectId: payload.code, code: payload.code }) : ''
  ].filter(Boolean).map(normalizeCredentialIdentifier));
  for (const entry of directory) {
    if (kind && entry.kind !== kind) continue;
    const matches = (
      candidateIds.has(normalizeCredentialIdentifier(entry.credentialId))
      || candidateIds.has(normalizeCredentialIdentifier(entry.legacyCredentialId))
      || payload.subject_id === entry.subjectId
      || payload.code === entry.legacyCode
    );
    if (!matches) continue;

    const currentVersion = Number.parseInt(String(entry.credentialQrVersion || entry.record?.credential_qr_version || 1), 10) || 1;
    if (Number.isFinite(scannedQrVersion) && scannedQrVersion > 0 && currentVersion !== scannedQrVersion) {
      return {
        ...entry,
        record: null,
        name: '',
        code: '',
        invalidCredential: true,
        credentialStatus: 'revoked',
        credentialStatusReason: 'QR obsoleto o no vigente.',
        message: 'CREDENCIAL ANULADA'
      };
    }
    if (entry.invalidCredential || entry.credentialStatus !== 'active' || !entry.record) {
      return {
        ...entry,
        record: null,
        name: '',
        code: '',
        invalidCredential: true,
        message: invalidCredentialMessage(entry.credentialStatus, entry.credentialStatusReason)
      };
    }
    return entry;
  }
  return null;
}

function findManualCredentialMatch(value, directory = []) {
  const code = normalizeCredentialCode(value);
  if (!code) return null;
  const match = directory.find((entry) => (
    normalizeCredentialCode(entry.credentialId) === code
    || normalizeCredentialCode(entry.code || entry.legacyCode) === code
  )) || null;
  if (!match) return null;
  if (match.invalidCredential || match.credentialStatus !== 'active' || !match.record) {
    return {
      ...match,
      record: null,
      name: '',
      code: '',
      invalidCredential: true,
      message: invalidCredentialMessage(match.credentialStatus, match.credentialStatusReason)
    };
  }
  return match;
}

function resolveVolunteerAttendanceCandidate(match = {}, data = {}) {
  if (!match || match.invalidCredential || !match.record) return { eligible: false };
  const volunteers = data.volunteers || [];
  const users = data.app_users || [];
  let appUser = null;
  let volunteer = null;

  if (match.kind === 'user') {
    appUser = match.record;
    if (!appUser?.participates_as_volunteer) return { eligible: false };
    volunteer = volunteers.find((item) => item.person_identity_id && item.person_identity_id === appUser.person_identity_id) || null;
  } else if (match.kind === 'volunteer') {
    volunteer = match.record;
    appUser = users.find((item) => item.person_identity_id && volunteer?.person_identity_id && item.person_identity_id === volunteer.person_identity_id) || null;
  } else {
    return { eligible: false };
  }

  const diagnostic = volunteerAttendanceDiagnostic(match, appUser, volunteer, 'Preparado para fichaje por identidad unica');
  if (!volunteer) {
    return {
      eligible: true,
      match,
      appUser,
      volunteer: null,
      credentialUid: match.credentialId || '',
      diagnostic,
      error: match.kind === 'user'
        ? 'El usuario ERP participa como voluntario, pero no tiene expediente de voluntariado vinculado a la misma identidad.'
        : 'La credencial no pertenece a un expediente de voluntariado vinculado.'
    };
  }
  if (!isVolunteerRecordActive(volunteer)) {
    return {
      eligible: true,
      match,
      appUser,
      volunteer: null,
      credentialUid: match.credentialId || '',
      diagnostic,
      error: 'El expediente de voluntariado vinculado no esta activo.'
    };
  }
  return {
    eligible: true,
    match,
    appUser,
    volunteer,
    credentialUid: match.credentialId || volunteer.credential_uid || volunteer.official_credential_id || '',
    diagnostic
  };
}

function volunteerAttendanceDiagnostic(match = {}, appUser = null, volunteer = null, routerResult = '') {
  return {
    credential_uid: match.credentialId || '',
    app_user_id: appUser?.id || null,
    user_person_identity_id: appUser?.person_identity_id || null,
    participates_as_volunteer: Boolean(appUser?.participates_as_volunteer),
    volunteer_id: volunteer?.id || null,
    volunteer_person_identity_id: volunteer?.person_identity_id || null,
    volunteer_status: volunteer?.status || null,
    router_result: routerResult
  };
}

function isVolunteerRecordActive(volunteer = {}) {
  if (!volunteer?.id || volunteer.left_at) return false;
  const status = normalize(volunteer.status || '');
  return !status.includes('baja') && !status.includes('inactiv') && !status.includes('archivad');
}

function invalidCredentialMessage(status, reason = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'revoked') return 'CREDENCIAL ANULADA';
  if (normalizedStatus === 'expired') return 'Esta credencial ha caducado y ya no es válida.';
  if (normalizedStatus === 'suspended') return 'Esta credencial está suspendida temporalmente.';
  if (normalizedStatus === 'inactive') return 'Esta credencial está inactiva.';
  return reason || 'Esta credencial ya no es válida.';
}

function statusLabelFromRegistry(status) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'active') return 'Activa';
  if (normalizedStatus === 'suspended') return 'Suspendida';
  if (normalizedStatus === 'revoked') return 'Revocada';
  if (normalizedStatus === 'expired') return 'Caducada';
  if (normalizedStatus === 'inactive') return 'Inactiva';
  return '';
}

function normalizeCredentialIdentifier(value) {
  return String(value || '').trim();
}

function normalizeCredentialCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function userDisplayName(user = {}) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.full_name || user.name || user.email || 'Usuario del ERP';
}

function userCredentialCode(user = {}, users = []) {
  const existing = user.code || user.user_code || user.employee_code;
  if (existing) return existing;
  const sorted = [...users].sort((left, right) => {
    const leftDate = new Date(left.created_at || 0).getTime();
    const rightDate = new Date(right.created_at || 0).getTime();
    if (leftDate !== rightDate) return leftDate - rightDate;
    return String(left.email || left.id || '').localeCompare(String(right.email || right.id || ''));
  });
  const index = sorted.findIndex((item) => item.id === user.id || (item.email && item.email === user.email));
  return `USR-${String(index >= 0 ? index + 1 : 0).padStart(5, '0')}`;
}

function pickCamera(cameras = [], preferredId = '') {
  if (preferredId) {
    const preferred = cameras.find((camera) => camera.id === preferredId);
    if (preferred) return preferred;
  }
  const rearCamera = cameras.find((camera) => /back|rear|environment|trasera|posterior|atr/i.test(camera.label || ''));
  if (rearCamera) return rearCamera;
  return cameras[cameras.length - 1] || cameras[0] || null;
}

function qrboxForViewport(viewfinderWidth, viewfinderHeight) {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.floor(Math.max(180, Math.min(minEdge * 0.72, 320)));
  return { width: size, height: size };
}

function cameraErrorMessage(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  if (name.includes('notallowed') || name.includes('permission') || message.includes('permission')) {
    return 'Permiso de camara denegado. Activa el permiso de camara en el navegador y pulsa Reintentar.';
  }
  if (name.includes('notfound') || message.includes('requested device not found')) {
    return 'No se ha encontrado ninguna camara disponible en este dispositivo.';
  }
  if (name.includes('notreadable') || name.includes('trackstarterror')) {
    return 'La camara esta ocupada por otra aplicacion o el sistema no permite iniciarla.';
  }
  if (name.includes('overconstrained') || message.includes('constraint')) {
    return 'La camara seleccionada no cumple los requisitos. Prueba con otra camara disponible.';
  }
  if (message.includes('secure') || message.includes('https')) {
    return 'El navegador solo permite usar la camara en HTTPS.';
  }
  return error?.message || 'No se ha podido iniciar la camara. Revisa permisos y vuelve a intentarlo.';
}

function browserDeviceLabel() {
  if (typeof navigator === 'undefined') return '';
  return [navigator.platform, navigator.userAgent].filter(Boolean).join(' | ').slice(0, 500);
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
