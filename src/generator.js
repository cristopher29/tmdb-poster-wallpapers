import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { format, sub } from "date-fns";
import { DiskCache, extensionFromTmdbPath } from "./cache.js";
import { createAlignedPlacements, createPlacements } from "./layout.js";
import { renderWallpaper } from "./render.js";
import { downloadImage, TmdbClient } from "./tmdb.js";
import { resolveGenre } from "./genres.js";

const DEFAULTS = {
  media: "movie",
  layout: "equal",
  width: 1920,
  height: 1080,
  posterWidth: 185,
  gapX: 22,
  gapY: 22,
  marginX: -120,
  marginY: -160,
  radius: 12,
  rotation: 45,
  imageOffsetX: 0,
  imageOffsetY: 0,
  gradientAngle: 0,
  startColor: "#000000",
  startAlpha: 0.5,
  endColor: "#000000",
  endAlpha: 0,
  background: "#050505",
  language: "es-ES",
  sortBy: "popularity.desc",
  releaseDateGte: { subtract: { years: 10 } },
  releaseDateLte: { now: true },
  pages: 8,
  includeAdult: false,
  imageSize: "w780",
  outputDir: "output",
  cache: true,
  cacheDir: ".cache",
  watchRegion: "ES",
  watchMonetizationTypes: "flatrate"
};

export async function generateWallpaper(inputOptions = {}) {
  const options = normalizeOptions(inputOptions);
  const client = new TmdbClient();
  const cache = new DiskCache({ enabled: options.cache, cacheDir: options.cacheDir });
  const genre = options.genre === "all" ? null : resolveGenre(options.genre);
  const finalPlacements = createPlacements(options);
  const renderLayer = createRenderLayer(options);
  const placements = createRenderPlacements(options, renderLayer, finalPlacements);
  const importantPlacementCount = placements.filter((placement) => placement.important).length;
  const targetPosterCount = resolveTargetPosterCount(options, importantPlacementCount);

  const items = await fetchDiscoverItems(client, {
    ...options,
    genreId: genre?.id,
    targetPosterCount
  });

  const posterPaths = await resolvePosterPaths(client, items, options, cache);
  if (posterPaths.length === 0) {
    throw new Error("TMDB returned no poster images for this filter.");
  }

  const posters = await downloadPosters(client, posterPaths, options.imageSize, cache);
  await mkdir(options.outputDir, { recursive: true });

  const outputPath = options.output ?? path.join(options.outputDir, buildFileName(options, genre));
  await renderWallpaper({
    width: options.width,
    height: options.height,
    layerWidth: renderLayer.width,
    layerHeight: renderLayer.height,
    layerOffsetX: renderLayer.offsetX,
    layerOffsetY: renderLayer.offsetY,
    background: options.background,
    placements,
    posters,
    radius: options.radius,
    rotation: options.rotation,
    imageOffsetX: options.imageOffsetX,
    imageOffsetY: options.imageOffsetY,
    gradient: options.gradient,
    outputPath
  });

  const metadata = {
    generatedAt: new Date().toISOString(),
    outputPath,
    name: options.name || null,
    media: options.media,
    mediaTypes: options.mediaTypes,
    genre,
    layout: options.layout,
    sortBy: options.sortBy,
    releaseDateGte: options.releaseDateGte || null,
    releaseDateLte: options.releaseDateLte || null,
    firstAirDateGte: options.firstAirDateGte || null,
    firstAirDateLte: options.firstAirDateLte || null,
    rotation: options.rotation,
    imageOffsetX: options.imageOffsetX,
    imageOffsetY: options.imageOffsetY,
    gradient: options.gradient,
    originalLanguage: options.originalLanguage || null,
    watchProvider: options.watchProvider || null,
    watchRegion: options.watchRegion || null,
    cache: options.cache ? options.cacheDir : null,
    width: options.width,
    height: options.height,
    posterCount: posters.length,
    placementCount: importantPlacementCount,
    renderPlacementCount: placements.length,
    renderLayer,
    tmdbIds: items.slice(0, posters.length).map((item) => ({ media: item.mediaType, id: item.id }))
  };

  await writeFile(outputPath.replace(/\.png$/i, ".json"), JSON.stringify(metadata, null, 2));

  return metadata;
}

