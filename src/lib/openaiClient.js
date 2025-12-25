const OpenAI = require('openai');

let client = null;
function getClient(){
  if(client) return client;
  const key = process.env.OPENAI_API_KEY;
  if(!key) return null;
  client = new OpenAI({ apiKey: key });
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

  const resp = await openai.chat.completions.create({ model, messages, max_tokens });
  const text = resp?.choices?.[0]?.message?.content || resp?.choices?.[0]?.delta?.content || '';
  return text;
}

module.exports = { summarizeWithOpenAI };
