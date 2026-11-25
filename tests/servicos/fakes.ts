import type { TipoEvento } from '../../src/db/repo.js';
import type { Auditoria, MembroPorta, PortaDiscord } from '../../src/servicos/portas.js';

export class MembroFake implements MembroPorta {
  cargo: boolean;
  dms: string[] = [];
  erroCargo?: { code: number };
  dmFechada = false;
  constructor(
    public id: string,
    cargo = false,
  ) {
    this.cargo = cargo;
  }
  temCargo() {
    return this.cargo;
  }
  async darCargo() {
    if (this.erroCargo) throw this.erroCargo;
    this.cargo = true;
  }
  async removerCargo() {
    if (this.erroCargo) throw this.erroCargo;
    this.cargo = false;
  }
  async enviarDM(texto: string) {
    if (this.dmFechada) throw { code: 50007 };
    this.dms.push(texto);
  }
}

export function portaFake(membros: MembroFake[]): PortaDiscord {
  const porId = new Map(membros.map((m) => [m.id, m]));
  return { buscarMembro: async (id) => porId.get(id) ?? null };
}

export function auditoriaFake() {
  const eventos: { tipo: TipoEvento; discordId: string | null; detalhe: string }[] = [];
  const a: Auditoria & { eventos: typeof eventos } = {
    eventos,
    async registrar(tipo, discordId, detalhe) {
      eventos.push({ tipo, discordId, detalhe });
    },
  };
  return a;
}
