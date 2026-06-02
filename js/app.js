const SUPABASE_URL = "https://bphqkifxlfsnecovxqkr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaHFraWZ4bGZzbmVjb3Z4cWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODM0MTksImV4cCI6MjA5NTI1OTQxOX0.p_uT2TpHN3kbJUhy4vBkteAk7M8BZGdaFYyQPqJXMds";
const POSTS_TABLE = "posts";
const COMMENTS_TABLE = "comments";
const ADMINS_TABLE = "admins";
const ADMIN_REQUESTS_TABLE = "admin_requests";
const GALLERY_TABLE = "gallery_items";
const SITE_SETTINGS_TABLE = "site_settings";
const PROGRAMS_TABLE = "programs";
const STORAGE_BUCKET = "post-uploads";
const OWNER_EMAIL = "ebarasa203@gmail.com";
const TORCH_ADMIN_EMAIL = "torchafrica@gmail.com";
const APP_PUBLIC_URL = "https://torchafrica.vercel.app";
const IMAGE_MAX_WIDTH = 1200;
const IMAGE_MAX_HEIGHT = 1200;
const IMAGE_QUALITY = 0.72;

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
let passwordResetModalOpen = false;
let passwordRecoverySessionActive = false;
let postViewObserver = null;
const viewedPostTimers = new Map();

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

function getPasswordResetRedirectUrl() {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const url = new URL(isLocalhost ? APP_PUBLIC_URL : getAuthRedirectUrl());
  url.searchParams.set("reset-password", "1");
  return url.toString();
}

function hasPasswordResetIntent() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return searchParams.has("reset-password") || hashParams.get("type") === "recovery";
}

function cleanPasswordResetUrl() {
  if (!hasPasswordResetIntent()) return;
  window.history.replaceState({}, document.title, getAuthRedirectUrl());
}

function showLoginAfterModalClose(modalElement, modal) {
  modalElement.addEventListener("hidden.bs.modal", () => {
    showLoginModal();
  }, { once: true });
  modal.hide();
}

const feed = document.getElementById("feed");
const postForm = document.getElementById("postForm");
const configNotice = document.getElementById("configNotice");
const authSlot = document.getElementById("authSlot");
const createPostButton = document.getElementById("createPostButton");
const galleryForm = document.getElementById("galleryForm");
const galleryCarousel = document.getElementById("galleryCarousel");
const galleryList = document.getElementById("galleryList");
const galleryEmpty = document.getElementById("galleryEmpty");
const galleryManager = document.getElementById("galleryManager");
const galleryFeedback = document.getElementById("galleryFeedback");
const galleryPreviewStrip = document.getElementById("galleryPreviewStrip");
const galleryAddTile = document.getElementById("galleryAddTile");
const year = document.getElementById("year");
const contactForm = document.getElementById("contactForm");
const trendingPanel = document.getElementById("trendingPanel");
const programCards = document.getElementById("programCards");
const siteSettingsForm = document.getElementById("siteSettingsForm");
const contactSettingsForm = document.getElementById("contactSettingsForm");
const programForm = document.getElementById("programForm");
const programList = document.getElementById("programList");
const clearProgramButton = document.getElementById("clearProgramButton");
if (year) year.textContent = new Date().getFullYear();
let selectedGalleryFiles = [];

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

    const encodedMessage = encodeURIComponent(whatsappMessage);
    const phone = siteSettings.whatsapp_phone || defaultSiteSettings.whatsapp_phone;
    const webUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    const appUrl = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
    const feedback = document.getElementById("contactFeedback");

    window.location.href = appUrl;
    setTimeout(() => window.open(webUrl, "_blank", "noopener"), 700);
    if (feedback) feedback.textContent = "Message prepared in WhatsApp. Tap send there to share it.";
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

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    if (event === "PASSWORD_RECOVERY") {
      passwordRecoverySessionActive = true;
      if (!passwordResetModalOpen) {
        showPasswordResetModal(currentUser?.email || "", { recoveryLinkMode: true });
      }
    }
    await syncSignedInUser();
    await loadAdminStatus();
    renderAuthSlot();
    if (feed) await loadPosts();
    if (document.body.dataset.page !== "admin" && document.body.dataset.page !== "gallery") await loadSiteContent();
    if (document.body.dataset.page === "studio") await loadStudio();
    if (document.body.dataset.page === "admin") await loadAdminDashboard();
    if (document.body.dataset.page === "gallery") await loadGallery();
  });
}

async function refreshAuthenticatedViews() {
  await syncSignedInUser();
  await loadAdminStatus();
  renderAuthSlot();
  if (feed) await loadPosts();
  if (document.body.dataset.page !== "admin" && document.body.dataset.page !== "gallery") await loadSiteContent();
  if (document.body.dataset.page === "studio") await loadStudio();
  if (document.body.dataset.page === "admin") await loadAdminDashboard();
  if (document.body.dataset.page === "gallery") await loadGallery();
}

function promptForAuth(nextAction) {
  afterAuthSuccess = nextAction || null;
  showLoginModal();
}

async function ensureCurrentSession() {
  if (!supabaseClient) return currentUser;
  if (currentUser) return currentUser;

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) {
    await syncSignedInUser();
    await loadAdminStatus();
    renderAuthSlot();
  }
  return currentUser;
}

function getUserDisplayName(user = currentUser) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "";
}

function preparePostFormDefaults() {
  const authorInput = document.getElementById("postAuthor");
  if (authorInput && currentUser && !authorInput.value.trim()) {
    authorInput.value = getUserDisplayName();
  }
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
    full_name: getUserDisplayName(),
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
  return Boolean(currentUser && isApprovedAdmin());
}

function canManageComment(comment) {
  return Boolean(currentUser && isApprovedAdmin());
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

  const profileImage = currentUser.user_metadata?.avatar_url
    ? `<img src="${escapeHtml(currentUser.user_metadata.avatar_url)}" alt="">`
    : `<span>${escapeHtml(getInitials(getUserDisplayName()))}</span>`;
  authSlot.innerHTML = `
    <div class="dropdown profile-menu">
      <button class="profile-button" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Open profile menu" title="Profile">
        ${profileImage}
      </button>
      <div class="dropdown-menu dropdown-menu-end profile-dropdown">
        <div class="profile-summary">
          <strong>${escapeHtml(getUserDisplayName() || "Torch Africa Member")}</strong>
          <span>${escapeHtml(currentUser.email)}</span>
          ${isOwner() ? '<em>Owner</em>' : isApprovedAdmin() ? '<em>Admin</em>' : '<em>Member</em>'}
        </div>
        ${isApprovedAdmin() ? '<a class="dropdown-item" href="admin.html">Admin Dashboard</a>' : ''}
        <button class="dropdown-item" type="button" data-auth-action="signout">Sign out</button>
      </div>
    </div>
  `;
}

