export const meta = {
  name: 'full-research-core',
  description: 'Ядро full-research: N канальных исследователей → per-claim верификация с brave counter-search (фильтрация) → analyst пишет отчёт в workDir. Vault-контракт — в скилле.',
  phases: [
    { title: 'Fan-out', detail: 'до 7 канальных агентов (web×3: brave/codex/grok + reddit/twitter/hn/substack) параллельно' },
    { title: 'Verify', detail: 'curator (Opus 5) выделяет ключевые claims → per-claim verifiers: линза-опровержение (Brave) + кросс-тип линза (сообщества/первоисточники) → CONFIRMED/CHALLENGED/OUTDATED' },
    { title: 'Synthesize', detail: 'analyst (headless-мост: bridgeModel → fallback Opus 5) пишет отчёт (verified:false), фильтрует непрошедшие claims, дедупит web-движки' },
  ],
}

// ── Параметры (skill передаёт после Phase 1: recon + интервью; дефолты — для dry-run) ──
// args может прийти строкой JSON — нормализуем.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const QUERY = A.refinedQuery || 'Сравни локальные AI-ассистенты для кодинга в 2026: приватность vs возможности'
const DECISION = A.decisionContext || ''
const DATE = A.date || 'DRYRUN-DATE'
const WORK_DIR = A.workDir || '.full-research/dryrun'
// ${CLAUDE_PLUGIN_ROOT} в JS НЕ подставляется — скилл передаёт его значением.
// Дефолт нужен только для dry-run: без pluginRoot агенты не найдут протоколы.
const PLUGIN_ROOT = A.pluginRoot || '.'
const VAULT_PATH = A.vaultPath || ''
// Модель Fable-моста. Пробуем один раз; недоступна → FALLBACK_MODEL.
// Во frontmatter отчёта пишется та модель, которая реально ответила.
const BRIDGE_MODEL = A.bridgeModel || 'claude-opus-5'
const FALLBACK_MODEL = 'claude-opus-5'
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
// analyst — единственное место, где выигрывает модель с очень большим контекстом
// (синтез из 400–600K). Такие модели закрыты для субагентов (кап платформы: opts.model,
// Agent-тул и agentType-frontmatter — всё мапится в Opus), НО доступны отдельному
// headless-процессу `claude -p --model <id>` (вложенный запуск из workflow-агента
// проверен: exit 0, ~7 c старт). Поэтому дефолт для analyst — МОСТ: лёгкий воркер
// записывает ролевой промпт в файл и исполняет его вложенным headless-процессом.
// Мост пробует args.bridgeModel ОДИН раз; недоступна (нет доступа на подписке,
// «model not found») → вторая попытка на claude-opus-5, дальше — inline.
// Отключение моста целиком: args.fableBridge=false → analyst идёт через
// orchestrator-fable-xhigh (Opus 5).
const FABLE_BRIDGE = A.fableBridge !== false
const ORCH_OPTS = A.orchOpts || { agentType: 'jadlis-research:orchestrator-fable-xhigh' }
const o = extra => Object.assign({}, ORCH_OPTS, extra)

