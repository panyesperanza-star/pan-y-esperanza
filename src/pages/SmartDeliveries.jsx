import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertTriangle, ArrowLeft, Baby, Camera, CheckCircle2, Clock, IdCard, Keyboard, Loader2, PackageCheck, RefreshCw, Search, ScanLine, ShieldAlert, UserRound, UsersRound, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { canDo } from '../lib/auth';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier, parseOfficialCredentialQr } from '../lib/credentials';
import { formatDate, normalize, todayISO } from '../lib/formatters';
import { SignatureCaptureField } from './Deliveries';

export function SmartDeliveries({ data, actions, currentUser, navigationTarget, onNavigate }) {
  const scannerRegionId = useRef(`smart-delivery-reader-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const scanLockedRef = useRef(false);
  const resetTimerRef = useRef(null);
  const prefilledProfileRef = useRef('');
  const duplicateLogRef = useRef('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanStatus, setScanStatus] = useState('Listo para escanear.');
  const [manualQuery, setManualQuery] = useState('');
  const [manualMatches, setManualMatches] = useState([]);
  const [result, setResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [signatureFlow, setSignatureFlow] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [recentDeliveries, setRecentDeliveries] = useState([]);
  const [repartoSession, setRepartoSession] = useState(() => createRepartoSession(currentUser));
  const directory = useMemo(() => buildBeneficiaryCredentialDirectory(data || {}), [data]);
  const canScan = canDo(currentUser, 'smart-deliveries', 'view');
  const canRegister = canDo(currentUser, 'smart-deliveries', 'create') || canDo(currentUser, 'deliveries', 'create');

  useEffect(() => () => {
    stopCamera();
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
  }, []);

  useEffect(() => {
    const profileId = navigationTarget?.moduleId === 'smart-deliveries' ? navigationTarget.profileId : '';
    if (!profileId || prefilledProfileRef.current === profileId) return;

    const beneficiary = (data?.beneficiaries || []).find((item) => item.id === profileId);
    if (!beneficiary) {
      if ((data?.beneficiaries || []).length) {
        prefilledProfileRef.current = profileId;
        setResult({
          type: 'invalid',
          title: 'Beneficiario no localizado',
          message: 'No se ha encontrado el beneficiario seleccionado para el modo reparto.'
        });
        setScanStatus('Beneficiario no localizado.');
        onNavigate?.({ moduleId: 'smart-deliveries' });
      }
      return;
    }

    prefilledProfileRef.current = profileId;
    void stopCamera({ silent: true });
    selectBeneficiary(beneficiary, 'qr');
    onNavigate?.({ moduleId: 'smart-deliveries' });
  }, [data?.beneficiaries, navigationTarget?.moduleId, navigationTarget?.profileId]);

  async function startCamera(cameraId = selectedCameraId) {
    if (!canScan) {
      setCameraError('Tu usuario no tiene permiso para usar el modo reparto.');
      setScanStatus('Escaneo no autorizado.');
      return;
    }
    setCameraError('');
    setRegisterError('');
    setFeedback(null);
    setSignatureFlow(null);
    setScanStatus('Activando camara...');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este dispositivo no permite abrir la camara desde el navegador.');
      setScanStatus('Camara no disponible.');
      return;
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setCameraError('La camara solo puede usarse en HTTPS.');
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
        { fps: 14, qrbox: qrboxForViewport },
        async (decodedText) => {
          if (scanLockedRef.current) return;
          scanLockedRef.current = true;
          setScanStatus('QR leido. Identificando beneficiario...');
          await stopCamera({ silent: true });
          handleCredential(decodedText);
        },
        () => {}
      );
      setIsCameraActive(true);
      setScanStatus('Camara activa. Escanea una credencial oficial.');
    } catch (error) {
      console.error('[Entregas inteligentes] Error al iniciar camara', error);
      await stopCamera({ silent: true });
      setCameraError(cameraErrorMessage(error));
      setScanStatus('No se pudo iniciar la camara.');
    }
  }

  async function stopCamera(options = {}) {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) {
      if (!options.silent) setIsCameraActive(false);
      return;
    }
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch (error) {
      if (!options.silent) console.warn('[Entregas inteligentes] No se pudo detener la camara', error);
    } finally {
      setIsCameraActive(false);
    }
  }

  function handleCredential(rawValue) {
    setManualMatches([]);
    setRegisterError('');
    const payload = parseOfficialCredentialQr(rawValue);
    if (!payload) {
      setResult({
        type: 'invalid',
        title: 'QR no reconocido',
        message: 'Esta lectura no corresponde a una credencial oficial de ALTHEMON.'
      });
      setScanStatus('QR no reconocido.');
      return;
    }
    const match = findBeneficiaryCredentialMatch(payload, directory);
    if (!match) {
      setResult({
        type: 'invalid',
        title: 'Credencial no localizada',
        message: 'No se ha encontrado una credencial activa asociada a un beneficiario.'
      });
      setScanStatus('Credencial no localizada.');
      return;
    }
    if (match.invalidCredential) {
      appendRepartoEvent('incident', {
        title: 'Credencial anulada',
        detail: match.credentialStatusReason || match.message || 'Credencial no activa',
        at: new Date().toISOString()
      });
      setResult({
        type: 'revoked',
        credentialId: match.credentialId,
        title: 'CREDENCIAL ANULADA',
        message: match.credentialStatusReason || match.message || 'Esta credencial no esta activa.'
      });
      setScanStatus('Credencial anulada.');
      return;
    }
    setResult({ type: 'beneficiary', source: 'qr', entry: match, beneficiary: match.record });
    setScanStatus('Beneficiario identificado.');
  }

  function searchBeneficiary(event) {
    event.preventDefault();
    setRegisterError('');
    setFeedback(null);
    setSignatureFlow(null);
    const matches = findBeneficiaryMatches(manualQuery, data?.beneficiaries || []);
    setManualMatches(matches);
    if (!matches.length) {
      setResult({
        type: 'invalid',
        title: 'Sin resultados',
        message: 'No se ha encontrado ningun beneficiario con esos datos.'
      });
      return;
    }
    if (matches.length === 1) selectBeneficiary(matches[0], 'manual');
  }

  function selectBeneficiary(beneficiary, source = 'manual') {
    const entry = directory.find((item) => item.record?.id === beneficiary.id) || toBeneficiaryDirectoryEntry(beneficiary);
    setResult({ type: 'beneficiary', source, entry, beneficiary });
    setManualMatches([]);
    setManualQuery('');
    setSignatureFlow(null);
    setScanStatus(source === 'qr' ? 'Beneficiario identificado desde credencial.' : 'Beneficiario identificado por busqueda manual.');
  }

  function beginSignatureFlow(summary) {
    if (!summary?.beneficiary || summary.receivedToday || summary.blocked) return;
    setRegisterError('');
    setFeedback(null);
    setSignatureFlow({
      summary,
      step: 'collector',
      collectorType: 'holder',
      authorizedName: '',
      authorizedRelation: '',
      beneficiarySignature: '',
      responsibleSignature: '',
      responsibleName: currentUserName(currentUser),
      cannotSign: false,
      noSignReason: '',
      error: ''
    });
    setResult(null);
    setManualQuery('');
    setManualMatches([]);
    setScanStatus('Pendiente de confirmar quien recoge la ayuda.');
  }

  function updateSignatureFlow(patch) {
    setSignatureFlow((current) => current ? { ...current, ...patch, error: patch.error ?? '' } : current);
  }

  function confirmCollector() {
    setSignatureFlow((current) => {
      if (!current) return current;
      if (current.collectorType === 'authorized') {
        if (!String(current.authorizedName || '').trim()) {
          return { ...current, error: 'Indica el nombre de la persona autorizada.' };
        }
        if (!String(current.authorizedRelation || '').trim()) {
          return { ...current, error: 'Indica la relacion con el beneficiario.' };
        }
      }
      return { ...current, step: 'beneficiary', error: '' };
    });
    setScanStatus('Pendiente de firma de la persona que recoge la ayuda.');
  }

  function confirmBeneficiarySignature() {
    setSignatureFlow((current) => {
      if (!current) return current;
      if (current.cannotSign && !current.noSignReason) {
        return { ...current, error: 'Indica el motivo por el que no puede firmar.' };
      }
      if (!current.cannotSign && !current.beneficiarySignature) {
        return { ...current, error: 'La firma de la persona que recoge la ayuda es obligatoria.' };
      }
      return { ...current, step: 'responsible', error: '' };
    });
    setScanStatus('Pendiente de firma del usuario que realiza la entrega.');
  }

  async function completeSignedDelivery() {
    if (!signatureFlow) return;
    if (signatureFlow.cannotSign && !signatureFlow.noSignReason) {
      updateSignatureFlow({ error: 'Indica el motivo por el que no puede firmar.' });
      return;
    }
    if (!signatureFlow.cannotSign && !signatureFlow.beneficiarySignature) {
      updateSignatureFlow({ error: 'La firma de la persona que recoge la ayuda es obligatoria.' });
      return;
    }
    if (!signatureFlow.responsibleSignature) {
      updateSignatureFlow({ error: 'La firma del usuario que realiza la entrega es obligatoria.' });
      return;
    }
    await registerDelivery(signatureFlow.summary, signatureFlow);
  }

  function cancelSignatureFlow() {
    setSignatureFlow(null);
    setScanStatus('Firma cancelada. Preparando siguiente lectura...');
    scheduleReturnToScanner(300);
  }

  async function registerDelivery(summary, flow) {
    if (!summary?.beneficiary || summary.receivedToday || summary.blocked) return;
    setRegistering(true);
    setRegisterError('');
    setFeedback(null);
    try {
      const now = new Date();
      const registeredBy = currentUserName(currentUser);
      const collection = buildCollectionInfo(summary, flow);
      const receiverSignature = flow.cannotSign
        ? buildCannotSignAttestationDataUrl({ summary, flow, registeredBy, date: now })
        : flow.beneficiarySignature;
      const preparedBatch = summary.preparedBatch;
      const payload = {
        beneficiary_id: summary.beneficiary.id,
        delivered_at: todayISO(),
        delivered_time: now.toTimeString().slice(0, 5),
        reception_at: now.toISOString(),
        responsible: registeredBy,
        help_type: preparedBatch?.helpType || 'Alimentos',
        quantity: preparedBatch?.quantity || 1,
        inventory_item_id: preparedBatch?.inventoryItemId || null,
        receiver_name: collection.receiverName,
        receiver_document_id: collection.receiverDocument,
        signature_data_url: receiverSignature,
        responsible_signature_data_url: flow.responsibleSignature,
        notes: buildSmartDeliveryNotes({ summary, flow, collection, registeredBy, date: now })
      };
      await (actions.createSmartDelivery || actions.createDelivery)(payload);
      setRecentDeliveries((current) => [
        { id: `smart-${Date.now()}`, ...payload, created_at: now.toISOString(), status: 'Completada' },
        ...current
      ]);
      setFeedback({
        type: 'success',
        beneficiaryName: summary.beneficiary.full_name || 'Beneficiario',
        time: formatTime(now),
        peopleCount: summary.peopleCount,
        registeredBy
      });
      appendRepartoEvent('delivery', {
        beneficiaryName: summary.beneficiary.full_name || 'Beneficiario',
        peopleCount: summary.peopleCount,
        productLabel: preparedBatch?.label || payload.help_type,
        signatureCount: flow.cannotSign ? 1 : 2,
        cannotSign: flow.cannotSign,
        incident: flow.cannotSign ? `No puede firmar: ${flow.noSignReason}` : '',
        registeredBy,
        at: now.toISOString()
      });
      setSignatureFlow(null);
      setResult(null);
      setManualQuery('');
      setManualMatches([]);
      setScanStatus('Entrega registrada. Preparando siguiente lectura...');
      scheduleReturnToScanner(2000);
    } catch (error) {
      console.error('[Entregas inteligentes] Error al registrar entrega', error);
      setRegisterError(error.message || 'No se pudo registrar la entrega.');
    } finally {
      setRegistering(false);
    }
  }

  function appendRepartoEvent(type, entry = {}) {
    setRepartoSession((current) => updateRepartoSession(current, type, {
      ...entry,
      user: currentUserName(currentUser)
    }));
  }

  function finishRepartoSession() {
    setRepartoSession((current) => ({
      ...current,
      endedAt: current.endedAt || new Date().toISOString(),
      users: uniqueValues([...current.users, currentUserName(currentUser)].filter(Boolean))
    }));
  }

  const summary = result?.type === 'beneficiary'
    ? buildBeneficiarySummary({
      beneficiary: result.beneficiary,
      data,
      recentDeliveries,
      credentialEntry: result.entry,
      source: result.source
    })
    : null;

  useEffect(() => {
    if (!summary?.receivedToday) return;
    const duplicateKey = `${summary.beneficiary.id}-${summary.todayDeliveryDateTime || 'today'}`;
    if (duplicateLogRef.current !== duplicateKey) {
      duplicateLogRef.current = duplicateKey;
      appendRepartoEvent('duplicate', {
        beneficiaryName: summary.beneficiary.full_name || 'Beneficiario',
        lastDeliveryDateTime: summary.todayDeliveryDateTime,
        registeredBy: summary.todayDeliveryResponsible,
        at: new Date().toISOString()
      });
    }
    setFeedback({
      type: 'duplicate',
      lastDeliveryDateTime: summary.todayDeliveryDateTime,
      registeredBy: summary.todayDeliveryResponsible
    });
    setResult(null);
    setSignatureFlow(null);
    setManualQuery('');
    setManualMatches([]);
    setScanStatus('Entrega ya registrada hoy. Preparando siguiente lectura...');
    scheduleReturnToScanner(5000);
  }, [summary?.beneficiary?.id, summary?.receivedToday]);

  function scheduleReturnToScanner(delayMs) {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      startCamera();
    }, delayMs);
  }

  function returnToScannerNow() {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    setFeedback(null);
    startCamera();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e7f5ee_0,#f8faf8_34%,#eef4f1_100%)] text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100/80 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-brand-700">ALTHEMON · Modo reparto</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl">Entregas Inteligentes</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">Escanear, confirmar y registrar. Flujo preparado para repartos de alta velocidad.</p>
          </div>
          <Button variant="secondary" onClick={() => onNavigate?.('deliveries')} className="h-12 px-4">
            <ArrowLeft size={18} /> Volver al ERP
          </Button>
        </header>

        {feedback && <DeliveryFeedbackOverlay feedback={feedback} onAccept={returnToScannerNow} />}

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(28rem,1.18fr)]">
          <div className="rounded-[2rem] border border-white/80 bg-white/90 p-4 shadow-2xl shadow-brand-900/10 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-700">Identificacion</p>
                <h2 className="text-2xl font-black text-ink">Lector QR</h2>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${isCameraActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                <ScanLine size={14} /> {isCameraActive ? 'Activo' : 'En espera'}
              </span>
            </div>

            <div className="relative mt-4 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950">
              <div id={scannerRegionId} className="min-h-[19rem] w-full" />
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-white">
                  <Camera className="text-brand-200" size={58} />
                  <p className="mt-4 text-xl font-black">{scanStatus}</p>
                  <p className="mt-2 max-w-xs text-sm font-semibold text-slate-300">Pulsa Escanear para abrir la camara y leer la credencial oficial.</p>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button onClick={() => startCamera()} className="h-14 text-base">
                <ScanLine size={20} /> Escanear credencial
              </Button>
              <Button variant="secondary" onClick={() => stopCamera()} disabled={!isCameraActive} className="h-14 text-base">
                <XCircle size={20} /> Detener
              </Button>
            </div>

            {cameraDevices.length > 1 && (
              <label className="mt-3 block text-sm font-bold text-slate-700">
                Camara
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold"
                  value={selectedCameraId}
                  onChange={(event) => startCamera(event.target.value)}
                >
                  {cameraDevices.map((camera) => <option key={camera.id} value={camera.id}>{camera.label || `Camara ${camera.id}`}</option>)}
                </select>
              </label>
            )}

            {cameraError && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                <div className="flex gap-2">
                  <AlertTriangle size={18} />
                  <p>{cameraError}</p>
                </div>
                <Button variant="danger" className="mt-3" onClick={() => startCamera()}><RefreshCw size={16} /> Reintentar</Button>
              </div>
            )}

            <form className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={searchBeneficiary}>
              <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Busqueda manual</label>
              <div className="mt-2 flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  value={manualQuery}
                  onChange={(event) => setManualQuery(event.target.value)}
                  placeholder="Nombre, PYE, DNI o telefono"
                />
                <Button type="submit" className="h-12 px-4"><Search size={18} /></Button>
              </div>
              <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500"><Keyboard size={14} /> Alternativa para portatiles o camaras no disponibles.</p>
            </form>

            {manualMatches.length > 1 && (
              <div className="mt-3 grid gap-2">
                {manualMatches.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectBeneficiary(item, 'manual')}
                    className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <p className="font-black text-ink">{item.full_name}</p>
                    <p className="text-sm font-semibold text-slate-500">{item.code || 'Sin codigo'} · {beneficiaryDocument(item) || 'Sin documento'} · {beneficiaryPhone(item) || 'Sin telefono'}</p>
                  </button>
                ))}
              </div>
            )}

            <RepartoSessionPanel session={repartoSession} onFinish={finishRepartoSession} />
          </div>

          <div className="rounded-[2rem] border border-white/80 bg-white p-4 shadow-2xl shadow-brand-900/10 sm:p-5">
            {signatureFlow ? (
              <SmartDeliverySignaturePanel
                flow={signatureFlow}
                registering={registering}
                onUpdate={updateSignatureFlow}
                onConfirmCollector={confirmCollector}
                onConfirmBeneficiary={confirmBeneficiarySignature}
                onSubmit={completeSignedDelivery}
                onCancel={cancelSignatureFlow}
              />
            ) : (
              <>
                {!result && <ReadyPanel />}
                {result?.type === 'invalid' && <InvalidPanel title={result.title} message={result.message} />}
                {result?.type === 'revoked' && <RevokedPanel result={result} />}
                {summary && (
              <BeneficiaryFastPanel
                summary={summary}
                canRegister={canRegister}
                registering={registering}
                error={registerError}
                onRegister={() => beginSignatureFlow(summary)}
              />
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ReadyPanel() {
  return (
    <div className="flex h-full min-h-[34rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-brand-200 bg-brand-50/50 px-5 text-center">
      <IdCard className="text-brand-600" size={68} />
      <h2 className="mt-5 text-3xl font-black text-ink">Esperando beneficiario</h2>
      <p className="mt-3 max-w-md text-base font-semibold text-slate-600">Escanea una credencial oficial o busca por nombre, codigo PYE, DNI o telefono.</p>
    </div>
  );
}

function InvalidPanel({ title, message }) {
  return (
    <div className="flex h-full min-h-[34rem] flex-col items-center justify-center rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 text-center text-amber-900">
      <AlertTriangle size={72} />
      <h2 className="mt-5 text-3xl font-black">{title}</h2>
      <p className="mt-3 max-w-md text-base font-semibold">{message}</p>
    </div>
  );
}

function RevokedPanel({ result }) {
  return (
    <div className="flex h-full min-h-[34rem] flex-col items-center justify-center rounded-[1.5rem] border border-red-200 bg-red-50 px-5 text-center text-red-800">
      <ShieldAlert size={78} />
      <h2 className="mt-5 text-4xl font-black tracking-tight">{result.title || 'CREDENCIAL ANULADA'}</h2>
      <p className="mt-3 max-w-md text-base font-semibold">No se permite registrar entrega con una credencial anulada, caducada, suspendida o sustituida.</p>
      <div className="mt-5 grid w-full max-w-md gap-3 rounded-2xl bg-white p-4 text-left">
        <InfoLine label="ID" value={result.credentialId || '-'} />
        <InfoLine label="Motivo" value={result.message || '-'} />
      </div>
    </div>
  );
}

function BeneficiaryFastPanel({ summary, canRegister, registering, error, onRegister }) {
  const disabled = registering || summary.receivedToday || summary.blocked || !canRegister;
  return (
    <article className="grid h-full min-h-[34rem] gap-5 lg:grid-cols-[16rem_1fr]">
      <div className="rounded-[1.5rem] bg-slate-50 p-4">
        <BeneficiaryPhoto beneficiary={summary.beneficiary} />
        <div className="mt-4 rounded-2xl bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Estado</p>
          <p className={`mt-1 text-2xl font-black ${summary.blocked ? 'text-red-700' : 'text-emerald-700'}`}>{summary.status}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-700">Beneficiario identificado</p>
          <h2 className="mt-1 break-words text-4xl font-black tracking-tight text-ink sm:text-5xl">{summary.beneficiary.full_name}</h2>
          <p className="mt-2 text-lg font-black text-slate-500">{summary.beneficiary.code || 'Sin codigo PYE'}</p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric icon={UsersRound} label="Unidad familiar" value={summary.familyLabel} />
          <Metric icon={UserRound} label="Adultos" value={summary.adults} />
          <Metric icon={Baby} label="Menores" value={summary.minors} />
          <Metric icon={Clock} label="Ultima entrega" value={summary.lastDeliveryLabel} />
          <Metric icon={PackageCheck} label="Ha recibido hoy" value={summary.receivedToday ? 'SI' : 'NO'} tone={summary.receivedToday ? 'red' : 'green'} />
          <Metric icon={IdCard} label="Identificacion" value={summary.sourceLabel} />
        </div>

        <PreparedBatchCard batch={summary.preparedBatch} />

        {summary.receivedToday && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-2xl font-black">Ya recibio ayuda hoy</p>
            <p className="mt-1 font-semibold">Entrega ya registrada. No se permite registrar otra entrega desde este modo.</p>
          </div>
        )}

        {summary.blocked && !summary.receivedToday && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-2xl font-black">Expediente no activo</p>
            <p className="mt-1 font-semibold">El estado actual impide registrar una entrega rapida.</p>
          </div>
        )}

        {error && <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</p>}

        <div className="mt-auto pt-6">
          <Button
            className="h-20 w-full rounded-2xl text-2xl font-black tracking-wide"
            disabled={disabled}
            onClick={onRegister}
          >
            {registering ? <Loader2 className="animate-spin" size={30} /> : <CheckCircle2 size={32} />}
            {registering ? 'REGISTRANDO...' : 'REGISTRAR ENTREGA'}
          </Button>
          {!canRegister && <p className="mt-3 text-center text-sm font-bold text-red-700">Tu usuario no tiene permiso para registrar entregas.</p>}
        </div>
      </div>
    </article>
  );
}

function PreparedBatchCard({ batch }) {
  return (
    <div className={`mt-5 rounded-2xl border p-4 ${batch ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      <div className="flex items-start gap-3">
        <PackageCheck className={batch ? 'text-brand-700' : 'text-slate-400'} size={24} />
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em]">{batch ? 'Lote preparado' : 'Lote preparado'}</p>
          <p className="mt-1 text-lg font-black text-ink">{batch?.label || 'Sin lote preparado'}</p>
          <p className="mt-1 text-sm font-semibold">{batch?.detail || 'La entrega se registrara como ayuda general si no existe un lote planificado.'}</p>
        </div>
      </div>
    </div>
  );
}

