const { GoogleGenerativeAI } = require('@google/generative-ai');

let client = null;
function getClient(){
  if(client) return client;

  // 1. Get the key string
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_JSON;

  // (Optional) JSON Service Account logic... 
  // If you are using a standard AI Studio key (starts with AIza), you don't need the JSON logic.
  
  console.log("Debug Key:", key); // Ensure this prints the "AIza..." string

  if(key){
    // 2. PASS THE STRING DIRECTLY. Do not wrap it in an object.
    client = new GoogleGenerativeAI(key);
    return client;
  }

  return null;
}

async function summarizeWithOpenAI(prompt, options={}){
  console.log(process.env.GEMINI_API_KEY);
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
