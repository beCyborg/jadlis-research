export const meta = {
  name: 'full-research-core',
  description: 'Ядро full-research: N канальных исследователей → per-claim верификация с brave counter-search (фильтрация) → analyst пишет отчёт в workDir. Vault-контракт — в скилле.',
  phases: [
    { title: 'Fan-out', detail: 'до 10 канальных агентов (web×3: brave/codex/grok + reddit/twitter/hn/substack + opt-in yandex/youtube/telegram) параллельно' },
    { title: 'Verify', detail: 'curator (Opus 5) выделяет атомарные claims → per-claim verifiers: линза-опровержение (Brave) + кросс-тип линза (сообщества/первоисточники) → CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED (schema v2)' },
    { title: 'Synthesize', detail: 'analyst (Fable 5) пишет отчёт (verified:false), фильтрует непрошедшие claims, дедупит web-движки' },
  ],
}

// ── Параметры (skill передаёт после Phase 1: recon + интервью; дефолты — для dry-run) ──
// args может прийти строкой JSON — нормализуем.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const QUERY = A.refinedQuery || 'Сравни локальные AI-ассистенты для кодинга в 2026: приватность vs возможности'
const DECISION = A.decisionContext || ''
const AI_MODEL = A.aiModel || 'unknown'
const DATE = A.date || 'DRYRUN-DATE'
const WORK_DIR = A.workDir || '.full-research/dryrun'
// ${CLAUDE_PLUGIN_ROOT} в JS НЕ подставляется — скилл передаёт его значением.
// Дефолт нужен только для dry-run: без pluginRoot агенты не найдут протоколы.
const PLUGIN_ROOT = A.pluginRoot || '.'
const VAULT_PATH = A.vaultPath || ''
const SUBSTACK_HANDLES = Array.isArray(A.substackHandles) ? A.substackHandles : []
const VERIFIERS = 2
const MAX_CLAIMS = 8
const MIN_CHANNELS = 2
// Воркер: пиннинг Opus 5 + effort xhigh через субагента researcher-opus-xhigh.
// Реестр агентов кэшируется на старте сессии — если субагент создан в текущей сессии,
// оркестратор может передать workerOpts: { model: 'opus' } как фоллбэк.
const WORKER_OPTS = A.workerOpts || { agentType: 'jadlis-research:researcher-opus-xhigh' }
const w = extra => Object.assign({}, WORKER_OPTS, extra)
// Оркестратор-роли (curator, analyst — большая логика: отбор claims, синтез).
// curator ВСЕГДА идёт через orchestrator-fable-xhigh (Opus 5) — структурная
// экстракция claims не intelligence-sensitive, Fable-эджа тут нет.
// analyst — единственное место с реальным Fable-преимуществом (синтез из
// 400–600K контекста). Причина моста — ремап алиасов: CLAUDE_CODE_SUBAGENT_MODEL
// мапит субагентов (opts.model, Agent-тул, agentType-frontmatter) в Opus 5 —
// это осознанный роутинг (Fable планирует, Opus исполняет), а НЕ закрытость
// Fable для субагентов (опровергнуто 2026-07-05). Отдельный headless-процесс
// `claude -p --model claude-fable-5` ремапу не подчиняется (проверено: exit 0, ~7 c старт).
// Поэтому дефолт для analyst — FABLE-МОСТ: лёгкий воркер записывает ролевой промпт
// в файл и исполняет его вложенным headless Fable. Отключение: args.fableBridge=false
// → analyst тоже идёт через orchestrator-fable-xhigh (Opus 5).
const FABLE_BRIDGE = A.fableBridge !== false
const ORCH_OPTS = A.orchOpts || { agentType: 'jadlis-research:orchestrator-fable-xhigh' }
const o = extra => Object.assign({}, ORCH_OPTS, extra)

function bridgePrompt(role, rolePrompt, allowedTools, fieldsHint, schemaObj) {
  const pf = `${WORK_DIR}/_fable-${role}-prompt.md`
  const of = `${WORK_DIR}/_fable-${role}-out.json`
  const sf = `${WORK_DIR}/_fable-${role}-schema.json`
  // Производная схема для --json-schema: без корневых $schema/$id/title/description
  // и числовых/строковых констрейнтов (иначе structured_output тихо отключается).
  const derived = JSON.parse(JSON.stringify(schemaObj), (k, v) =>
    (k === 'minLength' || k === 'minimum' || k === 'maximum') ? undefined : v)
  delete derived.$schema; delete derived.$id; delete derived.title; delete derived.description
  return `Ты — технический МОСТ к модели Fable 5. Сам ролевую работу НЕ делай (кроме шага «Деградация»). Ровно четыре шага:

1. Через Write запиши в файл ${pf} ДОСЛОВНО весь текст между маркерами <<<ROLE_PROMPT и ROLE_PROMPT>>> (маркеры не включать, текст не менять и не сокращать).

2. Через Write запиши в файл ${sf} ДОСЛОВНО JSON между маркерами <<<SCHEMA и SCHEMA>>>.

3. ОДИН Bash-вызов (параметр timeout: 600000; --settings глушит хуки, < /dev/null обязателен):
cat "${pf}" | claude -p --model claude-fable-5 --effort high --allowedTools "${allowedTools}" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --settings '{"disableAllHooks":true}' --json-schema "$(cat "${sf}")" --output-format json > "${of}" 2>"${WORK_DIR}/_fable-${role}.err" < /dev/null; echo "EXIT=$?"

4. Прочитай ${of} (Read): возьми поле .structured_output — это готовый объект с полями ${fieldsHint}; верни его по своей схеме БЕЗ изменений. Если ключа .structured_output нет — возьми JSON-блок в конце .result.

Деградация: EXIT≠0 или ни .structured_output, ни валидного JSON в .result → один повтор шага 3; если снова сбой — выполни ролевой промпт из ${pf} САМОСТОЯТЕЛЬНО и верни результат по схеме (пометь в первом текстовом поле "[bridge-fallback: opus]"; если ролевой промпт писал файл отчёта с frontmatter — замени в нём ai_model на "claude-opus-5").

<<<SCHEMA
${JSON.stringify(derived)}
SCHEMA>>>

<<<ROLE_PROMPT
${rolePrompt}
ROLE_PROMPT>>>`
}
// Хвост ролевого промпта для headless-исполнения (нет StructuredOutput — финал печатается JSON-блоком)
const bridgeTail = fieldsHint => `\n\nФИНАЛЬНЫЙ ВЫВОД (ты работаешь в headless-режиме): закончи ответ РОВНО ОДНИМ JSON-объектом с полями ${fieldsHint} внутри блока \`\`\`json ... \`\`\` — и никакого текста после блока.`

