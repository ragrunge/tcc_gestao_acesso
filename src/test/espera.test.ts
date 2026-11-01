import { describe, expect, it } from 'vitest';
import { segundosRetryAfter, tempoLegivel } from '../lib/espera';
import { ApiError } from '../api/types';
import { deveRepetir } from '../app/queryClient';

describe('espera', () => {
  it('Retry-After aceita segundos e data HTTP', () => {
    expect(segundosRetryAfter('42')).toBe(42);
    expect(segundosRetryAfter(new Date(1_000_000 + 90_000).toUTCString(), 1_000_000)).toBe(90);
    expect(segundosRetryAfter('lixo')).toBeUndefined();
    expect(segundosRetryAfter(undefined)).toBeUndefined();
  });

  it('tempo legível em segundos e minutos', () => {
    expect(tempoLegivel(1)).toBe('1 segundo');
    expect(tempoLegivel(30)).toBe('30 segundos');
    expect(tempoLegivel(61)).toBe('2 minutos');
  });
});

describe('React Query: retry', () => {
  it('não repete 401, 403, 429 nem 501; repete uma vez falha de rede e 5xx', () => {
    for (const s of [400, 401, 403, 404, 422, 429, 501]) expect(deveRepetir(0, new ApiError(s, 'X', 'x'))).toBe(false);
    expect(deveRepetir(0, new ApiError(0, 'FALHA_DE_REDE', 'x'))).toBe(true);
    expect(deveRepetir(0, new ApiError(503, 'X', 'x'))).toBe(true);
    expect(deveRepetir(1, new ApiError(503, 'X', 'x'))).toBe(false);
  });
});
