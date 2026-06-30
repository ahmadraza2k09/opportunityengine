import { workflow, trigger, node, languageModel, newCredential } from '@n8n/workflow-sdk';

// 1) Webhook — frontend POSTs { profile, countries, degree }
const oppWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Opp Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'goe-opportunities',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' },
    },
    position: [220, 300],
  },
  output: [{ body: { profile: 'CS student...', countries: ['United States'], degree: "Master's Degree" } }],
});

// 2) Tavily web search — grounds the result set in real, current pages.
const tavilySearch = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Tavily Search',
    parameters: {
      method: 'POST',
      url: 'https://api.tavily.com/search',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody:
        '={{ JSON.stringify({ api_key: "tvly-dev-REDACTED-PUT-IN-N8N-OR-ENV", query: ("scholarships fellowships internships grants exchange programs for " + ($json.body.degree || "") + " in " + (($json.body.countries || []).join(", ")) + " for student: " + ($json.body.profile || "").slice(0, 350) + " 2025 2026 eligibility application deadline official site"), search_depth: "advanced", max_results: 8, include_answer: false }) }}',
    },
    position: [460, 300],
  },
  output: [{ results: [{ title: 'Fulbright', url: 'https://...', content: '...' }] }],
});

// 3) Gemini model (free tier) — credential created by the user in n8n.
const gemini = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.1,
  config: {
    name: 'Gemini Model',
    parameters: { modelName: 'models/gemini-2.5-flash', options: { temperature: 0.3, maxOutputTokens: 2048 } },
    credentials: { googlePalmApi: newCredential('Google Gemini') },
    position: [560, 540],
  },
});

// 5) AI Agent (Gemini) — builds opportunities ONLY from the search results.
//    Returns strict JSON text (no structured-output parser: avoids the n8n
//    Gemini "reading 'parts'" function-calling bug). Frontend parses the JSON.
const oppFinder = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Opportunity Finder',
    parameters: {
      promptType: 'define',
      text:
        '={{ "STUDENT PROFILE:\\n" + ($(\'Opp Webhook\').item.json.body.profile || "") + "\\n\\nTARGET COUNTRIES: " + (($(\'Opp Webhook\').item.json.body.countries || []).join(", ")) + "\\nTARGET DEGREE: " + ($(\'Opp Webhook\').item.json.body.degree || "") + "\\n\\nWEB SEARCH RESULTS (your ONLY source of truth):\\n" + JSON.stringify(($json.results || []).map(r => ({ title: r.title, url: r.url, content: (r.content || "").slice(0, 600) }))) }}',
      options: {
        systemMessage:
          'You are an opportunity finder for students. Using ONLY the provided web search results as your source of truth, identify real, currently-relevant opportunities (scholarships, fellowships, internships, grants, exchange programs, competitions) matching the student profile, target countries, and degree. Use the real official URL from the search results. If a deadline is not present, set "deadline" to "Check official site". Assign "match" (0-100) by fit. Never invent opportunities, URLs, or facts not supported by the results. "type" must be one of: Scholarship, Fellowship, Internship, Grant, Exchange, Conference, Research, Competition.\\n\\nReturn ONLY a raw JSON object (no markdown fences, no commentary) of EXACTLY this shape:\\n{"opportunities":[{"title":"","org":"","type":"","country":"","deadline":"","funding":"","match":0,"tags":["",""],"url":"","why":""}]}\\nInclude 6 to 8 items, highest match first.',
      },
    },
    subnodes: { model: gemini },
    position: [720, 300],
  },
  output: [{ output: '{"opportunities":[]}' }],
});

// 6) Respond — return the agent's JSON text (frontend parses it).
const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Opps',
    parameters: {
      respondWith: 'text',
      responseBody: '={{ $json.output }}',
      options: { enableStreaming: false },
    },
    position: [1000, 300],
  },
});

export default workflow('goe-opportunities', 'GOE Opportunity Finder')
  .add(oppWebhook)
  .to(tavilySearch)
  .to(oppFinder)
  .to(respond);
