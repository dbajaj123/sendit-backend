#!/usr/bin/env node
require('dotenv').config({ path: process.env.ENV_PATH || '.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Feedback = require('../models/Feedback');
const Business = require('../models/Business');
const { summarizeWithOpenAI } = require('../lib/openaiClient');

function parseArgs(){
  const args = {};
  for(let i=2;i<process.argv.length;i++){
    const a = process.argv[i];
    if(a.startsWith('--')){
      const key = a.substring(2);
      const val = process.argv[i+1] && !process.argv[i+1].startsWith('--') ? process.argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

async function run(){
  const args = parseArgs();
  const businessId = args.businessId || args.bid;
  if(!businessId){
    console.error('Usage: node src/scripts/generateDetailedFeedback.js --businessId <id>');
    process.exit(1);
  }

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/senditbox';
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const biz = await Business.findById(businessId).lean();
  if(!biz){
    console.error('Business not found:', businessId);
    await mongoose.disconnect();
    process.exit(1);
  }

  const items = await Feedback.find({ businessId }).sort({ createdAt:-1 }).limit(1000).lean();
  if(!items.length){
    console.log('No feedback found for business', businessId);
    await mongoose.disconnect();
    process.exit(0);
  }

  const texts = items.map(i=> (i.text || i.content || i.message || i.feedback || '') ).filter(Boolean);
  const sample = texts.join('\n\n');

  const prompt = `You are an assistant that produces concise, actionable recommendations based on customer feedback. OUTPUT STRICTLY VALID JSON ONLY and nothing else. Produce a single JSON object with the key \"recommendations\" whose value is an array of recommendation objects. Each recommendation object must include: \"advice\" (short, 1-2 sentences), \"topics\" (array of topic strings), and \"actions\" (array of 2-4 concrete action steps). DO NOT repeat identical advice across entries. DO NOT include raw customer text or examples. If you include anything else, put it AFTER the JSON and wrap it in triple backticks. The JSON must start with '{' and end with '}'.`;

  try{
    let final = [];
    let rawAiOutput = null;
    if(process.env.GEMINI_API_KEY){
      const aiText = await summarizeWithOpenAI(`${prompt}\n\nFeedback:\n${sample}`, { max_tokens: 1200 });
      rawAiOutput = aiText;
      // persist raw AI output for debugging
      try{
        const rawDir = path.join(process.cwd(), 'reports');
        if(!fs.existsSync(rawDir)) fs.mkdirSync(rawDir);
        const rawFile = path.join(rawDir, `ai_raw_${businessId}_${Date.now()}.txt`);
        fs.writeFileSync(rawFile, aiText);
        console.log('Saved raw AI output to', rawFile);
      }catch(e){ console.warn('Failed to save raw AI output', e); }
      let parsed = null;
      try{
        parsed = JSON.parse(aiText);
      }catch(e){
        console.warn('AI output was not valid JSON; attempting extraction and best-effort parsing');
        // Try to extract a JSON object from the text (handle wrappers or commentary)
        let jsonCandidate = null;
        // 1) JSON inside triple-backtick block
        let m = aiText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if(m && m[1]) jsonCandidate = m[1].trim();
        // 2) Fallback: first {...} block in the output
        if(!jsonCandidate){
          m = aiText.match(/(\{[\s\S]*\})/);
          if(m && m[1]) jsonCandidate = m[1].trim();
        }
        // 3) Last-resort: try to join lines that look like JSON-ish
        if(jsonCandidate){
          try{ parsed = JSON.parse(jsonCandidate); }
          catch(e2){
            console.warn('Extracted JSON candidate failed to parse, falling back to line-based parsing');
            jsonCandidate = null;
          }
        }
        if(!jsonCandidate){
          // Best-effort: split by lines and dedupe short sentences
          const lines = aiText.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
          const uniq = Array.from(new Set(lines));
          parsed = { recommendations: uniq.map((l,i)=>({ advice: l, topics: [], actions: [] })) };
        }
      }

      // Normalize and dedupe by advice text
      const recs = (parsed.recommendations || []).map(r=>({ advice: (r.advice||r.text||'').trim(), topics: r.topics||[], actions: r.actions||[] }));
      const dedupe = new Map();
      recs.forEach(r=>{
        if(!r.advice) return;
        if(dedupe.has(r.advice)){
          const cur = dedupe.get(r.advice);
          cur.topics = Array.from(new Set(cur.topics.concat(r.topics)));
          cur.actions = Array.from(new Set(cur.actions.concat(r.actions)));
        } else {
          dedupe.set(r.advice, { advice: r.advice, topics: Array.from(new Set(r.topics)), actions: Array.from(new Set(r.actions)) });
        }
      });
      final = Array.from(dedupe.values());
    } else {
      // Fallback local summarizer when GEMINI_API_KEY is not configured
      const tokenizeWords = (s) => (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
      const STOPWORDS = new Set(['the','and','is','in','at','of','a','an','to','for','with','on','it','this','that','was','are','as','but','be','by','from','or','we','they','you']);
      function extractKeywords(text, topN=10){
        const freq = Object.create(null);
        tokenizeWords(text).forEach(w=>{ if(!STOPWORDS.has(w) && w.length>2) freq[w]=(freq[w]||0)+1; });
        return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,topN).map(x=>x[0]);
      }
      function adviceForKeyword(k){
        if(/wait|slow|delay|long|queue|waiting/.test(k)) return 'Investigate service speed: adjust staffing, optimize order flow, and reduce wait times.';
        if(/price|cost|expensive|charge/.test(k)) return 'Review pricing and consider promotions or clearer menu value descriptions.';
        if(/dirty|clean|hygiene|smell/.test(k)) return 'Address cleanliness: schedule immediate cleaning and audit facility hygiene.';
        if(/staff|rude|friendly|service/.test(k)) return 'Provide staff training and coaching focused on customer service and friendliness.';
        if(/order|app|website|ux|checkout|menu/.test(k)) return 'Review ordering flow and menus for errors or confusing steps; fix UX gaps.';
        if(/cold|undercooked|overcooked|taste|bland|flavor/.test(k)) return 'Investigate food preparation and quality control in the kitchen.';
        if(/portion|size|small/.test(k)) return 'Re-evaluate portion sizes or pricing; ensure portions match expectations.';
        if(/noise|music|loud/.test(k)) return 'Adjust music volume and seating to improve conversation comfort.';
        return 'Review this topic and triage top operational fixes; monitor impact after changes.';
      }

      const keywords = extractKeywords(sample, 12).slice(0,8);
      const recs = keywords.map(k=>({ advice: adviceForKeyword(k), topics: [k], actions: [] }));
      const uniqMap = new Map();
      recs.forEach(r=>{
        if(uniqMap.has(r.advice)) uniqMap.get(r.advice).topics.push(...r.topics);
        else uniqMap.set(r.advice, { advice: r.advice, topics: [...r.topics], actions: [
          'Investigate root cause and collect top examples internally',
          'Assign an owner and set measurable targets',
          'Implement at least one corrective action and monitor impact'
        ] });
      });
      final = Array.from(uniqMap.values()).map(v=>({ advice: v.advice, topics: Array.from(new Set(v.topics)), actions: v.actions }));
    }

    // Persist to file
    const outDir = path.join(process.cwd(), 'reports');
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const filename = path.join(outDir, `detailed_feedback_${businessId}_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify({ businessId, generatedAt: new Date().toISOString(), recommendations: final, rawAiOutput }, null, 2));

    console.log('Detailed feedback recommendations written to', filename);
    await mongoose.disconnect();
    process.exit(0);
  }catch(err){
    console.error('Error generating detailed feedback:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
