#!/usr/bin/env bash
# 04-verify.sh — Verification for 04-social-sources-core
# Run from plugin root: bash 04-verify.sh

PLUGIN="$(dirname "$(realpath "$0")")"
PASS=0; FAIL=0; WARN=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
warn() { echo "  WARN: $1"; WARN=$((WARN+1)); }

echo "=== 04-social-sources-core verification ==="
echo ""

# -----------------------------------------------
echo "--- 1. Directories ---"
for source in reddit substack hacker-news github twitter; do
  test -d "$PLUGIN/skills/$source" \
    && pass "skills/$source exists" \
    || fail "skills/$source missing"
  test -d "$PLUGIN/skills/$source/references" \
    && pass "skills/$source/references exists" \
    || fail "skills/$source/references missing"
done

# -----------------------------------------------
echo ""
echo "--- 2. Reddit SKILL.md ---"
SKILL="$PLUGIN/skills/reddit/SKILL.md"
test -f "$SKILL" && pass "reddit SKILL.md exists" || fail "reddit SKILL.md missing"
grep -q "^name: reddit" "$SKILL" && pass "name: reddit" || fail "name: reddit missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
grep -q "allowed-tools:" "$SKILL" && pass "allowed-tools present" || fail "allowed-tools missing"
grep -q "discover_operations" "$SKILL" && pass "discover_operations present" || fail "discover_operations missing"
grep -q "get_operation_schema" "$SKILL" && pass "get_operation_schema present" || fail "get_operation_schema missing"
grep -q "execute_operation" "$SKILL" && pass "execute_operation present" || fail "execute_operation missing"
grep -qi "three.layer\|THREE.LAYER\|three layer" "$SKILL" && pass "THREE-LAYER documented" || fail "THREE-LAYER missing"
grep -qi "15\|20\|budget\|call" "$SKILL" && pass "call budget documented" || fail "call budget missing"
grep -qi "parameters.*object\|JSON object\|not.*string" "$SKILL" && pass "parameters quirk documented" || fail "parameters quirk missing"
grep -qi "fallback\|exa\|reddit\.com" "$SKILL" && pass "Exa fallback documented" || fail "Exa fallback missing"
grep -q "mcp__claude_ai_Reddit__\|mcp__plugin_jadlis-research_reddit__" "$SKILL" && pass "Reddit namespace present" || fail "Reddit namespace missing"

# -----------------------------------------------
echo ""
echo "--- 3. Reddit parameters.md ---"
REF="$PLUGIN/skills/reddit/references/reddit-parameters.md"
test -f "$REF" && pass "reddit-parameters.md exists" || fail "reddit-parameters.md missing"
grep -q "discover_subreddits" "$REF" && pass "discover_subreddits documented" || fail "discover_subreddits missing"
grep -q "fetch_multiple" "$REF" && pass "fetch_multiple documented" || fail "fetch_multiple missing"
grep -q "search_subreddit" "$REF" && pass "search_subreddit documented" || fail "search_subreddit missing"
grep -q "fetch_posts" "$REF" && pass "fetch_posts documented" || fail "fetch_posts missing"
grep -q "fetch_comments" "$REF" && pass "fetch_comments documented" || fail "fetch_comments missing"
grep -q "mcp__claude_ai_Reddit__" "$REF" && pass "Reddit namespace in ref" || fail "Reddit namespace missing from ref"
grep -qi "0\.\|confidence" "$REF" && pass "confidence scores documented" || fail "confidence scores missing"
grep -qi "includeDomains\|reddit\.com\|fallback" "$REF" && pass "Exa fallback in ref" || fail "Exa fallback missing from ref"
grep -qi "JSON object\|not.*string\|parameters" "$REF" && pass "parameters quirk in ref" || fail "parameters quirk missing from ref"

# -----------------------------------------------
echo ""
echo "--- 4. Hacker News SKILL.md ---"
SKILL="$PLUGIN/skills/hacker-news/SKILL.md"
test -f "$SKILL" && pass "hacker-news SKILL.md exists" || fail "hacker-news SKILL.md missing"
grep -q "^name: hacker-news" "$SKILL" && pass "name: hacker-news" || fail "name: hacker-news missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
grep -q "search_stories" "$SKILL" && pass "search_stories present" || fail "search_stories missing"
grep -q "get_stories" "$SKILL" && pass "get_stories present" || fail "get_stories missing"
grep -q "get_story_info" "$SKILL" && pass "get_story_info present" || fail "get_story_info missing"
grep -q "get_user_info" "$SKILL" && pass "get_user_info present" || fail "get_user_info missing"
grep -q "mcp__plugin_jadlis-research_hn__" "$SKILL" && pass "HN namespace present" || fail "HN namespace missing"
grep -q "uvx mcp-hn\|uvx.*mcp-hn" "$SKILL" && pass "uvx mcp-hn documented" || fail "uvx mcp-hn missing"
grep -qi "algolia\|search" "$SKILL" && pass "Algolia mentioned" || fail "Algolia missing"
grep -qi "fallback\|exa\|news\.ycombinator" "$SKILL" && pass "Exa fallback documented" || fail "Exa fallback missing"

