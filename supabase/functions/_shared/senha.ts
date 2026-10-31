// Política de senha (porte de apps/api/src/auth/senha.service.ts, git show eae0555): tamanho + lista de comuns +
// contexto, sem regra de composição (NIST 800-63B). Mudança: teto de 72 BYTES, não 256 caracteres, porque o Auth do
// Supabase guarda bcrypt, que só usa os primeiros 72 bytes (uma senha maior seria aceita truncada).

const SENHAS_COMUNS = new Set([
  '123456789012', '1234567890123', '12345678901234', '123456789123', '1234567890qw', 'qwertyuiop12', 'qwertyuiop123',
  'qwertyuiopas', 'qwerty123456', '1q2w3e4r5t6y', '1q2w3e4r5t6y7u', 'q1w2e3r4t5y6', 'asdfghjkl123', 'zxcvbnm12345',
  'password1234', 'password12345', 'password123456', 'passw0rd1234', 'senha1234567', 'senha12345678', 'senhasenha12',
  'mudar1234567', 'mudar@123456', 'trocar123456', 'admin1234567', 'administrador', 'administrador1', 'iloveyou1234',
  'brasil123456', 'portaria1234', 'portaria12345', 'condominio123', 'condominio1234', 'acesso123456', 'sindico12345',
  'porteiro1234', '111111111111', '000000000000', 'aaaaaaaaaaaa', 'abcdefghijkl', 'abc123456789', 'abcd12345678',
  'minhasenha123', 'minhasenha1234', 'qazwsxedcrfv', '!qaz2wsx3edc', 'welcome12345', 'letmein12345', 'football1234',
  'demo-portaria-2026',
]);

export const SENHA_MIN = 12;
export const SENHA_MAX_BYTES = 72;

export function problemasDaSenha(senha: string, contexto: { login?: string } = {}): string[] {
  const p: string[] = [];
  if (senha.length < SENHA_MIN) p.push(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  if (new TextEncoder().encode(senha).length > SENHA_MAX_BYTES) p.push(`A senha pode ter no máximo ${SENHA_MAX_BYTES} bytes (cerca de 70 caracteres sem acento).`);
  const baixa = senha.toLowerCase();
  if (SENHAS_COMUNS.has(baixa)) p.push('Esta senha é muito comum. Escolha outra.');
  else if (/^(.)\1+$/.test(senha)) p.push('A senha não pode repetir um único caractere.');
  const login = contexto.login?.trim().toLowerCase();
  if (login && login.length >= 3 && baixa.includes(login)) p.push('A senha não pode conter o login.');
  return p;
}

// Ditada por telefone ou interfone: minúsculas e dígitos sem os pares que se confundem (0/o, 1/l). 32 símbolos = 5 bits;
// 16 símbolos = 80 bits. Sorteio sem viés: 256 é múltiplo de 32.
const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Blocos de 4 separados por hífen (ex.: k7mq-x3rt-w9az-c2hp). */
export function gerarSenhaTemporaria(tamanho = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  let s = '';
  for (let i = 0; i < tamanho; i++) s += (i && i % 4 === 0 ? '-' : '') + ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}
