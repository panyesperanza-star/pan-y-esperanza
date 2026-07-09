import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileText,
  HandHeart,
  HeartHandshake,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  PackageCheck,
  Phone,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { loadPublicImpact } from './lib/impact.js';

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://pan-y-esperanza.vercel.app';
const contactEmail = 'info@panyesperanza.org';
const contactPhone = '910 000 000';
const contactPhoneCompact = '34910000000';
const address = 'Calle Solidaridad 10, Madrid';

const images = {
  hero: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=2400&q=85',
  story: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=1400&q=85',
  food: 'https://images.unsplash.com/photo-1599059813005-11265ba4b4ce?auto=format&fit=crop&w=1200&q=85',
  social: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1200&q=85',
  volunteer: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?auto=format&fit=crop&w=1200&q=85',
  donation: 'https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=1200&q=85',
  guidance: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1200&q=85',
  galleryA: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&w=1200&q=85',
  galleryB: 'https://images.unsplash.com/photo-1593113630400-ea4288922497?auto=format&fit=crop&w=1200&q=85',
  galleryC: 'https://images.unsplash.com/photo-1560252829-804f1aedf1be?auto=format&fit=crop&w=1200&q=85'
};

const navItems = [
  ['Quiénes somos', '#quienes-somos'],
  ['Qué hacemos', '#que-hacemos'],
  ['Impacto', '#impacto'],
  ['Necesito ayuda', '#ayuda'],
  ['Colaborar', '#colaborar'],
  ['Contacto', '#contacto']
];

const workAreas = [
  {
    title: 'Reparto de alimentos',
    text: 'Organizamos entregas de productos básicos para familias y personas que atraviesan una situación de necesidad.',
    image: images.food,
    icon: PackageCheck
  },
  {
    title: 'Atención social',
    text: 'Escuchamos cada caso, recogemos documentación y orientamos a las personas para que puedan acceder a recursos adecuados.',
    image: images.social,
    icon: HeartHandshake
  },
  {
    title: 'Voluntariado',
    text: 'Personas voluntarias colaboran en recogidas, preparación de lotes, acompañamiento y apoyo en campañas solidarias.',
    image: images.volunteer,
    icon: Users
  },
  {
    title: 'Donaciones',
    text: 'Canalizamos donaciones de alimentos, productos de primera necesidad y aportaciones económicas con trazabilidad interna.',
    image: images.donation,
    icon: HandHeart
  },
  {
    title: 'Orientación',
    text: 'Informamos sobre pasos, documentación y recursos disponibles, siempre desde un trato cercano y respetuoso.',
    image: images.guidance,
    icon: ShieldCheck
  }
];

const collaboration = [
  {
    title: 'Donar alimentos',
    text: 'Puedes aportar alimentos no perecederos, productos de higiene o material básico. Coordinamos la recepción para asegurar una entrega útil y ordenada.',
    cta: 'Coordinar entrega',
    href: '#contacto',
    icon: PackageCheck
  },
  {
    title: 'Donar dinero',
    text: 'Las aportaciones económicas ayudan a cubrir compras urgentes, transporte, material de apoyo y necesidades concretas detectadas por la entidad.',
    cta: 'Quiero donar',
    href: '#donar',
    icon: CircleDollarSign
  },
  {
    title: 'Ser voluntario',
    text: 'Buscamos personas con ganas de sumar tiempo, escucha y compromiso. Hay tareas de almacén, reparto, campañas y apoyo administrativo.',
    cta: 'Hazte voluntario',
    href: '#voluntariado',
    icon: HandHeart
  }
];

const campaigns = [
  {
    label: 'Reparto',
    title: 'Preparación de lotes familiares',
    text: 'Campañas periódicas para preparar alimentos y productos básicos antes de cada entrega.',
    date: 'Actividad permanente'
  },
  {
    label: 'Recogida',
    title: 'Alimentos de primera necesidad',
    text: 'Recogemos aceite, leche, conservas, arroz, legumbres, productos infantiles e higiene.',
    date: 'Abierta todo el año'
  },
  {
    label: 'Voluntariado',
    title: 'Equipo de apoyo en almacén',
    text: 'Necesitamos apoyo para clasificar productos, revisar caducidades y preparar pedidos.',
    date: 'Turnos semanales'
  }
];