function bridgePrompt(role, rolePrompt, allowedTools, fieldsHint) {
  const pf = `${WORK_DIR}/_bridge-${role}-prompt.md`
  const of = `${WORK_DIR}/_bridge-${role}-out.json`
  const cmd = m => `cat "${pf}" | claude -p --model ${m} --effort xhigh --allowedTools "${allowedTools}" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --output-format json > "${of}" 2>"${WORK_DIR}/_bridge-${role}.err"; echo "EXIT=$?"`
  return `Ты — технический МОСТ к отдельной headless-модели. Сам ролевую работу НЕ делай (кроме последнего шага «Деградация»). Шаги:

1. Через Write запиши в файл ${pf} ДОСЛОВНО весь текст между маркерами <<<ROLE_PROMPT и ROLE_PROMPT>>> (маркеры не включать, текст не менять и не сокращать).

2. ОДИН Bash-вызов (параметр timeout: 600000) — основная модель \`${BRIDGE_MODEL}\`:
${cmd(BRIDGE_MODEL)}

3. Успех (EXIT=0 и в ${of} поле .result содержит в КОНЦЕ валидный JSON-блок с полями ${fieldsHint}) → извлеки эти поля, верни по своей схеме БЕЗ изменений, и в поле analystModel поставь "${BRIDGE_MODEL}".

4. Сбой (EXIT≠0 — например «model not found»/нет доступа — или .result без валидного JSON) → **ОДНА** повторная попытка тем же Bash-вызовом, но с моделью \`${FALLBACK_MODEL}\`:
${cmd(FALLBACK_MODEL)}
Успех → верни поля, analystModel = "${FALLBACK_MODEL}".

5. Деградация: и вторая попытка не удалась → выполни ролевой промпт из ${pf} САМОСТОЯТЕЛЬНО, верни результат по схеме, analystModel = "bridge-fallback:inline", и пометь в первом текстовом поле "[bridge-fallback: inline]".

ЗАПРЕЩЕНО: повторять шаг 2 больше одного раза и подставлять любую модель, кроме двух названных. analystModel обязан отражать модель, которая реально ответила, — не ту, которую заказывали.

<<<ROLE_PROMPT
${rolePrompt}
ROLE_PROMPT>>>`
}
// Хвост ролевого промпта для headless-исполнения (нет StructuredOutput — финал печатается JSON-блоком)
const bridgeTail = fieldsHint => `\n\nФИНАЛЬНЫЙ ВЫВОД (ты работаешь в headless-режиме): закончи ответ РОВНО ОДНИМ JSON-объектом с полями ${fieldsHint} внутри блока \`\`\`json ... \`\`\` — и никакого текста после блока.`

// Все семь протоколов лежат в одном каталоге плагина (search-community упразднён —
// его 4 протокола переехали в full-research/protocols/).
const PROTO_DIR = `${PLUGIN_ROOT}/skills/full-research/protocols`
const ALL_CHANNELS = {
  web: { source: 'Web (Brave Search)', prefix: 'w', protocol: `${PROTO_DIR}/web-protocol.md`, file: 'web.md' },
  codexweb: { source: 'Web (Codex/GPT-5.6 Sol)', prefix: 'cx', protocol: `${PROTO_DIR}/codex-web-protocol.md`, file: 'web-codex.md' },
  grokweb: { source: 'Web (Grok)', prefix: 'gw', protocol: `${PROTO_DIR}/grok-web-protocol.md`, file: 'web-grok.md' },
  reddit: { source: 'Reddit', prefix: 'r', protocol: `${PROTO_DIR}/reddit-protocol.md`, file: 'reddit.md' },
  twitter: { source: 'Twitter/X', prefix: 'x', protocol: `${PROTO_DIR}/twitter-protocol.md`, file: 'twitter.md' },
  hackernews: { source: 'HackerNews', prefix: 'hn', protocol: `${PROTO_DIR}/hackernews-protocol.md`, file: 'hackernews.md' },
  substack: { source: 'Substack', prefix: 'ss', protocol: `${PROTO_DIR}/substack-protocol.md`, file: 'substack.md' },
}
// Семья = независимый ТИП источника. web/codexweb/grokweb — три движка над одним
// открытым вебом: их совпадение НЕ является независимой триангуляцией.
const FAMILY = { web: 'web', codexweb: 'web', grokweb: 'web', reddit: 'reddit', twitter: 'twitter', hackernews: 'hn', substack: 'substack' }
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
    startedAt: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS — до первого поиска' },
    finishedAt: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS — после Write' },
  },
  required: ['source', 'findings', 'citations', 'counterarguments', 'sourceQuality', 'fileWritten'],
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
    verdict: { type: 'string', enum: ['CONFIRMED', 'CHALLENGED', 'OUTDATED'] },
    credibility: { type: 'integer', enum: [1, 2, 3, 4, 5, 6], description: 'подтверждённость claim (Admiralty): 1 подтверждён независимо, 2 вероятно верен, 3 возможно верен, 4 сомнителен, 5 неправдоподобен, 6 нельзя оценить' },
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
    analystModel: { type: 'string', description: 'модель, которая РЕАЛЬНО выполнила синтез (мост мог упасть с bridgeModel на fallback)' },
  },
  required: ['reportPath', 'queryRu', 'mainConclusion', 'relatedCandidates', 'droppedClaims', 'gaps', 'analystModel'],
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
3. Для каждого: statement (проверяемое утверждение), channels (кто поддерживает — используй РОВНО ключи каналов: web, codexweb, grokweb, reddit, twitter, hackernews, substack; НЕ имена файлов), strength.
   СЕМЬИ ИСТОЧНИКОВ: web/codexweb/grokweb — это ТРИ ДВИЖКА над одним открытым вебом = ОДНА семья 'web'; reddit, twitter, hackernews, substack — отдельные семьи. strength=STRONG ТОЛЬКО при поддержке 2+ РАЗНЫХ семей (например web+reddit); совпадение только web-движков между собой (w/cx/gw) — НЕ независимость, максимум MODERATE.

