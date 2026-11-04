  "use strict";

  // =========================================================
  // 1. CONFIGURATION + DEMO VIDEO DATA
  // Titles and channel associations below are based on matching
  // public YouTube results. Unknown durations are left blank
  // instead of inventing runtime metadata.
  // =========================================================
  const GITHUB_URL = "https://github.com/Siddiq2772/ilmo";
  const FEEDBACK_EMAIL = "diekaiju@duck.com";

  let VIDEOS = [];
  const PAGE_SIZE = 24;

  // =========================================================
  // 2. APPLICATION STATE
  // =========================================================
  const STORAGE_KEY = "islamic-video-portal.watch-later.v1";
  const CHANNELS = [
      "Yaqeen Institute",
      "Mufti Menk",
      "Bayyinah Institute",
      "FreeQuranEducation",
      "OnePath Network"
  ];
  const state = {
      query: "",
      channel: "All Channels",
      category: "All Topics",
      view: "home",
      sort: "recent",
      visibleCount: PAGE_SIZE,
      saved: new Set(),
      currentVideo: null,
      descriptionExpanded: false,
      returnFocus: null,
      mobileDrawerOpen: false
  };

  // =========================================================
  // 3. DOM REFERENCES
  // =========================================================
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const dom = {
      searchInput: $("#searchInput"),
      clearSearch: $("#clearSearch"),
      menuToggle: $("#menuToggle"),
      sidebar: $("#sidebar"),
      mobileBackdrop: $("#mobileBackdrop"),
      channelFilters: $("#channelFilters"),
      categoryFilters: $("#categoryFilters"),
      sortSelect: $("#sortSelect"),
      videoGrid: $("#videoGrid"),
      emptyStateHost: $("#emptyStateHost"),
      resultsCopy: $("#resultsCopy"),
      savedCount: $("#savedCount"),
      sidebarSavedCount: $("#sidebarSavedCount"),
      watchLaterShortcut: $("#watchLaterShortcut"),
      pageTitle: $("#pageTitle"),
      pageDescription: $("#pageDescription"),
      playerModal: $("#playerModal"),
      playerDialog: $("#playerDialog"),
      recommendationGrid: $("#recommendationGrid"),
      videoFrame: $("#videoFrame"),
      playerUnavailable: $("#playerUnavailable"),
      playerTitle: $("#playerTitle"),
      playerMeta: $("#playerMeta"),
      playerDescription: $("#playerDescription"),
      descriptionBox: $("#descriptionBox"),
      descriptionToggle: $("#descriptionToggle"),
      playerSaveButton: $("#playerSaveButton"),
      youtubeFallback: $("#youtubeFallback"),
      closePlayerButton: $("#closePlayerButton"),
      toastRegion: $("#toastRegion"),
      githubLink: $("#githubLink"),
      preferencesModal: $("#preferencesModal"),
      prefDialog: $("#prefDialog"),
      prefModalKicker: $("#prefModalKicker"),
      prefModalTitle: $("#prefModalTitle"),
      prefModalSubtitle: $("#prefModalSubtitle"),
      prefCloseBtn: $("#prefCloseBtn"),
      prefLangGrid: $("#prefLangGrid"),
      prefAudienceAdult: $("#audienceAdult"),
      prefAudienceKids: $("#audienceKids"),
      prefShuffle: $("#prefShuffle"),
      prefSaveBtn: $("#prefSaveBtn"),
      prefResetBtn: $("#prefResetBtn"),
      prefThemeGrid: $("#prefThemeGrid"),
      themeToggle: $("#themeToggle"),
      themeLabel: $("#themeLabel"),
      settingsShortcut: $("#settingsShortcut"),
      sidebarSettings: $("#sidebarSettings"),
      prefBadgeBtn: $("#prefBadgeBtn"),
      prefBadgeText: $("#prefBadgeText"),
      shuffleFeedBtn: $("#shuffleFeedBtn"),
      filterPanel: $(".filter-panel"),
      mobileBottomNav: $("#mobileBottomNav"),
      bottomSavedCount: $("#bottomSavedCount"),
      bottomNavPrefs: $("#bottomNavPrefs"),
      channelRequestModal: $("#channelRequestModal"),
      channelRequestDialog: $("#channelRequestDialog"),
      reqModalKicker: $("#reqModalKicker"),
      reqModalTitle: $("#reqModalTitle"),
      reqModalSubtitle: $("#reqModalSubtitle"),
      reqCloseBtn: $("#reqCloseBtn"),
      reqTypeAdd: $("#reqTypeAdd"),
      reqTypeRemove: $("#reqTypeRemove"),
      reqChannelName: $("#reqChannelName"),
      reqChannelUrl: $("#reqChannelUrl"),
      reqReason: $("#reqReason"),
      reqSubmitGmail: $("#reqSubmitGmail"),
      reqSubmitEmail: $("#reqSubmitEmail"),
      reqSubmitGithub: $("#reqSubmitGithub"),
      sidebarChannelRequest: $("#sidebarChannelRequest"),
      footerChannelRequest: $("#footerChannelRequest"),
      footerSupportBtn: $("#footerSupportBtn")
  };

  // =========================================================
  // 4. HELPERS
  // =========================================================
  function escapeHTML(value = "") {
      return String(value).replace(/[&<>"']/g, character => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
  }

  function icon(name, extraClass = "") {
      return `<svg class="icon ${extraClass}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function channelInitials(channel) {
      return channel.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  }

  function formatDate(dateString) {
      if (!dateString) return "Date unavailable";
      const date = new Date(dateString.includes("T") ? dateString : `${dateString}T00:00:00`);
      if (Number.isNaN(date.getTime())) return "Date unavailable";
      return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function durationToSeconds(duration) {
      if (!duration || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(duration)) return null;
      return duration.split(":").map(Number).reduce((total, value) => total * 60 + value, 0);
  }

  function isValidYouTubeId(id) {
      return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);
  }

  function getVideoById(id) {
      return VIDEOS.find(video => video.id === id) || null;
  }

  // =========================================================
  // 5. LOCAL STORAGE / WATCH LATER + USER PREFERENCES
  // =========================================================
  const PREFS_STORAGE_KEY = "islamic-video-portal.preferences.v1";
  const DEFAULT_PREFERENCES = {
      onboarded: false,
      language: "all",
      audience: "adult",
      shuffle: true,
      theme: "system"
  };
  let userPreferences = { ...DEFAULT_PREFERENCES };

  function loadPreferences() {
      try {
          const raw = localStorage.getItem(PREFS_STORAGE_KEY);
          if (!raw) return { ...DEFAULT_PREFERENCES };
          const parsed = JSON.parse(raw);
          return {
              onboarded: Boolean(parsed.onboarded),
              language: parsed.language || "all",
              audience: parsed.audience === "kids" ? "kids" : "adult",
              shuffle: parsed.shuffle !== false,
              theme: parsed.theme || "system"
          };
      } catch (e) {
          return { ...DEFAULT_PREFERENCES };
      }
  }

  function savePreferences(newPrefs) {
      userPreferences = { ...userPreferences, ...newPrefs };
      try {
          localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(userPreferences));
      } catch (e) {
          console.warn("Unable to save preferences", e);
      }
      updatePreferencesUI();
  }

  function updatePreferencesUI() {
      if (dom.prefBadgeText) {
          const langLabels = {
              all: "All Languages",
              en: "English",
              ur: "Urdu (اردو)",
              ar: "Arabic (العربية)",
              id: "Indonesian",
              bn: "Bengali (বাংলা)",
              hi: "Hindi (हिन्दी)",
              fr: "French"
          };
          const langStr = langLabels[userPreferences.language] || "All Languages";
          const modeStr = userPreferences.audience === "kids" ? "Kids & Family Mode" : "Adult Mode";
          dom.prefBadgeText.textContent = `${langStr} • ${modeStr}`;
      }
  }

  function applyTheme(themeName = userPreferences.theme || "system") {
      const isSystem = themeName === "system";
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const effectiveTheme = isSystem ? (prefersDark ? "dark" : "light") : themeName;

      document.documentElement.setAttribute("data-theme", effectiveTheme);
      document.documentElement.setAttribute("data-theme-setting", themeName);

      const metaTheme = $('meta[name="theme-color"]');
      if (metaTheme) {
          metaTheme.setAttribute("content", effectiveTheme === "dark" ? "#0f172a" : "#f8fafc");
      }

      if (dom.themeToggle) {
          const use = dom.themeToggle.querySelector("use");
          if (use) {
              use.setAttribute("href", effectiveTheme === "dark" ? "#i-sun" : "#i-moon");
          }
          const label = themeName === "system" ? "Auto" : (themeName === "dark" ? "Dark" : "Light");
          dom.themeToggle.setAttribute("title", `Theme: ${label} (${effectiveTheme} active) — click to toggle`);
          if (dom.themeLabel) dom.themeLabel.textContent = label;
      }

      if (dom.prefThemeGrid) {
          $$(".theme-card", dom.prefThemeGrid).forEach(c => {
              c.classList.toggle("active", c.dataset.theme === themeName);
          });
      }
  }

  const CHANNEL_METADATA = {};
  let ALL_CHANNELS = [];

  const COUNTRY_FLAGS = {
      "Pakistan": "🇵🇰", "United States": "🇺🇸", "India": "🇮🇳", "United Kingdom": "🇬🇧",
      "Canada": "🇨🇦", "United Arab Emirates": "🇦🇪", "Saudi Arabia": "🇸🇦", "Australia": "🇦🇺",
      "Bangladesh": "🇧🇩", "Indonesia": "🇮🇩", "Malaysia": "🇲🇾", "France": "🇫🇷",
      "Kenya": "🇰🇪", "Netherlands": "🇳🇱", "Egypt": "🇪🇬", "Morocco": "🇲🇦",
      "Germany": "🇩🇪", "South Africa": "🇿🇦", "Sweden": "🇸🇪", "Qatar": "🇶🇦",
      "Jordan": "🇯🇴", "Norway": "🇳🇴", "Iraq": "🇮🇶", "Belgium": "🇧🇪",
      "Mexico": "🇲🇽", "Italy": "🇮🇹", "Nigeria": "🇳🇬", "Palestine": "🇵🇸",
      "Malta": "🇲🇹", "China": "🇨🇳", "Senegal": "🇸🇳", "New Zealand": "🇳🇿",
      "Spain": "🇪🇸", "Austria": "🇦🇹", "Singapore": "🇸🇬", "South Korea": "🇰🇷",
      "Kuwait": "🇰🇼", "Algeria": "🇩🇿", "Ghana": "🇬🇭", "Bahrain": "🇧🇭", "Japan": "🇯🇵",
      "Turkey": "🇹🇷"
  };

  const KNOWN_CHANNEL_COUNTRIES = {
      "yaqeen institute": "United States",
      "nouman ali khan (bayyinah)": "United States",
      "mufti menk": "South Africa",
      "freequraneducation": "United States",
      "towards eternity": "Turkey"
  };

  function getCountryFlag(country) {
      return COUNTRY_FLAGS[country] || "🌐";
  }

  async function loadChannelMetadata() {
      try {
          const response = await fetch("channels.json");
          if (response.ok) {
              const data = await response.json();
              if (Array.isArray(data)) {
                  ALL_CHANNELS = data;
                  for (const ch of data) {
                      if (ch.name) {
                          const norm = ch.name.trim().toLowerCase();
                          if (!ch.country && KNOWN_CHANNEL_COUNTRIES[norm]) {
                              ch.country = KNOWN_CHANNEL_COUNTRIES[norm];
                          }
                          CHANNEL_METADATA[norm] = {
                              country: ch.country || "Unknown",
                              category: ch.category || ""
                          };
                          ch._idx = `${ch.name} ${ch.handle || ""} ${ch.country || ""} ${ch.category || ""}`.toLowerCase();
                      }
                  }
              }
          }
      } catch (e) {
          console.info("channels.json load deferred or unavailable");
      }
  }

  function detectVideoLanguage(video) {
      if (video._lang) return video._lang;
      const text = (video.title || "") + " " + (video.description || "");
      const chMeta = CHANNEL_METADATA[video.channel ? video.channel.trim().toLowerCase() : ""] || {};
      const country = chMeta.country || "";

      if (/[\u0980-\u09FF]/.test(text) || country === "Bangladesh") {
          video._lang = "bn";
          return "bn";
      }
      if (/[\u0900-\u097F]/.test(text)) {
          video._lang = "hi";
          return "hi";
      }
      if (/[\u067E\u0686\u0698\u06AF\u0679\u0688\u0691\u06BA\u06D2\u06C1\u06BE]/.test(text) || country === "Pakistan") {
          video._lang = "ur";
          return "ur";
      }
      if (/[\u0600-\u06FF]/.test(text) || ["Saudi Arabia", "United Arab Emirates", "Egypt", "Morocco", "Qatar", "Jordan", "Kuwait", "Bahrain", "Algeria", "Iraq", "Palestine"].includes(country)) {
          video._lang = "ar";
          return "ar";
      }
      if (["Indonesia", "Malaysia"].includes(country) || /\b(kajian|ustadz|ceramah|tausiyah|dakwah|sholat|bismillah|dan|yang)\b/i.test(text)) {
          video._lang = "id";
          return "id";
      }
      if (country === "France" || /\b(rappel|conférence|islamique|sourate)\b/i.test(text)) {
          video._lang = "fr";
          return "fr";
      }
      video._lang = "en";
      return "en";
  }

  function isKidsContent(video) {
      if (typeof video._kids === "boolean") return video._kids;
      const normCat = normalizeCategory(video.category);
      if (normCat === "Children & Family" || normCat === "Nasheeds & Islamic Arts") {
          video._kids = true;
          return true;
      }
      const chMeta = CHANNEL_METADATA[video.channel ? video.channel.trim().toLowerCase() : ""] || {};
      if (normalizeCategory(chMeta.category) === "Children & Family") {
          video._kids = true;
          return true;
      }
      const text = (video.title || "") + " " + (video.channel || "");
      const res = /\b(kids?|child|children|cartoon|animation|nursery|rhymes|lullaby|prophet stories for kids|learn quran|alphabet|mini believers|omar & hana|alif baa|anasheed)\b/i.test(text);
      video._kids = res;
      return res;
  }

  function shuffleArray(array) {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = arr[i];
          arr[i] = arr[j];
          arr[j] = temp;
      }
      return arr;
  }

  function loadSavedVideos() {
      try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return new Set();
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return new Set();
          const validIds = parsed.filter(id => typeof id === "string" && getVideoById(id));
          return new Set(validIds);
      } catch (error) {
          // Private browsing or restricted storage: keep the app usable in memory.
          console.warn("Watch Later storage is unavailable; using session-only saves.", error);
          return new Set();
      }
  }

  function saveSavedVideos() {
      try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.saved]));
      } catch (error) {
          // State still updates for the current page session when storage is blocked.
          console.warn("Could not persist Watch Later items in this browser.", error);
      }
  }

  function toggleWatchLater(videoId) {
      const video = getVideoById(videoId);
      if (!video) return;

      const wasSaved = state.saved.has(videoId);
      if (wasSaved) state.saved.delete(videoId);
      else state.saved.add(videoId);

      saveSavedVideos();
      updateSavedCounts();
      if (state.view === "watch-later") {
          invalidateFeedCache();
          renderVideos(false);
      } else {
          // Keep existing video grid intact; just update the bookmark button icon
          const saveButtons = dom.videoGrid.querySelectorAll(`.save-button[data-id="${videoId}"]`);
          saveButtons.forEach(btn => {
              btn.classList.toggle("saved", !wasSaved);
              btn.setAttribute("aria-pressed", !wasSaved ? "true" : "false");
              btn.setAttribute("aria-label", `${!wasSaved ? "Remove" : "Save"} ${video.title} ${!wasSaved ? "from" : "to"} Watch Later`);
          });
      }
      updatePlayerSaveButton();

      showToast(wasSaved ? "Removed from Watch Later" : "Added to Watch Later");
  }

  function updateSavedCounts() {
      const count = state.saved.size;
      if (dom.savedCount) dom.savedCount.textContent = count;
      if (dom.sidebarSavedCount) dom.sidebarSavedCount.textContent = count;
      if (dom.bottomSavedCount) {
          dom.bottomSavedCount.textContent = count;
          dom.bottomSavedCount.style.display = count > 0 ? "inline-flex" : "none";
      }
      if (dom.savedCount) dom.savedCount.setAttribute("aria-label", `${count} saved videos`);
  }

  // =========================================================
  // 6. SEARCH, FILTER + SORT LOGIC (OPTIMIZED FOR 20K+ RECORDS)
  // =========================================================
  const channelVideoCounts = {};

  function indexVideos(videos) {
      const len = videos.length;
      for (let i = 0; i < len; i++) {
          const v = videos[i];
          v._idx = `${v.title || ""} ${v.channel || ""} ${v.category || ""} ${v.description || ""}`.toLowerCase();
          if (v.channel) {
              const norm = v.channel.trim().toLowerCase();
              channelVideoCounts[norm] = (channelVideoCounts[norm] || 0) + 1;
          }
      }
  }

  const brokenThumbnails = new Set();

  const CATEGORY_ALIASES = {
      "quran studies": "Quran & Tafseer",
      "quran": "Quran & Tafseer",
      "lectures": "Lectures & Islamic Studies",
      "islamic lectures": "Lectures & Islamic Studies",
      "reminders": "Reminders & Spirituality",
      "islamic reminders": "Reminders & Spirituality",
      "history": "Islamic History & Stories",
      "islamic history": "Islamic History & Stories",
      "children": "Children & Family",
      "kids": "Children & Family",
      "nasheeds": "Nasheeds & Islamic Arts",
      "nasheed": "Nasheeds & Islamic Arts",
      "dawah": "Dawah & Outreach",
      "documentaries": "Documentaries & Media"
  };

  function normalizeCategory(cat) {
      if (!cat || cat === "All Topics") return "All Topics";
      const lower = cat.trim().toLowerCase();
      return CATEGORY_ALIASES[lower] || cat;
  }

  function isChannelMatch(videoChannel, targetChannel) {
      if (!videoChannel || !targetChannel) return false;
      const v = videoChannel.trim().toLowerCase();
      const t = targetChannel.trim().toLowerCase();
      if (v === t) return true;
      if (t.includes(v) || v.includes(t)) return true;
      if ((v.includes("bayyinah") && t.includes("bayyinah")) ||
          (v.includes("mufti menk") && t.includes("mufti menk")) ||
          (v.includes("yaqeen") && t.includes("yaqeen")) ||
          (v.includes("freequran") && t.includes("freequran")) ||
          (v.includes("onepath") && t.includes("onepath"))) {
          return true;
      }
      return false;
  }

  function isValidVideoId(id) {
    return Boolean(id && typeof id === "string" && id.length === 11 && !id.startsWith("PL") && !id.startsWith("OL") && !id.startsWith("FL") && /^[a-zA-Z0-9_-]{11}$/.test(id));
}

window.onThumbError = function(imgElement, videoId) {
      if (videoId) brokenThumbnails.add(videoId);
      const card = imgElement.closest(".video-card, .recommendation-card");
      if (card) {
          card.remove();
      }
  };

  window.onThumbLoad = function(imgElement, videoId) {
      // YouTube returns a 120x90 placeholder when a video is deleted, private, or unavailable
      if (imgElement.naturalWidth <= 120 && imgElement.naturalHeight <= 90) {
          window.onThumbError(imgElement, videoId);
      }
  };

  function filterVideos() {
      const query = state.query.trim().toLowerCase();
      const isSavedView = state.view === "watch-later";
      const filterChannel = state.channel !== "All Channels";
      const selectedCategory = normalizeCategory(state.category);
      const filterCategory = selectedCategory !== "All Topics";
      const prefLang = userPreferences.language || "all";
      const isKidsMode = userPreferences.audience === "kids";

      const results = [];
      const len = VIDEOS.length;
      for (let i = 0; i < len; i++) {
          const v = VIDEOS[i];
          if (brokenThumbnails.has(v.id)) continue;
          if (isSavedView && !state.saved.has(v.id)) continue;

          // Channel filter with case-insensitive and alias matching
          if (filterChannel && !isChannelMatch(v.channel, state.channel)) continue;

          // Topic filter (only active if not viewing a single specific channel)
          if (filterCategory && !filterChannel && v.category !== selectedCategory) continue;

          // Search query filter
          if (query && !v._idx.includes(query)) continue;

          // Language & Audience filters (apply to general multi-channel browsing, but not when user clicked a specific channel)
          if (!filterChannel && !isSavedView) {
              if (prefLang !== "all") {
                  const vLang = detectVideoLanguage(v);
                  if (vLang !== prefLang) continue;
              }
              if (isKidsMode && !isKidsContent(v)) continue;
          }

          results.push(v);
      }

      return sortVideos(results);
  }

  function sortVideos(videos) {
      if (state.sort === "random") {
          return shuffleArray(videos);
      }
      if (state.sort === "recent") {
          // Pre-sorted by publishedAt descending in pipeline
          return videos;
      }
      const sorted = [...videos];
      switch (state.sort) {
          case "oldest":
              sorted.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
              break;
          case "title-asc":
              sorted.sort((a, b) => a.title.localeCompare(b.title));
              break;
          case "title-desc":
              sorted.sort((a, b) => b.title.localeCompare(a.title));
              break;
          case "shortest":
              sorted.sort((a, b) => (durationToSeconds(a.duration) ?? Infinity) - (durationToSeconds(b.duration) ?? Infinity));
              break;
          case "longest":
              sorted.sort((a, b) => (durationToSeconds(b.duration) ?? -1) - (durationToSeconds(a.duration) ?? -1));
              break;
          default:
              break;
      }
      return sorted;
  }

  function getCurrentNavSnapshot() {
      return {
          view: state.view,
          channel: state.channel,
          category: state.category,
          query: state.query
      };
  }

  function pushNavigationState() {
      const current = getCurrentNavSnapshot();
      const prev = history.state;
      if (prev &&
          prev.view === current.view &&
          prev.channel === current.channel &&
          prev.category === current.category &&
          prev.query === current.query) {
          return;
      }
      history.pushState(current, "");
  }

  function applyNavigationState(s) {
      state.view = s.view || "home";
      state.channel = s.channel || "All Channels";
      state.category = s.category || "All Topics";
      state.query = s.query || "";
      if (dom.searchInput) dom.searchInput.value = state.query;
      if (dom.clearSearch) dom.clearSearch.classList.toggle("visible", Boolean(state.query));
      state.visibleCount = PAGE_SIZE;
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setActiveChannel(channel) {
      state.channel = channel;
      state.category = "All Topics";
      state.query = "";
      if (dom.searchInput) dom.searchInput.value = "";
      if (dom.clearSearch) dom.clearSearch.classList.remove("visible");
      state.visibleCount = PAGE_SIZE;
      state.view = state.view === "watch-later" ? "watch-later" : "home";
      pushNavigationState();
      renderAll();
  }

  function setActiveCategory(category) {
      state.category = category;
      state.visibleCount = PAGE_SIZE;
      state.view = state.view === "watch-later" ? "watch-later" : "home";
      pushNavigationState();
      renderAll();
  }

  function resetFilters() {
      state.query = "";
      state.channel = "All Channels";
      state.category = "All Topics";
      state.view = "home";
      state.visibleCount = PAGE_SIZE;
      dom.searchInput.value = "";
      dom.sortSelect.value = state.sort;
      pushNavigationState();
      renderAll();
      dom.searchInput.focus();
  }

  // =========================================================
  // 7. FILTER BAR RENDERING
  // Categories are generated from the dataset, not repeated
  // in individual card markup.
  // =========================================================
  const FEATURED_CHANNELS = [
      "All Channels",
      "Yaqeen Institute",
      "Mufti Menk",
      "Nouman Ali Khan (Bayyinah)",
      "FreeQuranEducation",
      "OnePath Network",
      "Towards Eternity",
      "MercifulServant",
      "One Islam Productions"
  ];

  function renderFilterBars() {
      const channelButtons = [...FEATURED_CHANNELS];
      if (state.channel !== "All Channels" && !channelButtons.some(ch => isChannelMatch(ch, state.channel))) {
          channelButtons.splice(1, 0, state.channel);
      }

      dom.channelFilters.innerHTML = channelButtons.map(channel => {
          const isActive = (channel === "All Channels" && state.channel === "All Channels") ||
                           (channel !== "All Channels" && isChannelMatch(channel, state.channel));
          return `
      <button class="filter-chip ${isActive ? "active" : ""}"
        type="button" data-channel="${escapeHTML(channel)}"
        aria-pressed="${isActive}">
        ${escapeHTML(channel)}
      </button>`;
      }).join("");

      const categories = [
          "All Topics",
          "Quran & Tafseer",
          "Lectures & Islamic Studies",
          "Reminders & Spirituality",
          "Islamic History & Stories",
          "Children & Family",
          "Nasheeds & Islamic Arts",
          "Documentaries & Media",
          "Dawah & Outreach"
      ];
      dom.categoryFilters.innerHTML = categories.map(category => `
      <button class="filter-chip ${state.category === category ? "active" : ""}"
        type="button" data-topic="${escapeHTML(category)}"
        aria-pressed="${state.category === category}">
        ${escapeHTML(category)}
      </button>`).join("");
  }

  function updateNavigation() {
      $$(".nav-item").forEach(button => {
          const isView = button.dataset.view && button.dataset.view === state.view;
          const isCategory = button.dataset.category && button.dataset.category === state.category && state.view !== "watch-later" && state.view !== "channels";
          const active = Boolean(isView || isCategory);
          button.classList.toggle("active", active);
          if (active) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
      });

      $$(".bottom-nav-item").forEach(button => {
          const isView = button.dataset.view && button.dataset.view === state.view;
          button.classList.toggle("active", Boolean(isView));
          if (isView) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
      });

      dom.pageTitle.textContent = state.view === "support"
          ? "Support the Project"
          : state.view === "watch-later"
              ? "Your saved collection."
              : state.view === "channels"
                  ? "All Islamic Channels"
                  : state.category !== "All Topics"
                      ? state.category
                      : state.channel !== "All Channels"
                          ? state.channel
                          : "Learn with intention.";

      dom.pageDescription.textContent = state.view === "support"
          ? "A quiet, ad-free space for authentic Islamic knowledge. Completely free for everyone, forever."
          : state.view === "watch-later"
              ? "Your saved lectures and reminders, ready whenever you are."
              : state.view === "channels"
                  ? "Explore 963 selected Islamic YouTube channels from 41 countries. Click any channel to browse their videos in the portal."
                  : state.category !== "All Topics"
                  ? `Explore selected videos filed under ${state.category.toLowerCase()}.`
                  : state.channel !== "All Channels"
                      ? `Browse selected videos from ${state.channel}.`
                      : "Explore thoughtful lectures, Quran studies and reminders from selected Islamic educators.";
  }

  // =========================================================
  // 8. VIDEO CARD RENDERING + EMPTY STATES
  // =========================================================
  function createVideoCard(video, index) {
      const saved = state.saved.has(video.id);
      const thumbnail = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
      const durationBadge = video.duration
          ? `<span class="duration-badge">${escapeHTML(video.duration)}</span>`
          : "";
      const speakerText = video.speaker && video.speaker !== video.channel
          ? `<span>${escapeHTML(video.speaker)}</span><span class="meta-dot"></span>`
          : "";

      return `
  <article class="video-card" style="animation-delay:${Math.min(index * 35, 245)}ms">
    <button class="thumb-button" type="button" data-action="open" data-id="${escapeHTML(video.id)}"
      aria-label="Play ${escapeHTML(video.title)}">
      <span class="thumb-fallback" aria-hidden="true">${icon("play", "lg")}</span>
      <img src="${thumbnail}" alt="Thumbnail for ${escapeHTML(video.title)}" loading="lazy" decoding="async" onload="window.onThumbLoad(this, '${escapeHTML(video.id)}')" onerror="window.onThumbError(this, '${escapeHTML(video.id)}')">
      ${durationBadge}
      <span class="play-overlay" aria-hidden="true"><span>${icon("play")}</span></span>
    </button>
    <div class="card-body">
      <div class="channel-avatar" aria-hidden="true">${escapeHTML(channelInitials(video.channel))}</div>
      <div class="card-copy">
        <button class="title-button" type="button" data-action="open" data-id="${escapeHTML(video.id)}">${escapeHTML(video.title)}</button>
        <div class="card-channel">${escapeHTML(video.channel)}</div>
        <div class="card-meta">
          <span class="category-tag">${escapeHTML(video.category)}</span>
          <span class="meta-dot"></span>
          <span>${escapeHTML(formatDate(video.publishedAt))}</span>
          ${speakerText}
        </div>
      </div>
      <button class="save-button ${saved ? "saved" : ""}" type="button"
        data-action="save" data-id="${escapeHTML(video.id)}"
        aria-label="${saved ? "Remove" : "Save"} ${escapeHTML(video.title)} ${saved ? "from" : "to"} Watch Later"
        aria-pressed="${saved}">
        ${icon("bookmark")}
      </button>
    </div>
  </article>
`;
  }

  function renderEmptyState(results) {
      if (results.length) {
          dom.emptyStateHost.innerHTML = "";
          return;
      }

      const isSavedView = state.view === "watch-later";
      const hasSavedItems = state.saved.size > 0;
      let heading = "No videos match your search";
      let message = "Try another search term or change your filters.";
      let buttonText = "Clear all filters";
      let buttonAction = "reset";
      let iconName = "search";

      if (isSavedView && !hasSavedItems) {
          heading = "Your Watch Later list is empty";
          message = "Save lectures and reminders to keep them close for another time.";
          buttonText = "Explore videos";
          buttonAction = "explore";
          iconName = "bookmark";
      } else if (!isSavedView && state.channel !== "All Channels") {
          heading = "No videos from this channel yet";
          message = "Try another channel or return to the complete video collection.";
          buttonText = "Show all channels";
          buttonAction = "all-channels";
          iconName = "users";
      } else if (!isSavedView && state.category !== "All Topics") {
          heading = "No videos in this topic yet";
          message = "This category does not have a matching sample video right now.";
          buttonText = "Clear all filters";
          buttonAction = "reset";
          iconName = "book-open";
      } else if (isSavedView && hasSavedItems) {
          heading = "No saved videos match";
          message = "Your saved collection is intact. Change the search or filters to find another item.";
          buttonText = "Clear all filters";
          buttonAction = "reset";
          iconName = "search";
      }

      dom.emptyStateHost.innerHTML = `
  <div class="empty-state">
    <div class="empty-icon">${icon(iconName)}</div>
    <h2>${heading}</h2>
    <p>${message}</p>
    <button class="${isSavedView && !hasSavedItems ? "primary-button" : "secondary-button"}"
      type="button" data-action="${buttonAction}">${buttonText}</button>
  </div>
`;
  }

  function updateResultCount(results, visibleCount) {
      const total = state.view === "watch-later" ? state.saved.size : VIDEOS.length;
      const shown = visibleCount !== undefined ? Math.min(visibleCount, results.length) : results.length;
      if (state.view === "watch-later") {
          dom.resultsCopy.innerHTML = `Showing <strong>${shown} of ${results.length} saved videos</strong>`;
      } else {
          dom.resultsCopy.innerHTML = `Showing <strong>${shown} of ${results.length.toLocaleString()} videos</strong> (${total.toLocaleString()} total in library)`;
      }
  }

  let scrollObserver = null;

  function filterChannels() {
      const query = state.query.trim().toLowerCase();
      if (!query) return ALL_CHANNELS;
      return ALL_CHANNELS.filter(ch => ch._idx && ch._idx.includes(query));
  }

  function createChannelCard(ch) {
      const flag = getCountryFlag(ch.country);
      const category = escapeHTML(ch.category || "General Islamic");
      const country = ch.country ? escapeHTML(ch.country) : "";
      const rawName = ch.name || "Channel";
      const name = escapeHTML(rawName);
      const handle = ch.handle ? escapeHTML(ch.handle) : "";
      const subs = ch.subscribers ? `<span>👥 ${escapeHTML(ch.subscribers)} subs</span>` : "";
      const vCount = ch.video_count ? `<span>🎬 ${escapeHTML(ch.video_count)} total</span>` : "";
      const initials = escapeHTML(channelInitials(ch.name || "IC"));

      // Check how many videos this channel has in portal library
      const normName = rawName.trim().toLowerCase();
      let countInPortal = channelVideoCounts[normName] || 0;
      if (!countInPortal) {
          for (const key of Object.keys(channelVideoCounts)) {
              if (isChannelMatch(key, normName)) {
                  countInPortal = channelVideoCounts[key];
                  break;
              }
          }
      }

      const actionButton = countInPortal > 0
          ? `<button class="primary-button channel-explore-btn" type="button" data-action="filter-by-channel" data-channel="${name}">
              <svg class="icon sm"><use href="#i-play" /></svg>
              <span>View ${countInPortal} Videos</span>
            </button>`
          : `<a class="secondary-button channel-explore-btn" href="${escapeHTML(ch.channel_url || '#')}" target="_blank" rel="noopener noreferrer">
              <svg class="icon sm"><use href="#i-external" /></svg>
              <span>Watch on YouTube</span>
            </a>`;

      return `
  <article class="channel-card">
    <div class="channel-card-header">
      <div class="channel-card-avatar" aria-hidden="true">${initials}</div>
      <div class="channel-card-main">
        <h3 class="channel-card-title" ${countInPortal > 0 ? `data-action="filter-by-channel" data-channel="${name}"` : ""} title="${countInPortal > 0 ? `View ${countInPortal} videos in portal` : `Watch on YouTube`}">${name}</h3>
        ${handle ? `<div class="channel-card-handle">${handle}</div>` : ""}
      </div>
    </div>
    <div class="channel-card-meta">
      <span class="category-tag">${category}</span>
      ${country ? `<span class="country-tag">${flag} ${country}</span>` : ""}
      ${countInPortal > 0 ? `<span class="category-tag" style="background:rgba(52,211,153,0.15);color:#6ee7b7;border-color:#34d399;">${countInPortal} in Library</span>` : ""}
    </div>
    ${(subs || vCount) ? `
    <div class="channel-card-stats">
      ${subs}
      ${vCount}
    </div>` : ""}
    <div class="channel-card-actions">
      ${actionButton}
      ${ch.channel_url && countInPortal > 0 ? `
      <a class="secondary-button channel-link" href="${escapeHTML(ch.channel_url)}" target="_blank" rel="noopener noreferrer" title="Open ${name} on YouTube">
        <svg class="icon sm"><use href="#i-external" /></svg>
        <span>YouTube</span>
      </a>` : ""}
      <button class="secondary-button channel-report-btn" type="button" data-action="report-channel" data-channel-name="${name}" data-channel-url="${escapeHTML(ch.channel_url || '')}" title="Report or request removal of ${name}">
        <svg class="icon sm"><use href="#i-flag" /></svg>
        <span>Report</span>
      </button>
    </div>
  </article>`;
  }

  let cachedVideos = null;
  let cachedChannels = null;
  let currentTotalMatches = 0;
  let isFetchingMore = false;

  function invalidateFeedCache() {
      cachedVideos = null;
      cachedChannels = null;
  }

  function updateChannelHeader(totalCount, visibleCount) {
      const countCopy = totalCount === 1 ? "1 channel" : `${totalCount.toLocaleString()} channels`;
      dom.resultsCopy.innerHTML = `Showing <strong>${Math.min(visibleCount, totalCount)} of ${countCopy}</strong> (963 in database) &nbsp;·&nbsp; <button class="channel-suggest-header-btn" type="button" data-action="open-channel-request"><svg class="icon sm"><use href="#i-plus" /></svg><span>Suggest Channel</span></button>`;
  }

  function renderChannels(appendOnly = false, prevCount = 0) {
      if (!cachedChannels || !appendOnly) {
          cachedChannels = filterChannels();
      }
      const results = cachedChannels;

      if (appendOnly) {
          const nextBatch = results.slice(prevCount, state.visibleCount);
          if (nextBatch.length > 0) {
              const html = nextBatch.map(createChannelCard).join("");
              dom.videoGrid.insertAdjacentHTML("beforeend", html);
          }
      } else {
          const visible = results.slice(0, state.visibleCount);
          dom.videoGrid.innerHTML = visible.map(createChannelCard).join("");

          if (results.length === 0) {
              dom.emptyStateHost.innerHTML = `
                <div class="empty-state">
                  <div class="empty-icon">${icon("users")}</div>
                  <h2>No channels found</h2>
                  <p>We couldn't find any channel matching "${escapeHTML(state.query)}". Try searching by another name, topic, or country.</p>
                  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px;">
                    <button class="secondary-button" type="button" data-action="clear-channel-search">Clear Search</button>
                    <button class="primary-button" type="button" data-action="open-channel-request">Suggest This Channel</button>
                  </div>
                </div>
              `;
          } else {
              dom.emptyStateHost.innerHTML = "";
          }
      }

      updateChannelHeader(results.length, Math.min(state.visibleCount, results.length));
      renderLoadMore(results.length, "Channels");
  }

  function loadNextPage() {
      if (state.view === "channels") {
          const total = cachedChannels ? cachedChannels.length : 0;
          if (state.visibleCount < total) {
              const prev = state.visibleCount;
              state.visibleCount = Math.min(state.visibleCount + PAGE_SIZE, total);
              renderChannels(true, prev);
          }
      } else {
          const total = cachedVideos ? cachedVideos.length : 0;
          if (state.visibleCount < total) {
              const prev = state.visibleCount;
              state.visibleCount = Math.min(state.visibleCount + PAGE_SIZE, total);
              renderVideos(true, prev);
          }
      }
  }

  function renderLoadMore(totalMatches, itemType = "Videos") {
      currentTotalMatches = totalMatches;
      let loadMoreWrap = document.getElementById("loadMoreWrap");
      if (state.visibleCount < totalMatches) {
          const remaining = totalMatches - state.visibleCount;
          const nextBatch = Math.min(PAGE_SIZE, remaining);
          if (!loadMoreWrap) {
              loadMoreWrap = document.createElement("div");
              loadMoreWrap.id = "loadMoreWrap";
              loadMoreWrap.style.cssText = "text-align: center; margin: 36px 0 28px;";
              loadMoreWrap.innerHTML = `
                  <button id="loadMoreButton" class="secondary-button" type="button" style="padding: 12px 36px; font-weight: 600; font-size: 14px; cursor: pointer;">
                      Load ${nextBatch} More ${itemType} (${remaining.toLocaleString()} remaining)
                  </button>
                  <div id="scrollSentinel" style="height: 20px; margin-top: 10px;"></div>
              `;
              dom.videoGrid.after(loadMoreWrap);

              document.getElementById("loadMoreButton").addEventListener("click", () => {
                  if (!isFetchingMore) {
                      isFetchingMore = true;
                      loadNextPage();
                      setTimeout(() => { isFetchingMore = false; }, 150);
                  }
              });

              // Virtual scroll observer to load automatically on scroll (like YouTube)
              if ("IntersectionObserver" in window) {
                  scrollObserver = new IntersectionObserver(entries => {
                      if (entries[0].isIntersecting && !isFetchingMore && state.visibleCount < currentTotalMatches) {
                          isFetchingMore = true;
                          loadNextPage();
                          setTimeout(() => { isFetchingMore = false; }, 200);
                      }
                  }, { rootMargin: "400px" });
                  const sentinel = document.getElementById("scrollSentinel");
                  if (sentinel) scrollObserver.observe(sentinel);
              }
          } else {
              loadMoreWrap.style.display = "block";
              const btn = document.getElementById("loadMoreButton");
              if (btn) btn.textContent = `Load ${nextBatch} More ${itemType} (${remaining.toLocaleString()} remaining)`;
          }
      } else if (loadMoreWrap) {
          loadMoreWrap.style.display = "none";
      }
  }

  function renderVideos(appendOnly = false, prevCount = 0) {
      if (!cachedVideos || !appendOnly) {
          cachedVideos = filterVideos();
      }
      const results = cachedVideos;

      if (appendOnly) {
          const nextBatch = results.slice(prevCount, state.visibleCount);
          if (nextBatch.length > 0) {
              const html = nextBatch.map((video, idx) => createVideoCard(video, (prevCount + idx) % PAGE_SIZE)).join("");
              dom.videoGrid.insertAdjacentHTML("beforeend", html);
          }
      } else {
          const visible = results.slice(0, state.visibleCount);
          dom.videoGrid.innerHTML = visible.map((video, idx) => createVideoCard(video, idx)).join("");
          renderEmptyState(results);
      }

      updateResultCount(results, Math.min(state.visibleCount, results.length));
      renderLoadMore(results.length, "Videos");
  }

  function renderSupport() {
      const loadMoreWrap = document.getElementById("loadMoreWrap");
      if (loadMoreWrap) loadMoreWrap.remove();

      dom.resultsCopy.innerHTML = `<strong>Voluntary Developer Support</strong>`;
      const toolbarRight = $(".toolbar-right");
      if (toolbarRight) toolbarRight.style.display = "none";
      dom.emptyStateHost.innerHTML = "";

      dom.videoGrid.innerHTML = `
        <div class="support-view-card">
          <div class="support-heart-icon">${icon("heart")}</div>
          <h2 class="support-title">A Humble Note from the Developer</h2>
          <div class="support-note-text">
            <p>
              <em>Assalamu Alaikum wa Rahmatullahi wa Barakatuh.</em>
            </p>
            <p>
              This portal was built as a quiet, distraction-free space for Muslims and truth-seekers worldwide to access beneficial lectures, Quran recitations, and authentic Islamic knowledge without algorithmic traps, comments, noise, or tracking.
            </p>
            <p>
              <strong>This platform is completely free and will always remain free.</strong> There are no paywalls, accounts required, or forced subscriptions. Supporting is entirely voluntary—please only contribute if you have the means and wish to help offset ongoing domain, server hosting, and maintenance costs.
            </p>
            <p class="support-dua">
              May Allah reward you for your intentions and bless your time and knowledge. A sincere dua is just as appreciated as any contribution.
            </p>
          </div>

          <div class="support-divider"></div>

          <h3 class="support-methods-heading">If you want to support the developer:</h3>

          <!-- Shield Badges -->
          <div class="support-badges-row">
            <a href="https://paypal.me/diekaiju" target="_blank" rel="noopener noreferrer" title="Support via PayPal">
              <img src="https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="PayPal">
            </a>
            <a href="https://ko-fi.com/diekaiju" target="_blank" rel="noopener noreferrer" title="Support via Ko-fi">
              <img src="https://img.shields.io/badge/Ko--fi-72A4F2?style=for-the-badge&logo=kofi&logoColor=white" alt="Ko-fi">
            </a>
            <a href="https://www.buymeachai.in/diekaiju" target="_blank" rel="noopener noreferrer" title="Support via Buy Me A Chai">
              <img src="https://img.shields.io/badge/Buy%20Me%20A%20Chai-FF813F?style=for-the-badge&logoColor=white" alt="Buy Me A Chai">
            </a>
          </div>

          <!-- Interactive Action Buttons -->
          <div class="support-cards-grid">
            <a class="support-action-card paypal-card" href="https://paypal.me/diekaiju" target="_blank" rel="noopener noreferrer">
              <div class="support-card-badge">PayPal</div>
              <div class="support-card-desc">Direct voluntary contribution via PayPal</div>
              <span class="support-btn paypal-btn">Support via PayPal &rarr;</span>
            </a>
            <a class="support-action-card kofi-card" href="https://ko-fi.com/diekaiju" target="_blank" rel="noopener noreferrer">
              <div class="support-card-badge">Ko-fi</div>
              <div class="support-card-desc">Tip a coffee or one-time donation</div>
              <span class="support-btn kofi-btn">Support on Ko-fi &rarr;</span>
            </a>
            <a class="support-action-card chai-card" href="https://www.buymeachai.in/diekaiju" target="_blank" rel="noopener noreferrer">
              <div class="support-card-badge">Buy Me A Chai</div>
              <div class="support-card-desc">Support with UPI, cards & wallets</div>
              <span class="support-btn chai-btn">Buy Me a Chai &rarr;</span>
            </a>
          </div>
        </div>
      `;
  }

  function renderAll() {
      invalidateFeedCache();
      renderFilterBars();
      updateNavigation();
      updateSavedCounts();
      dom.searchInput.value = state.query;
      dom.clearSearch.classList.toggle("visible", Boolean(state.query));
      dom.sortSelect.value = state.sort;
      if (dom.filterPanel) {
          dom.filterPanel.style.display = (state.view === "channels" || state.view === "support") ? "none" : "";
      }
      const toolbarRight = $(".toolbar-right");
      if (state.view === "channels") {
          if (toolbarRight) toolbarRight.style.display = "";
          renderChannels(false);
      } else if (state.view === "support") {
          renderSupport();
      } else {
          if (toolbarRight) toolbarRight.style.display = "";
          renderVideos(false);
      }
  }

  // =========================================================
  // 9. VIDEO PLAYER / MODAL
  // =========================================================
  function openPlayer(videoId, triggerElement) {
      const video = getVideoById(videoId);
      if (!video) {
          showToast("This video is not available in the demo.");
          return;
      }

      const theaterAlreadyOpen = dom.playerModal.classList.contains("is-open");
      state.currentVideo = video;
      if (!theaterAlreadyOpen) {
          state.returnFocus = triggerElement || document.activeElement;
          history.pushState({ modal: "player", videoId: video.id }, "");
      }
      state.descriptionExpanded = false;

      dom.playerTitle.textContent = video.title;
      dom.playerMeta.innerHTML = `
  <span class="player-channel-pill"><span class="mini-avatar">${escapeHTML(channelInitials(video.channel))}</span>${escapeHTML(video.channel)}</span>
  <span class="meta-dot"></span><span>${escapeHTML(video.category)}</span>
  <span class="meta-dot"></span><span>${escapeHTML(formatDate(video.publishedAt))}</span>
  ${video.speaker ? `<span class="meta-dot"></span><span>${escapeHTML(video.speaker)}</span>` : ""}
`;
      dom.playerDescription.textContent = video.description || "No description is available for this video.";
      dom.descriptionBox.classList.add("collapsed");
      dom.descriptionToggle.hidden = !(video.description && video.description.length > 180);
      dom.descriptionToggle.textContent = "Show more";
      dom.descriptionToggle.setAttribute("aria-expanded", "false");

      dom.youtubeFallback.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
      dom.playerUnavailable.classList.remove("visible");
      dom.videoFrame.title = `${video.title} — ${video.channel}`;

      if (isValidYouTubeId(video.id)) {
          // Match the supplied working embed configuration. Fullscreen remains
          // available; the sticky page-level close button remains outside the iframe.
          dom.videoFrame.src = `https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`;
          dom.videoFrame.hidden = false;
      } else {
          dom.videoFrame.src = "";
          dom.videoFrame.hidden = true;
          dom.playerUnavailable.classList.add("visible");
      }

      updatePlayerSaveButton();
      renderRecommendations(video);
      dom.playerDialog.scrollTop = 0;
      dom.playerModal.classList.add("is-open");
      dom.playerModal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => dom.closePlayerButton.focus());
  }

  function closePlayer(fromPopState = false) {
      if (!dom.playerModal.classList.contains("is-open")) return;

      if (!fromPopState && history.state && history.state.modal === "player") {
          history.back();
          return;
      }

      // Clear the iframe immediately so playback and audio stop before the
      // modal's visual fade-out has finished.
      dom.videoFrame.src = "";
      dom.videoFrame.hidden = false;
      dom.playerModal.classList.remove("is-open");
      dom.playerModal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      state.currentVideo = null;
      state.descriptionExpanded = false;

      const focusTarget = state.returnFocus;
      state.returnFocus = null;
      if (focusTarget && typeof focusTarget.focus === "function" && document.contains(focusTarget)) {
          focusTarget.focus({ preventScroll: true });
      }
  }

  function updatePlayerSaveButton() {
      if (!state.currentVideo) return;
      const saved = state.saved.has(state.currentVideo.id);
      dom.playerSaveButton.innerHTML = `${icon("bookmark", "sm")}<span>${saved ? "Remove from Watch Later" : "Save to Watch Later"}</span>`;
      dom.playerSaveButton.setAttribute("aria-pressed", String(saved));
  }

  let currentRecommendationCandidates = [];

  function getNextRecommendation(currentVideoId) {
      const existingIds = new Set(
          Array.from(dom.recommendationGrid.querySelectorAll("[data-recommendation-id]"))
              .map(btn => btn.dataset.recommendationId)
      );
      existingIds.add(currentVideoId);

      for (const item of currentRecommendationCandidates) {
          if (!existingIds.has(item.id) && !brokenThumbnails.has(item.id) && isValidVideoId(item.id)) {
              existingIds.add(item.id);
              return item;
          }
      }
      return null;
  }

  function createRecommendationCardHTML(video, currentVideoId) {
      return `
  <button class="recommendation-card" type="button"
    data-recommendation-id="${escapeHTML(video.id)}"
    aria-label="Play ${escapeHTML(video.title)} by ${escapeHTML(video.channel)}">
    <span class="recommendation-thumb">
      <img src="https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg"
        alt="" loading="lazy" decoding="async"
        onload="window.onRecThumbLoad(this, '${escapeHTML(video.id)}', '${escapeHTML(currentVideoId)}')"
        onerror="window.onRecThumbError(this, '${escapeHTML(video.id)}', '${escapeHTML(currentVideoId)}')">
      <span class="recommendation-play" aria-hidden="true">${icon("play")}</span>
    </span>
    <span class="recommendation-copy">
      <span class="recommendation-title">${escapeHTML(video.title)}</span>
      <span class="recommendation-meta">${escapeHTML(video.channel)} · ${escapeHTML(video.category)}</span>
    </span>
  </button>`;
  }

  window.onRecThumbError = function(imgElement, videoId, currentVideoId) {
      if (videoId) brokenThumbnails.add(videoId);
      const card = imgElement.closest(".recommendation-card");
      if (!card) return;

      const replacement = getNextRecommendation(currentVideoId);
      if (replacement) {
          const temp = document.createElement("div");
          temp.innerHTML = createRecommendationCardHTML(replacement, currentVideoId).trim();
          const newCard = temp.firstElementChild;
          if (newCard) {
              card.replaceWith(newCard);
              return;
          }
      }
      card.remove();
  };

  window.onRecThumbLoad = function(imgElement, videoId, currentVideoId) {
      // YouTube returns a 120x90 placeholder when a video is deleted, private, or unavailable
      if (imgElement.naturalWidth <= 120 && imgElement.naturalHeight <= 90) {
          window.onRecThumbError(imgElement, videoId, currentVideoId);
      }
  };

  function renderRecommendations(currentVideo) {
      if (!currentVideo) {
          dom.recommendationGrid.innerHTML = "";
          currentRecommendationCandidates = [];
          return;
      }

      currentRecommendationCandidates = VIDEOS
          .filter(video => video.id !== currentVideo.id && isValidVideoId(video.id) && !brokenThumbnails.has(video.id))
          .map(video => ({
              video,
              score: (video.category === currentVideo.category ? 2 : 0) +
                  (video.channel === currentVideo.channel ? 1 : 0)
          }))
          .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return new Date(b.video.publishedAt) - new Date(a.video.publishedAt);
          })
          .map(item => item.video);

      const initial = currentRecommendationCandidates.slice(0, 4);

      if (!initial.length) {
          dom.recommendationGrid.innerHTML = '<div class="recommendations-empty">Add more videos to the local demo dataset to see suggestions here.</div>';
          return;
      }

      dom.recommendationGrid.innerHTML = initial
          .map(video => createRecommendationCardHTML(video, currentVideo.id))
          .join("");
  }

  function toggleDescription() {
      state.descriptionExpanded = !state.descriptionExpanded;
      dom.descriptionBox.classList.toggle("collapsed", !state.descriptionExpanded);
      dom.descriptionToggle.textContent = state.descriptionExpanded ? "Show less" : "Show more";
      dom.descriptionToggle.setAttribute("aria-expanded", String(state.descriptionExpanded));
  }

  // =========================================================
  // 10. SIDEBAR / MOBILE NAVIGATION
  // =========================================================
  function toggleSidebar() {
      if (window.matchMedia("(max-width: 820px)").matches) {
          state.mobileDrawerOpen = !state.mobileDrawerOpen;
          dom.sidebar.classList.toggle("mobile-open", state.mobileDrawerOpen);
          dom.mobileBackdrop.classList.toggle("visible", state.mobileDrawerOpen);
          dom.mobileBackdrop.setAttribute("aria-hidden", String(!state.mobileDrawerOpen));
          dom.menuToggle.setAttribute("aria-expanded", String(state.mobileDrawerOpen));
          if (state.mobileDrawerOpen) {
              history.pushState({ modal: "sidebar" }, "");
          }
      } else {
          document.body.classList.toggle("sidebar-collapsed");
          dom.menuToggle.setAttribute("aria-expanded", String(!document.body.classList.contains("sidebar-collapsed")));
      }
  }

  function closeMobileDrawer(fromPopState = false) {
      if (!state.mobileDrawerOpen) return;
      if (!fromPopState && history.state && history.state.modal === "sidebar") {
          history.back();
          return;
      }
      state.mobileDrawerOpen = false;
      dom.sidebar.classList.remove("mobile-open");
      dom.mobileBackdrop.classList.remove("visible");
      dom.mobileBackdrop.setAttribute("aria-hidden", "true");
      dom.menuToggle.setAttribute("aria-expanded", "false");
  }

  function navigateFromSidebar(button) {
      if (button.id === "sidebarSettings" || button.dataset.action === "settings") {
          closeMobileDrawer();
          openPreferencesModal(false);
          return;
      }
      if (button.id === "sidebarChannelRequest" || button.dataset.action === "channel-request") {
          closeMobileDrawer();
          openChannelRequestModal("add");
          return;
      }
      if (button.dataset.view) {
          if (button.dataset.view === "watch-later") {
              state.view = "watch-later";
          } else if (button.dataset.view === "channels") {
              state.view = "channels";
              state.channel = "All Channels";
              state.category = "All Topics";
          } else if (button.dataset.view === "support") {
              state.view = "support";
              state.channel = "All Channels";
              state.category = "All Topics";
          } else {
              state.view = "home";
              state.channel = "All Channels";
              state.category = "All Topics";
          }
      } else if (button.dataset.category) {
          state.view = "home";
          state.channel = "All Channels";
          state.category = button.dataset.category;
      }
      closeMobileDrawer();
      pushNavigationState();
      renderAll();
  }

  // =========================================================
  // 11. TOAST NOTIFICATIONS
  // =========================================================
  function showToast(message) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.innerHTML = `${icon("check")}<span>${escapeHTML(message)}</span>`;
      dom.toastRegion.append(toast);

      window.setTimeout(() => {
          toast.classList.add("out");
          window.setTimeout(() => toast.remove(), 220);
      }, 2500);
  }

  // =========================================================
  // 12. EVENT HANDLERS + KEYBOARD ACCESSIBILITY
  // =========================================================
  function handleVideoGridClick(event) {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      const { action, id, channel } = actionButton.dataset;
      if (action === "filter-by-channel") {
          state.channel = channel;
          state.view = "home";
          state.category = "All Topics";
          state.query = "";
          if (dom.searchInput) dom.searchInput.value = "";
          if (dom.clearSearch) dom.clearSearch.classList.remove("visible");
          state.visibleCount = PAGE_SIZE;
          pushNavigationState();
          renderAll();
          window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (action === "clear-channel-search") {
          state.query = "";
          dom.searchInput.value = "";
          dom.clearSearch.classList.remove("visible");
          state.visibleCount = PAGE_SIZE;
          pushNavigationState();
          renderChannels();
      } else if (action === "open") {
          openPlayer(id, actionButton);
      } else if (action === "save") {
          event.stopPropagation();
          toggleWatchLater(id);
      } else if (action === "reset") {
          resetFilters();
      } else if (action === "explore") {
          state.view = "home";
          state.channel = "All Channels";
          state.category = "All Topics";
          pushNavigationState();
          renderAll();
      } else if (action === "all-channels") {
          state.view = "channels";
          state.channel = "All Channels";
          state.category = "All Topics";
          pushNavigationState();
          renderAll();
      } else if (action === "report-channel") {
          const { channelName, channelUrl } = actionButton.dataset;
          openChannelRequestModal("remove", channelName || "", channelUrl || "");
      } else if (action === "open-channel-request") {
          openChannelRequestModal("add", state.query || "");
      }
  }

  function trapModalFocus(event) {
      if (!dom.playerModal.classList.contains("is-open") || event.key !== "Tab") return;
      const focusable = $$(
          'button:not([disabled]):not([hidden]), a[href]:not([hidden]), iframe:not([hidden]), [tabindex]:not([tabindex="-1"])',
          dom.playerModal
      ).filter(element => element.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
      }
  }

  function handleKeyboardShortcuts(event) {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
          target.matches("input, textarea, select") || target.isContentEditable
      );

      if (event.key === "Escape") {
          if (dom.channelRequestModal && dom.channelRequestModal.classList.contains("is-open")) {
              closeChannelRequestModal(false);
          } else if (dom.preferencesModal && dom.preferencesModal.classList.contains("is-open")) {
              if (!isOpeningForFirstTime) closePreferencesModal();
          } else if (dom.playerModal.classList.contains("is-open")) {
              closePlayer();
          } else if (state.mobileDrawerOpen) {
              closeMobileDrawer();
              dom.menuToggle.focus();
          }
          return;
      }

      if (isTyping) return;

      if (event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
          event.preventDefault();
          dom.searchInput.focus();
      }
  }

  function handleThumbnailErrors(event) {
      if (event.target instanceof HTMLImageElement) {
          const btn = event.target.closest(".thumb-button");
          const videoId = btn?.dataset?.id;
          if (videoId) brokenThumbnails.add(videoId);
          const card = event.target.closest(".video-card, .recommendation-card");
          if (card) {
              card.remove();
          }
      }
  }

  function configureGithubLink() {
      if (GITHUB_URL && /^https:\/\/github\.com\//i.test(GITHUB_URL)) {
          dom.githubLink.href = GITHUB_URL;
          dom.githubLink.hidden = false;
      } else {
          dom.githubLink.hidden = true;
      }
  }

  function debounce(fn, delay = 160) {
      let timer;
      return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), delay);
      };
  }

  // =========================================================
  // PREFERENCES & ONBOARDING MODAL LOGIC
  // =========================================================
  let isOpeningForFirstTime = false;

  function openPreferencesModal(isFirstTime = false) {
      isOpeningForFirstTime = isFirstTime;

      if (isFirstTime) {
          if (dom.prefModalKicker) dom.prefModalKicker.textContent = "Welcome Setup";
          if (dom.prefModalTitle) dom.prefModalTitle.textContent = "Personalize Your Experience";
          if (dom.prefModalSubtitle) dom.prefModalSubtitle.textContent = "Choose your preferred language and learning mode. We will tailor your feed and randomize videos for fresh discovery.";
          if (dom.prefCloseBtn) dom.prefCloseBtn.style.display = "none";
          if (dom.prefSaveBtn) dom.prefSaveBtn.textContent = "Save & Start Watching";
      } else {
          if (dom.prefModalKicker) dom.prefModalKicker.textContent = "Preferences & Settings";
          if (dom.prefModalTitle) dom.prefModalTitle.textContent = "Portal Preferences";
          if (dom.prefModalSubtitle) dom.prefModalSubtitle.textContent = "Adjust your preferred language, audience mode, and feed order at any time.";
          if (dom.prefCloseBtn) dom.prefCloseBtn.style.display = "grid";
          if (dom.prefSaveBtn) dom.prefSaveBtn.textContent = "Save Preferences";
      }

      // Mark active language card
      const activeLang = userPreferences.language || "all";
      if (dom.prefLangGrid) {
          $$(".lang-card", dom.prefLangGrid).forEach(btn => {
              btn.classList.toggle("active", btn.dataset.lang === activeLang);
          });
      }

      // Set audience radio
      if (userPreferences.audience === "kids") {
          if (dom.prefAudienceKids) dom.prefAudienceKids.checked = true;
      } else {
          if (dom.prefAudienceAdult) dom.prefAudienceAdult.checked = true;
      }

      // Set shuffle checkbox
      if (dom.prefShuffle) {
          dom.prefShuffle.checked = userPreferences.shuffle !== false;
      }

      // Mark active theme card
      const activeTheme = userPreferences.theme || "system";
      if (dom.prefThemeGrid) {
          $$(".theme-card", dom.prefThemeGrid).forEach(btn => {
              btn.classList.toggle("active", btn.dataset.theme === activeTheme);
          });
      }

      if (dom.preferencesModal) {
          dom.preferencesModal.classList.add("is-open");
          dom.preferencesModal.setAttribute("aria-hidden", "false");
          document.body.classList.add("modal-open");
          if (!isFirstTime) {
              history.pushState({ modal: "preferences" }, "");
          }
          if (dom.prefDialog) dom.prefDialog.focus();
      }
  }

  function closePreferencesModal(fromPopState = false) {
      if (!dom.preferencesModal || !dom.preferencesModal.classList.contains("is-open")) return;
      if (!fromPopState && history.state && history.state.modal === "preferences") {
          history.back();
          return;
      }
      dom.preferencesModal.classList.remove("is-open");
      dom.preferencesModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
  }

  // =========================================================
  // CHANNEL REQUEST & FEEDBACK MODAL LOGIC
  // =========================================================
  let channelRequestType = "add";

  function setChannelRequestType(type) {
      channelRequestType = type === "remove" ? "remove" : "add";
      if (dom.reqTypeAdd) dom.reqTypeAdd.classList.toggle("active", channelRequestType === "add");
      if (dom.reqTypeRemove) dom.reqTypeRemove.classList.toggle("active", channelRequestType === "remove");

      if (channelRequestType === "add") {
          if (dom.reqModalKicker) dom.reqModalKicker.innerHTML = `<svg class="icon sm"><use href="#i-plus" /></svg> Suggest Channel`;
          if (dom.reqModalTitle) dom.reqModalTitle.textContent = "Suggest a New Channel";
          if (dom.reqModalSubtitle) dom.reqModalSubtitle.textContent = "Know a beneficial Islamic YouTube channel that should be part of this portal? Let us know!";
          if (dom.reqReason) dom.reqReason.placeholder = "Tell us what kind of content they produce (lectures, tafseer, language, topics covered)...";
      } else {
          if (dom.reqModalKicker) dom.reqModalKicker.innerHTML = `<svg class="icon sm"><use href="#i-flag" /></svg> Report Channel`;
          if (dom.reqModalTitle) dom.reqModalTitle.textContent = "Report or Request Removal";
          if (dom.reqModalSubtitle) dom.reqModalSubtitle.textContent = "Help keep the portal pure and authentic. Report channels that contain non-Islamic, musical, or inappropriate content.";
          if (dom.reqReason) dom.reqReason.placeholder = "Please explain why this channel should be removed (e.g. not Islamic, contains music, inactive, copyright)...";
      }
  }

  function openChannelRequestModal(type = "add", channelName = "", channelUrl = "") {
      setChannelRequestType(type);
      if (dom.reqChannelName) dom.reqChannelName.value = channelName;
      if (dom.reqChannelUrl) dom.reqChannelUrl.value = channelUrl;
      if (dom.reqReason) dom.reqReason.value = "";

      if (dom.channelRequestModal) {
          dom.channelRequestModal.classList.add("is-open");
          dom.channelRequestModal.setAttribute("aria-hidden", "false");
          document.body.classList.add("modal-open");
          history.pushState({ modal: "channelRequest" }, "");
          if (dom.channelRequestDialog) dom.channelRequestDialog.focus();
      }
  }

  function closeChannelRequestModal(fromPopState = false) {
      if (!dom.channelRequestModal || !dom.channelRequestModal.classList.contains("is-open")) return;
      if (!fromPopState && history.state && history.state.modal === "channelRequest") {
          history.back();
          return;
      }
      dom.channelRequestModal.classList.remove("is-open");
      dom.channelRequestModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
  }

  function buildChannelRequestPayload() {
      const channelName = (dom.reqChannelName?.value || "").trim();
      const channelUrl = (dom.reqChannelUrl?.value || "").trim();
      const reason = (dom.reqReason?.value || "").trim();

      if (!channelName) {
          showToast("Please provide the channel name or handle.");
          dom.reqChannelName?.focus();
          return null;
      }

      const isAdd = channelRequestType === "add";
      const actionLabel = isAdd ? "Add Channel Request" : "Remove Channel Request";
      const subject = `[ILMO Curation] ${actionLabel}: ${channelName}`;

      const bodyText =
`ILMO - Channel Request
---------------------------------------
Action: ${actionLabel}
Channel Name / Handle: ${channelName}
Channel YouTube URL: ${channelUrl || "Not specified"}

Reason / Details:
${reason || (isAdd ? "Please consider adding this beneficial Islamic channel." : "Please consider removing this channel from ILMO.")}

Sent from ILMO (Islamic Knowledge Without Distraction)`;

      const markdownBody =
`### ${actionLabel}

* **Channel Name / Handle:** ${channelName}
* **YouTube URL:** ${channelUrl || "N/A"}
* **Action Requested:** ${isAdd ? "Add to ILMO library" : "Remove from ILMO library"}

#### Reason / Notes
${reason || (isAdd ? "Please consider adding this beneficial Islamic channel." : "Please consider removing this channel from ILMO.")}

---
*Submitted via ILMO (Islamic Knowledge Without Distraction)*`;

      return { subject, bodyText, markdownBody };
  }

  function submitChannelViaGmail() {
      const payload = buildChannelRequestPayload();
      if (!payload) return;

      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(FEEDBACK_EMAIL)}&su=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.bodyText)}`;
      window.open(gmailUrl, "_blank", "noopener,noreferrer");
      closeChannelRequestModal(false);
      showToast("Opened Gmail compose tab.");
  }

  function submitChannelViaEmail() {
      const payload = buildChannelRequestPayload();
      if (!payload) return;

      const mailtoUrl = `mailto:${encodeURIComponent(FEEDBACK_EMAIL)}?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.bodyText)}`;
      window.location.href = mailtoUrl;
      closeChannelRequestModal(false);
      showToast("Opened default email client.");
  }

  function submitChannelViaGithub() {
      const payload = buildChannelRequestPayload();
      if (!payload) return;

      const issueUrl = `${GITHUB_URL}/issues/new?title=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.markdownBody)}`;
      window.open(issueUrl, "_blank", "noopener,noreferrer");
      closeChannelRequestModal(false);
      showToast("Opened GitHub Issues tab.");
  }

  function initEvents() {
      const debouncedSearch = debounce(() => {
          state.visibleCount = PAGE_SIZE;
          invalidateFeedCache();
          if (state.view === "channels") renderChannels(false);
          else renderVideos(false);
      }, 160);

      dom.searchInput.addEventListener("input", () => {
          state.query = dom.searchInput.value;
          dom.clearSearch.classList.toggle("visible", Boolean(state.query));
          debouncedSearch();
      });

      dom.clearSearch.addEventListener("click", () => {
          state.query = "";
          state.visibleCount = PAGE_SIZE;
          dom.searchInput.value = "";
          dom.clearSearch.classList.remove("visible");
          invalidateFeedCache();
          if (state.view === "channels") renderChannels(false);
          else renderVideos(false);
          dom.searchInput.focus();
      });

      dom.channelFilters.addEventListener("click", event => {
          const button = event.target.closest("[data-channel]");
          if (button) setActiveChannel(button.dataset.channel);
      });

      dom.categoryFilters.addEventListener("click", event => {
          const button = event.target.closest("[data-topic]");
          if (button) setActiveCategory(button.dataset.topic);
      });

      dom.sortSelect.addEventListener("change", () => {
          state.sort = dom.sortSelect.value;
          state.visibleCount = PAGE_SIZE;
          invalidateFeedCache();
          renderVideos(false);
      });

      dom.videoGrid.addEventListener("click", handleVideoGridClick);
      dom.emptyStateHost.addEventListener("click", handleVideoGridClick);
      dom.videoGrid.addEventListener("error", handleThumbnailErrors, true);

      dom.menuToggle.addEventListener("click", toggleSidebar);
      dom.mobileBackdrop.addEventListener("click", closeMobileDrawer);
      dom.watchLaterShortcut.addEventListener("click", () => {
          state.view = "watch-later";
          pushNavigationState();
          renderAll();
          if (window.matchMedia("(max-width: 820px)").matches) closeMobileDrawer();
      });

      // Mobile Bottom Navigation Bar wiring
      if (dom.mobileBottomNav) {
          dom.mobileBottomNav.addEventListener("click", event => {
              const btn = event.target.closest(".bottom-nav-item");
              if (!btn) return;
              if (btn.id === "bottomNavPrefs") {
                  openPreferencesModal(false);
                  return;
              }
              const view = btn.dataset.view;
              if (view) {
                  state.view = view;
                  if (view === "home") {
                      state.channel = "All Channels";
                      state.category = "All Topics";
                  }
                  state.visibleCount = PAGE_SIZE;
                  pushNavigationState();
                  renderAll();
                  window.scrollTo({ top: 0, behavior: "smooth" });
              }
          });
      }

      // Preferences and Settings shortcuts
      if (dom.settingsShortcut) {
          dom.settingsShortcut.addEventListener("click", () => openPreferencesModal(false));
      }
      if (dom.prefBadgeBtn) {
          dom.prefBadgeBtn.addEventListener("click", () => openPreferencesModal(false));
      }
      if (dom.shuffleFeedBtn) {
          dom.shuffleFeedBtn.addEventListener("click", () => {
              state.sort = "random";
              if (dom.sortSelect) dom.sortSelect.value = "random";
              state.visibleCount = PAGE_SIZE;
              invalidateFeedCache();
              renderVideos(false);
              showToast("🎲 Feed randomized for fresh discovery!");
          });
      }

      // Preferences Modal event wiring
      if (dom.prefLangGrid) {
          dom.prefLangGrid.addEventListener("click", event => {
              const card = event.target.closest(".lang-card");
              if (!card) return;
              $$(".lang-card", dom.prefLangGrid).forEach(b => b.classList.remove("active"));
              card.classList.add("active");
          });
      }

      if (dom.prefThemeGrid) {
          dom.prefThemeGrid.addEventListener("click", event => {
              const card = event.target.closest(".theme-card");
              if (!card) return;
              $$(".theme-card", dom.prefThemeGrid).forEach(b => b.classList.remove("active"));
              card.classList.add("active");
          });
      }

      if (dom.themeToggle) {
          dom.themeToggle.addEventListener("click", () => {
              const current = userPreferences.theme || "system";
              let next = "light";
              if (current === "system") {
                  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
                  next = prefersDark ? "light" : "dark";
              } else if (current === "light") {
                  next = "dark";
              } else {
                  next = "system";
              }
              savePreferences({ theme: next });
              applyTheme(next);
              showToast(`Theme: ${next === "system" ? "Device Default" : next.charAt(0).toUpperCase() + next.slice(1)}`);
          });
      }

      // Live device theme listener
      if (window.matchMedia) {
          window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
              if ((userPreferences.theme || "system") === "system") {
                  applyTheme("system");
              }
          });
      }

      if (dom.prefCloseBtn) {
          dom.prefCloseBtn.addEventListener("click", closePreferencesModal);
      }

      if (dom.preferencesModal) {
          dom.preferencesModal.addEventListener("click", event => {
              if (event.target === dom.preferencesModal && !isOpeningForFirstTime) {
                  closePreferencesModal();
              }
          });
      }

      if (dom.prefResetBtn) {
          dom.prefResetBtn.addEventListener("click", () => {
              if (dom.prefLangGrid) {
                  $$(".lang-card", dom.prefLangGrid).forEach(b => {
                      b.classList.toggle("active", b.dataset.lang === "all");
                  });
              }
              if (dom.prefThemeGrid) {
                  $$(".theme-card", dom.prefThemeGrid).forEach(b => {
                      b.classList.toggle("active", b.dataset.theme === "system");
                  });
              }
              if (dom.prefAudienceAdult) dom.prefAudienceAdult.checked = true;
              if (dom.prefShuffle) dom.prefShuffle.checked = true;
          });
      }

      if (dom.prefSaveBtn) {
          dom.prefSaveBtn.addEventListener("click", () => {
              const activeLangCard = $(".lang-card.active", dom.prefLangGrid);
              const selectedLang = activeLangCard ? activeLangCard.dataset.lang : "all";
              const selectedAudience = dom.prefAudienceKids?.checked ? "kids" : "adult";
              const isShuffle = dom.prefShuffle ? dom.prefShuffle.checked : true;
              const activeThemeCard = $(".theme-card.active", dom.prefThemeGrid);
              const selectedTheme = activeThemeCard ? activeThemeCard.dataset.theme : "system";

              savePreferences({
                  language: selectedLang,
                  audience: selectedAudience,
                  shuffle: isShuffle,
                  theme: selectedTheme,
                  onboarded: true
              });
              applyTheme(selectedTheme);

              if (isShuffle) {
                  state.sort = "random";
                  if (dom.sortSelect) dom.sortSelect.value = "random";
              }

              closePreferencesModal();
              state.visibleCount = PAGE_SIZE;
              renderAll();
              showToast(isOpeningForFirstTime ? "Welcome! Your portal is personalized." : "Preferences updated!");
          });
      }

      $$(".nav-item").forEach(button => {
          button.addEventListener("click", () => navigateFromSidebar(button));
      });

      $("#brandHome").addEventListener("click", event => {
          event.preventDefault();
          state.view = "home";
          state.channel = "All Channels";
          state.category = "All Topics";
          pushNavigationState();
          renderAll();
      });

      dom.closePlayerButton.addEventListener("click", () => closePlayer(false));
      dom.playerDialog.addEventListener("click", event => {
          const recommendationButton = event.target.closest("[data-recommendation-id]");
          if (recommendationButton) {
              openPlayer(recommendationButton.dataset.recommendationId, recommendationButton);
          }
      });
      dom.playerDialog.addEventListener("error", handleThumbnailErrors, true);
      dom.playerModal.addEventListener("click", event => {
          if (event.target === dom.playerModal) closePlayer(false);
      });
      dom.playerSaveButton.addEventListener("click", () => {
          if (state.currentVideo) toggleWatchLater(state.currentVideo.id);
      });
      dom.descriptionToggle.addEventListener("click", toggleDescription);

      document.addEventListener("keydown", handleKeyboardShortcuts);
      dom.playerDialog.addEventListener("keydown", trapModalFocus);

      window.addEventListener("resize", () => {
          if (window.matchMedia("(min-width: 821px)").matches && state.mobileDrawerOpen) closeMobileDrawer();
      });

      // Channel Request & Feedback listeners
      if (dom.reqTypeAdd) {
          dom.reqTypeAdd.addEventListener("click", () => setChannelRequestType("add"));
      }
      if (dom.reqTypeRemove) {
          dom.reqTypeRemove.addEventListener("click", () => setChannelRequestType("remove"));
      }
      if (dom.reqCloseBtn) {
          dom.reqCloseBtn.addEventListener("click", () => closeChannelRequestModal(false));
      }
      if (dom.channelRequestModal) {
          dom.channelRequestModal.addEventListener("click", event => {
              if (event.target === dom.channelRequestModal) closeChannelRequestModal(false);
          });
      }
      if (dom.reqSubmitGmail) {
          dom.reqSubmitGmail.addEventListener("click", submitChannelViaGmail);
      }
      if (dom.reqSubmitEmail) {
          dom.reqSubmitEmail.addEventListener("click", submitChannelViaEmail);
      }
      if (dom.reqSubmitGithub) {
          dom.reqSubmitGithub.addEventListener("click", submitChannelViaGithub);
      }
      if (dom.sidebarChannelRequest) {
          dom.sidebarChannelRequest.addEventListener("click", () => {
              closeMobileDrawer();
              openChannelRequestModal("add");
          });
      }
      if (dom.footerChannelRequest) {
          dom.footerChannelRequest.addEventListener("click", () => openChannelRequestModal("add"));
      }
      if (dom.footerSupportBtn) {
          dom.footerSupportBtn.addEventListener("click", () => {
              state.view = "support";
              state.channel = "All Channels";
              state.category = "All Topics";
              pushNavigationState();
              renderAll();
              window.scrollTo({ top: 0, behavior: "smooth" });
          });
      }

      // Browser & Mobile Hardware Back-Press Navigation
      window.addEventListener("popstate", event => {
          // 0. Close channel request modal if open
          if (dom.channelRequestModal && dom.channelRequestModal.classList.contains("is-open")) {
              closeChannelRequestModal(true);
              return;
          }

          // 1. Close video player modal if open
          if (dom.playerModal && dom.playerModal.classList.contains("is-open")) {
              closePlayer(true);
              return;
          }

          // 2. Close preferences modal if open
          if (dom.preferencesModal && dom.preferencesModal.classList.contains("is-open")) {
              closePreferencesModal(true);
              return;
          }

          // 3. Close mobile drawer if open
          if (state.mobileDrawerOpen) {
              closeMobileDrawer(true);
              return;
          }

          // 4. Restore state if history state is present
          if (event.state && (event.state.view || event.state.channel || event.state.category)) {
              applyNavigationState(event.state);
              return;
          }

          // 5. If reached root state with active filters or sub-view, revert to home
          if (state.channel !== "All Channels" || state.category !== "All Topics" || state.query || state.view !== "home") {
              state.view = "home";
              state.channel = "All Channels";
              state.category = "All Topics";
              state.query = "";
              if (dom.searchInput) dom.searchInput.value = "";
              if (dom.clearSearch) dom.clearSearch.classList.remove("visible");
              state.visibleCount = PAGE_SIZE;
              renderAll();
              window.scrollTo({ top: 0, behavior: "smooth" });
          }
      });
  }

  // =========================================================
  // 13. INITIALISE APPLICATION
  // =========================================================
  async function loadVideos() {
      try {
          const response = await fetch("videos.json");
          if (response.ok) {
              const data = await response.json();
              if (Array.isArray(data) && data.length > 0) {
                  VIDEOS = data.filter(v => isValidVideoId(v.id));
                  return;
              }
          }
      } catch (e) {
          console.info("Direct fetch of videos.json unavailable (e.g. file:// protocol restriction); using videos.js fallback.");
      }
      if (window.VIDEOS_DATA && Array.isArray(window.VIDEOS_DATA)) {
          VIDEOS = window.VIDEOS_DATA.filter(v => isValidVideoId(v.id));
      }
  }

  async function init() {
      await Promise.all([loadVideos(), loadChannelMetadata()]);
      indexVideos(VIDEOS);
      state.saved = loadSavedVideos();
      userPreferences = loadPreferences();
      applyTheme(userPreferences.theme);
      updatePreferencesUI();

      // If user has shuffle enabled, randomize the home feed
      if (userPreferences.shuffle) {
          state.sort = "random";
      }

      configureGithubLink();
      initEvents();
      renderAll();
      history.replaceState(getCurrentNavSnapshot(), "");

      // If first-time visitor, present the onboarding customization modal
      if (!userPreferences.onboarded) {
          window.setTimeout(() => {
              openPreferencesModal(true);
          }, 350);
      }

      // Register Progressive Web App (PWA) Service Worker for Android install support
      if ("serviceWorker" in navigator) {
          navigator.serviceWorker.register("sw.js").catch(err => {
              console.info("Service Worker registration skipped or failed:", err);
          });
      }
  }

  init();
