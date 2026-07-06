import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';
import { FormField, inputClass } from './FormField';

export function DirectDeletionForm({ recordLabel, relations = [], onCancel, onConfirm }) {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canConfirm = confirmation === 'ELIMINAR';

  async function submit(event) {
    event.preventDefault();
    if (!canConfirm) return;
    setError('');
    setSaving(true);
    try {
      await onConfirm();
    } catch (submitError) {
      setError(submitError.message || 'No se pudo eliminar definitivamente el registro.');
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-bold">Esta acción eliminará definitivamente {recordLabel || 'este registro'}.</p>
        <p className="mt-1">Solo está disponible para el Superadministrador propietario de Pan y Esperanza.</p>
      </div>
      {relations.length > 0 && (
        <div>
          <p className="text-sm font-bold text-ink">Información relacionada detectada:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {relations.map((relation) => <li key={relation}>{relation}</li>)}
          </ul>
        </div>
      )}
      <FormField label="Escribe ELIMINAR para confirmar">
        <input className={inputClass} autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </FormField>
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="danger" disabled={!canConfirm || saving}>
          <Trash2 size={16} /> {saving ? 'Eliminando...' : 'Eliminar definitivamente'}
        </Button>
      </div>
    </form>
  );
}
