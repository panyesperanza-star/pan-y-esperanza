import React from 'react';

export const inputClass = 
  "focus:ring w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink";

export function FormField({ label, required = false, children }) {
  return (
    <div className="block">
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="ml-1 font-bold text-red-600">*</span>
        )}
      </label>
      {children}
    </div>
  );
}
