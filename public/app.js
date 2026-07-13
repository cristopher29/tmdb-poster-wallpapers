const state = {
  config: null,
  selected: "defaults"
};

const canvas = document.querySelector("#preview");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const scopeSelect = document.querySelector("#scopeSelect");
const saveButton = document.querySelector("#saveButton");
const fieldEls = [...document.querySelectorAll("[data-field]")];

const numericFields = new Set([
  "width",
  "height",
  "posterWidth",
  "gapX",
  "gapY",
  "radius",
  "rotation",
  "imageOffsetX",
  "imageOffsetY",
  "gradientAngle",
  "watchProvider",
  "startAlpha",
  "endAlpha",
  "pages",
  "maxPosters"
]);

init();

async function init() {
  state.config = await fetchJson("/api/config");
  fillScopes();
  bindEvents();
  loadSelection();
  renderPreview();
  setStatus("Config cargada");
}

function bindEvents() {
  scopeSelect.addEventListener("change", () => {
    state.selected = scopeSelect.value;
    loadSelection();
    renderPreview();
  });

  for (const element of fieldEls) {
    element.addEventListener("input", () => {
      writeField(element.dataset.field, readInputValue(element));
      renderPreview();
    });
  }

  saveButton.addEventListener("click", saveConfig);
}

function fillScopes() {
  scopeSelect.innerHTML = "";
  scopeSelect.append(new Option("defaults", "defaults"));
  state.config.jobs.forEach((job, index) => {
    const fallback = [job.media, job.genre, job.watchProvider ? `provider ${job.watchProvider}` : null].filter(Boolean).join(" / ") || `job ${index + 1}`;
    const label = job.name ?? job.output ?? fallback;
    scopeSelect.append(new Option(`${index + 1}. ${label}`, String(index)));
  });
}

function loadSelection() {
  const values = currentMergedValues();
  for (const element of fieldEls) {
    const field = element.dataset.field;
    const value = values[field] ?? "";
    element.value = typeof value === "object" ? JSON.stringify(value, null, 2) : value;
  }
}

function currentTarget() {
  if (state.selected === "defaults") {
    return state.config.defaults;
  }

  return state.config.jobs[Number(state.selected)];
}

function currentMergedValues() {
  if (state.selected === "defaults") {
    return { ...state.config.defaults };
  }

  return {
    ...state.config.defaults,
    ...state.config.jobs[Number(state.selected)]
  };
}

function writeField(field, value) {
  const target = currentTarget();
  if (value === "" && state.selected !== "defaults") {
    delete target[field];
    return;
  }

  target[field] = value;
}

function readInputValue(element) {
  if (numericFields.has(element.dataset.field)) {
    return element.value === "" ? "" : Number(element.value);
  }

  if (element.tagName === "TEXTAREA") {
    return parseTextareaValue(element.value);
  }

  return element.value;
}

function parseTextareaValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

async function saveConfig() {
  setStatus("Guardando...");
  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.config)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "No se pudo guardar la config.");
  }

  fillScopes();
  scopeSelect.value = state.selected;
  setStatus("Config guardada en config/weekly.json");
}

function renderPreview() {
  const values = currentMergedValues();
  const width = Number(values.width ?? 1920);
  const height = Number(values.height ?? 1080);
  const layer = createRenderLayer(values, width, height);
  const placements = createRenderPlacements(values, layer, width, height);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = values.background ?? "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const posterLayer = document.createElement("canvas");
  posterLayer.width = layer.width;
  posterLayer.height = layer.height;
  const layerCtx = posterLayer.getContext("2d");

  placements.forEach((placement, index) => {
    drawPoster(layerCtx, placement, index, Number(values.radius ?? 0));
  });

  ctx.save();
  ctx.translate(canvas.width / 2 + Number(values.imageOffsetX ?? 0), canvas.height / 2 + Number(values.imageOffsetY ?? 0));
  ctx.rotate(Number(values.rotation ?? 0) * Math.PI / 180);
  ctx.drawImage(posterLayer, -posterLayer.width / 2, -posterLayer.height / 2);
  ctx.restore();

  drawGradient(values);
}

function createRenderLayer(values, width, height) {
  const posterWidth = Number(values.posterWidth ?? 185);
  const posterHeight = Math.round(posterWidth * 1.5);
  const gapX = Number(values.gapX ?? 22);
  const gapY = Number(values.gapY ?? 22);
  const bleed = Math.ceil(Math.max(posterWidth, posterHeight) + Math.max(gapX, gapY, 0) * 2);
  const size = Math.ceil(Math.hypot(width, height)) + bleed * 2;

  return {
    width: size,
    height: size,
    offsetX: Math.floor((size - width) / 2),
    offsetY: Math.floor((size - height) / 2)
  };
}

