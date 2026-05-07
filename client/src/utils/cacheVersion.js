const CACHE_VERSION_KEY = "cashball_cache_version";
const PRESERVED_LOCAL_KEYS = [
  "cashballSession",
  "cashballAdminSession",
  CACHE_VERSION_KEY,
];

function preserveLocalStorageKeys(keys) {
  const preserved = new Map();
  keys.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) preserved.set(key, value);
  });
  return preserved;
}

function restoreLocalStorageKeys(preserved) {
  preserved.forEach((value, key) => {
    localStorage.setItem(key, value);
  });
}

/**
 * Verifica se o cache do browser está sincronizado com o servidor.
 * Se o servidor reiniciou (nova version), limpa todo o cache e força reload.
 * Retorna true se foi necessário fazer reload.
 */
export async function checkCacheVersion() {
  if (typeof window === "undefined") return false;

  try {
    const res = await fetch("/api/cache-version");
    const data = await res.json();
    const serverVersion = String(data.version);
    const clientVersion = String(localStorage.getItem(CACHE_VERSION_KEY));

    if (clientVersion !== serverVersion) {
      // Cache desatualizado ou inexistente → hard reset sem perder sessão
      const preservedLocal = preserveLocalStorageKeys(PRESERVED_LOCAL_KEYS);
      localStorage.clear();
      restoreLocalStorageKeys(preservedLocal);
      sessionStorage.clear();
      localStorage.setItem(CACHE_VERSION_KEY, serverVersion);
      return true;
    }
    return false;
  } catch {
    // Erro de rede → ignora, app continua normal
    return false;
  }
}
