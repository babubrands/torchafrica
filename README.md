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

Create the posts and comments tables:

```sql
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author text not null default 'Torch Africa',
  title text not null,
  body text not null,
  category text default 'Update',
  image_url text,
  document_url text,
  likes integer not null default 0,
  reposts integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;
alter table public.comments enable row level security;

create policy "Anyone can read posts"
on public.posts for select
using (true);

create policy "Anyone can create posts"
on public.posts for insert
with check (true);

create policy "Anyone can like posts"
on public.posts for update
using (true)
with check (true);

create policy "Anyone can read comments"
on public.comments for select
using (true);

create policy "Anyone can create comments"
on public.comments for insert
with check (true);
```

Create a public storage bucket named `post-uploads`, then add these storage policies:

```sql
create policy "Anyone can view uploaded files"
on storage.objects for select
using (bucket_id = 'post-uploads');

create policy "Anyone can upload files"
on storage.objects for insert
with check (bucket_id = 'post-uploads');
```

The current setup allows public posting, likes, reposts, and comments. For a production social platform, add authentication and restrict upload/update policies to signed-in users.
