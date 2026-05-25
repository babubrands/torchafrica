const SUPABASE_URL = "https://bphqkifxlfsnecovxqkr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaHFraWZ4bGZzbmVjb3Z4cWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODM0MTksImV4cCI6MjA5NTI1OTQxOX0.p_uT2TpHN3kbJUhy4vBkteAk7M8BZGdaFYyQPqJXMds";
const POSTS_TABLE = "posts";
const COMMENTS_TABLE = "comments";
const ADMINS_TABLE = "admins";
const ADMIN_REQUESTS_TABLE = "admin_requests";
const STORAGE_BUCKET = "post-uploads";
const OWNER_EMAIL = "ebarasa203@gmail.com";
const TORCH_ADMIN_EMAIL = "torchafrica@gmail.com";

const demoPosts = [
  {
    id: "demo-1",
    author: "Torch Africa",
    author_email: TORCH_ADMIN_EMAIL,
    title: "Memorandum on the Constitutional Amendment Bill, 2025",
    body: "Torch Africa has published a memorandum for public engagement, constitutional accountability, and civil justice advocacy.",
    category: "Legal Brief",
    likes: 24,
    reposts: 7,
    views: 128,
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
    author_email: "",
    title: "Why public participation matters",
    body: "Strong democracies are built when communities can read proposals, ask questions, and contribute before decisions are finalized.",
    category: "Community",
    likes: 11,
    reposts: 3,
    views: 74,
    image_url: "",
    document_url: "",
    comments: [],
    created_at: new Date().toISOString()
  }
];

let supabaseClient = null;
let posts = [];
let currentUser = null;
let currentAdmin = null;
let afterAuthSuccess = null;

function withTimeout(promise, message, timeoutMs = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function getAuthRedirectUrl() {
  return window.location.href.split("#")[0].split("?")[0];
}

const feed = document.getElementById("feed");
const postForm = document.getElementById("postForm");
const configNotice = document.getElementById("configNotice");
const authSlot = document.getElementById("authSlot");
const createPostButton = document.getElementById("createPostButton");
const year = document.getElementById("year");
const contactForm = document.getElementById("contactForm");
if (year) year.textContent = new Date().getFullYear();

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("contactName").value.trim();
    const email = document.getElementById("contactEmail").value.trim();
    const message = document.getElementById("contactMessage").value.trim();

    if (!name || !email || !message) return;

    const whatsappMessage = [
      "Hello Torch Africa,",
      "",
      `My name is ${name}.`,
      `Email: ${email}`,
      "",
      message
    ].join("\n");

    window.open(`https://wa.me/254733296064?text=${encodeURIComponent(whatsappMessage)}`, "_blank", "noopener");
  });
}

function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20 && window.supabase;
}

function initSupabase() {
  if (!isSupabaseConfigured()) {
    if (configNotice) configNotice.classList.remove("d-none");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
}

async function initAuth() {
  if (!supabaseClient) {
    renderAuthSlot();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  await syncSignedInUser();
  await loadAdminStatus();
  renderAuthSlot();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    await syncSignedInUser();
    await loadAdminStatus();
    renderAuthSlot();
    if (feed) await loadPosts();
    if (document.body.dataset.page === "studio") await loadStudio();
    if (document.body.dataset.page === "admin") await loadAdminDashboard();
  });
}

async function refreshAuthenticatedViews() {
  await syncSignedInUser();
  await loadAdminStatus();
  renderAuthSlot();
  if (feed) await loadPosts();
  if (document.body.dataset.page === "studio") await loadStudio();
  if (document.body.dataset.page === "admin") await loadAdminDashboard();
}

function promptForAuth(nextAction) {
  afterAuthSuccess = nextAction || null;
  showSignUpModal();
}

async function finishAuthFlow(modal, messageDiv, message) {
  await refreshAuthenticatedViews();
  messageDiv.innerHTML = `<div class="alert alert-success">${message}</div>`;
  setTimeout(() => {
    modal.hide();
    const nextAction = afterAuthSuccess;
    afterAuthSuccess = null;
    if (nextAction) nextAction();
  }, 700);
}

