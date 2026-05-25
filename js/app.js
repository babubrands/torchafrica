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

const feed = document.getElementById("feed");
const postForm = document.getElementById("postForm");
const configNotice = document.getElementById("configNotice");
const authSlot = document.getElementById("authSlot");
const createPostButton = document.getElementById("createPostButton");
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20 && window.supabase;
}

function initSupabase() {
  if (!isSupabaseConfigured()) {
    if (configNotice) configNotice.classList.remove("d-none");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  return currentAdmin?.role === "owner" || currentUser?.email === OWNER_EMAIL;
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
    authSlot.innerHTML = '<button class="btn btn-sm btn-outline-dark ms-lg-2" type="button" disabled>Demo Mode</button>';
    return;
  }

  if (!currentUser) {
    authSlot.innerHTML = '<button class="btn btn-sm btn-outline-dark ms-lg-2" type="button" data-auth-action="signin">Sign in with Google</button>';
    return;
  }

  authSlot.innerHTML = `
    <div class="auth-chip">
      <span>${escapeHtml(currentUser.email)}</span>
      <button type="button" data-auth-action="signout">Sign out</button>
    </div>
  `;
}

document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-auth-action]")?.dataset.authAction;
  if (!action) return;

  if (action === "signin") await signInWithGoogle();
  if (action === "signout") await signOut();
});

async function signInWithGoogle() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href.split("#")[0] }
  });
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
      configNotice.textContent = "Supabase could not load posts. Check tables, policies, and Google Auth setup.";
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
  const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, file);
  if (error) throw error;

  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

if (createPostButton) {
  createPostButton.addEventListener("click", async (event) => {
    if (supabaseClient && !currentUser) {
      event.preventDefault();
      event.stopPropagation();
      await signInWithGoogle();
    }
  });
}

if (postForm) {
  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (supabaseClient && !currentUser) {
      await signInWithGoogle();
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
      await signInWithGoogle();
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
    await signInWithGoogle();
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
    await signInWithGoogle();
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
        <p>Use Google to see your posts, engagement, and admin access status.</p>
        <button class="btn btn-torch" type="button" data-auth-action="signin">Sign in with Google</button>
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
    container.innerHTML = '<div class="dashboard-card"><h3>Admin Access</h3><p>Your admin access is approved.</p><a class="btn btn-torch" href="admin.html">Open Admin Dashboard</a></div>';
    return;
  }

  if (latest?.status === "pending") {
    container.innerHTML = '<div class="dashboard-card"><h3>Admin Access</h3><p>Your request is pending owner approval.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="dashboard-card">
      <h3>Admin Access</h3>
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
        <h2>Admin sign in required</h2>
        <p>Use Google to continue to the Torch Africa dashboard.</p>
        <button class="btn btn-torch" type="button" data-auth-action="signin">Sign in with Google</button>
      </div>
    `;
    content.classList.add("d-none");
    return;
  }

  if (!isApprovedAdmin()) {
    gate.innerHTML = `
      <div class="dashboard-card">
        <h2>Admin access pending</h2>
        <p>${escapeHtml(currentUser.email)} is signed in but not approved as an admin.</p>
        <button class="btn btn-outline-dark" type="button" id="requestAdminButton">Request Admin Access</button>
      </div>
    `;
    document.getElementById("requestAdminButton")?.addEventListener("click", requestAdminAccess);
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
      <h3>Admin Requests</h3>
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
