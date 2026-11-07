-- =============================================================================================
-- MY OFFICE AI — Fase 1: fundação
-- Universos (workspaces), membros, categorias, departamentos, agentes (núcleo), concessões explícitas
-- entre universos, auditoria e as funções de isolamento usadas por todas as políticas RLS.
--
-- Regras de ouro:
--   * RLS ativada em todas as tabelas de dados; privilégios padrão do Supabase revogados e concedidos
--     só o necessário (inclusive por coluna).
--   * Funções security definer com search_path vazio e nomes totalmente qualificados.
--   * Contexto de agente (myoffice.agent_id) só RESTRINGE o que o dono já pode ver.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Schema de funções internas (não exposto pela API REST do Supabase)
-- ---------------------------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;
alter default privileges in schema app revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------------------------
create type public.workspace_kind as enum ('personal', 'business');
create type public.member_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.agent_status as enum (
  'available', 'planning', 'working', 'waiting_agent', 'waiting_approval', 'paused', 'done', 'error'
);
create type public.actor_type as enum ('user', 'agent', 'system');
create type public.grant_resource as enum ('workspace', 'category', 'project', 'document', 'memory');

-- ---------------------------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  emergency_stop_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Usuários da plataforma (1:1 com auth.users).';
comment on column public.profiles.emergency_stop_at is 'Parada de emergência global: o worker não executa nada deste usuário.';

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind public.workspace_kind not null,
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  description text check (char_length(description) <= 500),
  paused_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
comment on table public.workspaces is 'Universos: pessoal (1 por usuário) ou empresarial (1 por empresa). Fronteira de isolamento.';
create unique index workspaces_one_personal_per_user on public.workspaces (created_by) where kind = 'personal';
create index workspaces_created_by_idx on public.workspaces (created_by);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  description text check (char_length(description) <= 300),
  icon text check (icon ~ '^[a-z0-9-]{1,40}$'),
  sort_order integer not null default 0,
  is_seed boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, workspace_id)
);
create unique index categories_active_name_uq on public.categories (workspace_id, lower(name)) where archived_at is null;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  description text check (char_length(description) <= 300),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (icon ~ '^[a-z0-9-]{1,40}$'),
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, workspace_id),
  -- FK composta: a categoria precisa ser do mesmo workspace.
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id) on delete set null (category_id)
);
create index departments_workspace_idx on public.departments (workspace_id);
create unique index departments_active_name_uq on public.departments (workspace_id, lower(name)) where archived_at is null;

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  department_id uuid,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  specialty text check (char_length(specialty) <= 120),
  description text check (char_length(description) <= 1000),
  status public.agent_status not null default 'available',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, workspace_id),
  foreign key (department_id, workspace_id) references public.departments (id, workspace_id) on delete set null (department_id)
);
comment on table public.agents is 'Agentes de IA. Cada agente pertence a exatamente um workspace (universo autorizado).';
create index agents_workspace_idx on public.agents (workspace_id);

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  source_workspace_id uuid not null references public.workspaces (id) on delete cascade,
  grantee_workspace_id uuid references public.workspaces (id) on delete cascade,
  grantee_agent_id uuid references public.agents (id) on delete cascade,
  resource_type public.grant_resource not null default 'workspace',
  resource_id uuid,
  permission text not null default 'read' check (permission = 'read'),
  reason text not null check (char_length(reason) between 3 and 500),
  granted_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  constraint access_grants_one_grantee check (num_nonnulls(grantee_workspace_id, grantee_agent_id) = 1),
  constraint access_grants_resource check ((resource_type = 'workspace') = (resource_id is null)),
  constraint access_grants_not_self check (grantee_workspace_id is distinct from source_workspace_id),
  constraint access_grants_expiry check (expires_at is null or expires_at > created_at)
);
comment on table public.access_grants is 'Compartilhamento explícito e registrado de dados entre universos (somente leitura).';
create index access_grants_source_idx on public.access_grants (source_workspace_id) where revoked_at is null;
create index access_grants_agent_idx on public.access_grants (grantee_agent_id) where revoked_at is null;
create index access_grants_grantee_ws_idx on public.access_grants (grantee_workspace_id) where revoked_at is null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- Sem FK de propósito: o histórico sobrevive à exclusão do workspace ou do usuário.
  workspace_id uuid,
  actor_type public.actor_type not null,
  actor_user_id uuid,
  actor_agent_id uuid,
  action text not null check (char_length(action) between 1 and 100),
  target_type text check (char_length(target_type) <= 60),
  target_id text check (char_length(target_id) <= 100),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_workspace_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