const PROTO_DIR = `${PLUGIN_ROOT}/skills/full-research/protocols`
const ALL_CHANNELS = {
  web: { source: 'Web (Brave Search)', prefix: 'w', protocol: `${PROTO_DIR}/web-protocol.md`, file: 'web.md' },
  codexweb: { source: 'Web (Codex/GPT-5.6 Sol)', prefix: 'cx', protocol: `${PROTO_DIR}/codex-web-protocol.md`, file: 'web-codex.md' },
  grokweb: { source: 'Web (Grok)', prefix: 'gw', protocol: `${PROTO_DIR}/grok-web-protocol.md`, file: 'web-grok.md' },
  reddit: { source: 'Reddit', prefix: 'r', protocol: `${PROTO_DIR}/reddit-protocol.md`, file: 'reddit.md' },
  twitter: { source: 'Twitter/X', prefix: 'x', protocol: `${PROTO_DIR}/twitter-protocol.md`, file: 'twitter.md' },
  hackernews: { source: 'HackerNews', prefix: 'hn', protocol: `${PROTO_DIR}/hackernews-protocol.md`, file: 'hackernews.md' },
  substack: { source: 'Substack', prefix: 'ss', protocol: `${PROTO_DIR}/substack-protocol.md`, file: 'substack.md' },
  // opt-in канал для RU-тем (платный: ~0,1-0,2 ₽/тема); в дефолтный SELECTED не входит
  yandex: { source: 'Web (Яндекс, Рунет)', prefix: 'y', protocol: `${PROTO_DIR}/yandex-protocol.md`, file: 'web-yandex.md' },
  // opt-in каналы (2026-08-15): включаются роутинг-деревом SKILL.md, в default не входят
  youtube: { source: 'YouTube', prefix: 'yt', protocol: `${PROTO_DIR}/youtube-protocol.md`, file: 'youtube.md' },
  telegram: { source: 'Telegram (публичные каналы)', prefix: 'tg', protocol: `${PROTO_DIR}/telegram-protocol.md`, file: 'telegram.md' },
}
// Семья = независимый ТИП источника. web/codexweb/grokweb — три движка над одним
// открытым вебом: их совпадение НЕ является независимой триангуляцией.
const FAMILY = { web: 'web', codexweb: 'web', grokweb: 'web', yandex: 'web', reddit: 'reddit', twitter: 'twitter', hackernews: 'hn', substack: 'substack', youtube: 'youtube', telegram: 'telegram' }
const SELECTED = (Array.isArray(A.channels) && A.channels.length)
  ? A.channels.filter(c => ALL_CHANNELS[c])
  : ['web', 'codexweb', 'grokweb', 'reddit', 'twitter', 'hackernews', 'substack']

// ── Схемы ──
const CHANNEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' }, description: '3-5 главных тезисов' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          prefix: { type: 'string', description: 'напр. [w1], [r3]' },
          url: { type: 'string' },
          relevance: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          context: { type: 'string', description: 'цитата/пересказ' },
          reliability: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F'], description: 'надёжность ИСТОЧНИКА по Admiralty (не правдоподобие информации)' },
          reliabilityWhy: { type: 'string', description: 'одна строка: тип источника / экспертиза автора / свежесть / конфликт интересов' },
        },
        required: ['prefix', 'url', 'relevance', 'context', 'reliability', 'reliabilityWhy'],
      },
    },
    counterarguments: { type: 'array', items: { type: 'string' } },
    sourceQuality: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    fileWritten: { type: 'string' },
    snapshots: { type: 'array', items: { type: 'string' }, description: 'пути записанных снапшотов в workDir/snapshots/ (пустой = ни одного HIGH-источника не снапшочено — это видно телеметрии)' },
    startedAt: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS — до первого поиска' },
    finishedAt: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS — после Write' },
  },
  required: ['source', 'findings', 'citations', 'counterarguments', 'sourceQuality', 'fileWritten', 'snapshots'],
}

const CURATOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claims: {
      type: 'array',
      description: 'самые сильные cross-channel claims (до 8) для live-верификации',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          statement: { type: 'string', description: 'проверяемое фактическое утверждение' },
          channels: { type: 'array', items: { type: 'string' }, description: 'какие каналы поддерживают' },
          strength: { type: 'string', enum: ['STRONG', 'MODERATE', 'WEAK'] },
        },
        required: ['id', 'statement', 'channels', 'strength'],
      },
    },
  },
  required: ['claims'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claimId: { type: 'string' },
    verdict: { type: 'string', enum: ['CONFIRMED', 'CHALLENGED', 'OUTDATED', 'UNCHECKED'], description: 'UNCHECKED — ОПЕРАЦИОННЫЙ вердикт: не смог проверить (пейволл/сбой инструмента/источник недоступен/бюджет вызовов исчерпан). НЕ доказательный: сбой доступа ≠ опровержение' },
    credibility: { type: 'integer', enum: [1, 2, 3, 4, 5, 6], description: 'подтверждённость claim (Admiralty): 1 подтверждён независимо, 2 вероятно верен, 3 возможно верен, 4 сомнителен, 5 неправдоподобен, 6 нельзя оценить (для UNCHECKED всегда 6)' },
    evidence: { type: 'string', description: 'что нашёл counter-search' },
    url: { type: 'string' },
  },
  required: ['claimId', 'verdict', 'credibility', 'evidence', 'url'],
}

const ANALYST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reportPath: { type: 'string', description: 'путь к draft-отчёту в workDir' },
    queryRu: { type: 'string', description: 'краткая формулировка на русском (для имени файла в vault)' },
    mainConclusion: { type: 'string' },
    relatedCandidates: { type: 'array', items: { type: 'string' }, description: 'ключевые слова/темы для obsidian-поиска связанных заметок (выполнит скилл)' },
    droppedClaims: { type: 'array', items: { type: 'string' }, description: 'claims, отфильтрованные как CHALLENGED/OUTDATED' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'что не покрыто исследованием (для frontmatter и callout методологии)' },
  },
  required: ['reportPath', 'queryRu', 'mainConclusion', 'relatedCandidates', 'droppedClaims', 'gaps'],
}

const TOOL_NOTE = 'ВАЖНО: НЕ используй встроенные WebSearch/WebFetch (забанены). Нужные MCP-инструменты загружай через ToolSearch перед вызовом. Brave (тариф Search): 50 req/s — параллельные вызовы OK. Firecrawl scrape: 1 req/s.'

// ── Промпт канального агента (порт Фазы 3 SKILL.md) ──
function channelPrompt(key) {
  const c = ALL_CHANNELS[key]
  const handlesLine = (key === 'substack' && SUBSTACK_HANDLES.length)
    ? `\nSUBSTACK_HANDLES: ${SUBSTACK_HANDLES.join(', ')}\n(handles предоставлены — пропусти Layer 0, используй их)`
    : ''
  const decisionLine = DECISION ? `\nИССЛЕДОВАНИЕ ПОД РЕШЕНИЕ: ${DECISION}\n(приоритет — материал, который помогает принять именно это решение)` : ''
  return `Ты — исследователь ${c.source}. Найди максимум информации по теме.

ЗАПРОС: ${QUERY}${decisionLine}
ДАТА: ${DATE}${handlesLine}

ПРОТОКОЛ ПОИСКА:
Прочитай файл ${c.protocol} (Read tool) и следуй ему шаг за шагом, включая Layer «Контраргументы».

PLUGIN_ROOT = ${PLUGIN_ROOT}
Внутри протокола пути записаны как {PLUGIN_ROOT}/… — подставляй вместо плейсхолдера строку выше. Литеральный \`{PLUGIN_ROOT}\` в команду не отправляй.

${TOOL_NOTE}

ПРАВИЛА:
1. Следуй протоколу шаг за шагом; при ошибке MCP — фоллбэк из протокола.
2. Собери минимум 5-10 цитат с URL. Префиксы цитат: [${c.prefix}1], [${c.prefix}2], ...
3. Каждой цитате присвой reliability — надёжность ИСТОЧНИКА по Admiralty (НЕ правдоподобие самой информации, его оценят верификаторы):
   A — первоисточник: официальная дока, вендор, данные из первых рук;
   B — установленный эксперт/практик с трек-рекордом, без конфликта интересов;
   C — аноним или малоизвестный участник сообщества, но конкретика из личного опыта;
   D — слабый источник: пересказ чужого, без деталей;
   E — заинтересованный источник: маркетинг, продажи, аффилированность;
   F — нельзя оценить.
   В reliabilityWhy — одна строка: тип источника / автор и его экспертиза / дата / bias-сигналы.
4. НЕ спавни sub-agents — делай всё сам. Все выходные данные на РУССКОМ.
5. СНАПШОТЫ (schema v2, ОБЯЗАТЕЛЬНЫЙ шаг — аудит 2026-08-15 показал 0 снапшотов за все прогоны): для 3-5 САМЫХ ВАЖНЫХ источников (relevance HIGH) сохрани полный извлечённый текст страницы в ${WORK_DIR}/snapshots/${c.prefix}<N>.md (Write; шапка: URL + дата + твой префикс цитаты). Это замороженная доказательная база для верификаторов — они читают один и тот же текст, а не разные версии страницы. ПРАВИЛО: цитата с relevance HIGH БЕЗ снапшота недопустима — не смог достать полный текст (пейволл/CAPTCHA/challenge) → снапшот не пиши, но relevance снизь до MEDIUM и пометь «[no-snapshot: blocked]»; пустой или обрезанный текст — НЕ контент. Пути записанных файлов верни в поле snapshots[] схемы (пустой массив = честное «ни одного»).

ТЕЛЕМЕТРИЯ (обязательно):
ДО первого поиска выполни Bash \`date '+%Y-%m-%d %H:%M:%S'\` → это startedAt; ПОСЛЕ Write ещё раз → finishedAt. Обе строки запиши в шапку файла (Started:/Finished:) и верни в схеме (startedAt/finishedAt).

СОХРАНЕНИЕ:
Через Write сохрани результат в ${WORK_DIR}/${c.file} в формате:
# ${c.source} — результаты по "${QUERY}"
Started: {startedAt} / Finished: {finishedAt}
## Ключевые находки
## Цитаты
### [${c.prefix}1] {описание}
**Источник:** {URL} / **Контекст:** {цитата} / **Релевантность:** HIGH/MEDIUM/LOW / **Admiralty:** {A-F} — {reliabilityWhy}
## Контраргументы (найдены на ${c.source})
## Оценка источников
(для каждой цитаты: Evidence type / Author / Date / Bias signals / Cites original)

После записи верни структуру (schema): source="${c.source}", findings[], citations[{prefix,url,relevance,context,reliability,reliabilityWhy}], counterarguments[], sourceQuality, fileWritten="${WORK_DIR}/${c.file}".
Если канал недоступен после фоллбэков — верни sourceQuality="LOW", пустые citations и отметь это в findings.`
}

