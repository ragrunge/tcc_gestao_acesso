// Regras da tela de Usuários: espelho das recusas de srv.usuario_* (0018) para esconder o que o servidor recusaria.
// A decisão real é do banco; aqui só não se oferece o botão. A invariante "sempre há um síndico ativo" sai destas
// mesmas regras: só o síndico desativa síndico e ninguém desativa a si mesmo, então quem desativa continua ativo.
import { ROTULO_PAPEL, type Papel, type UsuarioSistema } from '@domain/types';

export interface Gestor { id: string; gerenciaSindico: boolean }

export type MotivoSemAcao = 'proprio' | 'so_sindico';

export interface AcoesDaLinha {
  redefinir: boolean;
  desativar: boolean;
  reativar: boolean;
  /** Por que a linha não tem ações de gestão (para o texto da célula). */
  motivo: MotivoSemAcao | null;
}

const NENHUMA = { redefinir: false, desativar: false, reativar: false } as const;

export function acoesDaLinha(eu: Gestor, alvo: Pick<UsuarioSistema, 'id' | 'papel' | 'ativo'>): AcoesDaLinha {
  if (alvo.papel === 'sindico' && !eu.gerenciaSindico) return { ...NENHUMA, motivo: 'so_sindico' };
  // AUTO_DESATIVACAO e AUTO_REDEFINICAO: a própria senha muda em "Trocar minha senha".
  if (alvo.id === eu.id) return { ...NENHUMA, motivo: 'proprio' };
  return { redefinir: alvo.ativo, desativar: alvo.ativo, reativar: !alvo.ativo, motivo: null };
}

/** Papéis que o gestor pode atribuir ao criar (usuario.gerenciar_sindico para síndico). */
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
