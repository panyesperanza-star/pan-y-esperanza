const siteHeader = document.querySelector("[data-site-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const siteNav = document.querySelector("[data-site-nav]");
const brandLogos = [...document.querySelectorAll("[data-brand-logo]")];
const faqTriggers = [...document.querySelectorAll("[data-faq-trigger]")];
const contactForm = document.querySelector("[data-contact-form]");
const contactStatus = document.querySelector("[data-contact-status]");
const volunteerDialog = document.querySelector("[data-volunteer-dialog]");
const volunteerForm = document.querySelector("[data-volunteer-form]");
const volunteerStatus = document.querySelector("[data-volunteer-status]");
const volunteerOpenButtons = [...document.querySelectorAll("[data-volunteer-open]")];
const volunteerCloseButtons = [...document.querySelectorAll("[data-volunteer-close]")];
const donationTriggers = [...document.querySelectorAll("[data-donation-trigger]")];
const donationModalOpenButtons = [...document.querySelectorAll("[data-donation-modal-open]")];
const donationModals = [...document.querySelectorAll("[data-donation-modal]")];
const donationModalCloseButtons = [...document.querySelectorAll("[data-donation-modal-close]")];
const donationTabButtons = [...document.querySelectorAll("[data-donation-tab]")];
const donationTabPanels = [...document.querySelectorAll("[data-donation-panel]")];
const donationOptionButtons = [...document.querySelectorAll("[data-donation-option]")];
const donationOptionPanels = [...document.querySelectorAll("[data-donation-option-panel]")];
const copyIbanButtons = [...document.querySelectorAll("[data-copy-iban]")];
const globalStatus = document.querySelector("[data-global-status]");
const erpLinks = [...document.querySelectorAll("[data-erp-link]")];
const statCounters = [...document.querySelectorAll("[data-counter-target]")];
const resourceList = document.querySelector("[data-resource-list]");
const resourceSearchForm = document.querySelector("[data-resource-search]");
const resourceSearchInput = resourceSearchForm?.querySelector("input[type='search']");
const resourceFilterButtons = [...document.querySelectorAll("[data-filter]")];
const resourceFilterFields = [...document.querySelectorAll("[data-filters-ready] input")];
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const runtimeConfig = window.PAN_ESPERANZA_CONFIG || {};
const viteEnv = import.meta.env || {};
const isSolidHeaderPage = document.body?.dataset.page === "legal";
let lastVolunteerTrigger = null;
let lastDonationModalTrigger = null;
let resourceCards = [];
let activeResourceCategory = "";
let resourceProviderPromise = null;

const getResourceProvider = async () => {
  if (!resourceProviderPromise) {
    resourceProviderPromise = import("./integration/resources/index.js").then(
      ({ resourceProvider }) => resourceProvider,
    );
  }

  return resourceProviderPromise;
};

const hasConfigValue = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !value.includes("%VITE_") &&
  value !== "undefined" &&
  value !== "null";

const getConfigValue = (runtimeKey, envKey) => {
  const runtimeValue = runtimeConfig[runtimeKey];
  const envValue = viteEnv[envKey];

  if (hasConfigValue(runtimeValue)) {
    return runtimeValue.trim();
  }

  if (hasConfigValue(envValue)) {
    return envValue.trim();
  }

  return "";
};

const getEdgeFunctionUrl = (functionName) => {
  const supabaseUrl = getConfigValue("supabaseUrl", "VITE_SUPABASE_URL").replace(/\/$/, "");
  if (!supabaseUrl) {
    throw new Error("Supabase no esta configurado para enviar esta solicitud.");
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

const getEdgeFunctionHeaders = () => {
  const anonKey = getConfigValue("supabaseAnonKey", "VITE_SUPABASE_ANON_KEY");
  return {
    "Content-Type": "application/json",
    ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
  };
};

const updateHeaderOffset = () => {
  if (!siteHeader) {
    return;
  }

  document.documentElement.style.setProperty(
    "--header-offset",
    `${Math.ceil(siteHeader.getBoundingClientRect().height)}px`,
  );
};

const updateHeaderState = () => {
  if (!siteHeader) {
    return;
  }

  siteHeader.toggleAttribute("data-scrolled", isSolidHeaderPage || window.scrollY > 16);
};

const setStatus = (statusElement, message, state) => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.dataset.state = state;
};

const setGlobalStatus = (message) => {
  if (globalStatus) {
    globalStatus.textContent = message;
  }
};

const setupErpLinks = () => {
  if (erpLinks.length === 0) {
    return;
  }

  erpLinks.forEach((link) => {
    link.href = "/acceso";
  });
};

const setupNavigation = () => {
  if (!navToggle || !siteNav) {
    return;
  }

  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    siteNav.toggleAttribute("data-open", !isOpen);
    navToggle.setAttribute(
      "aria-label",
      isOpen ? "Abrir navegacion" : "Cerrar navegacion",
    );
  });

  siteNav.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLAnchorElement)) {
      return;
    }

    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir navegacion");
    siteNav.removeAttribute("data-open");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !siteNav.hasAttribute("data-open")) {
      return;
    }

    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir navegacion");
    siteNav.removeAttribute("data-open");
    navToggle.focus();
  });
};

