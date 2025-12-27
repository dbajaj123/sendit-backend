const { GoogleGenerativeAI } = require('@google/generative-ai');

let client = null;
function getClient(){
  if(client) return client;
  const key = process.env.GEMINI_API_KEY;
  if(!key) return null;
  client = new GoogleGenerativeAI(key);
  return client;
}

async function summarizeWithOpenAI(prompt, options={}){
  const genAI = getClient();
  if(!genAI) throw new Error('GEMINI_API_KEY not configured');
  
  const model = options.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const maxTokens = options.max_tokens || 800;

  const systemInstruction = 'You are a helpful assistant that summarizes customer feedback into concise reports with trends and suggested actions. Output JSON only.';
  const fullPrompt = `${systemInstruction}\n\n${prompt}`;

  const generativeModel = genAI.getGenerativeModel({ 
    model,
    generationConfig: {
      maxOutputTokens: maxTokens,
    }
  });

  const result = await generativeModel.generateContent(fullPrompt);
  const response = await result.response;
  const text = response.text();
  
  return text;
}

module.exports = { summarizeWithOpenAI };
