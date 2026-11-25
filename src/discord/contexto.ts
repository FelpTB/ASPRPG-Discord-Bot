import type { Client } from 'discord.js';
import type { Config } from '../config.js';
import type { Repo } from '../db/repo.js';
import type { Importador } from '../servicos/importador.js';
import type { Auditoria } from '../servicos/portas.js';
import type { Sincronizador } from '../servicos/sincronizador.js';
import type { Verificador } from '../servicos/verificador.js';
import type { GestaoVinculos } from '../servicos/vinculos.js';

export type Contexto = {
  client: Client;
  config: Config;
  repo: Repo;
  auditoria: Auditoria;
  importador: Importador;
  sincronizador: Sincronizador;
  verificador: Verificador;
  vinculos: GestaoVinculos;
};
