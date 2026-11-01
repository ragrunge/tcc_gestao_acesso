/** Retry-After em segundos (número) ou data HTTP. Indefinido se ausente ou ilegível. */
export function segundosRetryAfter(valor: unknown, agora = Date.now()): number | undefined {
  if (typeof valor !== 'string' || !valor.trim()) return undefined;
  const n = Number(valor);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const t = Date.parse(valor);
  return Number.isNaN(t) ? undefined : Math.max(0, Math.ceil((t - agora) / 1000));
}

export function tempoLegivel(segundos: number): string {
  if (segundos < 60) return segundos <= 1 ? '1 segundo' : `${segundos} segundos`;
  const min = Math.ceil(segundos / 60);
  return min === 1 ? '1 minuto' : `${min} minutos`;
}
