#!/bin/bash
# firecrawl-search-block.sh — PreToolUse: firecrawl_search
# Hard-blocks firecrawl_search unconditionally. Use Exa for search.
# Input: hook JSON on stdin (consumed but ignored)

INPUT=$(cat)
echo "firecrawl_search is disabled. Use mcp__plugin_jadlis-research_exa__web_search_exa for all search operations." >&2
exit 2
