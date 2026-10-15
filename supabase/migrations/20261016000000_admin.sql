-- Onílé : espace d'administration (statistiques, lettre d'information).
-- À exécuter une fois dans Supabase : SQL Editor → coller ce fichier → Run (après 20261015000000_onile.sql).
-- Ces tables ne sont lisibles que par l'API (clé service_role) : aucune règle n'ouvre l'accès aux visiteurs.

-- Téléchargements de l'APK (sans adresse IP : comptage seulement).
create table if not exists public.telechargements (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  version text,
  source text not null default 'site' check (source in ('site', 'application', 'lien'))
);
create index if not exists telechargements_cree on public.telechargements (cree_le desc);
alter table public.telechargements enable row level security;

-- Abonnés à la lettre d'information (consentement, désinscription en un clic).
create table if not exists public.abonnes (
  id bigint generated always as identity primary key,
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  jeton uuid not null default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  desinscrit_le timestamptz
);
alter table public.abonnes enable row level security;

-- Lettres envoyées.
create table if not exists public.envois_newsletter (
  id bigint generated always as identity primary key,
  sujet text not null,
  contenu text not null,
  destinataires integer not null default 0,
  envoye_le timestamptz not null default now()
);
alter table public.envois_newsletter enable row level security;

-- Statistiques regroupées pour le tableau de bord (appelées par l'API avec la clé service_role).
create or replace function public.statistiques_admin()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'comptes', (select count(*) from auth.users),
    'comptes_30j', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'synchronisations', (select count(*) from public.sauvegardes),
    'synchronisations_30j', (select count(*) from public.sauvegardes where cree_le > now() - interval '30 days'),
    'comptes_actifs_30j', (select count(distinct user_id) from public.sauvegardes where cree_le > now() - interval '30 days'),
    'telechargements', (select count(*) from public.telechargements),
    'telechargements_30j', (select count(*) from public.telechargements where cree_le > now() - interval '30 days'),
    'abonnes', (select count(*) from public.abonnes where desinscrit_le is null),
    'version', (select version from public.versions_app order by version_code desc limit 1),
    'telechargements_par_jour', coalesce((
      select json_agg(json_build_object('jour', jour, 'n', n) order by jour)
      from (
        select to_char(date_trunc('day', cree_le), 'YYYY-MM-DD') as jour, count(*) as n
        from public.telechargements where cree_le > now() - interval '30 days'
        group by 1
      ) t
    ), '[]'::json),
    'comptes_par_jour', coalesce((
      select json_agg(json_build_object('jour', jour, 'n', n) order by jour)
      from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as jour, count(*) as n
        from auth.users where created_at > now() - interval '30 days'
        group by 1
      ) t
    ), '[]'::json),
    'versions', coalesce((
      select json_agg(json_build_object('version', version, 'n', n) order by n desc)
      from (select coalesce(version, '?') as version, count(*) as n from public.telechargements group by 1) t
    ), '[]'::json)
  );
$$;
revoke all on function public.statistiques_admin() from public, anon, authenticated;
grant execute on function public.statistiques_admin() to service_role;
