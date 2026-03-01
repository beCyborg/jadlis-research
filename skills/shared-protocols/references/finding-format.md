# Finding Format — Примеры

Подробные примеры для каждого типа finding. Все workers ОБЯЗАНЫ следовать этому формату.

## Пример 1: Tier 1, High Confidence (Academic)

```
## Finding 1
- **Claim:** Трансформерные модели превосходят LSTM на задачах машинного перевода на 4.2 BLEU
- **Evidence:** BLEU score 41.0 vs 36.8 на WMT'14 EN-DE, p < 0.01, N=3003 test pairs
- **Source:** [Vaswani et al., 2017, Attention Is All You Need, NeurIPS]
- **Confidence:** High
- **Tier:** 1
```

Почему High: рецензируемая публикация, конкретные метрики, воспроизводимые результаты.

## Пример 2: Tier 2, Medium Confidence (Industry Report)

```
## Finding 2
- **Claim:** Рынок LLM-приложений вырастет до $40.8B к 2027 году
- **Evidence:** CAGR 32.4% (2023-2027), опрос 450 enterprise компаний, 68% планируют увеличить бюджет на AI
- **Source:** [McKinsey & Company, June 2024, The State of AI in Enterprise]
- **Confidence:** Medium
- **Tier:** 2
```

Почему Medium: авторитетный источник, но прогнозные данные, возможна методологическая предвзятость.

## Пример 3: Tier 3, Low Confidence (Community)

```
## Finding 3
- **Claim:** Ollama 0.3 потребляет на 40% меньше VRAM при запуске Llama 3 8B
- **Evidence:** "Switched to 0.3 yesterday, VRAM dropped from 7.2GB to 4.3GB on my 3090" — 127 upvotes
- **Source:** [Reddit: u/ml_enthusiast, 2024-11-15, r/LocalLLaMA]
- **Confidence:** Low
- **Tier:** 3
```

Почему Low: единичный отзыв, нет контроля условий, специфичная конфигурация hardware.

## Пример 4: Противоречащие источники

```
## Finding 4
- **Claim:** Эффективность RAG vs fine-tuning для domain-specific задач остаётся спорной
- **Evidence:** Lewis et al. (2024) показали RAG +12% accuracy на медицинских Q&A; Zhang et al. (2024) показали fine-tuning +8% на юридических Q&A при том же бюджете. Различие объясняется разницей доменов и метрик
- **Source:** [Lewis et al., 2024, EMNLP] vs [Zhang et al., 2024, ACL]
- **Confidence:** Medium
- **Tier:** 1
```

Почему Medium при Tier 1: оба источника рецензируемые, но результаты противоречат друг другу — необходим дополнительный контекст для интерпретации.

## Правила валидации

Каждый finding проверяется по 5 обязательным полям:

1. **Claim** — одно конкретное утверждение (не вопрос, не предположение)
2. **Evidence** — данные, цифры, цитаты (не "по мнению автора")
3. **Source** — полная ссылка по citation format из shared-protocols
4. **Confidence** — строго `High`, `Medium` или `Low`
5. **Tier** — строго `1`, `2` или `3`

Отсутствие любого поля делает finding невалидным.
