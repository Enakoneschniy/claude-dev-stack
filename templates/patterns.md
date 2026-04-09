# Shared Patterns & Snippets

Паттерны и решения, применимые ко всем проектам. Claude Code обращается сюда когда встречает похожую задачу.

## Docker / DevContainer

```yaml
# Базовый setup для Claude Code + ttyd + tmux
# (добавить свою текущую конфигурацию)
```

## MCP Configurations

### Playwright
```json
{
  "mcpServers": {
    "playwright": {
      // текущий конфиг
    }
  }
}
```

### GitLab
```json
{
  // текущий конфиг
}
```

### Webflow
```json
{
  // текущий конфиг
}
```

## AI Content Pipeline Pattern

Общий паттерн для контент-порталов (crypto, ai-news):

1. AI генерация → structured prompt
2. Telegram bot → editorial review (approve/reject/edit)
3. Payload CMS → publish
4. SEO post-processing (hreflang, meta, sitemap)

## Common Mistakes to Avoid

- (добавлять по мере обнаружения: баги, антипаттерны, грабли)

## Useful Prompts for Claude Code

### Начало работы над фичей
```
Прочитай context.md и последние 3 session logs. 
Я хочу реализовать [фича]. 
Предложи план, учитывая текущую архитектуру.
```

### Code review
```
Посмотри изменения в git diff. 
Проверь на соответствие конвенциям из context.md.
Есть ли potential issues?
```

### Завершение сессии
```
Создай session log за сегодня. 
Обнови context.md если нужно.
```