function SmartDeliverySignaturePanel({ flow, registering, onUpdate, onConfirmCollector, onConfirmBeneficiary, onSubmit, onCancel }) {
  const summary = flow.summary;
  const isCollectorStep = flow.step === 'collector';
  const isBeneficiaryStep = flow.step === 'beneficiary';
  const isResponsibleStep = flow.step === 'responsible';
  const receiverLabel = flow.collectorType === 'authorized' ? 'persona autorizada' : 'beneficiario';
  const receiverName = flow.collectorType === 'authorized' ? flow.authorizedName : summary.beneficiary.full_name;
  const canContinueReceiver = flow.cannotSign
    ? Boolean(flow.noSignReason)
    : Boolean(flow.beneficiarySignature);
  return (
    <article className="flex h-full min-h-[34rem] flex-col rounded-[1.5rem] bg-slate-50 p-5">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-700">Flujo oficial de reparto</p>
        <h2 className="mt-1 text-3xl font-black tracking-tight text-ink">Confirmar entrega</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">La entrega no se registrara hasta confirmar recogida, firmas y responsable.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InfoLine label="Beneficiario" value={summary.beneficiary.full_name || '-'} />
          <InfoLine label="Personas atendidas" value={summary.peopleCount || 1} />
          <InfoLine label="Responsable" value={currentUserNameFromFlow(flow)} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StepBadge active={isCollectorStep} complete={!isCollectorStep} label="1. Recogida" />
        <StepBadge active={isBeneficiaryStep} complete={Boolean(flow.beneficiarySignature) || Boolean(flow.cannotSign && flow.noSignReason)} label="2. Firma receptor" />
        <StepBadge active={isResponsibleStep} complete={Boolean(flow.responsibleSignature)} label="3. Firma usuario" />
      </div>

      <div className="mt-5 flex-1 rounded-2xl bg-white p-4 shadow-sm">
        {isCollectorStep ? (
          <div className="grid gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Quien recoge la ayuda?</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CollectorOption
                  selected={flow.collectorType === 'holder'}
                  title="Titular"
                  text={summary.beneficiary.full_name || 'Beneficiario'}
                  onClick={() => onUpdate({ collectorType: 'holder', authorizedName: '', authorizedRelation: '' })}
                />
                <CollectorOption
                  selected={flow.collectorType === 'authorized'}
                  title="Persona autorizada"
                  text="Familiar, vecino o persona de confianza."
                  onClick={() => onUpdate({ collectorType: 'authorized' })}
                />
              </div>
            </div>
            {flow.collectorType === 'authorized' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">
                  Nombre de la persona autorizada
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    value={flow.authorizedName}
                    onChange={(event) => onUpdate({ authorizedName: event.target.value })}
                    placeholder="Nombre completo"
                  />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Relacion
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    value={flow.authorizedRelation}
                    onChange={(event) => onUpdate({ authorizedRelation: event.target.value })}
                    placeholder="Hijo, hermana, vecino..."
                  />
                </label>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
              <Button type="button" onClick={onConfirmCollector}>
                Continuar a firma
              </Button>
            </div>
          </div>
        ) : isBeneficiaryStep ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Recoge</p>
              <p className="mt-1 text-xl font-black text-ink">{receiverName || '-'}</p>
              <p className="text-sm font-semibold text-slate-600">{receiverLabel}{flow.authorizedRelation ? ` - ${flow.authorizedRelation}` : ''}</p>
            </div>
            {!flow.cannotSign && (
              <SignatureCaptureField
                label={`Firma del ${receiverLabel}`}
                value={flow.beneficiarySignature}
                required
                onChange={(value) => onUpdate({ beneficiarySignature: value })}
                description="Primero debe firmar la persona que recoge la ayuda."
              />
            )}
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                checked={flow.cannotSign}
                onChange={(event) => onUpdate({ cannotSign: event.target.checked, beneficiarySignature: event.target.checked ? '' : flow.beneficiarySignature })}
              />
              <span>
                No puede firmar.
                <span className="block text-xs font-semibold text-slate-500">Se registrara al usuario como testigo de la entrega.</span>
              </span>
            </label>
            {flow.cannotSign && (
              <label className="text-sm font-bold text-slate-700">
                Motivo
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold"
                  value={flow.noSignReason}
                  onChange={(event) => onUpdate({ noSignReason: event.target.value })}
                >
                  <option value="">Seleccionar motivo</option>
                  <option value="Discapacidad">Discapacidad</option>
                  <option value="Edad avanzada">Edad avanzada</option>
                  <option value="Enfermedad">Enfermedad</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
              <Button type="button" disabled={!canContinueReceiver} onClick={onConfirmBeneficiary}>
                Continuar con firma del usuario
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <SignatureCaptureField
              label="Firma del usuario que realiza la entrega"
              value={flow.responsibleSignature}
              required
              onChange={(value) => onUpdate({ responsibleSignature: value })}
              description="La entrega quedara registrada definitivamente al guardar esta segunda firma."
            />
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="secondary" onClick={() => onUpdate({ step: 'beneficiary' })}>Volver</Button>
              <Button type="button" disabled={registering || !canContinueReceiver || !flow.responsibleSignature} onClick={onSubmit}>
                {registering ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                {registering ? 'Registrando...' : 'Finalizar y registrar entrega'}
              </Button>
            </div>
          </div>
        )}
        {flow.error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{flow.error}</p>}
      </div>
    </article>
  );
}

function StepBadge({ active, complete, label }) {
  return (
    <div className={`rounded-2xl border p-4 font-black ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : active ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-500'}`}>
      <div className="flex items-center gap-2">
        {complete ? <CheckCircle2 size={20} /> : <IdCard size={20} />}
        <span>{label}</span>
      </div>
    </div>
  );
}

function currentUserNameFromFlow(flow) {
  return flow?.responsibleName || 'Usuario autorizado';
}

function DeliveryFeedbackOverlay({ feedback, onAccept }) {
  const isDuplicate = feedback.type === 'duplicate';
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center px-4 text-center text-white ${isDuplicate ? 'bg-red-950/90' : 'bg-emerald-950/85'}`}>
      <div className={`w-full max-w-xl rounded-[2rem] px-8 py-8 shadow-2xl ${isDuplicate ? 'bg-red-600' : 'bg-emerald-600'}`}>
        {isDuplicate ? <XCircle className="mx-auto" size={82} /> : <CheckCircle2 className="mx-auto" size={82} />}
        <p className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          {isDuplicate ? 'ESTE BENEFICIARIO YA HA RECIBIDO LA AYUDA HOY' : 'ENTREGA REGISTRADA'}
        </p>
        <div className="mx-auto mt-5 grid max-w-md gap-3 rounded-2xl bg-white/15 p-4 text-left text-base font-bold">
          {isDuplicate ? (
            <>
              <InfoLineLight label="Ultima entrega" value={feedback.lastDeliveryDateTime || '-'} />
              <InfoLineLight label="Registrada por" value={feedback.registeredBy || '-'} />
            </>
          ) : (
            <>
              <InfoLineLight label="Beneficiario" value={feedback.beneficiaryName || '-'} />
              <InfoLineLight label="Personas atendidas" value={feedback.peopleCount || 1} />
              <InfoLineLight label="Hora" value={feedback.time || '-'} />
              <InfoLineLight label="Registrada por" value={feedback.registeredBy || '-'} />
            </>
          )}
        </div>
        {isDuplicate && (
          <button
            type="button"
            onClick={onAccept}
            className="mt-5 rounded-2xl bg-white px-6 py-3 text-base font-black text-red-700 shadow-lg transition hover:bg-red-50"
          >
            Aceptar
          </button>
        )}
      </div>
    </div>
  );
}

function InfoLineLight({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-white/75">{label}</span>
      <span className="text-right text-lg font-black text-white">{value}</span>
    </div>
  );
}

function CollectorOption({ selected, title, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-brand-400 bg-brand-50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50/60'}`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? 'border-brand-700 bg-brand-700' : 'border-slate-300'}`}>
          {selected && <CheckCircle2 className="text-white" size={16} />}
        </span>
        <div>
          <p className="text-lg font-black text-ink">{title}</p>
          <p className="text-sm font-semibold text-slate-600">{text}</p>
        </div>
      </div>
    </button>
  );
}

function RepartoSessionPanel({ session, onFinish }) {
  const acta = buildRepartoActa(session);
  return (
    <section className="mt-4 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Acta del reparto</p>
          <h3 className="text-xl font-black text-ink">{acta.status}</h3>
          <p className="text-xs font-semibold text-slate-500">{acta.date} · Inicio {acta.startTime}{acta.endTime ? ` · Fin ${acta.endTime}` : ''}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onFinish} disabled={Boolean(session.endedAt)} className="h-10 px-3 text-xs">
          Cerrar acta
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <SessionMetric label="Beneficiarios" value={acta.beneficiaries} />
        <SessionMetric label="Personas" value={acta.people} />
        <SessionMetric label="Duplicadas" value={acta.duplicates} />
        <SessionMetric label="Firmas" value={acta.signatures} />
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
        <p><strong>Usuarios:</strong> {acta.users || '-'}</p>
        <p><strong>Productos:</strong> {acta.products || 'Sin productos registrados'}</p>
        <p><strong>Incidencias:</strong> {acta.incidents || 'Sin incidencias'}</p>
        <p><strong>Entregas anuladas:</strong> {acta.cancelled}</p>
      </div>
    </section>
  );
}

function SessionMetric({ label, value }) {
  return (
    <div className="rounded-xl bg-brand-50 px-3 py-2">
      <p className="text-[0.65rem] font-black uppercase tracking-wide text-brand-700">{label}</p>
      <p className="text-xl font-black text-ink">{value}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone = 'slate' }) {
  const toneClass = tone === 'red' ? 'text-red-700 bg-red-50' : tone === 'green' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-700 bg-slate-50';
  return (
    <div className={`rounded-2xl border border-slate-200 p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon size={20} />
        <p className="text-xs font-black uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-ink">{value || '-'}</p>
    </div>
  );
}

function InfoLine({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-ink">{value || '-'}</p>
    </div>
  );
}

function BeneficiaryPhoto({ beneficiary }) {
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
    return <img src={src} alt={beneficiary.full_name || 'Beneficiario'} className="h-80 w-full rounded-[1.4rem] bg-white object-cover shadow-lg" />;
  }
  return (
    <div className="flex h-80 w-full items-center justify-center rounded-[1.4rem] bg-brand-50 text-brand-700 shadow-inner">
      <UserRound size={74} />
    </div>
  );
}

