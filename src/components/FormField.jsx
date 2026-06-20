export const inputClass =
  'focus:ring w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink';

export function FormField({ label, required = false, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="ml-1 text-red-600">*</span>
        )}
      </span>
      {children}
    </label>
  );
}
