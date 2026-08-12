import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertTriangle, ArrowLeft, Baby, Camera, CheckCircle2, Clock, Euro, IdCard, Loader2, Minus, PackageCheck, Pencil, Plus, RefreshCw, ScanLine, ShieldAlert, UserRound, UsersRound, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BeneficiaryQuickSearch, beneficiaryDocument, beneficiaryStatus, buildBeneficiaryCredentialDirectory, invalidCredentialMessage, normalizeCredentialIdentifier, toBeneficiaryDirectoryEntry } from '../components/BeneficiaryQuickSearch';
import { Button } from '../components/Button';
import { canDo } from '../lib/auth';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { buildCredentialSecureIdentifier, parseOfficialCredentialQr } from '../lib/credentials';
import { normalizeEmailError, sendEmailViaApi } from '../lib/emailClient';
import { createSmartRepartoActaPdf } from '../lib/exporters';
import { formatDate, normalize, todayISO } from '../lib/formatters';
import { SignatureCaptureField } from './Deliveries';

const CLOSE_REPARTO_PHRASE = 'CERRAR REPARTO';

export function SmartDeliveries({ data, actions, currentUser, navigationTarget, onNavigate }) {
  const scannerRegionId = useRef(`smart-delivery-reader-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const scanLockedRef = useRef(false);
  const usbReaderBufferRef = useRef('');
  const usbReaderTimerRef = useRef(null);
  const usbReaderReadyRef = useRef(false);
  const usbReaderProcessedEventsRef = useRef(new WeakSet());
  const usbReaderProcessorRef = useRef(null);
  const resetTimerRef = useRef(null);
  const prefilledProfileRef = useRef('');
  const duplicateLogRef = useRef('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanStatus, setScanStatus] = useState('Listo para escanear.');
  const [result, setResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [signatureFlow, setSignatureFlow] = useState(null);
  const [, setManualQuery] = useState('');
  const [, setManualMatches] = useState([]);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [recentDeliveries, setRecentDeliveries] = useState([]);
  const [repartoSession, setRepartoSession] = useState(() => createRepartoSession(currentUser));
  const [deliveryCustomization, setDeliveryCustomization] = useState(null);
  const [customizeTarget, setCustomizeTarget] = useState(null);
  const [batchConfig, setBatchConfig] = useState(() => createDefaultRepartoBatchConfig());
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeConfirmation, setCloseConfirmation] = useState('');
  const [closeRepartoError, setCloseRepartoError] = useState('');
  const [closingReparto, setClosingReparto] = useState(false);
  const [usbDiagnostic, setUsbDiagnostic] = useState(() => createUsbDiagnostic());
  const directory = useMemo(() => buildBeneficiaryCredentialDirectory(data || {}), [data]);
  const currentRepartoBatch = useMemo(() => buildCurrentRepartoBatch(data?.inventory_items || [], batchConfig), [data?.inventory_items, batchConfig]);
  const organization = data?.organization_settings?.[0] || {};
  const actaRecipients = useMemo(() => resolveRepartoActaRecipients(data || {}, currentUser), [data, currentUser]);
  const canScan = canDo(currentUser, 'smart-deliveries', 'view');
  const canRegister = canDo(currentUser, 'smart-deliveries', 'create') || canDo(currentUser, 'deliveries', 'create');
  const canReopenReparto = canDo(currentUser, 'smart-deliveries', 'edit') || canDo(currentUser, 'deliveries', 'edit') || canDo(currentUser, 'settings', 'edit');
  const repartoClosed = Boolean(repartoSession.endedAt || repartoSession.locked);
  const usbReaderReady = canScan
    && !repartoClosed
    && !feedback
    && !signatureFlow
    && !registering
    && !customizeTarget
    && !closeDialogOpen
    && result?.type !== 'beneficiary';
  usbReaderProcessorRef.current = processUsbCredential;

  useEffect(() => () => {
    stopCamera();
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    if (usbReaderTimerRef.current) window.clearTimeout(usbReaderTimerRef.current);
  }, []);

  useEffect(() => {
    usbReaderReadyRef.current = usbReaderReady;
    updateUsbDiagnostic({
      listening: usbReaderReady,
      result: usbReaderReady ? 'Escucha USB activa. Escanee una credencial.' : 'Escucha USB pausada por flujo activo.'
    });
  }, [usbReaderReady]);

  useEffect(() => {
    function handleGlobalUsbKeyDown(event) {
      if (usbReaderProcessedEventsRef.current.has(event)) return;
      usbReaderProcessedEventsRef.current.add(event);

      if (isTextEditingElement(event.target)) {
        updateUsbDiagnostic({
          ignoredReason: 'Ignorado: usuario escribiendo en un campo manual.',
          lastKey: describeUsbKey(event)
        });
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (!usbReaderReadyRef.current && !usbReaderBufferRef.current) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        updateUsbDiagnostic({ enterReceived: true, lastKey: 'Enter' });
        consumeUsbReaderBuffer();
        return;
      }

      if (event.key.length !== 1) {
        updateUsbDiagnostic({ lastKey: describeUsbKey(event) });
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      usbReaderBufferRef.current += event.key;
      updateUsbDiagnostic({
        lastKey: describeUsbKey(event),
        keyCount: usbReaderBufferRef.current.length,
        buffer: usbReaderBufferRef.current,
        enterReceived: false,
        ignoredReason: '',
        result: 'USB recibido. Acumulando lectura...'
      });
      if (usbReaderTimerRef.current) window.clearTimeout(usbReaderTimerRef.current);
      usbReaderTimerRef.current = window.setTimeout(() => {
        consumeUsbReaderBuffer();
      }, 350);
    }

    window.addEventListener('keydown', handleGlobalUsbKeyDown, true);
    document.addEventListener('keydown', handleGlobalUsbKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalUsbKeyDown, true);
      document.removeEventListener('keydown', handleGlobalUsbKeyDown, true);
    };
  }, []);

  useEffect(() => {
    setBatchConfig((current) => ensureBatchConfigRules(current, data?.inventory_items || []));
  }, [data?.inventory_items]);

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
    if (repartoClosed) {
      setCameraError('El reparto esta cerrado. Reabre el acta con un usuario autorizado para volver a escanear.');
      setScanStatus('Reparto cerrado.');
      return;
    }
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

  function updateUsbDiagnostic(patch = {}) {
    setUsbDiagnostic((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }));
  }

  function consumeUsbReaderBuffer() {
    const rawValue = normalizeUsbReaderValue(usbReaderBufferRef.current);
    usbReaderBufferRef.current = '';
    if (usbReaderTimerRef.current) {
      window.clearTimeout(usbReaderTimerRef.current);
      usbReaderTimerRef.current = null;
    }
    if (!rawValue) return false;
    usbReaderProcessorRef.current?.(rawValue);
    return true;
  }

  function processUsbCredential(rawValue) {
    const payload = parseOfficialCredentialQr(rawValue);
    const extractedId = normalizeCredentialIdentifier(payload?.credential_id || payload?.credential_uid || '');
    updateUsbDiagnostic({
      finalText: rawValue,
      extractedId: extractedId || 'No extraido',
      result: payload ? 'Texto final recibido. Enviando a handleCredential().' : 'Texto final recibido, pero no es un QR oficial reconocido.'
    });

    if (!usbReaderReadyRef.current) return;
    if (repartoClosed) {
      setCameraError('El reparto esta cerrado. Reabre el acta con un usuario autorizado para volver a escanear.');
      setScanStatus('Reparto cerrado.');
      updateUsbDiagnostic({ result: 'Bloqueado: reparto cerrado.' });
      return;
    }
    if (!canScan) {
      setCameraError('Tu usuario no tiene permiso para usar el modo reparto.');
      setScanStatus('Escaneo no autorizado.');
      updateUsbDiagnostic({ result: 'Bloqueado: usuario sin permiso para Smart Deliveries.' });
      return;
    }

    setCameraError('');
    setRegisterError('');
    setFeedback(null);
    setSignatureFlow(null);
    setScanStatus('QR leido. Identificando beneficiario...');
    void stopCamera({ silent: true });
    const outcome = handleCredential(rawValue);
    updateUsbDiagnostic({
      extractedId: outcome.credentialId || extractedId || 'No extraido',
      result: outcome.message || 'handleCredential() ejecutado.'
    });
  }

  function handleCredential(rawValue) {
    setManualMatches([]);
    setRegisterError('');
    const payload = parseOfficialCredentialQr(rawValue);
    const scannedCredentialId = normalizeCredentialIdentifier(payload?.credential_id || payload?.credential_uid || '');
    if (!payload) {
      setResult({
        type: 'invalid',
        title: 'QR no reconocido',
        message: 'Esta lectura no corresponde a una credencial oficial de ALTHEMON.'
      });
      setScanStatus('QR no reconocido.');
      return {
        ok: false,
        credentialId: '',
        message: 'handleCredential(): QR no reconocido.'
      };
    }
    const match = findBeneficiaryCredentialMatch(payload, directory);
    if (!match) {
      setResult({
        type: 'invalid',
        title: 'Credencial no localizada',
        message: 'No se ha encontrado una credencial activa asociada a un beneficiario.'
      });
      setScanStatus('Credencial no localizada.');
      return {
        ok: false,
        credentialId: scannedCredentialId,
        message: `ID extraido: ${scannedCredentialId || 'sin ID'} -> Credencial no localizada.`
      };
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
      return {
        ok: false,
        credentialId: match.credentialId || scannedCredentialId,
        message: `ID extraido: ${match.credentialId || scannedCredentialId || 'sin ID'} -> Credencial encontrada pero anulada/no activa.`
      };
    }
    setDeliveryCustomization(null);
    setCustomizeTarget(null);
    setResult({ type: 'beneficiary', source: 'qr', entry: match, beneficiary: match.record });
    setScanStatus('Beneficiario identificado.');
    return {
      ok: true,
      credentialId: match.credentialId || scannedCredentialId,
      message: `ID extraido: ${match.credentialId || scannedCredentialId || 'sin ID'} -> Credencial encontrada -> Beneficiario identificado: ${match.record?.full_name || 'Beneficiario'}.`
    };
  }

  function selectBeneficiary(beneficiary, source = 'manual', entryOverride = null) {
    const entry = entryOverride || directory.find((item) => item.record?.id === beneficiary.id) || toBeneficiaryDirectoryEntry(beneficiary);
    setDeliveryCustomization(null);
    setCustomizeTarget(null);
    setResult({ type: 'beneficiary', source, entry, beneficiary });
    setSignatureFlow(null);
    setScanStatus(source === 'qr' ? 'Beneficiario identificado desde credencial.' : 'Beneficiario identificado por busqueda manual.');
  }

  function beginSignatureFlow(summary) {
    if (!summary?.beneficiary || summary.receivedToday || summary.blocked) return;
    if (repartoClosed) {
      setRegisterError('El reparto esta cerrado. Reabre el acta con un usuario autorizado para registrar nuevas entregas.');
      return;
    }
    setRegisterError('');
    setFeedback(null);
    setSignatureFlow({
      summary,
      customization: customizationForSummary(summary, deliveryCustomization),
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
    if (repartoClosed) {
      setRegisterError('El reparto esta cerrado. No se pueden registrar nuevas entregas.');
      return;
    }
    setRegistering(true);
    setRegisterError('');
    setFeedback(null);
    try {
      const now = new Date();
      const registeredBy = currentUserName(currentUser);
      const registeredRole = currentUserRole(currentUser);
      const collection = buildCollectionInfo(summary, flow);
      const receiverSignature = flow.cannotSign
        ? buildCannotSignAttestationDataUrl({ summary, flow, registeredBy, date: now })
        : flow.beneficiarySignature;
      const deliveryPlan = buildDeliveryPlan(summary, flow.customization);
      const preparedBatch = deliveryPlan.primaryItem;
      const deliveryNumber = nextSmartDeliveryNumber([...recentDeliveries, ...(data?.deliveries || [])], now);
      const traceability = {
        deliveryNumber,
        registeredRole,
        device: deliveryDeviceLabel(),
        identificationMethod: summary.identificationMethod || 'Busqueda manual'
      };
      const payload = {
        beneficiary_id: summary.beneficiary.id,
        receipt_number: deliveryNumber,
        delivered_at: todayISO(),
        delivered_time: now.toTimeString().slice(0, 5),
        reception_at: now.toISOString(),
        responsible: registeredBy,
        help_type: preparedBatch?.helpType || preparedBatch?.name || 'Alimentos',
        quantity: preparedBatch?.quantity || 1,
        inventory_item_id: preparedBatch?.inventoryItemId || null,
        receiver_name: collection.receiverName,
        receiver_document_id: collection.receiverDocument,
        signature_data_url: receiverSignature,
        responsible_signature_data_url: flow.responsibleSignature,
        notes: buildSmartDeliveryNotes({ summary, flow, collection, registeredBy, date: now, traceability, deliveryPlan })
      };
      const createdDelivery = await (actions.createSmartDelivery || actions.createDelivery)(payload);
      const inventoryResult = await registerSmartDeliveryInventoryMovements({
        actions,
        deliveryPlan,
        primaryItem: preparedBatch,
        deliveryNumber,
        registeredBy,
        date: now,
        deliveryId: createdDelivery?.id || ''
      });
      const stockNotices = await createSmartDeliveryLowStockNotices({
        actions,
        deliveryPlan,
        deliveryNumber
      });
      const inventoryIncident = inventoryResult.error ? `Inventario: ${inventoryResult.error}` : '';
      const stockIncident = stockNotices.length
        ? `Avisos de stock: ${stockNotices.map((notice) => notice.label).join(', ')}`
        : '';
      setRecentDeliveries((current) => [
        { id: createdDelivery?.id || `smart-${Date.now()}`, ...payload, ...createdDelivery, created_at: createdDelivery?.created_at || now.toISOString(), status: createdDelivery?.status || 'Completada' },
        ...current
      ]);
      setFeedback({
        type: 'success',
        beneficiaryName: summary.beneficiary.full_name || 'Beneficiario',
        time: formatTime(now),
        peopleCount: summary.peopleCount,
        registeredBy,
        collectorType: flow.collectorType,
        collectorName: flow.collectorType === 'authorized' ? collection.receiverName : '',
        collectorRelation: flow.collectorType === 'authorized' ? String(flow.authorizedRelation || '').trim() : '',
        receiverSignatureLabel: flow.collectorType === 'authorized' ? 'Persona autorizada' : 'Beneficiario',
        responsibleSignatureLabel: 'Usuario que realizo la entrega'
      });
      appendRepartoEvent('delivery', {
        deliveryId: createdDelivery?.id || '',
        deliveryNumber,
        beneficiaryId: summary.beneficiary.id,
        beneficiaryName: summary.beneficiary.full_name || 'Beneficiario',
        peopleCount: summary.peopleCount,
        adults: summary.adults,
        minors: summary.minors,
        productLabel: deliveryPlan.deliveredLabel || preparedBatch?.label || payload.help_type,
        recommendedLabel: deliveryPlan.recommendedLabel,
        deliveredLabel: deliveryPlan.deliveredLabel,
        changeReason: deliveryPlan.reason,
        modifiedBy: deliveryPlan.modifiedBy,
        modifiedAt: deliveryPlan.modifiedAt,
        estimatedValue: deliveryPlan.estimatedValue,
        recommendedValue: deliveryPlan.recommendedValue,
        deliveredItems: deliveryPlan.deliveredItems,
        recommendedItems: deliveryPlan.recommendedItems,
        inventoryMovements: inventoryResult.movements,
        stockNotices,
        identificationMethod: traceability.identificationMethod,
        signatureCount: flow.cannotSign ? 1 : 2,
        cannotSign: flow.cannotSign,
        incident: [flow.cannotSign ? `No puede firmar: ${flow.noSignReason}` : '', ...(deliveryPlan.incidents || []), inventoryIncident, stockIncident].filter(Boolean).join('; '),
        registeredBy,
        at: now.toISOString()
      });
      setSignatureFlow(null);
      setDeliveryCustomization(null);
      setCustomizeTarget(null);
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

  function requestCloseRepartoSession() {
    setCloseConfirmation('');
    setCloseRepartoError('');
    setCloseDialogOpen(true);
  }

  async function confirmCloseRepartoSession() {
    setCloseRepartoError('');
    if (normalize(closeConfirmation) !== normalize(CLOSE_REPARTO_PHRASE)) {
      setCloseRepartoError(`Escribe exactamente "${CLOSE_REPARTO_PHRASE}" para cerrar el reparto.`);
      return;
    }
    if (!actaRecipients.length) {
      setCloseRepartoError('No hay destinatarios configurados para enviar el acta. Revisa Configuracion.');
      return;
    }
    setClosingReparto(true);
    try {
      const closed = closeRepartoSession(repartoSession, currentUser);
      const acta = buildRepartoActa(closed, { batch: currentRepartoBatch });
      const { blob, filename } = await createSmartRepartoActaPdf(acta, organization, closed);
      const subject = `Acta oficial del reparto - ${acta.date}`;
      const message = buildRepartoExecutiveEmail(acta, closed, actaRecipients);
      const payload = await sendEmailViaApi({
        to: actaRecipients.join(', '),
        subject,
        message,
        attachments: [{ filename, blob, size: blob.size, contentType: 'application/pdf' }],
        organization,
        logEmail: true
      });
      try {
        await actions.createAuditLog?.({
          user_name: currentUserName(currentUser),
          user_email: currentUser?.email || '',
          action: `Smart Deliveries: cerro reparto ${closed.id} con ${acta.beneficiaries} beneficiarios y ${acta.people} personas atendidas.`,
          happened_at: closed.endedAt
        });
      } catch (auditError) {
        console.warn('[Entregas inteligentes] No se pudo registrar auditoria de cierre', auditError);
      }
      setRepartoSession({
        ...closed,
        acta: {
          ...(closed.acta || {}),
          statistics: acta.statistics,
          impact: acta.impact,
          pdfFilename: filename,
          emailedAt: new Date().toISOString(),
          emailRecipients: actaRecipients,
          providerId: payload.id || ''
        }
      });
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      await stopCamera({ silent: true });
      setCloseDialogOpen(false);
      setScanStatus('Reparto cerrado oficialmente.');
    } catch (error) {
      console.error('[Entregas inteligentes] Error al cerrar reparto', error);
      setCloseRepartoError(normalizeEmailError(error));
    } finally {
      setClosingReparto(false);
    }
  }

  function reopenRepartoSession() {
    if (!canReopenReparto) return;
    setRepartoSession((current) => ({
      ...current,
      endedAt: '',
      locked: false,
      reopenedAt: new Date().toISOString(),
      reopenedBy: currentUserName(currentUser)
    }));
    setCameraError('');
    setScanStatus('Reparto reabierto por usuario autorizado.');
  }

  const summary = result?.type === 'beneficiary'
    ? buildBeneficiarySummary({
      beneficiary: result.beneficiary,
      data,
      recentDeliveries,
      credentialEntry: result.entry,
      source: result.source,
      repartoBatch: currentRepartoBatch
    })
    : null;
  const activeCustomization = summary ? customizationForSummary(summary, deliveryCustomization) : null;

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
        {customizeTarget && (
          <CustomizeDeliveryModal
            summary={customizeTarget}
            customization={customizationForSummary(customizeTarget, deliveryCustomization)}
            currentUser={currentUser}
            onCancel={() => setCustomizeTarget(null)}
            onReset={() => {
              setDeliveryCustomization(null);
              setCustomizeTarget(null);
            }}
            onSave={(customization) => {
              setDeliveryCustomization(customization);
              setCustomizeTarget(null);
            }}
          />
        )}
        {closeDialogOpen && (
          <CloseRepartoDialog
            recipients={actaRecipients}
            confirmation={closeConfirmation}
            error={closeRepartoError}
            closing={closingReparto}
            onChange={setCloseConfirmation}
            onCancel={() => setCloseDialogOpen(false)}
            onConfirm={confirmCloseRepartoSession}
          />
        )}

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

            <RepartoBatchPanel
              batch={currentRepartoBatch}
              onRuleChange={(itemId, quantityPerPerson) => setBatchConfig((current) => updateBatchRule(current, itemId, quantityPerPerson))}
            />

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

            <UsbReaderDiagnosticPanel diagnostic={usbDiagnostic} />

            <BeneficiaryQuickSearch
              className="mt-5"
              data={data}
              credentialDirectory={directory}
              onSelect={(beneficiary, entry) => selectBeneficiary(beneficiary, 'manual', entry)}
            />

            <RepartoSessionPanel
              session={repartoSession}
              batch={currentRepartoBatch}
              closing={closingReparto}
              closeError={closeRepartoError}
              canReopen={canReopenReparto}
              onFinish={requestCloseRepartoSession}
              onReopen={reopenRepartoSession}
              onOpenDelivery={(deliveryId) => deliveryId && onNavigate?.({ moduleId: 'deliveries', itemId: deliveryId })}
            />
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
                customization={activeCustomization}
                repartoClosed={repartoClosed}
                onCustomize={() => setCustomizeTarget(summary)}
                onRegister={() => beginSignatureFlow(summary)}
                onClose={() => {
                  setResult(null);
                  setRegisterError('');
                  setDeliveryCustomization(null);
                  setScanStatus('Listo para escanear.');
                }}
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

function UsbReaderDiagnosticPanel({ diagnostic }) {
  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Diagnostico temporal lector USB</p>
          <h3 className="mt-1 text-lg font-black">Eyoyo HID / teclado</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${diagnostic.listening ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
          {diagnostic.listening ? 'Escucha activa' : 'Pausado'}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        <UsbDiagnosticLine label="Tecla recibida" value={diagnostic.lastKey || '-'} />
        <UsbDiagnosticLine label="Buffer acumulado" value={diagnostic.buffer || '-'} mono />
        <UsbDiagnosticLine label="Evento Enter" value={diagnostic.enterReceived ? 'Recibido' : 'Pendiente'} />
        <UsbDiagnosticLine label="Texto final recibido" value={diagnostic.finalText || '-'} mono />
        <UsbDiagnosticLine label="ID extraido" value={diagnostic.extractedId || '-'} mono />
        <UsbDiagnosticLine label="Resultado handleCredential()" value={diagnostic.result || '-'} />
        {diagnostic.ignoredReason && <UsbDiagnosticLine label="Ignorado" value={diagnostic.ignoredReason} />}
        <UsbDiagnosticLine label="Ultima actualizacion" value={diagnostic.updatedAt || '-'} />
      </div>
    </section>
  );
}

function UsbDiagnosticLine({ label, value, mono = false }) {
  return (
    <div className="rounded-xl bg-white/75 p-2">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-amber-700">{label}</p>
      <p className={`mt-0.5 break-words text-sm font-bold text-slate-900 ${mono ? 'font-mono' : ''}`}>{truncateDiagnostic(value)}</p>
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

function CloseRepartoDialog({ recipients, confirmation, error, closing, onChange, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
      <div className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-700">Cierre oficial</p>
          <h2 className="mt-1 text-2xl font-black text-ink">Cerrar reparto</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Se generara el Acta Oficial en PDF, se registrara el cierre y se enviara el resumen a los destinatarios configurados.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm font-semibold text-brand-900">
          <p className="font-black">Destinatarios del acta</p>
          <p className="mt-1">{recipients.length ? recipients.join(', ') : 'Sin destinatarios configurados'}</p>
        </div>

        <label className="mt-4 block text-sm font-bold text-slate-700">
          Frase de confirmacion
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black uppercase outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            value={confirmation}
            onChange={(event) => onChange(event.target.value)}
            placeholder={CLOSE_REPARTO_PHRASE}
          />
        </label>
        <p className="mt-2 text-xs font-semibold text-slate-500">Escribe exactamente: {CLOSE_REPARTO_PHRASE}</p>

        {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={closing}>Cancelar</Button>
          <Button type="button" onClick={onConfirm} disabled={closing}>
            {closing && <Loader2 className="animate-spin" size={16} />}
            Cerrar y enviar acta
          </Button>
        </div>
      </div>
    </div>
  );
}

function RepartoBatchPanel({ batch, onRuleChange }) {
  const hasProducts = batch.items.length > 0;
  return (
    <section className="mt-4 rounded-[1.5rem] border border-brand-100 bg-brand-50/80 p-4 text-brand-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Lote del reparto</p>
          <h3 className="mt-1 text-xl font-black text-ink">{batch.name}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {hasProducts ? `${batch.items.length} producto(s) configurados automaticamente desde inventario.` : 'No hay productos activos en inventario para calcular el lote.'}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-brand-700">{batch.totalStock} uds.</span>
      </div>
      {hasProducts && (
        <details className="mt-3 rounded-2xl bg-white/80 p-3">
          <summary className="cursor-pointer text-sm font-black text-brand-800">Reglas automaticas por persona</summary>
          <div className="mt-3 grid gap-2">
            {batch.items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_6.5rem] items-center gap-2 rounded-xl bg-slate-50 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-ink">{item.name}</p>
                  <p className={`text-xs font-semibold ${item.stock > 0 ? 'text-slate-500' : 'text-red-700'}`}>
                    Stock: {formatBatchStock(item)}
                  </p>
                </div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Por persona
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={item.quantityPerPerson}
                    onChange={(event) => onRuleChange(item.id, event.target.value)}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-black text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function BeneficiaryFastPanel({ summary, canRegister, registering, error, customization, repartoClosed = false, onCustomize, onRegister, onClose }) {
  const disabled = registering || summary.receivedToday || summary.blocked || !canRegister || repartoClosed;
  const statusLabel = summary.blocked ? summary.status : 'Activa';
  return (
    <article className="flex min-h-[26rem] flex-col rounded-[1.4rem] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-lg font-black text-ink">Entrega inteligente</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Cerrar entrega inteligente"
        >
          <XCircle size={19} />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
          <BeneficiaryPhoto beneficiary={summary.beneficiary} className="h-16 w-16 shrink-0 rounded-2xl bg-white object-cover shadow-sm" fallbackClassName="h-16 w-16 shrink-0 rounded-2xl bg-brand-50 text-brand-700 shadow-inner" iconSize={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black leading-tight text-ink">{summary.beneficiary.full_name}</p>
            <p className="mt-0.5 text-sm font-black text-slate-500">{summary.beneficiary.code || 'Sin codigo PYE'}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${summary.blocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {statusLabel}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric icon={UsersRound} label="Unidad familiar" value={summary.familyLabel} />
          <Metric icon={UserRound} label="Adultos" value={summary.adults} />
          <Metric icon={Baby} label="Menores" value={summary.minors} />
          <Metric icon={Clock} label="Última entrega" value={summary.lastDeliveryLabel} />
          <Metric icon={PackageCheck} label="Ha recibido hoy" value={summary.receivedToday ? 'SI' : 'NO'} tone={summary.receivedToday ? 'red' : 'green'} />
          <Metric icon={IdCard} label="Identificación" value={summary.sourceLabel} />
        </div>

        <PreparedBatchCard batch={summary.preparedBatch} customization={customization} onCustomize={onCustomize} />

        {summary.receivedToday && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-lg font-black">Ya recibio ayuda hoy</p>
            <p className="mt-1 font-semibold">Entrega ya registrada. No se permite registrar otra entrega desde este modo.</p>
          </div>
        )}

        {summary.blocked && !summary.receivedToday && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-lg font-black">Expediente no activo</p>
            <p className="mt-1 font-semibold">El estado actual impide registrar una entrega rapida.</p>
          </div>
        )}

        {repartoClosed && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <p className="text-lg font-black">Reparto cerrado</p>
            <p className="mt-1 font-semibold">El acta ya esta cerrada. No se pueden registrar nuevas entregas salvo reapertura autorizada.</p>
          </div>
        )}

        {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="secondary" onClick={onClose} className="h-12 px-5 text-base sm:w-44">
            Cancelar
          </Button>
          <Button
            className="h-14 rounded-2xl px-8 text-lg font-black tracking-wide sm:min-w-[18rem]"
            disabled={disabled}
            onClick={onRegister}
          >
            {registering ? <Loader2 className="animate-spin" size={22} /> : <CheckCircle2 size={24} />}
            {registering ? 'REGISTRANDO...' : 'Confirmar entrega'}
          </Button>
          {!canRegister && <p className="text-center text-sm font-bold text-red-700 sm:text-left">Tu usuario no tiene permiso para registrar entregas.</p>}
        </div>
      </div>
    </article>
  );
}

function PreparedBatchCard({ batch, customization, onCustomize }) {
  const plan = buildDeliveryPlan({ preparedBatch: batch, beneficiary: { id: customization?.beneficiaryId || '' } }, customization);
  const hasCustomization = Boolean(customization);
  return (
    <div className={`rounded-2xl border p-3 ${batch ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${batch ? 'bg-white text-brand-700' : 'bg-white text-slate-400'}`}>
            <PackageCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em]">{batch ? 'Lote preparado' : 'Lote preparado'}</p>
            <p className="mt-0.5 break-words text-sm font-black text-ink">{plan.deliveredLabel || batch?.label || 'Sin lote preparado'}</p>
            <p className="mt-0.5 text-xs font-semibold">{batch?.detail || 'La entrega se registrara como ayuda general si no existe un lote planificado.'}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
          {plan.estimatedValue > 0 && (
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black text-brand-800">
              <Euro size={15} /> Valor aproximado del lote: {formatCurrency(plan.estimatedValue)}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={onCustomize} className="h-9 shrink-0 px-3 text-xs">
            <Pencil size={14} /> Personalizar entrega
          </Button>
        </div>
      </div>
          {hasCustomization && (
            <div className="mt-2 rounded-xl bg-white/80 p-2 text-xs font-bold text-brand-900">
              <p>Entrega personalizada: {plan.deliveredLabel}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">Motivo: {customization.reason}</p>
            </div>
          )}
          {batch?.shortages?.length > 0 && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-900">
              <p className="text-xs font-black uppercase tracking-wide">Producto agotado o insuficiente</p>
              {batch.shortages.slice(0, 3).map((item) => (
                <p key={item.product} className="mt-1">{item.message}</p>
              ))}
            </div>
          )}
    </div>
  );
}

function CustomizeDeliveryModal({ summary, customization, currentUser, onCancel, onReset, onSave }) {
  const recommendedItems = recommendedItemsForSummary(summary);
  const defaultDeliveredItems = deliveredItemsForSummary(summary);
  const [items, setItems] = useState(() => (customization?.items?.length ? customization.items : defaultDeliveredItems).map(cloneDeliveryItem));
  const [reason, setReason] = useState(customization?.reason || '');
  const [error, setError] = useState('');
  const changed = hasDeliveryItemChanges(defaultDeliveredItems, items);

  function updateQuantity(itemId, nextQuantity) {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, quantity: sanitizeDeliveryQuantity(nextQuantity, item.availableStock) } : item));
  }

  function saveCustomization() {
    setError('');
    if (!items.some((item) => Number(item.quantity || 0) > 0)) {
      setError('Debe entregarse al menos un producto.');
      return;
    }
    if (changed && !String(reason || '').trim()) {
      setError('Indica el motivo del cambio.');
      return;
    }
    if (!changed) {
      onReset();
      return;
    }
    onSave({
      beneficiaryId: summary.beneficiary.id,
      recommendedItems: recommendedItems.map(cloneDeliveryItem),
      items: items.map(cloneDeliveryItem),
      reason: String(reason || '').trim(),
      modifiedBy: currentUserName(currentUser),
      modifiedAt: new Date().toISOString()
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
      <div className="w-full max-w-2xl rounded-[2rem] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-700">Smart Deliveries</p>
            <h2 className="mt-1 text-2xl font-black text-ink">Personalizar entrega</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Ajusta solo lo necesario. Si no cambias nada, se usara el lote recomendado.</p>
          </div>
          <Button type="button" variant="secondary" onClick={onCancel} className="h-10 px-3 text-xs">
            Cancelar
          </Button>
        </div>

        <div className="mt-5 grid gap-3">
          {items.map((item) => {
            const recommended = recommendedItems.find((entry) => entry.id === item.id);
            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-ink">{item.name}</p>
                    <p className="text-xs font-semibold text-slate-500">Recomendado: {formatDeliveryItemQuantity(recommended)} · Disponible: {formatBatchStock(item)}</p>
                    {item.shortageMessage && <p className="mt-1 text-xs font-bold text-amber-700">{item.shortageMessage}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" onClick={() => updateQuantity(item.id, Number(item.quantity || 0) - 1)} className="h-10 w-10 px-0">
                      <Minus size={16} />
                    </Button>
                    <input
                      type="number"
                      min="0"
                      max={Number.isFinite(Number(item.availableStock)) ? item.availableStock : undefined}
                      step="1"
                      value={item.quantity}
                      onChange={(event) => updateQuantity(item.id, event.target.value)}
                      className="h-10 w-24 rounded-xl border border-slate-200 bg-white px-3 text-center text-base font-black outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    />
                    <Button type="button" variant="secondary" onClick={() => updateQuantity(item.id, Number(item.quantity || 0) + 1)} className="h-10 w-10 px-0">
                      <Plus size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <label className="mt-4 block text-sm font-bold text-slate-700">
          Motivo del cambio
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ejemplo: unidad familiar mayor, falta de producto, ajuste indicado por coordinacion..."
            className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
        </label>

        {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button type="button" variant="secondary" onClick={onReset}>Usar recomendado</Button>
          <Button type="button" onClick={saveCustomization}>
            Guardar personalizacion
          </Button>
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
              {feedback.collectorType === 'authorized' && (
                <>
                  <InfoLineLight label="Recogida por" value={feedback.collectorName || '-'} />
                  <InfoLineLight label="Relacion" value={feedback.collectorRelation || '-'} />
                </>
              )}
              <SignatureLinesLight
                receiver={feedback.receiverSignatureLabel || 'Beneficiario o persona autorizada'}
                responsible={feedback.responsibleSignatureLabel || 'Usuario que realizo la entrega'}
              />
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

function SignatureLinesLight({ receiver, responsible }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-white/75">Firmas</span>
      <span className="text-lg font-black text-white">✔ {receiver}</span>
      <span className="text-lg font-black text-white">✔ {responsible}</span>
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

function RepartoSessionPanel({ session, batch, closing, closeError, canReopen, onFinish, onReopen, onOpenDelivery }) {
  const acta = buildRepartoActa(session, { batch });
  const latestRows = acta.deliveryRows.slice(0, 5);
  const stockItems = acta.stock.items.slice(0, 5);
  return (
    <section className="mt-4 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Sala de control</p>
          <h3 className="text-xl font-black text-ink">{acta.status}</h3>
          <p className="text-xs font-semibold text-slate-500">{acta.date} · Inicio {acta.startTime}{acta.endTime ? ` · Fin ${acta.endTime}` : ''}</p>
        </div>
        {session.endedAt ? (
          <Button type="button" variant="secondary" onClick={onReopen} disabled={!canReopen} className="h-10 px-3 text-xs">
            Reabrir
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onFinish} disabled={closing} className="h-10 px-3 text-xs">
            {closing ? <Loader2 className="animate-spin" size={14} /> : '🏁'} Cerrar reparto
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <SessionMetric label="Beneficiarios" value={acta.beneficiaries} />
        <SessionMetric label="Personas" value={acta.people} />
        <SessionMetric label="Adultos" value={acta.adults} />
        <SessionMetric label="Menores" value={acta.minors} />
        <SessionMetric label="Duplicadas" value={acta.duplicates} />
        <SessionMetric label="Tiempo medio" value={acta.averageTime} />
        <SessionMetric label="Firmas" value={acta.signatures} />
        <SessionMetric label="Valor" value={formatCurrency(acta.impact.estimatedValue)} />
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
        <p><strong>Usuarios registrando:</strong> {acta.users || '-'}</p>
        <p><strong>Productos entregados:</strong> {acta.products || 'Sin productos registrados'}</p>
        <p><strong>Stock restante:</strong> {acta.stock.label || 'Sin stock configurado'}</p>
        <p><strong>Productos agotados o bajo minimo:</strong> {acta.stock.alertsLabel || 'Sin alertas'}</p>
        <p><strong>Incidencias:</strong> {acta.incidents || 'Sin incidencias'}</p>
        <p><strong>Entregas anuladas:</strong> {acta.cancelled}</p>
      </div>

      {stockItems.length > 0 && (
        <div className="mt-3 grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Stock restante</p>
          {stockItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              <span>{item.name}</span>
              <span className={item.status === 'Disponible' ? 'text-emerald-700' : item.status === 'Stock bajo' ? 'text-amber-700' : 'text-red-700'}>
                {formatQuantity(item.stock)} {item.unit} · {item.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {closeError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{closeError}</p>}

      {session.endedAt && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-xs font-semibold text-brand-900">
            <p className="font-black uppercase tracking-[0.14em] text-brand-700">Estadisticas generadas</p>
            <p className="mt-2">Entregas: {acta.statistics.deliveryCount} - Bloqueadas: {acta.statistics.duplicateCount}</p>
            <p>Productos distintos: {acta.statistics.productCount} - Incidencias: {acta.statistics.incidentCount}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
            <p className="font-black uppercase tracking-[0.14em] text-emerald-700">Impacto generado</p>
            <p className="mt-2">Personas atendidas: {acta.impact.people}</p>
            <p>Valor social aproximado: {formatCurrency(acta.impact.estimatedValue)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700 sm:col-span-2">
            <p className="font-black uppercase tracking-[0.14em] text-slate-600">Repartos cerrados</p>
            <p className="mt-2">Cerrado por {acta.closedBy || '-'}{acta.closedByRole ? ` (${acta.closedByRole})` : ''} a las {acta.closedAt ? formatTime(acta.closedAt) : '-'}</p>
            <p>Acta: {session.acta?.pdfFilename || 'Generada'}</p>
            <p>Enviada a: {(session.acta?.emailRecipients || []).join(', ') || 'Pendiente de registro'}</p>
          </div>
        </div>
      )}

      {latestRows.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Ultimas entregas</p>
          {latestRows.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenDelivery?.(item.deliveryId)}
              disabled={!item.deliveryId}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>
                <strong className="text-ink">{item.deliveryNumber}</strong> · {item.beneficiaryName}
                <span className="block text-slate-500">{item.peopleCount} persona(s) · {formatTime(item.at)} · {item.identificationMethod}</span>
                {item.changeReason && (
                  <span className="block text-brand-700">Recomendado: {item.recommendedLabel} · Entregado: {item.deliveredLabel} · Motivo: {item.changeReason}</span>
                )}
              </span>
              {item.estimatedValue > 0 && (
                <span className="text-xs font-black text-emerald-700">{formatCurrency(item.estimatedValue)}</span>
              )}
              <span className="text-brand-700">Abrir entrega</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function LegacyRepartoSessionPanel({ session, onFinish, onOpenDelivery }) {
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
        <p><strong>Valor aproximado:</strong> {formatCurrency(acta.impact.estimatedValue)}</p>
        <p><strong>Incidencias:</strong> {acta.incidents || 'Sin incidencias'}</p>
        <p><strong>Entregas anuladas:</strong> {acta.cancelled}</p>
      </div>
      {session.endedAt && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-xs font-semibold text-brand-900">
            <p className="font-black uppercase tracking-[0.14em] text-brand-700">Estadisticas generadas</p>
            <p className="mt-2">Entregas: {acta.statistics.deliveryCount} - Bloqueadas: {acta.statistics.duplicateCount}</p>
            <p>Productos distintos: {acta.statistics.productCount} - Incidencias: {acta.statistics.incidentCount}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
            <p className="font-black uppercase tracking-[0.14em] text-emerald-700">Impacto generado</p>
            <p className="mt-2">Personas atendidas: {acta.impact.people}</p>
            <p>Valor social aproximado: {formatCurrency(acta.impact.estimatedValue)}</p>
          </div>
        </div>
      )}
      {acta.deliveryRows.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Entregas del acta</p>
          {acta.deliveryRows.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenDelivery?.(item.deliveryId)}
              disabled={!item.deliveryId}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>
                <strong className="text-ink">{item.deliveryNumber}</strong> · {item.beneficiaryName}
                <span className="block text-slate-500">{item.peopleCount} persona(s) · {formatTime(item.at)} · {item.identificationMethod}</span>
                {item.changeReason && (
                  <span className="block text-brand-700">Recomendado: {item.recommendedLabel} · Entregado: {item.deliveredLabel} · Motivo: {item.changeReason}</span>
                )}
              </span>
              {item.estimatedValue > 0 && (
                <span className="text-xs font-black text-emerald-700">{formatCurrency(item.estimatedValue)}</span>
              )}
              <span className="text-brand-700">Abrir entrega</span>
            </button>
          ))}
        </div>
      )}
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
    <div className={`min-w-0 rounded-xl border border-slate-200 p-2.5 ${toneClass}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={15} className="shrink-0" />
        <p className="line-clamp-2 min-w-0 text-[0.62rem] font-black uppercase leading-[0.78rem] tracking-wide">{label}</p>
      </div>
      <p className="mt-1 truncate text-sm font-black leading-tight text-ink" title={String(value || '-')}>{value || '-'}</p>
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

function BeneficiaryPhoto({ beneficiary, className = 'h-80 w-full rounded-[1.4rem] bg-white object-cover shadow-lg', fallbackClassName = 'flex h-80 w-full items-center justify-center rounded-[1.4rem] bg-brand-50 text-brand-700 shadow-inner', iconSize = 74 }) {
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
    return <img src={src} alt={beneficiary.full_name || 'Beneficiario'} className={className} />;
  }
  return (
    <div className={`flex items-center justify-center ${fallbackClassName}`}>
      <UserRound size={iconSize} />
    </div>
  );
}

function buildCollectionInfo(summary, flow) {
  if (flow.collectorType === 'authorized') {
    return {
      receiverName: String(flow.authorizedName || '').trim(),
      receiverDocument: '',
      label: `Persona autorizada (${String(flow.authorizedRelation || '').trim()})`,
      relation: String(flow.authorizedRelation || '').trim()
    };
  }
  return {
    receiverName: summary.beneficiary.full_name || '',
    receiverDocument: beneficiaryDocument(summary.beneficiary),
    label: 'Titular',
    relation: ''
  };
}

function buildSmartDeliveryNotes({ summary, flow, collection, registeredBy, date, traceability = {}, deliveryPlan = null }) {
  const notes = [
    'Entrega registrada desde Entregas Inteligentes.',
    `Numero de entrega: ${traceability.deliveryNumber || '-'}.`,
    `Codigo beneficiario: ${summary.beneficiary.code || '-'}.`,
    `Credencial utilizada: ${summary.credentialCode || '-'}.`,
    `Usuario autenticado: ${registeredBy}.`,
    `Rol usuario: ${traceability.registeredRole || '-'}.`,
    `Fecha registro: ${formatDate(date)}.`,
    `Hora registro: ${formatTime(date)}.`,
    `Dispositivo: ${traceability.device || '-'}.`,
    `Metodo identificacion: ${traceability.identificationMethod || '-'}.`,
    `Recoge: ${collection.label}.`,
    flow.collectorType === 'authorized' ? `Nombre autorizado: ${collection.receiverName}.` : '',
    flow.collectorType === 'authorized' ? `Relacion autorizada: ${collection.relation}.` : '',
    `Lote recomendado: ${deliveryPlan?.recommendedLabel || 'Sin lote preparado previo'}.`,
    `Lote entregado: ${deliveryPlan?.deliveredLabel || 'Ayuda general x 1'}.`,
    deliveryPlan?.estimatedValue > 0 ? `Valor aproximado lote: ${formatCurrency(deliveryPlan.estimatedValue)}.` : '',
    deliveryPlan?.incidents?.length ? `Incidencias lote: ${deliveryPlan.incidents.join('; ')}.` : '',
    deliveryPlan?.changed ? `Motivo cambio lote: ${deliveryPlan.reason}.` : '',
    deliveryPlan?.changed ? `Modificado por: ${deliveryPlan.modifiedBy || registeredBy}.` : '',
    deliveryPlan?.changed ? `Fecha modificacion lote: ${formatDate(deliveryPlan.modifiedAt || date)} ${formatTime(deliveryPlan.modifiedAt || date)}.` : '',
    flow.cannotSign ? `No puede firmar. Motivo: ${flow.noSignReason}. Testigo: ${registeredBy}.` : '',
    `Hora de recepcion: ${formatTime(date)}.`
  ];
  return notes.filter(Boolean).join(' ');
}

function customizationForSummary(summary, customization) {
  return customization?.beneficiaryId && customization.beneficiaryId === summary?.beneficiary?.id ? customization : null;
}

function buildDeliveryPlan(summary, customization) {
  const activeCustomization = customizationForSummary(summary, customization);
  const recommendedItems = activeCustomization?.recommendedItems?.length
    ? activeCustomization.recommendedItems.map(cloneDeliveryItem)
    : recommendedItemsForSummary(summary);
  const deliveredItems = activeCustomization?.items?.length
    ? activeCustomization.items.map(cloneDeliveryItem)
    : deliveredItemsForSummary(summary);
  const positiveItems = deliveredItems.filter((item) => Number(item.quantity || 0) > 0);
  const primaryItem = positiveItems[0] || defaultDeliveryItem();
  const changed = Boolean(activeCustomization) && hasDeliveryItemChanges(deliveredItemsForSummary(summary), deliveredItems);
  const incidents = [...(summary?.preparedBatch?.shortages || []).map((item) => item.message)];
  const recommendedValue = calculateDeliveryItemsValue(recommendedItems);
  const estimatedValue = calculateDeliveryItemsValue(deliveredItems);
  return {
    recommendedItems,
    deliveredItems,
    primaryItem,
    changed,
    incidents,
    recommendedValue,
    estimatedValue,
    reason: changed ? activeCustomization.reason : '',
    modifiedBy: changed ? activeCustomization.modifiedBy : '',
    modifiedAt: changed ? activeCustomization.modifiedAt : '',
    recommendedLabel: formatDeliveryItems(recommendedItems),
    deliveredLabel: formatDeliveryItems(deliveredItems)
  };
}

function recommendedItemsForSummary(summary) {
  const batch = summary?.preparedBatch || summary;
  if (Array.isArray(batch?.items) && batch.items.length) return batch.items.map(cloneDeliveryItem);
  if (batch?.label || batch?.helpType || batch?.inventoryItemId) {
    return [cloneDeliveryItem({
      id: batch.inventoryItemId || 'general',
      inventoryItemId: batch.inventoryItemId || null,
      name: batch.label || batch.helpType || 'Ayuda general',
      helpType: batch.helpType || batch.label || 'Alimentos',
      quantity: Number(batch.quantity || 1),
      unit: batch.unit || 'unidad(es)'
    })];
  }
  return [defaultDeliveryItem()];
}

function deliveredItemsForSummary(summary) {
  const batch = summary?.preparedBatch || summary;
  if (Array.isArray(batch?.deliveredItems) && batch.deliveredItems.length) return batch.deliveredItems.map(cloneDeliveryItem);
  return recommendedItemsForSummary(summary);
}

function defaultDeliveryItem() {
  return {
    id: 'general',
    inventoryItemId: null,
    name: 'Ayuda general',
    helpType: 'Alimentos',
    quantity: 1,
    unit: 'unidad(es)',
    availableStock: null
  };
}

function cloneDeliveryItem(item = {}) {
  const availableStock = item.availableStock ?? item.stock ?? null;
  const unitValue = inventoryItemUnitValue(item);
  const quantity = sanitizeDeliveryQuantity(item.quantity ?? 1, availableStock);
  const stockAfterDelivery = availableStock === null || availableStock === undefined || availableStock === ''
    ? (item.stockAfterDelivery ?? null)
    : Math.max(Number(availableStock || 0) - Number(quantity || 0), 0);
  return {
    id: String(item.id || item.inventoryItemId || item.inventory_item_id || item.name || 'general'),
    inventoryItemId: item.inventoryItemId || item.inventory_item_id || null,
    name: item.name || item.inventory_item_name || item.product || item.helpType || 'Ayuda general',
    helpType: item.helpType || item.help_type || item.name || 'Alimentos',
    quantity,
    unit: item.unit || 'unidad(es)',
    availableStock,
    stockAfterDelivery,
    lowStockThreshold: Number(item.lowStockThreshold ?? item.low_stock_threshold ?? 0),
    unitValue,
    recommendedQuantity: Number(item.recommendedQuantity ?? item.quantity ?? 1),
    quantityPerPerson: Number(item.quantityPerPerson || 0),
    shortageMessage: item.shortageMessage || '',
    substitutionFor: item.substitutionFor || ''
  };
}

function sanitizeDeliveryQuantity(value, max = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  const rounded = Math.round(parsed * 100) / 100;
  if (max === null || max === undefined || max === '') return rounded;
  const limit = Number(max);
  if (Number.isFinite(limit) && limit >= 0) return Math.min(rounded, limit);
  return rounded;
}

function hasDeliveryItemChanges(recommendedItems = [], deliveredItems = []) {
  const deliveredById = new Map(deliveredItems.map((item) => [item.id, Number(item.quantity || 0)]));
  if (recommendedItems.length !== deliveredItems.length) return true;
  return recommendedItems.some((item) => Number(item.quantity || 0) !== Number(deliveredById.get(item.id) ?? -1));
}

function formatDeliveryItems(items = []) {
  const positive = items.filter((item) => Number(item.quantity || 0) > 0);
  if (!positive.length) return 'Sin productos';
  return positive.map(formatDeliveryItemQuantity).join('; ');
}

function formatDeliveryItemQuantity(item = {}) {
  const quantity = Number(item.quantity || 0);
  const quantityLabel = formatQuantity(quantity);
  return `${item.name || 'Ayuda general'} x ${quantityLabel}${item.unit ? ` ${item.unit}` : ''}`;
}

function formatQuantity(value) {
  const quantity = Number(value || 0);
  return Number.isInteger(quantity) ? String(quantity) : String(quantity).replace('.', ',');
}

function calculateDeliveryItemsValue(items = []) {
  return roundCurrency(items.reduce((total, item) => (
    total + (Number(item.quantity || 0) * Number(item.unitValue || 0))
  ), 0));
}

function inventoryItemUnitValue(item = {}) {
  return firstPositiveNumber(item.unitValue, item.unit_value, item.estimated_unit_value, item.economic_value, item.price, item.cost);
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function nextSmartDeliveryNumber(deliveries = [], date = new Date()) {
  const year = new Date(date).getFullYear();
  const highest = deliveries.reduce((max, delivery) => {
    const match = String(delivery.receipt_number || '').match(/^ENT-(\d{4})-(\d{6})$/);
    if (!match || Number(match[1]) !== year) return max;
    return Math.max(max, Number(match[2]));
  }, 0);
  return `ENT-${year}-${String(highest + 1).padStart(6, '0')}`;
}

function currentUserRole(user = {}) {
  return String(user?.role_label || user?.role_name || user?.role || user?.profile || 'Usuario autorizado').trim() || 'Usuario autorizado';
}

function deliveryDeviceLabel() {
  if (typeof navigator === 'undefined') return 'No disponible';
  const userAgent = navigator.userAgent || '';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Navegador';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const mode = Number(navigator.maxTouchPoints || 0) > 1 ? 'pantalla tactil' : 'escritorio';
  return [browser, platform, mode].filter(Boolean).join(' · ') || 'No disponible';
}

async function registerSmartDeliveryInventoryMovements({ actions, deliveryPlan, primaryItem, deliveryNumber, registeredBy, date, deliveryId }) {
  const primaryInventoryId = primaryItem?.inventoryItemId || null;
  const movements = (deliveryPlan.deliveredItems || [])
    .filter((item) => item.inventoryItemId && Number(item.quantity || 0) > 0)
    .filter((item) => item.inventoryItemId !== primaryInventoryId)
    .map((item) => ({
      item_id: item.inventoryItemId,
      movement_type: 'Salida',
      quantity: Number(item.quantity || 0),
      moved_at: todayISO(),
      responsible: registeredBy,
      delivery_id: deliveryId || null,
      source_module: 'deliveries',
      source_record_id: deliveryId || null,
      notes: [
        `Salida automatica por Smart Deliveries ${deliveryNumber}.`,
        `Producto entregado: ${formatDeliveryItemQuantity(item)}.`,
        `Lote recomendado: ${deliveryPlan.recommendedLabel}.`,
        deliveryPlan.changed ? `Motivo del cambio: ${deliveryPlan.reason}.` : '',
        `Fecha y hora: ${formatDate(date)} ${formatTime(date)}.`
      ].filter(Boolean).join(' ')
    }));

  if (!movements.length) return { movements: [], error: '' };
  try {
    const results = actions.createInventoryMovements
      ? await actions.createInventoryMovements(movements)
      : await createInventoryMovementsSequentially(actions, movements);
    return { movements: results || [], error: '' };
  } catch (error) {
    console.error('[Entregas inteligentes] No se pudieron registrar todos los movimientos de inventario', error);
    return { movements: [], error: error.message || 'No se pudieron registrar todos los movimientos.' };
  }
}

async function createSmartDeliveryLowStockNotices({ actions, deliveryPlan, deliveryNumber }) {
  const notifier = actions?.notifications;
  if (!notifier?.notifyInventoryChanged) return [];
  const notices = [];
  const uniqueItems = new Map();
  (deliveryPlan.deliveredItems || [])
    .filter((item) => item.inventoryItemId)
    .forEach((item) => uniqueItems.set(item.inventoryItemId, item));

  for (const item of uniqueItems.values()) {
    const remaining = Number(item.stockAfterDelivery ?? (Number(item.availableStock || 0) - Number(item.quantity || 0)));
    const threshold = Number(item.lowStockThreshold || 0);
    const shouldNotify = remaining <= 0 || (threshold > 0 && remaining <= threshold);
    if (!shouldNotify) continue;
    const type = remaining <= 0 ? 'out_of_stock' : 'low_stock';
    await notifier.notifyInventoryChanged({
      type,
      item: {
        id: item.inventoryItemId,
        name: item.name,
        stock: remaining,
        low_stock_threshold: threshold
      },
      payload: {
        source: 'smart-deliveries',
        delivery_number: deliveryNumber
      }
    });
    notices.push({
      id: item.inventoryItemId,
      type,
      label: `${item.name} (${remaining <= 0 ? 'agotado' : 'stock bajo'})`
    });
  }
  return notices;
}

async function createInventoryMovementsSequentially(actions, movements) {
  const results = [];
  for (const movement of movements) {
    results.push(await actions.createInventoryMovement(movement));
  }
  return results;
}

function createDefaultRepartoBatchConfig() {
  return {
    name: `Reparto ${formatDate(new Date())}`,
    rules: {}
  };
}

function ensureBatchConfigRules(config = createDefaultRepartoBatchConfig(), inventoryItems = []) {
  const rules = { ...(config.rules || {}) };
  let changed = false;
  buildBatchInventoryItems(inventoryItems).forEach((item) => {
    if (rules[item.id] === undefined) {
      rules[item.id] = defaultQuantityPerPerson(item);
      changed = true;
    }
  });
  return changed ? { ...config, rules } : config;
}

function updateBatchRule(config, itemId, quantityPerPerson) {
  return {
    ...config,
    rules: {
      ...(config.rules || {}),
      [itemId]: sanitizeRuleQuantity(quantityPerPerson)
    }
  };
}

function buildCurrentRepartoBatch(inventoryItems = [], config = createDefaultRepartoBatchConfig()) {
  const items = buildBatchInventoryItems(inventoryItems).map((item) => ({
    ...item,
    quantityPerPerson: Number(config.rules?.[item.id] ?? defaultQuantityPerPerson(item))
  }));
  return {
    name: config.name || `Reparto ${formatDate(new Date())}`,
    items,
    totalStock: items.reduce((total, item) => total + Number(item.stock || 0), 0)
  };
}

function buildBatchInventoryItems(inventoryItems = []) {
  return (inventoryItems || [])
    .filter((item) => item?.id && item.name)
    .filter((item) => !normalize(`${item.status || ''} ${item.state || ''}`).includes('archiv'))
    .map((item) => ({
      id: item.id,
      inventoryItemId: item.id,
      name: item.name,
      category: item.category || '',
      unit: item.unit || 'unidad(es)',
      stock: Number(item.stock || 0),
      lowStockThreshold: Number(item.low_stock_threshold || item.lowStockThreshold || 0),
      unitValue: inventoryItemUnitValue(item),
      helpType: item.name || 'Alimentos'
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function defaultQuantityPerPerson(item = {}) {
  const label = normalize(`${item.name || ''} ${item.category || ''}`);
  if (label.includes('yogur')) return 2;
  if (label.includes('leche')) return 1;
  if (label.includes('pan')) return 1;
  if (label.includes('queso')) return 1;
  if (label.includes('kefir') || label.includes('kéfir')) return 1;
  return 1;
}

function sanitizeRuleQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) return 0;
  return Math.round(quantity * 100) / 100;
}

function formatBatchStock(item = {}) {
  const stock = Number(item.availableStock ?? item.stock ?? 0);
  const label = Number.isInteger(stock) ? String(stock) : String(stock).replace('.', ',');
  return `${label} ${item.unit || 'unidad(es)'}`;
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

function closeRepartoSession(session = {}, user = {}) {
  const endedAt = session.endedAt || new Date().toISOString();
  const closed = {
    ...session,
    endedAt,
    locked: true,
    closedAt: endedAt,
    closedBy: currentUserName(user),
    closedByRole: currentUserRole(user),
    closedById: user?.id || '',
    closedByEmail: user?.email || '',
    users: uniqueValues([...(session.users || []), currentUserName(user)].filter(Boolean))
  };
  const acta = buildRepartoActa(closed);
  return {
    ...closed,
    acta: {
      generatedAt: new Date().toISOString(),
      statistics: acta.statistics,
      impact: acta.impact
    }
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

function resolveRepartoActaRecipients(data = {}, currentUser = {}) {
  const settings = data.organization_settings?.[0] || {};
  const preferences = settings.erp_preferences?.smartDeliveries || {};
  const configured = normalizeRecipientList(preferences.actaRecipients || preferences.repartoActaRecipients || settings.smart_delivery_acta_recipients);
  const roleRecipients = (data.app_users || [])
    .filter(userHasOfficialRecipientRole)
    .map((user) => user.email);
  const fallback = [
    settings.presidency_email,
    settings.vicepresidency_email,
    settings.coordination_email,
    settings.email,
    settings.mail_sender_email,
    currentUser?.email
  ];
  return uniqueValues([...roleRecipients, ...configured, ...fallback].filter(isValidEmail));
}

function userHasOfficialRecipientRole(user = {}) {
  const label = normalize([
    user.role_label,
    user.role_name,
    user.role,
    user.position,
    user.cargo,
    user.title,
    user.first_name,
    user.last_name,
    user.email
  ].filter(Boolean).join(' '));
  return (
    label.includes('presid') ||
    label.includes('vicepresid') ||
    label.includes('coordinacion general') ||
    label.includes('coordinacion') ||
    label.includes('coordinador') ||
    label.includes('coordinadora')
  );
}

function normalizeRecipientList(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function buildRepartoExecutiveEmail(acta = {}, session = {}, recipients = []) {
  return [
    'Se ha cerrado oficialmente un reparto desde ALTHEMON Smart Deliveries.',
    '',
    `Fecha: ${acta.date}`,
    `Inicio: ${acta.startTime}`,
    `Fin: ${acta.endTime || formatTime(session.endedAt) || '-'}`,
    `Cerrado por: ${acta.closedBy || '-'}`,
    '',
    `Beneficiarios atendidos: ${acta.beneficiaries}`,
    `Personas atendidas: ${acta.people}`,
    `Adultos: ${acta.adults}`,
    `Menores: ${acta.minors}`,
    `Productos entregados: ${acta.products || 'Sin productos registrados'}`,
    `Duplicados bloqueados: ${acta.duplicates}`,
    `Incidencias: ${acta.incidents || 'Sin incidencias'}`,
    `Valor e impacto aproximado: ${formatCurrency(acta.impact?.estimatedValue)}`,
    '',
    `Destinatarios: ${recipients.join(', ')}`,
    '',
    'Se adjunta el Acta Oficial del Reparto en PDF.'
  ].join('\n');
}

function buildRepartoActa(session = {}, options = {}) {
  const deliveries = session.deliveries || [];
  const duplicates = session.duplicates || [];
  const incidents = [...(session.incidents || []), ...deliveries.filter((item) => item.incident).map((item) => ({ detail: item.incident }))];
  const products = summarizeProducts(deliveries);
  const impact = buildRepartoImpact(deliveries);
  const statistics = buildRepartoStatistics({ deliveries, duplicates, incidents, cancelled: session.cancelled || [] });
  const stock = summarizeControlRoomStock(options.batch, deliveries);
  return {
    status: session.endedAt ? 'Acta cerrada' : 'Acta en curso',
    date: formatDate(session.startedAt),
    startTime: formatTime(session.startedAt),
    endTime: session.endedAt ? formatTime(session.endedAt) : '',
    locked: Boolean(session.locked),
    closedBy: session.closedBy || '',
    closedByRole: session.closedByRole || '',
    closedAt: session.closedAt || session.endedAt || '',
    users: (session.users || []).join(', '),
    beneficiaries: uniqueValues(deliveries.map((item) => item.beneficiaryName)).length,
    people: deliveries.reduce((total, item) => total + Number(item.peopleCount || 0), 0),
    adults: deliveries.reduce((total, item) => total + Number(item.adults || 0), 0),
    minors: deliveries.reduce((total, item) => total + Number(item.minors || 0), 0),
    products,
    stock,
    incidents: incidents.map((item) => item.detail || item.title).filter(Boolean).join('; '),
    duplicates: duplicates.length,
    cancelled: (session.cancelled || []).length,
    signatures: deliveries.reduce((total, item) => total + Number(item.signatureCount || 0), 0),
    averageSeconds: averageDeliverySeconds(deliveries, session.startedAt, session.endedAt),
    averageTime: formatDurationSeconds(averageDeliverySeconds(deliveries, session.startedAt, session.endedAt)),
    statistics,
    impact,
    deliveryRows: deliveries.map((item) => ({
      id: item.id,
      deliveryId: item.deliveryId || '',
      deliveryNumber: item.deliveryNumber || 'Entrega sin numero',
      beneficiaryName: item.beneficiaryName || 'Beneficiario',
      peopleCount: item.peopleCount || 1,
      adults: Number(item.adults || 0),
      minors: Number(item.minors || 0),
      identificationMethod: item.identificationMethod || 'Busqueda manual',
      recommendedLabel: item.recommendedLabel || '',
      deliveredLabel: item.deliveredLabel || item.productLabel || '',
      changeReason: item.changeReason || '',
      modifiedBy: item.modifiedBy || '',
      modifiedAt: item.modifiedAt || '',
      estimatedValue: Number(item.estimatedValue || 0),
      at: item.at
    }))
  };
}

function summarizeControlRoomStock(batch = {}, deliveries = []) {
  const items = (batch?.items || []).map((item) => {
    const stock = Math.max(0, Math.round(Number(item.stock || 0) * 100) / 100);
    const threshold = Number(item.lowStockThreshold || 0);
    const status = stock <= 0 ? 'Agotado' : threshold > 0 && stock <= threshold ? 'Stock bajo' : 'Disponible';
    return {
      id: item.id,
      name: item.name,
      unit: item.unit || 'unidad(es)',
      stock,
      threshold,
      status
    };
  });
  const alerts = items.filter((item) => item.status !== 'Disponible');
  return {
    items,
    alerts,
    label: items.length ? items.map((item) => `${item.name} (${formatQuantity(item.stock)} ${item.unit})`).join(', ') : '',
    alertsLabel: alerts.map((item) => `${item.name}: ${item.status}`).join(', '),
    exhausted: alerts.filter((item) => item.status === 'Agotado').length,
    lowStock: alerts.filter((item) => item.status === 'Stock bajo').length
  };
}

function averageDeliverySeconds(deliveries = [], startedAt = '', endedAt = '') {
  if (!deliveries.length) return 0;
  const start = new Date(startedAt || deliveries[deliveries.length - 1]?.at || Date.now()).getTime();
  const end = new Date(endedAt || deliveries[0]?.at || Date.now()).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 1000 / deliveries.length);
}

function formatDurationSeconds(seconds) {
  const value = Number(seconds || 0);
  if (!value) return '0 s';
  if (value < 60) return `${value} s`;
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

function buildRepartoStatistics({ deliveries = [], duplicates = [], incidents = [], cancelled = [] } = {}) {
  const productNames = new Set();
  deliveries.forEach((delivery) => {
    (delivery.deliveredItems || parseDeliveryItemsFromLabel(delivery.deliveredLabel || delivery.productLabel || ''))
      .forEach((item) => productNames.add(item.name || 'Ayuda general'));
  });
  return {
    deliveryCount: deliveries.length,
    duplicateCount: duplicates.length,
    productCount: productNames.size,
    incidentCount: incidents.length,
    cancelledCount: cancelled.length
  };
}

function buildRepartoImpact(deliveries = []) {
  return {
    people: deliveries.reduce((total, item) => total + Number(item.peopleCount || 0), 0),
    estimatedValue: roundCurrency(deliveries.reduce((total, item) => total + Number(item.estimatedValue || 0), 0)),
    deliveredUnits: roundCurrency(deliveries.reduce((total, item) => {
      const items = item.deliveredItems || parseDeliveryItemsFromLabel(item.deliveredLabel || item.productLabel || '');
      return total + items.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
    }, 0))
  };
}

function summarizeProducts(deliveries = []) {
  const counts = new Map();
  deliveries.forEach((item) => {
    const deliveredItems = Array.isArray(item.deliveredItems) && item.deliveredItems.length
      ? item.deliveredItems
      : parseDeliveryItemsFromLabel(item.deliveredLabel || item.productLabel || 'Ayuda general x 1');
    deliveredItems.forEach((product) => {
      const key = product.name || 'Ayuda general';
      counts.set(key, (counts.get(key) || 0) + Number(product.quantity || 0));
    });
  });
  return [...counts.entries()].map(([name, count]) => `${name} (${formatQuantity(count)})`).join(', ');
}

function parseDeliveryItemsFromLabel(value = '') {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.*?)\s+x\s+([\d,.]+)/i);
      return {
        name: match ? match[1].trim() : item,
        quantity: match ? Number(match[2].replace(',', '.')) || 0 : 1
      };
    });
}

function uniqueValues(values = []) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function buildBeneficiarySummary({ beneficiary, data, recentDeliveries, credentialEntry, source, repartoBatch }) {
  const allDeliveries = [...recentDeliveries, ...(data.deliveries || [])];
  const deliveries = allDeliveries.filter((delivery) => delivery.beneficiary_id === beneficiary.id && isActiveDelivery(delivery));
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
  const peopleCount = Math.max(adults + minors, 1);
  const preparedBatch = buildRecommendedBatchForReparto(repartoBatch, peopleCount) || findPreparedBatch(beneficiary, data, deliveries);
  const status = beneficiaryStatus(beneficiary);
  const blocked = normalize(status).includes('inactiv') || normalize(status).includes('suspend') || normalize(status).includes('archiv');
  return {
    beneficiary,
    status,
    blocked,
    receivedToday,
    adults,
    minors,
    peopleCount,
    familyLabel: family?.family_code || family?.name || family?.address || (beneficiary.family_id ? 'Unidad familiar' : 'Sin unidad familiar'),
    preparedBatch,
    lastDelivery,
    lastDeliveryTime: deliveryDisplayTime(lastDelivery),
    lastDeliveryResponsible: deliveryResponsible(lastDelivery),
    todayDeliveryDateTime: deliveryDisplayDateTime(todayDelivery),
    todayDeliveryResponsible: deliveryResponsible(todayDelivery),
    lastDeliveryLabel: lastDelivery ? `${formatDate(lastDelivery.delivered_at || lastDelivery.created_at)} · ${lastDelivery.help_type || 'Ayuda'}` : 'Sin entregas',
    sourceLabel: source === 'qr' && credentialEntry?.credentialId ? 'Credencial oficial' : 'Busqueda manual',
    identificationMethod: source === 'qr' ? 'QR' : 'Busqueda manual',
    credentialCode: credentialEntry?.credentialId || credentialEntry?.legacyCredentialId || ''
  };
}

function buildRecommendedBatchForReparto(repartoBatch, peopleCount = 1) {
  if (!repartoBatch?.items?.length) return null;
  const recommendedItems = [];
  const deliveredById = new Map();
  const stockRemaining = new Map();
  const shortages = [];

  repartoBatch.items.forEach((item) => {
    stockRemaining.set(item.id, Math.max(Number(item.stock || 0), 0));
  });

  repartoBatch.items.forEach((item) => {
    const requested = Math.max(0, Math.round(Number(item.quantityPerPerson || 0) * Number(peopleCount || 1) * 100) / 100);
    if (requested <= 0) return;
    const available = Number(item.stock || 0);
    const delivered = Math.min(requested, Math.max(available, 0));
    const shortageMessage = delivered < requested
      ? `${item.name}: recomendado ${formatQuantity(requested)} ${item.unit || ''}, disponible ${formatQuantity(available)}.`
      : '';

    recommendedItems.push(cloneDeliveryItem({
      ...item,
      quantity: requested,
      recommendedQuantity: requested,
      availableStock: available,
      shortageMessage
    }));

    deliveredById.set(item.id, cloneDeliveryItem({
      ...item,
      quantity: delivered,
      recommendedQuantity: requested,
      availableStock: available,
      stockAfterDelivery: Math.max(available - delivered, 0),
      shortageMessage
    }));
    stockRemaining.set(item.id, Math.max(available - delivered, 0));
  });

  deliveredById.forEach((deliveredItem) => {
    const requested = Number(deliveredItem.recommendedQuantity || 0);
    const delivered = Number(deliveredItem.quantity || 0);
    if (delivered >= requested) return;
    const missing = Math.max(0, Math.round((requested - delivered) * 100) / 100);
    const sourceItem = repartoBatch.items.find((item) => item.id === deliveredItem.id) || deliveredItem;
    const substitute = findBatchSubstitute(repartoBatch.items, sourceItem, stockRemaining);
    const substituteAvailable = substitute ? Number(stockRemaining.get(substitute.id) ?? substitute.stock ?? 0) : 0;
    const substituteQuantity = substitute ? Math.min(missing, Math.max(substituteAvailable, 0)) : 0;
    let message = `No hay ${sourceItem.name}. Sin sustitucion disponible.`;

    if (substitute && substituteQuantity > 0) {
      const currentSubstitute = deliveredById.get(substitute.id) || cloneDeliveryItem({
        ...substitute,
        quantity: 0,
        recommendedQuantity: 0,
        availableStock: Number(substitute.stock || 0)
      });
      const nextQuantity = Math.round((Number(currentSubstitute.quantity || 0) + substituteQuantity) * 100) / 100;
      deliveredById.set(substitute.id, {
        ...currentSubstitute,
        quantity: nextQuantity,
        stockAfterDelivery: Math.max(substituteAvailable - substituteQuantity, 0),
        substitutionFor: uniqueValues([currentSubstitute.substitutionFor, sourceItem.name]).join(', ')
      });
      stockRemaining.set(substitute.id, Math.max(substituteAvailable - substituteQuantity, 0));
      message = `No hay ${sourceItem.name}. Sugerencia aplicada: +${formatQuantity(substituteQuantity)} ${substitute.name}.`;
    }

    deliveredById.set(deliveredItem.id, {
      ...deliveredItem,
      shortageMessage: message,
      stockAfterDelivery: Math.max(Number(stockRemaining.get(deliveredItem.id) ?? 0), 0)
    });
    shortages.push({
      product: sourceItem.name,
      requested,
      available: Number(deliveredItem.availableStock || 0),
      missing,
      substitute: substitute?.name || '',
      substituteQuantity,
      message
    });
  });

  const deliveredItems = [...deliveredById.values()].map((item) => ({
    ...item,
    stockAfterDelivery: Number(stockRemaining.get(item.id) ?? item.stockAfterDelivery ?? 0)
  }));
  const positiveDelivered = deliveredItems.filter((item) => Number(item.quantity || 0) > 0);
  const primary = positiveDelivered[0] || deliveredItems[0] || recommendedItems[0] || defaultDeliveryItem();

  return {
    source: 'Lote del reparto',
    label: formatDeliveryItems(deliveredItems),
    detail: `${repartoBatch.name} · ${peopleCount} persona(s) · ${positiveDelivered.length} producto(s) entregables`,
    helpType: primary.helpType || primary.name || 'Alimentos',
    quantity: Number(primary.quantity || 1),
    inventoryItemId: primary.inventoryItemId || null,
    items: recommendedItems,
    deliveredItems,
    shortages,
    estimatedValue: calculateDeliveryItemsValue(deliveredItems),
    recommendedValue: calculateDeliveryItemsValue(recommendedItems)
  };
}

function findBatchSubstitute(items = [], unavailableItem = {}, stockRemaining = null) {
  const hasStock = (item) => Number(stockRemaining?.get(item.id) ?? item.stock ?? 0) > 0;
  const sameCategory = items.find((item) => (
    item.id !== unavailableItem.id
    && hasStock(item)
    && normalize(item.category || '') === normalize(unavailableItem.category || '')
  ));
  if (sameCategory) return sameCategory;
  return items.find((item) => item.id !== unavailableItem.id && hasStock(item)) || null;
}

function findPreparedBatch(beneficiary, data = {}, deliveries = []) {
  const today = todayISO();
  const plannedDelivery = [...deliveries]
    .filter((delivery) => !isReceivedDelivery(delivery))
    .filter((delivery) => String(delivery.delivered_at || '').slice(0, 10) >= today)
    .sort((a, b) => String(a.delivered_at || '').localeCompare(String(b.delivered_at || '')))[0];

  if (plannedDelivery) {
    const plannedItem = {
      id: plannedDelivery.inventory_item_id || plannedDelivery.help_type || 'programada',
      inventoryItemId: plannedDelivery.inventory_item_id || null,
      name: plannedDelivery.inventory_item_name || plannedDelivery.help_type || 'Lote programado',
      helpType: plannedDelivery.help_type || 'Ayuda',
      quantity: Number(plannedDelivery.quantity || 1),
      unit: plannedDelivery.inventory_item_unit || 'unidad(es)'
    };
    return {
      source: 'Entrega programada',
      label: plannedDelivery.inventory_item_name || plannedDelivery.help_type || 'Lote programado',
      detail: `${formatDate(plannedDelivery.delivered_at)} · ${plannedDelivery.help_type || 'Ayuda'} · ${plannedDelivery.quantity || 1} unidad(es)`,
      helpType: plannedDelivery.help_type || 'Alimentos',
      quantity: Number(plannedDelivery.quantity || 1),
      inventoryItemId: plannedDelivery.inventory_item_id || null,
      items: [plannedItem]
    };
  }

  const campaign = findActiveCampaignForBeneficiary(beneficiary, data);
  if (!campaign) return null;
  const products = productsForCampaign(campaign.id, data);
  const label = products.length ? products.map((item) => item.name).join(', ') : (campaign.name || 'Campana activa');
  const items = products.length
    ? products.map((item) => ({
      id: item.id,
      inventoryItemId: item.id,
      name: item.name,
      helpType: item.name || campaign.name || 'Alimentos',
      quantity: Number(item.campaignQuantity || 1),
      unit: item.unit || 'unidad(es)'
    }))
    : [defaultDeliveryItem()];
  return {
    source: 'Campana activa',
    label,
    detail: `${campaign.name || 'Campana'} · ${products.length ? `${products.length} producto(s)` : 'Sin productos vinculados'}`,
    helpType: campaign.name || 'Alimentos',
    quantity: Number(items[0]?.quantity || 1),
    inventoryItemId: items[0]?.inventoryItemId || null,
    items
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
  const links = (data.campana_productos || []).filter((item) => item.campaign_id === campaignId);
  const quantityByProduct = new Map(links.map((item) => [item.product_id, Number(item.quantity || item.cantidad || 1)]));
  const productIds = new Set(links.map((item) => item.product_id));
  return (data.inventory_items || [])
    .filter((item) => productIds.has(item.id))
    .map((item) => ({ ...item, campaignQuantity: quantityByProduct.get(item.id) || 1 }));
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

function normalizeUsbReaderValue(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, '')
    .trim();
}

function createUsbDiagnostic() {
  return {
    listening: false,
    lastKey: '',
    keyCount: 0,
    buffer: '',
    enterReceived: false,
    finalText: '',
    extractedId: '',
    result: 'Esperando activacion del modo escucha USB.',
    ignoredReason: '',
    updatedAt: ''
  };
}

function describeUsbKey(event) {
  if (!event) return '';
  if (event.key === ' ') return 'Espacio';
  return event.key || event.code || '';
}

function truncateDiagnostic(value) {
  const text = String(value || '');
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function isTextEditingElement(element) {
  if (!element || element === document.body) return false;
  if (element.isContentEditable) return true;
  const tagName = String(element.tagName || '').toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
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
