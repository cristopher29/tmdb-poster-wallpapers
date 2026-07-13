const API_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export class TmdbClient {
  constructor({ readAccessToken = process.env.TMDB_READ_ACCESS_TOKEN, apiKey = process.env.TMDB_API_KEY } = {}) {
    this.readAccessToken = readAccessToken;
    this.apiKey = apiKey;

    if (!this.readAccessToken && !this.apiKey) {
      throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in your environment.");
    }
  }

  async discover(options) {
    const isTv = options.media === "tv";
    const endpoint = isTv ? "/discover/tv" : "/discover/movie";
    const params = {
      include_adult: String(Boolean(options.includeAdult)),
      language: options.language,
      page: String(options.page),
      sort_by: normalizeSortBy(options.sortBy, isTv)
    };

    if (options.genreId) {
      params.with_genres = String(options.genreId);
    }

    if (options.originalLanguage) {
      params.with_original_language = options.originalLanguage;
    }

    if (isTv && options.firstAirDateLte) {
      params["first_air_date.lte"] = options.firstAirDateLte;
    }

    if (isTv && options.firstAirDateGte) {
      params["first_air_date.gte"] = options.firstAirDateGte;
    }

    if (!isTv && options.releaseDateLte) {
      params["primary_release_date.lte"] = options.releaseDateLte;
    }

    if (!isTv && options.releaseDateGte) {
      params["primary_release_date.gte"] = options.releaseDateGte;
    }

    if (options.watchProvider) {
      if (!options.watchRegion) {
        throw new Error("watchRegion is required when using with_watch_providers.");
      }
      params.watch_region = options.watchRegion;
      params.with_watch_providers = String(options.watchProvider);
      if (options.watchMonetizationTypes) {
        params.with_watch_monetization_types = options.watchMonetizationTypes;
      }
    }

    return this.get(endpoint, params);
  }

  async images(media, id, options = {}) {
    const endpoint = media === "tv" ? `/tv/${id}/images` : `/movie/${id}/images`;
    const params = {};

    if (options.language) {
      params.language = options.language;
    }

    if (options.includeImageLanguage) {
      params.include_image_language = options.includeImageLanguage;
    }

    return this.get(endpoint, params);
  }

  async get(path, params = {}) {
    const url = new URL(`${API_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    const headers = {
      accept: "application/json"
    };

    if (this.readAccessToken) {
      headers.authorization = `Bearer ${this.readAccessToken}`;
    } else {
      url.searchParams.set("api_key", this.apiKey);
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TMDB request failed ${response.status} ${response.statusText}: ${body}`);
    }

    return response.json();
  }

  posterUrl(path, size = "w780") {
    return `${IMAGE_BASE_URL}/${size}${path}`;
  }
}

function normalizeSortBy(sortBy, isTv) {
  if (isTv && sortBy === "primary_release_date.desc") {
    return "first_air_date.desc";
  }

  if (isTv && sortBy === "primary_release_date.asc") {
    return "first_air_date.asc";
  }

  return sortBy;
}

export async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image request failed ${response.status} ${response.statusText}: ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
