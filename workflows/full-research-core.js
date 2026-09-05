export const meta = {
  name: 'full-research-core',
  description: 'Ядро full-research: N канальных исследователей → curator (evidence-префиксы) → urlhealth → per-claim верификация (2 линзы) → эскалация расхождений в Codex → analyst пишет отчёт в workDir. Vault-контракт — в скилле.',
  phases: [
    { title: 'Fan-out', detail: 'до 10 канальных агентов (web×3: brave/codex/grok + reddit/twitter/hn/substack + opt-in yandex/youtube/telegram) параллельно; evidence-пакеты (дословные quotes) + снапшоты' },
    { title: 'Verify', detail: 'curator (Opus 5) выделяет claims с evidence-префиксами → urlhealth (здоровье URL/цитат) → per-claim verifiers: линза-опровержение (Brave) + кросс-тип линза → расхождение голосов → третий голос Codex → CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED/DISPUTED (schema v3)' },
    { title: 'Synthesize', detail: 'analyst (Fable 5.1 через мост) пишет отчёт (verified:false): три корзины (проверенные / спорные / отсеянные), блок «Веса» в методологии' },
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
// schema v3: curator эмитит до CLAIM_HARD_CAP claims (сортировка loadBearing desc, strength desc).
const CLAIM_HARD_CAP = 16
// Кап эскалаций в Codex на прогон (расхождения голосов сверх капа → исключение по одному голосу + флаг 'cap').
const ESCALATION_CAP = Number.isFinite(A.escalationCap) ? A.escalationCap : 8
// Модель Codex для эскалации (третий голос). gpt-6-astra с 2026-09-05 (решение пользователя);
// откат — args.codexModel: 'gpt-5.6-sol' (в каталоге CLI жив). Effort high явно (дефолт Astra —
// medium), service_tier default явно (глобальный конфиг мог бы отдать priority ≈2,5× квоты).
// Литералы канала codexweb живут в protocols/codex-web-protocol.md — агент читает файл сам.
const CODEX_MODEL = A.codexModel || 'gpt-6-astra'
const CODEX_LABEL = A.codexModel ? `Codex/${A.codexModel}` : 'Codex/GPT-6 Astra'
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
// `claude -p --model claude-fable-5-1` ремапу не подчиняется (проверено: exit 0, ~7 c старт).
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
  return `Ты — технический МОСТ к модели Fable 5.1. Сам ролевую работу НЕ делай (кроме шага «Деградация»). Ровно четыре шага:

1. Через Write запиши в файл ${pf} ДОСЛОВНО весь текст между маркерами <<<ROLE_PROMPT и ROLE_PROMPT>>> (маркеры не включать, текст не менять и не сокращать).

2. Через Write запиши в файл ${sf} ДОСЛОВНО JSON между маркерами <<<SCHEMA и SCHEMA>>>.

3. ОДИН Bash-вызов (параметр timeout: 600000; --settings глушит хуки, < /dev/null обязателен):
cat "${pf}" | claude -p --model claude-fable-5-1 --effort high --allowedTools "${allowedTools}" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --settings '{"disableAllHooks":true}' --json-schema "$(cat "${sf}")" --output-format json > "${of}" 2>"${WORK_DIR}/_fable-${role}.err" < /dev/null; echo "EXIT=$?"

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
  codexweb: { source: `Web (${CODEX_LABEL})`, prefix: 'cx', protocol: `${PROTO_DIR}/codex-web-protocol.md`, file: 'web-codex.md' },
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
const COMMUNITY = ['reddit', 'twitter', 'hackernews', 'substack', 'youtube', 'telegram']
// ── Снапшот-гейт (schema v4, 2026-09-05): пер-цитатный потолок relevance ──
// Снапшот короче MIN_SNAPSHOT_CHARS гейт не закрывает (заглушка/обрезок, не контент).
const MIN_SNAPSHOT_CHARS = 1000
// LLM-опосредованные каналы: выдача — синтез модели, снапшот страницы пишет агент постфактум,
// и подтвердить, что цитата взята из страницы, а не из пересказа, нечем → потолок MEDIUM
// по константе канала (шапка снапшота — самоотчёт агента, на гейт не влияет).
// Escape только явный: args.channelCeiling = { codexweb: 'HIGH' } снимает потолок для канала.
const LLM_MEDIATED_CHANNELS = new Set(['codexweb', 'grokweb', 'yandex'])
// x.com/twitter.com: Firecrawl отдаёт AI-обработанный текст, дословного тела страницы нет.
const LLM_MEDIATED_HOSTS = /(^|\.)(x\.com|twitter\.com|mobile\.twitter\.com)$/i
const CHANNEL_CEILING = (A.channelCeiling && typeof A.channelCeiling === 'object') ? A.channelCeiling : {}
const hostOf = u => { try { return String(new URL(String(u || '')).hostname || '').toLowerCase() } catch (e) { return '' } }
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
          context: { type: 'string', description: 'пересказ на русском (что говорит источник)' },
          quotes: { type: 'array', items: { type: 'string' }, description: 'evidence-пакет (schema v3): 1-3 ДОСЛОВНЫХ спана источника ≤400 симв. каждый, НА ЯЗЫКЕ ОРИГИНАЛА (не переводить); пустой массив = дословного текста нет (сниппет/реконструкция)' },
          reliability: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F'], description: 'надёжность ИСТОЧНИКА по Admiralty (не правдоподобие информации)' },
          reliabilityWhy: { type: 'string', description: 'одна строка: тип источника / экспертиза автора / свежесть / конфликт интересов' },
        },
        required: ['prefix', 'url', 'relevance', 'context', 'quotes', 'reliability', 'reliabilityWhy'],
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
      description: `самые сильные cross-channel claims (до ${CLAIM_HARD_CAP}) для live-верификации`,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          statement: { type: 'string', description: 'проверяемое утверждение (атомарное)' },
          channels: { type: 'array', items: { type: 'string' }, description: 'какие каналы поддерживают (ключи каналов)' },
          strength: { type: 'string', enum: ['STRONG', 'MODERATE', 'WEAK'] },
          loadBearing: { type: 'boolean', description: 'true — на этом claim держится вывод/совет отчёта; false — фоновый факт' },
          claimType: { type: 'string', enum: ['factual', 'experiential'], description: 'factual — проверяемый факт о мире (цифра, дата, свойство продукта, событие); experiential — обобщение опыта людей («пользователи жалуются на X», «на практике Y работает так»)' },
          evidencePrefixes: { type: 'array', items: { type: 'string' }, description: 'ТОЛЬКО префиксы цитат из файлов каналов, напр. ["w1","r3","hn2"] — без текста; спаны подставит оркестратор из файлов каналов' },
        },
        required: ['id', 'statement', 'channels', 'strength', 'loadBearing', 'claimType', 'evidencePrefixes'],
      },
    },
  },
  required: ['claims'],
}

const URLHEALTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ok', 'partial', 'failed'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          prefix: { type: 'string' },
          url: { type: 'string' },
          urlStatus: { type: 'string', enum: ['ok', 'blocked', 'dead', 'skipped'] },
          quoteStatus: { type: 'string', enum: ['matched', 'notFound', 'notChecked'] },
          fabricationSuspect: { type: 'boolean' },
          snapshotChars: { type: 'integer', description: 'длина тела снапшота в символах (0 — снапшота нет/не прочитан)' },
          snapshotExtractor: { type: 'string', description: 'значение Extractor: из шапки снапшота (пустая строка — не указан); телеметрия, на гейт не влияет' },
        },
        required: ['prefix', 'url', 'urlStatus', 'quoteStatus', 'fabricationSuspect', 'snapshotChars', 'snapshotExtractor'],
      },
    },
    elapsedSec: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['status', 'items', 'elapsedSec', 'note'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claimId: { type: 'string' },
    verdict: { type: 'string', enum: ['CONFIRMED', 'CHALLENGED', 'OUTDATED', 'UNCHECKED'], description: 'UNCHECKED — ОПЕРАЦИОННЫЙ вердикт: не смог проверить (пейволл/сбой инструмента/источник недоступен/бюджет вызовов исчерпан/подтверждения не нашёл). НЕ доказательный: отсутствие подтверждения ≠ опровержение' },
    credibility: { type: 'integer', enum: [1, 2, 3, 4, 5, 6], description: 'подтверждённость claim (Admiralty): 1 подтверждён независимо, 2 вероятно верен, 3 возможно верен, 4 сомнителен, 5 неправдоподобен, 6 нельзя оценить (для UNCHECKED всегда 6)' },
    evidence: { type: 'string', description: 'что нашёл counter-search' },
    url: { type: 'string' },
    numberVerbatim: { type: ['string', 'null'], description: 'для числовых claims — ДОСЛОВНО число/дата/версия из найденного источника (как написано, без нормализации); null — claim не числовой или число не найдено' },
  },
  required: ['claimId', 'verdict', 'credibility', 'evidence', 'url', 'numberVerbatim'],
}

const ESCALATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claimId: { type: 'string' },
    status: { type: 'string', enum: ['ok', 'no-binary', 'quota', 'timeout', 'invalid-output', 'no-live-search'], description: 'ok — Codex ответил и делал живой поиск; остальное — причина, по которой третий голос не состоялся' },
    confirmsExclusion: { type: 'boolean', description: 'true — Codex подтверждает, что claim следует исключить (опровергнут/устарел); false — исключение не подтверждено' },
    verdictSuggested: { type: 'string', enum: ['CONFIRMED', 'CHALLENGED', 'OUTDATED', 'UNCHECKED'] },
    reasoning: { type: 'string' },
    urls: { type: 'array', items: { type: 'string' } },
    liveSearchEvents: { type: 'integer', description: 'сколько событий web_search в JSONL-выводе codex' },
  },
  required: ['claimId', 'status', 'confirmsExclusion', 'verdictSuggested', 'reasoning', 'urls', 'liveSearchEvents'],
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
    disputedClaims: { type: 'array', items: { type: 'string' }, description: 'claims DISPUTED — вынесены в «Спорные факты», в выводы не вошли' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'что не покрыто исследованием (для frontmatter и callout методологии)' },
  },
  required: ['reportPath', 'queryRu', 'mainConclusion', 'relatedCandidates', 'droppedClaims', 'disputedClaims', 'gaps'],
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
4. НЕ спавни sub-agents — делай всё сам. Все выходные данные на РУССКОМ — КРОМЕ поля quotes (см. п. 6).
5. СНАПШОТЫ (schema v4, ОБЯЗАТЕЛЬНЫЙ шаг): для 3-5 САМЫХ ВАЖНЫХ источников (relevance HIGH) сохрани полный извлечённый текст страницы в ${WORK_DIR}/snapshots/${c.prefix}<N>.md (Write). ИМЯ ФАЙЛА = ПРЕФИКС ЦИТАТЫ (\`${c.prefix}3.md\`, не \`thread-42.md\`) — иначе оркестратор не свяжет снапшот с цитатой. Шапка файла (первые строки, затем строка \`---\` и полный текст): \`URL: <url>\`, \`Date: <YYYY-MM-DD>\`, \`Prefix: [${c.prefix}N]\`, \`Extractor: <firecrawl|defuddle|pdf-fetch|exa-full|hn-fetch|substack-fetch|tg-preview|yt-transcript|llm-mediated>\` — чем реально извлечён текст (телеметрия, честно). Это замороженная доказательная база для верификаторов — они читают один и тот же текст, а не разные версии страницы. ПРАВИЛА: (a) цитата с relevance HIGH БЕЗ снапшота недопустима — не смог достать полный текст (пейволл/CAPTCHA/challenge) → снапшот не пиши, relevance снизь до MEDIUM и пометь «[no-snapshot: blocked]»; (b) файл короче ~${MIN_SNAPSHOT_CHARS} символов гейт НЕ закрывает (сниппет/заглушка/обрезок — не контент) — тогда тоже MEDIUM; (c) каналы codexweb/grokweb/yandex — потолок MEDIUM независимо от снапшота (выдача — синтез модели, а снапшот страницы ты пишешь постфактум; ставь HIGH только если уверен, что верификатор найдёт спан в снапшоте, гейт всё равно опустит до MEDIUM — это не ошибка). Пути записанных файлов верни в поле snapshots[] схемы (пустой массив = честное «ни одного»). Оркестратор энфорсит гейт кодом пер-цитатно: no-snapshot / llm-mediated / short-snapshot / quote-not-found → HIGH опускается до MEDIUM; повышений нет.
6. EVIDENCE-ПАКЕТ (schema v3): у каждой цитаты поле quotes — 1-3 ДОСЛОВНЫХ фрагмента текста источника (≤400 симв. каждый), НА ЯЗЫКЕ ОРИГИНАЛА — это исключение из правила «всё на русском»: спаны сверяются со снапшотом и первоисточником символ в символ, перевод их обесценивает. Пересказ на русском — в context. Дословного текста нет (сниппет поисковика, реконструкция, недоступная страница) → quotes: [] — не сочиняй.

ТЕЛЕМЕТРИЯ (обязательно):
ДО первого поиска выполни Bash \`date '+%Y-%m-%d %H:%M:%S'\` → это startedAt; ПОСЛЕ Write ещё раз → finishedAt. Обе строки запиши в шапку файла (Started:/Finished:) и верни в схеме (startedAt/finishedAt).

СОХРАНЕНИЕ:
Через Write сохрани результат в ${WORK_DIR}/${c.file} в формате:
# ${c.source} — результаты по "${QUERY}"
Started: {startedAt} / Finished: {finishedAt}
## Ключевые находки
## Цитаты
### [${c.prefix}1] {описание}
**Источник:** {URL} / **Контекст:** {пересказ на русском} / **Релевантность:** HIGH/MEDIUM/LOW / **Admiralty:** {A-F} — {reliabilityWhy}
**Quotes:** «{дословный спан 1}» · «{дословный спан 2}» (на языке оригинала; пусто — «—»)
## Контраргументы (найдены на ${c.source})
## Оценка источников
(для каждой цитаты: Evidence type / Author / Date / Bias signals / Cites original)

После записи верни структуру (schema): source="${c.source}", findings[], citations[{prefix,url,relevance,context,quotes,reliability,reliabilityWhy}], counterarguments[], sourceQuality, fileWritten="${WORK_DIR}/${c.file}".
Если канал недоступен после фоллбэков — верни sourceQuality="LOW", пустые citations и отметь это в findings.`
}

// ── Промпт куратора claims ──
function curatorPrompt(files) {
  return `Ты — куратор кросс-канальной верификации. Прочитай результаты каналов и выдели самые СИЛЬНЫЕ claims для live-проверки.

ЗАПРОС: ${QUERY}
${DECISION ? `РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ: ${DECISION}` : ''}

Файлы каналов (Read каждый):
${files.map(f => `- ${f}`).join('\n')}

Задача:
1. Прочитай все файлы.
2. Выдели до ${CLAIM_HARD_CAP} самых важных claims (приоритет тем, что повторяются в разных каналах ИЛИ являются load-bearing для выводов под решение). Оркестратор оставит первые ${CLAIM_HARD_CAP} по порядку «loadBearing → strength», поэтому сначала выпиши несущие claims.
3. Для каждого: statement (проверяемое утверждение), channels (кто поддерживает — используй РОВНО ключи каналов: web, codexweb, grokweb, yandex, reddit, twitter, hackernews, substack, youtube, telegram; НЕ имена файлов), strength, loadBearing, claimType, evidencePrefixes.
   СЕМЬИ ИСТОЧНИКОВ: web/codexweb/grokweb/yandex — ДВИЖКИ над одним открытым вебом (Яндекс — другой индекс, но тот же веб) = ОДНА семья 'web'; reddit, twitter, hackernews, substack, youtube, telegram — отдельные семьи. strength=STRONG ТОЛЬКО при поддержке 2+ РАЗНЫХ семей (например web+reddit); совпадение только web-движков между собой (w/cx/gw/y) — НЕ независимость, максимум MODERATE.
   claimType: factual — проверяемый факт о мире (цифра, дата, версия, свойство продукта, событие, цена); experiential — обобщение живого опыта людей («на практике X ломается при Y», «пользователи массово жалуются на Z»). Для experiential-claims первое лицо с конкретикой из сообществ — полноценное свидетельство, не «мнение».
   evidencePrefixes: ТОЛЬКО префиксы цитат из файлов каналов (например ["w1","r3","hn2"] — БЕЗ скобок и БЕЗ текста). Текст спанов ты НЕ возвращаешь — оркестратор подставит quotes из файлов каналов по префиксам. Неизвестный префикс будет отброшен; claim без единого реального префикса помечается evidenceless и не может быть STRONG. Минимум один префикс на claim, лучше 2-4 из разных каналов.

4. АТОМАРНОСТЬ (schema v2): каждый statement — ОДНО проверяемое фактическое ядро БЕЗ суперлативной/оценочной обёртки. Запрещены в statement: «самый/лучший/#1», «консенсус», «единодушны», «библия/канон», рейтинги-с-чужих-слов. Значимые квалификаторы (даты, версии, условия применимости) СОХРАНЯЙ — атомарность не значит обрубленность. Составное утверждение расщепи на отдельные claims либо возьми только load-bearing ядро. Числа/даты/версии в statement пиши так, как в источнике (не округляй).

Каждый claim — конкретное утверждение, которое можно проверить веб-поиском или по сообществам. Не мнение-вкусовщина. statement пиши НА РУССКОМ (имена собственные/термины/числа — как в источнике). Верни строго по схеме.`
}

// ── urlhealth (A2): один лёгкий агент запускает скрипт по evidence-URL выделенных claims ──
function urlhealthPrompt(items) {
  const inFile = `${WORK_DIR}/_urlhealth-in.json`
  const outFile = `${WORK_DIR}/_urlhealth.json`
  return `Ты — технический исполнитель шага urlhealth. Ролевой работы нет — три шага, без рассуждений:

1. Через Write запиши в ${inFile} ДОСЛОВНО JSON между маркерами <<<IN и IN>>>.
2. ОДИН Bash-вызов (timeout: 180000):
python3 "${PLUGIN_ROOT}/scripts/urlhealth.py" --in "${inFile}" --workdir "${WORK_DIR}" --deadline 90 --per-url 10 > "${outFile}" 2>"${WORK_DIR}/_urlhealth.err"; echo "EXIT=$?"
3. Прочитай ${outFile} (Read) и верни по схеме: status ("ok" если partial=false и нет поля error; "partial" если partial=true; "failed" если файл пуст/не JSON/есть error), items — массив {prefix,url,urlStatus,quoteStatus,fabricationSuspect,snapshotChars,snapshotExtractor} из .items (urlStatus не из набора ok|blocked|dead → "skipped"; quoteStatus не из набора → "notChecked"; fabricationSuspect отсутствует → false; snapshotChars — целое из .snapshotChars, отсутствует/не число → 0; snapshotExtractor — строка из .snapshotExtractor, отсутствует/null → ""), elapsedSec из .elapsedSec (нет → 0), note — краткая строка (summary счётчиков или текст ошибки).
Файл не появился или не разобрался → status="failed", items=[], note с причиной. НЕ чини скрипт, НЕ повторяй запросы вручную, НЕ спавни sub-agents.

<<<IN
${JSON.stringify(items)}
IN>>>`
}

// ── Промпт верификатора (per-claim; две разные линзы: опровержение через Brave
//    и кросс-типовая проверка через контр-канал ДРУГОЙ семьи источников) ──
const BRAVE_TOOLS = 'mcp__plugin_jadlis-research_brave-search__brave_web_search,mcp__plugin_jadlis-research_brave-search__brave_llm_context'
const HN_CMD = `\`${PLUGIN_ROOT}/scripts/hn-fetch.sh search "<запрос>" --tags story --limit 10\` и/или \`--tags comment\` (полные тексты комментариев прямо в выдаче; exit 3 = поиск HN недоступен → возьми Reddit)`
const REDDIT_CMD = `ToolSearch "select:mcp__plugin_jadlis-research_reddit__execute_operation" → execute_operation(operation_id="discover_subreddits", parameters={query,limit:5,min_confidence:0.4}) → execute_operation(operation_id="search_subreddit", parameters={subreddit_name,query,sort:"relevance",time_filter:"all"}) — НЕ вызывай discover_operations/get_operation_schema`

function evidenceBlock(claim) {
  const ev = claim.evidence || []
  if (!ev.length) return 'EVIDENCE: куратор не привязал ни одной реальной цитаты (evidenceless) — проверяй claim с нуля.'
  const snapInfo = e => e.snapshotPath ? ` (снапшот: ${e.snapshotPath}${Number.isFinite(e.snapshotChars) ? `, ${e.snapshotChars}B` : ''}, extractor:${e.snapshotExtractor || '?'})` : ''
  const ceilInfo = e => e.snapshotDemoted ? ` [ceiling:MEDIUM — ${e.snapshotDemoted}]` : ''
  return `EVIDENCE (дословные спаны источников каналов — проверяй ИХ, а не пересказ; relevance каждой цитаты уже прошла снапшот-гейт):
${ev.map(e => `- [${e.prefix}] ${e.url}${snapInfo(e)}${e.health ? ` [url:${e.health.urlStatus}, quote:${e.health.quoteStatus}${e.health.fabricationSuspect ? ', FABRICATION-SUSPECT' : ''}]` : ''}${ceilInfo(e)}
${(e.quotes || []).length ? e.quotes.map(q => `  «${q}»`).join('\n') : '  (дословного спана нет — только пересказ: ' + String(e.context || '').slice(0, 300) + ')'}`).join('\n')}
Пометка FABRICATION-SUSPECT / url:dead / quote:notFound = спан не подтверждён снапшотом или источник мёртв — считай такой спан НЕ доказательством; url:blocked / quote:notChecked — нейтрально (доступ ограничен, не вина источника).
[ceiling:MEDIUM — <причина>] = цитата опущена гейтом с HIGH до MEDIUM: no-snapshot (полного текста нет), llm-mediated (канал codexweb/grokweb/yandex или x.com — выдача модели/AI-пересказ, а не тело страницы), short-snapshot (файл < ${MIN_SNAPSHOT_CHARS} симв.), quote-not-found (спан не найден в снапшоте). llm-mediated и short-snapshot — НЕ фабрикация, а ограничение канала: спан может быть верным, но подтвердить его по снапшоту нельзя — ищи первоисточник сам.`
}

function verifyPrompt(claim, idx) {
  const chans = claim.channels || []
  const communityOrigin = chans.some(ch => COMMUNITY.includes(ch))
  const webOrigin = chans.some(ch => FAMILY[ch] === 'web')
  const experiential = claim.claimType === 'experiential'
  // Кросс-community: другая семья сообществ, чем каналы-источники claim.
  const fromHN = chans.includes('hackernews')
  const crossCommunity = fromHN
    ? `Reddit (другая семья, чем HN): ${REDDIT_CMD}`
    : `HackerNews (Bash, без ToolSearch): ${HN_CMD}${chans.includes('reddit') ? '' : `; альтернатива — Reddit: ${REDDIT_CMD}`}`
  const lens = idx === 0
    ? `ЛИНЗА «ОПРОВЕРЖЕНИЕ» (Brave): ищи ОПРОВЕРГАЮЩИЕ доказательства — контраргументы, противоречия, разоблачения. Запросы вида "<тема> problems", "<claim> debunked", "<тема> criticism".
ИНСТРУМЕНТЫ: ToolSearch "select:${BRAVE_TOOLS}" → 1-2 запроса (llm_context для содержимого страниц, web_search для охвата; параллельные вызовы OK).`
    : `ЛИНЗА «КРОСС-ТИП» — подтверди или опровергни claim источником ДРУГОГО ТИПА (другой семьи), чем каналы-источники claim:
${webOrigin && !communityOrigin
  ? `- Claim пришёл из web-движков → проверь по СООБЩЕСТВАМ практиков. Предпочтительно HackerNews (Bash, без ToolSearch): ${HN_CMD}. Альтернатива — Reddit через execute_operation НАПРЯМУЮ: ${REDDIT_CMD}.`
  : communityOrigin && !webOrigin
    ? `- Claim пришёл из сообществ (W2, порядок ОБЯЗАТЕЛЕН): (1) СНАЧАЛА кросс-community — ${crossCommunity}: ищешь НЕЗАВИСИМЫЕ свидетельства других людей (другие аккаунты, другая площадка, другое время); (2) ПОТОМ первоисточники: ToolSearch "select:${BRAVE_TOOLS}" → 1 запрос вида "<claim> official docs" / "<тема> changelog". ${experiential ? 'Claim experiential: первое лицо с конкретикой (Admiralty C — «у меня на проде X сломалось при Y») — ПОЛНОЦЕННОЕ независимое свидетельство; отсутствие упоминания в официальной доке НЕ опровергает опыт людей.' : 'Claim factual: опыт людей подтверждает, но решает первоисточник.'}`
    : `- Claim поддержан и web, и сообществами → проверь АКТУАЛЬНОСТЬ по первоисточникам (официальная дока/changelog, "<тема> 2026") через ToolSearch "select:${BRAVE_TOOLS}".`}
БЮДЖЕТ: ≤3 tool calls, загрузи РОВНО ОДИН набор инструментов. ЗАПРЕЩЕНО: Grok CLI (~/.grok/bin/grok) и mcp__grok-mcp__x_search — слишком медленно/дорого для верификации; Яндекс (yandex-search.sh) — платный, в верификации не используется; Reddit discover_operations/get_operation_schema — вызывай execute_operation напрямую.`
  const numericBlock = claim.numeric ? `
ЧИСЛОВОЙ CLAIM — правила нормализации (расхождение формы записи НЕ есть расхождение по существу): «1 000» = «1000» = «1k»; «10 %» = «10%»; «$1.2B» = «1,2 млрд $»; округление в пределах ±2% — совпадение; разные единицы — переведи перед сравнением; дата в другом формате — та же дата. CHALLENGED по числу — только если найденное число расходится ПО СУЩЕСТВУ (другой порядок, другой год, другая версия). Найденное число верни ДОСЛОВНО в numberVerbatim (как написано в источнике).` : ''
  return `Ты — adversarial-верификатор №${idx + 1}. Проверь claim через НЕЗАВИСИМЫЙ live-поиск. Не верь исходному исследованию.

CLAIM: "${claim.statement}"
(каналы-источники: ${chans.join(', ') || '—'}; заявленная сила: ${claim.strength}; тип: ${claim.claimType || 'factual'}${claim.loadBearing ? '; НЕСУЩИЙ для выводов' : ''})

${evidenceBlock(claim)}

${lens}${numericBlock}

${TOOL_NOTE}
При InputValidationError — сначала ToolSearch, затем повтор вызова.

СНАПШОТЫ: пути снапшотов указаны в EVIDENCE — прочитай их ПЕРЕД live-поиском (Read): это замороженные полные тексты источников каналов, общая доказательная база всех верификаторов. Если у claim снапшотов нет — Glob "${WORK_DIR}/snapshots/*.md" и прочитай релевантные.

Оцени:
- НЕ СМОГ проверить (пейволл, сбой инструмента, источник недоступен, бюджет вызовов исчерпан до получения сигнала) ИЛИ просто НЕ НАШЁЛ ни подтверждения, ни опровержения? → UNCHECKED (credibility 6). ОТСУТСТВИЕ ПОДТВЕРЖДЕНИЯ ≠ ОПРОВЕРЖЕНИЕ: «не нашёл в вебе/сообществах» — это UNCHECKED, не CHALLENGED.
- Claim актуален или устарел? → если устарел (есть более новые данные, которые его отменяют): OUTDATED.
- Есть весомые опровержения/противоречия ПО СУЩЕСТВУ (найденный источник прямо противоречит)? → CHALLENGED.
- Подтверждается независимо, опровержений нет? → CONFIRMED.
- credibility (1-6): 1 — подтверждён независимым источником другого типа; 2 — вероятно верен (логично, согласуется, прямого независимого подтверждения нет); 3 — возможно верен; 4 — сомнителен; 5 — неправдоподобен; 6 — нельзя оценить.

Верни по схеме: claimId="${claim.id}", verdict (CONFIRMED/CHALLENGED/OUTDATED/UNCHECKED), credibility (1-6), evidence (что нашёл; для UNCHECKED — что именно не удалось и почему), url (ключевой источник проверки; для UNCHECKED — недоступный URL или пустая строка), numberVerbatim (число дословно или null).
НЕ спавни sub-agents.`
}

// ── Эскалация расхождения голосов: третий голос Codex (CODEX_MODEL) с гейтом живого поиска ──
function escalationPrompt(claim, votes) {
  const pf = `${WORK_DIR}/_codex-esc-${claim.id}-prompt.md`
  const jf = `${WORK_DIR}/_codex-esc-${claim.id}.jsonl`
  const lf = `${WORK_DIR}/_codex-esc-${claim.id}-last.md`
  const exclusionVote = votes.find(v => v.verdict === 'CHALLENGED' || v.verdict === 'OUTDATED')
  const rolePrompt = `You are a third, independent adversarial verifier (tie-breaker). Two verifiers disagreed about a claim from a multi-source research run. Use LIVE web search (mandatory: at least one search) and decide whether the claim should be EXCLUDED from the report.

CLAIM (Russian): "${claim.statement}"
Claim type: ${claim.claimType || 'factual'}; origin channels: ${(claim.channels || []).join(', ') || '-'}.

EVIDENCE SPANS from the original sources (verbatim, original language):
${(claim.evidence || []).map(e => `- [${e.prefix}] ${e.url}\n${(e.quotes || []).map(q => `  "${q}"`).join('\n') || '  (no verbatim span)'}`).join('\n') || '- (none)'}

VERIFIER VOTES:
${votes.map((v, i) => `- verifier ${i + 1}: ${v.verdict} (credibility ${v.credibility}) — ${String(v.evidence || '').slice(0, 600)}${v.url ? ` [${v.url}]` : ''}`).join('\n')}

ARGUMENT FOR EXCLUSION (from the ${exclusionVote ? exclusionVote.verdict : 'dissenting'} vote): ${exclusionVote ? String(exclusionVote.evidence || '').slice(0, 800) : '(none given)'}

Rules: absence of confirmation is NOT refutation (that is UNCHECKED). Numeric differences that are only formatting/rounding (±2%) are NOT a refutation. Confirm exclusion (CHALLENGED/OUTDATED) ONLY if you find a source that directly contradicts or supersedes the claim. Cite URLs.

Answer with EXACTLY one JSON object as the final message, no prose after it:
{"confirmsExclusion": true|false, "verdictSuggested": "CONFIRMED"|"CHALLENGED"|"OUTDATED"|"UNCHECKED", "reasoning": "<=600 chars", "urls": ["..."]}`
  return `Ты — технический МОСТ к Codex CLI (третий голос верификации). Ролевую работу сам НЕ делай. Ровно четыре шага:

1. Через Write запиши в ${pf} ДОСЛОВНО текст между маркерами <<<ROLE_PROMPT и ROLE_PROMPT>>>.

2. Проверь бинарник: Bash \`command -v codex >/dev/null && echo HAVE || echo NONE\`. NONE → верни status="no-binary" (остальные поля: confirmsExclusion=false, verdictSuggested="UNCHECKED", reasoning="codex binary missing", urls=[], liveSearchEvents=0) и остановись.

3. ОДИН Bash-вызов (параметр timeout: 300000; < /dev/null обязателен):
codex exec -m ${CODEX_MODEL} -s read-only --skip-git-repo-check -c model_reasoning_effort="high" -c service_tier="default" -c 'tools.web_search={mode="live"}' --json -o "${lf}" "$(cat "${pf}")" < /dev/null > "${jf}" 2>"${WORK_DIR}/_codex-esc-${claim.id}.err"; echo "EXIT=$?"

4. Разбор:
   - EXIT≠0 и в ${jf}/.err есть «usage limit» / «quota» / «rate limit» / 429 → status="quota". Bash-таймаут (вызов прерван) → status="timeout".
   - Гейт живого поиска: Bash \`grep -c '"web_search' "${jf}"\` → liveSearchEvents. 0 → status="no-live-search" (Codex отвечал по памяти — такой голос не считается).
   - Финальный JSON: прочитай ${lf} (Read); если файла нет — последняя строка ${jf} с item.type=="agent_message" (поле .item.text). Извлеки JSON-объект (последний блок {...}). Не разобрался → status="invalid-output".
   - Всё ок → status="ok", поля из JSON. verdictSuggested вне enum → "UNCHECKED".
Верни строго по схеме: claimId="${claim.id}", status, confirmsExclusion, verdictSuggested, reasoning, urls, liveSearchEvents. НЕ спавни sub-agents, НЕ повторяй вызов codex (ретраев нет — квота общая с /verif).

<<<ROLE_PROMPT
${rolePrompt}
ROLE_PROMPT>>>`
}

// ── Промпт аналитика (decision-first отчёт: выводы и действия читателю, процесс — в callout/frontmatter) ──
function analystPrompt(files, ledger, stats) {
  return `Ты — аналитик. Прочитай результаты каналов, проведи кросс-валидацию и напиши финальный отчёт на РУССКОМ в формате DECISION-FIRST + КОНТЕКСТ: сверху — выводы и советы под решение (это видит читатель в первую очередь); ниже — отдельная секция «📚 Контекст и находки» с наресёрченной фактурой темы. В свёрнутый callout «Методология» убирается ТОЛЬКО мета-процесс (как искал, что отсеял), а НЕ содержательный контекст предмета. ВАЖНО: claims с verdict CHALLENGED/OUTDATED ни в выводы, ни в контекст НЕ попадают — фильтруй, а не дописывай критику. Claims DISPUTED — в отдельную подсекцию «Спорные факты», в выводы НЕ входят.

ЗАПРОС: ${QUERY}
${DECISION ? `РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ (весь отчёт строится под него): ${DECISION}` : 'РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ: не задано — выведи вердикт под самое вероятное решение по запросу.'}
ДАТА: ${DATE}

Файлы каналов (Read каждый; если файла нет — учти канал как недоступный):
${files.map(f => `- ${f}`).join('\n')}

ПРИМЕР стиля (Read): ${PLUGIN_ROOT}/skills/full-research/examples/sample-report.md —
показывает тон, плотность и оформление. Обязательный контракт — спека формата выше;
структуру и объём адаптируй под тему, скелет примера не копируй буквально.

CROSS-VERIFICATION LEDGER (live-проверка claims; у каждого verdict, credibility 1-6, вектор голосов votes[], claimType, loadBearing, evidence-спаны, ceilingCapped — все evidence claim'а опущены снапшот-гейтом до MEDIUM, при эскалации — escalation):
${JSON.stringify(ledger.map(c => ({ id: c.id, statement: c.statement, channels: c.channels, strength: c.strength, claimType: c.claimType, loadBearing: c.loadBearing, verdict: c.verdict, votes: c.votes, voteCount: c.voteCount, credibility: c.credibility, evidence: c.verifierEvidence, urls: c.urls, evidenceRefs: (c.evidence || []).map(e => e.prefix), weakEvidence: !!c.weakEvidence, evidenceless: !!c.evidenceless, ceilingCapped: !!c.ceilingCapped, escalation: c.escalation ? { status: c.escalation.status, confirmsExclusion: c.escalation.confirmsExclusion, reasoning: c.escalation.reasoning } : null, escalationSkipped: c.escalationSkipped || null })), null, 2)}

СВОДКА LEDGER: ${JSON.stringify(stats)}

КРОСС-ВАЛИДАЦИЯ (для отбора материала; сам процесс в отчёт НЕ пишется):
- Triangulation: тезис подтверждён РАЗНЫМИ типами источников? (web+community=strong; два reddit-поста=weak). Circular reporting: 2 источника на 1 оригинал = 1 источник.
- WEB-СЕМЬЯ: файлы web.md/web-codex.md/web-grok.md/web-yandex.md — ДВИЖКИ (Brave [w], Codex [cx], Grok [gw], Яндекс [y]) над ОДНИМ открытым вебом. Дедупь их находки по URL. Совпадение движков = усиление ВНУТРИ типа web, НЕ независимая триангуляция (независимость = web+community). Находка, которую дал только ОДИН движок и не подтвердил никто другой — пониженная достоверность (цифра бейджа не выше 3) + краткая пометка "только {движок}".
- Community consensus = сильный ТОЛЬКО при независимости (разные аккаунты/время, без incentives).
- ВЕСА (schema v3): вес утверждения складывается из четырёх осей — (1) независимость: число РАЗНЫХ семей источников (web, reddit, hn, twitter, substack, youtube, telegram); (2) надёжность источника: Admiralty A-F из файлов каналов; (3) тип claim: для factual решает первоисточник (веб/дока — приоритетная семья), для experiential решают сообщества (первое лицо с конкретикой, Admiralty C, — полноценное свидетельство, веб лишь дополняет); (4) подтверждённость: credibility 1-6 из ledger. Не применяй глобальный приоритет «соцсети важнее веба» или наоборот — семья приоритетна ПО ТИПУ claim.
- Claims из ledger: CONFIRMED → не только разрешают вердикты в выводах, но и РЕНДЕРЯТСЯ ЯВНО в подсекции «Проверенные факты» секции «📚 Контекст и находки» (с evidence и бейджем достоверности) — это подтверждённый фундамент, его нельзя «растворять» в выводах. ВЕКТОР ГОЛОСОВ виден читателю: у каждого проверенного факта пометка «(2 голоса)» при voteCount=2 или «(1 голос — split: второй верификатор не смог проверить)» при voteCount=1 — читатель обязан различать двойное и одиночное подтверждение. DISPUTED → подсекция «Спорные факты» (голоса разошлись, третий голос исключение не подтвердил): статement + в чём расхождение + бейдж; в выводы и советы НЕ входит. CHALLENGED/OUTDATED → НЕ в выводы и НЕ в контекст, только строка в callout методологии с причиной отсева. UNCHECKED → НЕ в отчёт; в callout методологии одной строкой: «не удалось проверить: N claims (причины кратко)». weakEvidence/evidenceless → бейдж не выше 3 даже при CONFIRMED. ceilingCapped → бейдж не выше 3 даже при CONFIRMED (все evidence claim'а — llm-mediated/short-snapshot/no-snapshot/quote-not-found: это не фабрикация, а ограничение канала — спан не подтверждён по телу страницы); в callout методологии одной строкой: «потолок MEDIUM по снапшот-гейту: N claims».

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
ledger_schema: 4
claims_confirmed: ${stats.confirmed}
claims_disputed: ${stats.disputed}
claims_dropped: ${stats.challenged + stats.outdated}
claims_unchecked: ${stats.unchecked}
votes_confirmed_2: ${stats.confirmed - stats.confirmedSplit}
votes_confirmed_1: ${stats.confirmedSplit}
escalations: ${stats.escalated}
credibility_median: ${stats.credibilityMedian}
gaps: [{2-4 строки-пробела}]
work_dir: "${WORK_DIR}"
---
(числовые поля ledger — ровно эти значения; оркестратор сверит их со сводкой и поправит детерминированно)

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
   - **Спорные факты**: claims с verdict=DISPUTED — заголовок РОВНО \`### Спорные факты\` (канонический); каждая строка: statement, кто что нашёл (голоса), почему не решено; бейдж не выше 4. Нет DISPUTED — подсекцию пропусти.
   - **Разногласия и нюансы**: где источники/сообщества расходятся, какие лагеря, что под вопросом — НЕ усреднять до ложного консенсуса.
   В секцию идёт только материал, прошедший кросс-валидацию; claims CHALLENGED/OUTDATED сюда НЕ попадают (они лишь строкой в callout методологии).
9. ## Кому доверять в этой теме — таблица: Источник | Надёжность (A-F) | Почему.
10. ## Источники — подсекции по каналам; web-движки — ОДНА подсекция "### Web" (движок различим по префиксу w/cx/gw/y, дубли URL между движками не повторять); каждая строка: [префикс·Бейдж](URL) Название — одна строка на русском о чём.
11. ## Связанные заметки — ПУСТАЯ секция-заглушка (wikilinks добавит оркестратор).
12. > [!note]- Методология и проверка — ОДИН СВЁРНУТЫЙ callout ≤25 строк в самом конце: каналы и число источников; проверено K claims: X подтверждено (из них Y одним голосом), Z спорных (эскалировано в третий голос: N), W отсеяно (список отсеянных + причина: оспорено/устарело), не удалось проверить: U; блок **«Веса»** — 2-4 строки: формула (семьи → независимость; Admiralty A-F → надёжность источника; claimType → приоритетная семья; credibility 1-6 → подтверждённость) и какие семьи внесли вклад в каждый ключевой вывод (например «вывод 1: web A + reddit C, factual → приоритет web»); gaps; bias выборки; дата данных; «полный процесс — в work_dir из frontmatter».

ПРАВИЛА ТЕКСТА:
- Рубрики 4-7: каждый совет — callout > [!tip] (делать/принимать/относиться/учитывать) или > [!failure] (не делать/не принимать/игнорировать). Заголовок callout — конкретное действие; тело — одна строка «почему» + бейджи-ссылки. 2-4 совета на рубрику; если по рубрике сказать нечего — пропусти её целиком, не выдумывай.
- Простой русский язык. ВСЕ цитаты переводи на русский (оригинал не дублируй — ссылка ведёт на источник).
- ЗАПРЕЩЁН рассказ о ПРОЦЕССЕ: секции Adversarial Review, Evidence Strength, «как делалась кросс-валидация», Детали исследования, «Все ссылки» — их содержимое сжимается в callout методологии, frontmatter и бейджи. НО контекст о ПРЕДМЕТЕ (секция «📚 Контекст и находки») обязателен и под запрет НЕ попадает: запрещён только мета-рассказ о том, КАК ты искал, а не фактура темы.
- Блок вердиктов (рубрики «делать/не делать» и пр.) держи плотным. Секцию «📚 Контекст и находки» масштабируй по сложности темы — жёсткого лимита нет, но без воды: каждая строка несёт факт/цифру/цитату, а не общие слова.
- Ссылки ТОЛЬКО одинарные скобки: [w1·B2](URL). ❌ НЕ [[w1]](URL). НЕ ставь wikilinks.

СОХРАНЕНИЕ: через Write сохрани draft-отчёт в ${WORK_DIR}/report.md (НЕ в vault — запись в vault сделает оркестратор).
После записи верни по схеме: reportPath="${WORK_DIR}/report.md", queryRu (краткая русская формулировка ≤25 симв для имени файла), mainConclusion, relatedCandidates (3-6 ключевых слов/тем для obsidian-поиска связанных заметок), droppedClaims (что отфильтровано как CHALLENGED/OUTDATED), disputedClaims (что вынесено в «Спорные факты»), gaps (те же, что в frontmatter).
НЕ спавни sub-agents, НЕ вызывай skills, читай только файлы каналов в ${WORK_DIR}, снапшоты и эталон.`
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

// Индекс цитат по префиксу: curator возвращает только префиксы, спаны подставляет JS
// (curator физически не может выдумать цитату — только сослаться на несуществующую).
// Строится ДО гейта (schema v4): гейт работает пер-цитатно по индексу. citationRefs —
// обратные ссылки на объекты цитат каналов (отдельная карта: запись индекса копируется
// в claim.evidence → леджер → wf-лог, ссылка на объект дала бы дубли).
const normPrefix = p => String(p || '').replace(/[\[\]\s]/g, '').toLowerCase()
const citationIndex = {}
const citationRefs = {}
for (const r of channelResults) {
  const snaps = (Array.isArray(r.snapshots) ? r.snapshots : []).filter(Boolean)
  for (const c of (r.citations || [])) {
    if (!c || !c.prefix) continue
    const p = normPrefix(c.prefix)
    const snap = snaps.find(s => normPrefix(String(s).split('/').pop().replace(/\.md$/i, '')) === p) || null
    if (!citationIndex[p]) {
      citationIndex[p] = { prefix: p, url: c.url, quotes: Array.isArray(c.quotes) ? c.quotes.filter(Boolean).map(q => String(q).slice(0, 400)) : [], context: c.context || '', reliability: c.reliability || 'F', relevance: c.relevance, channel: r.channelKey, snapshotPath: snap, snapshotDemoted: null }
      citationRefs[p] = c
    }
  }
}

// Снапшот-гейт (schema v4) — пер-цитатный, детерминированный. Порядок причин фиксирован,
// первая побеждает: no-snapshot → llm-mediated. short-snapshot / quote-not-found — после
// urlhealth (нужно чтение файлов, в песочнице раннера fs нет). Повышений нет никогда.
// Меняем relevance и в индексе (→ evidence claims), и на объекте цитаты канала (→ channelStatus).
const demote = (p, reason) => {
  const e = citationIndex[p]; const c = citationRefs[p]
  if (!e || e.snapshotDemoted) return false
  e.relevance = 'MEDIUM'; e.snapshotDemoted = reason
  if (c) { c.relevance = 'MEDIUM'; c.snapshotDemoted = reason }
  return true
}
const REASON_KEY = { 'no-snapshot': 'noSnapshot', 'short-snapshot': 'shortSnapshot', 'llm-mediated': 'llmMediated', 'quote-not-found': 'quoteNotFound' }
const demotedBy = {}   // channel → { noSnapshot, shortSnapshot, llmMediated, quoteNotFound }
const noteDemotion = (channel, reason) => {
  const d = demotedBy[channel] || (demotedBy[channel] = { noSnapshot: 0, shortSnapshot: 0, llmMediated: 0, quoteNotFound: 0 })
  d[REASON_KEY[reason]]++
}
const channelCeiling = k => (CHANNEL_CEILING[k] === 'HIGH') ? 'HIGH' : (LLM_MEDIATED_CHANNELS.has(k) ? 'MEDIUM' : 'HIGH')
for (const p of Object.keys(citationIndex)) {
  const e = citationIndex[p]
  if (e.relevance !== 'HIGH') continue
  const reason = !e.snapshotPath ? 'no-snapshot'
    : (channelCeiling(e.channel) === 'MEDIUM' || LLM_MEDIATED_HOSTS.test(hostOf(e.url))) ? 'llm-mediated'
    : null
  if (reason && demote(p, reason)) noteDemotion(e.channel, reason)
}
if (Object.keys(demotedBy).length) log(`⚠ Снапшот-гейт (v4): HIGH→MEDIUM: ${Object.entries(demotedBy).map(([k, d]) => `${k}(${Object.entries(d).filter(([, n]) => n).map(([r, n]) => `${r} ${n}`).join(', ')})`).join('; ')}`)

const sumDemoted = d => d ? Object.values(d).reduce((a, b) => a + b, 0) : 0
const channelStatus = SELECTED.map(k => {
  const r = channelResults.find(x => x.channelKey === k)
  const cits = r ? (r.citations || []) : []
  return { channel: k, answered: !!r, ok: r ? okChannel(r) : false, sourceQuality: r ? r.sourceQuality : null, citations: cits.length, snapshots: r ? (r.snapshots || []).length : 0, highCitations: cits.filter(c => c && c.relevance === 'HIGH').length, quotedCitations: cits.filter(c => c && Array.isArray(c.quotes) && c.quotes.length).length, snapshotDemoted: sumDemoted(demotedBy[k]), snapshotDemotedBy: demotedBy[k] || { noSnapshot: 0, shortSnapshot: 0, llmMediated: 0, quoteNotFound: 0 }, ceiling: channelCeiling(k), snapshotBytesMedian: null }
})
const failedChannels = channelStatus.filter(s => !s.ok).map(s => s.channel)
const answeredFamilies = [...new Set(okResults.map(r => FAMILY[r.channelKey]))]
const selectedFamilies = [...new Set(SELECTED.map(k => FAMILY[k]))]
log(`Каналов успешно: ${okResults.length}/${SELECTED.length} (упали/деградировали: ${failedChannels.join(', ') || 'нет'}); семей источников: ${answeredFamilies.length}/${selectedFamilies.length}`)

// Гейт: web/codexweb/grokweb — одна семья (открытый веб). Если выбрано ≥2 семей,
// а успешна лишь одна — триангуляции не будет. Намеренный web-only (1 семья) — OK.
if (okResults.length < 2 || (selectedFamilies.length >= 2 && answeredFamilies.length < 2)) {
  log(`Недостаточно независимых источников (успешных каналов: ${okResults.length}, семей: ${answeredFamilies.length}) — отдаю что есть, без синтеза.`)
  return { workDir: WORK_DIR, status: 'insufficient-sources', ledgerSchemaVersion: 4, channelsAnswered: channelResults.length, channelStatus, failedChannels, answeredFamilies, files, channelResults, claimLedger: [] }
}

// ═══ Phase 2 — Verify (per-claim live counter-search) ═══
phase('Verify')

// Устойчивость к падению curator (обрыв сети / лимит квоты / пустой ответ):
// без гейта null.claims рушил ВЕСЬ прогон уже после успешного fan-out (инцидент 2026-09-01).
// Один ретрай, затем деградация: синтез идёт с пустым ledger, отчёт всё равно пишется.
let curated = await agent(curatorPrompt(files), o({ label: 'curator', phase: 'Verify', schema: CURATOR_SCHEMA }))
if (!curated || !Array.isArray(curated.claims) || !curated.claims.length) {
  log('Curator не вернул claims — один повтор.')
  curated = await agent(curatorPrompt(files), o({ label: 'curator-retry', phase: 'Verify', schema: CURATOR_SCHEMA }))
}
if (!curated || !Array.isArray(curated.claims)) {
  log('⚠ Curator недоступен после повтора — иду в синтез с ПУСТЫМ ledger (claims не верифицированы).')
  curated = { claims: [] }
}

const STRENGTH_RANK = { STRONG: 3, MODERATE: 2, WEAK: 1 }
const NUMERIC_RE = /\d/
const allClaims = curated.claims.map((c, i) => {
  const prefixes = Array.isArray(c.evidencePrefixes) ? c.evidencePrefixes.map(normPrefix).filter(Boolean) : []
  const evidence = []; const evidenceOrphans = []
  for (const p of [...new Set(prefixes)]) (citationIndex[p] ? evidence : evidenceOrphans).push(citationIndex[p] ? { ...citationIndex[p] } : p)
  const evidenceless = evidence.length === 0
  let strength = c.strength || 'WEAK'
  if (evidenceless && strength === 'STRONG') strength = 'MODERATE'
  return { ...c, id: c.id || `c${i + 1}`, strength, loadBearing: !!c.loadBearing, claimType: c.claimType === 'experiential' ? 'experiential' : 'factual', numeric: NUMERIC_RE.test(String(c.statement || '')), evidence, evidenceOrphans, evidenceless }
})
allClaims.sort((a, b) => (Number(b.loadBearing) - Number(a.loadBearing)) || ((STRENGTH_RANK[b.strength] || 0) - (STRENGTH_RANK[a.strength] || 0)))
const claims = allClaims.slice(0, CLAIM_HARD_CAP)
const claimsDroppedByCap = allClaims.length - claims.length
const orphanTotal = claims.reduce((n, c) => n + c.evidenceOrphans.length, 0)
log(`Куратор выделил ${allClaims.length} claims → на live-проверку ${claims.length} (кап ${CLAIM_HARD_CAP}, отброшено ${claimsDroppedByCap}); несущих: ${claims.filter(c => c.loadBearing).length}, experiential: ${claims.filter(c => c.claimType === 'experiential').length}, без evidence: ${claims.filter(c => c.evidenceless).length}, неизвестных префиксов: ${orphanTotal}`)

// ── urlhealth (A2): только evidence-URL выделенных claims; сбой шага не роняет прогон ──
let evidenceHealth = 'skipped'
let urlhealthSummary = null
try {
  const seen = new Set()
  const items = []
  for (const c of claims) for (const e of c.evidence) {
    if (!e.url || seen.has(e.prefix)) continue
    seen.add(e.prefix)
    items.push({ prefix: e.prefix, url: e.url, quote: (e.quotes || [])[0] || '', snapshotPath: e.snapshotPath })
  }
  if (items.length) {
    const uh = await agent(urlhealthPrompt(items), w({ label: 'urlhealth', phase: 'Verify', schema: URLHEALTH_SCHEMA }))
    if (uh && Array.isArray(uh.items) && uh.status !== 'failed') {
      const byPrefix = {}
      for (const it of uh.items) byPrefix[normPrefix(it.prefix)] = it
      const counts = { ok: 0, blocked: 0, dead: 0, skipped: 0, matched: 0, notFound: 0, notChecked: 0, fabricationSuspect: 0 }
      for (const it of uh.items) { counts[it.urlStatus] = (counts[it.urlStatus] || 0) + 1; counts[it.quoteStatus] = (counts[it.quoteStatus] || 0) + 1; if (it.fabricationSuspect) counts.fabricationSuspect++ }
      // Политика: dead / fabricationSuspect / notFound → спан weak; blocked / notChecked НИКОГДА не понижают.
      // Снапшот-гейт v4, вторая ступень (нужно чтение файлов): quote notFound → 'quote-not-found',
      // тело снапшота < MIN_SNAPSHOT_CHARS → 'short-snapshot'. В e.weak новые причины НЕ входят
      // (иначе весь codexweb стал бы «слабым доказательством» и потянул strength) — вместо этого
      // агрегат c.ceilingCapped для analyst'а (бейдж credibility ≤3).
      const snapCharsByChannel = {}
      for (const c of claims) {
        for (const e of c.evidence) {
          const h = byPrefix[e.prefix]
          if (!h) continue
          const chars = Number.isFinite(h.snapshotChars) ? h.snapshotChars : 0
          e.health = { urlStatus: h.urlStatus, quoteStatus: h.quoteStatus, fabricationSuspect: !!h.fabricationSuspect }
          e.snapshotChars = chars
          e.snapshotExtractor = h.snapshotExtractor ? String(h.snapshotExtractor) : null
          e.weak = h.urlStatus === 'dead' || !!h.fabricationSuspect || h.quoteStatus === 'notFound'
          if (chars > 0) (snapCharsByChannel[e.channel] || (snapCharsByChannel[e.channel] = [])).push(chars)
          // Ступень 2 гейта: индекс уже мог понизить цитату (no-snapshot/llm-mediated) — тогда причина остаётся первой.
          const reason = h.quoteStatus === 'notFound' ? 'quote-not-found'
            : (e.snapshotPath && chars > 0 && chars < MIN_SNAPSHOT_CHARS) ? 'short-snapshot'
            : null
          if (reason && (citationIndex[e.prefix] ? citationIndex[e.prefix].relevance === 'HIGH' : e.relevance === 'HIGH')) {
            if (demote(e.prefix, reason)) noteDemotion(e.channel, reason)
          }
          if (citationIndex[e.prefix] && citationIndex[e.prefix].snapshotDemoted) { e.relevance = 'MEDIUM'; e.snapshotDemoted = citationIndex[e.prefix].snapshotDemoted }
        }
        const checked = c.evidence.filter(e => e.health)
        c.weakEvidence = checked.length > 0 && checked.every(e => e.weak)
        if (c.weakEvidence && c.strength === 'STRONG') { c.strength = 'MODERATE'; c.strengthDemoted = 'weak-evidence' }
        c.ceilingCapped = c.evidence.length > 0 && c.evidence.every(e => !!e.snapshotDemoted)
      }
      // channelStatus строится до раннего return — допатчиваем после urlhealth.
      for (const st of channelStatus) {
        const cr = channelResults.find(x => x.channelKey === st.channel)
        if (cr) st.highCitations = (cr.citations || []).filter(c => c && c.relevance === 'HIGH').length
        st.snapshotDemoted = sumDemoted(demotedBy[st.channel])
        st.snapshotDemotedBy = demotedBy[st.channel] || st.snapshotDemotedBy
        const v = (snapCharsByChannel[st.channel] || []).slice().sort((a, b) => a - b)
        st.snapshotBytesMedian = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)) : null
      }
      evidenceHealth = uh.status
      urlhealthSummary = { ...counts, items: uh.items.length, elapsedSec: uh.elapsedSec, note: uh.note }
      log(`urlhealth (${uh.status}, ${uh.elapsedSec}s): url ok=${counts.ok} blocked=${counts.blocked} dead=${counts.dead} skipped=${counts.skipped}; quote matched=${counts.matched} notFound=${counts.notFound} notChecked=${counts.notChecked}; fabricationSuspect=${counts.fabricationSuspect}; claims weakEvidence=${claims.filter(c => c.weakEvidence).length}, ceilingCapped=${claims.filter(c => c.ceilingCapped).length}`)
    } else {
      log(`⚠ urlhealth не дал результата (${uh && uh.note ? uh.note : 'нет ответа'}) — шаг пропущен.`)
    }
  } else {
    log('urlhealth: у выделенных claims нет evidence-URL — шаг пропущен.')
  }
} catch (e) {
  log(`⚠ urlhealth упал (${e && e.message ? e.message : e}) — шаг пропущен, прогон продолжается.`)
}

