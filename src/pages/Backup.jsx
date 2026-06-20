import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';

export function Backup({ data, actions }) {
  const [scope, setScope] = useState('Todo');
  function exportBackup() {
    const payload = buildBackupPayload(data, scope);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-pan-y-esperanza-${scope.toLowerCase().replaceAll(' ', '-')}-${new Date().toISOString().slice(0, 10)}.json`;
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
