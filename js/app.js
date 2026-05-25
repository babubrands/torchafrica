const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
const POSTS_TABLE = "posts";
const STORAGE_BUCKET = "post-uploads";

const demoPosts = [
  {
    id: "demo-1",
    author: "Torch Africa",
    title: "Memorandum on the Constitutional Amendment Bill, 2025",
    body: "Torch Africa has published a memorandum for public engagement, constitutional accountability, and civil justice advocacy.",
    category: "Legal Brief",
    likes: 24,
    image_url: "assets/torch-africa-logo.jpeg",
    document_url: "assets/torch-africa-memorandum-constitutional-amendment-bill-2025.pdf",
    created_at: "2025-06-18T08:13:36.000Z"
  },
  {
    id: "demo-2",
    author: "Civic Education Desk",
    title: "Why public participation matters",
    body: "Strong democracies are built when communities can read proposals, ask questions, and contribute before decisions are finalized.",
    category: "Community",
    likes: 11,
    image_url: "",
    document_url: "",
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
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    configNotice.textContent = "Supabase could not load posts. Check your table, policies, and keys.";
    configNotice.classList.remove("d-none");
    posts = getLocalPosts();
  } else {
    posts = data;
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
          <button class="like-btn" type="button" data-like-id="${post.id}">
            <span aria-hidden="true">♥</span>
            <span>${Number(post.likes || 0)}</span>
          </button>
          ${documentLink}
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
      created_at: new Date().toISOString()
    };

    if (supabaseClient) {
      const { error } = await supabaseClient.from(POSTS_TABLE).insert(newPost);
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
  const button = event.target.closest("[data-like-id]");
  if (!button) return;

  const postId = button.dataset.likeId;
  const post = posts.find((item) => String(item.id) === String(postId));
  if (!post) return;

  const nextLikes = Number(post.likes || 0) + 1;
  button.classList.add("liked");

  if (supabaseClient) {
    const { error } = await supabaseClient
      .from(POSTS_TABLE)
      .update({ likes: nextLikes })
      .eq("id", postId);

    if (error) {
      console.error(error);
      return;
    }
  }

  posts = posts.map((item) => String(item.id) === String(postId) ? { ...item, likes: nextLikes } : item);
  if (!supabaseClient) saveLocalPosts(posts);
  renderPosts();
});

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
