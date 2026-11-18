/**
 * PUB Hub — authentication, profile loading/editing, role gating, and watermark.
 * Expected script order: Supabase CDN -> supabaseClient.js -> auth.js -> app.js.
 */
const STRICT_EDU_ONLY = false;

window.PubAuth = {
  user: null,
  profile: null,
  session: null,
  authReady: false,
  getSupabase() {
    return window.supabaseClient || window.supabase;
  },
  getCurrentUser() {
    return this.user;
  },
  getProfile() {
    return this.profile;
  },
  isAdmin() {
    return Boolean(this.profile?.is_admin || this.profile?.role === "admin");
  },
  isPublisher() {
    return Boolean(
      this.profile?.is_publisher ||
      this.profile?.role === "publisher" ||
      this.isAdmin()
    );
  },
  isLead() {
    return Boolean(this.profile?.role === "lead" || this.isAdmin());
  },
  async refreshProfile() {
    return this.user ? loadProfile(this.user) : null;
  },
  async signOut() {
    const client = this.getSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
};

function isValidEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  if (!STRICT_EDU_ONLY) return true;
  return /\.(edu|ac\.bd|edu\.bd)$/.test(normalized.split("@")[1]);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function getInitials(name, email) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return String(email || "PU").slice(0, 2).toUpperCase();
}

function setMessage(id, text = "", type = "") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  element.className = "form-message";
  if (type) element.classList.add(`form-message--${type}`);
}