const setupBrandLogos = () => {
  brandLogos.forEach((logo) => {
    const brand = logo.closest(".brand");
    const showLogo = () => {
      brand?.setAttribute("data-logo-ready", "");
      updateHeaderOffset();
    };

    if (logo.complete && logo.naturalWidth > 0) {
      showLogo();
      return;
    }

    logo.addEventListener("load", showLogo, { once: true });
  });
};

const setupRevealItems = () => {
  const revealItems = [
    ...document.querySelectorAll(
      ".section:not(.section--hero) > .section__inner, .site-footer__inner",
    ),
  ];

  if (revealItems.length === 0) {
    return;
  }

  if (reducedMotionQuery.matches || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  revealItems.forEach((item) => item.classList.add("reveal-item"));

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.16,
    },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
};

const getCounterTarget = (counter) => Number.parseInt(counter.dataset.counterTarget || "0", 10);

const formatCounterValue = (counter, value) =>
  `${counter.dataset.counterPrefix || ""}${Math.round(value)}`;

const setCounterValue = (counter, value) => {
  counter.textContent = formatCounterValue(counter, value);
};

const setupCounters = () => {
  if (statCounters.length === 0) {
    return;
  }

  const setFinalCounterValues = () => {
    statCounters.forEach((counter) => setCounterValue(counter, getCounterTarget(counter)));
  };

  if (reducedMotionQuery.matches || !("IntersectionObserver" in window)) {
    setFinalCounterValues();
    return;
  }

  statCounters.forEach((counter) => setCounterValue(counter, 0));

  const animateCounter = (counter) => {
    const target = getCounterTarget(counter);
    const duration = 1250;
    const startedAt = performance.now();

    const updateCounter = (currentTime) => {
      const progress = Math.min((currentTime - startedAt) / duration, 1);
      const easedProgress = 1 - (1 - progress) ** 3;

      setCounterValue(counter, target * easedProgress);

      if (progress < 1) {
        window.requestAnimationFrame(updateCounter);
        return;
      }

      setCounterValue(counter, target);
    };

    window.requestAnimationFrame(updateCounter);
  };

  const countersRoot = document.querySelector("#transparencia");
  const countersObserver = new IntersectionObserver(
    (entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      statCounters.forEach(animateCounter);
      observer.disconnect();
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.24,
    },
  );

  countersObserver.observe(countersRoot || statCounters[0]);
};

const setupDisabledControls = () => {
  document.querySelectorAll("[aria-disabled='true']").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
    });
  });
};

const setupFaq = () => {
  faqTriggers.forEach((trigger, index) => {
    trigger.addEventListener("click", () => {
      const isOpen = trigger.getAttribute("aria-expanded") === "true";
      const panelId = trigger.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;

      trigger.setAttribute("aria-expanded", String(!isOpen));
      if (panel) {
        panel.hidden = isOpen;
      }
    });

    trigger.addEventListener("keydown", (event) => {
      const lastIndex = faqTriggers.length - 1;
      let nextIndex = null;

      if (event.key === "ArrowDown") {
        nextIndex = index === lastIndex ? 0 : index + 1;
      }

      if (event.key === "ArrowUp") {
        nextIndex = index === 0 ? lastIndex : index - 1;
      }

      if (event.key === "Home") {
        nextIndex = 0;
      }

      if (event.key === "End") {
        nextIndex = lastIndex;
      }

      if (nextIndex !== null) {
        event.preventDefault();
        faqTriggers[nextIndex].focus();
      }
    });
  });
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\d\s.-]{6,30}$/;

const clearFieldValidity = (field) => {
  if (!field) {
    return;
  }

  field.setCustomValidity("");
  field.removeAttribute("aria-invalid");
};

