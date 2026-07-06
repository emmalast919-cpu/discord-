/* ─── localStorage cache ─────────────────────────────────────────────────────
   Keeps user data across server restarts so the UI doesn't flash a login screen
   every time the Replit container wakes up. Nothing sensitive is stored.
   ─────────────────────────────────────────────────────────────────────────── */
const LS = {
  get:    (k)    => { try { return JSON.parse(localStorage.getItem("lh_" + k)); } catch { return null; } },
  set:    (k, v) => { try { localStorage.setItem("lh_" + k, JSON.stringify(v)); } catch {} },
  remove: (k)    => { try { localStorage.removeItem("lh_" + k); } catch {} },
  clear:  ()     => { ["user","config","guilds"].forEach(k => LS.remove(k)); },
};

/* ─── Global state ──────────────────────────────────────────────────────────── */
let CATEGORIES       = [];
let CURRENT_CHANNELS = [];
let CURRENT_GUILD_ID = null;
let INVITE_BASE      = "";
let initialState     = new Map(); // logType → { channelId, channelName, enabled }
let pendingChanges   = new Map(); // logType → { channelId, channelName, enabled }
let modalResolve     = null;      // resolve fn while modal is open

/* ─── Utilities ─────────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function avatarUrl(u) {
  if (u?.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u?.id || "0") % 5n)}.png`;
}
function guildIconUrl(g) {
  return g?.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96` : null;
}

/* ─── Toast ─────────────────────────────────────────────────────────────────── */
function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  el.className = "toast toast-" + type + " show";
  el.innerHTML = `<span class="toast-dot ${type === "error" ? "dot-red" : "dot-green"}"></span>${esc(msg)}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3500);
}

/* ─── API helper ────────────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 401) {
    LS.clear();
    window.location.href = "/";
    throw new Error("Not authenticated");
  }
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    // Server returned something unexpected (crash page, proxy error, etc) instead of JSON.
    throw new Error(`The server isn't responding correctly (HTTP ${res.status}). Try again in a moment.`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ─── Unsaved changes ───────────────────────────────────────────────────────── */
function markDirty() { document.getElementById("saveBar").classList.add("show"); }
function markClean() { pendingChanges.clear(); document.getElementById("saveBar").classList.remove("show"); }
function effectiveState(t) {
  return pendingChanges.get(t) ?? initialState.get(t) ?? { channelId: null, channelName: null, enabled: false };
}
function queueChange(type, patch) {
  pendingChanges.set(type, { ...effectiveState(type), ...patch });
  markDirty();
}

