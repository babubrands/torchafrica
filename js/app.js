const SUPABASE_URL = "https://bphqkifxlfsnecovxqkr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaHFraWZ4bGZzbmVjb3Z4cWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODM0MTksImV4cCI6MjA5NTI1OTQxOX0.p_uT2TpHN3kbJUhy4vBkteAk7M8BZGdaFYyQPqJXMds";
const POSTS_TABLE = "posts";
const COMMENTS_TABLE = "comments";
const STORAGE_BUCKET = "post-uploads";

const demoPosts = [
  {
    id: "demo-1",
    author: "Torch Africa",
    title: "Memorandum on the Constitutional Amendment Bill, 2025",
    body: "Torch Africa has published a memorandum for public engagement, constitutional accountability, and civil justice advocacy.",
    category: "Legal Brief",
    likes: 24,
    reposts: 7,
    image_url: "assets/torch-africa-logo.jpeg",
    document_url: "assets/torch-africa-memorandum-constitutional-amendment-bill-2025.pdf",
    comments: [
      {
        id: "comment-demo-1",
        author: "Public Interest Desk",
        body: "This is useful for civic education sessions and community reading circles.",
        created_at: "2025-06-19T09:15:00.000Z"
      }
    ],
    created_at: "2025-06-18T08:13:36.000Z"
  },
  {
    id: "demo-2",
    author: "Civic Education Desk",
    title: "Why public participation matters",
    body: "Strong democracies are built when communities can read proposals, ask questions, and contribute before decisions are finalized.",
    category: "Community",
    likes: 11,
    reposts: 3,
    image_url: "",
    document_url: "",
    comments: [],
    created_at: new Date().toISOString()
  }
];

let supabaseClient = null;
let posts = [];

const feed = document.getElementById("feed");
const postForm = document.getElementById("postForm");
const configNotice = document.getElementById("configNotice");
document.getElementById("year").textContent = new Date().getFullYear();

function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20 && window.supabase;
}

function initSupabase() {
  if (!isSupabaseConfigured()) {
    configNotice.classList.remove("d-none");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function getLocalPosts() {
  const saved = localStorage.getItem("torchAfricaPosts");
  return saved ? JSON.parse(saved) : demoPosts;
}

function saveLocalPosts(nextPosts) {
  localStorage.setItem("torchAfricaPosts", JSON.stringify(nextPosts));
}

async function loadPosts() {
  if (!supabaseClient) {
    posts = getLocalPosts();
    renderPosts();
    return;
  }

  const { data, error } = await supabaseClient
    .from(POSTS_TABLE)
    .select("*, comments(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    configNotice.textContent = "Supabase could not load posts. Check your table, policies, and keys.";
    configNotice.classList.remove("d-none");
    posts = getLocalPosts();
  } else {
    posts = data.map((post) => ({
      ...post,
      comments: (post.comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }));
  }

  renderPosts();
}

function renderPosts() {
  if (!posts.length) {
    feed.innerHTML = '<div class="post-card post-content">No posts yet. Create the first update.</div>';
    return;
  }

  feed.innerHTML = posts.map((post) => {
    const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(post.created_at));
    const image = post.image_url ? `<img class="post-media" src="${escapeHtml(post.image_url)}" alt="${escapeHtml(post.title)}">` : "";
    const documentLink = post.document_url
      ? `<a class="document-link" href="${escapeHtml(post.document_url)}" target="_blank" rel="noopener">Open attached document</a>`
      : "<span></span>";
    const comments = post.comments || [];
    const commentList = comments.length
      ? comments.map((comment) => `
          <div class="comment-item">
            <strong>${escapeHtml(comment.author || "Guest")}</strong>
            <p>${escapeHtml(comment.body)}</p>
          </div>
        `).join("")
      : '<p class="comment-empty">No comments yet. Start the conversation.</p>';

    return `
      <article class="post-card">
        ${image}
        <div class="post-content">
          <div class="post-meta">
            <span class="post-category">${escapeHtml(post.category || "Update")}</span>
            <span>${escapeHtml(post.author || "Torch Africa")}</span>
            <span>${date}</span>
          </div>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.body)}</p>
        </div>
        <div class="post-actions">
          <div class="engagement-actions">
            <button class="engagement-btn" type="button" data-like-id="${post.id}">
              <span aria-hidden="true">Like</span>
              <span>${Number(post.likes || 0)}</span>
            </button>
            <button class="engagement-btn" type="button" data-repost-id="${post.id}">
              <span aria-hidden="true">Repost</span>
              <span>${Number(post.reposts || 0)}</span>
            </button>
            <button class="engagement-btn" type="button" data-comment-toggle="${post.id}">
              <span aria-hidden="true">Comment</span>
              <span>${comments.length}</span>
            </button>
          </div>
          ${documentLink}
        </div>
        <div class="comments-panel" id="comments-${post.id}">
          <div class="comment-list">${commentList}</div>
          <form class="comment-form" data-comment-form="${post.id}">
            <input class="form-control form-control-sm" name="author" type="text" placeholder="Your name" required>
            <textarea class="form-control form-control-sm" name="body" rows="2" placeholder="Write a comment..." required></textarea>
            <button class="btn btn-sm btn-torch" type="submit">Post Comment</button>
          </form>
        </div>
      </article>
    `;
  }).join("");
}

async function uploadFile(file, folder) {
  if (!file) return "";

  if (!supabaseClient) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, "-").toLowerCase();
  const path = `${folder}/${Date.now()}-${safeName}`;
  const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, file);
  if (error) throw error;

  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = postForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Publishing...";

  try {
    const imageUrl = await uploadFile(document.getElementById("postImage").files[0], "images");
    const documentUrl = await uploadFile(document.getElementById("postDocument").files[0], "documents");
    const newPost = {
      author: document.getElementById("postAuthor").value.trim(),
      title: document.getElementById("postTitle").value.trim(),
      body: document.getElementById("postBody").value.trim(),
      category: document.getElementById("postCategory").value,
      image_url: imageUrl,
      document_url: documentUrl,
      likes: 0,
      reposts: 0,
      comments: [],
      created_at: new Date().toISOString()
    };

    if (supabaseClient) {
      const { comments, ...postPayload } = newPost;
      const { error } = await supabaseClient.from(POSTS_TABLE).insert(postPayload);
      if (error) throw error;
      await loadPosts();
    } else {
      newPost.id = `local-${Date.now()}`;
      posts = [newPost, ...posts];
      saveLocalPosts(posts);
      renderPosts();
    }

    postForm.reset();
    bootstrap.Modal.getInstance(document.getElementById("postModal")).hide();
  } catch (error) {
    console.error(error);
    alert("The post could not be published. Please check the console or Supabase settings.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Publish";
  }
});

