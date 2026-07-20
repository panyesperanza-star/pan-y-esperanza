const placeholderPattern = /^%[A-Z0-9_]+%$/;
const supabaseSessionStorageKey = "panEsperanzaSupabaseSession.v1";

const getImportMetaEnv = () => {
  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
};

const getEnvValue = (key) => {
  const env = getImportMetaEnv();
  const value = env[key];
  return typeof value === "string" && value.trim() && !placeholderPattern.test(value.trim())
    ? value.trim()
    : "";
};

export const getSupabaseConfig = () => ({
  url: getEnvValue("VITE_SUPABASE_URL").replace(/\/$/, ""),
  anonKey: getEnvValue("VITE_SUPABASE_ANON_KEY"),
  schema: "public",
});

const canUseStorage = () => {
  try {
    return Boolean(globalThis.localStorage);
  } catch {
    return false;
  }
};

export const getSupabaseSession = () => {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const session = JSON.parse(globalThis.localStorage.getItem(supabaseSessionStorageKey) || "null");
    if (!session?.access_token) {
      return null;
    }

    if (session.expires_at && Number(session.expires_at) * 1000 <= Date.now()) {
      globalThis.localStorage.removeItem(supabaseSessionStorageKey);
      return null;
    }

    return session;
  } catch {
    return null;
  }
};

export const setSupabaseSession = (session) => {
  if (!canUseStorage() || !session?.access_token) {
    return null;
  }

  const normalizedSession = {
    ...session,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
  };
  globalThis.localStorage.setItem(supabaseSessionStorageKey, JSON.stringify(normalizedSession));
  return normalizedSession;
};

export const clearSupabaseSession = () => {
  if (canUseStorage()) {
    globalThis.localStorage.removeItem(supabaseSessionStorageKey);
  }
};

export const getSupabaseAccessToken = () => getSupabaseSession()?.access_token || "";

export const hasSupabaseConfig = () => {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
};

export const getRepositoryDriver = () => {
  const driver = getEnvValue("VITE_REPOSITORY_DRIVER").toLowerCase();
  return ["auto", "local", "supabase"].includes(driver) ? driver : "auto";
};

export const isProductionEnvironment = () => {
  const env = getImportMetaEnv();
  return Boolean(env.PROD);
};

export const shouldUseSupabaseRepository = () => {
  const driver = getRepositoryDriver();

  if (driver === "local") {
    return false;
  }

  if (driver === "supabase") {
    return hasSupabaseConfig();
  }

  return isProductionEnvironment() && hasSupabaseConfig();
};

const buildQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

export const createSupabaseRestClient = (config = getSupabaseConfig()) => {
  const getBaseHeaders = (accessToken = "") => ({
    apikey: config.anonKey,
    Authorization: `Bearer ${accessToken || getSupabaseAccessToken() || config.anonKey}`,
  });

  const request = async (path, { method = "GET", headers = {}, body = null } = {}) => {
    const response = await fetch(`${config.url}${path}`, {
      method,
      headers: {
        ...getBaseHeaders(),
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Supabase request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json().catch(() => null);
  };

  return {
    config,
    rest(table, { method = "GET", query = "", body = null, prefer = "" } = {}) {
      return request(`/rest/v1/${table}${query}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(prefer ? { Prefer: prefer } : {}),
          ...(config.schema ? { "Accept-Profile": config.schema, "Content-Profile": config.schema } : {}),
        },
        body: body === null ? null : JSON.stringify(body),
      });
    },
    auth: {
      signInWithPassword({ email, password }) {
        return request("/auth/v1/token?grant_type=password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      },
      getUser(accessToken) {
        return request("/auth/v1/user", {
          headers: { ...getBaseHeaders(accessToken) },
        });
      },
      signOut(accessToken) {
        return request("/auth/v1/logout", {
          method: "POST",
          headers: { ...getBaseHeaders(accessToken) },
        });
      },
    },
    storage: {
      getPublicUrl(bucket, path) {
        const safePath = String(path || "").replace(/^\/+/, "");
        return `${config.url}/storage/v1/object/public/${bucket}/${safePath}`;
      },
      upload(bucket, path, file, { accessToken = "", contentType = "application/octet-stream" } = {}) {
        const safePath = String(path || "").replace(/^\/+/, "");
        return request(`/storage/v1/object/${bucket}/${safePath}`, {
          method: "POST",
          headers: {
            ...getBaseHeaders(accessToken),
            "Content-Type": contentType,
            "x-upsert": "true",
          },
          body: file,
        });
      },
      list(bucket, prefix = "") {
        return request(`/storage/v1/object/list/${bucket}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix }),
        });
      },
    },
    buildQuery,
  };
};
