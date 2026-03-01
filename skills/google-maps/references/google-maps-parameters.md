# Google Maps & SerpAPI — Parameter Reference

## Google Maps MCP Tools

### `maps_geocode`

Converts address string to coordinates.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Full address or place name |

**Response fields:** `lat`, `lng`, `formatted_address`, `place_id`

**Example:**
```json
{ "address": "Red Square, Moscow" }
```

---

### `maps_reverse_geocode`

Converts coordinates to address.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `latitude` | float | Yes | Latitude (-90 to 90) |
| `longitude` | float | Yes | Longitude (-180 to 180) |

**Response fields:** `formatted_address`, `place_id`, address components array

---

### `maps_search_places`

Text-based place search. Primary discovery tool.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search text (e.g., "cafes near Kremlin") |
| `location` | string | No | Lat/lng center point (e.g., "55.7558,37.6173") |
| `radius` | number | No | Search radius in meters (max 50000) |

**Response fields per result:** `place_id`, `name`, `formatted_address`, `rating`, `user_ratings_total`, `geometry.location`

---

### `maps_place_details`

Full details for a specific place.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `place_id` | string | Yes | Google Places ID (from `maps_search_places`) |
| `fields` | string | No | Comma-separated list of fields to return (reduces quota usage) |

**Response fields:** `name`, `formatted_address`, `formatted_phone_number`, `website`, `rating`, `user_ratings_total`, `opening_hours`, `photos`, `reviews` (max 5), `price_level`, `types`

**Note:** Places API returns max 5 reviews. For more reviews, use SerpAPI `google_maps_reviews`.

---

### `maps_distance_matrix`

Distance and travel time between multiple origins and destinations.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `origins` | string[] | Yes | Array of addresses or "lat,lng" strings |
| `destinations` | string[] | Yes | Array of addresses or "lat,lng" strings |
| `mode` | string | No | `driving` (default), `walking`, `bicycling`, `transit` |
| `units` | string | No | `metric` (default) or `imperial` |

**Response:** Matrix of `distance` (text + meters) and `duration` (text + seconds) per origin-destination pair.

---

### `maps_elevation`

Elevation data for coordinates.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `locations` | object[] | Yes | Array of `{ lat, lng }` objects |

**Response fields per location:** `elevation` (meters above sea level), `resolution` (meters)

---

### `maps_directions`

Turn-by-turn routing between two points.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `origin` | string | Yes | Start address or "lat,lng" |
| `destination` | string | Yes | End address or "lat,lng" |
| `mode` | string | No | `driving` (default), `walking`, `bicycling`, `transit` |
| `waypoints` | string[] | No | Intermediate stops |

**Response fields:** `routes[].legs[].steps[]` with `html_instructions`, `distance`, `duration`, total `distance`, total `duration`

---

## SerpAPI Tools

### `search` with `engine: "google_maps"`

Finds places via SerpAPI. Use this to obtain `data_id` for reviews.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `engine` | string | Yes | Must be `"google_maps"` |
| `q` | string | Yes | Search query (place name + address for precision) |
| `ll` | string | No | Location bias: `@lat,lng,zoom` (e.g., `@55.7558,37.6173,15z`) |
| `hl` | string | No | Language code (e.g., `"ru"`, `"en"`) |

**Key response field:** `local_results[].data_id` — use this for reviews extraction.

---

### `search` with `engine: "google_maps_reviews"`

Extracts structured reviews for a place.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `engine` | string | Yes | Must be `"google_maps_reviews"` |
| `data_id` | string | Yes | SerpAPI internal ID (NOT Google `place_id`) |
| `hl` | string | No | Language code |
| `sort_by` | string | No | `qualityScore` (default), `newestFirst`, `ratingHigh`, `ratingLow` |
| `next_page_token` | string | No | Token from previous response for pagination |

**Response fields per review:**
- `author` — reviewer name
- `rating` — 1-5 stars
- `date` — relative date string (e.g., "2 months ago")
- `snippet` — review text
- `likes` — number of helpful votes
- `images` — optional array of review photos

**Pagination:** Token-based. Use `serpapi_pagination.next_page_token` from response. Do NOT use offset.

**Rate limits:**
| Plan | Searches/month | Price |
|------|---------------|-------|
| Free | 250 | $0 |
| Starter | 1,000 | $25/mo |
| Developer | 5,000 | $75/mo |

---

## Obtaining `data_id` — Step-by-Step

1. Call `search` with `engine: "google_maps"` and `q` = place name + city
2. In response, find the matching place in `local_results` array
3. Extract the `data_id` field (format: `0x...`)
4. Use this `data_id` with `engine: "google_maps_reviews"`

**Common mistake:** Using Google `place_id` (format: `ChIJ...`) instead of SerpAPI `data_id` (format: `0x...`). These are incompatible identifiers.