// ── Голоса верификаторов ──
const voted = (await parallel(claims.map(c => () =>
  parallel(Array.from({ length: VERIFIERS }, (_, i) => () =>
    agent(verifyPrompt(c, i), w({ label: `verify:${c.id}#${i + 1}`, phase: 'Verify', schema: VERIFY_SCHEMA }))
  )).then(votes => ({ claim: c, votes: votes.filter(Boolean) }))
))).filter(Boolean)

// ── Агрегация голосов (schema v3) — таблица истинности ──
//   CONFIRMED+CONFIRMED → CONFIRMED; CONFIRMED+UNCHECKED → CONFIRMED (1 голос, split);
//   согласное исключение (CHALLENGED/OUTDATED × CHALLENGED/OUTDATED) → исключение без Codex;
//   UNCHECKED+UNCHECKED → UNCHECKED; расхождение (CONFIRMED vs CHALLENGED/OUTDATED,
//   CHALLENGED/OUTDATED vs UNCHECKED) → третий голос Codex (кап ESCALATION_CAP).
const EXCL = v => v === 'CHALLENGED' || v === 'OUTDATED'
const pickExclusion = verdicts => verdicts.includes('OUTDATED') ? 'OUTDATED' : 'CHALLENGED'
function aggregate(c, v) {
  const all = v.map(x => x.verdict)
  const real = v.filter(x => x.verdict !== 'UNCHECKED')
  const verdicts = real.map(x => x.verdict)
  let verdict, needsEscalation = false
  if (!v.length) verdict = 'UNVERIFIED'
  else if (!real.length) verdict = 'UNCHECKED'
  else if (verdicts.every(x => x === 'CONFIRMED')) verdict = 'CONFIRMED'
  else if (verdicts.every(EXCL) && real.length >= 2) verdict = pickExclusion(verdicts)
  else { verdict = pickExclusion(verdicts); needsEscalation = true } // CONFIRMED vs EXCL, или EXCL один при UNCHECKED
  // подтверждённость — консервативно по СОДЕРЖАТЕЛЬНЫМ голосам (UNCHECKED не тянет в 6)
  const credibility = real.length ? Math.max(...real.map(x => x.credibility || 6)) : 6
  return { ...c, verdict, votes: all, voteCount: real.length, credibility, verifierEvidence: v.map(x => x.evidence), urls: v.map(x => x.url), numbersVerbatim: v.map(x => x.numberVerbatim || null), rawVotes: v, needsEscalation }
}
let claimLedger = voted.map(({ claim, votes }) => aggregate(claim, votes))

