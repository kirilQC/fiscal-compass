export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function call<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: json?.error ?? (r.status === 401 ? "Sign in to save changes." : `Request failed (${r.status})`) };
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const toCents = (dollars: string | number) => Math.round(Number(String(dollars).replace(/[$,\s]/g, "")) * 100);
export const fromCents = (cents: number) => (cents / 100).toFixed(2);
export const todayIso = () => new Date().toISOString().slice(0, 10);