const transparencyItems = [
  ['Memoria anual', 'Resumen de actividad, personas atendidas, recursos movilizados y líneas de trabajo.'],
  ['Estatutos', 'Documento institucional de la Asociación Pan y Esperanza.'],
  ['Certificados', 'Documentación acreditativa y justificantes de colaboración.'],
  ['Colaboradores', 'Entidades, empresas y personas que apoyan la actividad social.'],
  ['Política de privacidad', 'Información sobre protección de datos y uso responsable de la información.']
];

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [impact, setImpact] = useState({ loading: true, data: null });
  const [formNotice, setFormNotice] = useState('');

  useEffect(() => {
    let active = true;
    loadPublicImpact()
      .then((data) => {
        if (active) setImpact({ loading: false, data });
      })
      .catch(() => {
        if (active) setImpact({ loading: false, data: null });
      });
    return () => { active = false; };
  }, []);

  const impactStats = useMemo(() => buildImpactStats(impact.data), [impact.data]);

  function submitContact(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`[Web Pan y Esperanza] ${form.get('type') || 'Contacto'}`);
    const body = encodeURIComponent([
      `Nombre: ${form.get('name') || ''}`,
      `Telefono: ${form.get('phone') || ''}`,
      `Email: ${form.get('email') || ''}`,
      `Mensaje: ${form.get('message') || ''}`
    ].join('\n'));
    setFormNotice('Gracias. Hemos preparado tu mensaje para enviarlo a la asociación.');
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Pan y Esperanza">
          <img src="/logo-pan-y-esperanza.png" alt="" />
          <span>Pan y Esperanza</span>
        </a>
        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Navegación principal">
          {navItems.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
        </nav>
        <div className="header-actions">
          <a className="platform-link" href={platformUrl} target="_blank" rel="noreferrer">Acceso plataforma</a>
          <button className="menu-button" type="button" aria-label="Abrir menú" onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main>
        <section id="inicio" className="hero" style={{ '--hero-image': `url(${images.hero})` }}>
          <div className="hero-content">
            <p className="eyebrow">Asociación Pan y Esperanza</p>
            <h1>PAN Y ESPERANZA</h1>
            <p className="hero-subtitle">Nadie debería elegir entre comer y mantener la esperanza.</p>
            <p className="hero-copy">
              Acompañamos a personas y familias en situación de vulnerabilidad mediante ayuda alimentaria,
              atención cercana y una red de solidaridad organizada.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#ayuda">❤️ Solicitar ayuda</a>
              <a className="button secondary" href="#voluntariado">🤝 Hazte voluntario</a>
              <a className="button light" href="#donar">💶 Quiero donar</a>
            </div>
          </div>
        </section>

        <section id="quienes-somos" className="section story-section">
          <div className="section-copy">
            <p className="eyebrow">Quiénes somos</p>
            <h2>Una entidad social nacida para acompañar con dignidad.</h2>
            <p>
              Pan y Esperanza trabaja junto a personas, familias, voluntarios y entidades colaboradoras para
              responder a necesidades básicas sin perder de vista algo igual de importante: la escucha, el
              respeto y la continuidad del acompañamiento.
            </p>
            <div className="values-grid">
              <Value title="Misión" text="Ayudar a cubrir necesidades básicas y sostener procesos de acompañamiento social." />
              <Value title="Visión" text="Una comunidad donde ninguna persona quede sola ante la dificultad." />
              <Value title="Valores" text="Dignidad, cercanía, transparencia, compromiso y esperanza activa." />
            </div>
          </div>
          <figure className="story-media">
            <img src={images.story} alt="Personas voluntarias preparando ayuda alimentaria" />
            <figcaption>Trabajo coordinado, atención humana y colaboración de barrio.</figcaption>
          </figure>
        </section>

        <section id="que-hacemos" className="section">
          <div className="section-heading">
            <p className="eyebrow">Qué hacemos</p>
            <h2>Ayuda práctica, acompañamiento y comunidad.</h2>
          </div>
          <div className="work-grid">
            {workAreas.map((area) => <WorkCard key={area.title} area={area} />)}
          </div>
        </section>

        <section id="impacto" className="impact-section">
          <div className="impact-copy">
            <p className="eyebrow">Nuestro impacto</p>
            <h2>Datos conectados con el ERP de la asociación.</h2>
            <p>
              Esta sección está preparada para actualizarse automáticamente con información pública del sistema
              interno: familias atendidas, entregas, voluntariado, donantes y alimentos movilizados.
            </p>
            <p className="impact-status">
              {impact.loading && 'Actualizando datos...'}
              {!impact.loading && impact.data?.source === 'erp' && `Actualizado desde el ERP${impact.data.updatedAt ? ` el ${formatDate(impact.data.updatedAt)}` : ''}.`}
              {!impact.loading && impact.data?.source !== 'erp' && 'Datos pendientes de publicación pública desde el ERP.'}
            </p>
          </div>
          <div className="impact-grid">
            {impactStats.map((stat) => <ImpactStat key={stat.label} stat={stat} loading={impact.loading} />)}
          </div>
        </section>

        <section id="ayuda" className="section split-section">
          <div className="section-copy">
            <p className="eyebrow">Necesito ayuda</p>
            <h2>Si estás atravesando una situación difícil, puedes contactar con la asociación.</h2>
            <p>
              Atendemos solicitudes de personas y unidades familiares que necesitan apoyo alimentario,
              orientación o seguimiento. Cada caso se revisa con discreción y respeto.
            </p>
            <ol className="process-list">
              <li><strong>Primer contacto.</strong> Cuéntanos brevemente tu situación.</li>
              <li><strong>Revisión.</strong> Te indicaremos la documentación necesaria.</li>
              <li><strong>Valoración interna.</strong> La asociación registra el expediente y organiza la ayuda posible.</li>
              <li><strong>Seguimiento.</strong> Mantenemos el contacto para revisar necesidades y próximas entregas.</li>
            </ol>
            <div className="document-box">
              <h3>Documentación habitual</h3>
              <p>DNI/NIE o pasaporte, certificado de empadronamiento, unidad familiar y documentación económica si procede.</p>
            </div>
          </div>
          <ContactForm title="Solicitar ayuda" type="Solicitud de ayuda" submitContact={submitContact} notice={formNotice} />
        </section>

        <section id="colaborar" className="section">
          <div className="section-heading">
            <p className="eyebrow">Quiero colaborar</p>
            <h2>Tres formas sencillas de sostener esta labor.</h2>
          </div>
          <div className="collab-grid">
            {collaboration.map((item) => <CollaborationCard key={item.title} item={item} />)}
          </div>
        </section>

        <section id="donar" className="donation-band">
          <div>
            <p className="eyebrow">Donaciones</p>
            <h2>Cada aportación se transforma en ayuda concreta.</h2>
            <p>
              Puedes donar alimentos, productos de higiene o realizar una aportación económica. Si eres empresa,
              comercio, iglesia, fundación o entidad colaboradora, coordinamos recogidas y justificantes.
            </p>
          </div>
          <a className="button primary" href="#contacto">Hablar con la asociación <ArrowRight size={18} /></a>
        </section>

        <section id="voluntariado" className="section volunteer-section">
          <div className="volunteer-media">
            <img src={images.volunteer} alt="Personas voluntarias colaborando en una actividad social" />
          </div>
          <div className="section-copy">
            <p className="eyebrow">Voluntariado</p>
            <h2>Tu tiempo puede cambiar una semana entera para una familia.</h2>
            <p>
              El voluntariado sostiene el día a día: clasificar alimentos, preparar lotes, apoyar campañas,
              acompañar en entregas y ayudar en tareas administrativas.
            </p>
            <a className="text-link" href="#contacto">Quiero formar parte del equipo <ArrowRight size={17} /></a>
          </div>
        </section>

        <section id="campanas" className="section">
          <div className="section-heading">
            <p className="eyebrow">Campañas</p>
            <h2>Noticias, repartos y actividades.</h2>
          </div>
          <div className="campaign-grid">
            {campaigns.map((item) => (
              <article className="campaign-card" key={item.title}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <small><CalendarDays size={15} /> {item.date}</small>
              </article>
            ))}
          </div>
        </section>

        <section id="galeria" className="gallery-section">
          <div className="section-heading">
            <p className="eyebrow">Galería</p>
            <h2>La solidaridad también se ve.</h2>
          </div>
          <div className="gallery-grid">
            <img src={images.galleryA} alt="Actividad solidaria con familias" loading="lazy" />
            <img src={images.galleryB} alt="Preparación de ayuda y donaciones" loading="lazy" />
            <div className="video-tile">
              <img src={images.galleryC} alt="Equipo de voluntariado" loading="lazy" />
              <span>Vídeos y campañas</span>
            </div>
          </div>
        </section>

        <section id="transparencia" className="section transparency-section">
          <div className="section-copy">
            <p className="eyebrow">Transparencia</p>
            <h2>Información institucional clara y accesible.</h2>
            <p>
              La asociación mantiene documentación institucional, memorias de actividad y materiales de
              seguimiento para administraciones, entidades colaboradoras y personas interesadas.
            </p>
          </div>
          <div className="transparency-list">
            {transparencyItems.map(([title, text]) => (
              <article key={title}>
                <FileText size={20} />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="contacto" className="contact-section">
          <div className="contact-info">
            <p className="eyebrow">Contacto</p>
            <h2>Estamos cerca.</h2>
            <p>Escríbenos para solicitar ayuda, coordinar una donación, ofrecerte como voluntario o resolver cualquier duda.</p>
            <div className="contact-lines">
              <a href={`mailto:${contactEmail}`}><Mail size={18} /> {contactEmail}</a>
              <a href={`tel:${contactPhoneCompact}`}><Phone size={18} /> {contactPhone}</a>
              <a href={`https://wa.me/${contactPhoneCompact}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>
              <a href={mapsUrl()} target="_blank" rel="noreferrer"><MapPin size={18} /> {address}</a>
            </div>
            <p className="schedule">Horario de atención: con cita previa y según campañas activas.</p>
          </div>
          <div className="contact-panel">
            <ContactForm title="Formulario de contacto" type="Contacto web" submitContact={submitContact} notice={formNotice} />
          </div>
          <iframe
            className="map"
            title="Mapa Asociación Pan y Esperanza"
            loading="lazy"
            src="https://www.google.com/maps?q=Calle%20Solidaridad%2010%2C%20Madrid&output=embed"
          />
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <img src="/logo-pan-y-esperanza.png" alt="" />
          <p>Asociación Pan y Esperanza</p>
        </div>
        <p>El presente sitio muestra información pública de la entidad. La gestión interna se realiza desde la plataforma privada.</p>
        <a href={platformUrl} target="_blank" rel="noreferrer">Acceso plataforma</a>
      </footer>
    </div>
  );
}

function Value({ title, text }) {
  return (
    <article className="value-item">
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function WorkCard({ area }) {
  const Icon = area.icon;
  return (
    <article className="work-card">
      <img src={area.image} alt="" loading="lazy" />
      <div>
        <Icon size={23} />
        <h3>{area.title}</h3>
        <p>{area.text}</p>
      </div>
    </article>
  );
}

function ImpactStat({ stat, loading }) {
  return (
    <article className="impact-stat">
      <strong>{loading ? '...' : stat.value}</strong>
      <span>{stat.label}</span>
    </article>
  );
}

function CollaborationCard({ item }) {
  const Icon = item.icon;
  return (
    <article className="collab-card">
      <Icon size={28} />
      <h3>{item.title}</h3>
      <p>{item.text}</p>
      <a href={item.href}>{item.cta} <ArrowRight size={16} /></a>
    </article>
  );
}

function ContactForm({ title, type, submitContact, notice }) {
  return (
    <form className="contact-form" onSubmit={submitContact}>
      <input type="hidden" name="type" value={type} />
      <h3>{title}</h3>
      <label>
        Nombre y apellidos
        <input name="name" type="text" required />
      </label>
      <label>
        Teléfono
        <input name="phone" type="tel" />
      </label>
      <label>
        Email
        <input name="email" type="email" />
      </label>
      <label>
        Mensaje
        <textarea name="message" rows="5" required />
      </label>
      <button className="button primary" type="submit">Enviar mensaje</button>
      {notice && <p className="form-notice">{notice}</p>}
    </form>
  );
}

function buildImpactStats(data) {
  return [
    ['Familias atendidas', data?.families],
    ['Beneficiarios', data?.beneficiaries],
    ['Voluntarios', data?.volunteers],
    ['Donantes', data?.donors],
    ['Entregas realizadas', data?.deliveries],
    ['Kg de alimentos entregados', data?.foodKg],
    ['Empresas colaboradoras', data?.companies]
  ].map(([label, value]) => ({
    label,
    value: value === null || value === undefined ? '—' : formatNumber(value)
  }));
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(value));
}

function mapsUrl() {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