# -----------------------------------------------
echo ""
echo "--- 5. Hacker News parameters.md ---"
REF="$PLUGIN/skills/hacker-news/references/hacker-news-parameters.md"
test -f "$REF" && pass "hacker-news-parameters.md exists" || fail "hacker-news-parameters.md missing"
grep -q "search_stories" "$REF" && pass "search_stories in ref" || fail "search_stories missing from ref"
grep -q "get_stories" "$REF" && pass "get_stories in ref" || fail "get_stories missing from ref"
grep -q "get_story_info" "$REF" && pass "get_story_info in ref" || fail "get_story_info missing from ref"
grep -q "get_user_info" "$REF" && pass "get_user_info in ref" || fail "get_user_info missing from ref"
grep -qi "top\|new\|best\|ask\|show\|job" "$REF" && pass "story categories documented" || fail "story categories missing"
grep -q "mcp__plugin_jadlis-research_hn__" "$REF" && pass "HN namespace in ref" || fail "HN namespace missing from ref"

# -----------------------------------------------
echo ""
echo "--- 6. Substack SKILL.md ---"
SKILL="$PLUGIN/skills/substack/SKILL.md"
test -f "$SKILL" && pass "substack SKILL.md exists" || fail "substack SKILL.md missing"
grep -q "^name: substack" "$SKILL" && pass "name: substack" || fail "name: substack missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
grep -q "mcp__plugin_jadlis-research_substack__" "$SKILL" && pass "substack namespace present" || fail "substack namespace missing"
grep -qi "no auth\|without auth\|public content\|no.*auth\|auth.*not" "$SKILL" && pass "no-auth note present" || fail "no-auth note missing"
grep -qi "fallback\|exa\|firecrawl\|substack\.com" "$SKILL" && pass "fallback documented" || fail "fallback missing"
grep -qi "risk\|single.*author\|small.*project\|abandoned\|maintenance" "$SKILL" && pass "risk documented" || fail "risk not documented"
grep -qi "notes" "$SKILL" && pass "Substack Notes mentioned" || fail "Substack Notes missing"

# -----------------------------------------------
echo ""
echo "--- 7. Substack parameters.md ---"
REF="$PLUGIN/skills/substack/references/substack-parameters.md"
test -f "$REF" && pass "substack-parameters.md exists" || fail "substack-parameters.md missing"
(grep -q "search" "$REF" && grep -qi "author\|profile\|crawl" "$REF") && pass "search and profile/crawl in ref" || fail "search or profile/crawl missing from ref"
grep -q "mcp__plugin_jadlis-research_substack__" "$REF" && pass "substack namespace in ref" || fail "substack namespace missing from ref"
grep -qi "notes" "$REF" && pass "Substack Notes in ref" || fail "Substack Notes missing from ref"

# -----------------------------------------------
echo ""
echo "--- 8. GitHub SKILL.md ---"
SKILL="$PLUGIN/skills/github/SKILL.md"
test -f "$SKILL" && pass "github SKILL.md exists" || fail "github SKILL.md missing"
grep -q "^name: github" "$SKILL" && pass "name: github" || fail "name: github missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
grep -q "search_repositories" "$SKILL" && pass "search_repositories present" || fail "search_repositories missing"
grep -q "search_code" "$SKILL" && pass "search_code present" || fail "search_code missing"
grep -q "search_issues" "$SKILL" && pass "search_issues present" || fail "search_issues missing"
grep -q "get_file_contents" "$SKILL" && pass "get_file_contents present" || fail "get_file_contents missing"
grep -qi "research.only\|research only\|not.*development\|read.only" "$SKILL" && pass "research-only scope documented" || fail "research-only scope missing"
! (grep "^allowed-tools:" "$SKILL" | grep -q "create_branch\|create_pull_request\|merge_pull_request\|issue_write\|delete_file") \
  && pass "write tools absent from allowed-tools" || fail "write tools in allowed-tools"
grep -q "mcp__github__" "$SKILL" && pass "GitHub namespace present" || fail "GitHub namespace missing"
grep -qi "fallback\|exa\|github\.com" "$SKILL" && pass "fallback documented" || fail "fallback missing"