// ── Промпт куратора claims ──
function curatorPrompt(files) {
  return `Ты — куратор кросс-канальной верификации. Прочитай результаты каналов и выдели самые СИЛЬНЫЕ claims для live-проверки.

ЗАПРОС: ${QUERY}

Файлы каналов (Read каждый):
${files.map(f => `- ${f}`).join('\n')}

Задача:
1. Прочитай все файлы.
2. Выдели до ${MAX_CLAIMS} самых важных фактических claims (приоритет тем, что повторяются в разных каналах ИЛИ являются load-bearing для выводов).
3. Для каждого: statement (проверяемое утверждение), channels (кто поддерживает — используй РОВНО ключи каналов: web, codexweb, grokweb, yandex, reddit, twitter, hackernews, substack; НЕ имена файлов), strength.
   СЕМЬИ ИСТОЧНИКОВ: web/codexweb/grokweb/yandex — ДВИЖКИ над одним открытым вебом (Яндекс — другой индекс, но тот же веб) = ОДНА семья 'web'; reddit, twitter, hackernews, substack — отдельные семьи. strength=STRONG ТОЛЬКО при поддержке 2+ РАЗНЫХ семей (например web+reddit); совпадение только web-движков между собой (w/cx/gw/y) — НЕ независимость, максимум MODERATE.

4. АТОМАРНОСТЬ (schema v2): каждый statement — ОДНО проверяемое фактическое ядро БЕЗ суперлативной/оценочной обёртки. Запрещены в statement: «самый/лучший/#1», «консенсус», «единодушны», «библия/канон», рейтинги-с-чужих-слов. Значимые квалификаторы (даты, версии, условия применимости) СОХРАНЯЙ — атомарность не значит обрубленность. Составное утверждение расщепи на отдельные claims либо возьми только load-bearing ядро.

Каждый claim — конкретное фактическое утверждение, которое можно проверить веб-поиском. Не мнение-вкусовщина. statement пиши НА РУССКОМ (имена собственные/термины — как в источнике). Верни строго по схеме.`
}

