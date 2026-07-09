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
  PlayCircle,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { loadPublicImpact } from './lib/impact.js';

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://pan-y-esperanza.vercel.app';
const contactEmail = 'panyesperanza@gmail.com';
const contactPhone = '+34 611 88 91 67';
const contactPhoneCompact = '34611889167';
const instagramUrl = 'https://www.instagram.com/panyesperanzamadrid/';
const tiktokUrl = 'https://www.tiktok.com/@panyesperanzamadrid';
const socialHandle = '@panyesperanzamadrid';
const address = 'Madrid';

const media = (file) => `/media/${file}`;

const images = {
  hero: media('hero-pan-y-esperanza.jpg'),
  story: media('voluntariado-preparacion.jpg'),
  food: media('reparto-alimentos.jpg'),
  social: media('entrega-familia.jpg'),
  volunteer: media('voluntariado-equipo.jpg'),
  donation: media('donacion-nestle.jpg'),
  donationNescafe: media('donacion-nescafe.jpg'),
  donationLacteos: media('donacion-lacteos.jpg'),
  reception: media('recepcion-productos.jpg'),
  logistics: media('logistica-carga.jpg'),
  storage: media('almacen-clasificacion.jpg'),
  preparation: media('preparacion-lotes.jpg'),
  product: media('producto-lacteo.jpg'),
  delivery: media('entrega-familia.jpg'),
  guidance: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1200&q=85',
  galleryA: media('historia-donaciones.jpg'),
  galleryB: media('historia-voluntariado.jpg'),
  galleryC: media('historia-reparto.jpg')
};

const video = {
  src: media('conoce-pan-y-esperanza.mp4'),
  poster: media('video-poster.jpg')
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
    label: 'Donaciones',
    title: 'Recepción de productos Nestlé',
    text: 'Productos recibidos para reforzar las entregas y sostener la ayuda alimentaria a familias.',
    date: 'Colaboración real',
    image: images.donation
  },
  {
    label: 'Recepción',
    title: 'Recepción de productos lácteos',
    text: 'Organización de productos frescos y lácteos antes de su clasificación y posterior reparto.',
    date: 'Logística solidaria',
    image: images.reception
  },
  {
    label: 'Preparación',
    title: 'Preparación de lotes',
    text: 'El voluntariado clasifica, revisa y prepara los productos para que cada entrega llegue ordenada.',
    date: 'Trabajo de equipo',
    image: images.preparation
  },
  {
    label: 'Reparto',
    title: 'Preparación de reparto',
    text: 'Coordinación de carga, transporte y entrega para que las donaciones lleguen a su destino.',
    date: 'Ayuda directa',
    image: images.logistics
  }
];

const inspiringStories = [
  {
    title: 'Una ayuda que llega a tiempo',
    text: 'Historias de acompañamiento cotidiano, escucha y apoyo básico para personas y familias en momentos de dificultad.',
    image: images.galleryA
  },
  {
    title: 'Red de barrio, esperanza compartida',
    text: 'Colaboraciones entre voluntariado, comercios y personas donantes que hacen posible una respuesta cercana y organizada.',
    image: images.galleryB
  },
  {
    title: 'Volver a mirar la semana con calma',
    text: 'Próximamente compartiremos testimonios reales autorizados sobre el impacto de la ayuda recibida.',
    image: images.story
  }
];

const processSteps = [
  {
    title: 'Contactas',
    text: 'Nos escribes o llamas para explicar brevemente tu situación.',
    icon: MessageCircle
  },
  {
    title: 'Te escuchamos',
    text: 'Recogemos la información necesaria con cercanía y discreción.',
    icon: HeartHandshake
  },
  {
    title: 'Valoramos tu situación',
    text: 'Revisamos el caso y la documentación disponible.',
    icon: ShieldCheck
  },
  {
    title: 'Te acompañamos',
    text: 'Organizamos la ayuda posible y mantenemos el seguimiento.',
    icon: HandHeart
  }
];

const donationActions = [
  {
    title: '❤️ Donar alimentos',
    text: 'Aportaciones de alimentos no perecederos, higiene y productos básicos para preparar entregas familiares.',
    href: '#contacto',
    cta: 'Coordinar donación',
    image: images.donationLacteos
  },
  {
    title: '💶 Donar dinero',
    text: 'Ayuda para compras urgentes, transporte, material de apoyo y necesidades concretas detectadas por la asociación.',
    href: '#contacto',
    cta: 'Solicitar información',
    image: images.donationNescafe
  }
];

