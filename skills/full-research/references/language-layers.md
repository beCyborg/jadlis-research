# Language layers — native-term dictionary and platform map

Source: the source-pool plan «Реестр источников» (2026-09-03) and the tool audit 2026-09.
Mandatory Read for the web / codexweb / grokweb channels and for the ja / zh / ko / eu
channels whenever `languages` contains anything beyond ru/en. A query on the wrong term
kills the whole layer: translators, course sellers and content farms answer it, practitioners
do not.

## Rule: query each platform in its own language

| Platform | Language | Example |
|---|---|---|
| zhihu.com, v2ex.com, juejin.cn | zh | `site:zhihu.com 独立开发者 收入` |
| qiita.com, zenn.dev, note.com, b.hatena.ne.jp | ja | `個人開発 収益 報告` |
| tistory.com, velog.io, disquiet.io | ko | `1인 개발자 수익 공개` |
| wykop.pl | pl | `site:wykop.pl własny produkt przychody` |
| dou.ua | uk | `dou.ua власний продукт дохід` |
| golem.de, heise.de | de | `Indie-Entwickler Einnahmen` |
| xataka.com, meneame.net | es | `desarrollador independiente ingresos` |
| Brave / Exa on a regional topic | that region's language | Brave returns CJK pages only when the query is CJK |

English on a non-English platform → translators and schools; the platform's own term → practitioners.

## Dictionary: the term decides the layer

- **Russian.** «MRR» does not work (fandoms, music, crypto): use «выручка», «заработал»,
  «рублей в месяц», payment-provider names (ЮKassa, Тинькофф, Продамус, Stripe), «инди хакер»
  in strict mode. «Build in public» in Telegram = course spam, do not use.
- **Japanese.** Living term `個人開発`; `インディーハッカー` is written by translators and schools.
  Useful pairs: `個人開発 収益`, `個人開発 売上 報告`, `月間売上`. Kana-free queries are kanji
  only — the language detector distinguishes shinjitai (`発 開 売`) from simplified (`发 开 卖`).
- **Chinese.** `独立开发者`; `月入3万` and `副业赚钱` lead to content farms. On V2EX the
  independent-development node requires a write-up with numbers, not a link.
- **Korean.** `1인 개발자`; `인디해커` is a calque. First person lives in tistory blogs under the
  income-disclosure tag; Brunch mostly translates English cases.
- **Polish.** `własny produkt`, `przychody`, `bootstrapping` (borrowed), `pasywny dochód` = spam.
- **Ukrainian.** `власний продукт`, `дохід`, `індіхакер` — DOU threads and the DOU podcast.
- **German.** `Indie-Entwickler`, `Einnahmen`, `Nebenprojekt`; heise/Golem comment sections are the community layer.
- **Spanish.** `desarrollador independiente`, `ingresos`, `proyecto paralelo`; Menéame karma threads.

## Platform channels (trigger-scoped, never in the default set)

| Layer | Channel key | Fetcher | Notes |
|---|---|---|---|
| Japan: Qiita API v2, Hatena Bookmark search RSS, Zenn topic feeds, note.com per-author RSS | `ja` | `scripts/feed-fetch.py` | Qiita 60 req/h per IP; Hatena search RSS follows a 301 and paginates with `page=` only |
| China: V2EX node Atom feeds (`/feed/create.xml`), Juejin (trial, manual cap, Brave fallback), Zhihu via Brave in Chinese | `zh` | `scripts/feed-fetch.py` + Brave | No Apify workaround; XHS / Weibo / Bilibili are not connected |
| Korea: tistory, Velog (`v2.velog.io/rss/@user`), Disquiet (search target only) | `ko` | `scripts/feed-fetch.py` | Naver — after the owner registers a Client ID |
| EU: DOU (label UA), Golem (adopt), heise (robots decision pending), Xataka (filler), Menéame API + RSS (silent 403), Wykop (after dev.wykop.pl registration) | `eu` | `scripts/feed-fetch.py` + Brave | ClaudeBot / Content-Signal rule below |
| Cross: Stack Exchange API v2.3 keyless (300/day, `backoff` field, ≤30 req/s), Mastodon tag timelines | any | `scripts/feed-fetch.py` | Bluesky is replaced by Mastodon |

## ClaudeBot-block / Content-Signal rule (heise, Golem, Menéame, Disquiet)

Read the feed or API, quote the search-engine result, never crawl the article body. Check
robots.txt on a typical content page, not on the front page. A site that blocks ClaudeBot is
cited from the feed excerpt with `Extractor: feed-fetch` and relevance MEDIUM at most.

## How to tell a primary source from a farm

- **Telegram:** author's name in the channel title · pinned link to their own product · numbers
  with screenshots, not «my student earned».
- **Blogs / feeds:** monthly reports with a revenue figure and a product link; posting cadence
  across ≥6 months; comments answered by the author.
- **Farms:** «top-10 tools», affiliate links in every post, no first person, no numbers.

## Always-on gate

A source moves from trigger-scoped into the default channel set only after a leave-one-out check
by the 2026-08 criterion: ≥1 CONFIRMED claim per run attributable to that source.