function getInitials(value) {
  const parts = String(value || "TA").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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
              <button class="link-button mt-2" type="button" id="forgotPasswordButton">Forgot password?</button>
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
  const forgotPasswordButton = document.getElementById("forgotPasswordButton");

  forgotPasswordButton?.addEventListener("click", () => {
    const email = document.getElementById("loginEmail").value.trim();
    modal.hide();
    showPasswordResetModal(email);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Logging in...";
    messageDiv.innerHTML = "";

    try {
      const { data, error } = await withTimeout(
        supabaseClient.auth.signInWithPassword({
          email,
          password
        }),
        "Login timed out. Please check your connection and try again."
      );

      if (error) throw error;

      currentUser = data.session?.user || null;
      if (!currentUser) {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        currentUser = sessionData.session?.user || null;
      }
      if (!currentUser) throw new Error("Login did not create a session. Check Supabase email confirmation settings for this user.");

      await finishAuthFlow(modal, messageDiv, "Login successful. You are signed in on this device.");
    } catch (error) {
      console.error(error);
      const hint = /confirm|verified|session/i.test(error.message || "")
        ? " If email confirmation is enabled in Supabase, confirm this email or turn off Confirm email for password logins."
        : "";
      messageDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}${hint}</div>`;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Log In";
    }
  });

  modal.show();
}


async function showPasswordResetModal(prefilledEmail = "", options = {}) {
  if (!supabaseClient) return;

  passwordResetModalOpen = true;
  const recoveryLinkMode = Boolean(options.recoveryLinkMode || passwordRecoverySessionActive);
  const otpFieldHtml = recoveryLinkMode ? "" : `
              <button class="btn btn-outline-dark w-100 mt-3" type="button" id="sendResetOtpButton">Send 6-Digit OTP</button>
              <label class="form-label mt-3" for="resetOtp">Email OTP</label>
              <input class="form-control" id="resetOtp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Enter 6-digit code" required>`;
  const introMessage = recoveryLinkMode
    ? '<div class="alert alert-info">Your reset link is verified. Enter a new password below.</div>'
    : "";

  const modalHtml = `
    <div class="modal fade" id="passwordResetModal" tabindex="-1" aria-labelledby="passwordResetLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="passwordResetLabel">Reset Password</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="passwordResetForm">
            <div class="modal-body">
              <label class="form-label" for="resetEmail">Email address</label>
              <input class="form-control" id="resetEmail" type="email" placeholder="you@example.com" value="${escapeHtml(prefilledEmail)}" ${recoveryLinkMode ? "readonly" : "required"}>
              ${otpFieldHtml}
              <label class="form-label mt-3" for="resetPassword">New password</label>
              <input class="form-control" id="resetPassword" type="password" placeholder="Create a new password" required>
              <label class="form-label mt-3" for="resetPasswordConfirm">Confirm new password</label>
              <input class="form-control" id="resetPasswordConfirm" type="password" placeholder="Confirm new password" required>
              <div id="resetMessage" class="mt-3">${introMessage}</div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-torch">Set New Password</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById("passwordResetModal");
  if (existing) existing.remove();

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modalElement = document.getElementById("passwordResetModal");
  const modal = new bootstrap.Modal(modalElement);
  const form = document.getElementById("passwordResetForm");
  const messageDiv = document.getElementById("resetMessage");
  const sendOtpButton = document.getElementById("sendResetOtpButton");
  const resetOtpInput = document.getElementById("resetOtp");

  modalElement.addEventListener("hidden.bs.modal", () => {
    passwordResetModalOpen = false;
    cleanPasswordResetUrl();
  }, { once: true });

  resetOtpInput?.addEventListener("input", () => {
    resetOtpInput.value = resetOtpInput.value.replace(/\D/g, "").slice(0, 6);
  });

  sendOtpButton?.addEventListener("click", async () => {
    const email = document.getElementById("resetEmail").value.trim();
    if (!email) {
      messageDiv.innerHTML = '<div class="alert alert-danger">Enter your email first.</div>';
      return;
    }

    sendOtpButton.disabled = true;
    sendOtpButton.textContent = "Sending OTP...";
    messageDiv.innerHTML = "";

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordResetRedirectUrl()
      });
      if (error) throw error;
      messageDiv.innerHTML = '<div class="alert alert-success">A 6-digit OTP has been sent. Check your email, then enter it below.</div>';
    } catch (error) {
      console.error(error);
      messageDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    } finally {
      sendOtpButton.disabled = false;
      sendOtpButton.textContent = "Send 6-Digit OTP";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("resetEmail").value.trim();
    const token = document.getElementById("resetOtp")?.value.trim() || "";
    const password = document.getElementById("resetPassword").value;
    const passwordConfirm = document.getElementById("resetPasswordConfirm").value;

    if (!recoveryLinkMode && !/^\d{6}$/.test(token)) {
      messageDiv.innerHTML = '<div class="alert alert-danger">Enter the 6-digit OTP from your email.</div>';
      return;
    }

    if (password !== passwordConfirm) {
      messageDiv.innerHTML = '<div class="alert alert-danger">Passwords do not match.</div>';
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Updating...";
    messageDiv.innerHTML = "";

    try {
      if (!recoveryLinkMode) {
        const { error: verifyError } = await withTimeout(
          supabaseClient.auth.verifyOtp({
            email,
            token,
            type: "recovery"
          }),
          "OTP verification took too long. Please request a fresh code and try again."
        );
        if (verifyError) throw verifyError;
      }

      const { error: updateError } = await withTimeout(
        supabaseClient.auth.updateUser({ password }),
        "Password update took too long. Please try again."
      );
      if (updateError) throw updateError;

      currentUser = null;
      passwordRecoverySessionActive = false;

      try {
        await withTimeout(supabaseClient.auth.signOut(), "Sign out took too long.", 8000);
        await withTimeout(refreshAuthenticatedViews(), "Page refresh took too long.", 8000);
      } catch (cleanupError) {
        console.warn(cleanupError);
      }

      messageDiv.innerHTML = '<div class="alert alert-success">Password updated. Opening login...</div>';
      setTimeout(() => {
        showLoginAfterModalClose(modalElement, modal);
      }, 1100);
    } catch (error) {
      console.error(error);
      messageDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Set New Password";
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
  renderTrendingPosts();
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
    clearPostViewObserver();
    feed.innerHTML = '<div class="post-card post-content">No posts yet. Create the first update.</div>';
    return;
  }

  feed.innerHTML = posts.map((post) => {
    const date = formatDate(post.created_at);
    const image = post.image_url ? `<img class="post-media" src="${escapeHtml(post.image_url)}" alt="${escapeHtml(post.title)}">` : "";
    const documentLink = post.document_url
      ? `<a class="document-link" href="${escapeHtml(post.document_url)}" target="_blank" rel="noopener">Open attached document</a>`
      : "<span></span>";

    return `
      <article class="post-card" data-post-id="${post.id}">
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
          <span class="post-read-time">${Number(post.views || 0)} views</span>
          ${documentLink}
        </div>
      </article>
    `;
  }).join("");
  observePostViews();
}

function isFeaturedPost(post) {
  if (!post.is_featured) return false;
  if (!post.featured_until) return true;
  return new Date(post.featured_until) > new Date();
}

function getTrendScore(post) {
  return Number(post.views || 0)
    + Number(post.likes || 0) * 3
    + Number(post.comments?.length || 0) * 4
    + Number(post.reposts || 0) * 5;
}

function getTrendingPosts() {
  const featured = posts
    .filter(isFeaturedPost)
    .sort((a, b) => Number(a.featured_rank || 999) - Number(b.featured_rank || 999));
  const featuredIds = new Set(featured.map((post) => String(post.id)));
  const automatic = posts
    .filter((post) => !featuredIds.has(String(post.id)))
    .sort((a, b) => getTrendScore(b) - getTrendScore(a));

  return [...featured, ...automatic].slice(0, 4);
}

function renderTrendingPosts() {
  if (!trendingPanel) return;

  const trendPosts = getTrendingPosts();
  if (!trendPosts.length) {
    trendingPanel.innerHTML = '<div class="trend-empty">Trending posts will appear here as the community engages.</div>';
    return;
  }

  const [lead, ...rest] = trendPosts;
  trendingPanel.innerHTML = `
    <article class="featured-trend">
      <span class="trend-label">${isFeaturedPost(lead) ? "Featured" : "Trending"}</span>
      <h4>${escapeHtml(lead.title)}</h4>
      <p>${escapeHtml(String(lead.body || "").slice(0, 150))}${String(lead.body || "").length > 150 ? "..." : ""}</p>
      <div class="trend-stats">
        <span>${Number(lead.likes || 0)} likes</span>
        <span>${Number(lead.comments?.length || 0)} comments</span>
        <span>${Number(lead.views || 0)} views</span>
      </div>
    </article>
    <div class="trend-list">
      ${rest.map((post, index) => `
        <a href="#blog" class="trend-item" data-jump-post="${post.id}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(post.title)}</strong>
        </a>
      `).join("")}
    </div>
  `;
}

const defaultSiteSettings = {
  hero_copy: "Defending constitutionalism, civic participation, and justice-centered governance through advocacy, legal analysis, and community action.",
  about_title: "Advocacy with a justice-first lens.",
  about_body: "Torch Africa is a civil justice platform focused on human rights, constitutional accountability, and public-interest advocacy. The organization brings together legal insight, civic education, documentation, and public engagement to support communities and institutions working toward a fairer society.",
  memo_title: "Memorandum on the Constitutional Amendment Bill, 2025",
  memo_body: "Access Torch Africa's memorandum as a downloadable PDF. This section can be updated with future legal briefs, public statements, and advocacy documents.",
  memo_url: "assets/torch-africa-memorandum-constitutional-amendment-bill-2025.pdf",
  contact_title: "Partner with Torch Africa on advocacy, documentation, and civic education.",
  contact_body: "Share partnership ideas, civic education requests, documentation leads, or community advocacy opportunities directly with the Torch Africa team.",
  contact_email: "torchafrica@gmail.com",
  contact_phone: "+254 720 369 518",
  contact_phone_href: "+254720369518",
  contact_location: "Bungoma",
  whatsapp_phone: "254733296064"
};

const defaultPrograms = [
  { icon: "HR", title: "Human Rights Monitoring", body: "Documenting emerging rights issues and amplifying community experiences with care and accuracy.", display_order: 1 },
  { icon: "CJ", title: "Civil Justice Advocacy", body: "Supporting fair processes, access to justice, and institutional accountability in public decision-making.", display_order: 2 },
  { icon: "CA", title: "Constitutional Analysis", body: "Preparing citizen-friendly briefs and memoranda on constitutional and legislative developments.", display_order: 3 },
  { icon: "CE", title: "Civic Engagement", body: "Creating spaces for people to learn, contribute, organize, and participate in public affairs.", display_order: 4 }
];

let siteSettings = { ...defaultSiteSettings };

async function loadSiteContent() {
  if (!programCards && !document.getElementById("aboutTitle") && !siteSettingsForm && !contactSettingsForm) return;

  let settings = { ...defaultSiteSettings };
  let programs = defaultPrograms;

  if (supabaseClient) {
    const { data: settingsData, error: settingsError } = await supabaseClient
      .from(SITE_SETTINGS_TABLE)
      .select("key,value");
    if (!settingsError && settingsData) {
      settingsData.forEach((item) => {
        settings[item.key] = item.value;
      });
    }

    const { data: programsData, error: programsError } = await supabaseClient
      .from(PROGRAMS_TABLE)
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (!programsError && programsData?.length) programs = programsData;
  }

  siteSettings = settings;
  renderSiteContent(settings, programs);
}

function setTextById(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderSiteContent(settings, programs) {
  setTextById("heroCopy", settings.hero_copy);
  setTextById("aboutTitle", settings.about_title);
  setTextById("aboutBody", settings.about_body);
  setTextById("memoTitle", settings.memo_title);
  setTextById("memoBody", settings.memo_body);
  setTextById("contactTitle", settings.contact_title);
  setTextById("contactBody", settings.contact_body);
  setTextById("footerLocation", `Location: ${settings.contact_location}`);

  const memoLink = document.getElementById("memoLink");
  const heroMemoLink = document.getElementById("heroMemoLink");
  [memoLink, heroMemoLink].forEach((link) => {
    if (link) link.href = settings.memo_url || defaultSiteSettings.memo_url;
  });

  const footerEmail = document.getElementById("footerEmail");
  if (footerEmail) {
    footerEmail.textContent = settings.contact_email;
    footerEmail.href = `mailto:${settings.contact_email}`;
  }

  const footerPhone = document.getElementById("footerPhone");
  if (footerPhone) {
    footerPhone.textContent = settings.contact_phone;
    footerPhone.href = `tel:${settings.contact_phone_href || settings.contact_phone}`;
  }

  if (programCards) {
    programCards.innerHTML = programs.map((program) => `
      <div class="col-md-6 col-xl-3">
        <article class="work-card">
          <div class="icon-circle">${escapeHtml(program.icon || "TA")}</div>
          <h3>${escapeHtml(program.title)}</h3>
          <p>${escapeHtml(program.body)}</p>
        </article>
      </div>
    `).join("");
  }
}

function clearPostViewObserver() {
  if (postViewObserver) postViewObserver.disconnect();
  viewedPostTimers.forEach((timerId) => clearTimeout(timerId));
  viewedPostTimers.clear();
}

function observePostViews() {
  if (!feed || !("IntersectionObserver" in window)) return;

  clearPostViewObserver();

  postViewObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const postId = entry.target.dataset.postId;
      if (!postId || hasCountedPostView(postId)) return;

      if (entry.isIntersecting) {
        if (viewedPostTimers.has(postId)) return;
        const timerId = setTimeout(() => markPostViewed(postId), 1200);
        viewedPostTimers.set(postId, timerId);
        return;
      }

      const timerId = viewedPostTimers.get(postId);
      if (timerId) clearTimeout(timerId);
      viewedPostTimers.delete(postId);
    });
  }, { threshold: 0.5 });

  feed.querySelectorAll("[data-post-id]").forEach((postElement) => postViewObserver.observe(postElement));
}

