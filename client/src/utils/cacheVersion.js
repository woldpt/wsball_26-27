const CACHE_VERSION_KEY = "cashball_cache_version";

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
      // Cache desatualizado ou inexistente → hard reset
      localStorage.clear();
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