/* ─── Save / Reset ──────────────────────────────────────────────────────────── */
async function saveAllChanges() {
  if (!pendingChanges.size) return;
  const btn = document.getElementById("saveBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const ok = [], fail = [];
  for (const [logType, state] of pendingChanges) {
    try {
      await api(`/api/guilds/${CURRENT_GUILD_ID}/logs`, {
        method: "POST",
        body: JSON.stringify({ logType, channelId: state.channelId || null, channelName: state.channelName || null, enabled: state.enabled }),
      });
      initialState.set(logType, { ...state });
      ok.push(logType);
    } catch { fail.push(logType); }
  }
  for (const t of ok) pendingChanges.delete(t);

  btn.disabled = false;
  btn.innerHTML = `Save changes`;
  if (fail.length) toast(`${fail.length} item(s) failed to save — try again`, "error");
  else { markClean(); toast("All changes saved!"); }
}

function resetAllChanges() {
  pendingChanges.clear(); markClean();
  openCategories.clear(); CATEGORIES.forEach((c, i) => { if (i === 0) openCategories.add(c.key); });
  renderCategories();
}

/* ─── Bulk apply helpers ────────────────────────────────────────────────────── */
async function applyBulkToServer(scope, category, channelId, channelName, enabled) {
  await api(`/api/guilds/${CURRENT_GUILD_ID}/logs/bulk`, {
    method: "POST",
    body: JSON.stringify({ scope, category, channelId, channelName, enabled }),
  });
}

/* ─── Modal ─────────────────────────────────────────────────────────────────── */
function openModal(title) {
  return new Promise(resolve => {
    modalResolve = resolve;
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalSearch").value = "";
    renderModalList("");
    document.getElementById("modalBackdrop").classList.add("open");
    document.getElementById("modalSearch").focus();
  });
}
function closeModal(result = null) {
  document.getElementById("modalBackdrop").classList.remove("open");
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}
const CHANNEL_TYPE_ICON = {
  text:         "#",
  announcement: "📢",
  forum:        "🗂️",
};

function renderModalList(q) {
  const list  = document.getElementById("modalChannels");
  const empty = document.getElementById("modalEmpty");
  const filter = q.toLowerCase();
  const filtered = CURRENT_CHANNELS.filter(c => !filter || c.channel_name.toLowerCase().includes(filter));
  if (!filtered.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";

  const recent = (LS.get("recentChannels_" + CURRENT_GUILD_ID) || []);
  const sorted = [...filtered].sort((a, b) => {
    const ra = recent.indexOf(a.channel_id), rb = recent.indexOf(b.channel_id);
    if (ra === -1 && rb === -1) return 0;
    if (ra === -1) return 1;
    if (rb === -1) return -1;
    return ra - rb;
  });

  list.innerHTML = sorted.map(c => {
    const icon = CHANNEL_TYPE_ICON[c.channel_type] || "#";
    const isRecent = recent.includes(c.channel_id);
    return `
    <button class="mchan-btn" data-id="${esc(c.channel_id)}" data-name="${esc(c.channel_name)}">
      <span class="hash">${icon}</span>${esc(c.channel_name)}
      ${isRecent ? '<span class="mchan-recent">Recent</span>' : ""}
    </button>`;
  }).join("");
  list.querySelectorAll(".mchan-btn").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.dataset.id, name = b.dataset.name;
      const key = "recentChannels_" + CURRENT_GUILD_ID;
      const rec = (LS.get(key) || []).filter(x => x !== id);
      rec.unshift(id);
      LS.set(key, rec.slice(0, 5));
      closeModal({ channelId: id, channelName: name });
    });
  });
}

/* ─── Channel pill HTML ─────────────────────────────────────────────────────── */
function pillIcon(channelId) {
  const c = CURRENT_CHANNELS.find(c => c.channel_id === channelId);
  return CHANNEL_TYPE_ICON[c?.channel_type] || "#";
}
function pillHtml(channelId, channelName, extraCls = "") {
  if (!channelId) return `<button class="set-ch-btn${extraCls}">Set channel</button>`;
  return `<span class="ch-pill${extraCls}"><span class="hash">${pillIcon(channelId)}</span>${esc(channelName || channelId)}<button class="pill-x" title="Remove">×</button></span>`;
}

/* ─── Skeleton loaders ──────────────────────────────────────────────────────── */
function skeletonCards(n = 6) {
  return Array.from({length:n}).map(() => `
    <div class="guild-card skel">
      <div class="sk sk-circle"></div>
      <div class="sk sk-line" style="width:60%"></div>
      <div class="sk sk-line" style="width:35%"></div>
    </div>`).join("");
}
function skeletonCats(n = 7) {
  return Array.from({length:n}).map(() => `
    <div class="cat-card skel" style="height:52px">
      <div class="sk sk-line" style="width:28%;height:14px;margin:19px 18px"></div>
    </div>`).join("");
}

/* ─── User chip ─────────────────────────────────────────────────────────────── */
function renderUserChip(user) {
  document.getElementById("userChip").innerHTML = `
    <div class="user-chip">
      <img src="${avatarUrl(user)}" alt="" />
      <span>${esc(user.username)}</span>
      <button class="chip-logout" id="logoutBtn">Logout</button>
    </div>`;
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await fetch("/logout", { method: "POST" }).catch(() => {});
    LS.clear();
    window.location.href = "/";
  });
}