Каждый claim — конкретное фактическое утверждение, которое можно проверить веб-поиском. Не мнение-вкусовщина. statement пиши НА РУССКОМ (имена собственные/термины — как в источнике). Верни строго по схеме.`
}

// ── Промпт верификатора (per-claim; две разные линзы: опровержение через Brave
//    и кросс-типовая проверка через контр-канал ДРУГОЙ семьи источников) ──
function verifyPrompt(claim, idx) {
  const communityOrigin = (claim.channels || []).some(ch => ['reddit', 'twitter', 'hackernews', 'substack'].includes(ch))
  const webOrigin = (claim.channels || []).some(ch => FAMILY[ch] === 'web')
  const lens = idx === 0
    ? `ЛИНЗА «ОПРОВЕРЖЕНИЕ» (Brave): ищи ОПРОВЕРГАЮЩИЕ доказательства — контраргументы, противоречия, разоблачения. Запросы вида "<тема> problems", "<claim> debunked", "<тема> criticism".
ИНСТРУМЕНТЫ: ToolSearch "select:mcp__brave-search__brave_web_search,mcp__brave-search__brave_llm_context" → 1-2 запроса (llm_context для содержимого страниц, web_search для охвата; параллельные вызовы OK).`
    : `ЛИНЗА «КРОСС-ТИП» — подтверди или опровергни claim источником ДРУГОГО ТИПА (другой семьи), чем каналы-источники claim:
${webOrigin && !communityOrigin
  ? `- Claim пришёл из web-движков → проверь по СООБЩЕСТВАМ практиков. Предпочтительно HackerNews (1 вызов): ToolSearch "select:mcp__hn__search_hn" → 1-2 поиска. Альтернатива — Reddit через execute_operation НАПРЯМУЮ (НЕ вызывай discover_operations/get_operation_schema): ToolSearch "select:mcp__reddit__execute_operation" → execute_operation(operation_id="discover_subreddits", parameters={query,limit:5,min_confidence:0.4}) → execute_operation(operation_id="search_subreddit", parameters={subreddit,query,sort:"relevance",time_filter:"all"}).`
  : communityOrigin && !webOrigin
    ? `- Claim пришёл из сообществ → проверь по ПЕРВОИСТОЧНИКАМ: официальная дока/changelog/данные вендора. ToolSearch "select:mcp__brave-search__brave_llm_context,mcp__brave-search__brave_web_search" → 1-2 запроса вида "<claim> official docs", "<тема> changelog", "<тема> 2026".`
    : `- Claim поддержан и web, и сообществами → проверь АКТУАЛЬНОСТЬ по первоисточникам (официальная дока/changelog, "<тема> 2026") через ToolSearch "select:mcp__brave-search__brave_llm_context,mcp__brave-search__brave_web_search".`}