// ── Промпт верификатора (per-claim; две разные линзы: опровержение через Brave
//    и кросс-типовая проверка через контр-канал ДРУГОЙ семьи источников) ──
function verifyPrompt(claim, idx) {
  const communityOrigin = (claim.channels || []).some(ch => ['reddit', 'twitter', 'hackernews', 'substack'].includes(ch))
  const webOrigin = (claim.channels || []).some(ch => FAMILY[ch] === 'web')
  const lens = idx === 0
    ? `ЛИНЗА «ОПРОВЕРЖЕНИЕ» (Brave): ищи ОПРОВЕРГАЮЩИЕ доказательства — контраргументы, противоречия, разоблачения. Запросы вида "<тема> problems", "<claim> debunked", "<тема> criticism".
ИНСТРУМЕНТЫ: ToolSearch "select:mcp__plugin_jadlis-research_brave-search__brave_web_search,mcp__plugin_jadlis-research_brave-search__brave_llm_context" → 1-2 запроса (llm_context для содержимого страниц, web_search для охвата; параллельные вызовы OK).`
    : `ЛИНЗА «КРОСС-ТИП» — подтверди или опровергни claim источником ДРУГОГО ТИПА (другой семьи), чем каналы-источники claim:
${webOrigin && !communityOrigin
  ? `- Claim пришёл из web-движков → проверь по СООБЩЕСТВАМ практиков. Предпочтительно HackerNews (Bash, без ToolSearch): \`${PLUGIN_ROOT}/scripts/hn-fetch.sh search "<запрос>" --tags story --limit 10\` и/или \`--tags comment\` (полные тексты комментариев прямо в выдаче; exit 3 = поиск HN недоступен → возьми Reddit). Альтернатива — Reddit через execute_operation НАПРЯМУЮ (НЕ вызывай discover_operations/get_operation_schema): ToolSearch "select:mcp__plugin_jadlis-research_reddit__execute_operation" → execute_operation(operation_id="discover_subreddits", parameters={query,limit:5,min_confidence:0.4}) → execute_operation(operation_id="search_subreddit", parameters={subreddit_name,query,sort:"relevance",time_filter:"all"}).`
  : communityOrigin && !webOrigin
    ? `- Claim пришёл из сообществ → проверь по ПЕРВОИСТОЧНИКАМ: официальная дока/changelog/данные вендора. ToolSearch "select:mcp__plugin_jadlis-research_brave-search__brave_llm_context,mcp__plugin_jadlis-research_brave-search__brave_web_search" → 1-2 запроса вида "<claim> official docs", "<тема> changelog", "<тема> 2026".`
    : `- Claim поддержан и web, и сообществами → проверь АКТУАЛЬНОСТЬ по первоисточникам (официальная дока/changelog, "<тема> 2026") через ToolSearch "select:mcp__plugin_jadlis-research_brave-search__brave_llm_context,mcp__plugin_jadlis-research_brave-search__brave_web_search".`}
БЮДЖЕТ: ≤3 tool calls, загрузи РОВНО ОДИН набор инструментов. ЗАПРЕЩЕНО: Grok CLI (~/.grok/bin/grok) и mcp__grok-mcp__x_search — слишком медленно/дорого для верификации; Яндекс (yandex-search.sh) — платный, в верификации не используется; Reddit discover_operations/get_operation_schema — вызывай execute_operation напрямую.`
  return `Ты — adversarial-верификатор №${idx + 1}. Проверь claim через НЕЗАВИСИМЫЙ live-поиск. Не верь исходному исследованию.

CLAIM: "${claim.statement}"
(каналы-источники: ${(claim.channels || []).join(', ') || '—'}; заявленная сила: ${claim.strength})

${lens}

${TOOL_NOTE}
При InputValidationError — сначала ToolSearch, затем повтор вызова.

СНАПШОТЫ: если в ${WORK_DIR}/snapshots/ есть файлы (Glob "${WORK_DIR}/snapshots/*.md") — прочитай релевантные claim'у ПЕРЕД live-поиском: это замороженные полные тексты источников каналов, общая доказательная база всех верификаторов.

Оцени:
- НЕ СМОГ проверить (пейволл, сбой инструмента, источник недоступен, бюджет вызовов исчерпан до получения сигнала)? → UNCHECKED (credibility 6). Сбой доступа — НЕ опровержение; не маскируй его под CHALLENGED.
- Claim актуален или устарел? → если устарел: OUTDATED.
- Есть весомые опровержения/противоречия ПО СУЩЕСТВУ? → CHALLENGED.
- Подтверждается независимо, опровержений нет? → CONFIRMED.
- credibility (1-6): 1 — подтверждён независимым источником другого типа; 2 — вероятно верен (логично, согласуется, прямого независимого подтверждения нет); 3 — возможно верен; 4 — сомнителен; 5 — неправдоподобен; 6 — нельзя оценить.

Верни по схеме: claimId="${claim.id}", verdict (CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED), credibility (1-6), evidence (что нашёл; для UNCHECKED — что именно не удалось и почему), url (ключевой источник проверки; для UNCHECKED — недоступный URL).
НЕ спавни sub-agents.`
}

// ── Промпт аналитика (decision-first отчёт: выводы и действия читателю, процесс — в callout/frontmatter) ──
function analystPrompt(files, ledger) {
  return `Ты — аналитик. Прочитай результаты каналов, проведи кросс-валидацию и напиши финальный отчёт на РУССКОМ в формате DECISION-FIRST + КОНТЕКСТ: сверху — выводы и советы под решение (это видит читатель в первую очередь); ниже — отдельная секция «📚 Контекст и находки» с наресёрченной фактурой темы. В свёрнутый callout «Методология» убирается ТОЛЬКО мета-процесс (как искал, что отсеял), а НЕ содержательный контекст предмета. ВАЖНО: claims с verdict CHALLENGED/OUTDATED ни в выводы, ни в контекст НЕ попадают — фильтруй, а не дописывай критику.

ЗАПРОС: ${QUERY}
${DECISION ? `РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ (весь отчёт строится под него): ${DECISION}` : 'РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ: не задано — выведи вердикт под самое вероятное решение по запросу.'}
ДАТА: ${DATE}

Файлы каналов (Read каждый; если файла нет — учти канал как недоступный):
${files.map(f => `- ${f}`).join('\n')}

ПРИМЕР стиля (Read): ${PLUGIN_ROOT}/skills/full-research/examples/sample-report.md —
показывает тон, плотность и оформление. Обязательный контракт — спека формата выше;
структуру и объём адаптируй под тему, скелет примера не копируй буквально.

