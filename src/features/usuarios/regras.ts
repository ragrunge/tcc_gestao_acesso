// Regras da tela de Usuários: espelho das recusas de srv.usuario_* (0018, 0039) para esconder o que o servidor recusaria.
// A decisão real é do banco; aqui só não se oferece o botão. Só quem tem usuario.gerenciar (síndico) chega a estas
// regras. A invariante "sempre há um síndico ativo" sai delas: só o síndico desativa ou rebaixa síndico e ninguém
// desativa a si mesmo nem muda o próprio papel, então quem age continua síndico ativo (o banco confere de novo: 409).
import { ROTULO_PAPEL, type Papel, type UsuarioSistema } from '@domain/types';

export interface Gestor { id: string; gerenciaSindico: boolean }

export type MotivoSemAcao = 'proprio' | 'so_sindico';

export interface AcoesDaLinha {
  /** Nome, login e papel; na própria linha, só nome e login (AUTO_PAPEL). */
  editar: boolean;
  redefinir: boolean;
  desativar: boolean;
  reativar: boolean;
  /** Por que a linha não tem ações de gestão (para o texto da célula). */
  motivo: MotivoSemAcao | null;
}

const NENHUMA = { editar: false, redefinir: false, desativar: false, reativar: false } as const;

export function acoesDaLinha(eu: Gestor, alvo: Pick<UsuarioSistema, 'id' | 'papel' | 'ativo'>): AcoesDaLinha {
  if (alvo.papel === 'sindico' && !eu.gerenciaSindico) return { ...NENHUMA, motivo: 'so_sindico' };
  // AUTO_DESATIVACAO e AUTO_REDEFINICAO: a própria senha muda em "Trocar minha senha". O próprio nome e login mudam.
  if (alvo.id === eu.id) return { ...NENHUMA, editar: true, motivo: 'proprio' };
  return { editar: true, redefinir: alvo.ativo, desativar: alvo.ativo, reativar: !alvo.ativo, motivo: null };
}

/** Só os campos que mudaram (o servidor trata ausente como "não muda"); `{}` quando nada mudou. */
export function mudancas(antes: Pick<UsuarioSistema, 'nome' | 'login' | 'papel'>, f: { nome: string; login: string; papel: Papel }):
  { nome?: string; login?: string; papel?: Papel } {
  const nome = f.nome.trim(), login = f.login.trim().toLowerCase();
  return {
    ...(nome !== antes.nome ? { nome } : {}),
    ...(login !== antes.login ? { login } : {}),
    ...(f.papel !== antes.papel ? { papel: f.papel } : {}),
  };
}

/** Papéis que o gestor pode atribuir ao criar ou editar (usuario.gerenciar_sindico para síndico). */
export const papeisCriaveis = (gerenciaSindico: boolean): Papel[] =>
  (Object.keys(ROTULO_PAPEL) as Papel[]).filter((p) => p !== 'sindico' || gerenciaSindico);

/** Mesmas regras de app.validar_novo_usuario (0018), com as mesmas mensagens. */
export function validarNovoUsuario(f: { nome: string; login: string }): { nome?: string; login?: string } {
  const erros: { nome?: string; login?: string } = {};
  const nome = f.nome.trim();
  if (nome.length < 3 || nome.length > 120) erros.nome = 'Nome: de 3 a 120 caracteres.';
  if (!/^[a-z][a-z0-9._-]{2,39}$/.test(f.login.trim().toLowerCase())) {
    erros.login = 'Login: 3 a 40 caracteres, começando por letra (a-z, 0-9, ".", "-", "_").';
  }
  return erros;
}