function buildCollectionInfo(summary, flow) {
  if (flow.collectorType === 'authorized') {
    return {
      receiverName: String(flow.authorizedName || '').trim(),
      receiverDocument: '',
      label: `Persona autorizada (${String(flow.authorizedRelation || '').trim()})`
    };
  }
  return {
    receiverName: summary.beneficiary.full_name || '',
    receiverDocument: beneficiaryDocument(summary.beneficiary),
    label: 'Titular'
  };
}

function buildSmartDeliveryNotes({ summary, flow, collection, registeredBy, date }) {
  const notes = [
    'Entrega registrada desde Entregas Inteligentes.',
    `Recoge: ${collection.label}.`,
    flow.collectorType === 'authorized' ? `Nombre autorizado: ${collection.receiverName}.` : '',
    summary.preparedBatch ? `Lote preparado: ${summary.preparedBatch.label}.` : 'Sin lote preparado previo.',
    flow.cannotSign ? `No puede firmar. Motivo: ${flow.noSignReason}. Testigo: ${registeredBy}.` : '',
    `Hora de recepcion: ${formatTime(date)}.`
  ];
  return notes.filter(Boolean).join(' ');
}

function buildCannotSignAttestationDataUrl({ summary, flow, registeredBy, date }) {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 920;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#0f6b45';
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  ctx.fillStyle = '#0f2f25';
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.fillText('CONSTANCIA DE ENTREGA SIN FIRMA', 54, 78);
  ctx.font = '24px Arial, sans-serif';
  ctx.fillText(`Beneficiario: ${summary.beneficiary.full_name || '-'}`, 54, 132);
  ctx.fillText(`Motivo: ${flow.noSignReason || '-'}`, 54, 174);
  ctx.fillText(`Testigo: ${registeredBy || '-'}`, 54, 216);
  ctx.fillText(`Fecha y hora: ${formatDate(date)} ${formatTime(date)}`, 54, 258);
  ctx.font = '18px Arial, sans-serif';
  ctx.fillStyle = '#647067';
  ctx.fillText('Registro generado automaticamente por ALTHEMON Smart Deliveries.', 54, 310);
  return canvas.toDataURL('image/png');
}

