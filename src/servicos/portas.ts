import type { TipoEvento } from '../db/repo.js';

/** O que os serviços precisam de um membro do Discord (permite testar sem o Discord). */
export interface MembroPorta {
  id: string;
  temCargo(): boolean;
  darCargo(motivo: string): Promise<void>;
  removerCargo(motivo: string): Promise<void>;
  enviarDM(texto: string): Promise<void>;
}

export interface PortaDiscord {
  /** Retorna null se a pessoa não está no servidor. */
  buscarMembro(discordId: string): Promise<MembroPorta | null>;
}

export interface Auditoria {
  registrar(tipo: TipoEvento, discordId: string | null, detalhe: string): Promise<void>;
}

export interface Mailer {
  enviarCodigo(para: string, codigo: string): Promise<void>;
}

export const codigoDeErro = (e: unknown): number | undefined =>
  typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'number' ? e.code : undefined;
