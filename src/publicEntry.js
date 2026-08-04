const legacyErpLoadingText = ["Cargando", "Pan", "y", "Esperanza"].join(" ");

const redirectPasswordRecoveryToErp = () => {
  const search = new URLSearchParams(window.location.search || "");
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const hasRecoveryData = search.has("reset_token")
    || search.has("token")
    || search.has("code")
    || hash.has("access_token")
    || hash.has("error")
    || hash.get("type") === "recovery";

  if (!hasRecoveryData) return false;

  window.location.replace(`/restablecer-contrasena${window.location.search || ""}${window.location.hash || ""}`);
  return true;
};

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

const isRedirectingPasswordRecovery = redirectPasswordRecoveryToErp();
const homeBootstrapTimeout = !isRedirectingPasswordRecovery && isHomeRoute()
  ? window.setTimeout(releaseHomeBootstrap, 2500)
  : null;

if (!isRedirectingPasswordRecovery) {
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
}