function createRepartoSession(user = {}) {
  const now = new Date().toISOString();
  return {
    id: `reparto-${Date.now()}`,
    startedAt: now,
    endedAt: '',
    users: uniqueValues([currentUserName(user)].filter(Boolean)),
    deliveries: [],
    duplicates: [],
    incidents: [],
    cancelled: []
  };
}

function updateRepartoSession(current, type, entry = {}) {
  const base = {
    ...current,
    users: uniqueValues([...(current.users || []), entry.user].filter(Boolean))
  };
  if (type === 'delivery') return { ...base, deliveries: [{ id: `delivery-${Date.now()}`, ...entry }, ...(base.deliveries || [])] };
  if (type === 'duplicate') return { ...base, duplicates: [{ id: `duplicate-${Date.now()}`, ...entry }, ...(base.duplicates || [])] };
  if (type === 'incident') return { ...base, incidents: [{ id: `incident-${Date.now()}`, ...entry }, ...(base.incidents || [])] };
  if (type === 'cancelled') return { ...base, cancelled: [{ id: `cancelled-${Date.now()}`, ...entry }, ...(base.cancelled || [])] };
  return base;
}

function buildRepartoActa(session = {}) {
  const deliveries = session.deliveries || [];
  const duplicates = session.duplicates || [];
  const incidents = [...(session.incidents || []), ...deliveries.filter((item) => item.incident).map((item) => ({ detail: item.incident }))];
  return {
    status: session.endedAt ? 'Acta cerrada' : 'Acta en curso',
    date: formatDate(session.startedAt),
    startTime: formatTime(session.startedAt),
    endTime: session.endedAt ? formatTime(session.endedAt) : '',
    users: (session.users || []).join(', '),
    beneficiaries: uniqueValues(deliveries.map((item) => item.beneficiaryName)).length,
    people: deliveries.reduce((total, item) => total + Number(item.peopleCount || 0), 0),
    products: summarizeProducts(deliveries),
    incidents: incidents.map((item) => item.detail || item.title).filter(Boolean).join('; '),
    duplicates: duplicates.length,
    cancelled: (session.cancelled || []).length,
    signatures: deliveries.reduce((total, item) => total + Number(item.signatureCount || 0), 0)
  };
}