function formatWatermarkTime(date = new Date()) {
  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${datePart} · ${timePart} ${sign}${hours}${minutes === "00" ? "" : `:${minutes}`}`;
}

function renderWatermark(email) {
  const container = document.getElementById("watermark");
  const layer = document.getElementById("watermark-layer");
  if (!layer) return;

  if (!email) {
    layer.replaceChildren();
    if (container) container.hidden = true;
    return;
  }

  if (container) container.hidden = false;
  const stamp = formatWatermarkTime();
  const count = Math.max(96, Math.ceil((innerWidth * innerHeight) / 12000));
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i += 1) {
    const tile = document.createElement("span");
    tile.className = "watermark__tile";
    tile.append(document.createTextNode(email));
    const small = document.createElement("small");
    small.textContent = stamp;
    tile.append(small);
    fragment.append(tile);
  }
  layer.replaceChildren(fragment);
}

function setRoleVisibility(profile) {
  document.querySelectorAll("[data-requires-role]").forEach(element => {
    const required = element.dataset.requiresRole;
    const admin = Boolean(profile?.is_admin || profile?.role === "admin");
    const publisher = Boolean(profile?.is_publisher || profile?.role === "publisher" || admin);
    const lead = Boolean(profile?.role === "lead" || admin);
    element.hidden = !(
      (required === "admin" && admin) ||
      (required === "publisher" && publisher) ||
      (required === "lead" && lead)
    );
  });
}

function buildFallbackProfile(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    edu_email: user.email,
    full_name: meta.full_name || (user.email ? user.email.split("@")[0] : "Student"),
    department: meta.department || "Student",
    batch_year: meta.batch_year ? Number(meta.batch_year) : null,
    skills: Array.isArray(meta.skills) ? meta.skills : [],
    github_url: meta.github_url || null,
    role: meta.role || "student",
    is_publisher: Boolean(meta.is_publisher),
    is_admin: Boolean(meta.is_admin)
  };
}

function clearProfileUI() {
  const initialsEl = document.getElementById("user-initials");
  const nameEl = document.getElementById("user-name");
  const metaEl = document.getElementById("user-meta");
  if (initialsEl) initialsEl.textContent = "--";
  if (nameEl) nameEl.textContent = "Loading…";
  if (metaEl) metaEl.textContent = "--";

  const summaryTitle = document.getElementById("profile-summary-title");
  if (summaryTitle) summaryTitle.textContent = "Loading…";
  const summary = document.getElementById("profile-summary");
  if (summary) {
    const avatar = summary.querySelector(".avatar");
    const summaryMeta = summary.querySelector(".profile-card__meta");
    if (avatar) avatar.textContent = "--";
    if (summaryMeta) summaryMeta.textContent = "--";

    const skillsList = document.getElementById("profile-skills-list");
    if (skillsList) skillsList.replaceChildren();

    const githubLink = summary.querySelector(".link-row a");
    if (githubLink) {
      githubLink.href = "https://github.com/";
      if (githubLink.parentElement) githubLink.parentElement.hidden = true;
    }
  }

  const ids = [
    "profile-name",
    "profile-email",
    "profile-department",
    "profile-batch",
    "profile-skills",
    "profile-github",
    "profile-portfolio"
  ];
  ids.forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    if (element.tagName === "SELECT") {
      element.selectedIndex = 0;
    } else {
      element.value = "";
    }
  });
  setRoleVisibility(null);
}

function updateProfileUI(user, profile) {
  if (!user) {
    clearProfileUI();
    return;
  }
  const currentProfile = profile || buildFallbackProfile(user);
  const name = currentProfile.full_name || user.user_metadata?.full_name || (user.email ? user.email.split("@")[0] : "Student");
  const department = currentProfile.department || user.user_metadata?.department || "Student";
  const batch = currentProfile.batch_year || user.user_metadata?.batch_year || "";
  const initials = getInitials(name, user.email);

  const initialsEl = document.getElementById("user-initials");
  const nameEl = document.getElementById("user-name");
  const metaEl = document.getElementById("user-meta");
  if (initialsEl) initialsEl.textContent = initials;
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = batch ? `${department} · Batch ${batch}` : department;

  const summaryTitle = document.getElementById("profile-summary-title");
  if (summaryTitle) summaryTitle.textContent = name;
  const summary = document.getElementById("profile-summary");
  if (summary) {
    const avatar = summary.querySelector(".avatar");
    const summaryMeta = summary.querySelector(".profile-card__meta");
    if (avatar) avatar.textContent = initials;
    if (summaryMeta) summaryMeta.textContent = batch ? `${department} · Batch ${batch}` : department;

    const skillsList = document.getElementById("profile-skills-list");
    if (skillsList) {
      skillsList.replaceChildren();
      (Array.isArray(currentProfile.skills) ? currentProfile.skills : []).forEach(skill => {
        const item = document.createElement("li");
        item.className = "tag tag--plain";
        item.textContent = skill;
        skillsList.append(item);
      });
    }
    const githubLink = summary.querySelector(".link-row a");
    if (githubLink) {
      githubLink.href = currentProfile.github_url || "https://github.com/";
      if (githubLink.parentElement) {
        githubLink.parentElement.hidden = !currentProfile.github_url;
      }
    }
  }

  const values = {
    "profile-name": name,
    "profile-email": currentProfile.edu_email || user.email,
    "profile-department": department,
    "profile-batch": batch,
    "profile-skills": Array.isArray(currentProfile.skills) ? currentProfile.skills.join(", ") : "",
    "profile-github": currentProfile.github_url || "",
    "profile-portfolio": user.user_metadata?.portfolio_url || ""
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (!element) return;
    if (element.tagName === "SELECT") {
      element.value = value;
      if (!element.value && element.options.length > 0) {
        element.selectedIndex = 0;
      }
    } else {
      element.value = value;
    }
  });
  setRoleVisibility(currentProfile);
}

async function loadProfile(user) {
  const client = window.PubAuth.getSupabase();
  if (!client || !user) return null;

  try {
    const { data, error } = await client
      .from("profiles")
      .select("id, edu_email, full_name, department, batch_year, skills, github_url, role, is_publisher, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("PUB Hub: Could not load profile.", error);
      const fallback = buildFallbackProfile(user);
      window.PubAuth.profile = fallback;
      updateProfileUI(user, fallback);
      return fallback;
    }

    const profile = data || buildFallbackProfile(user);
    window.PubAuth.profile = profile;
    updateProfileUI(user, profile);
    return profile;
  } catch (err) {
    console.error("PUB Hub: Could not load profile.", err);
    const fallback = buildFallbackProfile(user);
    window.PubAuth.profile = fallback;
    updateProfileUI(user, fallback);
    return fallback;
  }
}

function setAuthState(session) {
  const user = session?.user || null;
  window.PubAuth.session = session || null;
  window.PubAuth.user = user;
  document.body.dataset.auth = user ? "member" : "guest";
  if (user) {
    renderWatermark(user.email);
    updateProfileUI(user, window.PubAuth.profile || buildFallbackProfile(user));
  } else {
    window.PubAuth.profile = null;
    renderWatermark(null);
    clearProfileUI();
  }
}

function setupAuthTabs() {
  const loginTab = document.getElementById("tab-login");
  const signupTab = document.getElementById("tab-signup");
  const loginPanel = document.getElementById("login-panel");
  const signupPanel = document.getElementById("signup-panel");
  if (!loginTab || !signupTab || !loginPanel || !signupPanel) return;

  const activate = signup => {
    loginTab.setAttribute("aria-selected", String(!signup));
    signupTab.setAttribute("aria-selected", String(signup));
    loginTab.tabIndex = signup ? -1 : 0;
    signupTab.tabIndex = signup ? 0 : -1;
    loginPanel.hidden = signup;
    signupPanel.hidden = !signup;
    setMessage("auth-message");
  };
  loginTab.addEventListener("click", () => activate(false));
  signupTab.addEventListener("click", () => activate(true));
}

function setupAuthForms() {
  const client = window.PubAuth.getSupabase();
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();
    setMessage("auth-message");
    const email = document.getElementById("login-email")?.value.trim() || "";
    const password = document.getElementById("login-password")?.value || "";
    if (!isValidEmail(email) || !password) {
      setMessage("auth-message", "Enter a valid email address and password.", "error");
      return;
    }
    const button = loginForm.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Signing in…"; }
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) setMessage("auth-message", error.message, "error");
      else loginForm.reset();
    } catch (error) {
      setMessage("auth-message", error.message || "Could not sign in. Please try again.", "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Sign in"; }
    }
  });

  signupForm?.addEventListener("submit", async event => {
    event.preventDefault();
    setMessage("auth-message");
    const full_name = document.getElementById("signup-name")?.value.trim() || "";
    const email = document.getElementById("signup-email")?.value.trim() || "";
    const department = document.getElementById("signup-department")?.value || "";
    const batch_year = Number(document.getElementById("signup-batch")?.value);
    const password = document.getElementById("signup-password")?.value || "";

    if (!full_name || !isValidEmail(email) || !department || !Number.isInteger(batch_year) || !password) {
      const message = STRICT_EDU_ONLY
        ? "Complete all fields using a valid .edu or .ac.bd university email."
        : "Complete all fields using a valid email address.";
      setMessage("auth-message", message, "error");
      return;
    }
    if (password.length < 8) {
      setMessage("auth-message", "Password must be at least 8 characters long.", "error");
      return;
    }

    const button = signupForm.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Creating account…"; }
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name, department, batch_year } }
      });
      if (error) {
        setMessage("auth-message", error.message, "error");
      } else if (data.session) {
        signupForm.reset();
        setMessage("auth-message", "Account created and signed in.", "success");
      } else {
        signupForm.reset();
        setMessage("auth-message", "Account created. Check your email for the verification link.", "success");
      }
    } catch (error) {
      setMessage("auth-message", error.message || "Could not create the account. Please try again.", "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Create account"; }
    }
  });

  document.getElementById("sign-out-button")?.addEventListener("click", async () => {
    try {
      const { error } = await client.auth.signOut();
      if (error) setMessage("auth-message", error.message, "error");
    } catch (error) {
      console.error("PUB Hub: Sign out failed.", error);
    }
  });

  document.getElementById("forgot-password")?.addEventListener("click", async () => {
    const email = document.getElementById("login-email")?.value.trim() || "";
    if (!isValidEmail(email)) {
      setMessage("auth-message", "Enter a valid email in the sign-in field first.", "info");
      document.getElementById("login-email")?.focus();
      return;
    }
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });
      setMessage(
        "auth-message",
        error ? error.message : "Password reset link sent. Check your email.",
        error ? "error" : "success"
      );
    } catch (error) {
      setMessage("auth-message", error.message || "Could not send the reset email.", "error");
    }
  });
}

function setupProfileDialog() {
  const client = window.PubAuth.getSupabase();
  const dialog = document.getElementById("profile-dialog");
  const form = document.getElementById("profile-form");

  document.querySelectorAll('[data-open-dialog="profile-dialog"]').forEach(button => {
    button.addEventListener("click", () => {
      setMessage("profile-message");
      if (dialog && !dialog.open) dialog.showModal();
    });
  });

  form?.addEventListener("submit", async event => {
    if (event.submitter?.getAttribute("formmethod") === "dialog") return;
    event.preventDefault();
    setMessage("profile-message");
    const user = window.PubAuth.user;
    if (!user) {
      setMessage("profile-message", "Sign in before editing your profile.", "error");
      return;
    }

    const full_name = document.getElementById("profile-name")?.value.trim() || "";
    const department = document.getElementById("profile-department")?.value || "";
    const batch_year = Number(document.getElementById("profile-batch")?.value);
    const skills = (document.getElementById("profile-skills")?.value || "")
      .split(",").map(skill => skill.trim()).filter(Boolean);
    const github_url = document.getElementById("profile-github")?.value.trim() || null;
    const portfolio_url = document.getElementById("profile-portfolio")?.value.trim() || null;
    if (!full_name || !department || !Number.isInteger(batch_year)) {
      setMessage("profile-message", "Name, department, and batch year are required.", "error");
      return;
    }

    const button = form.querySelector("button.btn--primary");
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    try {
      const { data, error } = await client.from("profiles").update({
        full_name,
        department,
        batch_year,
        skills,
        github_url,
        updated_at: new Date().toISOString()
      }).eq("id", user.id).select().single();
      if (error) throw error;

      // portfolio_url is not a column in schema.sql, so keep it in Auth metadata.
      const { error: metadataError } = await client.auth.updateUser({
        data: { full_name, department, batch_year, portfolio_url }
      });
      if (metadataError) throw metadataError;

      window.PubAuth.profile = data;
      updateProfileUI(user, data);
      setMessage("profile-message", "Profile saved.", "success");
      window.setTimeout(() => { if (dialog?.open) dialog.close(); }, 700);
    } catch (error) {
      console.error("PUB Hub: Profile update failed.", error);
      setMessage("profile-message", error.message || "Could not save your profile.", "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Save profile"; }
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupAuthTabs();
  setupAuthForms();
  setupProfileDialog();
  window.addEventListener("resize", () => {
    if (window.PubAuth.user) renderWatermark(window.PubAuth.user.email);
  });

  const client = window.PubAuth.getSupabase();
  if (!client) {
    console.error("PUB Hub: Supabase client is unavailable.");
    setAuthState(null);
    window.PubAuth.authReady = true;
    document.dispatchEvent(
      new CustomEvent('pub:auth-ready', {
        detail: { user: window.PubAuth.user, profile: window.PubAuth.profile }
      })
    );
    return;
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    setAuthState(data.session);
    if (data.session?.user) await loadProfile(data.session.user);
  } catch (error) {
    console.error("PUB Hub: Could not restore the session.", error);
    setAuthState(null);
  } finally {
    window.PubAuth.authReady = true;
    document.dispatchEvent(
      new CustomEvent('pub:auth-ready', {
        detail: { user: window.PubAuth.user, profile: window.PubAuth.profile }
      })
    );
  }

  client.auth.onAuthStateChange((_event, session) => {
    setAuthState(session);
    setTimeout(async () => {
      if (session?.user) {
        await loadProfile(session.user);
      }
      window.PubAuth.authReady = true;
      document.dispatchEvent(
        new CustomEvent('pub:auth-ready', {
          detail: { user: window.PubAuth.user, profile: window.PubAuth.profile }
        })
      );
    }, 0);
  });
});