const escalationCandidates = claimLedger.filter(c => c.needsEscalation)
escalationCandidates.sort((a, b) => Number(b.loadBearing) - Number(a.loadBearing))
const toEscalate = escalationCandidates.slice(0, ESCALATION_CAP)
escalationCandidates.slice(ESCALATION_CAP).forEach(c => { c.escalationSkipped = 'cap' })
log(`Расхождений голосов: ${escalationCandidates.length}; эскалирую в Codex: ${toEscalate.length} (кап ${ESCALATION_CAP})`)

const escalationStats = { candidates: escalationCandidates.length, escalated: 0, confirmedExclusion: 0, disputed: 0, skipped: {}, cap: ESCALATION_CAP }
if (toEscalate.length) {
  const results = await parallel(toEscalate.map(c => async () => {
    try {
      return await agent(escalationPrompt(c, c.rawVotes), w({ label: `escalate:${c.id}`, phase: 'Verify', schema: ESCALATION_SCHEMA }))
    } catch (e) {
      // `budget`/сбой бросает — без catch claim исчез бы из ledger вместе с оплаченными голосами
      return { claimId: c.id, status: /budget/i.test(String(e && e.message)) ? 'budget' : 'timeout', confirmsExclusion: false, verdictSuggested: 'UNCHECKED', reasoning: String(e && e.message || e), urls: [], liveSearchEvents: 0 }
    }
  }))
  toEscalate.forEach((c, i) => {
    const r = results[i]
    if (!r || r.status !== 'ok') {
      c.escalationSkipped = (r && r.status) || 'invalid-output'
      c.escalation = r || null
      return // исключение по одному голосу как в v2 + флаг
    }
    escalationStats.escalated++
    c.escalation = r
    c.votes = [...c.votes, `codex:${r.verdictSuggested}`]
    if (r.confirmsExclusion) {
      c.verdict = r.verdictSuggested === 'OUTDATED' || c.verdict === 'OUTDATED' ? 'OUTDATED' : 'CHALLENGED'
      escalationStats.confirmedExclusion++
    } else {
      // Агрегат JS, НЕ enum верификатора: голоса разошлись, исключение не подтверждено.
      c.verdict = 'DISPUTED'
      c.credibility = Math.max(4, c.credibility || 4)
      escalationStats.disputed++
    }
  })
}
for (const c of claimLedger) {
  if (c.escalationSkipped) escalationStats.skipped[c.escalationSkipped] = (escalationStats.skipped[c.escalationSkipped] || 0) + 1
  delete c.needsEscalation
}

