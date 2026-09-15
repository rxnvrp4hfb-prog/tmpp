const state = { data: [], query: "", filter: "all", city: "all", areas: new Set(), visible: 60, map: null, markerLayer: null };
const $ = (selector) => document.querySelector(selector);
const results = $("#results");
const template = $("#cardTemplate");
const search = $("#search");
const clear = $("#clear");

function normalize(value) {
  return String(value || "").toLocaleLowerCase("zh-Hant").replace(/臺/g, "台").replace(/\s+/g, "");
}

function timeMatches(value) {
  if (state.filter === "all") return true;
  if (state.filter === "daily") return value.includes("週一至日");
  if (state.filter === "weekend") {
    if (value.includes("假日")) return !/假日\s*無收費/.test(value);
    return /週六|週日|週一至日/.test(value);
  }
  return /平日|週一至五|週一至六|週一至日/.test(value);
}

function filteredData() {
  const needle = normalize(state.query);
  return state.data.filter((item) => {
    const matchesText = !needle || normalize(`${item.area}${item.road}${item.limits}${item.time}`).includes(needle);
    const matchesArea = !state.areas.size || state.areas.has(item.area);
    const matchesCity = state.city === "all" || item.city === state.city;
    return matchesText && matchesArea && matchesCity && timeMatches(item.time);
  });
}

function mapUrl(item) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&travelmode=driving`;
  }
  const query = `台北市 ${item.road} ${item.limits.split("-")[0]} 機車停車格`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function initMap() {
  if (!window.L) {
    $(".map-note").textContent = "地圖載入失敗，仍可使用下方路段清單";
    return;
  }
  state.map = L.map("map", { zoomControl: true }).setView([25.058, 121.505], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
}

function renderMap(matches) {
  if (!state.markerLayer) return;
  state.markerLayer.clearLayers();
  matches.filter((item) => item.lat && item.lng).forEach((item) => {
    const icon = L.divIcon({ className: `parking-dot ${item.city === "新北市" ? "newtaipei" : "taipei"}`, iconSize: [16, 16] });
    L.marker([item.lat, item.lng], { icon })
      .bindPopup(`<div class="popup-road">${escapeHtml(item.city)}・${escapeHtml(item.road)}</div><div class="popup-meta">${escapeHtml(item.area)}<br>${escapeHtml(item.limits)}<br>${escapeHtml(item.time)}</div><a class="popup-nav" href="${mapUrl(item)}" target="_blank" rel="noreferrer">用座標開始導航</a>`)
      .addTo(state.markerLayer);
  });
}

function render() {
  const matches = filteredData();
  renderMap(matches);
  $("#count").textContent = matches.length.toLocaleString("zh-TW");
  results.replaceChildren();
  const fragment = document.createDocumentFragment();
  matches.slice(0, state.visible).forEach((item, index) => {
    const card = template.content.cloneNode(true);
    card.querySelector(".area").textContent = `${item.city}・${item.area}`;
    card.querySelector(".road").textContent = item.road;
    card.querySelector(".limits").textContent = item.limits || "路段範圍依現場標誌";
    card.querySelector(".time span:last-child").textContent = item.time;
    const navigate = card.querySelector(".navigate");
    navigate.href = mapUrl(item);
    navigate.textContent = item.lat && item.lng ? "座標導航" : "搜尋地點";
    navigate.setAttribute("aria-label", item.lat && item.lng ? `導航至 ${item.road} 的座標位置` : `在地圖搜尋 ${item.road}`);
    const cardElement = card.querySelector(".card");
    cardElement.style.animationDelay = `${Math.min(index, 8) * 25}ms`;
    cardElement.dataset.mappable = Boolean(item.lat && item.lng);
    if (item.lat && item.lng) {
      cardElement.addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        state.map?.flyTo([item.lat, item.lng], 17, { duration: .7 });
        document.querySelector(".map-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    fragment.append(card);
  });
  results.append(fragment);

  const oldMore = $("#more");
  if (oldMore) oldMore.remove();
  if (matches.length > state.visible) {
    const more = document.createElement("button");
    more.id = "more";
    more.className = "apply";
    more.textContent = `再顯示 ${Math.min(60, matches.length - state.visible)} 筆`;
    more.addEventListener("click", () => { state.visible += 60; render(); });
    results.append(more);
  }
  $("#empty").hidden = matches.length !== 0;
}

function resetVisibleAndRender() { state.visible = 60; render(); }

function buildAreaOptions() {
  const counts = new Map();
  state.data.forEach(({ area }) => counts.set(area, (counts.get(area) || 0) + 1));
  const container = $("#areaOptions");
  [...counts].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant")).forEach(([area, count]) => {
    const label = document.createElement("label");
    label.className = "area-option";
    label.innerHTML = `<input type="checkbox" value="${area.replaceAll('"', '&quot;')}"><span>${area}（${count}）</span>`;
    container.append(label);
  });
}

