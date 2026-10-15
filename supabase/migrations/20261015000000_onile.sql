-- Onílé : synchronisation (sauvegardes chiffrées par utilisateur) et versions publiées de l'application.
-- À exécuter une fois dans Supabase : SQL Editor → coller ce fichier → Run.
--
-- Principe : l'application chiffre toute sa base sur le téléphone (PBKDF2 + AES-256-GCM) AVANT l'envoi.
-- Supabase ne reçoit qu'un bloc illisible ; chaque utilisateur (compte e-mail) ne voit que ses sauvegardes.

-- ---------- Sauvegardes ----------
create table if not exists public.sauvegardes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  appareil text,
  version_app text,
  schema integer,
  taille integer not null check (taille > 0),
  -- Fichier de sauvegarde chiffré (JSON « onile-sauvegarde-chiffree »).
  donnees text not null check (length(donnees) <= 20000000)
);

create index if not exists sauvegardes_user_cree on public.sauvegardes (user_id, cree_le desc);

alter table public.sauvegardes enable row level security;

drop policy if exists "lire ses sauvegardes" on public.sauvegardes;
create policy "lire ses sauvegardes" on public.sauvegardes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "ajouter ses sauvegardes" on public.sauvegardes;
create policy "ajouter ses sauvegardes" on public.sauvegardes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "supprimer ses sauvegardes" on public.sauvegardes;
create policy "supprimer ses sauvegardes" on public.sauvegardes
  for delete to authenticated using (user_id = auth.uid());

-- On garde les 20 dernières sauvegardes de chaque utilisateur.
create or replace function public.limiter_sauvegardes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.sauvegardes
  where user_id = new.user_id
    and id not in (
      select id from public.sauvegardes where user_id = new.user_id order by cree_le desc limit 20
    );
  return null;
end;
$$;

drop trigger if exists limiter_sauvegardes on public.sauvegardes;
create trigger limiter_sauvegardes after insert on public.sauvegardes
  for each row execute function public.limiter_sauvegardes();

-- Vue d'administration : qui a synchronisé, quand (sans le contenu chiffré).
create or replace view public.synchronisations_par_utilisateur
with (security_invoker = true) as
  select u.email, count(s.id) as sauvegardes, max(s.cree_le) as derniere, sum(s.taille) as octets
  from auth.users u left join public.sauvegardes s on s.user_id = u.id
  group by u.email;
revoke all on public.synchronisations_par_utilisateur from anon, authenticated;

-- ---------- Versions publiées (lien de téléchargement, alerte de mise à jour) ----------
create table if not exists public.versions_app (
  version text primary key,
  version_code integer not null unique,
  url_apk text not null check (url_apk like 'https://%'),
  notes text,
  publiee_le timestamptz not null default now()
);

alter table public.versions_app enable row level security;

drop policy if exists "versions publiques" on public.versions_app;
create policy "versions publiques" on public.versions_app for select to anon, authenticated using (true);
-- Écriture réservée à la clé « service_role » (script scripts/publier-version.mjs, API Render).
