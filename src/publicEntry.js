const legacyErpLoadingText = ["Cargando", "Pan", "y", "Esperanza"].join(" ");

const isHomeRoute = () => {
  const path = window.location.pathname || "/";
  return path === "/" || path === "";
};

const releaseHomeBootstrap = () => {
  if (!isHomeRoute()) {
    return;
  }

  document.documentElement.dataset.publicBootstrap = "ready";
  document.body?.removeAttribute("aria-busy");

  const root = document.getElementById("root");
  if (root?.textContent?.includes(legacyErpLoadingText)) {
    root.replaceChildren();
  }
};

const homeBootstrapTimeout = isHomeRoute()
  ? window.setTimeout(releaseHomeBootstrap, 2500)
  : null;

import("./public-site/main.js")
  .catch(() => {
    releaseHomeBootstrap();
  })
  .finally(() => {
    if (homeBootstrapTimeout) {
      window.clearTimeout(homeBootstrapTimeout);
    }

    releaseHomeBootstrap();
  });