CROSS-VERIFICATION LEDGER (live-проверка claims; у каждого verdict и credibility 1-6):
${JSON.stringify(ledger, null, 2)}

КРОСС-ВАЛИДАЦИЯ (для отбора материала; сам процесс в отчёт НЕ пишется):
- Triangulation: тезис подтверждён РАЗНЫМИ типами источников? (web+community=strong; два reddit-поста=weak). Circular reporting: 2 источника на 1 оригинал = 1 источник.
- WEB-СЕМЬЯ: файлы web.md/web-codex.md/web-grok.md/web-yandex.md — ДВИЖКИ (Brave [w], Codex [cx], Grok [gw], Яндекс [y]) над ОДНИМ открытым вебом. Дедупь их находки по URL. Совпадение движков = усиление ВНУТРИ типа web, НЕ независимая триангуляция (независимость = web+community). Находка, которую дал только ОДИН движок и не подтвердил никто другой — пониженная достоверность (цифра бейджа не выше 3) + краткая пометка "только {движок}".
- Community consensus = сильный ТОЛЬКО при независимости (разные аккаунты/время, без incentives).
- Claims из ledger: CONFIRMED → не только разрешают вердикты в выводах, но и РЕНДЕРЯТСЯ ЯВНО в подсекции «Проверенные факты» секции «📚 Контекст и находки» (с evidence и бейджем достоверности) — это подтверждённый фундамент, его нельзя «растворять» в выводах. ВЕКТОР ГОЛОСОВ виден читателю: у каждого проверенного факта пометка «(2 голоса)» при voteCount=2 или «(1 голос — split: второй верификатор не смог проверить)» при voteCount=1 — читатель обязан различать двойное и одиночное подтверждение. CHALLENGED/OUTDATED → НЕ в выводы и НЕ в контекст, только строка в callout методологии с причиной отсева. UNCHECKED → НЕ в отчёт; в callout методологии одной строкой: «не удалось проверить: N claims (причины кратко)».

БЕЙДЖИ ДОСТОВЕРНОСТИ: каждая ссылка в советах и «Источниках» — вида [w1·B2](URL): буква A-F — reliability источника (из файлов каналов, поле Admiralty), цифра 1-6 — подтверждённость информации. Цифру присваиваешь ТЫ по правилам: 1-2 ТОЛЬКО при независимом подтверждении (CONFIRMED в ledger или 2+ источников разных типов); 3 — единичный правдоподобный источник; 4-5 — сомнительно/неправдоподобно; 6 — нельзя оценить. Шкалы независимы: бывает A6 и E1.

ФОРМАТ ОТЧЁТА (Obsidian Flavored Markdown, структура РОВНО как в эталоне), frontmatter В САМОМ НАЧАЛЕ:
---
type: research
created: ${DATE}
ai_drafted: true
verified: false
ai_model: "${AI_MODEL}"
tags: []
query: "{исходный запрос; внутренние двойные кавычки замени на «»}"
decision: "{решение пользователя или пусто}"
channels: [{ключи выбранных каналов; web-движки (web/codexweb/grokweb) схлопни в один "web"; yandex (если был выбран) — отдельным ключом}]
claims_confirmed: {N}
claims_dropped: {N}
gaps: [{2-4 строки-пробела}]
work_dir: "${WORK_DIR}"
---

