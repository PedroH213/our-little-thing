-- Vivian / Feed
-- Supabase migration: posts + comments + RLS

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_avatar_url text,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_avatar_url text,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx
  on public.posts (created_at desc);

create index if not exists comments_post_created_at_idx
  on public.comments (post_id, created_at asc);

alter table public.posts enable row level security;
alter table public.comments enable row level security;

drop policy if exists "Authenticated users can read posts" on public.posts;
create policy "Authenticated users can read posts"
  on public.posts
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts
  for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts
  for delete
  to authenticated
  using ((select auth.uid()) = author_id);

drop policy if exists "Authenticated users can read comments" on public.comments;
create policy "Authenticated users can read comments"
  on public.comments
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create their own comments" on public.comments;
create policy "Users can create their own comments"
  on public.comments
  for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
  on public.comments
  for delete
  to authenticated
  using ((select auth.uid()) = author_id);

grant select, insert, delete on public.posts to authenticated;
grant select, insert, delete on public.comments to authenticated;