БЮДЖЕТ: ≤3 tool calls, загрузи РОВНО ОДИН набор инструментов. ЗАПРЕЩЕНО: Grok CLI (~/.grok/bin/grok) и mcp__grok-mcp__x_search — слишком медленно/дорого для верификации; Reddit discover_operations/get_operation_schema — вызывай execute_operation напрямую.`
  return `Ты — adversarial-верификатор №${idx + 1}. Проверь claim через НЕЗАВИСИМЫЙ live-поиск. Не верь исходному исследованию.

CLAIM: "${claim.statement}"
(каналы-источники: ${(claim.channels || []).join(', ') || '—'}; заявленная сила: ${claim.strength})

${lens}

${TOOL_NOTE}
При InputValidationError — сначала ToolSearch, затем повтор вызова.

Оцени:
- Claim актуален или устарел? → если устарел: OUTDATED.
- Есть весомые опровержения/противоречия? → CHALLENGED.
- Подтверждается независимо, опровержений нет? → CONFIRMED.
- credibility (1-6): 1 — подтверждён независимым источником другого типа; 2 — вероятно верен (логично, согласуется, прямого независимого подтверждения нет); 3 — возможно верен; 4 — сомнителен; 5 — неправдоподобен; 6 — нельзя оценить.

Верни по схеме: claimId="${claim.id}", verdict (CONFIRMED/CHALLENGED/OUTDATED), credibility (1-6), evidence (что нашёл), url (ключевой источник проверки).
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
- WEB-СЕМЬЯ: файлы web.md/web-codex.md/web-grok.md — ТРИ ДВИЖКА (Brave [w], Codex [cx], Grok [gw]) над ОДНИМ открытым вебом. Дедупь их находки по URL. Совпадение движков = усиление ВНУТРИ типа web, НЕ независимая триангуляция (независимость = web+community). Находка, которую дал только ОДИН движок и не подтвердил никто другой — пониженная достоверность (цифра бейджа не выше 3) + краткая пометка "только {движок}".
- Community consensus = сильный ТОЛЬКО при независимости (разные аккаунты/время, без incentives).
- Claims из ledger: CONFIRMED → не только разрешают вердикты в выводах, но и РЕНДЕРЯТСЯ ЯВНО в подсекции «Проверенные факты» секции «📚 Контекст и находки» (с evidence и бейджем достоверности) — это подтверждённый фундамент, его нельзя «растворять» в выводах. CHALLENGED/OUTDATED → НЕ в выводы и НЕ в контекст, только строка в callout методологии с причиной отсева.

БЕЙДЖИ ДОСТОВЕРНОСТИ: каждая ссылка в советах и «Источниках» — вида [w1·B2](URL): буква A-F — reliability источника (из файлов каналов, поле Admiralty), цифра 1-6 — подтверждённость информации. Цифру присваиваешь ТЫ по правилам: 1-2 ТОЛЬКО при независимом подтверждении (CONFIRMED в ledger или 2+ источников разных типов); 3 — единичный правдоподобный источник; 4-5 — сомнительно/неправдоподобно; 6 — нельзя оценить. Шкалы независимы: бывает A6 и E1.

ФОРМАТ ОТЧЁТА (Obsidian Flavored Markdown, структура РОВНО как в эталоне), frontmatter В САМОМ НАЧАЛЕ:
---
type: research
created: ${DATE}
ai_drafted: true
verified: false
ai_model: "{модель, которая реально выполнила синтез: если тебя вызвали через мост — та, что указана в инструкции моста как сработавшая; иначе ${FALLBACK_MODEL}. Это же значение верни в поле analystModel}"
tags: []
query: "{исходный запрос; внутренние двойные кавычки замени на «»}"
decision: "{решение пользователя или пусто}"
channels: [{ключи выбранных каналов; web-движки (web/codexweb/grokweb) схлопни в один "web"}]
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
   - **Проверенные факты**: claims из ledger с verdict=CONFIRMED — вынеси явно, с доказательством и бейджем достоверности; это подтверждённый фундамент выводов.
   - **Разногласия и нюансы**: где источники/сообщества расходятся, какие лагеря, что под вопросом — НЕ усреднять до ложного консенсуса.
   В секцию идёт только материал, прошедший кросс-валидацию; claims CHALLENGED/OUTDATED сюда НЕ попадают (они лишь строкой в callout методологии).
