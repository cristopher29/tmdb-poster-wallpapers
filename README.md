# TMDB Poster Wallpapers

Generador Node para fondos de pantalla PNG de `1920x1080` con posters de TMDB colocados desde la esquina superior derecha hacia la esquina inferior izquierda.

Layouts:

- `equal`: todos los posters tienen el mismo tamano.
- `masonry`: algunos posters ocupan mas celdas que otros.

## Autenticacion TMDB

TMDB v3 permite autenticar con `api_key` como query param o con el Token de acceso de lectura como `Authorization: Bearer`. Este proyecto usa primero `TMDB_READ_ACCESS_TOKEN`, que es el metodo recomendado por TMDB, y deja `TMDB_API_KEY` como fallback.

```bash
cp .env.example .env
```

Rellena una de estas variables:

```bash
TMDB_READ_ACCESS_TOKEN=tu_token_de_lectura
TMDB_API_KEY=tu_api_key_v3
```

## Instalacion

```bash
npm install
```

## Comandos

Drama en peliculas:

```bash
npm run generate -- --genre drama --media movie
```

K-drama en series, con posters masonry:

```bash
npm run generate -- --genre drama --media tv --originalLanguage ko --layout masonry --radius 18
```

Netflix combinando peliculas y series. `watchRegion` por defecto es `ES`:

```bash
npm run generate -- --genre all --media mixed --watchProvider 8 --startColor "#000000" --startAlpha 0.5 --endColor "#e50914" --endAlpha 0.2
```

Crunchyroll con menos separacion:

```bash
npm run generate -- --genre all --media mixed --watchProvider 283 --startColor "#000000" --startAlpha 0.5 --endColor "#f47521" --endAlpha 0.2 --gapX 8 --gapY 8
```

Generar todos los fondos definidos en `config/weekly.json`:

```bash
npm run generate:weekly
```

Abrir el editor visual de configuracion:

```bash
npm run web
```

Luego entra en `http://127.0.0.1:4173`. La web edita `config/weekly.json` directamente, con vista previa en canvas usando posters placeholder para ajustar separacion, masonry, radio, angulo de la imagen, colores, opacidad y angulo del gradiente.

Cada job puede definir su archivo con `output`. Si el PNG ya existe, se sobrescribe al generar de nuevo:

```json
{
  "name": "Accion",
  "genre": "action",
  "output": "output/accion.png"
}
```

`name` solo sirve para identificar mejor cada configuracion en la web y en el JSON de metadatos.

## Servicios incluidos

Los servicios se configuran directamente con `watchProvider` en `config/weekly.json`:

| Servicio | `watchProvider` | `watchRegion` |
|---|---:|---|
| Netflix | 8 | ES |
| Amazon Prime Video | 119 | ES |
| Disney+ | 337 | ES |
| Apple TV+ | 350 | ES |
| HBO Max / Max | 1899 | ES |
| Hulu | 15 | US |
| Crunchyroll | 283 | ES |

TMDB requiere `watch_region` cuando se usa `with_watch_providers`. El valor por defecto del proyecto es `ES`; Hulu esta configurado como `US`.

Los jobs de servicio ya incluyen su gradiente:

```json
{
  "watchProvider": 8,
  "startColor": "#000000",
  "startAlpha": 0.5,
  "endColor": "#e50914",
  "endAlpha": 0.2
}
```

## Generos incluidos

| Nombre | ID TMDB |
|---|---:|
| action | 28 |
| animation | 16 |
| comedy | 35 |
| drama | 18 |
| horror | 27 |
| romance | 10749 |
| science-fiction | 878 |
| thriller | 53 |
| mystery | 9648 |
| all | sin filtro de genero |

## Opciones principales

- `--media movie|tv|mixed`: peliculas, series o ambos tipos.
- `--genre`: nombre, ID de genero o `all`.
- `--layout equal|masonry`: posters iguales o galeria masonry.
- `--gapX`, `--gapY`: separacion horizontal y vertical.
- `--posterWidth`: anchura base del poster.
- `--radius`: border radius en pixeles.
- `--rotation 45`: rota la capa completa de posters. El generador rellena una capa expandida antes de rotarla para evitar esquinas vacias.
- `imageOffsetX` / `imageOffsetY`: desplaza el encuadre de la capa completa. Positivo mueve a derecha/abajo; negativo mueve a izquierda/arriba.
- `--startColor #000000 --startAlpha 0.5`: color y opacidad inicial del gradiente.
- `--endColor #e50914 --endAlpha 0.2`: color y opacidad final del gradiente.
- `--gradientAngle 0`: angulo del gradiente. `0` va de izquierda a derecha.
- `--originalLanguage ko`: filtro `with_original_language`, util para K-drama.
- `--watchProvider 8 --watchRegion ES`: filtro manual `with_watch_providers`.
- `--maxPosters 40`: limita posters descargados aunque el layout tenga mas slots; se repiten para rellenar.
- `--sortBy popularity.desc`: orden de TMDB. Es el valor por defecto.
- `releaseDateGte: { "subtract": { "years": 10 } }`: limita peliculas a estrenos desde hace 10 anos. En series se traduce a `first_air_date.gte`.
- `releaseDateLte: { "now": true }`: limita peliculas/series hasta hoy. En peliculas usa `primary_release_date.lte`; en series usa `first_air_date.lte`.
- `--useImageEndpoint`: usa `/movie/{id}/images` o `/tv/{id}/images` para elegir poster por idioma.
- `--posterLanguage es --includeImageLanguage es,null`: filtros de posters por idioma cuando se usa el endpoint de imagenes.
- `--cacheDir .cache`: carpeta de cache.
- `--no-cache`: desactiva la cache.

Por defecto el generador solo pide tantos posters como slots necesita el layout. Si no se usa `--useImageEndpoint`, no llama al endpoint `/images`; usa directamente `poster_path` de `/discover`.

## Cache

La cache evita repetir trabajo entre generos, servicios y ejecuciones:

- `.cache/tmdb-images/`: respuestas JSON de `/movie/{id}/images` y `/tv/{id}/images`.
- `.cache/posters/`: binarios de posters descargados desde `image.tmdb.org`.

La carpeta `.cache/` esta en `.gitignore`. El workflow de GitHub Actions usa `actions/cache` para reutilizarla entre ejecuciones semanales.

## GitHub Actions

El workflow `.github/workflows/weekly-wallpapers.yml` corre cada semana, ejecuta `npm run generate:weekly` y commitea los PNG/JSON actualizados en `output/`.

Configura en el repo uno de estos secrets:

- `TMDB_READ_ACCESS_TOKEN`
- `TMDB_API_KEY`

Para cambiar los fondos generados en CI, edita `config/weekly.json`.