const count = v => claimLedger.filter(c => c.verdict === v).length
const confirmed = count('CONFIRMED')
const challenged = count('CHALLENGED')
const outdated = count('OUTDATED')
const unchecked = count('UNCHECKED')
const disputed = count('DISPUTED')
const confirmedSplit = claimLedger.filter(c => c.verdict === 'CONFIRMED' && c.voteCount === 1).length
const weakEvidence = claimLedger.filter(c => c.weakEvidence).length
const evidencelessN = claimLedger.filter(c => c.evidenceless).length
const credVals = claimLedger.filter(c => c.verdict !== 'UNCHECKED' && c.verdict !== 'UNVERIFIED').map(c => c.credibility).sort((a, b) => a - b)
const credibilityMedian = credVals.length ? (credVals.length % 2 ? credVals[(credVals.length - 1) / 2] : (credVals[credVals.length / 2 - 1] + credVals[credVals.length / 2]) / 2) : null
const ceilingCappedN = claimLedger.filter(c => c.ceilingCapped).length
const ledgerSummary = { total: claimLedger.length, confirmed, confirmedSplit, challenged, outdated, unchecked, disputed, escalated: escalationStats.escalated, escalationSkipped: Object.values(escalationStats.skipped).reduce((a, b) => a + b, 0), weakEvidence, evidenceless: evidencelessN, ceilingCapped: ceilingCappedN, credibilityMedian, claimsDroppedByCap }
log(`Ledger v4: CONFIRMED=${confirmed} (split: ${confirmedSplit}), DISPUTED=${disputed}, CHALLENGED=${challenged}, OUTDATED=${outdated}, UNCHECKED=${unchecked}; эскалаций ${escalationStats.escalated}, пропущено ${ledgerSummary.escalationSkipped}; weakEvidence=${weakEvidence}; ceilingCapped=${ceilingCappedN}; медиана credibility=${credibilityMedian}`)