function createRenderLayer(options) {
  const posterHeight = Math.round(options.posterWidth * 1.5);
  const bleed = Math.ceil(Math.max(options.posterWidth, posterHeight) + Math.max(options.gapX, options.gapY, 0) * 2);
  const size = Math.ceil(Math.hypot(options.width, options.height)) + bleed * 2;

  return {
    width: size,
    height: size,
    bleed,
    offsetX: Math.floor((size - options.width) / 2),
    offsetY: Math.floor((size - options.height) / 2)
  };
}

function createRenderPlacements(options, renderLayer, finalPlacements) {
  const finalRect = {
    x: renderLayer.offsetX,
    y: renderLayer.offsetY,
    width: options.width,
    height: options.height
  };
  const alignedPlacements = createAlignedPlacements({
    ...options,
    width: renderLayer.width,
    height: renderLayer.height
  }, finalRect);
  const mainPlacements = alignedPlacements
    .filter((placement) => rectsIntersect(placement, finalRect))
    .map((placement, index) => ({
      ...placement,
      posterIndex: index,
      important: true
    }));
  const fillerPlacements = alignedPlacements
    .filter((placement) => !rectsIntersect(placement, finalRect))
    .map((placement, index) => ({
      ...placement,
      posterIndex: mainPlacements.length + index
    }));

  return [...fillerPlacements, ...mainPlacements];
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function normalizeOptions(inputOptions) {
  const options = {
    ...DEFAULTS,
    ...inputOptions
  };

  options.media = String(options.media).toLowerCase();
  if (["mixed", "all", "movie+tv", "movie,tv"].includes(options.media)) {
    options.media = "mixed";
    options.mediaTypes = ["movie", "tv"];
  } else if (["movie", "tv"].includes(options.media)) {
    options.mediaTypes = [options.media];
  } else {
    throw new Error('media must be "movie", "tv", or "mixed".');
  }

  options.layout = String(options.layout).toLowerCase();
  if (!["equal", "masonry"].includes(options.layout)) {
    throw new Error('layout must be "equal" or "masonry".');
  }

  if (typeof options.cache === "string") {
    options.cache = !["0", "false", "no", "off"].includes(options.cache.toLowerCase());
  }

  if (options.noCache || options["no-cache"]) {
    options.cache = false;
  }

  for (const key of ["width", "height", "posterWidth", "gapX", "gapY", "marginX", "marginY", "radius", "rotation", "imageOffsetX", "imageOffsetY", "gradientAngle", "pages", "minPosters", "maxPosters", "startAlpha", "endAlpha", "gradientStartAlpha", "gradientEndAlpha"]) {
    if (options[key] !== undefined) {
      options[key] = Number(options[key]);
    }
  }

  options.minPosters = Number.isFinite(options.minPosters) ? options.minPosters : 0;
  options.genre = String(options.genre ?? "action").toLowerCase();

  if (["all", "any", "*"].includes(options.genre)) {
    options.genre = "all";
  }

  options.gradient = options.gradient ?? buildGradient(options);

  if (options.watchProvider !== undefined && options.watchProvider !== null && options.watchProvider !== "") {
    options.watchProvider = String(options.watchProvider);
  }

  options.releaseDateGte = normalizeDateOption(options.releaseDateGte);
  options.releaseDateLte = normalizeDateOption(options.releaseDateLte);
  options.firstAirDateGte = normalizeDateOption(options.firstAirDateGte ?? options.releaseDateGte);
  options.firstAirDateLte = normalizeDateOption(options.firstAirDateLte ?? options.releaseDateLte);

  return options;
}

function normalizeDateOption(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string" && value.trim().startsWith("{")) {
    return normalizeDateOption(JSON.parse(value));
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    if (value.now) {
      return format(new Date(), "yyyy-MM-dd");
    }

    if (value.date) {
      return String(value.date);
    }

    if (value.subtract && typeof value.subtract === "object") {
      return format(sub(new Date(), value.subtract), "yyyy-MM-dd");
    }

    throw new Error(`Unsupported date option: ${JSON.stringify(value)}`);
  }

  return String(value);
}

function buildGradient(options) {
  const startColor = options.startColor ?? options.gradientStartColor;
  const endColor = options.endColor ?? options.gradientEndColor;
  const startAlpha = options.startAlpha ?? options.gradientStartAlpha;
  const endAlpha = options.endAlpha ?? options.gradientEndAlpha;

  if (!startColor && !endColor) {
    return null;
  }

  return {
    startColor: startColor ?? "#000000",
    startAlpha: startAlpha ?? 0.5,
    endColor: endColor ?? "#000000",
    endAlpha: endAlpha ?? 0,
    angle: options.gradientAngle ?? 0
  };
}

function resolveTargetPosterCount(options, placementCount) {
  const minimum = Math.max(0, options.minPosters);
  const requested = Math.max(placementCount, minimum);
  if (Number.isFinite(options.maxPosters)) {
    return Math.min(requested, Math.max(1, options.maxPosters));
  }

  return requested;
}

async function fetchDiscoverItems(client, options) {
  const items = [];
  const seen = new Set();

  for (let page = 1; page <= options.pages && items.length < options.targetPosterCount; page += 1) {
    const pageItems = [];

    for (const mediaType of options.mediaTypes) {
      const data = await client.discover({ ...options, media: mediaType, page });
      for (const item of data.results ?? []) {
        const key = `${mediaType}:${item.id}`;
        if (!item.poster_path || seen.has(key)) {
          continue;
        }
        seen.add(key);
        pageItems.push({ ...item, mediaType });
      }
    }

    items.push(...sortDiscoveredItems(pageItems, options.sortBy));
  }

  return items.slice(0, options.targetPosterCount);
}

function sortDiscoveredItems(items, sortBy) {
  if (sortBy === "popularity.desc") {
    return items.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  }

  if (sortBy === "popularity.asc") {
    return items.sort((a, b) => (a.popularity ?? 0) - (b.popularity ?? 0));
  }

  return items;
}

async function resolvePosterPaths(client, items, options, cache) {
  if (!options.useImageEndpoint && !options.posterLanguage && !options.includeImageLanguage) {
    return items.map((item) => item.poster_path).filter(Boolean);
  }

  const paths = [];
  for (const item of items) {
    const imageOptions = {
      language: options.posterLanguage,
      includeImageLanguage: options.includeImageLanguage ?? `${options.posterLanguage ?? options.language.split("-")[0]},null`
    };
    const images = await getImagesWithCache(client, item, imageOptions, cache);

    const poster = [...(images.posters ?? [])]
      .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.vote_count ?? 0) - (a.vote_count ?? 0))
      .find((candidate) => candidate.file_path);

    paths.push(poster?.file_path ?? item.poster_path);
  }

  return paths.filter(Boolean);
}

