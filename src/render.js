import sharp from "sharp";

export async function renderWallpaper({ width, height, layerWidth, layerHeight, layerOffsetX, layerOffsetY, background, placements, posters, radius, rotation, imageOffsetX = 0, imageOffsetY = 0, gradient, outputPath }) {
  const posterLayer = await renderPosterLayer({
    width: layerWidth ?? width,
    height: layerHeight ?? height,
    placements,
    posters,
    radius
  });
  const finalPosterLayer = await cropLayer(posterLayer, rotation, width, height, layerOffsetX ?? 0, layerOffsetY ?? 0, imageOffsetX, imageOffsetY);
  const composites = [];

  composites.push({
    input: finalPosterLayer,
    left: 0,
    top: 0
  });

  if (gradient) {
    composites.push({
      input: createGradientOverlay(width, height, gradient),
      left: 0,
      top: 0
    });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background
    }
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function renderPosterLayer({ width, height, placements, posters, radius }) {
  const composites = [];

  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    const poster = posters[(placement.posterIndex ?? index) % posters.length];
    composites.push({
      input: await preparePoster(poster.buffer, placement.width, placement.height, radius),
      left: Math.round(placement.x),
      top: Math.round(placement.y)
    });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function preparePoster(buffer, width, height, radius) {
  let image = sharp(buffer).resize(width, height, {
    fit: "cover",
    position: "center"
  });

  if (radius > 0) {
    const mask = Buffer.from(
      `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/>
      </svg>`
    );

    image = image
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }]);
  }

  return image.png().toBuffer();
}

async function cropLayer(buffer, rotation, width, height, offsetX, offsetY, imageOffsetX, imageOffsetY) {
  const rotated = rotation
    ? await sharp(buffer)
      .rotate(rotation, {
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer({ resolveWithObject: true })
    : await sharp(buffer)
      .png()
      .toBuffer({ resolveWithObject: true });

  const centeredLeft = Math.max(0, Math.floor((rotated.info.width - width) / 2));
  const centeredTop = Math.max(0, Math.floor((rotated.info.height - height) / 2));
  const left = clampExtract(rotation ? centeredLeft - imageOffsetX : offsetX - imageOffsetX, rotated.info.width, width);
  const top = clampExtract(rotation ? centeredTop - imageOffsetY : offsetY - imageOffsetY, rotated.info.height, height);

  return sharp(rotated.data)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
}

function clampExtract(value, sourceSize, targetSize) {
  return Math.max(0, Math.min(Math.round(value), sourceSize - targetSize));
}

function createGradientOverlay(width, height, gradient) {
  const startColor = normalizeHex(gradient.startColor ?? "#000000");
  const endColor = normalizeHex(gradient.endColor ?? "#000000");
  const startAlpha = normalizeAlpha(gradient.startAlpha, 0.5);
  const endAlpha = normalizeAlpha(gradient.endAlpha, 0);
  const points = gradientPoints(gradient.angle ?? 0);

  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="overlay" x1="${points.x1}" y1="${points.y1}" x2="${points.x2}" y2="${points.y2}">
          <stop offset="0%" stop-color="${startColor}" stop-opacity="${startAlpha}"/>
          <stop offset="100%" stop-color="${endColor}" stop-opacity="${endAlpha}"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#overlay)"/>
    </svg>`
  );
}

function gradientPoints(angle) {
  const radians = Number(angle) * Math.PI / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  const scale = Math.max(Math.abs(x), Math.abs(y), 0.0001);
  const dx = x / scale / 2;
  const dy = y / scale / 2;

  return {
    x1: round(0.5 - dx),
    y1: round(0.5 - dy),
    x2: round(0.5 + dx),
    y2: round(0.5 + dy)
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function normalizeHex(value) {
  const color = String(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }

  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }

  throw new Error(`Invalid hex color "${value}". Use #RRGGBB.`);
}

function normalizeAlpha(value, fallback) {
  const alpha = Number(value ?? fallback);
  if (!Number.isFinite(alpha)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, alpha));
}
