import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { fileToDataUrl } from '../lib/imageFiles';
import { Button } from './Button';

export function CredentialPhotoPicker({
  value,
  onChange,
  label = 'Foto para credencial',
  description = 'Esta imagen se utilizará al generar la credencial oficial.'
}) {
  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onChange(await fileToDataUrl(file));
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <CredentialPhotoPreview value={value} label={label} size="large" />
        <div className="flex-1">
          <p className="font-bold text-ink">{label}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <ImageIcon size={16} />
              {value ? 'Cambiar foto' : 'Subir foto'}
              <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />
            </label>
            {value && (
              <Button variant="secondary" onClick={() => onChange('')}>
                <Trash2 size={16} /> Eliminar foto
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CredentialPhotoPreview({ value, label = 'Foto', size = 'small', fallback = null }) {
  const dimensions = size === 'large' ? 'h-24 w-24' : 'h-10 w-10';
  const iconSize = size === 'large' ? 28 : 18;

  if (value) {
    return <img src={value} alt={label} className={`${dimensions} shrink-0 rounded-md object-cover`} />;
  }

  if (fallback) return fallback;

  return (
    <div className={`${dimensions} flex shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700`}>
      <ImageIcon size={iconSize} />
    </div>
  );
}