function hasCountedPostView(postId) {
  return sessionStorage.getItem(`torchAfricaViewedPost:${postId}`) === "1";
}

async function markPostViewed(postId) {
  viewedPostTimers.delete(postId);
  if (hasCountedPostView(postId)) return;
  sessionStorage.setItem(`torchAfricaViewedPost:${postId}`, "1");
  await incrementPostCounter(postId, "views", { silent: true });
}

async function uploadFile(file, folder) {
  if (!file) return "";

  const uploadableFile = await prepareUploadFile(file);

  if (!supabaseClient) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(uploadableFile);
    });
  }

  const safeName = uploadableFile.name.replace(/[^a-z0-9.\-_]/gi, "-").toLowerCase();
  const userFolder = currentUser?.id || "public";
  const path = `${folder}/${userFolder}/${Date.now()}-${safeName}`;
  const { error } = await withTimeout(
    supabaseClient.storage.from(STORAGE_BUCKET).upload(path, uploadableFile, {
      cacheControl: "3600",
      contentType: uploadableFile.type || file.type
    }),
    "Upload timed out. Check the post-uploads bucket and Storage policies."
  );
  if (error) throw new Error(error.message || "Upload failed. Check the post-uploads bucket policies.");

  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function prepareUploadFile(file) {
  if (!file?.type?.startsWith("image/")) return file;

  try {
    return await crunchImageFile(file);
  } catch (error) {
    console.error(error);
    return file;
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected image could not be loaded."));
    };
    image.src = url;
  });
}

