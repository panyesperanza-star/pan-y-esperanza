import { Boxes, Building2, DatabaseBackup, FileText, Gift, HandCoins, HandHeart, Home, LogOut, Menu, PackageCheck, PieChart, RotateCcw, Users, UserRoundCheck, X } from 'lucide-react';
import { useState } from 'react';
import { MODULES } from '../lib/constants';
import { canAccess } from '../lib/auth';
import { BrandLogo } from './BrandLogo';
import { Button } from './Button';

const icons = { dashboard: Home, settings: Building2, beneficiaries: HandHeart, families: Users, deliveries: PackageCheck, receipts: FileText, inventory: Boxes, donations: Gift, treasury: HandCoins, volunteers: UserRoundCheck, reports: PieChart, backup: DatabaseBackup };

export function Layout({ active, setActive, onReset, currentUser, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const modules = MODULES.filter((module) => module.id === 'dashboard' || canAccess(currentUser, module.id));
  const nav = (
    <nav className="space-y-1">
      {modules.map((module) => {
        const Icon = icons[module.id];
        return (
          <button key={module.id} onClick={() => { setActive(module.id); setOpen(false); }} className={`focus-ring flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold ${active === module.id ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-brand-50'}`}>
            <Icon size={18} /> {module.label}
          </button>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-screen bg-[#f7faf6]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <button className="focus-ring rounded-md p-2" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={22} /></button>
          <BrandLogo className="h-10 w-auto" showText={false} />
          <Button variant="secondary" onClick={onReset}><RotateCcw size={16} /></Button>
          <Button variant="secondary" onClick={onLogout}><LogOut size={16} /></Button>
        </div>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden"><aside className="h-full w-80 bg-white p-4"><div className="mb-5 flex items-center justify-between"><BrandLogo className="h-12 w-auto" showText={false} /><button className="rounded-md p-2" onClick={() => setOpen(false)}><X /></button></div>{nav}</aside></div>}
      <aside className="fixed inset-y-0 hidden w-72 border-r border-slate-200 bg-white p-5 lg:block">
        <BrandLogo className="h-16 w-auto" />
        <div className="mt-4 rounded-md bg-brand-50 p-3 text-sm text-brand-700">
          <p className="font-semibold">{currentUser?.first_name} {currentUser?.last_name}</p>
          <p>{currentUser?.role}</p>
        </div>
        <div className="mt-8">{nav}</div>
        <div className="absolute bottom-5 left-5 right-5 grid gap-2">
          <Button variant="secondary" onClick={onReset}><RotateCcw size={16} /> Reiniciar demo</Button>
          <Button variant="secondary" onClick={onLogout}><LogOut size={16} /> Cerrar sesion</Button>
        </div>
      </aside>
      <main className="lg:pl-72">
        <div className="hidden border-b border-slate-200 bg-white px-8 py-4 lg:block">
          <BrandLogo className="h-12 w-auto" />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
