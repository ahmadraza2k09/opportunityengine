# Global Opportunity Engine — n8n workflows

Two agentic backends. The browser never sees any API key — it only calls n8n
webhooks; n8n holds the Gemini + Tavily keys as credentials/inline and runs the
AI. Both use **Google Gemini (`models/gemini-2.5-flash`, free tier)**.

## 1. Chat advisor — `goe-ai-advisor.workflow.js`

```
Browser chat ──POST {message, history}──▶ Webhook (/goe-chat)
                                             └▶ AI Agent (Gemini) ─▶ Respond { output }
```
- Workflow id: `0qjCBY6xdJ2rjDuF` · webhook: `/webhook/goe-chat`
- Frontend env: `VITE_CHAT_WEBHOOK_URL`

## 2. Opportunity finder — `goe-opportunities.workflow.js`

```
Browser ──POST {profile, countries, degree}──▶ Webhook (/goe-opportunities)
                                                  └▶ Tavily web search (HTTP, search_depth: advanced)
                                                       └▶ AI Agent (Gemini) — builds opportunities
                                                          ONLY from the search results (grounded)
                                                            └▶ Respond (JSON text the frontend parses)
```
- Workflow id: `rtSs20wXandDsf0E` · webhook: `/webhook/goe-opportunities`
- Frontend env: `VITE_OPPORTUNITIES_WEBHOOK_URL`
- Returns: `{ "opportunities": [ { title, org, type, country, deadline, funding, match, tags[], url, why } ] }`
- The agent is instructed to use ONLY the live Tavily results as its source of
  truth and to use the real official `url` from those results — this is what
  keeps the opportunities real and current rather than hallucinated.

## Credentials (created in the n8n UI — not in this repo)

- **Google Gemini(PaLM) Api** — used by both workflows' Gemini model nodes.
- **Tavily** — the API key is sent inline by the `Tavily Search` HTTP node. In
  this repo copy it is **redacted** (`tvly-dev-REDACTED-...`); the live workflow
  on n8n holds the real key. Prefer moving it to a Header Auth credential.

## Notes

- No structured-output parser: the n8n Gemini node throws `reading 'parts'` when
  combined with the structured/function-calling parser, so the agent returns
  strict JSON text and the frontend parses it (`parseOpportunitiesText`).
- Model `maxOutputTokens` is capped (1024–2048) for speed/cost.
- Webhooks are public (CORS `*`). For production add a shared-secret header check
  and restrict `allowedOrigins` to the real site domain.

## Redeploy (n8n MCP)

Edit the `.workflow.js`, then: `validate_workflow` → `update_workflow {workflowId, code}` → `publish_workflow {workflowId}`.