/* ─── Server list ───────────────────────────────────────────────────────────── */
async function showServerList() {
  document.getElementById("serverListView").style.display = "block";
  document.getElementById("guildDetailView").style.display = "none";
  markClean();

  const grid = document.getElementById("guildGrid");
  // Show cached guilds immediately (feels instant)
  const cached = LS.get("guilds");
  if (cached?.length) renderGuildCards(grid, cached);
  else grid.innerHTML = skeletonCards();

  try {
    const { guilds, inviteBase } = await api("/api/guilds");
    INVITE_BASE = inviteBase;
    LS.set("guilds", guilds);
    renderGuildCards(grid, guilds);
  } catch (e) {
    if (!cached?.length) grid.innerHTML = `<div class="empty-state"><p>Failed to load servers.<br><small>${esc(e.message)}</small></p></div>`;
  }
}

function renderGuildCards(grid, guilds) {
  if (!guilds.length) {
    grid.innerHTML = `<div class="empty-state"><p>No manageable servers found.</p></div>`;
    return;
  }
  grid.innerHTML = guilds.map(g => {
    const icon = guildIconUrl(g);
    const iconEl = icon
      ? `<img class="gc-icon" src="${icon}" alt="" />`
      : `<div class="gc-icon gc-letter">${esc(g.name[0])}</div>`;
    const badge = g.botAdded
      ? `<span class="badge b-green">● Bot Active</span>`
      : `<span class="badge b-red">● Bot Missing</span>`;
    const action = g.botAdded
      ? `<a class="btn-sm" href="/dash.html?guild=${g.id}">Manage Logs</a>`
      : `<a class="btn-sm btn-outline" target="_blank" href="${INVITE_BASE}&guild_id=${g.id}&disable_guild_select=true">Add Bot</a>`;
    return `
      <div class="guild-card" onclick="${g.botAdded ? `location.href='/dash.html?guild=${g.id}'` : ""}">
        ${iconEl}
        <div class="gc-body">
          <span class="gc-name">${esc(g.name)}</span>
          ${badge}
        </div>
        ${action}
      </div>`;
  }).join("");
}

/* ─── Guild detail ──────────────────────────────────────────────────────────── */
async function showGuildDetail(guildId) {
  CURRENT_GUILD_ID = guildId;
  document.getElementById("serverListView").style.display = "none";
  document.getElementById("guildDetailView").style.display = "block";
  document.getElementById("logList").innerHTML = skeletonCats();
  document.getElementById("guildTitle").textContent = "Loading…";

  // Populate header from cache immediately
  const cachedGuilds = LS.get("guilds") || [];
  const cachedGuild  = cachedGuilds.find(g => g.id === guildId);
  if (cachedGuild) setGuildHeader(cachedGuild);

  try {
    const { guilds, inviteBase } = await api("/api/guilds");
    INVITE_BASE = inviteBase;
    LS.set("guilds", guilds);
    const guild = guilds.find(g => g.id === guildId);
    if (guild) setGuildHeader(guild);

    if (!guild?.botAdded) {
      document.getElementById("logList").innerHTML = `
        <div class="empty-state">
          <p>The bot isn't in this server yet.</p>
          <a class="btn-primary" target="_blank" href="${INVITE_BASE}&guild_id=${guildId}&disable_guild_select=true">Add Bot to Server</a>
        </div>`;
      return;
    }

    const [{ channels }, { logs }] = await Promise.all([
      api(`/api/guilds/${guildId}/channels`),
      api(`/api/guilds/${guildId}/logs`),
    ]);
    CURRENT_CHANNELS = channels;

    initialState.clear(); pendingChanges.clear();
    for (const r of logs) {
      initialState.set(r.log_type, { channelId: r.channel_id || null, channelName: r.channel_name || null, enabled: Boolean(r.enabled) });
    }

    if (!channels.length) toast("No channels found — make sure the bot is online in this server.", "error");

    renderBulkBar();
    renderCategories();

  } catch (e) {
    document.getElementById("logList").innerHTML = `<div class="empty-state"><p>Failed to load.<br><small>${esc(e.message)}</small></p></div>`;
  }
}

function setGuildHeader(guild) {
  document.getElementById("guildTitle").textContent = guild.name;
  const av = document.getElementById("guildAvatar");
  const icon = guildIconUrl(guild);
  av.innerHTML = icon
    ? `<img src="${icon}" alt="" />`
    : `<div class="av-letter">${esc(guild.name[0])}</div>`;
}

