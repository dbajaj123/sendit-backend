const { GoogleGenerativeAI } = require('@google/generative-ai');

let client = null;
function getClient(){
  if(client) return client;
  // Support multiple env var names for flexibility
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_JSON;
  // If a JSON service account is provided via env, prefer application default credentials
  if(key && key.startsWith('{')){
    // If JSON credentials are stored in env var, write to temp file and set env var for client libs
    try{
      const tmp = require('os').tmpdir() + '/gcloud_creds_' + Date.now() + '.json';
      require('fs').writeFileSync(tmp, key);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp;
    }catch(e){ /* ignore */ }
  }

  if(key){
    // instantiate with apiKey option if supported
    try{
      client = new GoogleGenerativeAI({ apiKey: key });
    }catch(e){
      // fallback to passing key directly
      client = new GoogleGenerativeAI(key);
    }
    return client;
  }

  // If GOOGLE_APPLICATION_CREDENTIALS is set, the client can pick up ADC
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    client = new GoogleGenerativeAI();
    return client;
  }

  return null;
}

async function summarizeWithOpenAI(prompt, options={}){
  const genAI = getClient();
  if(!genAI) throw new Error('GEMINI_API_KEY / GOOGLE_API_KEY / GOOGLE_APPLICATION_CREDENTIALS not configured');
  
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