-- Modelos de categorias iniciais de cada tipo de universo.
create table app.category_templates (
  kind public.workspace_kind not null,
  sort_order integer not null,
  name text not null,
  icon text not null,
  description text not null,
  primary key (kind, sort_order)
);
revoke all on table app.category_templates from public;

insert into app.category_templates (kind, sort_order, name, icon, description) values
  ('personal', 1, 'Projetos pessoais', 'folder-heart', 'Projetos que você conduz por conta própria.'),
  ('personal', 2, 'Planejamento de vida', 'compass', 'Metas, rotinas e decisões de longo prazo.'),
  ('personal', 3, 'Finanças pessoais', 'wallet', 'Orçamento, investimentos e planejamento financeiro.'),
  ('personal', 4, 'Estudos e aprendizado', 'graduation-cap', 'Cursos, leituras e trilhas de aprendizado.'),
  ('personal', 5, 'Pesquisas', 'search', 'Investigações e levantamentos com fontes.'),
  ('personal', 6, 'Desenvolvimento de ideias', 'lightbulb', 'Ideias em amadurecimento.'),
  ('personal', 7, 'Organização e produtividade', 'list-checks', 'Agenda, hábitos e sistemas pessoais.'),
  ('personal', 8, 'Projetos experimentais', 'flask-conical', 'Testes e protótipos sem compromisso.'),
  ('business', 1, 'Estratégia empresarial', 'target', 'Direção, posicionamento e planejamento estratégico.'),
  ('business', 2, 'Comercial', 'handshake', 'Vendas, propostas e relacionamento com clientes.'),
  ('business', 3, 'Marketing', 'megaphone', 'Marca, conteúdo, campanhas e aquisição.'),
  ('business', 4, 'Gestão', 'briefcase', 'Administração, finanças da empresa e indicadores.'),
  ('business', 5, 'Operações', 'settings', 'Processos, entregas e qualidade.'),
  ('business', 6, 'Inteligência de negócios', 'chart-line', 'Dados, análises e relatórios.'),
  ('business', 7, 'Pessoas e equipe', 'users', 'Contratação, cultura e desenvolvimento do time.'),
  ('business', 8, 'Projetos e produtos', 'package', 'Novos produtos, serviços e iniciativas.');

-- ---------------------------------------------------------------------------------------------
-- Funções de contexto e isolamento
-- ---------------------------------------------------------------------------------------------

-- Agente em execução (definido pelo worker com set_config('myoffice.agent_id', ..., true)). null = humano.
create function app.current_agent_id() returns uuid
language sql stable set search_path = ''
as $$ select nullif(current_setting('myoffice.agent_id', true), '')::uuid $$;

create function app.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  )
$$;

