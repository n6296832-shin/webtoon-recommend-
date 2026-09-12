const FAVORITES_KEY = "webtoon-favorites";

const state = {
  data: null,
  viewMode: "genre", // "genre" | "weekday"
  activeGenre: null,
  activeWeekday: "all",
  activePlatform: "all",
  searchQuery: "",
  showFavoritesOnly: false,
  favorites: loadFavorites(),
};

const viewModeEl = document.getElementById("viewMode");
const genreTabsEl = document.getElementById("genreTabs");
const cardGridEl = document.getElementById("cardGrid");
const emptyStateEl = document.getElementById("emptyState");
const updatedAtEl = document.getElementById("updatedAt");
const platformFilterEl = document.getElementById("platformFilter");
const searchInputEl = document.getElementById("searchInput");
const searchClearEl = document.getElementById("searchClear");
const favToggleEl = document.getElementById("favToggle");

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  } catch {
    // 프라이빗 브라우징 등으로 localStorage를 못 쓰는 경우 즐겨찾기는 그냥 저장되지 않는다.
  }
}

function favKey(item) {
  return `${item.platform}:${item.id}`;
}

async function loadData() {
  const res = await fetch("data/webtoons.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

function formatUpdatedAt(iso) {
  const d = new Date(iso);
  return `업데이트: ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function flatten(groups) {
  const map = new Map();
  for (const group of groups) {
    for (const item of group.items) {
      map.set(favKey(item), item);
    }
  }
  return [...map.values()];
}

function allItems() {
  return flatten(state.data.genres);
}

function activeGroups() {
  return state.viewMode === "weekday" ? state.data.weekdays : state.data.genres;
}

function activeKey() {
  return state.viewMode === "weekday" ? state.activeWeekday : state.activeGenre;
}

function setActiveKey(key) {
  if (state.viewMode === "weekday") state.activeWeekday = key;
  else state.activeGenre = key;
}

function renderTabs() {
  genreTabsEl.innerHTML = "";
  genreTabsEl.setAttribute("aria-label", state.viewMode === "weekday" ? "요일 선택" : "장르 선택");

  const groups = activeGroups();

  if (state.viewMode === "weekday") {
    const allBtn = document.createElement("button");
    const allCount = flatten(groups).length;
    allBtn.className = "genre-tab" + (state.activeWeekday === "all" ? " is-active" : "");
    allBtn.textContent = `전체 (${allCount})`;
    allBtn.addEventListener("click", () => {
      state.activeWeekday = "all";
      renderTabs();
      renderCards();
    });
    genreTabsEl.appendChild(allBtn);
  }

  for (const group of groups) {
    const btn = document.createElement("button");
    btn.className = "genre-tab" + (group.key === activeKey() ? " is-active" : "");
    btn.textContent = `${group.label} (${group.items.length})`;
    btn.addEventListener("click", () => {
      setActiveKey(group.key);
      renderTabs();
      renderCards();
    });
    genreTabsEl.appendChild(btn);
  }
}

function renderViewMode() {
  for (const btn of viewModeEl.querySelectorAll(".view-mode-btn")) {
    const isActive = btn.dataset.mode === state.viewMode;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  }
}

function renderPlatformFilter() {
  for (const btn of platformFilterEl.querySelectorAll(".filter-btn")) {
    btn.classList.toggle("is-active", btn.dataset.platform === state.activePlatform);
  }
}

function cardHTML(item) {
  const key = favKey(item);
  const isFav = state.favorites.has(key);
  const platformLabel = item.platform === "naver" ? "네이버" : "카카오";
  const rating = item.rating ? `<p class="card-rating">★ ${item.rating.toFixed(2)}</p>` : "";
  const thumb = item.thumbnail
    ? `<img src="${item.thumbnail}" alt="${item.title}" loading="lazy" referrerpolicy="no-referrer">`
    : "";
  return `
    <article class="card" data-key="${key}">
      <a class="card-link" href="${item.url}" target="_blank" rel="noopener noreferrer" aria-label="${item.title} 보러가기"></a>
      <div class="card-thumb-wrap">
        ${thumb}
        <span class="badge ${item.platform}">${platformLabel}</span>
      </div>
      <button class="fav-btn${isFav ? " is-fav" : ""}" data-fav-key="${key}" aria-pressed="${isFav}" aria-label="즐겨찾기 ${
    isFav ? "해제" : "추가"
  }" type="button">${isFav ? "★" : "☆"}</button>
      <div class="card-body">
        <p class="card-title">${item.title}</p>
        <p class="card-author">
          <span>${item.author || ""}</span>
          <span class="status-tag ${item.finished ? "is-finished" : "is-ongoing"}">${
    item.finished ? "완결" : "연재중"
  }</span>
        </p>
        ${rating}
      </div>
    </article>
  `;
}

function currentItems() {
  const query = state.searchQuery.trim().toLowerCase();
  const groups = activeGroups();
  const key = activeKey();

  let pool;
  if (query || key === "all") {
    pool = flatten(groups);
  } else {
    const group = groups.find((g) => g.key === key);
    pool = group?.items ?? [];
  }

  if (state.showFavoritesOnly) {
    pool = pool.filter((item) => state.favorites.has(favKey(item)));
  }

  if (state.activePlatform !== "all") {
    pool = pool.filter((item) => item.platform === state.activePlatform);
  }

  if (query) {
    pool = pool.filter(
      (item) =>
        item.title.toLowerCase().includes(query) || (item.author || "").toLowerCase().includes(query)
    );
  }

  return pool;
}

function emptyMessage() {
  if (state.searchQuery.trim()) return "검색 결과가 없습니다.";
  if (state.showFavoritesOnly) return "즐겨찾기한 작품이 없습니다. 카드의 별표를 눌러 추가해보세요.";
  return state.viewMode === "weekday"
    ? "이 요일에는 아직 모아둔 작품이 없습니다."
    : "이 장르에는 아직 모아둔 작품이 없습니다.";
}

function renderCards() {
  const items = currentItems();
  cardGridEl.innerHTML = items.map(cardHTML).join("");
  emptyStateEl.hidden = items.length > 0;
  emptyStateEl.textContent = emptyMessage();
}

function toggleFavorite(key) {
  if (state.favorites.has(key)) {
    state.favorites.delete(key);
  } else {
    state.favorites.add(key);
  }
  saveFavorites();
  updateFavToggleLabel();
  renderCards();
}

function updateFavToggleLabel() {
  favToggleEl.textContent = `${state.showFavoritesOnly ? "★" : "☆"} 즐겨찾기 (${state.favorites.size})`;
  favToggleEl.setAttribute("aria-pressed", String(state.showFavoritesOnly));
}

function bindEvents() {
  viewModeEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".view-mode-btn");
    if (!btn || btn.dataset.mode === state.viewMode) return;
    state.viewMode = btn.dataset.mode;
    renderViewMode();
    renderTabs();
    renderCards();
  });

  platformFilterEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    state.activePlatform = btn.dataset.platform;
    renderPlatformFilter();
    renderCards();
  });

  cardGridEl.addEventListener("click", (e) => {
    const favBtn = e.target.closest(".fav-btn");
    if (!favBtn) return;
    e.preventDefault();
    toggleFavorite(favBtn.dataset.favKey);
  });

  searchInputEl.addEventListener("input", () => {
    state.searchQuery = searchInputEl.value;
    searchClearEl.hidden = state.searchQuery.length === 0;
    renderCards();
  });

  searchClearEl.addEventListener("click", () => {
    searchInputEl.value = "";
    state.searchQuery = "";
    searchClearEl.hidden = true;
    searchInputEl.focus();
    renderCards();
  });

  favToggleEl.addEventListener("click", () => {
    state.showFavoritesOnly = !state.showFavoritesOnly;
    updateFavToggleLabel();
    renderCards();
  });
}

async function init() {
  try {
    state.data = await loadData();
    state.activeGenre = state.data.genres[0]?.key ?? null;
    updatedAtEl.textContent = formatUpdatedAt(state.data.updatedAt);
    renderViewMode();
    renderTabs();
    renderPlatformFilter();
    updateFavToggleLabel();
    renderCards();
    bindEvents();
  } catch (err) {
    cardGridEl.innerHTML = "";
    emptyStateEl.hidden = false;
    emptyStateEl.textContent = "데이터를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
    console.error(err);
  }
}

init();
