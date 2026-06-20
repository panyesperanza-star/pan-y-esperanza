import logo from '../assets/logo-pan-y-esperanza.png';

export function BrandLogo({ className = 'h-12 w-auto', showText = true }) {
  return (
    <div className="flex items-center gap-3">
      <img src={logo} alt="Pan y Esperanza" className={`${className} object-contain`} />
      {showText && (
        <div>
          <h1 className="text-lg font-bold text-ink">Pan y Esperanza</h1>
          <p className="text-sm text-slate-500">Gestion social nacional</p>
        </div>
      )}
    </div>
  );
}
