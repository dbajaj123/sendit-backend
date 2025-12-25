const { Configuration, OpenAIApi } = require('openai');

let client = null;
function getClient(){
  if(client) return client;
  const key = process.env.OPENAI_API_KEY;
  if(!key) return null;
  const configuration = new Configuration({ apiKey: key });
  client = new OpenAIApi(configuration);
  return client;
}

async function summarizeWithOpenAI(prompt, options={}){
  const openai = getClient();
  if(!openai) throw new Error('OPENAI_API_KEY not configured');
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
  const max_tokens = options.max_tokens || 800;

  const messages = [
    { role: 'system', content: 'You are a helpful assistant that summarizes customer feedback into concise reports with trends and suggested actions. Output JSON only.' },
    { role: 'user', content: prompt }
  ];

  const resp = await openai.createChatCompletion({ model, messages, max_tokens });
  const text = resp?.data?.choices?.[0]?.message?.content;
  return text;
}

module.exports = { summarizeWithOpenAI };
