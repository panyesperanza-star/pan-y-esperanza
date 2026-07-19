const publicRoutes = new Set(['/', '/acceder', '/recursos', '/privacidad', '/aviso-legal', '/cookies']);

const normalizePath = (value) => {
  const path = value || '/';
  const normalized = path !== '/' ? path.replace(/\/$/, '') : path;
  return normalized || '/';
};

const isPublicRoute = publicRoutes.has(normalizePath(window.location.pathname));

if (isPublicRoute) {
  import('./public-site/main.js');
} else {
  document.querySelectorAll('[data-public-site-style]').forEach((element) => element.remove());

  let root = document.getElementById('root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'root';
  }

  document.body.replaceChildren(root);
  import('./erpEntry.jsx');
}