async function syncSignedInUser() {
  if (!supabaseClient || !currentUser) return;

  const profile = {
    id: currentUser.id,
    email: currentUser.email,
    full_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email,
    avatar_url: currentUser.user_metadata?.avatar_url || "",
    updated_at: new Date().toISOString()
  };

  await supabaseClient.from("profiles").upsert(profile).select().maybeSingle();
}

async function loadAdminStatus() {
  currentAdmin = null;
  if (!supabaseClient || !currentUser?.email) return;

  // Owner has automatic access
  if (currentUser.email === OWNER_EMAIL) {
    currentAdmin = { email: currentUser.email, role: "owner", status: "approved" };
    return;
  }

  const { data, error } = await supabaseClient
    .from(ADMINS_TABLE)
    .select("*")
    .eq("email", currentUser.email)
    .eq("status", "approved")
    .maybeSingle();

  if (!error) currentAdmin = data;
}

function isApprovedAdmin() {
  return Boolean(currentAdmin);
}

function isOwner() {
  return currentUser?.email === OWNER_EMAIL;
}

function canManagePost(post) {
  return Boolean(currentUser && (post.user_id === currentUser.id || isApprovedAdmin()));
}

function canManageComment(comment) {
  return Boolean(currentUser && (comment.user_id === currentUser.id || isApprovedAdmin()));
}

function renderAuthSlot() {
  if (!authSlot) return;

  if (!supabaseClient) {
    authSlot.innerHTML = '<button class="btn btn-sm btn-outline-dark ms-xl-2" type="button" disabled>Demo Mode</button>';
    return;
  }

  if (!currentUser) {
    authSlot.innerHTML = `
      <div class="auth-actions" aria-label="Account actions">
        <button type="button" class="auth-primary" data-auth-action="signup">Sign Up</button>
        <button type="button" class="auth-secondary" data-auth-action="login">Log In</button>
      </div>
    `;
    return;
  }

  authSlot.innerHTML = `
    <div class="auth-chip">
      <span>${escapeHtml(currentUser.email)}</span>
      ${isOwner() ? '<span class="badge bg-danger">Owner</span>' : isApprovedAdmin() ? '<span class="badge bg-info">Admin</span>' : ''}
      <button type="button" data-auth-action="signout">Sign out</button>
    </div>
  `;
}

document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-auth-action]")?.dataset.authAction;
  if (!action) return;

  if (action === "signup") {
    afterAuthSuccess = null;
    await showSignUpModal();
  }
  if (action === "login") {
    afterAuthSuccess = null;
    await showLoginModal();
  }
  if (action === "signout") await signOut();
});

