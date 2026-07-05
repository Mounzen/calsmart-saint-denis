-- ============================================================
-- LOGÏA (ex-CAL Smart) — Schéma Supabase
-- Remplace la persistance SQLite/JSON par 2 tables génériques.
-- Aucune autre route du backend n'a besoin d'être réécrite :
-- server/db.js expose la même API (readData/readObj/writeData)
-- en s'appuyant sur ces tables.
-- ============================================================

-- Table principale : équivalent de la table "kv" SQLite.
-- Chaque "fichier logique" (demandeurs.json, logements.json, ...)
-- est une ligne. La donnée elle-même est un JSONB (array ou objet).
create table if not exists logivia_kv (
  file        text primary key,
  data        jsonb not null,
  updated_at  bigint not null,
  size_bytes  integer not null default 0
);
create index if not exists idx_logivia_kv_updated on logivia_kv (updated_at desc);

-- Table éphémère : sessions utilisateur, sessions portail candidat,
-- state/nonce FranceConnect, id_token pour le RP-logout.
-- Remplace les Map() en mémoire (incompatibles avec le serverless :
-- chaque invocation peut atterrir sur une instance différente).
create table if not exists logivia_ephemeral (
  namespace   text not null,       -- 'session' | 'portail_session' | 'fc_state' | 'fc_idtoken'
  key         text not null,
  value       jsonb not null,
  expires_at  bigint not null,
  primary key (namespace, key)
);
create index if not exists idx_logivia_ephemeral_expires on logivia_ephemeral (expires_at);

-- Nettoyage périodique des entrées expirées (à appeler via une Edge
-- Function planifiée ou simplement au fil de l'eau depuis le code).
create or replace function logivia_cleanup_ephemeral() returns void as $$
  delete from logivia_ephemeral where expires_at < extract(epoch from now()) * 1000;
$$ language sql;

-- RLS : ces tables ne sont accédées QUE côté serveur avec la clé
-- service_role (jamais exposées au navigateur), donc on bloque tout
-- accès via la clé anon/public par sécurité.
alter table logivia_kv enable row level security;
alter table logivia_ephemeral enable row level security;
-- Aucune policy créée volontairement : seule la service_role (qui
-- bypass RLS) peut lire/écrire. Le frontend ne doit JAMAIS recevoir
-- la clé service_role, uniquement l'URL de l'API Vercel.