/* ─── Bulk bar ──────────────────────────────────────────────────────────────── */
function renderBulkBar() {
  document.getElementById("bulkBar").innerHTML = `
    <button class="tbtn" id="setAllBtn">Set all channels</button>
    <button class="tbtn tbtn-ghost" id="clearAllBtn">Clear all channels</button>`;

  document.getElementById("setAllBtn").addEventListener("click", async () => {
    const picked = await openModal("Set channel for ALL log types");
    if (!picked) return;
    CATEGORIES.forEach(c => c.types.forEach(t => queueChange(t.key, { channelId: picked.channelId, channelName: picked.channelName, enabled: true })));
    renderCategories();
    toast(`All types → #${picked.channelName}`);
  });

  document.getElementById("clearAllBtn").addEventListener("click", () => {
    CATEGORIES.forEach(c => c.types.forEach(t => queueChange(t.key, { channelId: null, channelName: null, enabled: false })));
    renderCategories();
    toast("Cleared all log channels");
  });
}

/* ─── Category rendering ────────────────────────────────────────────────────── */
const openCategories = new Set();

function renderCategories() {
  const list = document.getElementById("logList");
  list.innerHTML = CATEGORIES.map((cat, i) => {
    const isOpen = openCategories.has(cat.key) || i === 0;
    if (i === 0) openCategories.add(cat.key);

    // Count configured types
    const configured = cat.types.filter(t => effectiveState(t.key).channelId).length;
    const countBadge = configured > 0
      ? `<span class="cat-count">${configured}/${cat.types.length}</span>`
      : "";

    // Category-level channel (all same?)
    const chIds = cat.types.map(t => effectiveState(t.key).channelId).filter(Boolean);
    const allSame = chIds.length > 0 && chIds.every(id => id === chIds[0]);
    const catChId = allSame ? chIds[0] : null;
    const catChName = allSame ? effectiveState(cat.types[0].key).channelName : null;

    return `
      <div class="cat-card" data-cat="${esc(cat.key)}">
        <div class="cat-head">
          <button class="cat-toggle" data-cat="${esc(cat.key)}">
            <svg class="chevron ${isOpen?"open":""}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
              <path d="M5 8l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="cat-icon-wrap">
              <svg class="icon" width="15" height="15"><use href="/icons.svg#${esc(cat.icon)}"/></svg>
            </span>
            <span class="cat-name">${esc(cat.label)}</span>
            ${countBadge}
          </button>
          <div class="cat-actions">
            ${catChId
              ? `<span class="ch-pill cat-pill"><span class="hash">#</span>${esc(catChName||catChId)}<button class="pill-x cat-clear" data-cat="${esc(cat.key)}" title="Clear">×</button></span>`
              : `<button class="set-cat-btn" data-cat="${esc(cat.key)}">Set category</button>`
            }
          </div>
        </div>
        <div class="cat-body ${isOpen?"open":""}" data-body="${esc(cat.key)}">
          ${cat.types.map(type => {
            const s = effectiveState(type.key);
            return `
              <div class="log-row" data-type="${esc(type.key)}">
                <div class="log-meta">
                  <span class="log-name">${esc(type.label)}</span>
                  <span class="log-desc">${esc(type.description)}</span>
                </div>
                <div class="log-controls">
                  <div class="ch-wrap">${pillHtml(s.channelId, s.channelName)}</div>
                  <label class="tog" title="${s.enabled?"Disable":"Enable"}">
                    <input type="checkbox" class="tog-input" ${s.enabled && s.channelId ? "checked" : ""} />
                    <span class="tog-slider"></span>
                  </label>
                </div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }).join("");

  bindCategoryEvents(list);
}

function bindCategoryEvents(list) {
  // Expand/collapse
  list.querySelectorAll(".cat-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const key  = btn.dataset.cat;
      const body = list.querySelector(`[data-body="${key}"]`);
      const chev = btn.querySelector(".chevron");
      const open = !body.classList.contains("open");
      body.classList.toggle("open", open);
      chev.classList.toggle("open", open);
      if (open) openCategories.add(key); else openCategories.delete(key);
    });
  });

  // Set category channel
  list.querySelectorAll(".set-cat-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cat = CATEGORIES.find(c => c.key === btn.dataset.cat);
      if (!cat) return;
      const picked = await openModal(`${cat.label} — set category channel`);
      if (!picked) return;
      cat.types.forEach(t => queueChange(t.key, { channelId: picked.channelId, channelName: picked.channelName, enabled: true }));
      openCategories.add(cat.key);
      renderCategories();
      toast(`"${cat.label}" → #${picked.channelName}`);
    });
  });

  // Clear category channel
  list.querySelectorAll(".cat-clear").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const cat = CATEGORIES.find(c => c.key === btn.dataset.cat);
      if (!cat) return;
      cat.types.forEach(t => queueChange(t.key, { channelId: null, channelName: null, enabled: false }));
      openCategories.add(btn.dataset.cat);
      renderCategories();
    });
  });

  // Per-type events
  list.querySelectorAll(".log-row").forEach(row => {
    const logType = row.dataset.type;
    const toggle  = row.querySelector(".tog-input");

    async function pickChannel() {
      const typeDef = CATEGORIES.flatMap(c => c.types).find(t => t.key === logType);
      const picked  = await openModal(typeDef?.label ?? logType);
      if (!picked) return;
      queueChange(logType, { channelId: picked.channelId, channelName: picked.channelName, enabled: true });
      const catKey = CATEGORIES.find(c => c.types.some(t => t.key === logType))?.key;
      if (catKey) openCategories.add(catKey);
      renderCategories();
    }

    row.querySelectorAll(".set-ch-btn").forEach(b => b.addEventListener("click", pickChannel));
    row.querySelectorAll(".ch-pill:not(.cat-pill)").forEach(pill => {
      pill.addEventListener("click", e => { if (!e.target.closest(".pill-x")) pickChannel(); });
    });
    row.querySelectorAll(".pill-x:not(.cat-clear)").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        queueChange(logType, { channelId: null, channelName: null, enabled: false });
        const catKey = CATEGORIES.find(c => c.types.some(t => t.key === logType))?.key;
        if (catKey) openCategories.add(catKey);
        renderCategories();
      });
    });

    toggle.addEventListener("change", () => {
      if (toggle.checked && !effectiveState(logType).channelId) {
        toggle.checked = false; toast("Set a channel first", "error"); return;
      }
      queueChange(logType, { enabled: toggle.checked });
    });
  });
}