async function showSignUpModal() {
  if (!supabaseClient) return;

  const modalHtml = `
    <div class="modal fade" id="signupModal" tabindex="-1" aria-labelledby="signupLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="signupLabel">Create Account</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="signupForm">
            <div class="modal-body">
              <label class="form-label" for="signupEmail">Email address</label>
              <input class="form-control" id="signupEmail" type="email" placeholder="you@example.com" required>
              <label class="form-label mt-3" for="signupName">Full Name</label>
              <input class="form-control" id="signupName" type="text" placeholder="Your name" required>
              <label class="form-label mt-3" for="signupPassword">Password</label>
              <input class="form-control" id="signupPassword" type="password" placeholder="Create a password" required>
              <label class="form-label mt-3" for="signupPasswordConfirm">Confirm Password</label>
              <input class="form-control" id="signupPasswordConfirm" type="password" placeholder="Confirm password" required>
              <div id="signupMessage" class="mt-3"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-torch">Create Account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById("signupModal");
  if (existing) existing.remove();

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById("signupModal"));
  const form = document.getElementById("signupForm");
  const messageDiv = document.getElementById("signupMessage");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("signupEmail").value.trim();
    const name = document.getElementById("signupName").value.trim();
    const password = document.getElementById("signupPassword").value;
    const passwordConfirm = document.getElementById("signupPasswordConfirm").value;

    if (password !== passwordConfirm) {
      messageDiv.innerHTML = '<div class="alert alert-danger">Passwords do not match</div>';
      return;
    }

    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Creating...";
    messageDiv.innerHTML = "";

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: getAuthRedirectUrl()
        }
      });

      if (error) throw error;

      if (data.session?.user) {
        currentUser = data.session.user;
        await finishAuthFlow(modal, messageDiv, "Account created. You are signed in on this device.");
      } else {
        messageDiv.innerHTML = `<div class="alert alert-success">Account created. Log in with the email and password you just used.</div>`;
        setTimeout(() => {
          modal.hide();
          showLoginModal();
        }, 900);
      }
    } catch (error) {
      console.error(error);
      messageDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Create Account";
    }
  });

  modal.show();
}

async function showLoginModal() {
  if (!supabaseClient) return;

  const modalHtml = `
    <div class="modal fade" id="loginModal" tabindex="-1" aria-labelledby="loginLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="loginLabel">Log In</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="loginForm">
            <div class="modal-body">
              <label class="form-label" for="loginEmail">Email address</label>
              <input class="form-control" id="loginEmail" type="email" placeholder="you@example.com" required>
              <label class="form-label mt-3" for="loginPassword">Password</label>
              <input class="form-control" id="loginPassword" type="password" placeholder="Enter your password" required>
              <div id="loginMessage" class="mt-3"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-torch">Log In</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById("loginModal");
  if (existing) existing.remove();

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById("loginModal"));
  const form = document.getElementById("loginForm");
  const messageDiv = document.getElementById("loginMessage");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Logging in...";
    messageDiv.innerHTML = "";

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      currentUser = data.session?.user || currentUser;
      await finishAuthFlow(modal, messageDiv, "Login successful. You are signed in on this device.");
    } catch (error) {
      console.error(error);
      messageDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Log In";
    }
  });

  modal.show();
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

function getLocalPosts() {
  const saved = localStorage.getItem("torchAfricaPosts");
  return saved ? JSON.parse(saved) : demoPosts;
}

function saveLocalPosts(nextPosts) {
  localStorage.setItem("torchAfricaPosts", JSON.stringify(nextPosts));
}

async function loadPosts() {
  if (!feed) return;

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
    if (configNotice) {
      configNotice.textContent = "Supabase could not load posts. Check tables and policies.";
      configNotice.classList.remove("d-none");
    }
    posts = getLocalPosts();
  } else {
    posts = normalizePosts(data);
  }

  renderPosts();
}