function summarizeProducts(deliveries = []) {
  const counts = new Map();
  deliveries.forEach((item) => {
    const key = item.productLabel || 'Ayuda general';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].map(([name, count]) => `${name} (${count})`).join(', ');
}

function uniqueValues(values = []) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function buildBeneficiarySummary({ beneficiary, data, recentDeliveries, credentialEntry, source }) {
  const allDeliveries = [...recentDeliveries, ...(data.deliveries || [])];
  const deliveries = allDeliveries.filter((delivery) => delivery.beneficiary_id === beneficiary.id && isActiveDelivery(delivery));
  const preparedBatch = findPreparedBatch(beneficiary, data, deliveries);
  const receivedDeliveries = deliveries.filter((delivery) => isReceivedDelivery(delivery));
  const todayDeliveries = receivedDeliveries.filter((delivery) => sameDay(delivery.delivered_at || delivery.reception_at || delivery.created_at, new Date()));
  const todayDelivery = latestDeliveryRecord(todayDeliveries);
  const lastDelivery = latestDeliveryRecord(receivedDeliveries);
  const receivedToday = Boolean(todayDelivery);
  const family = (data.families || []).find((item) => item.id === beneficiary.family_id);
  const members = beneficiary.family_id
    ? (data.beneficiaries || []).filter((item) => item.family_id === beneficiary.family_id && item.is_active !== false)
    : [beneficiary];
  const minors = members.filter((item) => isMinor(item)).length;
  const adults = Math.max(members.length - minors, 0);
  const status = beneficiaryStatus(beneficiary);
  const blocked = normalize(status).includes('inactiv') || normalize(status).includes('suspend') || normalize(status).includes('archiv');
  return {
    beneficiary,
    status,
    blocked,
    receivedToday,
    adults,
    minors,
    peopleCount: Math.max(adults + minors, 1),
    familyLabel: family?.family_code || family?.name || family?.address || (beneficiary.family_id ? 'Unidad familiar' : 'Sin unidad familiar'),
    preparedBatch,
    lastDelivery,
    lastDeliveryTime: deliveryDisplayTime(lastDelivery),
    lastDeliveryResponsible: deliveryResponsible(lastDelivery),
    todayDeliveryDateTime: deliveryDisplayDateTime(todayDelivery),
    todayDeliveryResponsible: deliveryResponsible(todayDelivery),
    lastDeliveryLabel: lastDelivery ? `${formatDate(lastDelivery.delivered_at || lastDelivery.created_at)} · ${lastDelivery.help_type || 'Ayuda'}` : 'Sin entregas',
    sourceLabel: source === 'qr' && credentialEntry?.credentialId ? 'Credencial oficial' : 'Busqueda manual'
  };
}

function findPreparedBatch(beneficiary, data = {}, deliveries = []) {
  const today = todayISO();
  const plannedDelivery = [...deliveries]
    .filter((delivery) => !isReceivedDelivery(delivery))
    .filter((delivery) => String(delivery.delivered_at || '').slice(0, 10) >= today)
    .sort((a, b) => String(a.delivered_at || '').localeCompare(String(b.delivered_at || '')))[0];

  if (plannedDelivery) {
    return {
      source: 'Entrega programada',
      label: plannedDelivery.inventory_item_name || plannedDelivery.help_type || 'Lote programado',
      detail: `${formatDate(plannedDelivery.delivered_at)} · ${plannedDelivery.help_type || 'Ayuda'} · ${plannedDelivery.quantity || 1} unidad(es)`,
      helpType: plannedDelivery.help_type || 'Alimentos',
      quantity: Number(plannedDelivery.quantity || 1),
      inventoryItemId: plannedDelivery.inventory_item_id || null
    };
  }

  const campaign = findActiveCampaignForBeneficiary(beneficiary, data);
  if (!campaign) return null;
  const products = productsForCampaign(campaign.id, data);
  const label = products.length ? products.map((item) => item.name).join(', ') : (campaign.name || 'Campana activa');
  return {
    source: 'Campana activa',
    label,
    detail: `${campaign.name || 'Campana'} · ${products.length ? `${products.length} producto(s)` : 'Sin productos vinculados'}`,
    helpType: campaign.name || 'Alimentos',
    quantity: 1,
    inventoryItemId: products[0]?.id || null
  };
}

function findActiveCampaignForBeneficiary(beneficiary, data = {}) {
  const linkedCampaignIds = new Set((data.campana_beneficiarios || [])
    .filter((item) => item.beneficiary_id === beneficiary.id)
    .map((item) => item.campaign_id));
  if (!linkedCampaignIds.size) return null;
  const today = todayISO();
  return (data.campanas || [])
    .filter((campaign) => linkedCampaignIds.has(campaign.id))
    .filter((campaign) => ['Activa', 'Planificada'].includes(campaign.status || ''))
    .filter((campaign) => !campaign.end_date || String(campaign.end_date).slice(0, 10) >= today)
    .sort((a, b) => String(a.start_date || a.created_at || '').localeCompare(String(b.start_date || b.created_at || '')))[0] || null;
}

function productsForCampaign(campaignId, data = {}) {
  const productIds = new Set((data.campana_productos || [])
    .filter((item) => item.campaign_id === campaignId)
    .map((item) => item.product_id));
  return (data.inventory_items || []).filter((item) => productIds.has(item.id));
}

function buildBeneficiaryCredentialDirectory(data = {}) {
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

function toBeneficiaryDirectoryEntry(record = {}) {
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

function findBeneficiaryCredentialMatch(payload, directory) {
  const kind = payload.credential_kind || (payload.kind && payload.kind !== 'official-credential' ? payload.kind : '');
  const scannedCredentialId = normalizeCredentialIdentifier(payload.credential_id || payload.credential_uid);
  const scannedQrVersion = Number.parseInt(String(payload.qr_version || ''), 10);
  const candidateIds = new Set([
    scannedCredentialId,
    payload.subject_id ? buildCredentialSecureIdentifier({ kind: kind || 'beneficiary', subjectId: payload.subject_id, code: payload.code }) : '',
    payload.code ? buildCredentialSecureIdentifier({ kind: kind || 'beneficiary', subjectId: payload.code, code: payload.code }) : ''
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
        invalidCredential: true,
        credentialStatus: 'revoked',
        credentialStatusReason: 'QR obsoleto o no vigente.',
        message: 'CREDENCIAL ANULADA'
      };
    }
    if (entry.kind !== 'beneficiary' || entry.invalidCredential || entry.credentialStatus !== 'active' || !entry.record) {
      return {
        ...entry,
        record: null,
        invalidCredential: true,
        message: entry.message || invalidCredentialMessage(entry.credentialStatus, entry.credentialStatusReason)
      };
    }
    return entry;
  }
  return null;
}

function findBeneficiaryMatches(query, beneficiaries = []) {
  const clean = normalize(query).replace(/\s+/g, ' ');
  const compact = clean.replace(/\s+/g, '');
  if (!compact) return [];
  return beneficiaries
    .filter((beneficiary) => {
      const values = [
        beneficiary.full_name,
        beneficiary.code,
        beneficiaryDocument(beneficiary),
        beneficiaryPhone(beneficiary)
      ];
      return values.some((value) => {
        const normalized = normalize(value);
        return normalized.includes(clean) || normalized.replace(/\s+/g, '').includes(compact);
      });
    })
    .slice(0, 8);
}

function beneficiaryStatus(beneficiary = {}) {
  if (beneficiary.is_active === false) return 'Inactivo';
  return beneficiary.status || beneficiary.situation || 'Activo';
}

function beneficiaryDocument(beneficiary = {}) {
  return beneficiary.document_id || beneficiary.dni || beneficiary.nie || beneficiary.passport || beneficiary.document || '';
}

function beneficiaryPhone(beneficiary = {}) {
  return beneficiary.phone || beneficiary.mobile || beneficiary.telephone || beneficiary.contact_phone || '';
}

function currentUserName(user = {}) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || 'Usuario';
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function deliveryDisplayTime(delivery = null) {
  if (!delivery) return '-';
  if (delivery.delivered_time) return String(delivery.delivered_time).slice(0, 5);
  return formatTime(delivery.reception_at || delivery.created_at || delivery.delivered_at);
}

function deliveryDisplayDateTime(delivery = null) {
  if (!delivery) return '-';
  const dateValue = delivery.delivered_at || delivery.reception_at || delivery.created_at;
  const dateLabel = dateValue ? formatDate(dateValue) : '-';
  const timeLabel = deliveryDisplayTime(delivery);
  return [dateLabel, timeLabel].filter((item) => item && item !== '-').join(' · ') || '-';
}

function deliveryResponsible(delivery = null) {
  if (!delivery) return '-';
  return delivery.responsible || delivery.volunteer_name || delivery.delivered_by || delivery.created_by || '-';
}

function latestDeliveryRecord(items = []) {
  return [...items]
    .filter(Boolean)
    .sort((a, b) => deliverySortValue(b).localeCompare(deliverySortValue(a)))[0] || null;
}

function deliverySortValue(delivery = {}) {
  if (delivery.reception_at) return String(delivery.reception_at);
  if (delivery.created_at) return String(delivery.created_at);
  if (delivery.delivered_at) return `${delivery.delivered_at}T${delivery.delivered_time || '00:00'}`;
  return '';
}

function invalidCredentialMessage(status, reason = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'revoked') return 'CREDENCIAL ANULADA';
  if (normalizedStatus === 'expired') return 'Esta credencial ha caducado y ya no es valida.';
  if (normalizedStatus === 'suspended') return 'Esta credencial esta suspendida temporalmente.';
  if (normalizedStatus === 'inactive') return 'Esta credencial esta inactiva.';
  return reason || 'Esta credencial ya no es valida.';
}

function normalizeCredentialIdentifier(value) {
  return String(value || '').trim();
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
  const size = Math.floor(Math.max(190, Math.min(minEdge * 0.74, 360)));
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

function isReceivedDelivery(delivery = {}) {
  if (!isActiveDelivery(delivery)) return false;
  if (delivery.reception_at || delivery.signature_data_url || delivery.responsible_signature_data_url) return true;
  const notes = normalize(delivery.notes || '');
  if (notes.includes('entrega registrada desde entregas inteligentes')) return true;
  const date = String(delivery.delivered_at || '').slice(0, 10);
  if (date && date <= todayISO()) return true;
  return false;
}

function isMinor(beneficiary = {}) {
  const value = beneficiary.birth_date || beneficiary.date_of_birth || beneficiary.birthdate || beneficiary.dob;
  if (!value) return false;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age < 18;
}
