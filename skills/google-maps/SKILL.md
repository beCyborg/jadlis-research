---
name: google-maps
description: "Google Maps place search, geocoding, place details, and reviews extraction. Use for location research, business analysis, and review mining."
version: "1.0.0"
user-invocable: false
allowed-tools: mcp__plugin_jadlis-research_google-maps__maps_geocode, mcp__plugin_jadlis-research_google-maps__maps_reverse_geocode, mcp__plugin_jadlis-research_google-maps__maps_search_places, mcp__plugin_jadlis-research_google-maps__maps_place_details, mcp__plugin_jadlis-research_google-maps__maps_distance_matrix, mcp__plugin_jadlis-research_google-maps__maps_elevation, mcp__plugin_jadlis-research_google-maps__maps_directions, mcp__plugin_jadlis-research_serpapi__search, mcp__claude_ai_Exa__web_search_exa
---

# Google Maps Research Protocols

## Tool Selection

| Task | Primary Tool | Fallback |
|------|-------------|----------|
| Find place by name/address | `maps_search_places` | Exa `site:google.com/maps` |
| Get place details (rating, hours, photos) | `maps_place_details` | Exa on Yelp/TripAdvisor |
| Get structured reviews with ratings | SerpAPI `google_maps_reviews` | Exa `site:yelp.com` / `site:tripadvisor.com` |
| Geocoding (address → coordinates) | `maps_geocode` | — |
| Reverse geocoding (coordinates → address) | `maps_reverse_geocode` | — |
| Distance/time between points | `maps_distance_matrix` | — |
| Routing between points | `maps_directions` | — |
| Elevation data | `maps_elevation` | — |

## Critical: place_id vs data_id

These are **different identifiers** from different systems. Do NOT interchange them.

- **`place_id`** — Google Places API identifier. Returned by `maps_search_places`, used with `maps_place_details`. Format: `ChIJ...` (starts with ChIJ).
- **`data_id`** — SerpAPI internal identifier. Obtained by running SerpAPI `search` with `engine: "google_maps"`. Used with `google_maps_reviews` engine. Format: `0x...` (hex prefix).

You **cannot** pass a `place_id` as `data_id`. The review extraction will fail silently or return wrong results.

## Four-Step Workflow

### Step 1: Place Discovery
Call `maps_search_places` with text query.
→ Returns: `place_id`, `name`, `formatted_address`, `rating`

### Step 2: Place Details
Call `maps_place_details` with `place_id` from step 1.
→ Returns: rating, address, hours, phone, website, photos, reviews (max 5 from Places API)

### Step 3: SerpAPI Place Lookup
Call SerpAPI `search` with:
- `engine`: `"google_maps"`
- `q`: place name + address from step 1
→ Returns: place listing with `data_id`

### Step 4: Reviews Extraction
Call SerpAPI `search` with:
- `engine`: `"google_maps_reviews"`
- `data_id`: from step 3
→ Returns: structured reviews with `author`, `rating` (1-5), `date`, `snippet`, `likes`

**Shortcut:** If only reviews are needed, skip steps 1-2 and start at step 3.

**Pagination:** Reviews use token-based pagination. Use `next_page_token` from response for the next page. NOT offset-based.

## Error Patterns

| Error | Cause | Action |
|-------|-------|--------|
| `INVALID_API_KEY` | Wrong or missing `GOOGLE_MAPS_API_KEY` | Check env var in `~/.zshrc` |
| `OVER_QUERY_LIMIT` | Quota exceeded | Wait or upgrade billing plan |
| `ZERO_RESULTS` | No match for query | Refine query, try broader terms |
| `REQUEST_DENIED` | API not enabled or referrer restriction | Enable Places API in Google Cloud Console; use IP restriction, not HTTP referrer |
| SerpAPI 401 | Wrong `SERPAPI_KEY` | Check env var |
| SerpAPI rate limit | 250 req/month on free tier (~8/day) | Wait or upgrade plan |

## Fallback Chain

When primary tools fail, fall back in order:

1. **Google Maps MCP error** → Use Exa `web_search_exa` with `includeDomains: ["yelp.com", "tripadvisor.com", "2gis.ru"]` and query = place name
2. **SerpAPI error** → Use Exa with query `"[place name] reviews"` plus domain filters `["yelp.com", "tripadvisor.com"]`
3. **Exa error** → Skip source and inform user that reviews are unavailable

## Reference

See `references/google-maps-parameters.md` for complete parameter documentation of all 7 Google Maps MCP tools and SerpAPI `google_maps_reviews` engine.
