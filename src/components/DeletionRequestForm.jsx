import { Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';
import { FormField, inputClass } from './FormField';

export function DeletionRequestForm({ recordLabel, relations = [], onCancel, onSubmit }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setError('Indica un motivo de al menos 5 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ reason: cleanReason, notes: notes.trim() });
    } catch (submitError) {
      setError(submitError.message || 'No se pudo enviar la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">No se eliminará el registro ahora.</p>
        <p className="mt-1">Se enviará una solicitud al proveedor del sistema para revisar la eliminación definitiva de {recordLabel || 'este registro'}.</p>
      </div>
      {relations.length > 0 && (
        <div>
          <p className="text-sm font-bold text-ink">Información relacionada detectada:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {relations.map((relation) => <li key={relation}>{relation}</li>)}
          </ul>
        </div>
      )}
      <FormField label="Motivo">
        <textarea className={inputClass} autoFocus required minLength="5" rows="4" value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      <FormField label="Observaciones opcionales">
        <textarea className={inputClass} rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </FormField>
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="danger" disabled={saving}>
          {saving ? <Trash2 size={16} /> : <Send size={16} />}
          {saving ? 'Enviando...' : 'Enviar solicitud de eliminación'}
        </Button>
      </div>
    </form>
  );
}
