insert into public.admins (email, role, status, approved_by, approved_at)
values
  ('ebarasa203@gmail.com', 'owner', 'approved', 'system', now()),
  ('torchafrica@gmail.com', 'admin', 'approved', 'ebarasa203@gmail.com', now())
on conflict (email) do update
set role = excluded.role,
    status = excluded.status,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;

create or replace function public.is_approved_admin()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.admins
    where lower(email) = lower(auth.jwt() ->> 'email')
      and status = 'approved'
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.admins
    where lower(email) = lower(auth.jwt() ->> 'email')
      and role = 'owner'
      and status = 'approved'
  );
$$;

grant execute on function public.is_approved_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;

drop policy if exists "Approved admins can update posts" on public.posts;

create policy "Approved admins can update posts"
on public.posts for update
using (public.is_approved_admin())
with check (public.is_approved_admin());

create or replace function public.update_admin_post(
  p_post_id uuid,
  p_author text,
  p_category text,
  p_title text,
  p_body text,
  p_image_url text,
  p_document_url text,
  p_created_at timestamptz
)
returns public.posts
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  updated_post public.posts;
begin
  if not exists (
    select 1
    from public.admins
    where lower(email) = lower(auth.jwt() ->> 'email')
      and status = 'approved'
  ) then
    raise exception 'Only approved admins can update posts';
  end if;

  update public.posts
  set author = p_author,
      category = p_category,
      title = p_title,
      body = p_body,
      image_url = p_image_url,
      document_url = p_document_url,
      created_at = p_created_at
  where id = p_post_id
  returning * into updated_post;

  if updated_post.id is null then
    raise exception 'Post not found';
  end if;

  return updated_post;
end;
$$;

grant execute on function public.update_admin_post(uuid, text, text, text, text, text, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