function createRenderPlacements(values, layer, width, height) {
  const finalRect = {
    x: layer.offsetX,
    y: layer.offsetY,
    width,
    height
  };
  const aligned = createAlignedPlacements({ ...values, width: layer.width, height: layer.height }, finalRect);
  const main = aligned
    .filter((placement) => rectsIntersect(placement, finalRect))
    .map((placement, index) => ({
      ...placement,
      posterIndex: index,
      important: true
    }));
  const filler = aligned
    .filter((placement) => !rectsIntersect(placement, finalRect))
    .map((placement, index) => ({
      ...placement,
      posterIndex: main.length + index
    }));

  return [...filler, ...main];
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function createPlacements(values, width, height) {
  const posterWidth = Number(values.posterWidth ?? 185);
  const posterHeight = Math.round(posterWidth * 1.5);
  const gapX = Number(values.gapX ?? 22);
  const gapY = Number(values.gapY ?? 22);
  const marginX = Number(values.marginX ?? -120);
  const marginY = Number(values.marginY ?? -160);
  const columns = Math.ceil((width + marginX * 2) / (posterWidth + gapX)) + 2;
  const rows = Math.ceil((height + marginY * 2) / (posterHeight + gapY)) + 2;

  if (values.layout === "masonry") {
    return createMasonry(width, height, posterWidth, posterHeight, gapX, gapY, marginX, marginY, columns, rows);
  }

  const placements = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = width - marginX - posterWidth - col * (posterWidth + gapX);
      const y = marginY + row * (posterHeight + gapY);
      if (x > width || y > height || x + posterWidth < 0 || y + posterHeight < 0) {
        continue;
      }
      placements.push({ x, y, width: posterWidth, height: posterHeight, order: row + col + row * 0.001 });
    }
  }

  return placements.sort(sortPlacement);
}

function createAlignedPlacements(values, viewport) {
  const baseWidth = Number(values.posterWidth ?? 185);
  const baseHeight = Math.round(baseWidth * 1.5);
  const gapX = Number(values.gapX ?? 22);
  const gapY = Number(values.gapY ?? 22);
  const marginX = Number(values.marginX ?? -120);
  const marginY = Number(values.marginY ?? -160);
  const maxWidth = baseWidth * 2 + gapX;
  const maxHeight = baseHeight * 2 + gapY;
  const stepX = baseWidth + gapX;
  const stepY = baseHeight + gapY;
  const originX = viewport.x + viewport.width - marginX - baseWidth;
  const originY = viewport.y + marginY;
  const colStart = Math.floor((originX - values.width) / stepX) - 3;
  const colEnd = Math.ceil((originX + maxWidth) / stepX) + 3;
  const rowStart = Math.floor((0 - originY - maxHeight) / stepY) - 3;
  const rowEnd = Math.ceil((values.height - originY) / stepY) + 3;

  if (values.layout === "masonry") {
    return createAlignedMasonry(values, baseWidth, baseHeight, gapX, gapY, originX, originY, colStart, colEnd, rowStart, rowEnd);
  }

  const placements = [];
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const x = originX - col * stepX;
      const y = originY + row * stepY;
      if (x > values.width || y > values.height || x + baseWidth < 0 || y + baseHeight < 0) {
        continue;
      }
      placements.push({ x, y, width: baseWidth, height: baseHeight, order: row + col + row * 0.001 });
    }
  }

  return placements.sort(sortPlacement);
}

function createAlignedMasonry(values, baseWidth, baseHeight, gapX, gapY, originX, originY, colStart, colEnd, rowStart, rowEnd) {
  const occupied = new Set();
  const candidates = [];
  const placements = [];

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      candidates.push({ row, col, order: row + col + row * 0.001 });
    }
  }

  candidates.sort((a, b) => a.order - b.order || a.col - b.col);
  for (const candidate of candidates) {
    if (occupied.has(cellKey(candidate.row, candidate.col))) {
      continue;
    }

    const pattern = positiveMod(candidate.row * 7 + candidate.col * 11, 12);
    let spanCols = pattern === 0 || pattern === 7 || pattern === 3 ? 2 : 1;
    let spanRows = pattern === 0 || pattern === 7 ? 2 : 1;
    if (!canSpanSet(occupied, candidate.row, candidate.col, spanRows, spanCols)) {
      spanCols = 1;
      spanRows = 1;
    }

    markSpanSet(occupied, candidate.row, candidate.col, spanRows, spanCols);
    const width = baseWidth * spanCols + gapX * (spanCols - 1);
    const height = baseHeight * spanRows + gapY * (spanRows - 1);
    const x = originX - candidate.col * (baseWidth + gapX) - (width - baseWidth);
    const y = originY + candidate.row * (baseHeight + gapY);
    if (x > values.width || y > values.height || x + width < 0 || y + height < 0) {
      continue;
    }
    placements.push({ x, y, width, height, order: candidate.order });
  }

  return placements.sort(sortPlacement);
}