Секции по эталону:
1. # {Тема кратко} + строка **Дата:** | **Источники:**
2. > [!abstract] Главный вывод — BLUF, 3-6 строк: весь смысл ресёрча; ответ «что мне с этим делать» — в первых двух предложениях.
3. > [!success] Вердикт для твоего решения — прямой ответ под decision: «Делай X, не делай Y, при условии Z».
4. ## ✅ Делать / ❌ Не делать
5. ## Решения: принимать / не принимать
6. ## Как относиться / как не относиться
7. ## Учитывать / игнорировать
8. ## 📚 Контекст и находки — РАЗВЁРНУТАЯ фактура темы (это суть предмета, НЕ процесс исследования). Объём адаптивный: простая тема — компактно, сложная/незнакомая — подробно. Подсекции по необходимости:
   - **Ландшафт темы**: что это, как устроено, ключевые игроки/подходы/термины + механизмы «почему так».
   - **Факты и цифры**: конкретные числа, диапазоны, дословные цитаты источников (ПЕРЕВЕДЁННЫЕ на русский) — каждая с бейджем-ссылкой [pref·Badge](URL).
   - **Проверенные факты**: claims из ledger с verdict=CONFIRMED — вынеси явно, с доказательством и бейджем достоверности; это подтверждённый фундамент выводов. Заголовок подсекции — РОВНО \`### Проверенные факты\` (канонический, по нему идёт постпроверка; НЕ сливай с «Факты и цифры»). Если confirmed-claims нет — подсекцию пропусти.
   - **Разногласия и нюансы**: где источники/сообщества расходятся, какие лагеря, что под вопросом — НЕ усреднять до ложного консенсуса.
   В секцию идёт только материал, прошедший кросс-валидацию; claims CHALLENGED/OUTDATED сюда НЕ попадают (они лишь строкой в callout методологии).
9. ## Кому доверять в этой теме — таблица: Источник | Надёжность (A-F) | Почему.
10. ## Источники — подсекции по каналам; web-движки — ОДНА подсекция "### Web" (движок различим по префиксу w/cx/gw/y, дубли URL между движками не повторять); каждая строка: [префикс·Бейдж](URL) Название — одна строка на русском о чём.
11. ## Связанные заметки — ПУСТАЯ секция-заглушка (wikilinks добавит оркестратор).
12. > [!note]- Методология и проверка — ОДИН СВЁРНУТЫЙ callout ≤20 строк в самом конце: каналы и число источников; проверено K claims: X подтверждено, Y отсеяно (список отсеянных + причина: оспорено/устарело); gaps; bias выборки; дата данных; «полный процесс — в work_dir из frontmatter».

ПРАВИЛА ТЕКСТА:
- Рубрики 4-7: каждый совет — callout > [!tip] (делать/принимать/относиться/учитывать) или > [!failure] (не делать/не принимать/игнорировать). Заголовок callout — конкретное действие; тело — одна строка «почему» + бейджи-ссылки. 2-4 совета на рубрику; если по рубрике сказать нечего — пропусти её целиком, не выдумывай.
- Простой русский язык. ВСЕ цитаты переводи на русский (оригинал не дублируй — ссылка ведёт на источник).
- ЗАПРЕЩЁН рассказ о ПРОЦЕССЕ: секции Adversarial Review, Evidence Strength, «как делалась кросс-валидация», Детали исследования, «Все ссылки» — их содержимое сжимается в callout методологии, frontmatter и бейджи. НО контекст о ПРЕДМЕТЕ (секция «📚 Контекст и находки») обязателен и под запрет НЕ попадает: запрещён только мета-рассказ о том, КАК ты искал, а не фактура темы.
- Блок вердиктов (рубрики «делать/не делать» и пр.) держи плотным. Секцию «📚 Контекст и находки» масштабируй по сложности темы — жёсткого лимита нет, но без воды: каждая строка несёт факт/цифру/цитату, а не общие слова.
- Ссылки ТОЛЬКО одинарные скобки: [w1·B2](URL). ❌ НЕ [[w1]](URL). НЕ ставь wikilinks.

СОХРАНЕНИЕ: через Write сохрани draft-отчёт в ${WORK_DIR}/report.md (НЕ в vault — запись в vault сделает оркестратор).
После записи верни по схеме: reportPath="${WORK_DIR}/report.md", queryRu (краткая русская формулировка ≤25 симв для имени файла), mainConclusion, relatedCandidates (3-6 ключевых слов/тем для obsidian-поиска связанных заметок), droppedClaims (что отфильтровано как CHALLENGED/OUTDATED), gaps (те же, что в frontmatter).
НЕ спавни sub-agents, НЕ вызывай skills, читай только файлы каналов в ${WORK_DIR} и эталон.`
}

// ═══ Phase 1 — Fan-out ═══
phase('Fan-out')
log(`Запускаю ${SELECTED.length} канальных исследователей: ${SELECTED.join(', ')}`)

const channelResults = (await parallel(SELECTED.map(key => () =>
  agent(channelPrompt(key), w({ label: key, phase: 'Fan-out', schema: CHANNEL_SCHEMA }))
    .then(r => (r ? Object.assign({ channelKey: key }, r) : null))
))).filter(Boolean)

const files = channelResults.map(r => r.fileWritten).filter(Boolean)
// Успех канала = non-LOW sourceQuality И непустые валидные citations (с URL).
// Упавший канал возвращает LOW + пустые citations — в гейты и семьи не считается.
const okChannel = r => r.sourceQuality !== 'LOW' && Array.isArray(r.citations) && r.citations.some(c => c && c.url)
const okResults = channelResults.filter(okChannel)
const channelStatus = SELECTED.map(k => {
  const r = channelResults.find(x => x.channelKey === k)
  return { channel: k, answered: !!r, ok: r ? okChannel(r) : false, sourceQuality: r ? r.sourceQuality : null, citations: r ? (r.citations || []).length : 0, snapshots: r ? (r.snapshots || []).length : 0, highCitations: r ? (r.citations || []).filter(c => c && c.relevance === 'HIGH').length : 0 }
})
const failedChannels = channelStatus.filter(s => !s.ok).map(s => s.channel)
const answeredFamilies = [...new Set(okResults.map(r => FAMILY[r.channelKey]))]
const selectedFamilies = [...new Set(SELECTED.map(k => FAMILY[k]))]
log(`Каналов успешно: ${okResults.length}/${SELECTED.length} (упали/деградировали: ${failedChannels.join(', ') || 'нет'}); семей источников: ${answeredFamilies.length}/${selectedFamilies.length}`)
const snapshotless = channelStatus.filter(s => s.ok && s.highCitations > 0 && s.snapshots === 0).map(s => s.channel)
if (snapshotless.length) log(`⚠ HIGH-цитаты БЕЗ снапшотов (нарушение schema v2): ${snapshotless.join(', ')}`)

// Гейт: web/codexweb/grokweb — одна семья (открытый веб). Если выбрано ≥2 семей,
// а успешна лишь одна — триангуляции не будет. Намеренный web-only (1 семья) — OK.
if (okResults.length < MIN_CHANNELS || (selectedFamilies.length >= 2 && answeredFamilies.length < 2)) {
  log(`Недостаточно независимых источников (успешных каналов: ${okResults.length}, семей: ${answeredFamilies.length}) — отдаю что есть, без синтеза.`)
  return { workDir: WORK_DIR, status: 'insufficient-sources', channelsAnswered: channelResults.length, channelStatus, failedChannels, answeredFamilies, files, channelResults, claimLedger: [] }
}

