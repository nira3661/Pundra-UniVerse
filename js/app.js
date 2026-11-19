/**
 * Pundra UniVerse (PUB Hub) — Core Application Logic (app.js)
 * Pure Vanilla JavaScript (ES6+) with Supabase backend.
 *
 * Covers:
 *   1. Shared Utilities (Toast, Dialogs, Theme, Char Counters, Relative Time)
 *   2. Student Spotlight Feed, Milestones, and Cheers (index.html)
 *   3. Collab Hub Pitches, Applications, and Real-Time Workspaces (collab.html)
 *   4. Anonymous Campus Board, Pseudonyms, Profanity/Name Filter, and 20-Day Locks (feedback.html)
 *   5. Hall of Fame Official Announcements and Reactions (hall-of-fame.html)
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. SHARED UTILITIES & ENVIRONMENT HELPERS
  // =========================================================================

  function getSupabase() {
    return window.PubAuth ? window.PubAuth.getSupabase() : (window.supabaseClient || window.supabase);
  }

  function getCurrentUser() {
    return window.PubAuth ? window.PubAuth.getCurrentUser() : null;
  }

  function getCurrentProfile() {
    return window.PubAuth ? window.PubAuth.getProfile() : null;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return '1 week ago';
    if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function showToast(message, type = 'info') {
    const region = document.getElementById('toast-region');
    if (!region) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'error') toast.classList.add('toast--error');
    if (type === 'success') toast.classList.add('toast--success');
    toast.textContent = message;

    region.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 4000);
  }

  function setupCharCounters() {
    document.querySelectorAll('textarea[maxlength]').forEach(textarea => {
      const counter = document.getElementById(`${textarea.id}-count`);
      if (!counter) return;

      const max = textarea.getAttribute('maxlength');
      const update = () => {
        counter.textContent = `${textarea.value.length} / ${max}`;
      };
      textarea.addEventListener('input', update);
      update();
    });
  }

  function setupGenericDialogs() {
    document.querySelectorAll('[data-open-dialog]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dialogId = btn.getAttribute('data-open-dialog');
        const dialog = document.getElementById(dialogId);
        if (dialog && typeof dialog.showModal === 'function') {
          if (dialogId === 'apply-dialog' && btn.dataset.pitchId) {
            setupApplyModalForPitch(btn.dataset.pitchId);
          }
          dialog.showModal();
        }
      });
    });

    document.querySelectorAll('dialog.modal').forEach(dialog => {
      dialog.addEventListener('click', e => {
        const rect = dialog.getBoundingClientRect();
        const isInDialog =
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width;
        if (!isInDialog) {
          dialog.close();
        }
      });
    });
  }

  async function uploadImageToStorage(file, folder) {
    if (!file) return null;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid image type. Please select a PNG, JPG, or WebP image.');
    }

    const maxSize = 2 * 1024 * 1024; // 2 MB
    if (file.size > maxSize) {
      throw new Error('Image file size exceeds the 2 MB limit.');
    }

    const sb = getSupabase();
    const user = getCurrentUser();
    if (!sb || !user) {
      throw new Error('You must be signed in to upload images.');
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${folder}/${user.id}/${Date.now()}-${safeName}`;

    const { error } = await sb.storage.from('pub-media').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

    if (error) throw error;

    const { data: urlData } = sb.storage.from('pub-media').getPublicUrl(filePath);
    return urlData?.publicUrl || null;
  }

  function setupThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    const savedTheme = localStorage.getItem('pub_hub_theme');
    let effectiveTheme;

    if (savedTheme === 'dark' || savedTheme === 'light') {
      document.documentElement.dataset.theme = savedTheme;
      effectiveTheme = savedTheme;
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    }

    toggle.setAttribute('aria-pressed', String(effectiveTheme === 'dark'));

    toggle.addEventListener('click', () => {
      const currentTheme =
        document.documentElement.dataset.theme ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      toggle.setAttribute('aria-pressed', String(nextTheme === 'dark'));
      localStorage.setItem('pub_hub_theme', nextTheme);
    });
  }

  // =========================================================================
  // 2. STUDENT SPOTLIGHT (index.html / data-page="spotlight")
  // =========================================================================

  let activeMilestoneFilter = 'all';
  let achievementsData = [];
  let userCheersSet = new Set();
  let editingAchievementId = null;

  async function initSpotlightPage() {
    const filterGroup = document.getElementById('milestone-filter');
    const form = document.getElementById('achievement-form');
    const loadMoreBtn = document.getElementById('load-more-achievements');
    const dialog = document.getElementById('achievement-dialog');

    if (filterGroup) {
      filterGroup.addEventListener('click', e => {
        const chip = e.target.closest('button.chip');
        if (!chip) return;

        filterGroup.querySelectorAll('button.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        activeMilestoneFilter = chip.dataset.filter || 'all';
        renderAchievements();
      });
    }

    if (form) {
      form.addEventListener('submit', handleAchievementSubmit);
    }

    if (dialog) {
      dialog.addEventListener('close', () => {
        editingAchievementId = null;
        const titleEl = document.getElementById('achievement-dialog-title');
        if (titleEl) titleEl.textContent = 'Share a milestone';
        if (form) {
          form.reset();
          const submitBtn = form.querySelector('button.btn--accent');
          if (submitBtn) submitBtn.textContent = 'Post milestone';
        }
      });
    }

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => loadAchievements(true));
    }
  }

async function loadAchievements(append = false) {
    const feed = document.getElementById('achievement-feed');
    const sb = getSupabase();
    if (!feed || !sb) return;

    feed.setAttribute('aria-busy', 'true');

    try {
      const { data: posts, error } = await sb
        .from('achievement_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      // Fetch author profiles separately so PostgREST FK join issues can never block the feed
      const authorIds = [...new Set((posts || []).map(p => p.author_id).filter(Boolean))];
      const authorsMap = new Map();
      if (authorIds.length > 0) {
        const { data: profilesData, error: profilesErr } = await sb
          .from('profiles')
          .select('id, full_name, department, batch_year')
          .in('id', authorIds);

        if (profilesErr) {
          console.warn('PUB Hub: Could not load author profiles:', profilesErr.message);
        } else {
          (profilesData || []).forEach(p => authorsMap.set(p.id, p));
        }
      }

      const data = (posts || []).map(post => ({
        ...post,
        author: authorsMap.get(post.author_id) || null
      }));

      if (!append) {
        achievementsData = data;
        const user = getCurrentUser();
        userCheersSet = new Set();
        if (user) {
          try {
            const { data: cheerRows } = await sb
              .from('achievement_cheers')
              .select('post_id, cheer_type')
              .eq('user_id', user.id);
            (cheerRows || []).forEach(r => userCheersSet.add(`${r.post_id}:${r.cheer_type}`));
          } catch (err) {
            console.warn('Could not load user cheers:', err);
          }
        }
      } else {
        achievementsData = (achievementsData || []).concat(data);
      }

      renderAchievements();
    } catch (err) {
      console.error('PUB Hub: Failed to load achievements:', err);
      showToast(err.message || 'Could not load milestones.', 'error');
    } finally {
      feed.setAttribute('aria-busy', 'false');
    }
  }

  function renderAchievements() {
    const feed = document.getElementById('achievement-feed');
    const emptyState = document.getElementById('achievement-empty');
    const template = document.getElementById('achievement-card-template');
    if (!feed || !template) return;

    feed.innerHTML = '';
    const filtered = achievementsData.filter(item => {
      if (activeMilestoneFilter === 'all') return true;
      return item.milestone_tag === activeMilestoneFilter;
    });

    if (emptyState) {
      emptyState.hidden = filtered.length > 0;
    }

    filtered.forEach(post => {
      const clone = template.content.cloneNode(true);
      const article = clone.querySelector('article');

      article.dataset.id = post.id;
      article.dataset.milestone = post.milestone_tag || 'hackathon';

      const img = clone.querySelector('img.card__thumb');
      if (img && post.thumbnail_url) {
        img.src = post.thumbnail_url;
        img.alt = post.title || 'Milestone thumbnail';
        img.hidden = false;
      }

      const milestoneEl = clone.querySelector('[data-field="milestone"]');
      if (milestoneEl) {
        milestoneEl.className = `tag tag--${post.milestone_tag || 'hackathon'}`;
        const labels = {
          hackathon: 'Hackathon win',
          research: 'Research paper',
          launch: 'App launch',
          internship: 'Internship'
        };
        milestoneEl.textContent = labels[post.milestone_tag] || post.milestone_tag;
      }

      const timeEl = clone.querySelector('[data-field="created_at"]');
      if (timeEl) {
        timeEl.setAttribute('datetime', post.created_at);
        timeEl.textContent = formatRelativeTime(post.created_at);
      }

      const titleEl = clone.querySelector('[data-field="title"]');
      if (titleEl) titleEl.textContent = post.title;

      const authorName = post.author?.full_name || 'Anonymous Student';
      const authorDept = post.author?.department || 'Student';
      const authorBatch = post.author?.batch_year ? `Batch ${post.author.batch_year}` : '';

      const authorEl = clone.querySelector('[data-field="author"]');
      if (authorEl) authorEl.textContent = authorName;

      const authorMetaEl = clone.querySelector('[data-field="author_meta"]');
      if (authorMetaEl) authorMetaEl.textContent = `${authorDept} · ${authorBatch}`.trim();

      const descEl = clone.querySelector('[data-field="description"]');
      if (descEl) descEl.textContent = post.description;

      const linksList = clone.querySelector('[data-field="links"]');
      if (linksList && post.proof_link) {
        linksList.innerHTML = `<li><a class="link-pill" href="${escapeHtml(post.proof_link)}" target="_blank" rel="noopener noreferrer">Proof / Paper</a></li>`;
      }

      const cheers = post.cheer_counts || {};
      const shippedBtn = clone.querySelector('[data-cheer="shipped"]');
      const bigBrainBtn = clone.querySelector('[data-cheer="big_brain"]');
      const winnerBtn = clone.querySelector('[data-cheer="winner"]');

      if (shippedBtn) shippedBtn.querySelector('.cheer__count').textContent = cheers.shipped || 0;
      if (bigBrainBtn) bigBrainBtn.querySelector('.cheer__count').textContent = cheers.big_brain || 0;
      if (winnerBtn) winnerBtn.querySelector('.cheer__count').textContent = cheers.winner || 0;

      clone.querySelectorAll('button.cheer').forEach(btn => {
        const cheerKey = `${post.id}:${btn.dataset.cheer}`;
        btn.setAttribute('aria-pressed', String(userCheersSet.has(cheerKey)));
        btn.addEventListener('click', () => handleCheerClick(post.id, btn.dataset.cheer, btn));
      });

      const user = getCurrentUser();
      const isAdmin = window.PubAuth && typeof window.PubAuth.isAdmin === 'function' ? window.PubAuth.isAdmin() : false;
      const isAuthor = user && post.author_id === user.id;

      if (user && (isAuthor || isAdmin)) {
        const actionsBar = document.createElement('div');
        actionsBar.className = 'owner-actions';
        actionsBar.innerHTML = `
          <span class="owner-actions__label">${isAuthor ? 'Your post' : 'Admin'}</span>
          ${isAuthor ? `<button type="button" class="btn btn--ghost btn--xs btn-edit-achievement" data-id="${post.id}">Edit</button>` : ''}
          <button type="button" class="btn btn--ghost btn--xs btn--danger btn-delete-achievement" data-id="${post.id}">Delete</button>
        `;
        const editBtn = actionsBar.querySelector('.btn-edit-achievement');
        if (editBtn) {
          editBtn.addEventListener('click', () => openEditAchievementDialog(post));
        }
        const delBtn = actionsBar.querySelector('.btn-delete-achievement');
        if (delBtn) {
          delBtn.addEventListener('click', () => handleDeleteAchievement(post.id));
        }
        article.appendChild(actionsBar);
      }

      feed.appendChild(clone);
    });
  }

  function openEditAchievementDialog(post) {
    const dialog = document.getElementById('achievement-dialog');
    const form = document.getElementById('achievement-form');
    if (!dialog || !form) return;

    editingAchievementId = post.id;
    const titleEl = document.getElementById('achievement-dialog-title');
    if (titleEl) titleEl.textContent = 'Edit milestone';

    const titleInput = form.querySelector('#achievement-title');
    if (titleInput) titleInput.value = post.title || '';

    const tagRadio = form.querySelector(`input[name="milestone"][value="${post.milestone_tag}"]`);
    if (tagRadio) tagRadio.checked = true;

    const descInput = form.querySelector('#achievement-description');
    if (descInput) {
      descInput.value = post.description || '';
      const countEl = document.getElementById('achievement-description-count');
      if (countEl) countEl.textContent = `${descInput.value.length} / 600`;
    }

    const proofInput = form.querySelector('#achievement-proof');
    if (proofInput) proofInput.value = post.proof_link || '';

    const submitBtn = form.querySelector('button.btn--accent');
    if (submitBtn) submitBtn.textContent = 'Save changes';

    const msgEl = document.getElementById('achievement-message');
    if (msgEl) msgEl.textContent = '';

    dialog.showModal();
  }

  async function handleDeleteAchievement(postId) {
    if (!confirm('Are you sure you want to delete this milestone post? This action cannot be undone.')) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('achievement_posts').delete().eq('id', postId);
      if (error) throw error;

      achievementsData = achievementsData.filter(p => p.id !== postId);
      renderAchievements();
      loadSpotlightStats();
      showToast('Milestone post deleted.', 'info');
    } catch (err) {
      console.error('Delete milestone error:', err);
      showToast(err.message || 'Could not delete milestone.', 'error');
    }
  }

  async function handleCheerClick(postId, cheerType, button) {
    const sb = getSupabase();
    if (!sb) return;

    if (!getCurrentUser()) {
      showToast('Please sign in to cheer for student milestones.', 'error');
      return;
    }

    if (button.disabled) return;
    button.disabled = true;

    try {
      const { data, error } = await sb.rpc('increment_cheer', {
        p_post_id: postId,
        p_cheer_type: cheerType
      });

      if (error) throw error;

      if (data && data.success) {
        // Recompute all 3 cheer counts from the returned cheer_counts
        const article = button.closest('article');
        if (article && data.cheer_counts) {
          ['shipped', 'big_brain', 'winner'].forEach(ct => {
            const btn = article.querySelector(`[data-cheer="${ct}"]`);
            if (btn) {
              btn.querySelector('.cheer__count').textContent = data.cheer_counts[ct] || 0;
            }
          });
        }
        const isActive = Boolean(data.active);
        button.setAttribute('aria-pressed', String(isActive));
        const cheerKey = `${postId}:${cheerType}`;
        if (isActive) {
          userCheersSet.add(cheerKey);
          showToast('Cheer added! 🎉', 'success');
        } else {
          userCheersSet.delete(cheerKey);
          showToast('Cheer removed.', 'info');
        }
        loadSpotlightStats();
      } else {
        showToast(data?.error || 'Could not cheer.', 'error');
      }
    } catch (err) {
      console.error('Cheer error:', err);
      showToast(err.message || 'Could not cheer.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function handleAchievementSubmit(e) {
    if (e.submitter && e.submitter.getAttribute('formmethod') === 'dialog') return;
    e.preventDefault();

    const sb = getSupabase();
    const user = getCurrentUser();
    const form = e.target;
    const msgEl = document.getElementById('achievement-message');
    const submitBtn = form.querySelector('button.btn--accent');

    if (!user) {
      if (msgEl) msgEl.textContent = 'You must be signed in to post.';
      return;
    }

    const title = form.querySelector('#achievement-title')?.value.trim();
    const milestone = form.querySelector('input[name="milestone"]:checked')?.value || 'hackathon';
    const description = form.querySelector('#achievement-description')?.value.trim();
    const proof_link = form.querySelector('#achievement-proof')?.value.trim();
    const thumbFile = form.querySelector('#achievement-thumb')?.files?.[0];

    if (!title || !description || !proof_link) {
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = 'Please fill in all required fields.';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = editingAchievementId ? 'Saving…' : 'Posting…';
    }

    try {
      let thumbnailUrl = null;
      if (thumbFile) {
        thumbnailUrl = await uploadImageToStorage(thumbFile, 'achievements');
      }

      if (editingAchievementId) {
        const updates = {
          title,
          milestone_tag: milestone,
          description,
          proof_link
        };
        if (thumbnailUrl) {
          updates.thumbnail_url = thumbnailUrl;
        }

        const { data, error } = await sb
          .from('achievement_posts')
          .update(updates)
          .eq('id', editingAchievementId)
          .select('*')
          .single();

        if (error) throw error;

        const idx = achievementsData.findIndex(p => p.id === editingAchievementId);
        if (idx !== -1) {
          achievementsData[idx] = {
            ...achievementsData[idx],
            ...data
          };
        }
        renderAchievements();
        form.reset();
        const dialog = document.getElementById('achievement-dialog');
        if (dialog) dialog.close();
        editingAchievementId = null;
        showToast('Milestone updated! ✨', 'success');
        return;
      }

      const newPost = {
        author_id: user.id,
        title,
        milestone_tag: milestone,
        description,
        proof_link,
        thumbnail_url: thumbnailUrl,
        cheer_counts: { shipped: 0, big_brain: 0, winner: 0 }
      };

      const { data, error } = await sb
        .from('achievement_posts')
        .insert(newPost)
        .select('*')
        .single();

      if (error) throw error;

      const currentProfile = getCurrentProfile();
      achievementsData.unshift({
        ...data,
        author: currentProfile
          ? {
              id: currentProfile.id,
              full_name: currentProfile.full_name,
              department: currentProfile.department,
              batch_year: currentProfile.batch_year
            }
          : null
      });
      renderAchievements();
      form.reset();

      const dialog = document.getElementById('achievement-dialog');
      if (dialog) dialog.close();
      showToast('Milestone posted to Student Spotlight! 🚀', 'success');
      loadSpotlightStats();
    } catch (err) {
      console.error('Post/edit achievement error:', err);
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = err.message || 'Could not save milestone.';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingAchievementId ? 'Save changes' : 'Post milestone';
      }
    }
  }

  async function loadSpotlightStats() {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [milestonesRes, cheersRes, buildersRes, pitchesRes] = await Promise.all([
        sb.from('achievement_posts').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        sb.from('achievement_posts').select('cheer_counts'),
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        sb.from('project_pitches').select('id', { count: 'exact', head: true }).eq('status', 'open')
      ]);

      const milestonesCount = milestonesRes.count;
      let totalCheers = 0;
      (cheersRes.data || []).forEach(p => {
        const counts = p.cheer_counts || {};
        totalCheers += (Number(counts.shipped) || 0) + (Number(counts.big_brain) || 0) + (Number(counts.winner) || 0);
      });
      const buildersCount = buildersRes.count;
      const pitchesCount = pitchesRes.count;

      const elMilestones = document.getElementById('stat-milestones');
      const elCheers = document.getElementById('stat-cheers');
      const elBuilders = document.getElementById('stat-builders');
      const elPitches = document.getElementById('stat-pitches');

      if (elMilestones && milestonesCount != null) elMilestones.textContent = Number(milestonesCount).toLocaleString();
      if (elCheers && totalCheers != null) elCheers.textContent = Number(totalCheers).toLocaleString();
      if (elBuilders && buildersCount != null) elBuilders.textContent = Number(buildersCount).toLocaleString();
      if (elPitches && pitchesCount != null) elPitches.textContent = Number(pitchesCount).toLocaleString();
    } catch (err) {
      console.warn('Spotlight stats load error:', err);
    }
  }

  async function loadMiniHallOfFame() {
    const miniList = document.getElementById('hof-mini-list');
    const sb = getSupabase();
    if (!miniList || !sb) return;

    try {
      const { data, error } = await sb
        .from('hall_of_fame')
        .select('title, category, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;

      if (!data || data.length === 0) {
        miniList.innerHTML = '<li class="muted">No announcements yet.</li>';
        return;
      }

      miniList.innerHTML = data
        .map(
          item => `
          <li>
            <a href="hall-of-fame.html">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.category)} · ${formatRelativeTime(item.created_at)}</small>
            </a>
          </li>
        `
        )
        .join('');
    } catch (e) {
      console.warn('Mini Hall of Fame load error:', e);
    }
  }

  // =========================================================================
  // 3. COLLAB HUB & WORKSPACES (collab.html / data-page="collab")
  // =========================================================================

  let pitchesData = [];
  let currentPitchFilter = 'all';
  let activeWorkspacePitchId = null;
  let workspaceRealtimeChannel = null;
  let editingPitchId = null;

  async function initCollabPage() {
    const searchForm = document.getElementById('pitch-search');
    const roleFilterGroup = document.getElementById('role-filter');
    const pitchForm = document.getElementById('pitch-form');
    const pitchDialog = document.getElementById('pitch-dialog');
    const applyForm = document.getElementById('apply-form');
    const messageForm = document.getElementById('message-form');
    const taskForm = document.getElementById('task-form');

    if (searchForm) {
      searchForm.addEventListener('input', () => filterPitches());
    }

    if (roleFilterGroup) {
      roleFilterGroup.addEventListener('click', e => {
        const chip = e.target.closest('button.chip');
        if (!chip) return;

        roleFilterGroup.querySelectorAll('button.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        currentPitchFilter = chip.dataset.filter || 'all';
        filterPitches();
      });
    }

    if (pitchForm) pitchForm.addEventListener('submit', handlePitchSubmit);
    if (applyForm) applyForm.addEventListener('submit', handleApplySubmit);
    if (messageForm) messageForm.addEventListener('submit', handleWorkspaceMessageSubmit);
    if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);

    if (pitchDialog) {
      pitchDialog.addEventListener('close', () => {
        editingPitchId = null;
        const titleEl = document.getElementById('pitch-dialog-title');
        if (titleEl) titleEl.textContent = 'Pitch a project';
        if (pitchForm) {
          pitchForm.reset();
          const submitBtn = pitchForm.querySelector('button.btn--accent');
          if (submitBtn) submitBtn.textContent = 'Publish pitch';
        }
      });
    }

    setupTaskCheckboxes();
  }

  async function loadPitches() {
    const grid = document.getElementById('pitch-grid');
    const sb = getSupabase();
    if (!grid || !sb) return;

    grid.setAttribute('aria-busy', 'true');

    try {
      const { data, error } = await sb
        .from('project_pitches')
        .select(`
          id,
          creator_id,
          title,
          description,
          roles_needed,
          tech_stack,
          status,
          thumbnail_url,
          created_at,
          creator:profiles!creator_id(id, full_name, department, batch_year)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      pitchesData = data || [];
      renderPitches(pitchesData);
    } catch (err) {
      console.warn('PUB Hub: Using sample pitches:', err.message);
    } finally {
      grid.setAttribute('aria-busy', 'false');
    }
  }

  function renderPitches(list) {
    const grid = document.getElementById('pitch-grid');
    const template = document.getElementById('pitch-card-template');
    if (!grid || !template) return;

    grid.innerHTML = '';

    const emptyState = document.getElementById('pitch-empty');
    if (emptyState) emptyState.hidden = list.length > 0;

    list.forEach(pitch => {
      const clone = template.content.cloneNode(true);
      const article = clone.querySelector('article');

      article.dataset.id = pitch.id;
      article.dataset.status = pitch.status || 'open';
      article.dataset.roles = (pitch.roles_needed || []).join(' ').toLowerCase();

      const img = clone.querySelector('img.card__thumb');
      if (img && pitch.thumbnail_url) {
        img.src = pitch.thumbnail_url;
        img.alt = pitch.title || 'Pitch thumbnail';
        img.hidden = false;
      }

      const statusEl = clone.querySelector('[data-field="status"]');
      if (statusEl) {
        statusEl.className = `status status--${pitch.status === 'open' ? 'open' : 'review'}`;
        statusEl.textContent = pitch.status === 'open' ? 'Recruiting' : pitch.status;
      }

      const titleEl = clone.querySelector('[data-field="title"]');
      if (titleEl) titleEl.textContent = pitch.title;

      const leadEl = clone.querySelector('[data-field="lead"]');
      if (leadEl) leadEl.textContent = pitch.creator?.full_name || 'Project Lead';

      const leadMetaEl = clone.querySelector('[data-field="lead_meta"]');
      if (leadMetaEl) {
        const dept = pitch.creator?.department || 'Student';
        const batch = pitch.creator?.batch_year ? `Batch ${pitch.creator.batch_year}` : '';
        leadMetaEl.textContent = `${dept} · ${batch}`.trim();
      }

      const descEl = clone.querySelector('[data-field="description"]');
      if (descEl) descEl.textContent = pitch.description;

      const rolesList = clone.querySelector('[data-field="roles_needed"]');
      if (rolesList) {
        rolesList.innerHTML = (pitch.roles_needed || [])
          .map(r => `<li><span class="role">${escapeHtml(r)}</span></li>`)
          .join('');
      }

      const stackList = clone.querySelector('[data-field="tech_stack"]');
      if (stackList) {
        stackList.innerHTML = (pitch.tech_stack || [])
          .map(t => `<li class="tag tag--plain">${escapeHtml(t)}</li>`)
          .join('');
      }

      const applyBtn = clone.querySelector('button[data-open-dialog="apply-dialog"]');
      if (applyBtn) {
        applyBtn.dataset.pitchId = pitch.id;
        applyBtn.addEventListener('click', () => {
          setupApplyModalForPitch(pitch.id);
          const modal = document.getElementById('apply-dialog');
          if (modal) modal.showModal();
        });
      }

      const user = getCurrentUser();
      const isAdmin = window.PubAuth && typeof window.PubAuth.isAdmin === 'function' ? window.PubAuth.isAdmin() : false;
      const isCreator = user && pitch.creator_id === user.id;

      if (user && (isCreator || isAdmin)) {
        const actionsBar = document.createElement('div');
        actionsBar.className = 'owner-actions';
        actionsBar.innerHTML = `
          <span class="owner-actions__label">${isCreator ? 'Your project' : 'Admin'}</span>
          ${isCreator ? `<button type="button" class="btn btn--ghost btn--xs btn-edit-pitch" data-id="${pitch.id}">Edit</button>` : ''}
          <button type="button" class="btn btn--ghost btn--xs btn--danger btn-delete-pitch" data-id="${pitch.id}">Delete</button>
        `;
        const editBtn = actionsBar.querySelector('.btn-edit-pitch');
        if (editBtn) {
          editBtn.addEventListener('click', () => openEditPitchDialog(pitch));
        }
        const delBtn = actionsBar.querySelector('.btn-delete-pitch');
        if (delBtn) {
          delBtn.addEventListener('click', () => handleDeletePitch(pitch.id));
        }
        article.appendChild(actionsBar);
      }

      grid.appendChild(clone);
    });
  }

  function openEditPitchDialog(pitch) {
    const dialog = document.getElementById('pitch-dialog');
    const form = document.getElementById('pitch-form');
    if (!dialog || !form) return;

    editingPitchId = pitch.id;
    const titleEl = document.getElementById('pitch-dialog-title');
    if (titleEl) titleEl.textContent = 'Edit project pitch';

    const titleInput = form.querySelector('#pitch-title');
    if (titleInput) titleInput.value = pitch.title || '';

    const descInput = form.querySelector('#pitch-description');
    if (descInput) {
      descInput.value = pitch.description || '';
      const countEl = document.getElementById('pitch-description-count');
      if (countEl) countEl.textContent = `${descInput.value.length} / 800`;
    }

    const roles = pitch.roles_needed || [];
    form.querySelectorAll('input[name="roles_needed"]').forEach(cb => {
      cb.checked = roles.includes(cb.value);
    });

    const stackInput = form.querySelector('#pitch-stack');
    if (stackInput) stackInput.value = (pitch.tech_stack || []).join(', ');

    const sizeInput = form.querySelector('#pitch-size');
    if (sizeInput) sizeInput.value = pitch.team_size || 4;

    const submitBtn = form.querySelector('button.btn--accent');
    if (submitBtn) submitBtn.textContent = 'Save changes';

    const msgEl = document.getElementById('pitch-message');
    if (msgEl) msgEl.textContent = '';

    dialog.showModal();
  }

  async function handleDeletePitch(pitchId) {
    if (!confirm('Are you sure you want to delete this project pitch? All associated applications will also be removed.')) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('project_pitches').delete().eq('id', pitchId);
      if (error) throw error;

      pitchesData = pitchesData.filter(p => p.id !== pitchId);
      filterPitches();
      loadWorkspaces();
      showToast('Project pitch deleted.', 'info');
    } catch (err) {
      console.error('Delete pitch error:', err);
      showToast(err.message || 'Could not delete pitch.', 'error');
    }
  }

  function filterPitches() {
    const q = document.getElementById('pitch-query')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('pitch-status')?.value || 'all';

    const filtered = pitchesData.filter(pitch => {
      const matchesQ =
        !q ||
        pitch.title.toLowerCase().includes(q) ||
        pitch.description.toLowerCase().includes(q) ||
        (pitch.tech_stack && pitch.tech_stack.some(t => t.toLowerCase().includes(q)));

      const matchesStatus = status === 'all' || pitch.status === status;

      const matchesRole =
        currentPitchFilter === 'all' ||
        (pitch.roles_needed &&
          pitch.roles_needed.some(r => r.toLowerCase().replace(/[^a-z]/g, '').includes(currentPitchFilter)));

      return matchesQ && matchesStatus && matchesRole;
    });

    renderPitches(filtered);
  }

  async function handlePitchSubmit(e) {
    if (e.submitter && e.submitter.getAttribute('formmethod') === 'dialog') return;
    e.preventDefault();

    const sb = getSupabase();
    const user = getCurrentUser();
    const form = e.target;
    const msgEl = document.getElementById('pitch-message');
    const submitBtn = form.querySelector('button.btn--accent');

    if (!user) {
      if (msgEl) msgEl.textContent = 'You must be signed in to pitch a project.';
      return;
    }

    const title = form.querySelector('#pitch-title')?.value.trim();
    const description = form.querySelector('#pitch-description')?.value.trim();
    const checkedRoles = Array.from(form.querySelectorAll('input[name="roles_needed"]:checked')).map(
      cb => cb.value
    );
    const stack = form
      .querySelector('#pitch-stack')
      ?.value.split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (!title || !description || checkedRoles.length === 0) {
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = 'Title, scope, and at least one role are required.';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = editingPitchId ? 'Saving…' : 'Publishing…';
    }

    try {
      const thumbFile = form.querySelector('#pitch-thumb')?.files?.[0];
      const sizeInput = form.querySelector('#pitch-size');
      const teamSize = sizeInput ? parseInt(sizeInput.value, 10) || 4 : 4;
      let thumbnailUrl = null;
      if (thumbFile) {
        thumbnailUrl = await uploadImageToStorage(thumbFile, 'pitches');
      }

      if (editingPitchId) {
        const updates = {
          title,
          description,
          roles_needed: checkedRoles,
          tech_stack: stack || []
        };
        if (thumbnailUrl) {
          updates.thumbnail_url = thumbnailUrl;
        }

        let updatedPitch = null;
        try {
          const { data, error } = await sb
            .from('project_pitches')
            .update({ ...updates, team_size: teamSize })
            .eq('id', editingPitchId)
            .select(`
              id,
              creator_id,
              title,
              description,
              roles_needed,
              tech_stack,
              team_size,
              status,
              thumbnail_url,
              created_at,
              creator:profiles(id, full_name, department, batch_year)
            `)
            .single();

          if (error) throw error;
          updatedPitch = data;
        } catch (updateErr) {
          if (updateErr.message && updateErr.message.includes('team_size')) {
            const { data, error } = await sb
              .from('project_pitches')
              .update(updates)
              .eq('id', editingPitchId)
              .select(`
                id,
                creator_id,
                title,
                description,
                roles_needed,
                tech_stack,
                status,
                thumbnail_url,
                created_at,
                creator:profiles(id, full_name, department, batch_year)
              `)
              .single();
            if (error) throw error;
            updatedPitch = data;
          } else {
            throw updateErr;
          }
        }

        const idx = pitchesData.findIndex(p => p.id === editingPitchId);
        if (idx !== -1) {
          pitchesData[idx] = {
            ...pitchesData[idx],
            ...updatedPitch
          };
        }
        filterPitches();
        await loadWorkspaces();
        form.reset();

        const dialog = document.getElementById('pitch-dialog');
        if (dialog) dialog.close();
        editingPitchId = null;
        showToast('Project pitch updated! 🚀', 'success');
        return;
      }

      let newPitch = null;
      try {
        const { data, error } = await sb
          .from('project_pitches')
          .insert({
            creator_id: user.id,
            title,
            description,
            roles_needed: checkedRoles,
            tech_stack: stack || [],
            team_size: teamSize,
            thumbnail_url: thumbnailUrl,
            status: 'open'
          })
          .select(`
            id,
            creator_id,
            title,
            description,
            roles_needed,
            tech_stack,
            team_size,
            status,
            thumbnail_url,
            created_at,
            creator:profiles(id, full_name, department, batch_year)
          `)
          .single();

        if (error) throw error;
        newPitch = data;
      } catch (insertErr) {
        if (insertErr.message && insertErr.message.includes('team_size')) {
          const { data, error } = await sb
            .from('project_pitches')
            .insert({
              creator_id: user.id,
              title,
              description,
              roles_needed: checkedRoles,
              tech_stack: stack || [],
              thumbnail_url: thumbnailUrl,
              status: 'open'
            })
            .select(`
              id,
              creator_id,
              title,
              description,
              roles_needed,
              tech_stack,
              status,
              thumbnail_url,
              created_at,
              creator:profiles(id, full_name, department, batch_year)
            `)
            .single();

          if (error) throw error;
          newPitch = data;
        } else {
          throw insertErr;
        }
      }

      pitchesData.unshift(newPitch);
      renderPitches(pitchesData);
      form.reset();

      const dialog = document.getElementById('pitch-dialog');
      if (dialog) dialog.close();
      showToast('Project pitch published! Recruit your team now. 🚀', 'success');
      await loadWorkspaces();
    } catch (err) {
      console.error('Pitch save error:', err);
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = err.message || 'Could not save pitch.';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingPitchId ? 'Save changes' : 'Publish pitch';
      }
    }
  }

  function updateApplyDialogAttachedProfile(user = getCurrentUser(), profile = getCurrentProfile()) {
    const dialog = document.getElementById('apply-dialog');
    if (!dialog) return;
    const attached = dialog.querySelector('.attached-profile');
    if (!attached) return;

    if (!user && !profile) {
      attached.innerHTML = `
        <span class="avatar" aria-hidden="true">--</span>
        <div><strong>Loading…</strong><small>Profile details attach automatically</small></div>
      `;
      return;
    }

    const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';
    const dept = profile?.department || user?.user_metadata?.department || 'Student';
    const batch = profile?.batch_year ? `Batch ${profile.batch_year}` : (user?.user_metadata?.batch_year ? `Batch ${user.user_metadata.batch_year}` : '');
    const skills = Array.isArray(profile?.skills) ? profile.skills.join(', ') : '';
    attached.innerHTML = `
      <span class="avatar">${escapeHtml(fullName.slice(0, 2).toUpperCase())}</span>
      <div><strong>${escapeHtml(fullName)}</strong><small>${escapeHtml(dept)} · ${escapeHtml(batch)} · ${escapeHtml(skills)}</small></div>
    `;
  }

  function setupApplyModalForPitch(pitchId) {
    const pitch = pitchesData.find(p => p.id === pitchId);
    const dialog = document.getElementById('apply-dialog');
    const idInput = document.getElementById('apply-pitch-id');
    const titleEl = document.getElementById('apply-pitch-title');
    const rolesGrid = document.getElementById('apply-roles');
    const user = getCurrentUser();
    const profile = getCurrentProfile();

    if (idInput) idInput.value = pitchId;
    if (titleEl && pitch) titleEl.textContent = pitch.title;

    if (rolesGrid && pitch && Array.isArray(pitch.roles_needed)) {
      rolesGrid.innerHTML = pitch.roles_needed
        .map(
          (role, idx) => `
          <label class="option">
            <input type="radio" name="role_applied" value="${escapeHtml(role)}" ${idx === 0 ? 'checked' : ''} required>
            <span>${escapeHtml(role)}</span>
          </label>
        `
        )
        .join('');
    }

    updateApplyDialogAttachedProfile(user, profile);
  }

  async function handleApplySubmit(e) {
    if (e.submitter && e.submitter.getAttribute('formmethod') === 'dialog') return;
    e.preventDefault();

    const sb = getSupabase();
    const user = getCurrentUser();
    const form = e.target;
    const msgEl = document.getElementById('apply-message-status');
    const submitBtn = form.querySelector('button.btn--primary');

    if (!user) {
      if (msgEl) msgEl.textContent = 'Please sign in to apply.';
      return;
    }

    const pitch_id = form.querySelector('#apply-pitch-id')?.value;
    const role_applied = form.querySelector('input[name="role_applied"]:checked')?.value;
    const message = form.querySelector('#apply-message')?.value.trim() || null;

    if (!pitch_id || !role_applied) {
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = 'Please choose a role to apply for.';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }

    try {
      const { error } = await sb.from('pitch_applications').insert({
        pitch_id,
        applicant_id: user.id,
        role_applied,
        message,
        status: 'pending'
      });

      if (error) {
        if (error.code === '23505') {
          throw new Error('You have already applied for this pitch.');
        }
        throw error;
      }

      form.reset();
      const dialog = document.getElementById('apply-dialog');
      if (dialog) dialog.close();
      showToast('Application sent to the Project Lead! 📬', 'success');
    } catch (err) {
      console.error('Apply error:', err);
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = err.message || 'Failed to submit application.';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send application';
      }
    }
  }

  async function loadWorkspaces() {
    const listEl = document.getElementById('workspace-list');
    const user = getCurrentUser();
    const sb = getSupabase();
    const workspaceEl = document.querySelector('.workspace');
    const emptyEl = document.getElementById('workspace-empty');
    if (!listEl || !sb || !user) return;

    try {
      const { data: myPitches } = await sb
        .from('project_pitches')
        .select('id, title, creator_id')
        .eq('creator_id', user.id);

      const { data: myApps } = await sb
        .from('pitch_applications')
        .select('pitch_id, status, pitch:project_pitches(id, title)')
        .eq('applicant_id', user.id);

      listEl.innerHTML = '';

      const ownedPitches = myPitches || [];
      const applications = (myApps || []).filter(a => Boolean(a.pitch));
      const totalWorkspaces = ownedPitches.length + applications.length;
      const acceptedApps = applications.filter(a => a.status === 'accepted');
      const hasUnlocked = ownedPitches.length > 0 || acceptedApps.length > 0;

      if (totalWorkspaces === 0) {
        if (workspaceEl) workspaceEl.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        const msgList = document.getElementById('message-list');
        const taskList = document.getElementById('task-list');
        if (msgList) msgList.innerHTML = '';
        if (taskList) taskList.innerHTML = '';
        updateTaskProgress();
        activeWorkspacePitchId = null;
        return;
      }

      if (hasUnlocked) {
        if (workspaceEl) workspaceEl.hidden = false;
        if (emptyEl) emptyEl.hidden = true;
      } else {
        if (workspaceEl) workspaceEl.hidden = false;
        if (emptyEl) emptyEl.hidden = true;
      }

      if (ownedPitches.length > 0) {
        ownedPitches.forEach((p, idx) => {
          const li = document.createElement('li');
          li.innerHTML = `<a class="workspace-link" href="#workspace" data-pitch-id="${p.id}"><strong>${escapeHtml(p.title)}</strong><small>Lead</small></a>`;
          listEl.appendChild(li);
          if (idx === 0 && !activeWorkspacePitchId) {
            selectWorkspace(p.id, p.title);
          }
        });
      }

      if (applications.length > 0) {
        applications.forEach((app, idx) => {
          const li = document.createElement('li');
          if (app.status === 'accepted') {
            li.innerHTML = `<a class="workspace-link" href="#workspace" data-pitch-id="${app.pitch.id}"><strong>${escapeHtml(app.pitch.title)}</strong><small>Member</small></a>`;
            if (ownedPitches.length === 0 && idx === 0 && !activeWorkspacePitchId) {
              selectWorkspace(app.pitch.id, app.pitch.title);
            }
          } else {
            li.innerHTML = `<span class="workspace-link workspace-link--locked"><strong>${escapeHtml(app.pitch.title)}</strong><small>Pending application</small></span>`;
          }
          listEl.appendChild(li);
        });
      }

      if (!hasUnlocked) {
        const msgList = document.getElementById('message-list');
        const taskList = document.getElementById('task-list');
        if (msgList) msgList.innerHTML = '';
        if (taskList) taskList.innerHTML = '';
        updateTaskProgress();
        activeWorkspacePitchId = null;
      }

      listEl.querySelectorAll('a.workspace-link').forEach(link => {
        link.addEventListener('click', e => {
          e.preventDefault();
          listEl.querySelectorAll('a.workspace-link').forEach(a => a.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
          const pId = link.dataset.pitchId;
          const pTitle = link.querySelector('strong').textContent;
          selectWorkspace(pId, pTitle);
        });
      });
    } catch (err) {
      console.warn('Workspace load error:', err);
    }
  }

  async function selectWorkspace(pitchId, title) {
    activeWorkspacePitchId = pitchId;
    const threadTitle = document.getElementById('thread-title');
    if (threadTitle) threadTitle.textContent = title;

    await loadWorkspaceMessages(pitchId);
    subscribeToWorkspaceMessages(pitchId);
    await loadWorkspaceTasks(pitchId);
    await loadLeadApplications(pitchId);
  }

  async function loadWorkspaceMessages(pitchId) {
    const listEl = document.getElementById('message-list');
    const sb = getSupabase();
    const user = getCurrentUser();
    if (!listEl || !sb) return;

    try {
      const { data, error } = await sb
        .from('workspace_messages')
        .select(`
          id,
          pitch_id,
          sender_id,
          message_text,
          created_at,
          sender:profiles(id, full_name, department)
        `)
        .eq('pitch_id', pitchId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      listEl.innerHTML = '';
      (data || []).forEach(msg => {
        appendMessageToThread(msg, user?.id);
      });

      listEl.scrollTop = listEl.scrollHeight;
    } catch (err) {
      console.warn('Workspace messages error:', err);
    }
  }

  function appendMessageToThread(msg, currentUserId) {
    const listEl = document.getElementById('message-list');
    const template = document.getElementById('message-template');
    if (!listEl || !template) return;

    const clone = template.content.cloneNode(true);
    const li = clone.querySelector('li');
    const isOwn = currentUserId && msg.sender_id === currentUserId;

    if (isOwn) li.classList.add('message--own');

    const senderName = isOwn ? 'You' : msg.sender?.full_name || 'Teammate';
    const avatarEl = clone.querySelector('.avatar');
    if (avatarEl) avatarEl.textContent = (msg.sender?.full_name || 'TM').slice(0, 2).toUpperCase();

    const senderEl = clone.querySelector('[data-field="sender"]');
    if (senderEl) senderEl.textContent = senderName;

    const timeEl = clone.querySelector('[data-field="created_at"]');
    if (timeEl) {
      timeEl.setAttribute('datetime', msg.created_at);
      timeEl.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const textEl = clone.querySelector('[data-field="message_text"]');
    if (textEl) textEl.textContent = msg.message_text;

    listEl.appendChild(clone);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function subscribeToWorkspaceMessages(pitchId) {
    const sb = getSupabase();
    if (!sb) return;

    if (workspaceRealtimeChannel) {
      sb.removeChannel(workspaceRealtimeChannel);
    }

    workspaceRealtimeChannel = sb
      .channel(`workspace-chat:${pitchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workspace_messages',
          filter: `pitch_id=eq.${pitchId}`
        },
        async payload => {
          const user = getCurrentUser();
          const { data: senderProfile } = await sb
            .from('profiles')
            .select('id, full_name, department')
            .eq('id', payload.new.sender_id)
            .maybeSingle();

          const messageWithSender = { ...payload.new, sender: senderProfile };
          appendMessageToThread(messageWithSender, user?.id);
        }
      )
      .subscribe();
  }

  async function handleWorkspaceMessageSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('message-input');
    const text = input?.value.trim();
    const user = getCurrentUser();
    const sb = getSupabase();

    if (!text || !activeWorkspacePitchId || !user || !sb) return;

    input.value = '';

    try {
      const { error } = await sb.from('workspace_messages').insert({
        pitch_id: activeWorkspacePitchId,
        sender_id: user.id,
        message_text: text
      });

      if (error) throw error;
    } catch (err) {
      console.error('Send message error:', err);
      showToast('Could not send message.', 'error');
    }
  }

  async function loadLeadApplications(pitchId) {
    const panel = document.getElementById('applications-panel');
    const listEl = document.getElementById('application-list');
    const sb = getSupabase();
    const user = getCurrentUser();
    if (!panel || !listEl || !sb || !user) return;

    const pitch = pitchesData.find(p => p.id === pitchId);
    const isLead = pitch && pitch.creator_id === user.id;

    panel.hidden = !isLead;
    if (!isLead) return;

    try {
      const { data, error } = await sb
        .from('pitch_applications')
        .select(`
          id,
          role_applied,
          message,
          status,
          created_at,
          applicant:profiles(id, full_name, department, batch_year)
        `)
        .eq('pitch_id', pitchId)
        .eq('status', 'pending');

      if (error) throw error;

      listEl.innerHTML = '';
      if (!data || data.length === 0) {
        listEl.innerHTML = '<li class="muted" style="padding:0.75rem;">No pending applications.</li>';
        return;
      }

      data.forEach(app => {
        const li = document.createElement('li');
        li.className = 'application';
        li.dataset.applicationId = app.id;
        li.innerHTML = `
          <div class="application__who">
            <span class="avatar avatar--info">${escapeHtml((app.applicant?.full_name || 'AP').slice(0, 2).toUpperCase())}</span>
            <div><strong>${escapeHtml(app.applicant?.full_name || 'Student')}</strong><small>${escapeHtml(app.applicant?.department || '')} ${app.applicant?.batch_year || ''} &middot; ${escapeHtml(app.role_applied)}</small></div>
          </div>
          <p class="application__msg">${escapeHtml(app.message || 'No note attached.')}</p>
          <div class="application__actions">
            <button type="button" class="btn btn--primary btn--sm" data-action="accept">Accept</button>
            <button type="button" class="btn btn--ghost btn--sm" data-action="decline">Decline</button>
          </div>
        `;

        li.querySelector('[data-action="accept"]').addEventListener('click', () =>
          updateApplicationStatus(app.id, 'accepted', li)
        );
        li.querySelector('[data-action="decline"]').addEventListener('click', () =>
          updateApplicationStatus(app.id, 'rejected', li)
        );

        listEl.appendChild(li);
      });
    } catch (err) {
      console.warn('Lead application load error:', err);
    }
  }

  async function updateApplicationStatus(appId, newStatus, itemEl) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('pitch_applications')
        .update({ status: newStatus })
        .eq('id', appId);

      if (error) throw error;

      showToast(`Applicant ${newStatus === 'accepted' ? 'accepted into team' : 'declined'}.`, 'success');
      itemEl.remove();
    } catch (err) {
      console.error('App update error:', err);
      showToast('Could not update application.', 'error');
    }
  }

  function setupTaskCheckboxes() {
    const checklist = document.getElementById('task-list');
    if (!checklist) return;

    checklist.addEventListener('change', async e => {
      if (e.target.type === 'checkbox') {
        updateTaskProgress();
        const taskId = e.target.dataset.taskId;
        const isDone = e.target.checked;
        if (taskId) {
          const sb = getSupabase();
          if (sb) {
            try {
              const { error } = await sb
                .from('workspace_tasks')
                .update({ is_done: isDone })
                .eq('id', taskId);
              if (error) throw error;
            } catch (err) {
              console.error('Task update error:', err);
              showToast('Could not update task status.', 'error');
            }
          }
        }
      }
    });
    updateTaskProgress();
  }

  function updateTaskProgress() {
    const checklist = document.getElementById('task-list');
    const progressEl = document.getElementById('task-progress');
    const textEl = document.getElementById('task-progress-text');
    if (!checklist || !progressEl || !textEl) return;

    const total = checklist.querySelectorAll('input[type="checkbox"]').length;
    const done = checklist.querySelectorAll('input[type="checkbox"]:checked').length;
    progressEl.max = total || 1;
    progressEl.value = done;
    textEl.textContent = `${done} of ${total} done`;

    const pctEl = textEl.nextElementSibling;
    if (pctEl) {
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      pctEl.textContent = `${pct}%`;
    }
  }

  async function loadWorkspaceTasks(pitchId) {
    const checklist = document.getElementById('task-list');
    const sb = getSupabase();
    if (!checklist || !sb) return;

    try {
      const { data, error } = await sb
        .from('workspace_tasks')
        .select('id, pitch_id, creator_id, assignee_name, title, is_done, created_at')
        .eq('pitch_id', pitchId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      checklist.innerHTML = '';
      (data || []).forEach(task => {
        appendTaskToList(task);
      });
      updateTaskProgress();
    } catch (err) {
      console.warn('Workspace tasks error:', err);
    }
  }

  function appendTaskToList(task) {
    const checklist = document.getElementById('task-list');
    if (!checklist) return;

    const li = document.createElement('li');
    li.dataset.taskId = task.id;
    li.innerHTML = `
      <label class="check">
        <input type="checkbox" ${task.is_done ? 'checked' : ''} data-task-id="${task.id}">
        <span class="check__text">${escapeHtml(task.title)}<small>${escapeHtml(task.assignee_name || 'Team')}</small></span>
      </label>
    `;
    checklist.appendChild(li);
  }

  async function handleTaskSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('task-input');
    const text = input?.value.trim();
    const checklist = document.getElementById('task-list');
    const sb = getSupabase();
    const user = getCurrentUser();
    const profile = getCurrentProfile();

    if (!text || !checklist) return;
    if (!activeWorkspacePitchId || !user || !sb) {
      showToast('Select an active workspace to add tasks.', 'error');
      return;
    }

    const assigneeName = profile?.full_name || user.user_metadata?.full_name || 'You';

    try {
      const { data, error } = await sb
        .from('workspace_tasks')
        .insert({
          pitch_id: activeWorkspacePitchId,
          creator_id: user.id,
          assignee_name: assigneeName,
          title: text,
          is_done: false
        })
        .select()
        .single();

      if (error) throw error;

      appendTaskToList(data);
      input.value = '';
      updateTaskProgress();
      showToast('Task added to checklist.', 'success');
    } catch (err) {
      console.error('Task create error:', err);
      showToast('Could not add task.', 'error');
    }
  }

  // =========================================================================
  // 4. CAMPUS BOARD & ANONYMOUS FEEDBACK (feedback.html / data-page="feedback")
  // =========================================================================

  let feedbackData = [];
  let currentFeedbackCategory = 'all';
  let currentFeedbackSort = 'trending';
  let userVotedFeedbackIds = new Set();
  let userAuthoredFeedbackIds = new Set();

  const PROFANITY_PATTERN = /\b(bitch|bastard|fuck|shit|asshole|damn|crap|cunt|dick|whore|piss|scam|fraud|idiot|stupid)\b/i;
  const PERSONAL_NAME_PREFIXES = /\b(dr\.?|prof\.?|professor|sir|madam|mr\.?|mrs\.?|ms\.?|dean|chairman|chairperson|engr\.?)\s+[a-z]{2,}/i;

  function generateAnonymousHandle() {
    const profile = getCurrentProfile();
    const dept = profile?.department ? profile.department.toUpperCase().slice(0, 3) : 'CSE';

    let cached = sessionStorage.getItem('pub_hub_anon_handle');
    if (cached) {
      if (profile?.department && !cached.startsWith(`Anon-${dept}-`)) {
        // Regenerate if cached handle was set with a fallback before profile was loaded
      } else {
        return cached;
      }
    }

    const randNum = Math.floor(100 + Math.random() * 900);
    const handle = `Anon-${dept}-${randNum}`;

    sessionStorage.setItem('pub_hub_anon_handle', handle);
    return handle;
  }

  function updateAnonymousHandleUI() {
    const handle = generateAnonymousHandle();
    const handleSpan = document.getElementById('feedback-dialog-handle');
    const anonHandleSpan = document.getElementById('anon-handle');
    if (handleSpan) handleSpan.textContent = handle;
    if (anonHandleSpan) anonHandleSpan.textContent = handle;
  }

  function updateFeedbackCategoryCounts(data = feedbackData) {
    const filterGroup = document.getElementById('category-filter');
    if (!filterGroup) return;

    const counts = {
      all: data.length,
      faculty: 0,
      labs: 0,
      facilities: 0,
      admin: 0
    };

    data.forEach(item => {
      const cat = (item.category || '').toLowerCase();
      if (counts[cat] !== undefined) {
        counts[cat] += 1;
      }
    });

    filterGroup.querySelectorAll('button.chip[data-filter]').forEach(chip => {
      const cat = chip.dataset.filter;
      const countEl = chip.querySelector('.chip__count');
      if (countEl && counts[cat] !== undefined) {
        countEl.textContent = counts[cat];
      }
    });
  }

  async function initFeedbackPage() {
    const form = document.getElementById('feedback-form');
    const filterGroup = document.getElementById('category-filter');
    const sortFieldset = document.getElementById('feedback-sort');
    const contentTextarea = document.getElementById('feedback-content');

    updateAnonymousHandleUI();

    if (filterGroup) {
      filterGroup.addEventListener('click', e => {
        const chip = e.target.closest('button.chip');
        if (!chip) return;

        filterGroup.querySelectorAll('button.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        currentFeedbackCategory = chip.dataset.filter || 'all';
        renderFeedbackList();
      });
    }

    if (sortFieldset) {
      const checkedRadio = sortFieldset.querySelector('input[name="sort"]:checked');
      if (checkedRadio) currentFeedbackSort = checkedRadio.value;

      sortFieldset.addEventListener('change', e => {
        if (e.target.name === 'sort') {
          currentFeedbackSort = e.target.value;
          renderFeedbackList();
        }
      });
    }

    if (contentTextarea) {
      contentTextarea.addEventListener('input', () => {
        validateFeedbackInput(contentTextarea.value);
      });
    }

    if (form) {
      form.addEventListener('submit', handleFeedbackSubmit);
    }

    const editForm = document.getElementById('edit-feedback-form');
    if (editForm) {
      editForm.addEventListener('submit', handleEditFeedbackSubmit);
    }

    const editContentTextarea = document.getElementById('edit-feedback-content');
    if (editContentTextarea) {
      editContentTextarea.addEventListener('input', () => {
        const countEl = document.getElementById('edit-feedback-content-count');
        if (countEl) countEl.textContent = `${editContentTextarea.value.length} / 1000`;
      });
    }
  }

  function validateFeedbackInput(text) {
    const errorEl = document.getElementById('feedback-filter-message');
    if (!errorEl) return true;

    if (PROFANITY_PATTERN.test(text)) {
      errorEl.textContent = 'Posting guidelines: Please remove inappropriate language or profanity before submitting.';
      errorEl.style.display = 'block';
      return false;
    }

    if (PERSONAL_NAME_PREFIXES.test(text)) {
      errorEl.textContent =
        'Posting guidelines: Do not target specific staff or student names. Please refer to the course code, lab, or office instead.';
      errorEl.style.display = 'block';
      return false;
    }

    errorEl.textContent = '';
    errorEl.style.display = 'none';
    return true;
  }


  async function loadCampusFeedback() {
    const feed = document.getElementById('feedback-feed');
    const sb = getSupabase();
    if (!feed || !sb) return;

    feed.setAttribute('aria-busy', 'true');

    try {
      const { data, error } = await sb
        .from('campus_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      feedbackData = data || [];

      // Load server-side votes for this user
      const user = getCurrentUser();
      userVotedFeedbackIds = new Set();
      if (user) {
        try {
          const { data: votedIds, error: voteErr } = await sb.rpc('get_my_feedback_votes');
          if (!voteErr && Array.isArray(votedIds)) {
            votedIds.forEach(id => userVotedFeedbackIds.add(id));
          }
        } catch (voteErr) {
          console.warn('Could not load voted feedback IDs:', voteErr);
        }
      }
      // Also load feedback IDs the user authored (for edit/delete buttons)
      userAuthoredFeedbackIds = new Set();
      if (user) {
        try {
          const { data: authoredIds, error: authErr } = await sb.rpc('get_my_feedback_ids');
          if (!authErr && Array.isArray(authoredIds)) {
            authoredIds.forEach(id => userAuthoredFeedbackIds.add(id));
          }
        } catch (authErr) {
          console.warn('Could not load authored feedback IDs:', authErr);
        }
      }

      updateFeedbackCategoryCounts(feedbackData);
      renderFeedbackList();
      renderTrendingFeedback(feedbackData);
    } catch (err) {
      console.warn('PUB Hub: Using sample feedback records:', err.message);
    } finally {
      feed.setAttribute('aria-busy', 'false');
    }
  }

  function renderFeedbackList() {
    const feed = document.getElementById('feedback-feed');
    const template = document.getElementById('feedback-card-template');
    const emptyState = document.getElementById('feedback-empty');
    if (!feed || !template) return;

    feed.innerHTML = '';

    updateFeedbackCategoryCounts(feedbackData);

    const sorted = [...feedbackData].sort((a, b) => {
      if (currentFeedbackSort === 'trending') {
        const voteDiff = (b.upvotes_count || 0) - (a.upvotes_count || 0);
        if (voteDiff !== 0) return voteDiff;
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const filtered = sorted.filter(item => {
      if (currentFeedbackCategory === 'all') return true;
      return item.category.toLowerCase() === currentFeedbackCategory.toLowerCase();
    });

    if (emptyState) emptyState.hidden = filtered.length > 0;

    filtered.forEach(post => {
      const clone = template.content.cloneNode(true);
      const article = clone.querySelector('article');

      const ageInDays = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const isLocked = Boolean(post.is_locked || ageInDays >= 20);

      article.dataset.id = post.id;
      article.dataset.category = post.category;
      article.dataset.locked = String(isLocked);

      if (isLocked) article.classList.add('is-locked');
      if (post.admin_keep) article.classList.add('is-kept');

      const voteBtn = clone.querySelector('.vote__btn');
      const voteCount = clone.querySelector('[data-field="upvotes_count"]');
      if (voteCount) voteCount.textContent = post.upvotes_count || 0;

      const isUpvoted = userVotedFeedbackIds.has(post.id);
      voteBtn.setAttribute('aria-pressed', String(isUpvoted));

      if (isLocked) {
        voteBtn.disabled = true;
      } else {
        voteBtn.addEventListener('click', () => handleFeedbackUpvote(post.id, voteBtn, voteCount));
      }

      const handleEl = clone.querySelector('[data-field="anonymous_handle"]');
      if (handleEl) handleEl.textContent = post.anonymous_handle || 'Anon-Student';

      const tagEl = clone.querySelector('[data-field="category"]');
      if (tagEl) {
        tagEl.className = `tag tag--${post.category}`;
        const labels = {
          faculty: 'Faculty & Grading',
          labs: 'Labs & Equipment',
          facilities: 'Facilities',
          admin: 'Administration'
        };
        tagEl.textContent = labels[post.category] || (post.category.charAt(0).toUpperCase() + post.category.slice(1));
      }

      const lockedBadge = clone.querySelector('[data-field="locked"]');
      if (lockedBadge) lockedBadge.hidden = !isLocked;

      const keepBadge = clone.querySelector('[data-field="admin_keep"]');
      if (keepBadge) keepBadge.hidden = !post.admin_keep;

      const timeEl = clone.querySelector('time[data-field="created_at"]');
      if (timeEl) {
        timeEl.setAttribute('datetime', post.created_at);
        timeEl.textContent = formatRelativeTime(post.created_at);
      }

      const contentEl = clone.querySelector('[data-field="content"]');
      if (contentEl) contentEl.textContent = post.content;

      const fillEl = clone.querySelector('.lifecycle__fill');
      const lifecycleTextEl = clone.querySelector('[data-field="lifecycle"]');

      if (post.admin_keep) {
        if (fillEl) fillEl.style.setProperty('--progress', '100%');
        if (lifecycleTextEl) lifecycleTextEl.textContent = 'Kept past 60 days';
      } else if (ageInDays < 20) {
        const remaining = Math.max(1, 20 - Math.floor(ageInDays));
        const progressPct = Math.min(100, Math.round((ageInDays / 20) * 100));
        if (fillEl) fillEl.style.setProperty('--progress', `${progressPct}%`);
        if (lifecycleTextEl) lifecycleTextEl.textContent = `Locks in ${remaining} days`;
      } else {
        const remainingPurge = Math.max(1, 60 - Math.floor(ageInDays));
        const progressPct = Math.min(100, Math.round((ageInDays / 60) * 100));
        if (fillEl) fillEl.style.setProperty('--progress', `${progressPct}%`);
        if (lifecycleTextEl) lifecycleTextEl.textContent = `Deleted in ${remainingPurge} days`;
      }

      const adminCheckbox = clone.querySelector('input[name="admin_keep"]');
      if (adminCheckbox) {
        adminCheckbox.checked = Boolean(post.admin_keep);
        adminCheckbox.addEventListener('change', async () => {
          await toggleAdminKeep(post.id, adminCheckbox.checked);
        });
      }

      const user = getCurrentUser();
      const isAdmin = window.PubAuth && typeof window.PubAuth.isAdmin === 'function' ? window.PubAuth.isAdmin() : false;
      const isAuthor = userAuthoredFeedbackIds.has(post.id);

      if (user && (isAuthor || isAdmin)) {
        const actionsBar = document.createElement('div');
        actionsBar.className = 'owner-actions';
        actionsBar.innerHTML = `
          <span class="owner-actions__label">${isAuthor ? 'Your post (anonymous)' : 'Admin'}</span>
          ${isAuthor && !isLocked ? `<button type="button" class="btn btn--ghost btn--xs btn-edit-feedback" data-id="${post.id}">Edit</button>` : ''}
          <button type="button" class="btn btn--ghost btn--xs btn--danger btn-delete-feedback" data-id="${post.id}">Delete</button>
        `;
        const editBtn = actionsBar.querySelector('.btn-edit-feedback');
        if (editBtn) {
          editBtn.addEventListener('click', () => openEditFeedbackDialog(post));
        }
        const delBtn = actionsBar.querySelector('.btn-delete-feedback');
        if (delBtn) {
          delBtn.addEventListener('click', () => handleDeleteFeedback(post.id));
        }
        article.appendChild(actionsBar);
      }

      feed.appendChild(clone);
    });
  }

  function renderTrendingFeedback(list) {
    const trendingList = document.getElementById('trending-list');
    if (!trendingList) return;

    if (!list || list.length === 0) {
      trendingList.innerHTML = '<li class="muted">No trending feedback yet.</li>';
      return;
    }

    const sorted = [...list].sort((a, b) => (b.upvotes_count || 0) - (a.upvotes_count || 0)).slice(0, 3);

    trendingList.innerHTML = sorted
      .map(
        item => `
        <li>
          <span>${escapeHtml(item.content.slice(0, 48))}…</span>
          <span class="rank-list__votes">${item.upvotes_count || 0}</span>
        </li>
      `
      )
      .join('');
  }

  async function handleFeedbackUpvote(feedbackId, btn, countEl) {
    const sb = getSupabase();
    if (!sb) return;

    if (!getCurrentUser()) {
      showToast('Please sign in to upvote campus feedback.', 'error');
      return;
    }

    if (btn.disabled) return;
    btn.disabled = true;

    try {
      const { data, error } = await sb.rpc('toggle_feedback_upvote', {
        p_feedback_id: feedbackId
      });

      if (error) throw error;

      if (data && data.success) {
        countEl.textContent = data.upvotes_count;
        const isActive = Boolean(data.active);
        btn.setAttribute('aria-pressed', String(isActive));
        if (isActive) {
          userVotedFeedbackIds.add(feedbackId);
          showToast('Upvoted anonymously. 👍', 'success');
        } else {
          userVotedFeedbackIds.delete(feedbackId);
          showToast('Upvote removed.', 'info');
        }
        const item = feedbackData.find(f => f.id === feedbackId);
        if (item) {
          item.upvotes_count = data.upvotes_count;
          renderTrendingFeedback(feedbackData);
        }
      } else {
        showToast(data?.error || 'Could not register upvote.', 'error');
      }
    } catch (err) {
      console.error('Upvote error:', err);
      showToast(err.message || 'Upvote failed.', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function toggleAdminKeep(feedbackId, keepValue) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('campus_feedback')
        .update({ admin_keep: keepValue })
        .eq('id', feedbackId);

      if (error) throw error;
      showToast(`Feedback retention ${keepValue ? 'enabled' : 'disabled'}.`, 'success');
    } catch (err) {
      console.error('Retention toggle error:', err);
      showToast('Admin update failed.', 'error');
    }
  }

  async function handleFeedbackSubmit(e) {
    if (e.submitter && e.submitter.getAttribute('formmethod') === 'dialog') return;
    e.preventDefault();

    const sb = getSupabase();
    const form = e.target;
    const msgEl = document.getElementById('feedback-filter-message');
    const submitBtn = form.querySelector('button.btn--accent');

    if (!getCurrentUser()) {
      if (msgEl) {
        msgEl.textContent = 'You must be signed in to submit feedback.';
        msgEl.style.display = 'block';
      }
      return;
    }

    const content = form.querySelector('#feedback-content')?.value.trim();
    const category = form.querySelector('input[name="category"]:checked')?.value || 'labs';

    if (!content || content.length < 20) {
      if (msgEl) {
        msgEl.textContent = 'Feedback must be at least 20 characters long.';
        msgEl.style.display = 'block';
      }
      return;
    }

    if (!validateFeedbackInput(content)) return;

    const handle = generateAnonymousHandle();

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    try {
      const { data, error } = await sb.rpc('submit_feedback', {
        p_anonymous_handle: handle,
        p_category: category,
        p_content: content
      });

      if (error) throw error;

      if (data && data.success) {
        userAuthoredFeedbackIds.add(data.id);
        const newPost = {
          id: data.id,
          anonymous_handle: handle,
          category,
          content,
          upvotes_count: 0,
          is_locked: false,
          admin_keep: false,
          created_at: new Date().toISOString()
        };

        feedbackData.unshift(newPost);
        renderFeedbackList();
        renderTrendingFeedback(feedbackData);
        form.reset();

        const dialog = document.getElementById('feedback-dialog');
        if (dialog) dialog.close();
        showToast('Anonymous feedback submitted! 🛡️', 'success');
      } else {
        throw new Error(data?.error || 'Could not post feedback.');
      }
    } catch (err) {
      console.error('Feedback submit error:', err);
      if (msgEl) {
        msgEl.textContent = err.message || 'Could not post feedback.';
        msgEl.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post anonymously';
      }
    }
  }

  function openEditFeedbackDialog(post) {
    const dialog = document.getElementById('edit-feedback-dialog');
    const idInput = document.getElementById('edit-feedback-id');
    const contentInput = document.getElementById('edit-feedback-content');
    const countEl = document.getElementById('edit-feedback-content-count');
    const msgEl = document.getElementById('edit-feedback-message');
    if (!dialog || !idInput || !contentInput) return;

    idInput.value = post.id;
    contentInput.value = post.content || '';
    if (countEl) countEl.textContent = `${contentInput.value.length} / 1000`;
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.style.display = 'none';
    }
    dialog.showModal();
  }

  async function handleEditFeedbackSubmit(e) {
    if (e.submitter && e.submitter.getAttribute('formmethod') === 'dialog') return;
    e.preventDefault();

    const sb = getSupabase();
    const form = e.target;
    const id = document.getElementById('edit-feedback-id')?.value;
    const content = document.getElementById('edit-feedback-content')?.value.trim();
    const msgEl = document.getElementById('edit-feedback-message');
    const submitBtn = form.querySelector('button.btn--accent');

    if (!getCurrentUser()) {
      if (msgEl) {
        msgEl.textContent = 'You must be signed in to edit feedback.';
        msgEl.style.display = 'block';
      }
      return;
    }

    if (!content || content.length < 20) {
      if (msgEl) {
        msgEl.textContent = 'Feedback must be at least 20 characters long.';
        msgEl.style.display = 'block';
      }
      return;
    }

    if (!validateFeedbackInput(content)) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
    }

    try {
      const { data, error } = await sb.rpc('edit_my_feedback', {
        p_feedback_id: id,
        p_content: content
      });

      if (error) throw error;

      if (data && data.success) {
        const item = feedbackData.find(f => f.id === id);
        if (item) {
          item.content = content;
        }
        renderFeedbackList();
        renderTrendingFeedback(feedbackData);
        form.reset();
        const dialog = document.getElementById('edit-feedback-dialog');
        if (dialog) dialog.close();
        showToast('Feedback updated! 🛡️', 'success');
      } else {
        throw new Error(data?.error || 'Could not update feedback.');
      }
    } catch (err) {
      console.error('Edit feedback error:', err);
      if (msgEl) {
        msgEl.textContent = err.message || 'Could not edit feedback.';
        msgEl.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save changes';
      }
    }
  }

  async function handleDeleteFeedback(feedbackId) {
    if (!confirm('Are you sure you want to delete this feedback post? This cannot be undone.')) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { data, error } = await sb.rpc('delete_my_feedback', {
        p_feedback_id: feedbackId
      });

      if (error) throw error;

      if (data && data.success) {
        feedbackData = feedbackData.filter(f => f.id !== feedbackId);
        userAuthoredFeedbackIds.delete(feedbackId);
        userVotedFeedbackIds.delete(feedbackId);
        renderFeedbackList();
        renderTrendingFeedback(feedbackData);
        showToast('Feedback post deleted.', 'info');
      } else {
        showToast(data?.error || 'Could not delete feedback.', 'error');
      }
    } catch (err) {
      console.error('Delete feedback error:', err);
      showToast(err.message || 'Could not delete feedback.', 'error');
    }
  }

  // =========================================================================
  // 5. HALL OF FAME (hall-of-fame.html / data-page="hall-of-fame")
  // =========================================================================

  let hofData = [];
  let currentHofCategory = 'all';
  let userReactionsSet = new Set();
  let editingHofId = null;

  async function initHallOfFamePage() {
    const form = document.getElementById('publish-form');
    const filterGroup = document.getElementById('hof-filter');
    const publishDialog = document.getElementById('publish-dialog');

    if (filterGroup) {
      filterGroup.addEventListener('click', e => {
        const chip = e.target.closest('button.chip');
        if (!chip) return;

        filterGroup.querySelectorAll('button.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        currentHofCategory = chip.dataset.filter || 'all';
        renderHallOfFameList();
      });
    }

    if (form) form.addEventListener('submit', handlePublishBroadcastSubmit);

    if (publishDialog) {
      publishDialog.addEventListener('close', () => {
        editingHofId = null;
        const titleEl = document.getElementById('publish-dialog-title');
        if (titleEl) titleEl.textContent = 'Publish official announcement';
        if (form) {
          form.reset();
          const submitBtn = form.querySelector('button.btn--accent');
          if (submitBtn) submitBtn.textContent = 'Publish broadcast';
        }
      });
    }
  }

  async function handleHofReaction(hofId, reactionType, button) {
    const sb = getSupabase();
    if (!sb) return;

    if (!getCurrentUser()) {
      showToast('Please sign in to react to Hall of Fame announcements.', 'error');
      return;
    }

    if (button.disabled) return;
    button.disabled = true;

    try {
      const { data, error } = await sb.rpc('increment_hof_reaction', {
        p_hof_id: hofId,
        p_reaction_type: reactionType
      });

      if (error) throw error;

      if (data && data.success) {
        // Recompute all 3 reaction counts from the returned reaction_counts
        const article = button.closest('article');
        if (article && data.reaction_counts) {
          ['applaud', 'celebrate', 'inspiring'].forEach(rt => {
            const btn = article.querySelector(`[data-reaction="${rt}"]`);
            if (btn) {
              btn.querySelector('.cheer__count').textContent = data.reaction_counts[rt] || 0;
            }
          });
        }
        const isActive = Boolean(data.active);
        button.setAttribute('aria-pressed', String(isActive));
        const key = `${hofId}:${reactionType}`;
        if (isActive) {
          userReactionsSet.add(key);
          showToast('Reaction added! 🏆', 'success');
        } else {
          userReactionsSet.delete(key);
          showToast('Reaction removed.', 'info');
        }
        const item = hofData.find(h => h.id === hofId);
        if (item) item.reaction_counts = data.reaction_counts;
      } else {
        showToast(data?.error || 'Could not record reaction.', 'error');
      }
    } catch (err) {
      console.error('Reaction error:', err);
      showToast(err.message || 'Could not record reaction.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function renderFeaturedBroadcast(item) {
    const featuredCard = document.querySelector('.broadcast-featured');
    if (!featuredCard || !item) return;

    featuredCard.dataset.id = item.id;
    featuredCard.dataset.category = item.category;

    const tagEl = featuredCard.querySelector('.tag');
    if (tagEl) {
      tagEl.className = `tag tag--${item.category}`;
      tagEl.textContent = item.category.charAt(0).toUpperCase() + item.category.slice(1);
    }

    const timeEl = featuredCard.querySelector('time');
    if (timeEl) {
      timeEl.setAttribute('datetime', item.created_at);
      timeEl.textContent = formatRelativeTime(item.created_at);
    }

    const titleEl = featuredCard.querySelector('h3');
    if (titleEl) titleEl.textContent = item.title;

    const descEl = featuredCard.querySelector('p:not(.publisher)');
    if (descEl) descEl.textContent = item.description;

    const proofEl = featuredCard.querySelector('.link-pill');
    if (proofEl) {
      if (item.proof_link) {
        proofEl.href = item.proof_link;
        proofEl.hidden = false;
      } else {
        proofEl.hidden = true;
      }
    }

    const sealEl = featuredCard.querySelector('.publisher__seal');
    if (sealEl) sealEl.textContent = (item.publisher?.department || 'PUB').slice(0, 3).toUpperCase();

    const unitEl = featuredCard.querySelector('.publisher__unit');
    if (unitEl) unitEl.textContent = item.publisher?.department || 'Institutional Announcement';

    const roleEl = featuredCard.querySelector('.publisher__role');
    if (roleEl && item.publisher?.role) roleEl.textContent = item.publisher.role;

    if (item.image_url) {
      let img = featuredCard.querySelector('img.broadcast-featured__thumb');
      if (!img) {
        img = document.createElement('img');
        img.className = 'broadcast-featured__thumb card__thumb';
        img.style.maxHeight = '240px';
        img.style.width = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = 'var(--radius-md)';
        img.style.marginBottom = 'var(--space-md)';
        const bodyEl = featuredCard.querySelector('.broadcast-featured__body');
        if (bodyEl) bodyEl.insertBefore(img, bodyEl.firstChild);
      }
      img.src = item.image_url;
      img.alt = item.title;
      img.hidden = false;
    }

    featuredCard.querySelectorAll('button.cheer[data-reaction]').forEach(btn => {
      const reactionType = btn.dataset.reaction;
      const countEl = btn.querySelector('.cheer__count');
      if (countEl && item.reaction_counts) {
        countEl.textContent = item.reaction_counts[reactionType] || 0;
      }
      const isPressed = userReactionsSet.has(`${item.id}:${reactionType}`);
      btn.setAttribute('aria-pressed', String(isPressed));
      btn.onclick = () => handleHofReaction(item.id, reactionType, btn);
    });
  }

  async function loadHallOfFame() {
    const feed = document.getElementById('hof-feed');
    const sb = getSupabase();
    if (!feed || !sb) return;

    feed.setAttribute('aria-busy', 'true');

    try {
      const user = getCurrentUser();
      userReactionsSet = new Set();
      if (user) {
        try {
          const { data: reactRows } = await sb
            .from('hall_of_fame_reactions')
            .select('hof_id, reaction_type')
            .eq('user_id', user.id);
          (reactRows || []).forEach(r => userReactionsSet.add(`${r.hof_id}:${r.reaction_type}`));
        } catch (err) {
          console.warn('Could not load user reactions:', err);
        }
      }

      const { data, error } = await sb
        .from('hall_of_fame')
        .select(`
          id,
          publisher_id,
          category,
          title,
          description,
          proof_link,
          image_url,
          is_featured,
          reaction_counts,
          created_at,
          publisher:profiles!publisher_id(id, full_name, department, role)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      hofData = data || [];
      const featuredCard = document.querySelector('.broadcast-featured');
      const featuredSection = featuredCard?.closest('section');
      const featuredItem = hofData.find(i => i.is_featured) || hofData[0];

      if (featuredItem) {
        if (featuredSection) featuredSection.hidden = false;
        if (featuredCard) featuredCard.hidden = false;
        renderFeaturedBroadcast(featuredItem);
      } else {
        if (featuredSection) featuredSection.hidden = true;
        if (featuredCard) featuredCard.hidden = true;
      }

      renderHallOfFameList();
    } catch (err) {
      console.warn('PUB Hub: Using sample Hall of Fame broadcasts:', err.message);
    } finally {
      feed.setAttribute('aria-busy', 'false');
    }
  }

  function renderHallOfFameList() {
    const feed = document.getElementById('hof-feed');
    const template = document.getElementById('broadcast-template');
    const emptyState = document.getElementById('hof-empty');
    if (!feed || !template) return;

    feed.innerHTML = '';

    const filtered = hofData.filter(item => {
      if (currentHofCategory === 'all') return true;
      return item.category.toLowerCase() === currentHofCategory.toLowerCase();
    });

    if (emptyState) emptyState.hidden = filtered.length > 0;

    filtered.forEach(item => {
      const clone = template.content.cloneNode(true);
      const article = clone.querySelector('article');
      const date = new Date(item.created_at);

      article.dataset.id = item.id;
      article.dataset.category = item.category;

      const img = clone.querySelector('img.card__thumb');
      if (img && item.image_url) {
        img.src = item.image_url;
        img.alt = item.title || 'Announcement image';
        img.hidden = false;
      }

      const dayEl = clone.querySelector('.broadcast__day');
      const monthEl = clone.querySelector('.broadcast__month');
      if (dayEl) dayEl.textContent = String(date.getDate()).padStart(2, '0');
      if (monthEl) monthEl.textContent = date.toLocaleDateString('en-GB', { month: 'short' });

      const catEl = clone.querySelector('[data-field="category"]');
      if (catEl) {
        catEl.className = `tag tag--${item.category}`;
        catEl.textContent = item.category.charAt(0).toUpperCase() + item.category.slice(1);
      }

      const timeEl = clone.querySelector('[data-field="created_at"]');
      if (timeEl) {
        timeEl.setAttribute('datetime', item.created_at);
        timeEl.textContent = formatRelativeTime(item.created_at);
      }

      const titleEl = clone.querySelector('[data-field="title"]');
      if (titleEl) titleEl.textContent = item.title;

      const bodyEl = clone.querySelector('[data-field="details"]');
      if (bodyEl) bodyEl.textContent = item.description;

      const proofLink = clone.querySelector('[data-field="proof_link"]');
      if (proofLink) {
        if (item.proof_link) {
          proofLink.href = item.proof_link;
        } else {
          proofLink.remove();
        }
      }

      const unitEl = clone.querySelector('[data-field="publisher_unit"]');
      if (unitEl) {
        unitEl.textContent = `${item.publisher?.department || 'Official Announcement'}`;
      }

      clone.querySelectorAll('button.cheer[data-reaction]').forEach(btn => {
        const reactionType = btn.dataset.reaction;
        const countEl = btn.querySelector('.cheer__count');
        if (countEl && item.reaction_counts) {
          countEl.textContent = item.reaction_counts[reactionType] || 0;
        }
        const isPressed = userReactionsSet.has(`${item.id}:${reactionType}`);
        btn.setAttribute('aria-pressed', String(isPressed));
        btn.addEventListener('click', () => handleHofReaction(item.id, reactionType, btn));
      });

      const user = getCurrentUser();
      const isAdmin = window.PubAuth && typeof window.PubAuth.isAdmin === 'function' ? window.PubAuth.isAdmin() : false;
      const isPublisher = user && item.publisher_id === user.id;

      if (user && (isPublisher || isAdmin)) {
        const actionsBar = document.createElement('div');
        actionsBar.className = 'owner-actions';
        actionsBar.innerHTML = `
          <span class="owner-actions__label">${isPublisher ? 'Your broadcast' : 'Admin'}</span>
          ${isPublisher || isAdmin ? `<button type="button" class="btn btn--ghost btn--xs btn-edit-hof" data-id="${item.id}">Edit</button>` : ''}
          <button type="button" class="btn btn--ghost btn--xs btn--danger btn-delete-hof" data-id="${item.id}">Delete</button>
        `;
        const editBtn = actionsBar.querySelector('.btn-edit-hof');
        if (editBtn) {
          editBtn.addEventListener('click', () => openEditHofDialog(item));
        }
        const delBtn = actionsBar.querySelector('.btn-delete-hof');
        if (delBtn) {
          delBtn.addEventListener('click', () => handleDeleteHof(item.id));
        }
        article.appendChild(actionsBar);
      }

      feed.appendChild(clone);
    });
  }

  function openEditHofDialog(item) {
    const dialog = document.getElementById('publish-dialog');
    const form = document.getElementById('publish-form');
    if (!dialog || !form) return;

    editingHofId = item.id;
    const titleEl = document.getElementById('publish-dialog-title');
    if (titleEl) titleEl.textContent = 'Edit official announcement';

    const titleInput = form.querySelector('#publish-title');
    if (titleInput) titleInput.value = item.title || '';

    const detailsInput = form.querySelector('#publish-details');
    if (detailsInput) detailsInput.value = item.description || '';

    const proofInput = form.querySelector('#publish-proof');
    if (proofInput) proofInput.value = item.proof_link || '';

    const catRadio = form.querySelector(`input[name="category"][value="${item.category}"]`);
    if (catRadio) catRadio.checked = true;

    const featCheckbox = form.querySelector('input[name="featured"]');
    if (featCheckbox) featCheckbox.checked = Boolean(item.is_featured);

    const submitBtn = form.querySelector('button.btn--accent');
    if (submitBtn) submitBtn.textContent = 'Save changes';

    const msgEl = document.getElementById('publish-message');
    if (msgEl) msgEl.textContent = '';

    dialog.showModal();
  }

  async function handleDeleteHof(hofId) {
    if (!confirm('Are you sure you want to delete this Hall of Fame announcement? This cannot be undone.')) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('hall_of_fame').delete().eq('id', hofId);
      if (error) throw error;

      hofData = hofData.filter(h => h.id !== hofId);
      renderHallOfFameList();
      showToast('Announcement deleted.', 'info');
    } catch (err) {
      console.error('Delete broadcast error:', err);
      showToast(err.message || 'Could not delete announcement.', 'error');
    }
  }

  async function handlePublishBroadcastSubmit(e) {
    if (e.submitter && e.submitter.getAttribute('formmethod') === 'dialog') return;
    e.preventDefault();

    const sb = getSupabase();
    const user = getCurrentUser();
    const form = e.target;
    const msgEl = document.getElementById('publish-message');
    const submitBtn = form.querySelector('button.btn--accent');

    if (!user || (!window.PubAuth?.isPublisher() && !window.PubAuth?.isAdmin())) {
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = 'Only authorized university publishers or admins can post here.';
      }
      return;
    }

    const title = form.querySelector('#publish-title')?.value.trim();
    const details = form.querySelector('#publish-details')?.value.trim();
    const proof_link = form.querySelector('#publish-proof')?.value.trim();
    const category = form.querySelector('input[name="category"]:checked')?.value || 'contest';
    const isFeatured = Boolean(form.querySelector('input[name="featured"]')?.checked);
    const imgFile = form.querySelector('#publish-image')?.files?.[0];

    if (!title || !details || !proof_link) {
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = 'Headline, details, and proof link are required.';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = editingHofId ? 'Saving…' : 'Publishing…';
    }

    try {
      let imageUrl = null;
      if (imgFile) {
        imageUrl = await uploadImageToStorage(imgFile, 'broadcasts');
      }

      if (editingHofId) {
        const updates = {
          title,
          description: details,
          category,
          proof_link,
          is_featured: isFeatured
        };
        if (imageUrl) {
          updates.image_url = imageUrl;
        }

        const { data, error } = await sb
          .from('hall_of_fame')
          .update(updates)
          .eq('id', editingHofId)
          .select(`
            id,
            publisher_id,
            category,
            title,
            description,
            proof_link,
            image_url,
            is_featured,
            reaction_counts,
            created_at,
            publisher:profiles(id, full_name, department, role)
          `)
          .single();

        if (error) throw error;

        const idx = hofData.findIndex(h => h.id === editingHofId);
        if (idx !== -1) {
          hofData[idx] = {
            ...hofData[idx],
            ...data
          };
        }
        if (data.is_featured) {
          renderFeaturedBroadcast(data);
        }
        renderHallOfFameList();
        form.reset();

        const dialog = document.getElementById('publish-dialog');
        if (dialog) dialog.close();
        editingHofId = null;
        showToast('Official announcement updated! 🏆', 'success');
        return;
      }

      const { data, error } = await sb
        .from('hall_of_fame')
        .insert({
          publisher_id: user.id,
          title,
          description: details,
          category,
          proof_link,
          image_url: imageUrl,
          is_featured: isFeatured,
          reaction_counts: { applaud: 0, celebrate: 0, inspiring: 0 }
        })
        .select(`
          id,
          publisher_id,
          category,
          title,
          description,
          proof_link,
          image_url,
          is_featured,
          reaction_counts,
          created_at,
          publisher:profiles(id, full_name, department, role)
        `)
        .single();

      if (error) throw error;

      hofData.unshift(data);
      if (data.is_featured) {
        renderFeaturedBroadcast(data);
      }
      renderHallOfFameList();
      form.reset();

      const dialog = document.getElementById('publish-dialog');
      if (dialog) dialog.close();
      showToast('Official announcement published to Hall of Fame! 🏆', 'success');
    } catch (err) {
      console.error('Broadcast publishing error:', err);
      if (msgEl) {
        msgEl.className = 'form-message form-message--error';
        msgEl.textContent = err.message || 'Could not publish announcement.';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingHofId ? 'Save changes' : 'Publish broadcast';
      }
    }
  }

  // =========================================================================
  // 6. GLOBAL INITIALIZATION ENTRY POINT & AUTH-READY ORCHESTRATION
  // =========================================================================

  let activePageLoadedUser = null;

  function runActivePageLoaders() {
    const page = document.body?.dataset.page;
    if (page === 'spotlight') {
      loadAchievements();
      loadMiniHallOfFame();
      loadSpotlightStats();
    } else if (page === 'collab') {
      loadPitches();
      loadWorkspaces();
    } else if (page === 'feedback') {
      updateAnonymousHandleUI();
      loadCampusFeedback();
    } else if (page === 'hall-of-fame') {
      loadHallOfFame();
    }
  }

  function handleAuthReady(user, profile) {
    updateApplyDialogAttachedProfile(user, profile);

    if (!user) {
      activePageLoadedUser = null;
      return; // Do not run authenticated Supabase queries while user is null
    }

    const run = () => {
      if (activePageLoadedUser === user.id) return;
      activePageLoadedUser = user.id;
      runActivePageLoaders();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  // Listen for pub:auth-ready dispatched from js/auth.js
  document.addEventListener('pub:auth-ready', event => {
    handleAuthReady(event.detail?.user, event.detail?.profile);
  });

  // Listen for pub:profile-updated dispatched from js/auth.js
  document.addEventListener('pub:profile-updated', event => {
    const user = event.detail?.user || getCurrentUser();
    const profile = event.detail?.profile || getCurrentProfile();

    updateApplyDialogAttachedProfile(user, profile);

    const page = document.body?.dataset.page;
    if (page === 'feedback') {
      updateAnonymousHandleUI();
    } else if (page === 'spotlight' && user && Array.isArray(achievementsData)) {
      let changed = false;
      achievementsData.forEach(post => {
        if (post.author_id === user.id && post.author) {
          post.author.full_name = profile?.full_name || post.author.full_name;
          post.author.department = profile?.department || post.author.department;
          post.author.batch_year = profile?.batch_year || post.author.batch_year;
          changed = true;
        }
      });
      if (changed) {
        renderAchievements();
      }
    } else if (page === 'collab' && user && Array.isArray(pitchesData)) {
      let changed = false;
      pitchesData.forEach(pitch => {
        if (pitch.creator_id === user.id && pitch.creator) {
          pitch.creator.full_name = profile?.full_name || pitch.creator.full_name;
          pitch.creator.department = profile?.department || pitch.creator.department;
          pitch.creator.batch_year = profile?.batch_year || pitch.creator.batch_year;
          changed = true;
        }
      });
      if (changed) {
        renderPitches(pitchesData);
      }
    }
  });

  // Handle case where pub:auth-ready fired before this listener was attached
  if (window.PubAuth?.authReady && window.PubAuth?.user) {
    handleAuthReady(window.PubAuth.user, window.PubAuth.profile);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupGenericDialogs();
    setupCharCounters();

    const page = document.body?.dataset.page;
    if (page === 'spotlight') {
      initSpotlightPage();
    } else if (page === 'collab') {
      initCollabPage();
    } else if (page === 'feedback') {
      initFeedbackPage();
    } else if (page === 'hall-of-fame') {
      initHallOfFamePage();
    }

    // Handle case where pub:auth-ready already resolved by the time DOMContentLoaded runs
    if (window.PubAuth?.authReady && window.PubAuth?.user) {
      handleAuthReady(window.PubAuth.user, window.PubAuth.profile);
    }
  });
})();
