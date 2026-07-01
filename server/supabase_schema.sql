-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- Creates all three tables the app needs.

create table if not exists cvs (
  id text primary key,
  title text not null,
  text_content text not null,
  text_length integer default 0,
  pinned boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists employer_lists (
  id text primary key,
  country text not null check (country in ('NZ','AU')),
  title text not null,
  source text not null check (source in ('uploaded','ai_search')),
  employers_json text not null,
  employer_count integer default 0,
  pinned boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists search_results (
  id text primary key,
  country text not null check (country in ('NZ','AU')),
  cv_id text,
  cv_title text,
  employer_list_id text,
  results_json text not null,
  applied_json text not null default '{}',
  job_count integer default 0,
  created_at timestamptz not null default now()
);

-- Speed up country-scoped queries
create index if not exists idx_employer_lists_country on employer_lists(country);
create index if not exists idx_search_results_country on search_results(country);
