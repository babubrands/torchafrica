# Torch Africa Website

Static GitHub Pages website built with HTML, Bootstrap CSS, and JavaScript.

## Files

- `index.html` - landing page, program sections, memorandum download, blog feed, and post modal.
- `css/styles.css` - custom Torch Africa styling.
- `js/app.js` - blog/feed logic, likes, reposts, comments, local demo mode, and Supabase connection points.
- `assets/torch-africa-logo.jpeg` - logo image.
- `assets/torch-africa-memorandum-constitutional-amendment-bill-2025.pdf` - downloadable memorandum.

## Publish on Vercel

1. Push this repository to GitHub.
2. Open [Vercel](https://vercel.com), choose `Add New > Project`, and import `babubrands/torchafrica`.
3. Keep the framework preset as `Other`.
4. Leave build command and output directory empty because this is a static HTML site.
5. Click `Deploy`.

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open `Settings > Pages`.
3. Set source to the main branch and root folder.
4. Visit the GitHub Pages URL after deployment.

## Connect Supabase

Create a Supabase project, then add your project URL and anon public key at the top of `js/app.js`:

```js
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";
```

Enable **Authentication > Providers > Email** in Supabase. For the lowest-friction community flow, turn off email confirmation in **Authentication > Providers > Email > Confirm email** so new members are signed in immediately after creating an account. If you leave confirmation on, Supabase will require the user to confirm their email before the first login.

Supabase stores the session in the browser by default, and this site also enables persistent sessions, so members stay signed in on the same device for future visits until they sign out.

Then run this setup in **SQL Editor**. It creates profiles, member posts, comments, owner/admin approval, secure delete rules, and safe like/repost counters.

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.admins (
  email text primary key,
  user_id uuid references auth.users(id) on delete set null,
  full_name text,
  role text not null check (role in ('owner', 'admin')),
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.admins (email, role, status, approved_by, approved_at)
values
  ('ebarasa203@gmail.com', 'owner', 'approved', 'system', now()),
  ('torchafrica@gmail.com', 'admin', 'approved', 'ebarasa203@gmail.com', now())
on conflict (email) do update
set role = excluded.role,
    status = excluded.status,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_requests_one_pending_per_email
on public.admin_requests (email)
where status = 'pending';

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  author text not null default 'Torch Africa',
  author_email text,
  title text not null,
  body text not null,
  category text default 'Update',
  image_url text,
  document_url text,
  likes integer not null default 0,
  reposts integer not null default 0,
  views integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author text not null,
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.posts add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists author_email text;
alter table public.posts add column if not exists views integer not null default 0;
alter table public.comments add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.comments add column if not exists author_email text;

create or replace function public.is_approved_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where email = (auth.jwt() ->> 'email')
      and status = 'approved'
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where email = (auth.jwt() ->> 'email')
      and role = 'owner'
      and status = 'approved'
  );
$$;

create or replace function public.increment_post_counter(post_id uuid, counter_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if counter_name = 'likes' then
    update public.posts set likes = likes + 1 where id = post_id;
  elsif counter_name = 'reposts' then
    update public.posts set reposts = reposts + 1 where id = post_id;
  else
    raise exception 'Invalid counter';
  end if;
end;
$$;

grant execute on function public.increment_post_counter(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.admin_requests enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;

drop policy if exists "Profiles are readable" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can read own admin record" on public.admins;
drop policy if exists "Owner can manage admins" on public.admins;
drop policy if exists "Users can request admin access" on public.admin_requests;
drop policy if exists "Users can read own admin requests" on public.admin_requests;
drop policy if exists "Owner can manage admin requests" on public.admin_requests;
drop policy if exists "Anyone can read posts" on public.posts;
drop policy if exists "Members can create posts" on public.posts;
drop policy if exists "Owners and admins can update posts" on public.posts;
drop policy if exists "Owners and admins can delete posts" on public.posts;
drop policy if exists "Anyone can read comments" on public.comments;
drop policy if exists "Members can create comments" on public.comments;
drop policy if exists "Owners and admins can delete comments" on public.comments;

create policy "Profiles are readable"
on public.profiles for select
using (true);

create policy "Users can create own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read own admin record"
on public.admins for select
using (email = (auth.jwt() ->> 'email') or public.is_approved_admin());

create policy "Owner can manage admins"
on public.admins for all
using (public.is_owner())
with check (public.is_owner());

create policy "Users can request admin access"
on public.admin_requests for insert
with check (auth.uid() = user_id and email = (auth.jwt() ->> 'email'));

create policy "Users can read own admin requests"
on public.admin_requests for select
using (auth.uid() = user_id or public.is_approved_admin());

create policy "Owner can manage admin requests"
on public.admin_requests for update
using (public.is_owner())
with check (public.is_owner());

create policy "Anyone can read posts"
on public.posts for select
using (true);

create policy "Members can create posts"
on public.posts for insert
with check (auth.uid() = user_id);

create policy "Owners and admins can update posts"
on public.posts for update
using (auth.uid() = user_id or public.is_approved_admin())
with check (auth.uid() = user_id or public.is_approved_admin());

create policy "Owners and admins can delete posts"
on public.posts for delete
using (auth.uid() = user_id or public.is_approved_admin());

create policy "Anyone can read comments"
on public.comments for select
using (true);

create policy "Members can create comments"
on public.comments for insert
with check (auth.uid() = user_id);

create policy "Owners and admins can delete comments"
on public.comments for delete
using (auth.uid() = user_id or public.is_approved_admin());
```

Create a public storage bucket named `post-uploads`, then add these storage policies:

```sql
drop policy if exists "Anyone can view uploaded files" on storage.objects;
drop policy if exists "Anyone can upload files" on storage.objects;

create policy "Anyone can view uploaded files"
on storage.objects for select
using (bucket_id = 'post-uploads');

create policy "Anyone can upload files"
on storage.objects for insert
with check (bucket_id = 'post-uploads' and auth.role() = 'authenticated');
```

The current setup uses direct email/password sign-up and login. Members can create and delete their own posts/comments after signing in once, and the browser keeps their session for future visits until they sign out. Approved admins can moderate all content. The owner account `ebarasa203@gmail.com` can approve future admin requests.