# -----------------------------------------------
echo ""
echo "--- 9. GitHub parameters.md ---"
REF="$PLUGIN/skills/github/references/github-parameters.md"
test -f "$REF" && pass "github-parameters.md exists" || fail "github-parameters.md missing"
grep -qi "language:\|stars:\|topic:\|in:readme" "$REF" && pass "search qualifiers in ref" || fail "search qualifiers missing from ref"
grep -q "search_repositories" "$REF" && pass "search_repositories in ref" || fail "search_repositories missing from ref"
grep -q "search_code" "$REF" && pass "search_code in ref" || fail "search_code missing from ref"
grep -q "search_issues" "$REF" && pass "search_issues in ref" || fail "search_issues missing from ref"
grep -q "mcp__github__" "$REF" && pass "GitHub namespace in ref" || fail "GitHub namespace missing from ref"

# -----------------------------------------------
echo ""
echo "--- 10. Twitter SKILL.md ---"
SKILL="$PLUGIN/skills/twitter/SKILL.md"
test -f "$SKILL" && pass "twitter SKILL.md exists" || fail "twitter SKILL.md missing"
grep -q "^name: twitter" "$SKILL" && pass "name: twitter" || fail "name: twitter missing"
grep -q "^user-invocable: false" "$SKILL" && pass "user-invocable: false" || fail "user-invocable not set"
! grep -q "disable-model-invocation" "$SKILL" && pass "no disable-model-invocation" || fail "disable-model-invocation present"
grep -q "search_twitter" "$SKILL" && pass "search_twitter present" || fail "search_twitter missing"
grep -q "search_twitter_advanced" "$SKILL" && pass "search_twitter_advanced present" || fail "search_twitter_advanced missing"
grep -q "get_twitter_user" "$SKILL" && pass "get_twitter_user present" || fail "get_twitter_user missing"
grep -q "get_twitter_user_tweets" "$SKILL" && pass "get_twitter_user_tweets present" || fail "get_twitter_user_tweets missing"
grep -q "get_twitter_deleted_tweets" "$SKILL" && pass "get_twitter_deleted_tweets present" || fail "get_twitter_deleted_tweets missing"
grep -q "get_twitter_kol_followers" "$SKILL" && pass "get_twitter_kol_followers present" || fail "get_twitter_kol_followers missing"
grep -q "mcp__plugin_jadlis-research_twitter__" "$SKILL" && pass "twitter namespace present" || fail "twitter namespace missing"
grep -qi "6551\|proxy\|third.party\|third party" "$SKILL" && pass "proxy risk disclosed" || fail "proxy risk not disclosed"
grep -q "OPENTWITTER_API_KEY" "$SKILL" && pass "OPENTWITTER_API_KEY documented" || fail "OPENTWITTER_API_KEY missing"
grep -qi "category.*tweet\|category: tweet" "$SKILL" && pass "category:tweet documented" || fail "category:tweet missing"
grep -qi "no.*filter\|prohibit\|only.*category\|crash\|500" "$SKILL" && pass "Exa constraint documented" || fail "Exa constraint missing"

# -----------------------------------------------
echo ""
echo "--- 11. Twitter parameters.md ---"
REF="$PLUGIN/skills/twitter/references/twitter-parameters.md"
test -f "$REF" && pass "twitter-parameters.md exists" || fail "twitter-parameters.md missing"
grep -q "search_twitter" "$REF" && pass "search_twitter in ref" || fail "search_twitter missing from ref"
grep -q "get_twitter_user" "$REF" && pass "get_twitter_user in ref" || fail "get_twitter_user missing from ref"
grep -q "OPENTWITTER_API_KEY" "$REF" && pass "OPENTWITTER_API_KEY in ref" || fail "OPENTWITTER_API_KEY missing from ref"
grep -q "mcp__plugin_jadlis-research_twitter__" "$REF" && pass "twitter namespace in ref" || fail "twitter namespace missing from ref"
grep -qi "category.*tweet\|category: tweet" "$REF" && pass "category:tweet constraint in ref" || fail "category:tweet constraint missing from ref"

