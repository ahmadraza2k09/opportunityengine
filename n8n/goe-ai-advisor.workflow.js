import { workflow, trigger, node, languageModel, newCredential } from '@n8n/workflow-sdk';

// 1) Webhook trigger — the browser chat POSTs { message, history } here.
const chatWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Chat Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'goe-chat',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' },
    },
    position: [240, 300],
  },
  output: [{ body: { message: 'Hello', history: [] } }],
});

// 2) Google Gemini chat model (free tier; API key lives in the n8n credential).
const geminiModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.1,
  config: {
    name: 'Gemini Chat Model',
    parameters: {
      modelName: 'models/gemini-2.5-flash',
      options: { temperature: 0.4, maxOutputTokens: 1024 },
    },
    credentials: { googlePalmApi: newCredential('Google Gemini') },
    position: [340, 520],
  },
});

// 3) AI Agent — advisor persona. Conversation history is folded into the prompt
//    so context is preserved across stateless webhook calls.
const aiAdvisor = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'AI Advisor',
    parameters: {
      promptType: 'define',
      text: "={{ (($json.body.history || []).map(m => (m.role === 'assistant' ? 'Advisor' : 'User') + ': ' + m.content).join('\\n')) + (($json.body.history || []).length ? '\\n' : '') + 'User: ' + $json.body.message }}",
      options: {
        systemMessage:
          'You are the AI advisor for the Global Opportunity Engine, a platform that helps students discover global scholarships, fellowships, internships, grants, exchange programs, and similar opportunities. Give concise, practical, encouraging guidance about opportunities, eligibility, application strategy, deadlines, and step-by-step roadmaps. Ask a clarifying question when the user profile is unclear. If a question is unrelated to education or opportunities, gently steer back. Keep answers focused and easy to read.',
      },
    },
    subnodes: { model: geminiModel },
    position: [620, 300],
  },
  output: [{ output: 'AI response text' }],
});

// 4) Respond to Webhook — return the agent answer as JSON { output: "..." }.
const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond to Chat',
    parameters: {
      respondWith: 'json',
      responseBody: '={{ { "output": $json.output } }}',
      options: { enableStreaming: false },
    },
    position: [900, 300],
  },
});

export default workflow('goe-ai-advisor', 'GOE AI Advisor')
  .add(chatWebhook)
  .to(aiAdvisor)
  .to(respond);
