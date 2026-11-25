-- Tudo do bot fica no schema associados, isolado de outros projetos no mesmo Supabase.
-- O schema não é exposto pela API REST do Supabase (só public é, por padrão).
create table associados.assinantes (
  email_hash    text primary key,
  email_cifrado text not null,
  nome          text,
  plano         text,
  status        text not null check (status in ('ATIVA', 'INATIVA')),
  importado_em  timestamptz not null
);

create table associados.vinculos (
  discord_id    text primary key,
  email_hash    text not null unique,
  vinculado_em  timestamptz not null default now(),
  inativo_desde timestamptz
);

create table associados.codigos_verificacao (
  discord_id  text primary key,
  email_hash  text not null,
  codigo_hash text not null,
  expira_em   timestamptz not null,
  tentativas  int not null default 0
);

create table associados.pedidos_codigo (
  id         bigserial primary key,
  discord_id text not null,
  criado_em  timestamptz not null
);
create index pedidos_codigo_discord_idx on associados.pedidos_codigo (discord_id, criado_em);

create table associados.eventos (
  id         bigserial primary key,
  quando     timestamptz not null default now(),
  discord_id text,
  tipo       text not null,
  detalhe    text
);
create index eventos_discord_idx on associados.eventos (discord_id, quando desc);

create table associados.importacoes (
  id         bigserial primary key,
  quando     timestamptz not null default now(),
  admin_id   text not null,
  total      int not null,
  ativos     int not null,
  novos      int not null,
  inativados int not null
);

-- Bloqueia a API pública do Supabase (anon/authenticated). O bot conecta como postgres e ignora RLS.
alter table associados.assinantes enable row level security;
alter table associados.vinculos enable row level security;
alter table associados.codigos_verificacao enable row level security;
alter table associados.pedidos_codigo enable row level security;
alter table associados.eventos enable row level security;
alter table associados.importacoes enable row level security;