create function app.has_role(ws uuid, roles public.member_role[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = any (roles)
  )
$$;

-- Workspace de origem de um agente ativo (null se não existe ou está arquivado).
create function app.agent_workspace(agent uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select a.workspace_id from public.agents a where a.id = agent and a.archived_at is null $$;

-- Sem agente: verdadeiro. Com agente: o workspace é o do agente ou há concessão de leitura ativa.
create function app.agent_can_read(ws uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.current_agent_id() is null or exists (
    select 1 from public.agents a
    where a.id = app.current_agent_id()
      and a.archived_at is null
      and (
        a.workspace_id = ws
        or exists (
          select 1 from public.access_grants g
          where g.source_workspace_id = ws
            and g.resource_type = 'workspace'
            and g.permission = 'read'
            and g.revoked_at is null
            and (g.expires_at is null or g.expires_at > now())
            and (g.grantee_agent_id = a.id or g.grantee_workspace_id = a.workspace_id)
        )
      )
  )
$$;

create function app.can_read(ws uuid) returns boolean
language sql stable set search_path = ''
as $$ select app.is_member(ws) and app.agent_can_read(ws) $$;

-- Escrita: papel com escrita e, se for agente, somente no próprio workspace (nunca via concessão).
create function app.can_write(ws uuid) returns boolean
language sql stable set search_path = ''
as $$
  select app.has_role(ws, array['owner', 'admin', 'member']::public.member_role[])
     and (app.current_agent_id() is null or app.agent_workspace(app.current_agent_id()) = ws)
$$;

-- Estrutura, permissões e agentes: só humanos donos/admins.
create function app.can_manage(ws uuid) returns boolean
language sql stable set search_path = ''
as $$
  select app.current_agent_id() is null
     and app.has_role(ws, array['owner', 'admin']::public.member_role[])
$$;

create function app.shares_workspace(other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  )
$$;

grant execute on function
  app.current_agent_id(),
  app.is_member(uuid),
  app.has_role(uuid, public.member_role[]),
  app.agent_workspace(uuid),
  app.agent_can_read(uuid),
  app.can_read(uuid),
  app.can_write(uuid),
  app.can_manage(uuid),
  app.shares_workspace(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Auditoria (somente por gatilhos e funções security definer; ninguém altera ou apaga)
-- ---------------------------------------------------------------------------------------------
create function app.audit(
  p_workspace uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  agent uuid := app.current_agent_id();
begin
  insert into public.audit_logs (workspace_id, actor_type, actor_user_id, actor_agent_id, action, target_type, target_id, details)
  values (
    p_workspace,
    (case when agent is not null then 'agent' when uid is not null then 'user' else 'system' end)::public.actor_type,
    uid,
    agent,
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

create function app.audit_row_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rec jsonb;
  old_rec jsonb;
  ws uuid;
  changes jsonb;
  payload jsonb;
begin
  -- Provisionamento em lote (cadastro/criação de empresa) registra um único evento resumido.
  if current_setting('myoffice.suppress_row_audit', true) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;

  ws := case tg_table_name
          when 'workspaces' then (rec ->> 'id')::uuid
          when 'access_grants' then (rec ->> 'source_workspace_id')::uuid
          else (rec ->> 'workspace_id')::uuid
        end;

  if tg_op = 'UPDATE' then
    old_rec := to_jsonb(old);
    select coalesce(jsonb_object_agg(k, jsonb_build_object('de', old_rec -> k, 'para', rec -> k)), '{}'::jsonb)
      into changes
      from jsonb_object_keys(rec) as k
     where k <> 'updated_at' and (old_rec -> k) is distinct from (rec -> k);
    if changes = '{}'::jsonb then
      return null;
    end if;
    payload := jsonb_build_object('alteracoes', changes);
  elsif tg_op = 'INSERT' then
    payload := jsonb_build_object('registro', rec);
  else
    payload := jsonb_build_object('registro', rec);
  end if;

  perform app.audit(ws, tg_table_name || '.' || lower(tg_op), tg_table_name, coalesce(rec ->> 'id', rec ->> 'user_id'), payload);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Gatilhos utilitários
-- ---------------------------------------------------------------------------------------------
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Inserções feitas por usuários (papel authenticated): colunas protegidas são definidas pelo banco, nunca pelo
-- cliente — autor vem do JWT, datas do relógio do servidor, sementes e estados de trabalho não podem ser forjados.
-- (Gatilho em vez de privilégio de INSERT por coluna: ORMs listam todas as colunas no INSERT.)
create function app.normalize_insert() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.created_by := (select auth.uid());
    new.created_at := now();
    new.updated_at := now();
    new.archived_at := null;
    if tg_table_name = 'categories' then
      new.is_seed := false;
    elsif tg_table_name = 'agents' then
      new.status := 'available';
    end if;
  end if;
  return new;
end;
$$;

-- Estados de trabalho são definidos pelo worker a partir de execuções reais. Pela interface, o humano só
-- pode pausar ou liberar o agente — nunca marcá-lo como "trabalhando".
create function app.guard_agent_status() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and new.status is distinct from old.status
     and new.status not in ('paused', 'available') then
    raise exception 'O estado "%" é definido apenas por execuções reais.', new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
create trigger workspaces_touch before update on public.workspaces for each row execute function app.touch_updated_at();
create trigger categories_touch before update on public.categories for each row execute function app.touch_updated_at();
create trigger departments_touch before update on public.departments for each row execute function app.touch_updated_at();
create trigger agents_touch before update on public.agents for each row execute function app.touch_updated_at();

create trigger categories_normalize before insert on public.categories for each row execute function app.normalize_insert();
create trigger departments_normalize before insert on public.departments for each row execute function app.normalize_insert();
create trigger agents_normalize before insert on public.agents for each row execute function app.normalize_insert();

create trigger agents_guard_status before update on public.agents for each row execute function app.guard_agent_status();

create trigger workspaces_audit after insert or update or delete on public.workspaces for each row execute function app.audit_row_change();
create trigger workspace_members_audit after insert or update or delete on public.workspace_members for each row execute function app.audit_row_change();
create trigger categories_audit after insert or update or delete on public.categories for each row execute function app.audit_row_change();
create trigger departments_audit after insert or update or delete on public.departments for each row execute function app.audit_row_change();
create trigger agents_audit after insert or update or delete on public.agents for each row execute function app.audit_row_change();
create trigger access_grants_audit after insert or update or delete on public.access_grants for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------------------------
-- Provisionamento
-- ---------------------------------------------------------------------------------------------
create function app.provision_workspace(p_owner uuid, p_kind public.workspace_kind, p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  ws uuid;
begin
  perform set_config('myoffice.suppress_row_audit', 'on', true);

  insert into public.workspaces (kind, name, created_by) values (p_kind, p_name, p_owner) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, p_owner, 'owner');
  insert into public.categories (workspace_id, name, description, icon, sort_order, is_seed, created_by)
    select ws, t.name, t.description, t.icon, t.sort_order, true, p_owner
      from app.category_templates t
     where t.kind = p_kind
     order by t.sort_order;

  perform set_config('myoffice.suppress_row_audit', 'off', true);
  perform app.audit(ws, 'workspace.provisioned', 'workspace', ws::text,
    jsonb_build_object('kind', p_kind, 'name', p_name, 'owner', p_owner));
  return ws;
end;
$$;

-- Cadastro no Supabase Auth → perfil + universo pessoal com as 8 categorias iniciais.
create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  dn text;
begin
  dn := nullif(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '\s+', ' ', 'g')), '');
  if dn is null then
    dn := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;
  dn := btrim(left(coalesce(dn, 'Usuário'), 80));

  insert into public.profiles (id, display_name) values (new.id, dn);
  perform app.provision_workspace(new.id, 'personal', 'Pessoal');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Nova empresa (universo empresarial). Chamada pela interface.
create function app.create_business_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean text;
  total integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if app.current_agent_id() is not null then
    raise exception 'agents_cannot_create_workspaces' using errcode = '42501';
  end if;

  clean := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(clean) < 1 or char_length(clean) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('business-workspaces:' || uid::text, 0));
  select count(*) into total
    from public.workspaces w
   where w.created_by = uid and w.kind = 'business' and w.archived_at is null;
  if total >= 20 then
    raise exception 'business_limit_reached' using errcode = '54000';
  end if;

  return app.provision_workspace(uid, 'business', clean);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Concessões explícitas entre universos
-- ---------------------------------------------------------------------------------------------
create function app.grant_workspace_read(
  p_source uuid,
  p_grantee_workspace uuid,
  p_grantee_agent uuid,
  p_reason text,
  p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target uuid;
  grant_id uuid;
begin
  if uid is null or app.current_agent_id() is not null then
    raise exception 'only_humans_can_grant' using errcode = '42501';
  end if;
  if num_nonnulls(p_grantee_workspace, p_grantee_agent) <> 1 then
    raise exception 'exactly_one_grantee' using errcode = '22023';
  end if;

  target := coalesce(p_grantee_workspace, app.agent_workspace(p_grantee_agent));
  if target is null then
    raise exception 'grantee_not_found' using errcode = 'P0002';
  end if;
  -- Quem concede precisa administrar os dois lados.
  if not app.has_role(p_source, array['owner', 'admin']::public.member_role[])
     or not app.has_role(target, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if target = p_source then
    raise exception 'same_workspace' using errcode = '22023';
  end if;

  insert into public.access_grants (source_workspace_id, grantee_workspace_id, grantee_agent_id, resource_type, reason, granted_by, expires_at)
  values (p_source, p_grantee_workspace, p_grantee_agent, 'workspace', btrim(coalesce(p_reason, '')), uid, p_expires_at)
  returning id into grant_id;

  return grant_id;
end;
$$;

-- Qualquer administrador de um dos lados pode revogar (cortar um compartilhamento é sempre seguro).
create function app.revoke_access_grant(p_grant uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  g public.access_grants%rowtype;
begin
  if uid is null or app.current_agent_id() is not null then
    raise exception 'only_humans_can_revoke' using errcode = '42501';
  end if;

  select * into g from public.access_grants where id = p_grant and revoked_at is null for update;
  if not found
     or not (
       app.has_role(g.source_workspace_id, array['owner', 'admin']::public.member_role[])
       or app.has_role(coalesce(g.grantee_workspace_id, app.agent_workspace(g.grantee_agent_id)),
                       array['owner', 'admin']::public.member_role[])
     ) then
    raise exception 'grant_not_found' using errcode = 'P0002';
  end if;

  update public.access_grants set revoked_at = now(), revoked_by = uid where id = p_grant;
end;
$$;

revoke all on function
  app.audit(uuid, text, text, text, jsonb),
  app.audit_row_change(),
  app.provision_workspace(uuid, public.workspace_kind, text),
  app.handle_new_user(),
  app.create_business_workspace(text),
  app.grant_workspace_read(uuid, uuid, uuid, text, timestamptz),
  app.revoke_access_grant(uuid)
from public;

grant execute on function
  app.create_business_workspace(text),
  app.grant_workspace_read(uuid, uuid, uuid, text, timestamptz),
  app.revoke_access_grant(uuid)
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.categories enable row level security;
alter table public.departments enable row level security;
alter table public.agents enable row level security;
alter table public.access_grants enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_workspace(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) and app.current_agent_id() is null)
  with check (id = (select auth.uid()) and app.current_agent_id() is null);

-- workspaces
create policy workspaces_select on public.workspaces for select to authenticated
  using (app.can_read(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (app.can_manage(id))
  with check (app.can_manage(id));

-- workspace_members (sem escrita direta: impede autopromoção)
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (app.can_read(workspace_id));

-- categories
create policy categories_select on public.categories for select to authenticated
  using (app.can_read(workspace_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (app.can_manage(workspace_id));
create policy categories_update on public.categories for update to authenticated
  using (app.can_manage(workspace_id))
  with check (app.can_manage(workspace_id));

-- departments
create policy departments_select on public.departments for select to authenticated
  using (app.can_read(workspace_id));
create policy departments_insert on public.departments for insert to authenticated
  with check (app.can_manage(workspace_id));
create policy departments_update on public.departments for update to authenticated
  using (app.can_manage(workspace_id))
  with check (app.can_manage(workspace_id));

-- agents (agentes nunca escrevem aqui: can_manage exige humano)
create policy agents_select on public.agents for select to authenticated
  using (app.can_read(workspace_id));
create policy agents_insert on public.agents for insert to authenticated
  with check (app.can_manage(workspace_id));
create policy agents_update on public.agents for update to authenticated
  using (app.can_manage(workspace_id))
  with check (app.can_manage(workspace_id));

-- access_grants (leitura para humanos de qualquer um dos lados; escrita só pelas funções)
create policy access_grants_select on public.access_grants for select to authenticated
  using (
    app.current_agent_id() is null
    and (
      app.is_member(source_workspace_id)
      or app.is_member(coalesce(grantee_workspace_id, app.agent_workspace(grantee_agent_id)))
    )
  );

-- audit_logs (somente leitura, humanos donos/admins; eventos sem workspace, pelo próprio autor)
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    app.current_agent_id() is null
    and (
      (workspace_id is not null and app.has_role(workspace_id, array['owner', 'admin']::public.member_role[]))
      or (workspace_id is null and actor_user_id = (select auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Privilégios: revoga os padrões permissivos e concede o mínimo, por coluna quando possível
-- ---------------------------------------------------------------------------------------------
revoke all on table
  public.profiles, public.workspaces, public.workspace_members, public.categories,
  public.departments, public.agents, public.access_grants, public.audit_logs
from public, anon, authenticated;

grant select on table
  public.profiles, public.workspaces, public.workspace_members, public.categories,
  public.departments, public.agents, public.access_grants, public.audit_logs
to authenticated;

grant update (display_name) on public.profiles to authenticated;
grant update (name, description) on public.workspaces to authenticated;
-- INSERT: colunas protegidas são normalizadas por app.normalize_insert(); UPDATE: privilégio por coluna.
grant insert on public.categories to authenticated;
grant update (name, description, icon, sort_order, archived_at) on public.categories to authenticated;
grant insert on public.departments to authenticated;
grant update (category_id, name, description, color, icon, sort_order, archived_at) on public.departments to authenticated;
grant insert on public.agents to authenticated;
grant update (department_id, name, specialty, description, status, archived_at) on public.agents to authenticated;

-- Worker / tarefas de sistema (service_role ignora RLS no Supabase).
grant select, insert, update, delete on table
  public.profiles, public.workspaces, public.workspace_members, public.categories,
  public.departments, public.agents, public.access_grants
to service_role;
grant select, insert on table public.audit_logs to service_role;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;