9. ## Кому доверять в этой теме — таблица: Источник | Надёжность (A-F) | Почему.
10. ## Источники — подсекции по каналам; web-движки — ОДНА подсекция "### Web" (движок различим по префиксу w/cx/gw, дубли URL между движками не повторять); каждая строка: [префикс·Бейдж](URL) Название — одна строка на русском о чём.
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
const answeredFamilies = [...new Set(channelResults.map(r => FAMILY[r.channelKey]))]
const selectedFamilies = [...new Set(SELECTED.map(k => FAMILY[k]))]
log(`Каналов завершилось: ${channelResults.length}/${SELECTED.length}; семей источников: ${answeredFamilies.length}/${selectedFamilies.length}`)

// Гейт: web/codexweb/grokweb — одна семья (открытый веб). Если выбрано ≥2 семей,
// а ответила лишь одна — триангуляции не будет. Намеренный web-only (1 семья) — OK.
if (channelResults.length < MIN_CHANNELS || (selectedFamilies.length >= 2 && answeredFamilies.length < 2)) {
  log(`Недостаточно независимых источников (агентов: ${channelResults.length}, семей: ${answeredFamilies.length}) — отдаю что есть, без синтеза.`)
  return { workDir: WORK_DIR, status: 'insufficient-sources', channelsAnswered: channelResults.length, answeredFamilies, files, channelResults, claimLedger: [] }
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
    const verdicts = v.map(x => x.verdict)
    const verdict = verdicts.includes('OUTDATED') ? 'OUTDATED'
      : verdicts.includes('CHALLENGED') ? 'CHALLENGED'
        : (v.length ? 'CONFIRMED' : 'UNVERIFIED')
    // подтверждённость claim — консервативно: худшая (бо́льшая) из оценок верификаторов
    const credibility = v.length ? Math.max(...v.map(x => x.credibility || 6)) : 6
    return { ...c, verdict, credibility, evidence: v.map(x => x.evidence), urls: v.map(x => x.url) }
  })
))).filter(Boolean)

const confirmed = claimLedger.filter(c => c.verdict === 'CONFIRMED').length
const challenged = claimLedger.filter(c => c.verdict === 'CHALLENGED').length
const outdated = claimLedger.filter(c => c.verdict === 'OUTDATED').length
log(`Ledger: CONFIRMED=${confirmed}, CHALLENGED=${challenged}, OUTDATED=${outdated}`)

// ═══ Phase 3 — Synthesize ═══
phase('Synthesize')

const ANALYST_FIELDS = '{reportPath,queryRu,mainConclusion,relatedCandidates,droppedClaims,gaps,analystModel}'
const report = FABLE_BRIDGE
  ? await agent(bridgePrompt('analyst', analystPrompt(files, claimLedger) + bridgeTail(ANALYST_FIELDS), 'Read,Write', ANALYST_FIELDS),
      w({ label: 'analyst→fable', phase: 'Synthesize', schema: ANALYST_SCHEMA }))
  : await agent(analystPrompt(files, claimLedger), o({ label: 'analyst', phase: 'Synthesize', schema: ANALYST_SCHEMA }))

return {
  workDir: WORK_DIR,
  status: 'ok',
  channelsAnswered: channelResults.length,
  channelsSelected: SELECTED,
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
    ledgerSummary: { confirmed, challenged, outdated },
    // Модель, которая реально выполнила синтез. Мост пробует bridgeModel один раз
    // и падает на fallback — frontmatter отчёта обязан совпадать с этим значением.
    analystModel: report.analystModel || (FABLE_BRIDGE ? BRIDGE_MODEL : FALLBACK_MODEL),
    bridgeModelRequested: FABLE_BRIDGE ? BRIDGE_MODEL : null,
  },
}