search.addEventListener("input", () => {
  state.query = search.value;
  clear.hidden = !search.value;
  resetVisibleAndRender();
});
clear.addEventListener("click", () => { search.value = ""; search.dispatchEvent(new Event("input")); search.focus(); });

$("#timeFilters").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip === button));
  state.filter = button.dataset.filter;
  resetVisibleAndRender();
});

$("#cityFilters").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-city]");
  if (!button) return;
  document.querySelectorAll(".city-button").forEach((item) => item.classList.toggle("active", item === button));
  state.city = button.dataset.city;
  state.areas.clear();
  document.querySelectorAll("#areaOptions input").forEach((input) => { input.checked = false; });
  $("#areasButton").firstChild.textContent = "選擇區域 ";
  if (state.map) state.map.flyTo(state.city === "新北市" ? [25.03, 121.46] : state.city === "台北市" ? [25.0478, 121.5319] : [25.058, 121.505], state.city === "all" ? 11 : 12);
  resetVisibleAndRender();
});

$("#areasButton").addEventListener("click", () => $("#areasDialog").showModal());
$("#areasDialog").addEventListener("close", () => {
  if ($("#areasDialog").returnValue !== "confirm") return;
  state.areas = new Set([...document.querySelectorAll("#areaOptions input:checked")].map((input) => input.value));
  $("#areasButton").firstChild.textContent = state.areas.size ? `已選 ${state.areas.size} 區域 ` : "選擇區域 ";
  resetVisibleAndRender();
});

$("#reset").addEventListener("click", () => {
  search.value = "";
  clear.hidden = true;
  state.query = "";
  state.filter = "all";
  state.city = "all";
  state.areas.clear();
  document.querySelectorAll("#areaOptions input").forEach((input) => { input.checked = false; });
  document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === "all"));
  document.querySelectorAll(".city-button").forEach((button) => button.classList.toggle("active", button.dataset.city === "all"));
  $("#areasButton").firstChild.textContent = "選擇區域 ";
  resetVisibleAndRender();
});

$("#locate").addEventListener("click", () => {
  if (!navigator.geolocation || !state.map) return;
  const button = $("#locate");
  button.disabled = true;
  button.querySelector("span").textContent = "定位中";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      state.map.flyTo([coords.latitude, coords.longitude], 16, { duration: .8 });
      L.circleMarker([coords.latitude, coords.longitude], { radius: 8, color: "#fff", weight: 3, fillColor: "#2775ea", fillOpacity: 1 }).addTo(state.map).bindPopup("你的位置").openPopup();
      button.disabled = false;
      button.querySelector("span").textContent = "我的位置";
    },
    () => {
      button.disabled = false;
      button.querySelector("span").textContent = "無法定位";
      setTimeout(() => { button.querySelector("span").textContent = "我的位置"; }, 1800);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

initMap();

Promise.all([fetch("data/parking-map.json"), fetch("data/ntpc-routes.json")])
  .then(async (responses) => {
    if (responses.some((response) => !response.ok)) throw new Error("資料載入失敗");
    const [taipei, newTaipei] = await Promise.all(responses.map((response) => response.json()));
    return [
      ...taipei.map((item) => ({ ...item, city: "台北市" })),
      ...newTaipei,
    ];
  })
  .then((data) => {
    state.data = data.filter((item) => item.road && item.time);
    buildAreaOptions();
    render();
  })
  .catch(() => {
    $("#count").textContent = "0";
    $("#empty").hidden = false;
    $("#empty h2").textContent = "目前無法載入資料";
    $("#empty p").textContent = "請重新整理頁面後再試一次。";
  });

const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  modelContext.registerTool({
    name: "search_paid_motorcycle_parking",
    title: "搜尋路邊機車收費格",
    description: "依路名、捷運站或商圈搜尋台北市路邊收費機車停車格，並同步更新頁面結果。",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "路名、捷運站或商圈" } },
      required: ["query"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute(input) {
      if (!input || typeof input.query !== "string") throw new TypeError("query 必須是文字");
      search.value = input.query.trim();
      search.dispatchEvent(new Event("input"));
      const matches = filteredData();
      return { query: state.query, resultCount: matches.length, results: matches.slice(0, 10) };
    }
  }, { signal: lifecycle.signal });
}
