const POSTER_RATIO = 1.5;

export function createPlacements(options) {
  const baseWidth = options.posterWidth;
  const baseHeight = Math.round(baseWidth * POSTER_RATIO);
  const gapX = options.gapX;
  const gapY = options.gapY;
  const marginX = options.marginX;
  const marginY = options.marginY;
  const columns = Math.ceil((options.width + marginX * 2) / (baseWidth + gapX)) + 2;
  const rows = Math.ceil((options.height + marginY * 2) / (baseHeight + gapY)) + 2;

  if (options.layout === "masonry") {
    return createMasonryPlacements({ ...options, baseWidth, baseHeight, columns, rows });
  }

  return createEqualPlacements({ ...options, baseWidth, baseHeight, columns, rows });
}

export function createAlignedPlacements(options, viewport) {
  const baseWidth = options.posterWidth;
  const baseHeight = Math.round(baseWidth * POSTER_RATIO);
  const gapX = options.gapX;
  const gapY = options.gapY;
  const maxWidth = baseWidth * 2 + gapX;
  const maxHeight = baseHeight * 2 + gapY;
  const stepX = baseWidth + gapX;
  const stepY = baseHeight + gapY;
  const originX = viewport.x + viewport.width - options.marginX - baseWidth;
  const originY = viewport.y + options.marginY;
  const colStart = Math.floor((originX - options.width) / stepX) - 3;
  const colEnd = Math.ceil((originX + maxWidth) / stepX) + 3;
  const rowStart = Math.floor((0 - originY - maxHeight) / stepY) - 3;
  const rowEnd = Math.ceil((options.height - originY) / stepY) + 3;

  if (options.layout === "masonry") {
    return createAlignedMasonryPlacements({
      width: options.width,
      height: options.height,
      baseWidth,
      baseHeight,
      gapX,
      gapY,
      originX,
      originY,
      colStart,
      colEnd,
      rowStart,
      rowEnd
    });
  }

  return createAlignedEqualPlacements({
    width: options.width,
    height: options.height,
    baseWidth,
    baseHeight,
    gapX,
    gapY,
    originX,
    originY,
    colStart,
    colEnd,
    rowStart,
    rowEnd
  });
}

function createEqualPlacements({ width, height, marginX, marginY, baseWidth, baseHeight, gapX, gapY, columns, rows }) {
  const placements = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = width - marginX - baseWidth - col * (baseWidth + gapX);
      const y = marginY + row * (baseHeight + gapY);
      if (x > width || y > height || x + baseWidth < 0 || y + baseHeight < 0) {
        continue;
      }

      placements.push({
        x,
        y,
        width: baseWidth,
        height: baseHeight,
        order: row + col + row * 0.001
      });
    }
  }

  return sortTopRightToBottomLeft(placements);
}

function createMasonryPlacements({ width, height, marginX, marginY, baseWidth, baseHeight, gapX, gapY, columns, rows }) {
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

    let spanCols = 1;
    let spanRows = 1;
    const pattern = (candidate.row * 7 + candidate.col * 11) % 12;
    if (pattern === 0 || pattern === 7) {
      spanCols = 2;
      spanRows = 2;
    } else if (pattern === 3) {
      spanCols = 2;
    }

    if (!canUseSpan(occupied, candidate.row, candidate.col, spanRows, spanCols)) {
      spanCols = 1;
      spanRows = 1;
    }

    markSpan(occupied, candidate.row, candidate.col, spanRows, spanCols);

    const posterWidth = baseWidth * spanCols + gapX * (spanCols - 1);
    const posterHeight = baseHeight * spanRows + gapY * (spanRows - 1);
    const x = width - marginX - posterWidth - candidate.col * (baseWidth + gapX);
    const y = marginY + candidate.row * (baseHeight + gapY);
    if (x > width || y > height || x + posterWidth < 0 || y + posterHeight < 0) {
      continue;
    }

    placements.push({
      x,
      y,
      width: posterWidth,
      height: posterHeight,
      order: candidate.order
    });
  }

  return sortTopRightToBottomLeft(placements);
}

function createAlignedEqualPlacements({ width, height, baseWidth, baseHeight, gapX, gapY, originX, originY, colStart, colEnd, rowStart, rowEnd }) {
  const placements = [];

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const x = originX - col * (baseWidth + gapX);
      const y = originY + row * (baseHeight + gapY);
      if (x > width || y > height || x + baseWidth < 0 || y + baseHeight < 0) {
        continue;
      }

      placements.push({
        x,
        y,
        width: baseWidth,
        height: baseHeight,
        order: row + col + row * 0.001
      });
    }
  }

  return sortTopRightToBottomLeft(placements);
}

function createAlignedMasonryPlacements({ width, height, baseWidth, baseHeight, gapX, gapY, originX, originY, colStart, colEnd, rowStart, rowEnd }) {
  const occupied = new Set();
  const placements = [];
  const candidates = [];

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

    let spanCols = 1;
    let spanRows = 1;
    const pattern = positiveMod(candidate.row * 7 + candidate.col * 11, 12);
    if (pattern === 0 || pattern === 7) {
      spanCols = 2;
      spanRows = 2;
    } else if (pattern === 3) {
      spanCols = 2;
    }

    if (!canUseSpanSet(occupied, candidate.row, candidate.col, spanRows, spanCols)) {
      spanCols = 1;
      spanRows = 1;
    }

    markSpanSet(occupied, candidate.row, candidate.col, spanRows, spanCols);

    const posterWidth = baseWidth * spanCols + gapX * (spanCols - 1);
    const posterHeight = baseHeight * spanRows + gapY * (spanRows - 1);
    const x = originX - candidate.col * (baseWidth + gapX) - (posterWidth - baseWidth);
    const y = originY + candidate.row * (baseHeight + gapY);
    if (x > width || y > height || x + posterWidth < 0 || y + posterHeight < 0) {
      continue;
    }

    placements.push({
      x,
      y,
      width: posterWidth,
      height: posterHeight,
      order: candidate.order
    });
  }

  return sortTopRightToBottomLeft(placements);
}

function canUseSpan(occupied, row, col, spanRows, spanCols) {
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

function canUseSpanSet(occupied, row, col, spanRows, spanCols) {
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

function sortTopRightToBottomLeft(placements) {
  return placements.sort((a, b) => a.order - b.order || b.x - a.x || a.y - b.y);
}