const setFieldError = (field, message, invalidFields) => {
  if (!field) {
    return;
  }

  field.setCustomValidity(message);
  field.setAttribute("aria-invalid", "true");
  invalidFields.push(field);
};

const getFieldValue = (form, name) => {
  const field = form.elements[name];
  return typeof field?.value === "string" ? field.value.trim() : "";
};

const clearFormValidity = (form) => {
  [...form.elements].forEach((field) => {
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      clearFieldValidity(field);
    }
  });
};

const validateContactForm = (form) => {
  clearFormValidity(form);
  const invalidFields = [];
  const name = getFieldValue(form, "name");
  const email = getFieldValue(form, "email");
  const phone = getFieldValue(form, "phone");
  const message = getFieldValue(form, "message");

  if (name.length < 2) {
    setFieldError(form.elements.name, "Introduce tu nombre.", invalidFields);
  }

  if (!emailPattern.test(email)) {
    setFieldError(form.elements.email, "Introduce un correo electronico valido.", invalidFields);
  }

  if (phone.length > 0 && !phonePattern.test(phone)) {
    setFieldError(form.elements.phone, "Introduce un telefono valido.", invalidFields);
  }

  if (message.length < 10) {
    setFieldError(form.elements.message, "Introduce un mensaje mas completo.", invalidFields);
  }

  if (invalidFields.length > 0) {
    invalidFields[0].focus();
    form.reportValidity();
    return false;
  }

  return true;
};

const validateVolunteerForm = (form) => {
  clearFormValidity(form);
  const invalidFields = [];
  const name = getFieldValue(form, "name");
  const phone = getFieldValue(form, "phone");
  const email = getFieldValue(form, "email");
  const availability = getFieldValue(form, "availability");

  if (name.length < 2) {
    setFieldError(form.elements.name, "Introduce tu nombre.", invalidFields);
  }

  if (!phonePattern.test(phone)) {
    setFieldError(form.elements.phone, "Introduce un telefono valido.", invalidFields);
  }

  if (!emailPattern.test(email)) {
    setFieldError(form.elements.email, "Introduce un email valido.", invalidFields);
  }

  if (availability.length < 3) {
    setFieldError(form.elements.availability, "Indica tu disponibilidad.", invalidFields);
  }

  if (invalidFields.length > 0) {
    invalidFields[0].focus();
    form.reportValidity();
    return false;
  }

  return true;
};

const formDataToObject = (form) => Object.fromEntries(new FormData(form).entries());

const postEdgeJson = async (functionName, payload) => {
  const response = await fetch(getEdgeFunctionUrl(functionName), {
    method: "POST",
    headers: getEdgeFunctionHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "No se ha podido completar la solicitud.");
  }

  return data;
};

const setupContactForm = () => {
  if (!(contactForm instanceof HTMLFormElement)) {
    return;
  }

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateContactForm(contactForm)) {
      setStatus(contactStatus, "Revisa los campos marcados.", "error");
      return;
    }

    const payload = formDataToObject(contactForm);
    const submitButton = contactForm.querySelector("button[type='submit']");

    if (payload.company) {
      contactForm.reset();
      setStatus(contactStatus, "Mensaje enviado correctamente.", "success");
      return;
    }

    submitButton?.setAttribute("disabled", "");
    setStatus(contactStatus, "Enviando mensaje...", "success");

    try {
      await postEdgeJson("contact", payload);
      contactForm.reset();
      setStatus(contactStatus, "Mensaje enviado correctamente.", "success");
    } catch (error) {
      setStatus(
        contactStatus,
        error instanceof Error ? error.message : "No se ha podido enviar el mensaje.",
        "error",
      );
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });
};

const closeVolunteerDialog = () => {
  if (!volunteerDialog) {
    return;
  }

  if (typeof volunteerDialog.close === "function") {
    volunteerDialog.close();
  } else {
    volunteerDialog.removeAttribute("open");
  }
};

const setupVolunteerDialog = () => {
  volunteerOpenButtons.forEach((button) => {
    button.addEventListener("click", () => {
      lastVolunteerTrigger = button;

      if (!volunteerDialog) {
        return;
      }

      if (typeof volunteerDialog.showModal === "function") {
        volunteerDialog.showModal();
      } else {
        volunteerDialog.setAttribute("open", "");
      }

      volunteerDialog.querySelector("input, textarea, button")?.focus();
    });
  });

  volunteerCloseButtons.forEach((button) => {
    button.addEventListener("click", closeVolunteerDialog);
  });

  volunteerDialog?.addEventListener("click", (event) => {
    if (event.target === volunteerDialog) {
      closeVolunteerDialog();
    }
  });

  volunteerDialog?.addEventListener("close", () => {
    lastVolunteerTrigger?.focus();
  });
};