function createMasonry(width, height, baseWidth, baseHeight, gapX, gapY, marginX, marginY, columns, rows) {
  const occupied = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const placements = [];
  const candidates = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      candidates.push({ row, col, order: row + col + row * 0.001 });
    }
  }

  candidates.sort((a, b) => a.order - b.order || a.col - b.col);
  for (const candidate of candidates) {
    if (occupied[candidate.row]?.[candidate.col]) {
      continue;
    }

    const pattern = (candidate.row * 7 + candidate.col * 11) % 12;
    let spanCols = pattern === 0 || pattern === 7 || pattern === 3 ? 2 : 1;
    let spanRows = pattern === 0 || pattern === 7 ? 2 : 1;
    if (!canSpan(occupied, candidate.row, candidate.col, spanRows, spanCols)) {
      spanCols = 1;
      spanRows = 1;
    }

    markSpan(occupied, candidate.row, candidate.col, spanRows, spanCols);
    const itemWidth = baseWidth * spanCols + gapX * (spanCols - 1);
    const itemHeight = baseHeight * spanRows + gapY * (spanRows - 1);
    const x = width - marginX - itemWidth - candidate.col * (baseWidth + gapX);
    const y = marginY + candidate.row * (baseHeight + gapY);
    if (x > width || y > height || x + itemWidth < 0 || y + itemHeight < 0) {
      continue;
    }
    placements.push({ x, y, width: itemWidth, height: itemHeight, order: candidate.order });
  }

  return placements.sort(sortPlacement);
}

function canSpan(occupied, row, col, spanRows, spanCols) {
  for (let y = row; y < row + spanRows; y += 1) {
    for (let x = col; x < col + spanCols; x += 1) {
      if (occupied[y]?.[x] !== false) {
        return false;
      }
    }
  }
  return true;
}

function markSpan(occupied, row, col, spanRows, spanCols) {
  for (let y = row; y < row + spanRows; y += 1) {
    for (let x = col; x < col + spanCols; x += 1) {
      occupied[y][x] = true;
    }
  }
}

function canSpanSet(occupied, row, col, spanRows, spanCols) {
  for (let y = row; y < row + spanRows; y += 1) {
    for (let x = col; x < col + spanCols; x += 1) {
      if (occupied.has(cellKey(y, x))) {
        return false;
      }
    }
  }
  return true;
}

function markSpanSet(occupied, row, col, spanRows, spanCols) {
  for (let y = row; y < row + spanRows; y += 1) {
    for (let x = col; x < col + spanCols; x += 1) {
      occupied.add(cellKey(y, x));
    }
  }
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function positiveMod(value, mod) {
  return ((value % mod) + mod) % mod;
}

function sortPlacement(a, b) {
  return a.order - b.order || b.x - a.x || a.y - b.y;
}

function drawPoster(targetCtx, placement, index, radius) {
  const cx = placement.x + placement.width / 2;
  const cy = placement.y + placement.height / 2;
  const hue = ((placement.posterIndex ?? index) * 37) % 360;

  targetCtx.save();
  targetCtx.translate(cx, cy);
  roundedRect(targetCtx, -placement.width / 2, -placement.height / 2, placement.width, placement.height, radius);
  targetCtx.fillStyle = `hsl(${hue} 58% 42%)`;
  targetCtx.fill();
  targetCtx.strokeStyle = "rgba(255,255,255,.18)";
  targetCtx.lineWidth = 3;
  targetCtx.stroke();
  targetCtx.fillStyle = `hsla(${(hue + 35) % 360} 70% 65% / .28)`;
  targetCtx.fillRect(-placement.width / 2, -placement.height / 2, placement.width, placement.height * 0.42);
  targetCtx.restore();
}

function roundedRect(targetCtx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  targetCtx.beginPath();
  targetCtx.moveTo(x + safeRadius, y);
  targetCtx.arcTo(x + width, y, x + width, y + height, safeRadius);
  targetCtx.arcTo(x + width, y + height, x, y + height, safeRadius);
  targetCtx.arcTo(x, y + height, x, y, safeRadius);
  targetCtx.arcTo(x, y, x + width, y, safeRadius);
  targetCtx.closePath();
}

function drawGradient(values) {
  const startColor = hexToRgb(values.startColor ?? "#000000");
  const endColor = hexToRgb(values.endColor ?? "#000000");
  const startAlpha = clamp(Number(values.startAlpha ?? 0), 0, 1);
  const endAlpha = clamp(Number(values.endAlpha ?? 0), 0, 1);
  const angle = Number(values.gradientAngle ?? 0) * Math.PI / 180;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const scale = Math.max(Math.abs(x), Math.abs(y), 0.0001);
  const dx = x / scale * canvas.width / 2;
  const dy = y / scale * canvas.height / 2;
  const gradient = ctx.createLinearGradient(canvas.width / 2 - dx, canvas.height / 2 - dy, canvas.width / 2 + dx, canvas.height / 2 + dy);

  gradient.addColorStop(0, `rgba(${startColor.r},${startColor.g},${startColor.b},${startAlpha})`);
  gradient.addColorStop(1, `rgba(${endColor.r},${endColor.g},${endColor.b},${endAlpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16)
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function setStatus(message) {
  statusEl.textContent = message;
}
