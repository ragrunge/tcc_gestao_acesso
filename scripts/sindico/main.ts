// npm run sb:sindico — cria o PRIMEIRO usuário (síndico) no projeto do .env. Ver README, "Primeiro síndico".
import { executar } from './terminal.ts';

process.exitCode = await executar({ env: process.env, entrada: process.stdin, saida: process.stdout });
