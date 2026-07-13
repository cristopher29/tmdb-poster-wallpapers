export const GENRES = {
  action: { id: 28, label: "Accion", slug: "action" },
  animation: { id: 16, label: "Animacion", slug: "animation" },
  comedy: { id: 35, label: "Comedia", slug: "comedy" },
  drama: { id: 18, label: "Drama", slug: "drama" },
  horror: { id: 27, label: "Terror", slug: "horror" },
  romance: { id: 10749, label: "Romance", slug: "romance" },
  "science-fiction": { id: 878, label: "Ciencia ficcion", slug: "science-fiction" },
  scifi: { id: 878, label: "Ciencia ficcion", slug: "science-fiction" },
  thriller: { id: 53, label: "Suspense", slug: "thriller" },
  mystery: { id: 9648, label: "Misterio", slug: "mystery" }
};

export function resolveGenre(value) {
  if (!value) {
    throw new Error("Missing genre. Use one of: " + Object.keys(GENRES).join(", "));
  }

  const normalized = String(value).trim().toLowerCase();
  if (GENRES[normalized]) {
    return GENRES[normalized];
  }

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric)) {
    const known = Object.values(GENRES).find((genre) => genre.id === numeric);
    return known ?? { id: numeric, label: `Genre ${numeric}`, slug: `genre-${numeric}` };
  }

  throw new Error(`Unknown genre "${value}". Use one of: ${Object.keys(GENRES).join(", ")}`);
}
