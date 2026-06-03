# Torch Africa Website

Static GitHub Pages website built with HTML, Bootstrap CSS, and JavaScript.

## Files

- `index.html` - public landing page, CMS-driven program sections, memorandum download, dynamic trending sidebar, and read-only blog feed.
- `gallery.html` - gallery upload/editor page with a Bootstrap carousel.
- `css/styles.css` - custom Torch Africa styling.
- `js/app.js` - CMS content loading, admin post controls, dynamic trending, gallery carousel logic, image compression, local demo mode, and Supabase connection points.
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

If existing users cannot log back in, check **Authentication > Users** in Supabase. Users with an unconfirmed email cannot sign in while confirmation is required. Either confirm those users manually or turn off **Confirm email** for the email provider.

Supabase stores the session in the browser by default, and this site also enables persistent sessions, so members stay signed in on the same device for future visits until they sign out.

For password resets, the login dialog includes a **Forgot password?** flow. In Supabase, configure **Authentication > Email Templates > Reset Password** to send the six-digit recovery token and point the button back to the reset dialog. Use this template:

```html
<h2>Reset your password</h2>
<p>We received a request to reset your Torch Africa password.</p>
<p>Your 6-digit reset OTP is:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>Enter this code in the reset password dialog, then choose a new password.</p>
<p>
  <a href="{{ .RedirectTo }}" style="display: inline-block; padding: 12px 18px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
    Open reset dialog
  </a>
</p>
<p>If the button does not open, copy this link into your browser:</p>
<p>{{ .RedirectTo }}</p>
<p>If you did not request this, you can safely ignore this email.</p>
```

The app sends Supabase a reset redirect URL with `?reset-password=1`, so the email button opens the password reset dialog. Supabase creates and stores the OTP; the frontend verifies it with `verifyOtp({ type: "recovery" })` before updating the password.

In **Authentication > URL Configuration**, set:

- **Site URL:** `https://torchafrica.vercel.app`
- **Redirect URLs:** `https://torchafrica.vercel.app/*`

The reset link should open `https://torchafrica.vercel.app/?reset-password=1`. Do not use `http://localhost:3000` in production reset emails.

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

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  author text not null default 'Torch Africa',
  author_email text,
  title text not null,
  caption text,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  icon text,
  title text not null,
  body text not null,
  display_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.posts add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists author_email text;
alter table public.posts add column if not exists views integer not null default 0;
alter table public.posts add column if not exists is_featured boolean not null default false;
alter table public.posts add column if not exists featured_rank integer;
alter table public.posts add column if not exists featured_until timestamptz;
alter table public.comments add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.comments add column if not exists author_email text;
alter table public.gallery_items add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.gallery_items add column if not exists author_email text;
alter table public.programs add column if not exists display_order integer not null default 1;
alter table public.programs add column if not exists is_active boolean not null default true;

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
  if counter_name = 'views' then
    update public.posts set views = views + 1 where id = post_id;
  elsif auth.uid() is null then
    raise exception 'Authentication required';
  elsif counter_name = 'likes' then
    update public.posts set likes = likes + 1 where id = post_id;
  elsif counter_name = 'reposts' then
    update public.posts set reposts = reposts + 1 where id = post_id;
  else
    raise exception 'Invalid counter';
  end if;
end;
$$;

grant execute on function public.increment_post_counter(uuid, text) to authenticated;
grant execute on function public.increment_post_counter(uuid, text) to anon;