// ═══ Phase 3 — Synthesize ═══
phase('Synthesize')

const ANALYST_FIELDS = '{reportPath,queryRu,mainConclusion,relatedCandidates,droppedClaims,disputedClaims,gaps}'
const report = FABLE_BRIDGE
  ? await agent(bridgePrompt('analyst', analystPrompt(files, claimLedger, ledgerSummary) + bridgeTail(ANALYST_FIELDS), 'Read,Write,Glob', ANALYST_FIELDS, ANALYST_SCHEMA),
      w({ label: 'analyst→fable', phase: 'Synthesize', schema: ANALYST_SCHEMA }))
  : await agent(analystPrompt(files, claimLedger, ledgerSummary), o({ label: 'analyst', phase: 'Synthesize', schema: ANALYST_SCHEMA }))

// Честный ai_model: маркер "[bridge-fallback: opus]" в mainConclusion означает,
// что синтез исполнил Opus, а не Fable — frontmatter отчёта сверяет Phase C скилла.
const bridgeFallback = FABLE_BRIDGE && /\[bridge-fallback: opus\]/.test(String(report.mainConclusion || ''))
const aiModelActual = FABLE_BRIDGE && !bridgeFallback ? AI_MODEL : 'claude-opus-5'

// Ledger наружу — без сырых голосов (rawVotes дублируют evidence/urls)
const ledgerOut = claimLedger.map(({ rawVotes, ...c }) => c)

