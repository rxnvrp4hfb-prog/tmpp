const state = { data: [], heavyData: [], vehicle: "scooter", query: "", filter: "all", city: "all", areas: new Set(), visible: 60, map: null, markerLayer: null, landmark: null, landmarkMarker: null };
const $ = (selector) => document.querySelector(selector);
const results = $("#results");
const template = $("#cardTemplate");
const search = $("#search");
const clear = $("#clear");
const TAIPEI_HEAVY_EFFECTIVE = new Date(2026, 9, 6);

function isUpcoming(item) {
  return item.effectiveDate && new Date(`${item.effectiveDate}T00:00:00+08:00`) > new Date();
}

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
  const matches = currentData().filter((item) => {
    const matchesText = !needle || normalize(`${item.area}${item.road}${item.limits}${item.time}`).includes(needle);
    const matchesArea = !state.areas.size || state.areas.has(item.area);
    const matchesCity = state.city === "all" || item.city === state.city;
    return matchesText && matchesArea && matchesCity && timeMatches(item.time);
  });
  if (state.landmark) {
    matches.sort((a, b) => distanceKm(state.landmark, a) - distanceKm(state.landmark, b));
  }
  return matches;
}

function currentData() {
  return state.vehicle === "heavy" ? state.heavyData : state.data;
}

function distanceKm(origin, item) {
  if (!item.lat || !item.lng) return Number.POSITIVE_INFINITY;
  const radius = 6371;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(item.lat - origin.lat);
  const deltaLng = toRadians(item.lng - origin.lng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(item.lat)) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    const icon = L.divIcon({ className: `parking-dot ${item.city === "新北市" ? "newtaipei" : "taipei"}${isUpcoming(item) ? " upcoming" : ""}`, iconSize: [16, 16] });
    L.marker([item.lat, item.lng], { icon })
      .bindPopup(`<div class="popup-road">${escapeHtml(item.city)}・${escapeHtml(item.road)}</div><div class="popup-meta">${isUpcoming(item) ? "<strong>2026/10/6 起開放</strong><br>" : ""}${escapeHtml(item.area)}${item.spaceType ? `・${escapeHtml(item.spaceType)}` : ""}<br>${escapeHtml(item.limits)}<br>${escapeHtml(item.time)}${item.rule ? `<br>${escapeHtml(item.rule)}` : ""}</div><a class="popup-nav" href="${mapUrl(item)}" target="_blank" rel="noreferrer">用座標開始導航</a>`)
      .addTo(state.markerLayer);
  });
}

function render() {
  const matches = filteredData();
  renderMap(matches);
  $("#sortStatus").hidden = !state.landmark;
  $("#count").textContent = matches.length.toLocaleString("zh-TW");
  results.replaceChildren();
  const fragment = document.createDocumentFragment();
  matches.slice(0, state.visible).forEach((item, index) => {
    const card = template.content.cloneNode(true);
    card.querySelector(".area").textContent = `${isUpcoming(item) ? "10/6 起開放・" : ""}${item.city}・${item.area}${item.spaceType ? `・${item.spaceType}` : ""}`;
    card.querySelector(".road").textContent = item.road;
    card.querySelector(".limits").textContent = item.limits || "路段範圍依現場標誌";
    card.querySelector(".time span:last-child").textContent = item.time;
    if (state.landmark && item.lat && item.lng) {
      const distance = distanceKm(state.landmark, item);
      const distanceElement = card.querySelector(".distance");
      distanceElement.hidden = false;
      distanceElement.textContent = distance < 1 ? `距離約 ${Math.round(distance * 1000)} 公尺` : `距離約 ${distance.toFixed(1)} 公里`;
    }
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
  currentData().forEach(({ area }) => counts.set(area, (counts.get(area) || 0) + 1));
  const container = $("#areaOptions");
  container.replaceChildren();
  [...counts].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant")).forEach(([area, count]) => {
    const label = document.createElement("label");
    label.className = "area-option";
    label.innerHTML = `<input type="checkbox" value="${area.replaceAll('"', '&quot;')}"><span>${area}（${count}）</span>`;
    container.append(label);
  });
}

function updateRuleNotice() {
  const notice = $("#ruleNotice");
  notice.hidden = state.vehicle !== "heavy";
  if (notice.hidden) return;
  if (state.city === "台北市") {
    notice.innerHTML = "<strong>台北市 10/6 新制：</strong>2026 年 10 月 6 日起，紅牌、黃牌可停全市約 6.3 萬席公有路邊收費機車格，可斜停最多 2 格，每次 40 元。<span class=\"unmapped-note\">新制生效前，僅可停現行已公告共用格、汽車格或大重機專用格；免費機車格不在本次開放範圍。</span>";
  } else if (state.city === "新北市") {
    notice.innerHTML = "<strong>新北市：</strong>板橋、新店的所有路邊機車格都可停大型重機，包含免費格；免費格不收費。其他行政區開放路邊收費機車格，每 4 小時 30 元。可斜停或跨 2 格，但不得超出格線。<span class=\"unmapped-note\">地圖暫無板橋、新店免費格的逐格座標，請依現場格線判斷。</span>";
  } else {
    notice.innerHTML = "<strong>雙北規則不同：</strong>台北自 2026/10/6 起開放全市公有路邊收費機車格，每次 40 元；生效前仍只能停現行已公告共用格。新北全市路邊收費機車格已開放；板橋、新店另包含免費路邊機車格。<span class=\"unmapped-note\">板橋、新店免費格目前沒有逐格公開座標，請依現場格線判斷。</span>";
  }
}

