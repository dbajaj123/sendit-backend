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

  const prompt = `You are an assistant that produces concise, actionable recommendations based on customer feedback. Produce a JSON object with a single key \"recommendations\" whose value is an array of recommendation objects. Each recommendation object should have keys: \"advice\" (short, 1-2 sentences), \"topics\" (array of topic strings covered by this advice), and \"actions\" (array of 2-4 concrete action steps). DO NOT repeat identical advice across entries. DO NOT include raw customer text or examples. Output strictly valid JSON.`;

  try{
    const aiText = await summarizeWithOpenAI(`${prompt}\n\nFeedback:\n${sample}`, { max_tokens: 1200 });
    let parsed = null;
    try{ parsed = JSON.parse(aiText); }catch(e){
      console.error('AI output was not valid JSON; attempting best-effort parsing');
      // Best-effort: split by newlines and dedupe
      const lines = aiText.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const uniq = Array.from(new Set(lines));
      parsed = { recommendations: uniq.map((l,i)=>({ advice: l, topics: [], actions: [] })) };
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
    const final = Array.from(dedupe.values());

    // Persist to file
    const outDir = path.join(process.cwd(), 'reports');
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const filename = path.join(outDir, `detailed_feedback_${businessId}_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify({ businessId, generatedAt: new Date().toISOString(), recommendations: final }, null, 2));

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
