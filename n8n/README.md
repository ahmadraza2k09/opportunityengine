# GOE AI Advisor — n8n workflow

The agentic backend for the dashboard chatbot. The browser never sees the
OpenRouter API key — it only calls the n8n webhook; n8n holds the key as a
credential and runs the AI agent.

## Flow

```
Browser chat  ──POST {message, history}──▶  Webhook (/goe-chat)
                                               │
                                               ▼
                                          AI Agent (advisor persona)
                                               │  uses
                                               ▼
                                     OpenRouter Chat Model (openai/gpt-4o)
                                               │
                                               ▼
                                     Respond to Webhook  ──▶  { "output": "..." }
```

## Deployment

- **n8n workflow:** `GOE AI Advisor` — https://n8n.seemaai.co.uk/workflow/0qjCBY6xdJ2rjDuF
- **Production webhook:** `https://n8n.seemaai.co.uk/webhook/goe-chat`
- **Frontend wiring:** `VITE_CHAT_WEBHOOK_URL` in `.env` (see `.env.example`)
- **Model:** `openai/gpt-4o`, `maxTokens: 800` (cap keeps each request within the
  OpenRouter balance — the affordability check is `prompt + maxTokens` priced at
  the model rate). Lower the model to `openai/gpt-4o-mini` if credits run low.

## Files

| File | Purpose |
|------|---------|
| `goe-ai-advisor.workflow.js` | Source of truth — n8n Workflow SDK code. Edit this, then redeploy. |
| `goe-ai-advisor.export.json` | Read-only export of the live workflow (backup / portability). |

## Redeploy (via the n8n MCP server)

The workflow is built and managed through the n8n MCP server (`n8n-mcp` in
`.mcp.json`). To apply changes to `goe-ai-advisor.workflow.js`:

1. `validate_workflow` with the code
2. `update_workflow` with `workflowId: 0qjCBY6xdJ2rjDuF` and the code
3. `publish_workflow` with the same `workflowId`

## Notes / TODO

- The webhook is currently public (CORS `*`, no auth). Anyone with the URL can
  call it and consume OpenRouter credits. For production, add a shared-secret
  header check inside n8n and restrict `allowedOrigins` to the real site domain.
- The OpenRouter API key lives in the n8n credential **"OpenRouter account"**,
  not in this repo or the frontend.
- Conversation context is preserved by folding `history` into the agent prompt
  (stateless). A dedicated memory node + session id would be a cleaner upgrade.
