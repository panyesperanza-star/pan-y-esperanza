export const storageKeys = {
  recursos: "panEsperanzaResources.v1",
  entregas: "panEsperanzaDeliveries.v1",
};

export const resourceFallbackUrl = "/#contacto";

export const resourceCategoryLabels = {
  ayuda: "Ayuda social",
  ayudas: "Ayudas",
  "ayudas-economicas": "Ayudas economicas",
  alimentacion: "Alimentacion",
  "asesoramiento-juridico": "Asesoramiento juridico",
  discapacidad: "Discapacidad",
  donaciones: "Donaciones",
  empresas: "Empresas",
  empleo: "Empleo",
  extranjeria: "Extranjeria",
  familias: "Familias",
  formacion: "Formacion",
  "infancia-familia": "Infancia y familia",
  "personas-mayores": "Personas mayores",
  "recursos-municipales": "Recursos municipales",
  salud: "Salud",
  tramites: "Tramites",
  vivienda: "Vivienda",
  voluntariado: "Voluntariado",
  otros: "Otros",
};

export const resourceProvinceLabels = {
  barcelona: "Barcelona",
  madrid: "Madrid",
  nacional: "Nacional",
  otra: "Otra provincia",
  sevilla: "Sevilla",
  valencia: "Valencia",
};

export const baseBeneficiaries = [
  {
    id: "ben-familia-m",
    name: "Familia M. Garcia",
    displayName: "Familia M. Garcia",
    status: "Activo",
    members: 4,
    priority: "Alta",
  },
  {
    id: "ben-persona-l",
    name: "Persona L.",
    displayName: "Persona L.",
    status: "Activo",
    members: 1,
    priority: "Media",
  },
  {
    id: "ben-familia-r",
    name: "Familia R.",
    displayName: "Familia R.",
    status: "Activo",
    members: 3,
    priority: "Media",
  },
  {
    id: "ben-familia-s",
    name: "Familia S.",
    displayName: "Familia S.",
    status: "Seguimiento",
    members: 5,
    priority: "Alta",
  },
];

export const baseInventory = [
  {
    id: "leche-entera",
    name: "Leche entera",
    category: "Alimentacion basica",
    stock: 84,
    batch: "LE-0726",
    expiry: "2026-08-05",
    location: "Estanteria A1",
  },
  {
    id: "arroz",
    name: "Arroz",
    category: "Alimentacion basica",
    stock: 56,
    batch: "AR-1126",
    expiry: "2026-11-18",
    location: "Estanteria B2",
  },
  {
    id: "legumbres",
    name: "Legumbres cocidas",
    category: "Conservas",
    stock: 48,
    batch: "LG-0926",
    expiry: "2026-09-22",
    location: "Estanteria C1",
  },
  {
    id: "aceite",
    name: "Aceite de oliva",
    category: "Alimentacion basica",
    stock: 18,
    batch: "AC-1026",
    expiry: "2026-10-14",
    location: "Estanteria B1",
  },
  {
    id: "panales",
    name: "Panales talla 4",
    category: "Infantil",
    stock: 12,
    batch: "PN-0826",
    expiry: "2026-08-30",
    location: "Zona infantil",
  },
  {
    id: "tomate",
    name: "Tomate triturado",
    category: "Conservas",
    stock: 36,
    batch: "TT-0726",
    expiry: "2026-07-28",
    location: "Estanteria C2",
  },
];

export const baseDeliveryHistory = [
  {
    id: "JUS-20260712-003",
    beneficiary: "Familia R.",
    date: "2026-07-12",
    responsible: "Voluntariado de reparto",
    products: [
      { id: "leche-entera", name: "Leche entera", quantity: 6 },
      { id: "arroz", name: "Arroz", quantity: 4 },
      { id: "legumbres", name: "Legumbres cocidas", quantity: 6 },
    ],
    total: 16,
    status: "Preparada",
  },
  {
    id: "JUS-20260711-002",
    beneficiary: "Persona L.",
    date: "2026-07-11",
    responsible: "Coordinacion social",
    products: [
      { id: "leche-entera", name: "Leche entera", quantity: 4 },
      { id: "tomate", name: "Tomate triturado", quantity: 4 },
    ],
    total: 8,
    status: "Realizada",
  },
];

export const dashboardQuickActions = [
  { label: "Ver calendario", action: "open-delivery-calendar" },
  { label: "Abrir expediente", action: "open-beneficiary-record" },
  { label: "Ver donacion", action: "open-donation-record" },
  { label: "Ir a inventario", action: "open-inventory" },
  { label: "Planificar entrega", action: "plan-delivery", featured: true },
];

export const dashboardUpcomingDeliveries = [
  {
    time: "10:30",
    beneficiary: "Familia R.",
    zone: "Carabanchel",
    status: "Preparada",
    state: "published",
  },
  {
    time: "12:00",
    beneficiary: "Persona M.",
    zone: "Vallecas",
    status: "En reparto",
    state: "featured",
  },
  {
    time: "17:15",
    beneficiary: "Familia S.",
    zone: "Usera",
    status: "Pendiente",
    state: "draft",
  },
];

export const dashboardDonationMovements = [
  { origin: "Particular", type: "Bizum", value: "50 \u20ac", date: "Hoy" },
  { origin: "Comercio colaborador", type: "Alimentos", value: "84 productos", date: "Ayer" },
  { origin: "Empresa", type: "Transferencia", value: "300 \u20ac", date: "08/07/2026" },
];

export const dashboardPreparedPanels = [
  {
    title: "\uD83D\uDD14 Notificaciones",
    description: "Espacio preparado para avisos operativos, incidencias y recordatorios.",
    itemTitle: "Prioridades del dia",
    itemDescription: "Zona preparada para mostrar avisos internos cuando se conecte el sistema.",
  },
  {
    title: "\uD83E\uDDE0 Resumen IA",
    description: "Espacio visual preparado para el resumen operativo asistido.",
    itemTitle: "Lectura operativa",
    itemDescription: "Bloque reservado para prioridades, riesgos y recomendaciones cuando se active.",
  },
];

export const dashboardFallbackExpiringProducts = [
  {
    product: "Yogures",
    batch: "LA-0726",
    quantity: "42 unidades",
    expiry: "2026-07-18",
    priority: "Alta",
    state: "draft",
  },
  {
    product: "Pan de molde",
    batch: "PM-1126",
    quantity: "28 unidades",
    expiry: "2026-07-21",
    priority: "Media",
    state: "featured",
  },
  {
    product: "Fruta en conserva",
    batch: "FC-0426",
    quantity: "36 unidades",
    expiry: "2026-07-30",
    priority: "Baja",
    state: "published",
  },
];