# -----------------------------------------------
echo ""
echo "--- 12. community-worker agent ---"
AGENT="$PLUGIN/agents/community-worker.md"
test -f "$AGENT" && pass "community-worker.md exists" || fail "community-worker.md missing"
grep -q "^name: community-worker" "$AGENT" && pass "name: community-worker" || fail "name field missing"
grep -q "permissionMode: dontAsk" "$AGENT" && pass "permissionMode: dontAsk" || fail "permissionMode missing"
grep -q "maxTurns: 50" "$AGENT" && pass "maxTurns: 50" || fail "maxTurns missing"
grep -qE "model: (claude-opus-4-6|opus)" "$AGENT" && pass "model: opus" || fail "model field missing"
grep -q "jadlis-research:reddit" "$AGENT" && pass "reddit skill listed" || fail "reddit skill missing"
grep -q "jadlis-research:substack" "$AGENT" && pass "substack skill listed" || fail "substack skill missing"
grep -q "jadlis-research:hacker-news" "$AGENT" && pass "hacker-news skill listed" || fail "hacker-news skill missing"
grep -q "jadlis-research:github" "$AGENT" && pass "github skill listed" || fail "github skill missing"
grep -q "jadlis-research:twitter" "$AGENT" && pass "twitter skill listed" || fail "twitter skill missing"
grep -q "hn" "$AGENT" && pass "hn in mcpServers" || fail "hn missing from mcpServers"
grep -q "substack" "$AGENT" && pass "substack in mcpServers" || fail "substack missing from mcpServers"
grep -q "twitter" "$AGENT" && pass "twitter in mcpServers" || fail "twitter missing from mcpServers"
grep -q "disallowedTools" "$AGENT" && pass "disallowedTools present" || fail "disallowedTools missing"
grep -q "WebSearch" "$AGENT" && pass "WebSearch blocked" || fail "WebSearch not blocked"
grep -q "WebFetch" "$AGENT" && pass "WebFetch blocked" || fail "WebFetch not blocked"
grep -q "mcp__github__create_branch\|create_branch" "$AGENT" && pass "create_branch blocked" || fail "create_branch not blocked"
grep -q "mcp__github__create_pull_request\|create_pull_request" "$AGENT" && pass "create_pull_request blocked" || fail "create_pull_request not blocked"
grep -qi "community-track\|scratchpad" "$AGENT" && pass "scratchpad convention documented" || fail "scratchpad convention missing"

# -----------------------------------------------
echo ""
echo "--- 13. .mcp.json ---"
MCP="$PLUGIN/.mcp.json"
test -f "$MCP" && pass "mcp.json exists" || fail "mcp.json missing"
jq empty "$MCP" 2>/dev/null && pass "mcp.json valid JSON" || fail "mcp.json invalid JSON"
jq -e '.mcpServers["hn"]' "$MCP" > /dev/null 2>&1 && pass "hn server present" || fail "hn server missing"
jq -e '.mcpServers["substack"]' "$MCP" > /dev/null 2>&1 && pass "substack server present" || fail "substack server missing"
jq -e '.mcpServers["twitter"]' "$MCP" > /dev/null 2>&1 && pass "twitter server present" || fail "twitter server missing"
[ "$(jq -r '.mcpServers.hn.command' "$MCP")" = "uvx" ] && pass "hn command is uvx" || fail "hn command wrong"
[ -n "$(jq -r '.mcpServers.substack.command' "$MCP")" ] && pass "substack command present" || fail "substack command missing"
[ -n "$(jq -r '.mcpServers.twitter.command' "$MCP")" ] && pass "twitter command present" || fail "twitter command missing"
! grep -q 'sk-\|api_key.*=.*[a-zA-Z0-9]\{20\}' "$MCP" && pass "no hardcoded secrets" || fail "SECURITY: hardcoded secret found"
jq -e '.mcpServers["semantic-scholar"]' "$MCP" > /dev/null 2>&1 && pass "semantic-scholar preserved" || fail "semantic-scholar lost"
jq -e '.mcpServers["openalex"]' "$MCP" > /dev/null 2>&1 && pass "openalex preserved" || fail "openalex lost"
jq -e '.mcpServers["pubmed"]' "$MCP" > /dev/null 2>&1 && pass "pubmed preserved" || fail "pubmed lost"

# -----------------------------------------------
echo ""
echo "--- 14. Namespace smoke test ---"
grep -q "mcp__claude_ai_Reddit__" "$PLUGIN/skills/reddit/SKILL.md" \
  && pass "reddit: MCP namespace present" || fail "reddit: no MCP namespace"
grep -q "mcp__plugin_jadlis-research_hn__" "$PLUGIN/skills/hacker-news/SKILL.md" \
  && pass "hacker-news: MCP namespace present" || fail "hacker-news: no MCP namespace"
grep -q "mcp__plugin_jadlis-research_substack__" "$PLUGIN/skills/substack/SKILL.md" \
  && pass "substack: MCP namespace present" || fail "substack: no MCP namespace"
grep -q "mcp__github__" "$PLUGIN/skills/github/SKILL.md" \
  && pass "github: MCP namespace present" || fail "github: no MCP namespace"
grep -q "mcp__plugin_jadlis-research_twitter__" "$PLUGIN/skills/twitter/SKILL.md" \
  && pass "twitter: MCP namespace present" || fail "twitter: no MCP namespace"

# -----------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed, $WARN warnings"
if [ "$FAIL" -eq 0 ]; then
  echo "STATUS: PASS"
  exit 0
else
  echo "STATUS: FAIL"
  exit 1
fi
