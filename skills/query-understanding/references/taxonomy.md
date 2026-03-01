# Query Taxonomy — полные определения

## Query Types

### factual
Поиск конкретного факта, числа или ответа. Ожидается однозначный результат.

Примеры:
- "В каком году был создан Python?" → factual/tech/simple
- "Какая рыночная капитализация Apple?" → factual/business/simple
- "Что такое CRISPR?" → factual/science/simple
- "Сколько населения в Токио?" → factual/general/simple

### exploratory
Широкий обзор темы без конкретного целевого ответа. Исследование landscape.

Примеры:
- "Обзор текущего состояния квантовых вычислений" → exploratory/tech/complex
- "Как устроена система здравоохранения в Германии?" → exploratory/health/moderate
- "Что происходит в области gene therapy?" → exploratory/science/moderate

### comparative
Сравнение двух или более сущностей по определённым критериям.

Примеры:
- "React vs Vue vs Svelte для enterprise приложений" → comparative/tech/moderate
- "Сравнить подходы к лечению диабета 2 типа" → comparative/health/complex
- "PostgreSQL vs MongoDB для time-series данных" → comparative/tech/moderate

### opinion
Поиск мнений, оценок, отзывов, экспертных позиций.

Примеры:
- "Что думают разработчики о Rust в 2026?" → opinion/tech/moderate
- "Отзывы о Tesla Model Y после 2 лет владения" → opinion/general/moderate
- "Стоит ли инвестировать в AI-стартапы сейчас?" → opinion/business/complex

### trend
Временная динамика, прогнозы, развитие во времени.

Примеры:
- "Как менялась стоимость обучения LLM за последние 3 года?" → trend/tech/moderate
- "Прогноз развития renewable energy до 2030" → trend/science/deep
- "Тренды в remote work после пандемии" → trend/business/moderate

## Domains

### tech
Software, hardware, engineering, AI/ML, DevOps, инфраструктура.
**Boundary с science:** чистый ML research → science; прикладной ML/engineering → tech.
**Boundary с business:** SaaS-метрики, developer tools market → business; технические характеристики → tech.

### science
Академические исследования, medicine, biology, physics, chemistry, mathematics.
**Boundary с tech:** теоретические основы (алгоритмы, математика) → science; engineering application → tech.
**Boundary с health:** фундаментальные биомедицинские исследования → science; клиническая практика → health.

### business
Компании, markets, finance, strategy, startups, M&A.
**Boundary с tech:** "revenue Tesla" → business; "battery technology Tesla" → tech.
**Boundary с social:** корпоративная культура → social; корпоративная стратегия → business.

### health
Медицинские советы, wellness, clinical trials, диагностика, лечение.
**Boundary с science:** клинические исследования (рандомизированные, peer-reviewed) → science; практические медицинские вопросы пациентов → health.

### social
Культура, communities, events, люди, политика, образование.
**Boundary с business:** "влияние AI на рабочие места" → social; "AI market size" → business.
**Boundary с health:** общественное здоровье, эпидемиология → social; индивидуальное лечение → health.

### general
Кросс-доменный или неклассифицируемый запрос. Использовать если ≥3 доменов равнозначно представлены или запрос не вписывается ни в один конкретный домен.

### Overlap Resolution

При неоднозначной доменной принадлежности:

1. Определить **primary domain** по основной сущности вопроса
2. Записать **secondary domain** если есть значимое пересечение
3. Правило: "AI ethics" → primary: `tech`, secondary: `social`
4. Правило: "clinical AI" → primary: `science`, secondary: `tech`

## Complexity Levels

### simple
Один чёткий вопрос, один домен, ответ ожидается из 1-2 источников.

Пример: "Какая последняя версия Node.js?" — один факт, один источник.

### moderate
Составной вопрос или несколько аспектов, 2+ доменов или перспектив.

Пример: "Как PostgreSQL справляется с JSON данными по сравнению с MongoDB?" — два аспекта (features, performance), два продукта.

### complex
Множество взаимосвязанных под-вопросов, требуется экспертиза в нескольких областях.

Пример: "Оценить перспективы использования LLM в клинической диагностике" — техническая часть (модели), медицинская (клиника), регуляторная (FDA), этическая.

### deep
Требует глубокого анализа с временной динамикой, множеством перспектив и уровней детализации.

Пример: "Как изменится рынок труда для software engineers в связи с AI за следующие 5 лет?" — множество факторов, прогнозирование, разные перспективы.

### Complexity Illusions

Запросы, которые **выглядят** сложными, но на деле простые:
- "Объясни квантовую запутанность" → **simple** (один вопрос, один домен, factual)
- "История React" → **simple** (один timeline, один домен)

Запросы, которые **выглядят** простыми, но на деле сложные:
- "Стоит ли переходить на microservices?" → **complex** (зависит от контекста, масштаба, команды, инфраструктуры)
- "Лучший язык программирования" → **complex** (зависит от задачи, экосистемы, команды)

### Decision Flowchart

1. Сколько **независимых аспектов** у вопроса? → 1 = simple, 2-3 = moderate, 4+ = complex
2. Требуется ли **временной анализ**? → Да = повысить на один уровень
3. Требуются ли **разные перспективы** (stakeholders)? → Да = повысить на один уровень
4. Maximum = `deep`

## Edge Cases

### Cross-domain queries
Назначить primary domain, записать secondary. При 3+ доменах → `general` с перечислением всех в notes.

### Multi-language queries
Запрос может содержать термины на нескольких языках. Определить `language` по основному тексту. Всегда добавить English expansion.

### Implicitly comparative
"Какой фреймворк лучше для SPA?" → comparative (implicit), хотя не содержит явного "vs" или "сравнить".

### Very short queries (1-2 слова)
- "Kubernetes" → exploratory/tech/moderate (default to exploratory)
- "CRISPR" → exploratory/science/moderate
- Если контекст ясно указывает на другой type — использовать его. Иначе default: `exploratory` + `general`.