feed.addEventListener("click", async (event) => {
  const commentToggle = event.target.closest("[data-comment-toggle]");
  if (commentToggle) {
    const panel = document.getElementById(`comments-${commentToggle.dataset.commentToggle}`);
    if (panel) panel.classList.toggle("is-open");
    return;
  }

  const repostButton = event.target.closest("[data-repost-id]");
  if (repostButton) {
    await incrementPostCounter(repostButton.dataset.repostId, "reposts");
    return;
  }

  const button = event.target.closest("[data-like-id]");
  if (!button) return;

  await incrementPostCounter(button.dataset.likeId, "likes");
});

feed.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;

  event.preventDefault();

  const postId = form.dataset.commentForm;
  const formData = new FormData(form);
  const newComment = {
    post_id: postId,
    author: String(formData.get("author") || "").trim(),
    body: String(formData.get("body") || "").trim(),
    created_at: new Date().toISOString()
  };

  if (!newComment.author || !newComment.body) return;

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Posting...";

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.from(COMMENTS_TABLE).insert(newComment);
      if (error) throw error;
      await loadPosts();
    } else {
      newComment.id = `comment-${Date.now()}`;
      posts = posts.map((post) => {
        if (String(post.id) !== String(postId)) return post;
        return { ...post, comments: [...(post.comments || []), newComment] };
      });
      saveLocalPosts(posts);
      renderPosts();
    }

    const panel = document.getElementById(`comments-${postId}`);
    if (panel) panel.classList.add("is-open");
  } catch (error) {
    console.error(error);
    alert("The comment could not be posted. Please check your Supabase settings.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Post Comment";
  }
});

async function incrementPostCounter(postId, field) {
  const post = posts.find((item) => String(item.id) === String(postId));
  if (!post) return;

  const nextValue = Number(post[field] || 0) + 1;

  if (supabaseClient) {
    const { error } = await supabaseClient
      .from(POSTS_TABLE)
      .update({ [field]: nextValue })
      .eq("id", postId);

    if (error) {
      console.error(error);
      return;
    }
  }

  posts = posts.map((item) => String(item.id) === String(postId) ? { ...item, [field]: nextValue } : item);
  if (!supabaseClient) saveLocalPosts(posts);
  renderPosts();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

initSupabase();
loadPosts();