const setupVolunteerForm = () => {
  if (!(volunteerForm instanceof HTMLFormElement)) {
    return;
  }

  volunteerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateVolunteerForm(volunteerForm)) {
      setStatus(volunteerStatus, "Revisa los campos marcados.", "error");
      return;
    }

    const payload = formDataToObject(volunteerForm);
    const submitButton = volunteerForm.querySelector("button[type='submit']");

    if (payload.company) {
      volunteerForm.reset();
      setStatus(volunteerStatus, "Solicitud enviada correctamente.", "success");
      return;
    }

    submitButton?.setAttribute("disabled", "");
    setStatus(volunteerStatus, "Enviando solicitud...", "success");

    try {
      await postEdgeJson("volunteer", payload);
      volunteerForm.reset();
      setStatus(volunteerStatus, "Solicitud enviada correctamente.", "success");
    } catch (error) {
      setStatus(
        volunteerStatus,
        error instanceof Error ? error.message : "No se ha podido enviar la solicitud.",
        "error",
      );
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });
};

const createResourceMeta = (resource) => {
  const meta = document.createElement("div");
  meta.className = "resource-card__meta";
  const metaItems = [
    resource.typeLabel || "Recurso",
    resource.categoryLabel || "Recursos",
    resource.provinceLabel || "",
    ...(resource.tags || []),
  ].filter(Boolean);

  metaItems.forEach((item) => {
    const span = document.createElement("span");
    span.textContent = item;
    meta.append(span);
  });

  return meta;
};

const createPublishedResourceCard = (resource, provider) => {
  const card = document.createElement("article");
  card.className = "resource-card";
  card.dataset.resourceCard = "";
  card.dataset.category = resource.category || "ayudas";

  const title = document.createElement("h4");
  title.textContent = resource.title;

  const description = document.createElement("p");
  description.textContent = resource.description;

  const link = document.createElement("a");
  link.className = "button button--olive";
  const linkUrl = provider.normalizeUrl(resource.url) || provider.getFallbackUrl();
  link.href = linkUrl;
  link.textContent = "Consultar";

  if (/^https?:\/\//.test(linkUrl)) {
    link.target = "_blank";
    link.rel = "noopener";
  }

  card.append(createResourceMeta(resource), title, description, link);
  return card;
};

const getResourceSearchTerm = () => resourceSearchInput?.value.trim().toLowerCase() || "";

const getSelectedResourceTags = () =>
  resourceFilterFields
    .filter((field) => field.checked)
    .map((field) => field.value.trim().toLowerCase())
    .filter(Boolean);

const getResourceText = (card) => card.textContent?.toLowerCase() || "";

const applyResourceFilters = () => {
  if (resourceCards.length === 0) {
    resourceCards = [...document.querySelectorAll("[data-resource-card]")];
  }

  const searchTerm = getResourceSearchTerm();
  const selectedTags = getSelectedResourceTags();

  resourceCards.forEach((card) => {
    const text = getResourceText(card);
    const matchesSearch = !searchTerm || text.includes(searchTerm);
    const matchesCategory =
      !activeResourceCategory || card.dataset.category === activeResourceCategory;
    const matchesTags = selectedTags.every((tag) => text.includes(tag));

    card.hidden = !(matchesSearch && matchesCategory && matchesTags);
  });
};

const renderPublishedResources = async () => {
  if (!resourceList) {
    return;
  }

  try {
    const provider = await getResourceProvider();
    const resources = await provider.listPublishedResources();
    resourceList.querySelectorAll("[data-resource-card]").forEach((resource) => resource.remove());

    const fragment = document.createDocumentFragment();
    resources.forEach((resource) => {
      fragment.append(createPublishedResourceCard(resource, provider));
    });

    resourceList.append(fragment);
    resourceCards = [...resourceList.querySelectorAll("[data-resource-card]")];
    applyResourceFilters();
  } catch {
    resourceList.querySelectorAll("[data-resource-card]").forEach((resource) => resource.remove());
    resourceCards = [];
    applyResourceFilters();
  }
};