create or replace function public.update_admin_post(
  p_post_id uuid,
  p_author text,
  p_category text,
  p_title text,
  p_body text,
  p_image_url text,
  p_document_url text
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_post public.posts;
begin
  if not public.is_approved_admin() then
    raise exception 'Only approved admins can update posts';
  end if;

  update public.posts
  set author = p_author,
      category = p_category,
      title = p_title,
      body = p_body,
      image_url = p_image_url,
      document_url = p_document_url
  where id = p_post_id
  returning * into updated_post;

  if updated_post.id is null then
    raise exception 'Post not found';
  end if;

  return updated_post;
end;
$$;

grant execute on function public.update_admin_post(uuid, text, text, text, text, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.admin_requests enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.gallery_items enable row level security;
alter table public.site_settings enable row level security;
alter table public.programs enable row level security;

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
drop policy if exists "Approved admins can create posts" on public.posts;
drop policy if exists "Owners and admins can update posts" on public.posts;
drop policy if exists "Owners and admins can delete posts" on public.posts;
drop policy if exists "Approved admins can update posts" on public.posts;
drop policy if exists "Approved admins can delete posts" on public.posts;
drop policy if exists "Anyone can read comments" on public.comments;
drop policy if exists "Members can create comments" on public.comments;
drop policy if exists "Owners and admins can delete comments" on public.comments;
drop policy if exists "Users and admins can delete comments" on public.comments;
drop policy if exists "Approved admins can delete comments" on public.comments;
drop policy if exists "Anyone can read gallery items" on public.gallery_items;
drop policy if exists "Members can create gallery items" on public.gallery_items;
drop policy if exists "Users and admins can update gallery items" on public.gallery_items;
drop policy if exists "Users and admins can delete gallery items" on public.gallery_items;
drop policy if exists "Approved admins can create gallery items" on public.gallery_items;
drop policy if exists "Approved admins can update gallery items" on public.gallery_items;
drop policy if exists "Approved admins can delete gallery items" on public.gallery_items;
drop policy if exists "Anyone can read site settings" on public.site_settings;
drop policy if exists "Approved admins can manage site settings" on public.site_settings;
drop policy if exists "Anyone can read programs" on public.programs;
drop policy if exists "Approved admins can manage programs" on public.programs;

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

create policy "Approved admins can create posts"
on public.posts for insert
with check (auth.uid() = user_id and public.is_approved_admin());

create policy "Approved admins can update posts"
on public.posts for update
using (public.is_approved_admin())
with check (public.is_approved_admin());

create policy "Approved admins can delete posts"
on public.posts for delete
using (public.is_approved_admin());

create policy "Anyone can read comments"
on public.comments for select
using (true);

create policy "Approved admins can delete comments"
on public.comments for delete
using (public.is_approved_admin());

create policy "Anyone can read gallery items"
on public.gallery_items for select
using (true);

create policy "Approved admins can create gallery items"
on public.gallery_items for insert
with check (auth.uid() = user_id and public.is_approved_admin());

create policy "Approved admins can update gallery items"
on public.gallery_items for update
using (public.is_approved_admin())
with check (public.is_approved_admin());

create policy "Approved admins can delete gallery items"
on public.gallery_items for delete
using (public.is_approved_admin());

create policy "Anyone can read site settings"
on public.site_settings for select
using (true);

create policy "Approved admins can manage site settings"
on public.site_settings for all
using (public.is_approved_admin())
with check (public.is_approved_admin());

create policy "Anyone can read programs"
on public.programs for select
using (true);

create policy "Approved admins can manage programs"
on public.programs for all
using (public.is_approved_admin())
with check (public.is_approved_admin());

insert into public.site_settings (key, value)
values
  ('hero_copy', 'Defending constitutionalism, civic participation, and justice-centered governance through advocacy, legal analysis, and community action.'),
  ('about_title', 'Advocacy with a justice-first lens.'),
  ('about_body', 'Torch Africa is a civil justice platform focused on human rights, constitutional accountability, and public-interest advocacy. The organization brings together legal insight, civic education, documentation, and public engagement to support communities and institutions working toward a fairer society.'),
  ('memo_title', 'Memorandum on the Constitutional Amendment Bill, 2025'),
  ('memo_body', 'Access Torch Africa''s memorandum as a downloadable PDF. This section can be updated with future legal briefs, public statements, and advocacy documents.'),
  ('memo_url', 'assets/torch-africa-memorandum-constitutional-amendment-bill-2025.pdf'),
  ('contact_title', 'Partner with Torch Africa on advocacy, documentation, and civic education.'),
  ('contact_body', 'Share partnership ideas, civic education requests, documentation leads, or community advocacy opportunities directly with the Torch Africa team.'),
  ('contact_email', 'torchafrica@gmail.com'),
  ('contact_phone', '+254 720 369 518'),
  ('contact_phone_href', '+254720369518'),
  ('contact_location', 'Bungoma'),
  ('whatsapp_phone', '254733296064')
on conflict (key) do nothing;

insert into public.programs (icon, title, body, display_order)
values
  ('HR', 'Human Rights Monitoring', 'Documenting emerging rights issues and amplifying community experiences with care and accuracy.', 1),
  ('CJ', 'Civil Justice Advocacy', 'Supporting fair processes, access to justice, and institutional accountability in public decision-making.', 2),
  ('CA', 'Constitutional Analysis', 'Preparing citizen-friendly briefs and memoranda on constitutional and legislative developments.', 3),
  ('CE', 'Civic Engagement', 'Creating spaces for people to learn, contribute, organize, and participate in public affairs.', 4)
on conflict do nothing;
```

Create a public storage bucket named `post-uploads`, then add these storage policies. The frontend uploads files under `images/<user-id>/...`, `documents/<user-id>/...`, `avatars/<user-id>/...`, and `gallery/<user-id>/...`, so approved admins need insert access to this bucket.

```sql
insert into storage.buckets (id, name, public)
values ('post-uploads', 'post-uploads', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view uploaded files" on storage.objects;
drop policy if exists "Anyone can upload files" on storage.objects;
drop policy if exists "Authenticated members can upload post files" on storage.objects;
drop policy if exists "Approved admins can upload site files" on storage.objects;
drop policy if exists "Owners and admins can delete uploaded files" on storage.objects;

create policy "Anyone can view uploaded files"
on storage.objects for select
using (bucket_id = 'post-uploads');

create policy "Approved admins can upload site files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'post-uploads' and public.is_approved_admin());

create policy "Owners and admins can delete uploaded files"
on storage.objects for delete
to authenticated
using (bucket_id = 'post-uploads' and public.is_approved_admin());
```

The current setup uses direct email/password sign-up and login. Public visitors can read site content and use the partner/contact form. Approved admins manage posts, gallery items, programs, memorandum copy, and contact details from the admin dashboard. The owner account `ebarasa203@gmail.com` can approve future admin requests.

Before image files are uploaded, the browser reduces them to a maximum of 1200 by 1200 pixels and saves them as compressed JPEGs. This keeps post photos, avatars, and gallery carousel uploads faster and smaller.