async function crunchImageFile(file) {
  const image = await loadImageFromFile(file);
  const scale = Math.min(1, IMAGE_MAX_WIDTH / image.naturalWidth, IMAGE_MAX_HEIGHT / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) resolve(nextBlob);
      else reject(new Error("Image compression failed."));
    }, "image/jpeg", IMAGE_QUALITY);
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

if (createPostButton) {
  createPostButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (supabaseClient && !await ensureCurrentSession()) {
      promptForAuth(() => bootstrap.Modal.getOrCreateInstance(document.getElementById("postModal")).show());
      return;
    }
    if (supabaseClient && !isApprovedAdmin()) {
      alert("Only approved admins can publish posts.");
      return;
    }

    preparePostFormDefaults();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("postModal")).show();
  });
}

if (postForm) {
  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (supabaseClient && !await ensureCurrentSession()) {
      promptForAuth(() => bootstrap.Modal.getOrCreateInstance(document.getElementById("postModal")).show());
      return;
    }
    if (supabaseClient && !isApprovedAdmin()) {
      alert("Only approved admins can publish posts.");
      return;
    }

    const submitButton = postForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Publishing...";

    try {
      const imageUrl = await uploadFile(document.getElementById("postImage").files[0], "images");
      const documentUrl = await uploadFile(document.getElementById("postDocument").files[0], "documents");
      const displayName = document.getElementById("postAuthor").value.trim()
        || getUserDisplayName()
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

document.getElementById("postModal")?.addEventListener("shown.bs.modal", preparePostFormDefaults);

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

    const editPost = event.target.closest("[data-edit-post]");
    if (editPost) {
      showPostEditor(editPost.dataset.editPost);
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

  trendingPanel?.addEventListener("click", (event) => {
    const jumpPost = event.target.closest("[data-jump-post]");
    if (!jumpPost) return;

    event.preventDefault();
    const safeId = CSS.escape(jumpPost.dataset.jumpPost);
    const postElement = document.querySelector(`[data-post-id="${safeId}"]`);
    postElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  feed.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-comment-form]");
    if (!form) return;

    event.preventDefault();

    if (supabaseClient && !await ensureCurrentSession()) {
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
      author: getUserDisplayName() || "Guest",
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

async function incrementPostCounter(postId, field, options = {}) {
  if (supabaseClient && field !== "views" && !await ensureCurrentSession()) {
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
      if (!options.silent) alert("That action could not be saved. Please check your Supabase policies.");
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
    const { error } = await withTimeout(
      supabaseClient.from(POSTS_TABLE).delete().eq("id", postId),
      "Delete timed out. Check the posts delete policy."
    );
    if (error) {
      console.error(error);
      alert(`Delete failed: ${error.message || "Only the post owner or an approved admin can delete it."}`);
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
    const { error } = await withTimeout(
      supabaseClient.from(COMMENTS_TABLE).delete().eq("id", commentId),
      "Comment delete timed out. Check the comments delete policy."
    );
    if (error) {
      console.error(error);
      alert(`Delete failed: ${error.message || "Only the comment owner or an approved admin can delete it."}`);
      return;
    }
    await loadPosts();
  } else {
    posts = posts.map((post) => ({ ...post, comments: (post.comments || []).filter((item) => String(item.id) !== String(commentId)) }));
    saveLocalPosts(posts);
    renderPosts();
  }
}

function showPostEditor(postId) {
  const post = posts.find((item) => String(item.id) === String(postId));
  if (!post || !canManagePost(post)) return;

  const existing = document.getElementById("editPostModal");
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal fade" id="editPostModal" tabindex="-1" aria-labelledby="editPostModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-5" id="editPostModalLabel">Edit Post</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="editPostForm" data-editing-post="${post.id}">
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label" for="editPostAuthor">Author</label>
                  <input class="form-control" id="editPostAuthor" type="text" required value="${escapeHtml(post.author || "")}">
                </div>
                <div class="col-md-6">
                  <label class="form-label" for="editPostCategory">Category</label>
                  <select class="form-select" id="editPostCategory">
                    ${["Advocacy", "Legal Brief", "Community", "News"].map((category) => `<option ${category === post.category ? "selected" : ""}>${category}</option>`).join("")}
                  </select>
                </div>
                <div class="col-12">
                  <label class="form-label" for="editPostTitle">Title</label>
                  <input class="form-control" id="editPostTitle" type="text" required value="${escapeHtml(post.title || "")}">
                </div>
                <div class="col-12">
                  <label class="form-label" for="editPostBody">Post</label>
                  <textarea class="form-control" id="editPostBody" rows="5" required>${escapeHtml(post.body || "")}</textarea>
                </div>
                <div class="col-md-6">
                  <label class="form-label" for="editPostImage">Replace photo</label>
                  <input class="form-control" id="editPostImage" type="file" accept="image/*">
                </div>
                <div class="col-md-6">
                  <label class="form-label" for="editPostDocument">Replace document</label>
                  <input class="form-control" id="editPostDocument" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx">
                </div>
                <div class="col-12">
                  <div id="editPostMessage" class="mt-1"></div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-torch">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  bootstrap.Modal.getOrCreateInstance(document.getElementById("editPostModal")).show();
}

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("#editPostForm");
  if (!form) return;

  event.preventDefault();
  const postId = form.dataset.editingPost;
  const post = posts.find((item) => String(item.id) === String(postId));
  if (!post || !canManagePost(post)) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const messageDiv = document.getElementById("editPostMessage");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  if (messageDiv) messageDiv.innerHTML = "";

  try {
    const imageFile = document.getElementById("editPostImage").files[0];
    const documentFile = document.getElementById("editPostDocument").files[0];
    const updates = {
      author: document.getElementById("editPostAuthor").value.trim(),
      category: document.getElementById("editPostCategory").value,
      title: document.getElementById("editPostTitle").value.trim(),
      body: document.getElementById("editPostBody").value.trim(),
      image_url: imageFile ? await uploadFile(imageFile, "images") : post.image_url,
      document_url: documentFile ? await uploadFile(documentFile, "documents") : post.document_url
    };

    if (supabaseClient) {
      const { error } = await withTimeout(
        supabaseClient.from(POSTS_TABLE).update(updates).eq("id", postId),
        "Saving timed out. Check the posts update policy."
      );
      if (error) throw error;
      await loadPosts();
    } else {
      posts = posts.map((item) => String(item.id) === String(postId) ? { ...item, ...updates } : item);
      saveLocalPosts(posts);
      renderPosts();
    }

    if (document.body.dataset.page === "studio") await loadStudio();
    if (document.body.dataset.page === "admin") await loadAdminDashboard();
    bootstrap.Modal.getInstance(document.getElementById("editPostModal")).hide();
  } catch (error) {
    console.error(error);
    if (messageDiv) messageDiv.innerHTML = `<div class="alert alert-danger">Save failed: ${error.message || "Please check Supabase policies."}</div>`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save Changes";
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("#profileSettingsForm");
  if (!form) return;

  event.preventDefault();
  if (!await ensureCurrentSession()) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const messageDiv = document.getElementById("profileSettingsMessage");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  if (messageDiv) messageDiv.innerHTML = "";

  try {
    const fullName = document.getElementById("profileNameInput").value.trim();
    const avatarFile = document.getElementById("profileAvatarInput").files[0];
    const avatarUrl = avatarFile ? await uploadFile(avatarFile, "avatars") : currentUser.user_metadata?.avatar_url || "";

    const { data, error } = await withTimeout(
      supabaseClient.auth.updateUser({
        data: {
          full_name: fullName,
          name: fullName,
          avatar_url: avatarUrl
        }
      }),
      "Profile update timed out. Please try again."
    );
    if (error) throw error;

    currentUser = data.user || currentUser;
    await syncSignedInUser();
    await refreshAuthenticatedViews();
    if (messageDiv) messageDiv.innerHTML = '<div class="alert alert-success">Profile updated.</div>';
  } catch (error) {
    console.error(error);
    if (messageDiv) messageDiv.innerHTML = `<div class="alert alert-danger">Profile could not be saved: ${error.message || "Please try again."}</div>`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save Profile";
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("#profilePasswordForm");
  if (!form) return;

  event.preventDefault();
  if (!await ensureCurrentSession()) return;

  const password = document.getElementById("profileNewPassword").value;
  const confirmPassword = document.getElementById("profileConfirmPassword").value;
  const submitButton = form.querySelector('button[type="submit"]');
  const messageDiv = document.getElementById("profilePasswordMessage");

  if (password !== confirmPassword) {
    if (messageDiv) messageDiv.innerHTML = '<div class="alert alert-danger">Passwords do not match.</div>';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Updating...";
  if (messageDiv) messageDiv.innerHTML = "";

  try {
    const { error } = await withTimeout(
      supabaseClient.auth.updateUser({ password }),
      "Password update timed out. Please try again."
    );
    if (error) throw error;

    form.reset();
    if (messageDiv) messageDiv.innerHTML = '<div class="alert alert-success">Password updated for your account.</div>';
  } catch (error) {
    console.error(error);
    if (messageDiv) messageDiv.innerHTML = `<div class="alert alert-danger">Password could not be updated: ${error.message || "Please try again."}</div>`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Update Password";
  }
});

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
  const signedInUser = await ensureCurrentSession();
  if (!gate || !content || !stats || !myPosts) return;

  if (!supabaseClient || !signedInUser) {
    gate.innerHTML = `
      <div class="dashboard-card">
        <h2>Sign in to view your dashboard</h2>
        <p>Log in to see your posts, engagement, profile, and admin access status.</p>
        <div class="btn-group" role="group">
          <button class="btn btn-torch" type="button" data-auth-action="login">Log In</button>
          <button class="btn btn-outline-dark" type="button" data-auth-action="signup">Sign Up</button>
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

  if (requestStatus) {
    requestStatus.innerHTML = renderProfileSettings();
    await renderAdminRequestStatus(requestStatus, { append: true });
  }
}

function renderProfileSettings() {
  const avatarUrl = currentUser?.user_metadata?.avatar_url || "";
  return `
    <div class="dashboard-card">
      <h3>Profile</h3>
      <form id="profileSettingsForm" class="compact-form">
        <div class="profile-edit-preview">
          ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="">` : `<span>${escapeHtml(getInitials(getUserDisplayName()))}</span>`}
        </div>
        <label class="form-label" for="profileNameInput">Username</label>
        <input class="form-control" id="profileNameInput" type="text" value="${escapeHtml(getUserDisplayName())}" required>
        <label class="form-label mt-2" for="profileAvatarInput">Profile picture</label>
        <input class="form-control" id="profileAvatarInput" type="file" accept="image/*">
        <button class="btn btn-torch w-100 mt-3" type="submit">Save Profile</button>
        <div id="profileSettingsMessage" class="mt-3"></div>
      </form>
    </div>
    <div class="dashboard-card mt-4">
      <h3>Change Password</h3>
      <form id="profilePasswordForm" class="compact-form">
        <label class="form-label" for="profileNewPassword">New password</label>
        <input class="form-control" id="profileNewPassword" type="password" minlength="6" required>
        <label class="form-label mt-2" for="profileConfirmPassword">Confirm new password</label>
        <input class="form-control" id="profileConfirmPassword" type="password" minlength="6" required>
        <button class="btn btn-outline-dark w-100 mt-3" type="submit">Update Password</button>
        <div id="profilePasswordMessage" class="mt-3"></div>
      </form>
    </div>
  `;
}

async function renderAdminRequestStatus(container, options = {}) {
  const { data } = await supabaseClient
    .from(ADMIN_REQUESTS_TABLE)
    .select("*")
    .eq("email", currentUser.email)
    .order("created_at", { ascending: false });

  const latest = data?.[0];
  const render = (html) => {
    if (options.append) {
      container.insertAdjacentHTML("beforeend", html);
      return;
    }
    container.innerHTML = html;
  };

  if (isApprovedAdmin()) {
    render('<div class="dashboard-card mt-4"><h3>Admin Access</h3><p>Your admin access is approved!</p><a class="btn btn-torch" href="admin.html">Open Admin Dashboard</a></div>');
    return;
  }

  if (latest?.status === "pending") {
    render('<div class="dashboard-card mt-4"><h3>Admin Access</h3><p>Your request is pending owner approval.</p></div>');
    return;
  }

  render(`
    <div class="dashboard-card mt-4">
      <h3>Request Admin Access</h3>
      <p>Need to help manage official Torch Africa content? Request owner approval.</p>
      <button class="btn btn-outline-dark" type="button" id="requestAdminButton">Request Admin Access</button>
    </div>
  `);
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
        <h2>Admin Access Denied</h2>
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
  await loadAdminCms();
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

  const pendingRequests = error ? [] : (data || []);

  container.innerHTML = `
    <div class="dashboard-card">
      <h3>Add Admin</h3>
      <form id="addAdminForm" class="compact-form">
        <label class="form-label" for="adminEmailInput">Email</label>
        <input class="form-control" id="adminEmailInput" type="email" placeholder="admin@example.com" required>
        <label class="form-label mt-2" for="adminNameInput">Name</label>
        <input class="form-control" id="adminNameInput" type="text" placeholder="Full name">
        <button class="btn btn-torch w-100 mt-3" type="submit">Add Admin</button>
        <div id="addAdminMessage" class="mt-3"></div>
      </form>
    </div>
    <div class="dashboard-card mt-4">
      <h3>Admin Access Requests</h3>
      ${pendingRequests.length ? '<div class="request-list">' : '<p>No pending requests.</p><div class="request-list d-none">'}
        ${pendingRequests.map((request) => `
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

document.addEventListener("submit", async (event) => {
  const siteForm = event.target.closest("#siteSettingsForm");
  if (siteForm) {
    event.preventDefault();
    await saveSettings({
      hero_copy: document.getElementById("settingHeroCopy").value.trim(),
      about_title: document.getElementById("settingAboutTitle").value.trim(),
      about_body: document.getElementById("settingAboutBody").value.trim(),
      memo_title: document.getElementById("settingMemoTitle").value.trim(),
      memo_body: document.getElementById("settingMemoBody").value.trim(),
      memo_url: document.getElementById("settingMemoUrl").value.trim()
    }, "siteSettingsMessage");
    return;
  }

  const contactFormSettings = event.target.closest("#contactSettingsForm");
  if (contactFormSettings) {
    event.preventDefault();
    await saveSettings({
      contact_title: document.getElementById("settingContactTitle").value.trim(),
      contact_body: document.getElementById("settingContactBody").value.trim(),
      contact_email: document.getElementById("settingContactEmail").value.trim(),
      contact_phone: document.getElementById("settingContactPhone").value.trim(),
      contact_phone_href: document.getElementById("settingContactPhoneHref").value.trim(),
      whatsapp_phone: document.getElementById("settingWhatsappPhone").value.trim(),
      contact_location: document.getElementById("settingContactLocation").value.trim()
    }, "contactSettingsMessage");
    return;
  }

  const programSettingsForm = event.target.closest("#programForm");
  if (programSettingsForm) {
    event.preventDefault();
    if (!supabaseClient || !isApprovedAdmin()) return;

    const id = document.getElementById("programId").value;
    const payload = {
      icon: document.getElementById("programIcon").value.trim(),
      title: document.getElementById("programTitle").value.trim(),
      body: document.getElementById("programBody").value.trim(),
      display_order: Number(document.getElementById("programOrder").value || 1),
      is_active: true
    };
    const messageDiv = document.getElementById("programMessage");
    if (messageDiv) messageDiv.innerHTML = "";

    const query = id
      ? supabaseClient.from(PROGRAMS_TABLE).update(payload).eq("id", id)
      : supabaseClient.from(PROGRAMS_TABLE).insert(payload);
    const { error } = await withTimeout(query, "Saving program timed out. Check the programs table policies.");
    if (error) {
      console.error(error);
      if (messageDiv) messageDiv.innerHTML = `<div class="alert alert-danger">Could not save program: ${error.message || "Check Supabase policies."}</div>`;
      return;
    }

    if (messageDiv) messageDiv.innerHTML = '<div class="alert alert-success">Program saved.</div>';
    resetProgramForm();
    await loadAdminPrograms();
    await loadSiteContent();
    return;
  }

  const form = event.target.closest("#addAdminForm");
  if (!form) return;

  event.preventDefault();
  if (!isOwner()) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const messageDiv = document.getElementById("addAdminMessage");
  const email = document.getElementById("adminEmailInput").value.trim().toLowerCase();
  const fullName = document.getElementById("adminNameInput").value.trim();

  submitButton.disabled = true;
  submitButton.textContent = "Adding...";
  if (messageDiv) messageDiv.innerHTML = "";

  try {
    const { error } = await withTimeout(
      supabaseClient.from(ADMINS_TABLE).upsert({
        email,
        full_name: fullName || email,
        role: "admin",
        status: "approved",
        approved_by: currentUser.email,
        approved_at: new Date().toISOString()
      }),
      "Adding admin timed out. Check the admins table owner policy."
    );
    if (error) throw error;

    form.reset();
    if (messageDiv) messageDiv.innerHTML = '<div class="alert alert-success">Admin added. They can log in and open the admin dashboard.</div>';
  } catch (error) {
    console.error(error);
    if (messageDiv) messageDiv.innerHTML = `<div class="alert alert-danger">Admin could not be added: ${error.message || "Check Supabase policies."}</div>`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Add Admin";
  }
});

document.addEventListener("click", async (event) => {
  const clearProgram = event.target.closest("#clearProgramButton");
  if (clearProgram) {
    event.preventDefault();
    resetProgramForm();
    return;
  }

  const editProgramId = event.target.closest("[data-edit-program]")?.dataset.editProgram;
  if (editProgramId) {
    event.preventDefault();
    if (!supabaseClient || !isApprovedAdmin()) return;
    const { data, error } = await supabaseClient.from(PROGRAMS_TABLE).select("*").eq("id", editProgramId).maybeSingle();
    if (error || !data) return;
    document.getElementById("programId").value = data.id;
    document.getElementById("programIcon").value = data.icon || "";
    document.getElementById("programTitle").value = data.title || "";
    document.getElementById("programBody").value = data.body || "";
    document.getElementById("programOrder").value = data.display_order || 1;
    programForm?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const deleteProgramId = event.target.closest("[data-delete-program]")?.dataset.deleteProgram;
  if (deleteProgramId) {
    event.preventDefault();
    if (!supabaseClient || !isApprovedAdmin() || !confirm("Remove this program card?")) return;
    const { error } = await supabaseClient.from(PROGRAMS_TABLE).delete().eq("id", deleteProgramId);
    if (error) {
      console.error(error);
      alert(`Program could not be removed: ${error.message || "Check Supabase policies."}`);
      return;
    }
    await loadAdminPrograms();
    await loadSiteContent();
    return;
  }

  const approveId = event.target.closest("[data-approve-admin]")?.dataset.approveAdmin;
  if (approveId) {
    await decideAdminRequest(approveId, "approved");
    return;
  }

  const rejectId = event.target.closest("[data-reject-admin]")?.dataset.rejectAdmin;
  if (rejectId) {
    await decideAdminRequest(rejectId, "rejected");
    return;
  }

  const dashboardEdit = event.target.closest("[data-dashboard-edit]")?.dataset.dashboardEdit;
  if (dashboardEdit) {
    showPostEditor(dashboardEdit);
    return;
  }

  const dashboardDelete = event.target.closest("[data-dashboard-delete]")?.dataset.dashboardDelete;
  if (dashboardDelete) {
    await deletePostById(dashboardDelete);
    if (document.body.dataset.page === "admin") await loadAdminDashboard();
    if (document.body.dataset.page === "studio") await loadStudio();
    return;
  }

  const dashboardFeature = event.target.closest("[data-dashboard-feature]")?.dataset.dashboardFeature;
  if (dashboardFeature) {
    await toggleFeaturedPost(dashboardFeature);
    return;
  }
});

async function toggleFeaturedPost(postId) {
  if (!supabaseClient || !isApprovedAdmin()) return;

  const post = posts.find((item) => String(item.id) === String(postId));
  if (!post) return;

  const nextFeaturedState = !isFeaturedPost(post);
  const { error } = await withTimeout(
    supabaseClient
      .from(POSTS_TABLE)
      .update({
        is_featured: nextFeaturedState,
        featured_rank: nextFeaturedState ? 1 : null,
        featured_until: null
      })
      .eq("id", postId),
    "Feature update timed out. Check the posts update policy and featured columns."
  );

  if (error) {
    console.error(error);
    alert(`Could not update featured status: ${error.message || "Check Supabase settings."}`);
    return;
  }

  await loadAdminDashboard();
  if (feed) await loadPosts();
}

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

  const adminView = Boolean(options.ownerView);

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
          <span class="dashboard-actions">
            ${adminView ? `<button class="icon-action" type="button" data-dashboard-feature="${post.id}">${isFeaturedPost(post) ? "Unfeature" : "Feature"}</button>` : ""}
            <button class="icon-action" type="button" data-dashboard-edit="${post.id}">Edit</button>
            <button class="icon-action danger-link" type="button" data-dashboard-delete="${post.id}">Delete</button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

async function loadAdminCms() {
  if (!isApprovedAdmin()) return;

  await loadSiteContent();
  populateSettingsForms(siteSettings);
  await loadAdminPrograms();
}

function populateSettingsForms(settings) {
  const pairs = {
    settingHeroCopy: "hero_copy",
    settingAboutTitle: "about_title",
    settingAboutBody: "about_body",
    settingMemoTitle: "memo_title",
    settingMemoBody: "memo_body",
    settingMemoUrl: "memo_url",
    settingContactTitle: "contact_title",
    settingContactBody: "contact_body",
    settingContactEmail: "contact_email",
    settingContactPhone: "contact_phone",
    settingContactPhoneHref: "contact_phone_href",
    settingWhatsappPhone: "whatsapp_phone",
    settingContactLocation: "contact_location"
  };

  Object.entries(pairs).forEach(([inputId, key]) => {
    const input = document.getElementById(inputId);
    if (input) input.value = settings[key] || "";
  });
}

async function saveSettings(updates, messageId) {
  if (!supabaseClient || !isApprovedAdmin()) return;

  const rows = Object.entries(updates).map(([key, value]) => ({ key, value }));
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) messageDiv.innerHTML = "";

  const { error } = await withTimeout(
    supabaseClient.from(SITE_SETTINGS_TABLE).upsert(rows, { onConflict: "key" }),
    "Saving site settings timed out. Check the site_settings table policies."
  );

  if (error) {
    console.error(error);
    if (messageDiv) messageDiv.innerHTML = `<div class="alert alert-danger">Could not save: ${error.message || "Check Supabase policies."}</div>`;
    return;
  }

  if (messageDiv) messageDiv.innerHTML = '<div class="alert alert-success">Saved.</div>';
  await loadSiteContent();
}

async function loadAdminPrograms() {
  if (!programList || !supabaseClient) return;

  const { data, error } = await supabaseClient
    .from(PROGRAMS_TABLE)
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    console.error(error);
    programList.innerHTML = '<div class="dashboard-empty">Programs could not load. Check the programs table and policies.</div>';
    return;
  }

  programList.innerHTML = (data || []).map((program) => `
    <div class="cms-list-item">
      <div>
        <strong>${escapeHtml(program.icon || "TA")} - ${escapeHtml(program.title)}</strong>
        <p>${escapeHtml(program.body || "")}</p>
      </div>
      <div class="gallery-card-actions">
        <button class="btn btn-sm btn-outline-dark" type="button" data-edit-program="${program.id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger" type="button" data-delete-program="${program.id}">Remove</button>
      </div>
    </div>
  `).join("") || '<div class="dashboard-empty">No program cards yet.</div>';
}

function resetProgramForm() {
  if (!programForm) return;
  programForm.reset();
  document.getElementById("programId").value = "";
  document.getElementById("programOrder").value = "1";
}

async function loadGallery() {
  if (!galleryCarousel && !galleryList) return;

  if (!supabaseClient) {
    renderGallery([]);
    return;
  }

  const { data, error } = await supabaseClient
    .from(GALLERY_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    if (galleryEmpty) {
      galleryEmpty.textContent = "Gallery could not load. Check the gallery_items table and policies.";
      galleryEmpty.classList.remove("d-none");
    }
    renderGallery([]);
    return;
  }

  renderGallery(data || []);
}

function canManageGalleryItem(item) {
  return Boolean(currentUser && isApprovedAdmin());
}

function renderGallery(items) {
  const canManageGallery = isApprovedAdmin();
  if (galleryManager) galleryManager.classList.toggle("d-none", !canManageGallery);

  if (galleryEmpty) {
    galleryEmpty.textContent = items.length ? "" : "No gallery items yet. Add the first photo below.";
    galleryEmpty.classList.toggle("d-none", items.length > 0);
  }

  if (galleryCarousel) {
    galleryCarousel.innerHTML = items.length ? `
      <div class="carousel-inner">
        ${items.map((item, index) => `
          <div class="carousel-item ${index === 0 ? "active" : ""}">
            <img src="${escapeHtml(item.image_url)}" class="d-block w-100" alt="${escapeHtml(item.title || "Torch Africa gallery photo")}">
            <div class="carousel-caption">
              <h2>${escapeHtml(item.title || "Torch Africa Gallery")}</h2>
              <p>${escapeHtml(item.caption || "")}</p>
            </div>
          </div>
        `).join("")}
      </div>
      <button class="carousel-control-prev" type="button" data-bs-target="#galleryCarousel" data-bs-slide="prev">
        <span class="carousel-control-prev-icon" aria-hidden="true"></span>
        <span class="visually-hidden">Previous</span>
      </button>
      <button class="carousel-control-next" type="button" data-bs-target="#galleryCarousel" data-bs-slide="next">
        <span class="carousel-control-next-icon" aria-hidden="true"></span>
        <span class="visually-hidden">Next</span>
      </button>
    ` : "";
  }

  if (!galleryList) return;

  if (!canManageGallery) {
    galleryList.innerHTML = "";
    return;
  }

  if (!items.length) {
    galleryList.innerHTML = '<div class="dashboard-empty">No gallery photos found.</div>';
    return;
  }

  galleryList.innerHTML = items.map((item) => `
    <article class="gallery-editor-card">
      <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title || "Gallery photo")}">
      <div>
        <strong>${escapeHtml(item.title || "Gallery photo")}</strong>
        <p>${escapeHtml(item.caption || "")}</p>
      </div>
      ${canManageGalleryItem(item) ? `
        <div class="gallery-card-actions">
          <button class="btn btn-sm btn-outline-dark" type="button" data-edit-gallery="${item.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger" type="button" data-delete-gallery="${item.id}">Remove</button>
        </div>
      ` : ""}
    </article>
  `).join("");
}

function resetGalleryForm() {
  if (!galleryForm) return;
  galleryForm.reset();
  galleryForm.dataset.editingGallery = "";
  selectedGalleryFiles = [];
  renderGalleryPreview();
  const submitButton = galleryForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = "Add to Gallery";
}

function renderGalleryPreview() {
  if (!galleryPreviewStrip) return;

  galleryPreviewStrip.querySelectorAll(".gallery-preview-tile").forEach((tile) => tile.remove());
  selectedGalleryFiles.forEach((file, index) => {
    const tile = document.createElement("div");
    tile.className = "gallery-preview-tile";

    const image = document.createElement("img");
    image.alt = file.name || `Selected photo ${index + 1}`;
    image.src = URL.createObjectURL(file);
    image.onload = () => URL.revokeObjectURL(image.src);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "gallery-preview-remove";
    removeButton.setAttribute("aria-label", `Remove ${file.name || "photo"}`);
    removeButton.dataset.removePreview = String(index);
    removeButton.textContent = "x";

    tile.append(image, removeButton);
    galleryPreviewStrip.insertBefore(tile, galleryAddTile);
  });
}

async function editGalleryItem(itemId) {
  if (!supabaseClient || !currentUser || !isApprovedAdmin()) return;

  const { data, error } = await supabaseClient
    .from(GALLERY_TABLE)
    .select("*")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data || !canManageGalleryItem(data)) {
    alert("This gallery item could not be opened for editing.");
    return;
  }

  galleryForm.dataset.editingGallery = data.id;
  document.getElementById("galleryTitle").value = data.title || "";
  document.getElementById("galleryCaption").value = data.caption || "";
  selectedGalleryFiles = [];
  renderGalleryPreview();
  const submitButton = galleryForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = "Save Gallery Item";
  galleryForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteGalleryItem(itemId) {
  if (!supabaseClient || !currentUser || !isApprovedAdmin()) return;
  if (!confirm("Remove this gallery photo?")) return;

  const { error } = await withTimeout(
    supabaseClient.from(GALLERY_TABLE).delete().eq("id", itemId),
    "Gallery delete timed out. Check the gallery_items delete policy."
  );

  if (error) {
    console.error(error);
    alert(`Gallery item could not be removed: ${error.message || "Check Supabase policies."}`);
    return;
  }

  await loadGallery();
}

if (galleryForm) {
  galleryAddTile?.addEventListener("click", () => {
    document.getElementById("galleryImage")?.click();
  });

  document.getElementById("galleryImage")?.addEventListener("change", (event) => {
    const nextFiles = Array.from(event.target.files || []);
    selectedGalleryFiles = [...selectedGalleryFiles, ...nextFiles];
    event.target.value = "";
    renderGalleryPreview();
  });

  galleryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!await ensureCurrentSession()) {
      promptForAuth(() => galleryForm.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (!isApprovedAdmin()) {
      alert("Only approved admins can manage gallery photos.");
      return;
    }

    const submitButton = galleryForm.querySelector('button[type="submit"]');
    const editingId = galleryForm.dataset.editingGallery;
    const files = selectedGalleryFiles;
    const title = document.getElementById("galleryTitle").value.trim();
    const caption = document.getElementById("galleryCaption").value.trim();

    if (!editingId && !files.length) {
      alert("Choose at least one image for the gallery.");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = editingId ? "Saving..." : "Crunching photos...";
    if (galleryFeedback) galleryFeedback.textContent = files.length > 1 ? `Preparing ${files.length} photos...` : "Preparing photo...";

    try {
      if (editingId) {
        const updates = { title, caption };
        if (files[0]) updates.image_url = await uploadFile(files[0], "gallery");

        const { error } = await withTimeout(
          supabaseClient.from(GALLERY_TABLE).update(updates).eq("id", editingId),
          "Saving gallery item timed out. Check the gallery_items update policy."
        );
        if (error) throw error;
        if (galleryFeedback) galleryFeedback.textContent = "Gallery item saved.";
      } else {
        const rows = [];
        for (let index = 0; index < files.length; index += 1) {
          const imageUrl = await uploadFile(files[index], "gallery");
          rows.push({
            user_id: currentUser.id,
            author: getUserDisplayName() || currentUser.email || "Torch Africa",
            author_email: currentUser.email || "",
            title: files.length > 1 ? `${title} ${index + 1}` : title,
            caption,
            image_url: imageUrl,
            created_at: new Date().toISOString()
          });
        }

        const { error } = await withTimeout(
          supabaseClient.from(GALLERY_TABLE).insert(rows),
          "Adding gallery photos timed out. Check the gallery_items insert policy."
        );
        if (error) throw error;
        if (galleryFeedback) galleryFeedback.textContent = "Photos added to the carousel.";
      }

      resetGalleryForm();
      await loadGallery();
    } catch (error) {
      console.error(error);
      if (galleryFeedback) galleryFeedback.textContent = "";
      alert(`Gallery item could not be saved: ${error.message || "Check Supabase settings."}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = galleryForm.dataset.editingGallery ? "Save Gallery Item" : "Add to Gallery";
    }
  });
}

document.addEventListener("click", async (event) => {
  const removePreview = event.target.closest("[data-remove-preview]");
  if (removePreview) {
    event.preventDefault();
    selectedGalleryFiles.splice(Number(removePreview.dataset.removePreview), 1);
    renderGalleryPreview();
    return;
  }

  const editGallery = event.target.closest("[data-edit-gallery]");
  if (editGallery) {
    event.preventDefault();
    await editGalleryItem(editGallery.dataset.editGallery);
    return;
  }

  const deleteGallery = event.target.closest("[data-delete-gallery]");
  if (deleteGallery) {
    event.preventDefault();
    await deleteGalleryItem(deleteGallery.dataset.deleteGallery);
  }
});

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
  if (hasPasswordResetIntent() && !passwordResetModalOpen) {
    await showPasswordResetModal(currentUser?.email || "", { recoveryLinkMode: Boolean(currentUser) });
  }
  if (document.body.dataset.page !== "admin" && document.body.dataset.page !== "gallery") await loadSiteContent();
  if (feed) await loadPosts();
  if (document.body.dataset.page === "studio") await loadStudio();
  if (document.body.dataset.page === "admin") await loadAdminDashboard();
  if (document.body.dataset.page === "gallery") await loadGallery();
});