function normalizePosts(nextPosts) {
  return (nextPosts || []).map((post) => ({
    ...post,
    comments: (post.comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }));
}

function renderPosts() {
  if (!feed) return;

  if (!posts.length) {
    feed.innerHTML = '<div class="post-card post-content">No posts yet. Create the first update.</div>';
    return;
  }

  feed.innerHTML = posts.map((post) => {
    const date = formatDate(post.created_at);
    const image = post.image_url ? `<img class="post-media" src="${escapeHtml(post.image_url)}" alt="${escapeHtml(post.title)}">` : "";
    const documentLink = post.document_url
      ? `<a class="document-link" href="${escapeHtml(post.document_url)}" target="_blank" rel="noopener">Open attached document</a>`
      : "<span></span>";
    const comments = post.comments || [];
    const deleteButton = canManagePost(post)
      ? `<button class="danger-link" type="button" data-delete-post="${post.id}">Delete</button>`
      : "";
    const commentList = comments.length
      ? comments.map((comment) => `
          <div class="comment-item">
            <div class="comment-row">
              <strong>${escapeHtml(comment.author || "Guest")}</strong>
              ${canManageComment(comment) ? `<button class="danger-link" type="button" data-delete-comment="${comment.id}">Delete</button>` : ""}
            </div>
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
            ${deleteButton}
          </div>
          ${documentLink}
        </div>
        <div class="comments-panel" id="comments-${post.id}">
          <div class="comment-list">${commentList}</div>
          <form class="comment-form" data-comment-form="${post.id}">
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
  const userFolder = currentUser?.id || "public";
  const path = `${folder}/${userFolder}/${Date.now()}-${safeName}`;
  const { error } = await withTimeout(
    supabaseClient.storage.from(STORAGE_BUCKET).upload(path, file),
    "Upload timed out. Check the post-uploads bucket and Storage policies."
  );
  if (error) throw new Error(error.message || "Upload failed. Check the post-uploads bucket policies.");

  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

if (createPostButton) {
  createPostButton.addEventListener("click", async (event) => {
    if (supabaseClient && !currentUser) {
      event.preventDefault();
      event.stopPropagation();
      promptForAuth(() => bootstrap.Modal.getOrCreateInstance(document.getElementById("postModal")).show());
    }
  });
}

if (postForm) {
  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (supabaseClient && !currentUser) {
      promptForAuth(() => bootstrap.Modal.getOrCreateInstance(document.getElementById("postModal")).show());
      return;
    }

    const submitButton = postForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Publishing...";

    try {
      const imageUrl = await uploadFile(document.getElementById("postImage").files[0], "images");
      const documentUrl = await uploadFile(document.getElementById("postDocument").files[0], "documents");
      const displayName = document.getElementById("postAuthor").value.trim()
        || currentUser?.user_metadata?.full_name
        || currentUser?.email
        || "Torch Africa";
      const newPost = {
        user_id: currentUser?.id || null,
        author: displayName,
        author_email: currentUser?.email || "",
        title: document.getElementById("postTitle").value.trim(),
        body: document.getElementById("postBody").value.trim(),
        category: document.getElementById("postCategory").value,
        image_url: imageUrl,
        document_url: documentUrl,
        likes: 0,
        reposts: 0,
        views: 0,
        comments: [],
        created_at: new Date().toISOString()
      };

      if (supabaseClient) {
        const { comments, ...postPayload } = newPost;
        const { error } = await withTimeout(
          supabaseClient.from(POSTS_TABLE).insert(postPayload),
          "Publishing timed out. Check the posts table insert policy."
        );
        if (error) throw new Error(error.message || "Publishing failed. Check the posts table policy.");
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
      alert(`The post could not be published: ${error.message || "Please check Supabase settings."}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Publish";
    }
  });
}

if (feed) {
  feed.addEventListener("click", async (event) => {
    const commentToggle = event.target.closest("[data-comment-toggle]");
    if (commentToggle) {
      const panel = document.getElementById(`comments-${commentToggle.dataset.commentToggle}`);
      if (panel) panel.classList.toggle("is-open");
      return;
    }

    const deletePost = event.target.closest("[data-delete-post]");
    if (deletePost) {
      await deletePostById(deletePost.dataset.deletePost);
      return;
    }

    const deleteComment = event.target.closest("[data-delete-comment]");
    if (deleteComment) {
      await deleteCommentById(deleteComment.dataset.deleteComment);
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

    if (supabaseClient && !currentUser) {
      const postId = form.dataset.commentForm;
      const pendingBody = String(new FormData(form).get("body") || "");
      promptForAuth(() => {
        const panel = document.getElementById(`comments-${postId}`);
        if (panel) panel.classList.add("is-open");
        const textarea = panel?.querySelector("textarea[name='body']");
        if (textarea) {
          textarea.value = pendingBody;
          textarea.focus();
        }
      });
      return;
    }

    const postId = form.dataset.commentForm;
    const formData = new FormData(form);
    const newComment = {
      post_id: postId,
      user_id: currentUser?.id || null,
      author: currentUser?.user_metadata?.full_name || currentUser?.email || "Guest",
      author_email: currentUser?.email || "",
      body: String(formData.get("body") || "").trim(),
      created_at: new Date().toISOString()
    };

    if (!newComment.body) return;

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
}

async function incrementPostCounter(postId, field) {
  if (supabaseClient && !currentUser) {
    promptForAuth(() => incrementPostCounter(postId, field));
    return;
  }

  const post = posts.find((item) => String(item.id) === String(postId));
  if (!post) return;

  const nextValue = Number(post[field] || 0) + 1;

  if (supabaseClient) {
    const { error } = await supabaseClient.rpc("increment_post_counter", {
      post_id: postId,
      counter_name: field
    });

    if (error) {
      console.error(error);
      alert("That action could not be saved. Please check your Supabase policies.");
      return;
    }
  }

  posts = posts.map((item) => String(item.id) === String(postId) ? { ...item, [field]: nextValue } : item);
  if (!supabaseClient) saveLocalPosts(posts);
  renderPosts();
}

async function deletePostById(postId) {
  const post = posts.find((item) => String(item.id) === String(postId));
  if (!post || !canManagePost(post)) return;
  if (!confirm("Delete this post and its comments?")) return;

  if (supabaseClient) {
    const { error } = await supabaseClient.from(POSTS_TABLE).delete().eq("id", postId);
    if (error) {
      console.error(error);
      alert("Delete failed. Only the post owner or an approved admin can delete it.");
      return;
    }
    await loadPosts();
  } else {
    posts = posts.filter((item) => String(item.id) !== String(postId));
    saveLocalPosts(posts);
    renderPosts();
  }
}

async function deleteCommentById(commentId) {
  const comment = posts.flatMap((post) => post.comments || []).find((item) => String(item.id) === String(commentId));
  if (!comment || !canManageComment(comment)) return;
  if (!confirm("Delete this comment?")) return;

  if (supabaseClient) {
    const { error } = await supabaseClient.from(COMMENTS_TABLE).delete().eq("id", commentId);
    if (error) {
      console.error(error);
      alert("Delete failed. Only the comment owner or an approved admin can delete it.");
      return;
    }
    await loadPosts();
  } else {
    posts = posts.map((post) => ({ ...post, comments: (post.comments || []).filter((item) => String(item.id) !== String(commentId)) }));
    saveLocalPosts(posts);
    renderPosts();
  }
}

async function requestAdminAccess() {
  if (!currentUser) {
    promptForAuth(() => requestAdminAccess());
    return;
  }

  const payload = {
    user_id: currentUser.id,
    email: currentUser.email,
    full_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email,
    status: "pending"
  };

  const { error } = await supabaseClient.from(ADMIN_REQUESTS_TABLE).insert(payload);
  if (error) {
    alert("Your request may already exist, or the admin request table is not ready yet.");
    console.error(error);
    return;
  }

  alert("Admin access request sent to the owner.");
  await loadStudio();
}

async function loadStudio() {
  const gate = document.getElementById("studioGate");
  const content = document.getElementById("studioContent");
  const stats = document.getElementById("studioStats");
  const myPosts = document.getElementById("studioPosts");
  const requestStatus = document.getElementById("adminRequestStatus");
  if (!gate || !content || !stats || !myPosts) return;

  if (!supabaseClient || !currentUser) {
    gate.innerHTML = `
      <div class="dashboard-card">
        <h2>Sign in to view your studio</h2>
        <p>Create an account or log in to see your posts, engagement, and admin access status.</p>
        <div class="btn-group" role="group">
          <button class="btn btn-torch" type="button" data-auth-action="signup">Sign Up</button>
          <button class="btn btn-outline-dark" type="button" data-auth-action="login">Log In</button>
        </div>
      </div>
    `;
    content.classList.add("d-none");
    return;
  }

  gate.innerHTML = "";
  content.classList.remove("d-none");

  const { data: myData, error } = await supabaseClient
    .from(POSTS_TABLE)
    .select("*, comments(*)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  const myPostList = error ? [] : normalizePosts(myData);
  posts = myPostList;
  const totals = sumPostStats(myPostList);
  stats.innerHTML = renderStatCards(totals);
  myPosts.innerHTML = renderDashboardRows(myPostList, { ownerView: false });

  if (requestStatus) await renderAdminRequestStatus(requestStatus);
}

async function renderAdminRequestStatus(container) {
  const { data } = await supabaseClient
    .from(ADMIN_REQUESTS_TABLE)
    .select("*")
    .eq("email", currentUser.email)
    .order("created_at", { ascending: false });

  const latest = data?.[0];
  if (isApprovedAdmin()) {
    container.innerHTML = '<div class="dashboard-card"><h3>Admin Access</h3><p>Your admin access is approved!</p><a class="btn btn-torch" href="admin.html">Open Admin Dashboard</a></div>';
    return;
  }

  if (latest?.status === "pending") {
    container.innerHTML = '<div class="dashboard-card"><h3>Admin Access</h3><p>Your request is pending owner approval.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="dashboard-card">
      <h3>Request Admin Access</h3>
      <p>Need to help manage official Torch Africa content? Request owner approval.</p>
      <button class="btn btn-outline-dark" type="button" id="requestAdminButton">Request Admin Access</button>
    </div>
  `;
  document.getElementById("requestAdminButton")?.addEventListener("click", requestAdminAccess);
}

async function loadAdminDashboard() {
  const gate = document.getElementById("adminGate");
  const content = document.getElementById("adminContent");
  const stats = document.getElementById("adminStats");
  const postsTable = document.getElementById("adminPostsTable");
  const requestsList = document.getElementById("adminRequestsList");
  const search = document.getElementById("adminSearch");
  if (!gate || !content || !stats || !postsTable) return;

  if (!supabaseClient || !currentUser) {
    gate.innerHTML = `
      <div class="dashboard-card">
        <h2>Admin Access Required</h2>
        <p>Sign in to access the admin dashboard.</p>
        <div class="btn-group" role="group">
          <button class="btn btn-torch" type="button" data-auth-action="login">Log In</button>
          <button class="btn btn-outline-dark" type="button" data-auth-action="signup">Sign Up</button>
        </div>
      </div>
    `;
    content.classList.add("d-none");
    return;
  }

  if (!isApprovedAdmin()) {
    gate.innerHTML = `
      <div class="dashboard-card alert-danger">
        <h2>🔒 Admin Access Denied</h2>
        <p>${escapeHtml(currentUser.email)} is not an approved admin.</p>
        ${isOwner() ? '' : '<p class="text-muted mt-2">Contact the owner to request admin access.</p>'}
      </div>
    `;
    content.classList.add("d-none");
    return;
  }

  gate.innerHTML = "";
  content.classList.remove("d-none");

  const { data, error } = await supabaseClient
    .from(POSTS_TABLE)
    .select("*, comments(*)")
    .order("created_at", { ascending: false });
  const allPosts = error ? [] : normalizePosts(data);
  posts = allPosts;

  stats.innerHTML = renderStatCards(sumPostStats(allPosts));
  const render = () => {
    const query = (search?.value || "").toLowerCase();
    const filtered = allPosts.filter((post) => `${post.title} ${post.body} ${post.author}`.toLowerCase().includes(query));
    postsTable.innerHTML = renderDashboardRows(filtered, { ownerView: true });
  };
  render();
  search?.addEventListener("input", render);

  if (requestsList) await renderAdminRequests(requestsList);
}

async function renderAdminRequests(container) {
  if (!isOwner()) {
    container.innerHTML = '<div class="dashboard-card"><h3>Admin Requests</h3><p>Only the owner can approve admin requests.</p></div>';
    return;
  }

  const { data, error } = await supabaseClient
    .from(ADMIN_REQUESTS_TABLE)
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error || !data?.length) {
    container.innerHTML = '<div class="dashboard-card"><h3>Admin Requests</h3><p>No pending requests.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="dashboard-card">
      <h3>👥 Admin Access Requests</h3>
      <div class="request-list">
        ${data.map((request) => `
          <div class="request-item">
            <div>
              <strong>${escapeHtml(request.full_name || request.email)}</strong>
              <span>${escapeHtml(request.email)}</span>
            </div>
            <div class="request-actions">
              <button class="btn btn-sm btn-torch" type="button" data-approve-admin="${request.id}">Approve</button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-reject-admin="${request.id}">Reject</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

document.addEventListener("click", async (event) => {
  const approveId = event.target.closest("[data-approve-admin]")?.dataset.approveAdmin;
  if (approveId) {
    await decideAdminRequest(approveId, "approved");
    return;
  }

  const rejectId = event.target.closest("[data-reject-admin]")?.dataset.rejectAdmin;
  if (rejectId) await decideAdminRequest(rejectId, "rejected");

  const dashboardDelete = event.target.closest("[data-dashboard-delete]")?.dataset.dashboardDelete;
  if (dashboardDelete) {
    await deletePostById(dashboardDelete);
    if (document.body.dataset.page === "admin") await loadAdminDashboard();
    if (document.body.dataset.page === "studio") await loadStudio();
  }
});

async function decideAdminRequest(requestId, status) {
  if (!isOwner()) return;

  const { data: request, error: requestError } = await supabaseClient
    .from(ADMIN_REQUESTS_TABLE)
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError || !request) return;

  const { error: updateError } = await supabaseClient
    .from(ADMIN_REQUESTS_TABLE)
    .update({
      status,
      reviewed_by: currentUser.email,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", requestId);
  if (updateError) {
    console.error(updateError);
    alert("Could not update the request.");
    return;
  }

  if (status === "approved") {
    const { error: adminError } = await supabaseClient.from(ADMINS_TABLE).upsert({
      user_id: request.user_id,
      email: request.email,
      full_name: request.full_name,
      role: "admin",
      status: "approved",
      approved_by: currentUser.email,
      approved_at: new Date().toISOString()
    });
    if (adminError) {
      console.error(adminError);
      alert("Request updated, but admin record could not be created.");
    }
  }

  await loadAdminDashboard();
}

function sumPostStats(postList) {
  return {
    posts: postList.length,
    views: postList.reduce((total, post) => total + Number(post.views || 0), 0),
    likes: postList.reduce((total, post) => total + Number(post.likes || 0), 0),
    reposts: postList.reduce((total, post) => total + Number(post.reposts || 0), 0),
    comments: postList.reduce((total, post) => total + (post.comments || []).length, 0)
  };
}

function renderStatCards(stats) {
  return `
    <div class="stat-card"><span>Posts</span><strong>${stats.posts}</strong></div>
    <div class="stat-card"><span>Views</span><strong>${stats.views}</strong></div>
    <div class="stat-card"><span>Likes</span><strong>${stats.likes}</strong></div>
    <div class="stat-card"><span>Comments</span><strong>${stats.comments}</strong></div>
    <div class="stat-card"><span>Reposts</span><strong>${stats.reposts}</strong></div>
  `;
}

function renderDashboardRows(postList, options) {
  if (!postList.length) {
    return '<div class="dashboard-empty">No posts found.</div>';
  }

  return `
    <div class="dashboard-table">
      <div class="dashboard-row dashboard-head">
        <span>Post</span>
        <span>Views</span>
        <span>Likes</span>
        <span>Comments</span>
        <span>Actions</span>
      </div>
      ${postList.map((post) => `
        <div class="dashboard-row">
          <div class="post-mini">
            ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" alt="">` : '<div class="post-thumb-empty"></div>'}
            <div>
              <strong>${escapeHtml(post.title)}</strong>
              <span>${escapeHtml(options.ownerView ? `${post.author || "Unknown"} • ${post.author_email || "No email"}` : formatDate(post.created_at))}</span>
            </div>
          </div>
          <span>${Number(post.views || 0)}</span>
          <span>${Number(post.likes || 0)}</span>
          <span>${(post.comments || []).length}</span>
          <span><button class="icon-action danger-link" type="button" data-dashboard-delete="${post.id}">Delete</button></span>
        </div>
      `).join("")}
    </div>
  `;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
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
initAuth().then(async () => {
  if (feed) await loadPosts();
  if (document.body.dataset.page === "studio") await loadStudio();
  if (document.body.dataset.page === "admin") await loadAdminDashboard();
});