search.addEventListener("input", () => {
  if (state.landmark) clearLandmark();
  state.query = search.value;
  clear.hidden = !search.value;
  resetVisibleAndRender();
});
search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    findLandmark();
  }
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
  updateRuleNotice();
  if (state.map) state.map.flyTo(state.city === "新北市" ? [25.03, 121.46] : state.city === "台北市" ? [25.0478, 121.5319] : [25.058, 121.505], state.city === "all" ? 11 : 12);
  resetVisibleAndRender();
});

$("#vehicleFilters").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-vehicle]");
  if (!button) return;
  state.vehicle = button.dataset.vehicle;
  document.querySelectorAll(".vehicle-button").forEach((item) => item.classList.toggle("active", item === button));
  state.areas.clear();
  $("#areasButton").firstChild.textContent = "選擇區域 ";
  buildAreaOptions();
  updateRuleNotice();
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
  clearLandmark();
  search.value = "";
  clear.hidden = true;
  state.query = "";
  state.filter = "all";
  state.city = "all";
  state.vehicle = "scooter";
  state.areas.clear();
  document.querySelectorAll("#areaOptions input").forEach((input) => { input.checked = false; });
  document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === "all"));
  document.querySelectorAll(".city-button").forEach((button) => button.classList.toggle("active", button.dataset.city === "all"));
  document.querySelectorAll(".vehicle-button").forEach((button) => button.classList.toggle("active", button.dataset.vehicle === "scooter"));
  buildAreaOptions();
  updateRuleNotice();
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

function clearLandmark() {
  state.landmark = null;
  if (state.landmarkMarker && state.map) state.map.removeLayer(state.landmarkMarker);
  state.landmarkMarker = null;
}

async function findLandmark() {
  const query = search.value.trim();
  if (!query || !state.map) return;
  const button = $("#landmark");
  button.disabled = true;
  button.textContent = "搜尋中";
  try {
    const params = new URLSearchParams({ q: `${query} 台灣`, format: "jsonv2", limit: "5", countrycodes: "tw" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "Accept-Language": "zh-TW" } });
    if (!response.ok) throw new Error("搜尋失敗");
    const data = await response.json();
    const candidate = data.find((item) => Number(item.lat) >= 24.75 && Number(item.lat) <= 25.35 && Number(item.lon) >= 121.25 && Number(item.lon) <= 122.1);
    if (!candidate) throw new Error("找不到地標");
    const lat = Number(candidate.lat);
    const lng = Number(candidate.lon);
    clearLandmark();
    state.landmark = { lat, lng, name: candidate.display_name || query };
    state.query = "";
    state.landmarkMarker = L.circleMarker([lat, lng], { radius: 10, color: "#fff", weight: 4, fillColor: "#101826", fillOpacity: 1 })
      .addTo(state.map)
      .bindPopup(`<strong>${escapeHtml(state.landmark.name)}</strong><br>附近收費機車格已依距離排序`)
      .openPopup();
    state.map.flyTo([lat, lng], 15, { duration: .8 });
    resetVisibleAndRender();
  } catch (error) {
    button.textContent = error.message === "找不到地標" ? "找不到" : "再試一次";
    setTimeout(() => { button.textContent = "找地標"; }, 1800);
    return;
  } finally {
    button.disabled = false;
  }
  button.textContent = "找地標";
}

$("#landmark").addEventListener("click", findLandmark);

initMap();

Promise.all([fetch("data/parking-map.json"), fetch("data/ntpc-routes.json"), fetch("data/heavy-routes.json")])
  .then(async (responses) => {
    if (responses.some((response) => !response.ok)) throw new Error("資料載入失敗");
    const [taipei, newTaipei, heavy] = await Promise.all(responses.map((response) => response.json()));
    const taipeiHeavy = taipei.map((item) => ({
      ...item,
      city: "台北市",
      vehicle: "heavy",
      spaceType: "公有路邊收費機車格",
      effectiveDate: "2026-10-06",
      price: "40元/次",
      rule: "2026/10/6 起紅黃牌可斜停最多2格・40元/次",
    }));
    const retainedHeavy = new Date() >= TAIPEI_HEAVY_EFFECTIVE ? heavy.filter((item) => item.city !== "台北市") : heavy;
    return { general: [
      ...taipei.map((item) => ({ ...item, city: "台北市" })),
      ...newTaipei,
    ], heavy: [...retainedHeavy, ...taipeiHeavy] };
  })
  .then(({ general, heavy }) => {
    state.data = general.filter((item) => item.road && item.time);
    state.heavyData = heavy.filter((item) => item.road && item.time);
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