// ═══ Phase 2 — Verify (per-claim live counter-search) ═══
phase('Verify')

const curated = await agent(curatorPrompt(files), o({ label: 'curator', phase: 'Verify', schema: CURATOR_SCHEMA }))
const claims = (curated.claims || []).slice(0, MAX_CLAIMS)
log(`Куратор выделил ${claims.length} ключевых claims на live-проверку.`)

const claimLedger = (await parallel(claims.map(c => () =>
  parallel(Array.from({ length: VERIFIERS }, (_, i) => () =>
    agent(verifyPrompt(c, i), w({ label: `verify:${c.id}#${i + 1}`, phase: 'Verify', schema: VERIFY_SCHEMA }))
  )).then(votes => {
    const v = votes.filter(Boolean)
    // Schema v2: вектор голосов сохраняется (не схлопывать); UNCHECKED — операционная ось,
    // вне доказательной. Приоритет только для фактических исходов: OUTDATED > CHALLENGED > CONFIRMED.
    const all = v.map(x => x.verdict)
    const real = v.filter(x => x.verdict !== 'UNCHECKED')
    const verdicts = real.map(x => x.verdict)
    const verdict = !v.length ? 'UNVERIFIED'
      : !real.length ? 'UNCHECKED'
        : verdicts.includes('OUTDATED') ? 'OUTDATED'
          : verdicts.includes('CHALLENGED') ? 'CHALLENGED'
            : 'CONFIRMED'
    // подтверждённость — консервативно по СОДЕРЖАТЕЛЬНЫМ голосам (UNCHECKED не тянет в 6)
    const credibility = real.length ? Math.max(...real.map(x => x.credibility || 6)) : 6
    // voteCount: сколько содержательных голосов держат вердикт (CONFIRMED-1 = split, виден в отчёте)
    return { ...c, verdict, votes: all, voteCount: real.length, credibility, evidence: v.map(x => x.evidence), urls: v.map(x => x.url) }
  })
))).filter(Boolean)

const confirmed = claimLedger.filter(c => c.verdict === 'CONFIRMED').length
const challenged = claimLedger.filter(c => c.verdict === 'CHALLENGED').length
const outdated = claimLedger.filter(c => c.verdict === 'OUTDATED').length
const unchecked = claimLedger.filter(c => c.verdict === 'UNCHECKED').length
const confirmedSplit = claimLedger.filter(c => c.verdict === 'CONFIRMED' && c.voteCount === 1).length
log(`Ledger: CONFIRMED=${confirmed} (из них split/1-голос: ${confirmedSplit}), CHALLENGED=${challenged}, OUTDATED=${outdated}, UNCHECKED=${unchecked}`)

// ═══ Phase 3 — Synthesize ═══
phase('Synthesize')

const ANALYST_FIELDS = '{reportPath,queryRu,mainConclusion,relatedCandidates,droppedClaims,gaps}'
const report = FABLE_BRIDGE
  ? await agent(bridgePrompt('analyst', analystPrompt(files, claimLedger) + bridgeTail(ANALYST_FIELDS), 'Read,Write', ANALYST_FIELDS, ANALYST_SCHEMA),
      w({ label: 'analyst→fable', phase: 'Synthesize', schema: ANALYST_SCHEMA }))
  : await agent(analystPrompt(files, claimLedger), o({ label: 'analyst', phase: 'Synthesize', schema: ANALYST_SCHEMA }))

// Честный ai_model: маркер "[bridge-fallback: opus]" в mainConclusion означает,
// что синтез исполнил Opus, а не Fable — frontmatter отчёта сверяет Phase C скилла.
const bridgeFallback = FABLE_BRIDGE && /\[bridge-fallback: opus\]/.test(String(report.mainConclusion || ''))
const aiModelActual = FABLE_BRIDGE && !bridgeFallback ? AI_MODEL : 'claude-opus-5'

return {
  workDir: WORK_DIR,
  status: 'ok',
  // Версия схемы ledger/вердиктов: инкрементить при смене VERIFY_SCHEMA/агрегации —
  // телеметрия сегментирует тренды confirmed по этой версии (сравнивать только внутри одной).
  // v2 (2026-08-15, вердикт совета): UNCHECKED + вектор голосов + атомарный куратор + снапшоты.
  ledgerSchemaVersion: 2,
  channelsAnswered: channelResults.length,
  channelsSelected: SELECTED,
  channelStatus,
  failedChannels,
  aiModelActual,
  answeredFamilies,
  timing: channelResults.map(r => ({ channel: r.channelKey, startedAt: r.startedAt || null, finishedAt: r.finishedAt || null })),
  files,
  claimLedger,
  reportPath: report.reportPath || `${WORK_DIR}/report.md`,
  queryRu: report.queryRu,
  relatedCandidates: report.relatedCandidates || [],
  synthMeta: {
    mainConclusion: report.mainConclusion,
    droppedClaims: report.droppedClaims || [],
    gaps: report.gaps || [],
    ledgerSummary: { confirmed, confirmedSplit, challenged, outdated, unchecked },
  },
}