return {
  workDir: WORK_DIR,
  status: 'ok',
  // Версия схемы ledger/вердиктов: инкрементить при смене VERIFY_SCHEMA/агрегации —
  // телеметрия сегментирует тренды confirmed по этой версии (сравнивать только внутри одной).
  // v2 (2026-08-15): UNCHECKED + вектор голосов + атомарный куратор + снапшоты.
  // v3 (2026-09-01): evidence-префиксы curator + urlhealth + линза W2 + эскалация Codex +
  //   DISPUTED + numberVerbatim + кап 16 claims + снапшот-гейт кодом.
  // v4 (2026-09-05): пер-цитатный снапшот-гейт (no-snapshot / llm-mediated / short-snapshot /
  //   quote-not-found → потолок MEDIUM), ceilingCapped, snapshotChars в evidence, snapshotGate.
  ledgerSchemaVersion: 4,
  channelsAnswered: channelResults.length,
  channelsSelected: SELECTED,
  channelStatus,
  failedChannels,
  aiModelActual,
  answeredFamilies,
  timing: channelResults.map(r => ({ channel: r.channelKey, startedAt: r.startedAt || null, finishedAt: r.finishedAt || null })),
  files,
  claimLedger: ledgerOut,
  evidenceHealth,
  urlhealthSummary,
  snapshotGate: {
    minChars: MIN_SNAPSHOT_CHARS,
    llmMediatedChannels: [...LLM_MEDIATED_CHANNELS],
    demotedTotal: Object.values(demotedBy).reduce((n, d) => n + sumDemoted(d), 0),
    byReason: Object.values(demotedBy).reduce((acc, d) => { for (const k of Object.keys(d)) acc[k] = (acc[k] || 0) + d[k]; return acc }, { noSnapshot: 0, shortSnapshot: 0, llmMediated: 0, quoteNotFound: 0 }),
    byChannel: demotedBy,
    ceilingCapped: claimLedger.filter(c => c.ceilingCapped).length,
  },
  escalationStats,
  reportPath: report.reportPath || `${WORK_DIR}/report.md`,
  queryRu: report.queryRu,
  relatedCandidates: report.relatedCandidates || [],
  synthMeta: {
    mainConclusion: report.mainConclusion,
    droppedClaims: report.droppedClaims || [],
    disputedClaims: report.disputedClaims || [],
    gaps: report.gaps || [],
    ledgerSummary,
  },
}
