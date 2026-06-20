import { X } from 'lucide-react';

export function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 px-4 py-6">
      <div className={`mx-auto rounded-md bg-white shadow-panel ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
