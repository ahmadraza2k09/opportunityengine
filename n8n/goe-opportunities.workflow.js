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
        // Tavily max query = 400 chars. Keep prefix+countries+profile_snippet well under that.
        '={{ JSON.stringify({ api_key: "tvly-dev-REDACTED-PUT-IN-N8N-OR-ENV", query: ("scholarships fellowships internships grants for " + ($json.body.degree || "") + " in " + (($json.body.countries || []).join(", ")) + " " + ($json.body.profile || "").slice(0, 120) + " 2026"), search_depth: "advanced", max_results: 10, include_answer: false }) }}',
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

// 5) AI Agent (Gemini) — assesses profile strength, then picks calibrated
//    opportunities from search results. Returns strict JSON (no structured-output
//    parser: avoids the n8n Gemini "reading 'parts'" bug). Frontend parses.
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
          'You are an expert scholarship advisor. Follow these four steps exactly.\\n\\nSTEP 1 — ASSESS PROFILE STRENGTH\\nRead the student profile carefully and score it 0–100:\\n- Academic record: GPA/CGPA, grades (up to 30 pts)\\n- Language proficiency: IELTS/TOEFL/Duolingo scores (up to 15 pts)\\n- Test scores: GRE/GMAT/SAT etc. (up to 10 pts)\\n- Research/publications/projects (up to 15 pts)\\n- Work/internship experience (up to 10 pts)\\n- Awards, extracurriculars, leadership (up to 10 pts)\\n- Clarity of goals and motivation (up to 10 pts)\\nIf a detail is missing, assume average for that category.\\n\\nSTEP 2 — CALIBRATE OPPORTUNITY LEVEL TO PROFILE\\nBased on the profile score:\\n- Score 75–100 (Strong): Include highly competitive, prestigious programs (e.g. Fulbright, Gates Cambridge, Rhodes, DAAD). These students can realistically compete for top scholarships.\\n- Score 50–74 (Moderate): Focus on mid-tier university scholarships, country-specific grants, and programs with flexible eligibility. Avoid suggesting ultra-competitive programs they are unlikely to win.\\n- Score 0–49 (Developing): Suggest accessible opportunities — smaller grants, regional programs, foundation scholarships with lower bars, and development-focused programs. Do NOT suggest Fulbright or similarly competitive programs.\\n\\nSTEP 3 — SELECT FROM WEB SEARCH RESULTS\\nFrom the WEB SEARCH RESULTS ONLY, pick opportunities that match the student\'s level and target countries. Never invent opportunities, URLs, or facts not in the results.\\n\\nSTEP 4 — SET MATCH SCORE (0–100)\\nFor each opportunity, set "match" as how well the student fits that specific opportunity:\\n- 85–100: Student clearly meets requirements, very strong chance\\n- 65–84: Student meets most requirements, good chance with strong application\\n- 45–64: Student meets basic requirements, competitive but possible\\n- Below 45: Stretch opportunity, include only if genuinely worth trying\\n\\nThe "why" field must explain specifically: what in THIS student\'s profile makes them a fit (or a stretch) for THIS opportunity.\\n\\n"type" must be exactly one of: Scholarship, Fellowship, Internship, Grant, Exchange, Conference, Research, Competition.\\n\\nReturn ONLY a raw JSON object (no markdown, no fences) of EXACTLY this shape:\\n{"opportunities":[{"title":"","org":"","type":"","country":"","deadline":"","funding":"","match":85,"tags":["",""],"url":"","why":""}]}\\n\\nInclude 5–8 opportunities. Quality and fit matter more than quantity.',
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
