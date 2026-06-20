import { useState } from 'react';
import logo from '../assets/logo-pan-y-esperanza.png';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';

export function Login({ onAccess }) {
  const [email, setEmail] = useState('elizabeth@panyesperanza.org');
  const [password, setPassword] = useState('Elizabeth2026!');
  const [error, setError] = useState('');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7faf6] px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-between bg-brand-600 p-8 text-white sm:p-10">
          <div>
            <img src={logo} alt="Pan y Esperanza" className="h-24 w-auto object-contain" />
            <h2 className="mt-8 text-3xl font-bold">Pan y Esperanza</h2>
            <p className="mt-3 max-w-md text-brand-50">Gestion integral de beneficiarios, entregas, inventario y justificantes.</p>
          </div>
          <p className="mt-10 text-sm text-brand-50">Logo oficial integrado sin deformar y preparado para impresion.</p>
        </div>
        <form className="p-8 sm:p-10" onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          try {
            await onAccess({ email, password });
          } catch (err) {
            setError(err.message || 'No se pudo iniciar sesion.');
          }
        }}>
          <BrandLogo className="h-16 w-auto" />
          <h3 className="mt-8 text-2xl font-bold text-ink">Acceso</h3>
          <p className="mt-2 text-sm text-slate-600">Inicia sesion con email y contrasena.</p>
          <div className="mt-6 space-y-4">
            <FormField label="Email">
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </FormField>
            <FormField label="Contrasena">
              <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </FormField>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
            <Button className="w-full" type="submit">Entrar</Button>
          </div>
        </form>
      </section>
    </main>
  );
}