async function getImagesWithCache(client, item, imageOptions, cache) {
  const cacheKey = JSON.stringify({
    media: item.mediaType,
    id: item.id,
    ...imageOptions
  });
  const cached = await cache.getJson("tmdb-images", cacheKey);
  if (cached) {
    return cached;
  }

  const images = await client.images(item.mediaType, item.id, imageOptions);
  await cache.setJson("tmdb-images", cacheKey, images);
  return images;
}

async function downloadPosters(client, posterPaths, imageSize, cache) {
  const posters = [];
  const memo = new Map();
  const concurrency = 6;

  for (let index = 0; index < posterPaths.length; index += concurrency) {
    const chunk = posterPaths.slice(index, index + concurrency);
    const downloaded = await Promise.all(
      chunk.map(async (posterPath) => {
        const buffer = await getPosterBuffer(client, posterPath, imageSize, cache, memo);
        return {
          path: posterPath,
          buffer
        };
      })
    );
    posters.push(...downloaded);
  }

  return posters;
}

async function getPosterBuffer(client, posterPath, imageSize, cache, memo) {
  const key = `${imageSize}:${posterPath}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  const namespace = path.join("posters", imageSize);
  const extension = extensionFromTmdbPath(posterPath);
  const cached = await cache.getBuffer(namespace, posterPath, extension);
  if (cached) {
    memo.set(key, cached);
    return cached;
  }

  const buffer = await downloadImage(client.posterUrl(posterPath, imageSize));
  await cache.setBuffer(namespace, posterPath, extension, buffer);
  memo.set(key, buffer);
  return buffer;
}

function buildFileName(options, genre) {
  const parts = [
    options.media,
    genre?.slug ?? "all-genres",
    options.layout,
    options.originalLanguage ? `lang-${options.originalLanguage}` : null,
    options.watchProvider ? `provider-${options.watchProvider}` : null,
    `${options.width}x${options.height}`
  ].filter(Boolean).map(safeFilePart);

  return `${parts.join("-")}.png`;
}

function safeFilePart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}