/* ─── Init ──────────────────────────────────────────────────────────────────── */
function hidePageLoader() {
  const el = document.getElementById("pageLoader");
  if (el) el.classList.add("hide");
}

async function init() {
  // Show cached user immediately so header doesn't flash
  const cachedUser = LS.get("user");
  if (cachedUser) renderUserChip(cachedUser);

  // Load config (categories) — use cache while fetching
  const cachedConfig = LS.get("config");
  if (cachedConfig?.categories) CATEGORIES = cachedConfig.categories;

  // Verify session + get fresh data
  try {
    const [me, cfg] = await Promise.all([api("/api/me"), api("/api/config")]);
    LS.set("user", me.user);
    LS.set("config", cfg);
    CATEGORIES = cfg.categories;
    renderUserChip(me.user);
  } catch {
    hidePageLoader();
    return; // 401 handler already redirects to /
  }

  // Route
  const guildId = new URLSearchParams(location.search).get("guild");
  if (guildId) showGuildDetail(guildId);
  else showServerList();
  hidePageLoader();

  // Back button
  document.getElementById("backLink").addEventListener("click", e => {
    e.preventDefault();
    history.pushState({}, "", "/dash.html");
    markClean();
    showServerList();
  });

  // Modal events
  document.getElementById("modalClose").addEventListener("click", () => closeModal());
  document.getElementById("modalBackdrop").addEventListener("click", e => {
    if (e.target === document.getElementById("modalBackdrop")) closeModal();
  });
  document.getElementById("modalSearch").addEventListener("input", e => renderModalList(e.target.value));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // Save bar
  document.getElementById("saveBtn").addEventListener("click", saveAllChanges);
  document.getElementById("resetBtn").addEventListener("click", resetAllChanges);
}

init();
