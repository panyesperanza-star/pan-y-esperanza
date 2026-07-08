import { AlertTriangle, Download, ShieldAlert, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';

const cleanupScopes = [
  { id: 'donations', label: 'Donaciones de prueba' },
  { id: 'inventory', label: 'Inventario de prueba' },
  { id: 'inventory_entries', label: 'Entradas de prueba' },
  { id: 'inventory_exits', label: 'Salidas de prueba' }
];

export function Backup({ data, actions, currentUser }) {
  const [scope, setScope] = useState('Todo');
  const [cleanupSelection, setCleanupSelection] = useState([]);
  const [cleanupText, setCleanupText] = useState('');
  const [backupAccepted, setBackupAccepted] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState('');
  const [cleanupError, setCleanupError] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const isSuperadmin = currentUser?.role === 'Superadministrador';

  function exportBackup() {
    const payload = buildBackupPayload(data, scope);
    downloadBackupPayload(payload, `backup-pan-y-esperanza-${scope.toLowerCase().replaceAll(' ', '-')}-${new Date().toISOString().slice(0, 10)}.json`);
  }

  function downloadBackupPayload(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    localStorage.setItem('pye-last-backup-at', new Date().toISOString());
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await actions.replaceAllData(JSON.parse(text));
  }

  function toggleCleanupScope(id) {
    setCleanupNotice('');
    setCleanupError('');
    setCleanupSelection((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function prepareProduction() {
    setCleanupNotice('');
    setCleanupError('');
    if (!cleanupSelection.length) {
      setCleanupError('Selecciona al menos un bloque de datos operativos para limpiar.');
      return;
    }
    if (!backupAccepted || cleanupText.trim().toUpperCase() !== 'PREPARAR') {
      setCleanupError('Confirma la copia de seguridad y escribe PREPARAR para continuar.');
      return;
    }
    const confirmed = window.confirm('Esta acción limpiará los datos operativos seleccionados después de descargar una copia completa. No se eliminarán usuarios, configuración, permisos, familias ni beneficiarios. ¿Continuar?');
    if (!confirmed) return;
    setCleaning(true);
    try {
      downloadBackupPayload(data, `backup-previo-produccion-${new Date().toISOString().slice(0, 10)}.json`);
      const result = await actions.prepareProductionEnvironment(cleanupSelection);
      const total = Object.values(result || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      setCleanupNotice(`Entorno preparado. Registros operativos eliminados: ${total}.`);
      setCleanupSelection([]);
      setCleanupText('');
      setBackupAccepted(false);
    } catch (error) {
      setCleanupError(error.message || 'No se pudo preparar el entorno de producción.');
    } finally {
      setCleaning(false);
    }
  }

  return (
    <>
      <PageHeader title="Copias de seguridad" description="Crear copia manual y restaurar una copia exportada." />
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 max-w-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700">Copias &gt; Crear copia</label>
          <select className="focus-ring w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option>Base de datos</option>
            <option>Documentos</option>
            <option>Todo</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={exportBackup}><Download size={18} /> Crear copia manual</Button>
          <label className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Upload size={18} /> Restaurar copia
            <input className="hidden" type="file" accept="application/json" onChange={importBackup} />
          </label>
          <Button variant="secondary" onClick={actions.resetDemo}>Restaurar demo</Button>
        </div>
        <p className="mt-4 text-sm text-slate-500">En produccion con Supabase, esta exportacion manual complementa las copias programadas del proyecto y del almacenamiento.</p>
      </section>
      {isSuperadmin && (
        <section className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-5 shadow-panel">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0 text-amber-700" size={22} />
            <div>
              <h3 className="font-bold text-ink">Preparar entorno de producción</h3>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Limpia datos operativos de prueba antes de comenzar con datos reales. No elimina usuarios, configuración, plantillas, permisos, familias ni beneficiarios.
              </p>
            </div>
          </div>
          {cleanupNotice && <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{cleanupNotice}</div>}
          {cleanupError && <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"><AlertTriangle size={17} /> {cleanupError}</div>}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cleanupScopes.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={cleanupSelection.includes(item.id)} onChange={() => toggleCleanupScope(item.id)} />
                {item.label}
              </label>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <input type="checkbox" checked={backupAccepted} onChange={(event) => setBackupAccepted(event.target.checked)} />
            Confirmo que se descargará una copia de seguridad completa antes de limpiar.
          </label>
          <label className="mt-4 block max-w-sm">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-amber-900">Escribe PREPARAR</span>
            <input className="focus-ring w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-ink" value={cleanupText} onChange={(event) => setCleanupText(event.target.value)} />
          </label>
          <div className="mt-4 flex justify-end">
            <Button variant="danger" onClick={prepareProduction} disabled={cleaning}>{cleaning ? 'Preparando...' : 'Preparar producción'}</Button>
          </div>
        </section>
      )}
    </>
  );
}

function buildBackupPayload(data, scope) {
  if (scope === 'Todo') return data;
  const documentTables = ['beneficiary_documents'];
  if (scope === 'Documentos') {
    return Object.fromEntries(documentTables.map((table) => [table, data[table] || []]));
  }
  return Object.fromEntries(Object.entries(data).filter(([table]) => !documentTables.includes(table)));
}