const setupResourceFilters = () => {
  if (!resourceList) {
    return;
  }

  resourceSearchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    applyResourceFilters();
  });

  resourceSearchInput?.addEventListener("input", applyResourceFilters);
  resourceFilterFields.forEach((field) => {
    field.addEventListener("change", applyResourceFilters);
  });

  resourceFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextCategory = button.dataset.filter || "";
      activeResourceCategory = activeResourceCategory === nextCategory ? "" : nextCategory;

      resourceFilterButtons.forEach((item) => {
        item.setAttribute("aria-pressed", String(item.dataset.filter === activeResourceCategory));
      });

      applyResourceFilters();
    });
  });

  void renderPublishedResources();
};

const setDonationTab = (tabName) => {
  donationTabButtons.forEach((button) => {
    const isSelected = button.dataset.donationTab === tabName;
    button.setAttribute("aria-selected", String(isSelected));
    button.setAttribute("tabindex", isSelected ? "0" : "-1");
  });

  donationTabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.donationPanel !== tabName;
  });
};

const setDonationOption = (optionName) => {
  donationOptionButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.donationOption === optionName));
  });

  donationOptionPanels.forEach((panel) => {
    panel.hidden = panel.dataset.donationOptionPanel !== optionName;
  });
};

const closeDonationModal = (modal) => {
  if (!(modal instanceof HTMLDialogElement)) {
    return;
  }

  if (typeof modal.close === "function") {
    modal.close();
  } else {
    modal.removeAttribute("open");
  }
};

const setupDonationModals = () => {
  donationModalOpenButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const donationOption = button.dataset.donationModalOpen || "bizum";
      const modal = donationModals.find((item) => item.dataset.donationModal === "economica");

      if (!modal) {
        return;
      }

      lastDonationModalTrigger = button;
      setDonationTab("puntual");
      setDonationOption(donationOption);

      if (typeof modal.showModal === "function") {
        modal.showModal();
      } else {
        modal.setAttribute("open", "");
      }

      modal.querySelector("[data-donation-tab], button, a")?.focus();
    });
  });

  donationTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setDonationTab(button.dataset.donationTab || "puntual");
    });

    button.addEventListener("keydown", (event) => {
      const currentIndex = donationTabButtons.indexOf(button);
      let nextIndex = null;

      if (event.key === "ArrowRight") {
        nextIndex = currentIndex === donationTabButtons.length - 1 ? 0 : currentIndex + 1;
      }

      if (event.key === "ArrowLeft") {
        nextIndex = currentIndex === 0 ? donationTabButtons.length - 1 : currentIndex - 1;
      }

      if (event.key === "Home") {
        nextIndex = 0;
      }

      if (event.key === "End") {
        nextIndex = donationTabButtons.length - 1;
      }

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      const nextButton = donationTabButtons[nextIndex];
      setDonationTab(nextButton.dataset.donationTab || "puntual");
      nextButton.focus();
    });
  });

  donationOptionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setDonationOption(button.dataset.donationOption || "bizum");
    });
  });

  donationModalCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      closeDonationModal(button.closest("[data-donation-modal]"));
    });
  });

  donationModals.forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeDonationModal(modal);
      }
    });

    modal.addEventListener("close", () => {
      lastDonationModalTrigger?.focus();
    });
  });
};

const setupCopyIban = () => {
  copyIbanButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const modal = button.closest("[data-donation-modal]");
      const ibanStatus = modal?.querySelector("[data-iban-status]");
      const ibanValue = modal?.querySelector("[data-iban-value]")?.textContent?.trim() || "";

      if (!ibanValue || ibanValue.toLowerCase().includes("disponible")) {
        setStatus(ibanStatus, "IBAN disponible proximamente.", "error");
        return;
      }

      try {
        await navigator.clipboard.writeText(ibanValue);
        setStatus(ibanStatus, "IBAN copiado.", "success");
      } catch {
        setStatus(ibanStatus, "No se ha podido copiar el IBAN.", "error");
      }
    });
  });
};

const setupDonationCheckout = () => {
  donationTriggers.forEach((trigger) => {
    trigger.addEventListener("click", async (event) => {
      const fallbackUrl = trigger instanceof HTMLAnchorElement ? trigger.href : "#colabora";

      event.preventDefault();
      setGlobalStatus("Preparando donacion.");

      try {
        const response = await fetch(getEdgeFunctionUrl("create-checkout-session"), {
          method: "POST",
          headers: getEdgeFunctionHeaders(),
          body: JSON.stringify({
            frequency: trigger.dataset.donationFrequency || "one_time",
          }),
        });

        if (!response.ok) {
          window.location.href = fallbackUrl;
          return;
        }

        const data = await response.json();

        if (typeof data.url === "string" && data.url.startsWith("https://")) {
          window.location.assign(data.url);
          return;
        }

        window.location.href = fallbackUrl;
      } catch {
        window.location.href = fallbackUrl;
      }
    });
  });
};