const volunteerWays = [
  'Clasificación de alimentos',
  'Preparación de lotes',
  'Reparto',
  'Recogida',
  'Apoyo administrativo'
];

const transparencyItems = [
  ['Memoria anual', 'Resumen de actividad, personas atendidas, recursos movilizados y líneas de trabajo.'],
  ['Estatutos', 'Documento institucional de la Asociación Pan y Esperanza.'],
  ['Colaboradores', 'Entidades, empresas y personas que apoyan la actividad social.'],
  ['Preguntas frecuentes', 'Respuestas claras sobre solicitud de ayuda, donaciones, voluntariado y contacto con la entidad.'],
  ['Cuentas anuales', 'Información económica institucional preparada para publicación y consulta.'],
  ['Política de privacidad', 'Información sobre protección de datos y uso responsable de la información.']
];

const footerSocialLinks = [
  ['Instagram', socialHandle, instagramUrl],
  ['TikTok', socialHandle, tiktokUrl],
  ['WhatsApp', contactPhone, `https://wa.me/${contactPhoneCompact}`]
];

const footerLegalLinks = [
  ['Política de privacidad', '#transparencia'],
  ['Aviso legal', '#transparencia'],
  ['Cookies', '#transparencia']
];

const galleryGroups = [
  {
    title: 'Donaciones',
    text: 'Productos recibidos gracias a colaboraciones y aportaciones solidarias.',
    photos: [
      [images.donationNescafe, 'Productos Nescafé recibidos por la asociación'],
      [images.donation, 'Productos Nestlé preparados para su clasificación'],
      [images.donationLacteos, 'Productos lácteos recibidos']
    ]
  },
  {
    title: 'Voluntariado',
    text: 'Personas que sostienen la actividad diaria con tiempo, cercanía y compromiso.',
    photos: [
      [images.volunteer, 'Equipo voluntario preparando productos'],
      [images.story, 'Voluntaria organizando cajas para la actividad'],
      [images.preparation, 'Preparación de lotes por parte del voluntariado']
    ]
  },
  {
    title: 'Preparación',
    text: 'Clasificación y organización antes de cada entrega.',
    photos: [
      [images.storage, 'Productos organizados en el punto de preparación'],
      [images.preparation, 'Preparación de lotes de productos'],
      [images.product, 'Producto lácteo recibido para las entregas']
    ]
  },
  {
    title: 'Logística',
    text: 'Recepción, carga y transporte de los productos donados.',
    photos: [
      [images.reception, 'Productos preparados en vehículo para transporte'],
      [images.logistics, 'Carga de productos durante una recepción'],
      [images.food, 'Entrega de productos desde vehículo']
    ]
  },
  {
    title: 'Repartos',
    text: 'Ayuda directa y acompañamiento a personas y familias.',
    photos: [
      [images.delivery, 'Familia recibiendo productos de apoyo'],
      [images.galleryC, 'Personas recibiendo productos preparados'],
      [images.food, 'Reparto de alimentos coordinado por la asociación']
    ]
  }
];

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [impact, setImpact] = useState({ loading: true, data: null });
  const [formNotice, setFormNotice] = useState('');
  const [videoVisible, setVideoVisible] = useState(false);

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
      `Teléfono: ${form.get('phone') || ''}`,
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
          <a className="platform-link" href={platformUrl} target="_blank" rel="noreferrer">Acceso equipo</a>
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

        <section id="video" className="section video-section">
          <div className="section-heading">
            <p className="eyebrow">Conoce Pan y Esperanza</p>
            <h2>Una asociación viva, hecha de manos que ayudan.</h2>
            <p>
              Un vistazo real al trabajo diario: recepción de productos, preparación de lotes, logística y
              acompañamiento a las personas atendidas.
            </p>
          </div>
          <figure className="video-card">
            {videoVisible ? (
              <video controls preload="metadata" poster={video.poster} aria-label="Vídeo de presentación de Asociación Pan y Esperanza">
                <source src={video.src} type="video/mp4" />
              </video>
            ) : (
              <button className="video-preview" type="button" onClick={() => setVideoVisible(true)} aria-label="Mostrar vídeo Conoce Pan y Esperanza">
                <img src={video.poster} alt="Miniatura del vídeo Conoce Pan y Esperanza" />
                <span className="video-play" aria-hidden="true"><PlayCircle size={64} /></span>
              </button>
            )}
            <figcaption>El vídeo no se reproduce automáticamente. Pulsa para verlo cuando quieras.</figcaption>
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

        <section id="historias" className="section stories-section">
          <div className="section-heading">
            <p className="eyebrow">Historias que inspiran</p>
            <h2>La ayuda cobra sentido en la vida de las personas.</h2>
          </div>
          <div className="stories-grid">
            {inspiringStories.map((story) => <StoryCard key={story.title} story={story} />)}
          </div>
        </section>

        <section id="como-funciona" className="section process-section">
          <div className="section-heading">
            <p className="eyebrow">¿Cómo funciona?</p>
            <h2>Un proceso sencillo, humano y respetuoso.</h2>
          </div>
          <div className="process-grid">
            {processSteps.map((step, index) => <ProcessStep key={step.title} step={step} showArrow={index < processSteps.length - 1} />)}
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
              {!impact.loading && impact.data?.source !== 'erp' && 'Datos públicos sincronizándose.'}
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
          <div className="donation-actions">
            {donationActions.map((action) => (
              <article className="donation-action" key={action.title}>
                <img src={action.image} alt="" loading="lazy" />
                <h3>{action.title}</h3>
                <p>{action.text}</p>
                <a className="button primary" href={action.href}>{action.cta} <ArrowRight size={18} /></a>
              </article>
            ))}
          </div>
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
            <div className="volunteer-help">
              <h3>¿Cómo puedes ayudar?</h3>
              <ul>
                {volunteerWays.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
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
                <img src={item.image} alt="" loading="lazy" />
                <div>
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <small><CalendarDays size={15} /> {item.date}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="galeria" className="gallery-section">
          <div className="section-heading">
            <p className="eyebrow">Galería</p>
            <h2>La solidaridad también se ve.</h2>
          </div>
          <div className="gallery-groups">
            {galleryGroups.map((group) => (
              <article className="gallery-group" key={group.title}>
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.text}</p>
                </div>
                <div className="gallery-photo-grid">
                  {group.photos.map(([src, alt]) => <img src={src} alt={alt} loading="lazy" key={src + alt} />)}
                </div>
              </article>
            ))}
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
              <a href={`https://wa.me/${contactPhoneCompact}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp {contactPhone}</a>
              <a href={instagramUrl} target="_blank" rel="noreferrer"><Users size={18} /> Instagram {socialHandle}</a>
              <a href={tiktokUrl} target="_blank" rel="noreferrer"><Users size={18} /> TikTok {socialHandle}</a>
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
            src={mapsEmbedUrl()}
          />
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <img src="/logo-pan-y-esperanza.png" alt="" />
            <div>
              <p>Asociación Pan y Esperanza</p>
              <span>Ayuda alimentaria, acompañamiento social y esperanza compartida.</span>
            </div>
          </div>
          <div className="footer-column">
            <h3>Redes</h3>
            {footerSocialLinks.map(([label, display, href]) => (
              <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>{label}: {display}</a>
            ))}
          </div>
          <div className="footer-column">
            <h3>Contacto</h3>
            <a href={`mailto:${contactEmail}`}>Correo</a>
            <a href={`tel:${contactPhoneCompact}`}>Teléfono</a>
            <a href={`https://wa.me/${contactPhoneCompact}`} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
          <div className="footer-column">
            <h3>Legal</h3>
            {footerLegalLinks.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
            <a href={platformUrl} target="_blank" rel="noreferrer">Acceso equipo</a>
          </div>
        </div>
        <p className="footer-note">El presente sitio muestra información pública de la entidad. La gestión interna se realiza desde la plataforma privada.</p>
      </footer>
      <a
        className="floating-whatsapp"
        href={`https://wa.me/${contactPhoneCompact}?text=${encodeURIComponent('Hola, me gustaría contactar con la Asociación Pan y Esperanza.')}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir WhatsApp"
      >
        <MessageCircle size={25} />
        <span>WhatsApp</span>
      </a>
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
      <strong className={!loading && String(stat.value).length > 8 ? 'is-pending' : undefined}>{loading ? '...' : stat.value}</strong>
      <span>{stat.label}</span>
    </article>
  );
}

function StoryCard({ story }) {
  return (
    <article className="story-card">
      <img src={story.image} alt="" loading="lazy" />
      <div>
        <h3>{story.title}</h3>
        <p>{story.text}</p>
        <a href="#historias">Leer historia <ArrowRight size={16} /></a>
      </div>
    </article>
  );
}

function ProcessStep({ step, showArrow }) {
  const Icon = step.icon;
  return (
    <article className="process-card">
      <div className="process-icon"><Icon size={26} /></div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      {showArrow && <span className="process-arrow" aria-hidden="true">→</span>}
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
    value: value === null || value === undefined ? 'Próximamente' : formatNumber(value)
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

function mapsEmbedUrl() {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}
