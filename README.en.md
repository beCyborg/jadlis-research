English · [Русский](README.md)

# The answer sounds equally confident where there is a source and where there is none

Key claims are cross-checked and the unverified ones are flagged — 14 channels run separately, every
quote has a snapshot of its page underneath, and the report sits as a file in your notes, not in a
chat.

```
claude plugin marketplace add https://github.com/beCyborg/jadlis-hub
claude plugin install jadlis-search@jadlis --config BRAVE_API_KEY=... --config FIRECRAWL_API_KEY=...
claude plugin install jadlis-research@jadlis
```

The keys are set up once, here: `jadlis-search` goes in first and straight away with its keys.
Install `jadlis-research` first and `jadlis-search` comes along in tow, never asks you for keys, and the first run stalls
before it starts.

![A report with a claim ledger: every claim has its source, and some lines are marked UNCHECKED](docs/img/hero-jadlis-research.webp)

In words: a page of the report — under every key claim its source, with unverified lines marked
UNCHECKED; that is your re-read list.

This is my workbench published as it is, not a product: whatever I stopped using, I removed.

## Before → after

| By hand | With an AI chat | With this plugin |
|---|---|---|
| **Where a claim came from.** You read tabs one after another and decide by whichever is open last. | The tone is equally confident where there is a source and where there is none. | Key claims are cross-checked and the unverified ones are marked UNCHECKED — you can see what to re-read yourself. |
| **Coverage.** You work one channel and give up when your patience runs out. | Whatever slice made it into the results — and you cannot see what is missing from it. | 14 channels per run: three web sources, forums, microblogs, developer news, newsletters, video, channels, the ja/zh/ko/eu language layers. |
| **A disagreement between sources.** Visible only if both tabs are still open. | Smoothed into a single tidy paragraph, and the disagreement disappears. | A divergence between channels shows up in the report itself, not off-screen. |
| **A month later.** The tab is closed, the link is dead, and a decision rests on that claim. | The chat has scrolled away. | A claim ledger and a snapshot of the page under every quote. |
| **Where the result lives.** Tabs, screenshots and notes — all in different places. | In the chat, until the next session. | The report sits as a file in your notes and turns up in a search across the base. |

One question you are about to ask: have I measured this myself. I have, once and on myself. A
measurement of my own pipeline, 2026-08-18: 94 reports, 754 key claims cross-checked, 280 (37.1%)
filtered out; the median filtered out per report is 3, reports with nothing filtered out — 7. How it
was counted: up to 16 key claims are picked per report, and unverified ones are marked UNCHECKED.
This is a self-measurement of my own pipeline, without a control group or external verification.

## How it works

![The channels run separately, claims go into the ledger, key ones look for a second source, the report lands as a file](docs/img/how-jadlis-research.webp)

Going in — one question.
Inside — 14 channels work separately, so a divergence between them shows instead of being averaged
away; claims go into the ledger, a snapshot of the page is taken under every quote, and key claims
look for a second source in a different channel.
Coming out — a report as a file in your notes, where anything unverified is marked UNCHECKED.

In words: question → 14 channels separately → a claim ledger with page snapshots → cross-checking the
key claims and marking the rest UNCHECKED → the report as a file in your notes.

<details>
<summary>If people did this · How it differs from Perplexity, ChatGPT Deep Research and Grok · An example</summary>

### If people did this

| Role | How many people | What the plugin does here |
|---|---|---|
| Channel searcher | one person per channel: web, forums, microblogs, developer news, newsletters, video, channels, Japanese, Chinese, Korean, European languages | works 14 channels separately in a single run |
| Quote checker | a separate person who opens every link and saves the page | puts a snapshot of the page under every quote |
| Reconciler | a separate person who finds a second source for a key claim and flags what is disputed | cross-checks key claims and marks the unverified ones UNCHECKED |
| Editor | a separate person who assembles it into a readable document | puts the report as a file into your notes |

Nothing is said about money here, deliberately: I have not collected sources on what this kind of
work costs.

### How it differs from Perplexity, ChatGPT Deep Research and Grok

A comparison of mechanisms only — not of who deserves your trust.

| Mechanism | This plugin | Perplexity | ChatGPT Deep Research | Grok |
|---|---|---|---|---|
| Is the source visible under every key claim | yes, in the ledger, plus a page snapshot | yes, numbered citations in the answer | yes, citations or links in every report | partly: inline citations are not guaranteed |
| Is a second source sought for a key claim | yes, cross-checked, across channels | partly: cross-reference is claimed, there is no two-source rule | not documented | partly: cross-reference of findings, the mode is in beta |
| Is what could not be confirmed marked | yes, with an UNCHECKED flag | not documented | no: OpenAI writes itself about weak confidence calibration | not documented |
| Does the ledger survive the run | yes, as a file in your notes | partly: a report with citations comes out as a file, but it is not a ledger | partly: a "sources" section and a run history | partly: a list of links in the API answer, no file |

