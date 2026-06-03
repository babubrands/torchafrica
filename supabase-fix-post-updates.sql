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
