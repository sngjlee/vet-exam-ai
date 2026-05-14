export type ParsedIpBansSearchParams = {
  q:    string | null;
  page: number;
};

function pickString(
  raw: { [k: string]: string | string[] | undefined },
  key: string,
): string | null {
  const v = raw[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function parseIpBansSearchParams(
  raw: { [k: string]: string | string[] | undefined },
): ParsedIpBansSearchParams {
  const qRaw = pickString(raw, "q");
  const q = qRaw && qRaw.trim().length > 0 ? qRaw.trim() : null;

  const pageRaw = pickString(raw, "page");
  const pageNum = pageRaw ? parseInt(pageRaw, 10) : 1;
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

  return { q, page };
}

export function buildIpBansSearchString(
  current: ParsedIpBansSearchParams,
  override: Partial<ParsedIpBansSearchParams> = {},
): string {
  const merged: ParsedIpBansSearchParams = { ...current, ...override };
  const params = new URLSearchParams();
  if (merged.q)        params.set("q", merged.q);
  if (merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