The plugin column was checked on 2026-09-07. The three other columns were assembled the same day
from official documentation: [Model Council](https://www.perplexity.ai/hub/blog/introducing-model-council)
and [the Perplexity help centre](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research),
[the OpenAI Deep Research help page](https://help.openai.com/en/articles/10500283-deep-research-faq),
[docs.x.ai](https://docs.x.ai/developers/model-capabilities/text/multi-agent). "Not documented" means
exactly that, and not "no". "No" stands in one cell only: in its limitations section OpenAI writes
itself that it conveys uncertainty poorly.

### An example

You are deciding whether to take a particular supplement that your feed writes about confidently and
identically. The run splits the question across channels that work separately: reviews on the web,
discussions on forums, breakdowns in video, the non-English layers. Claims of the "helps with such and
such a condition" and "this is how people take it" kind go into the ledger: some have a source and a
page snapshot under the line, and the agreement came from different channels; others stay with an
UNCHECKED flag — they were not thrown out, they were shown to you as what you need to re-read
yourself. The report stays as a file in your notes, and a month later you can see not only the
conclusion but where it came from.

</details>

## Installing and the first run

**a) Text to paste to an agent.** Copy the whole thing into a Claude Code chat:

```
You are the installer. Install the plugin jadlis-research from the jadlis marketplace on this Mac.
First check that Claude Code is installed and the subscription is active; if not, stop and say so.
Then run exactly these commands, verbatim, shortening nothing:
1. claude plugin marketplace add https://github.com/beCyborg/jadlis-hub
2. claude plugin install jadlis-search@jadlis --config BRAVE_API_KEY=... --config FIRECRAWL_API_KEY=...
   I will paste the Brave and Firecrawl keys into the command myself. Never print key values back.
3. claude plugin install jadlis-research@jadlis
4. claude plugin list — show me the lines about jadlis-search and jadlis-research with their versions.
Do not change the order: jadlis-search goes in first and with its keys. If jadlis-research pulls it in itself,
it will not ask for keys, and the first run will stall.
Before each command show it to me in full and wait for "yes". If I say "no", do not run it.
If a command returns an error, stop, show me the output, and do not move to the next one.
```

**b) Commands by hand.**

```
claude plugin marketplace add https://github.com/beCyborg/jadlis-hub
claude plugin install jadlis-search@jadlis --config BRAVE_API_KEY=... --config FIRECRAWL_API_KEY=...
claude plugin install jadlis-research@jadlis
claude plugin list
```

The first command installs nothing — it adds the marketplace. If `jadlis-search` is already installed
without keys, remove it and install it again with the `--config` line:
`claude plugin uninstall jadlis-search@jadlis --keep-data`.

**c) The short command.** Open Claude Code in the folder you work in and type:

```
/research <your question in one phrase>
```

If it is not found, check the name with `claude plugin list`. Make the first run a question you
actually need answered: the run is heavy, and it is not kept in the background.

## Limits, cost, updating

**What it does not do.** It does not decide for you: the report is grounds for a decision, not the
decision. It does not replace a specialist where health, money or law are involved. It does not
promise completeness: there are 14 channels, not every channel there is. An UNCHECKED flag does not
mean "wrong" — it means "not confirmed by cross-checking, re-read it yourself". Without keys it does
not start.

**What you need.** A Claude Code subscription. The paid Brave and Firecrawl keys — they are set up
together with the `jadlis-search` plugin, and without them a run does not go. Brave and Firecrawl are the
ones who bill you, so check their pricing with them: I name no figures of my own. The report is put
into the notes folder you specify at install time — that is `VAULT_PATH`, `~/Jadlis` by default.

**How tokens get spent.** A heavy run — dozens of subagents out of your own quota; several runs back
to back do not fit into one window. It is heavy for exactly the reason that the channels run
separately and every key claim is sent looking for a second source: the run can only be lightened
together with the cross-checking. Plan it as its own task for a session, not as a quick question on
the side. What it costs in money I have not measured and will not name a figure.

**Verified where I work:** my Mac, my subscription, my keys. I have not tested it on anyone else's
machine — if it did not install for you, open an issue in the repository.

**Terms of use.** There is no license: all rights reserved by the author. You may read it and use it
personally. Commercial use, republishing and bundling it into your own products — by arrangement
with me.

**Updating.** With a third-party marketplace, auto-update is off on your side: until you run the
first command you keep the version you installed.

```
claude plugin marketplace update jadlis
claude plugin update jadlis-research@jadlis
claude plugin list
```

Reinstall, if something ended up crooked:

```
claude plugin uninstall jadlis-research@jadlis --keep-data && claude plugin install jadlis-research@jadlis
```