const loadGoogleAnalytics = (measurementId) => {
  if (!measurementId || window.gtag) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { anonymize_ip: true });
};

const loadMetaPixel = (pixelId) => {
  if (!pixelId || window.fbq) {
    return;
  }

  window._fbq = window._fbq || undefined;
  window.fbq = function fbq() {
    window.fbq.callMethod
      ? window.fbq.callMethod.apply(window.fbq, arguments)
      : window.fbq.queue.push(arguments);
  };
  window.fbq.push = window.fbq;
  window.fbq.loaded = true;
  window.fbq.version = "2.0";
  window.fbq.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.append(script);

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
};

const analyticsConfig = {
  gaMeasurementId: getConfigValue("gaMeasurementId", "VITE_GA_MEASUREMENT_ID"),
  metaPixelId: getConfigValue("metaPixelId", "VITE_META_PIXEL_ID"),
};

const cookieConsentKey = "panEsperanzaCookieConsent";
const cookieConsentAccepted = "accepted";
const cookieConsentRejected = "rejected";

const getCookieConsent = () => {
  try {
    return window.localStorage.getItem(cookieConsentKey);
  } catch {
    return "";
  }
};

const setCookieConsent = (value) => {
  try {
    window.localStorage.setItem(cookieConsentKey, value);
  } catch {
    return;
  }
};

const loadAnalyticsTools = () => {
  loadGoogleAnalytics(analyticsConfig.gaMeasurementId);
  loadMetaPixel(analyticsConfig.metaPixelId);
};

const createCookieConsentBanner = () => {
  if (getCookieConsent() || document.querySelector("[data-cookie-consent]")) {
    return;
  }

  const banner = document.createElement("section");
  banner.className = "cookie-consent";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Consentimiento de cookies");
  banner.setAttribute("data-cookie-consent", "");

  const copy = document.createElement("div");
  copy.className = "cookie-consent__copy";
  copy.innerHTML = `
    <p><strong>Cookies</strong></p>
    <p>Utilizamos cookies tecnicas necesarias y, solo con tu consentimiento, cookies analiticas para mejorar la web.</p>
    <p><a href="/cookies/">Consultar politica de cookies</a></p>
  `;

  const actions = document.createElement("div");
  actions.className = "cookie-consent__actions";

  const rejectButton = document.createElement("button");
  rejectButton.className = "button button--olive";
  rejectButton.type = "button";
  rejectButton.textContent = "Rechazar";

  const acceptButton = document.createElement("button");
  acceptButton.className = "button button--primary";
  acceptButton.type = "button";
  acceptButton.textContent = "Aceptar";

  const closeBanner = (value) => {
    setCookieConsent(value);
    banner.hidden = true;
    banner.remove();

    if (value === cookieConsentAccepted) {
      loadAnalyticsTools();
    }
  };

  rejectButton.addEventListener("click", () => closeBanner(cookieConsentRejected));
  acceptButton.addEventListener("click", () => closeBanner(cookieConsentAccepted));

  actions.append(rejectButton, acceptButton);
  banner.append(copy, actions);
  document.body.append(banner);
};

const setupAnalyticsAndCookies = () => {
  if (getCookieConsent() === cookieConsentAccepted) {
    loadAnalyticsTools();
  } else {
    createCookieConsentBanner();
  }
};

const setupServiceWorker = () => {
  const isLocalDevelopmentHost = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname,
  );

  if ("serviceWorker" in navigator && !isLocalDevelopmentHost) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  if ("serviceWorker" in navigator && isLocalDevelopmentHost) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {});
  }
};

setupNavigation();
setupErpLinks();
setupBrandLogos();
updateHeaderOffset();
updateHeaderState();
window.addEventListener("scroll", updateHeaderState, { passive: true });
window.addEventListener("resize", updateHeaderOffset);
setupRevealItems();
setupCounters();
setupDisabledControls();
setupFaq();
setupContactForm();
setupVolunteerDialog();
setupVolunteerForm();
setupResourceFilters();
setupDonationModals();
setupCopyIban();
setupDonationCheckout();
setupAnalyticsAndCookies();
setupServiceWorker();
