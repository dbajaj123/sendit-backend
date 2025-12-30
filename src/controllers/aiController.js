const Sentiment = require('sentiment');
const Feedback = require('../models/Feedback');
const Report = require('../models/Report');
const Business = require('../models/Business');

const sentiment = new Sentiment();
const { summarizeWithOpenAI } = require('../lib/openaiClient');
const natural = require('natural');
const kmeans = require('ml-kmeans');
const TfIdf = natural.TfIdf;

function tokenizeWords(s){
  return (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
}

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

function summarizeExtractive(text, keywords, sentenceLimit=5){
  const sentences = (text||'').split(/[\.\!\?]\s+/).map(s=>s.trim()).filter(Boolean);
  const scored = sentences.map(s=>{
    const words = tokenizeWords(s);
    let score = 0; keywords.forEach(k=>{ if(words.includes(k)) score += 1; });
    return {s, score};
  }).sort((a,b)=>b.score - a.score);
  return scored.slice(0,sentenceLimit).map(x=>x.s).join('. ') + (scored.length?'.':'');
}

exports.analyzeNow = async function(req,res,next){
  try{
    const DEBUG_AI = process.env.DEBUG_AI === '1';
    const businessId = req.user?.businessId || req.body.businessId;
    if(!businessId) return res.status(400).json({ success:false, message:'businessId required' });

    const biz = await Business.findById(businessId).lean();
    if(!biz) return res.status(404).json({ success:false, message:'Business not found' });

    // Timeframe filtering: daily, weekly, monthly (default: all)
    const timeframe = req.body.timeframe || 'all';
    const now = new Date();
    let startDate = null;
    if(timeframe === 'daily'){
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if(timeframe === 'weekly'){
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0,0,0,0);
    } else if(timeframe === 'monthly'){
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const query = { businessId };
    if(startDate) query.createdAt = { $gte: startDate };
    const items = await Feedback.find(query).sort({ createdAt:-1 }).limit(500).lean();
    if(!items.length) return res.json({ success:true, message:'No feedback', data: null });

    const texts = items.map(i=> (i.text || i.content || i.message || '') ).filter(Boolean);
    const corpus = texts.join('\n');

    // sentiment
    const scores = texts.map(t=> sentiment.analyze(t).score );
    const avgSentiment = scores.reduce((a,b)=>a+b,0)/scores.length;

    // categorize feedbacks and compute per-category parameter scores
    function categorizeText(text, rating){
      const t = (text||'').toLowerCase();
      if (rating != null && Number(rating) <= 2) return 'complaint';
      const complaintKeywords = ['bad','terrible','awful','not happy','disappointed','worst','complain','rude','slow','never'];
      const suggestionKeywords = ['suggest','could','should','recommend','wish','would be nice','maybe','consider'];
      for (const k of complaintKeywords) if (t.includes(k)) return 'complaint';
      for (const k of suggestionKeywords) if (t.includes(k)) return 'suggestion';
      if (t.length < 10) return 'feedback';
      return 'feedback';
    }

    const paramKeywords = {
      quality: ['quality','taste','flavor','undercooked','overcooked','cold','hot','fresh','stale','texture','presentation'],
      food: ['food','dish','menu','portion','taste','flavor','ingredients','overcooked','undercooked','spicy','salty','bland'],
      service: ['service','wait','staff','rude','friendly','slow','attentive','waiter','server','order','staffed','queue']
    };

    const categoriesText = { complaint: [], feedback: [], suggestion: [] };
    items.forEach(it => {
      const t = (it.text || it.content || it.message || '').toString();
      const r = (it.rating != null) ? Number(it.rating) : null;
      const cat = categorizeText(t, r);
      categoriesText[cat].push({ text: t, rating: r });
    });

    const categoryScores = { complaint: {}, feedback: {}, suggestion: {} };
    const categoryCounts = { complaint: 0, feedback: 0, suggestion: 0 };
    const categoryAvgSent = { complaint: 0, feedback: 0, suggestion: 0 };

    for (const cat of ['complaint','feedback','suggestion']){
      const list = categoriesText[cat];
      categoryCounts[cat] = list.length;
      const sents = list.map(x=> sentiment.analyze(x.text).score );
      const avg = sents.length ? sents.reduce((a,b)=>a+b,0)/sents.length : 0;
      categoryAvgSent[cat] = avg;
      // per-parameter
      for (const param of ['quality','food','service']){
        const kw = paramKeywords[param];
        const subset = list.filter(x => kw.some(k => (x.text||'').toLowerCase().includes(k)));
        const ps = subset.map(x=> sentiment.analyze(x.text).score);
        let pavg = ps.length ? ps.reduce((a,b)=>a+b,0)/ps.length : avg;
        // normalize to 0-10 (sentiment ~ -5..5 => map to 0..10)
        if (pavg > 5) pavg = 5; if (pavg < -5) pavg = -5;
        const out = Math.round((pavg + 5) * 10) / 10.0; // one decimal
        categoryScores[cat][param] = out;
      }
    }

    // keywords
    const keywords = extractKeywords(corpus, 12);

    // Build recommendation-focused summary and trends (do NOT include raw feedback examples)
    const topKeywords = keywords.slice(0,6);
    const initialTrends = topKeywords.map(k => ({ label: k, recommendation: adviceForKeyword(k) }));
    let finalTrends = initialTrends;

    // Local summary: concise recommendations (no raw customer text)
    // Build recommendations per keyword, but avoid repeating identical advice strings
    const recsByKeyword = topKeywords.map((k) => ({ topic: k, advice: adviceForKeyword(k) }));
    // Deduplicate by advice text, keeping a list of topics per unique advice
    const uniqueRecsMap = new Map();
    recsByKeyword.forEach(r => {
      if(uniqueRecsMap.has(r.advice)){
        uniqueRecsMap.get(r.advice).topics.push(r.topic);
      } else {
        uniqueRecsMap.set(r.advice, { advice: r.advice, topics: [r.topic] });
      }
    });
    const uniqueRecs = Array.from(uniqueRecsMap.values());
    let summary = uniqueRecs.map((r,i) => `${i+1}. ${r.advice} (topics: ${r.topics.join(', ')})`).join('\n');

    if(!process.env.GEMINI_API_KEY){
      return res.status(500).json({ success:false, message: 'GEMINI_API_KEY not configured on server' });
    }

    try{
      const sample = texts.slice(0,200).join('\n\n');
      // Request the new categories schema and distribution counts explicitly
      const prompt = `You are an assistant that MUST output STRICT, PARSABLE JSON ONLY (no surrounding markdown). Produce a single JSON object with these keys:\n- "summary": a short 2-4 sentence summary (string)\n- "recommendations": array of objects { "advice": string, "topics": [string], "actions": [string] }\n- "trends": array of { "label": string, "recommendation": string }\n- "categories": { "scores": { "services": { "cleanliness": number, "waiting": number, "time": number, "billing": number }, "product": { "quality": number, "price": number }, "staff": { "behavior": number, "skills": number } }, "distribution": { "complaints": number, "suggestions": number, "feedback": number } }\nDo NOT include raw customer text. Ensure numeric scores are between 0 and 10. Return only the JSON object (compact or pretty-printed). Feedback corpus:\n${sample}`;

      const aiText = await summarizeWithOpenAI(prompt, { max_tokens: 1500 });
      if(DEBUG_AI) try{ console.log('Gemini full output:\n', aiText); }catch(_){ /* ignore logging errors */ }

      // robust extractor: find first balanced JSON object (handles fences and pretty-printing)
      function findFirstJson(str){
        if(!str || typeof str !== 'string') return null;
        // strip common markdown fences first
        const stripped = str.replace(/```[\s\S]*?```/g, m => m.replace(/```/g, ''));
        const start = stripped.indexOf('{');
        if(start === -1) return null;
        let depth = 0;
        for(let i=start;i<stripped.length;i++){
          const ch = stripped[i];
          if(ch === '{') depth++;
          else if(ch === '}') depth--;
          if(depth === 0){
            return stripped.substring(start, i+1);
          }
        }
        return null; // truncated
      }

      let parsed = null;
      let llmFailed = false;
      try{
        // direct parse first
        parsed = JSON.parse(aiText);
      }catch(_){
        try{
          const jsonText = findFirstJson(aiText) || aiText;
          // sanitize common trailing commas before parse
          const sanitized = jsonText.replace(/,\s*([}\]])/g, '$1');
          parsed = JSON.parse(sanitized);
        }catch(e2){
          // don't abort — mark as failed and continue with local fallback
          llmFailed = true;
          if(DEBUG_AI) console.error('Gemini output not valid JSON after extraction:', aiText);
          // leave parsed null and continue
        }
      }

      // Validate and map parsed structure
      if(parsed){
        if(parsed.summary && typeof parsed.summary === 'string') summary = parsed.summary;
        if(Array.isArray(parsed.trends)) finalTrends = parsed.trends.map(t => ({ label: t.label || '', recommendation: t.recommendation || '' }));
        if(Array.isArray(parsed.recommendations)){
          // normalize recommendations
          const recs = parsed.recommendations.map(r => ({ advice: r.advice || '', topics: Array.isArray(r.topics) ? r.topics : [], actions: Array.isArray(r.actions) ? r.actions : [] }));
          var aiInsights = { source: 'gemini', recommendations: recs };
        }

        // apply category scores if provided (new schema: services/product/staff)
        try{
          const p = parsed.categories && parsed.categories.scores ? parsed.categories.scores : null;
          if(p){
            // Build a normalized scores object for persistence
            var categoryScoresNew = { services: {}, product: {}, staff: {} };
            if(p.services){ Object.keys(p.services).forEach(k=>{ const v = Number(p.services[k]); if(!isNaN(v)) categoryScoresNew.services[k] = Math.max(0, Math.min(10, v)); }); }
            if(p.product){ Object.keys(p.product).forEach(k=>{ const v = Number(p.product[k]); if(!isNaN(v)) categoryScoresNew.product[k] = Math.max(0, Math.min(10, v)); }); }
            if(p.staff){ Object.keys(p.staff).forEach(k=>{ const v = Number(p.staff[k]); if(!isNaN(v)) categoryScoresNew.staff[k] = Math.max(0, Math.min(10, v)); }); }
            // also accept legacy complaint/feedback/suggestion scores if present and map them under that key
            ['complaint','feedback','suggestion'].forEach(cat=>{ if(p[cat]) categoryScoresNew[cat] = p[cat]; });
            // apply distribution if provided
            if(parsed.categories.distribution){
              const d = parsed.categories.distribution;
              if(typeof d.complaints === 'number') categoryCounts.complaint = d.complaints;
              if(typeof d.suggestions === 'number') categoryCounts.suggestion = d.suggestions;
              if(typeof d.feedback === 'number') categoryCounts.feedback = d.feedback;
            }
            // attach to categories for persistence later
            var parsedCategoryScoresForReport = categoryScoresNew;
          }
        }catch(e){ console.warn('Failed to apply parsed category scores', e); }
      }
      // if LLM failed to produce valid JSON, save raw text into meta for debugging when DEBUG_AI
      if((llmFailed || DEBUG_AI) && aiText){
        try{ if(!parsed) console.warn('LLM produced invalid JSON; saved raw output to meta.rawAiText'); }catch(_){}
      }
    }catch(e){
      console.error('Gemini summarize failed', e);
      return res.status(502).json({ success:false, message: 'AI request failed', error: e.toString() });
    }

    // `trends` already assembled above (either local or Gemini-assisted)

    const categoriesForReport = {
      counts: categoryCounts,
      avgSentiment: categoryAvgSent,
      scores: (typeof parsedCategoryScoresForReport !== 'undefined' && parsedCategoryScoresForReport) ? parsedCategoryScoresForReport : categoryScores
    };

    const metaForReport = { 
      generatedBy: process.env.GEMINI_API_KEY ? (typeof llmFailed !== 'undefined' && llmFailed ? 'gemini-failed-v1' : 'gemini-assisted-v1') : 'local-nlp-v1',
      timeframe: timeframe || 'all'
    };
    if((typeof llmFailed !== 'undefined' && llmFailed) || DEBUG_AI){
      metaForReport.rawAiText = (typeof aiText !== 'undefined') ? aiText : null;
    }

    const report = await Report.create({
      businessId,
      generatedAt: new Date(),
      periodStart: items.length? items[items.length-1].createdAt : undefined,
      periodEnd: items[0].createdAt,
      summary,
      trends: finalTrends,
      aiInsights: aiInsights || null,
      stats: { totalFeedback: items.length, avgSentiment },
      categories: categoriesForReport,
      meta: metaForReport
    });

    try{ console.log('Report being returned (summary keys):', { businessId: report.businessId, generatedAt: report.generatedAt, categories: report.categories ? Object.keys(report.categories) : null }); }catch(_){}
    try{ console.log('Report JSON preview:', JSON.stringify(report).slice(0,4000)); }catch(_){}
    return res.json({ success:true, report });
  }catch(e){ next(e); }
};

// Compute topics via TF-IDF + KMeans (no LLM required)
exports.computeTopics = async function(req, res, next){
  try{
    const businessId = req.user?.businessId || req.query.businessId || req.body.businessId;
    if(!businessId) return res.status(400).json({ success:false, message:'businessId required' });

    const items = await Feedback.find({ businessId }).sort({ createdAt:-1 }).limit(1000).lean();
    if(!items.length) return res.json({ success:true, topics: [] });

    const texts = items.map(i=> (i.text || i.content || i.message || '') ).filter(Boolean);

    // Build TF-IDF
    const tfidf = new TfIdf();
    texts.forEach(t=> tfidf.addDocument(t));

    // Build vocabulary of top terms across corpus
    const termFreq = {};
    for(let i=0;i<texts.length;i++){
      tfidf.listTerms(i).slice(0,50).forEach(o=>{ termFreq[o.term] = (termFreq[o.term]||0) + o.tf; });
    }
    const vocab = Object.entries(termFreq).sort((a,b)=>b[1]-a[1]).slice(0,200).map(x=>x[0]);

    // Vectorize documents
    const vectors = texts.map((t, idx)=> vocab.map(term => tfidf.tfidf(term, idx)) );

    // Choose k
    const n = Math.max(2, Math.min(6, Math.floor(Math.sqrt(vectors.length))));
    let km = null;
    try{ km = kmeans(vectors, n); }catch(e){
      // fallback to single cluster
      km = { clusters: Array(vectors.length).fill(0), centroids: [] };
    }

    const clusters = {};
    (km.clusters || []).forEach((cIdx, docIdx)=>{
      clusters[cIdx] = clusters[cIdx] || { docs: [] };
      clusters[cIdx].docs.push(docIdx);
    });

    // Build topics
    const topics = Object.entries(clusters).map(([cid, info])=>{
      const docIndices = info.docs;
      const clusterTexts = docIndices.map(i=>texts[i]);
      const clusterTerms = {};
      docIndices.forEach(i=> tfidf.listTerms(i).slice(0,30).forEach(o=>{ clusterTerms[o.term]=(clusterTerms[o.term]||0)+o.tfidf; }));
      const topTerms = Object.entries(clusterTerms).sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]);
      const examples = docIndices.slice(0,3).map(i=> ({ text: texts[i], id: items[i]._id, createdAt: items[i].createdAt }) );
      const sentiments = docIndices.map(i=> sentiment.analyze(texts[i]).score);
      const avgSent = sentiments.length? (sentiments.reduce((a,b)=>a+b,0)/sentiments.length) : 0;

      // timeseries: counts per week for last 8 weeks
      const now = Date.now();
      const weekMs = 7*24*3600*1000;
      const counts = new Array(8).fill(0);
      docIndices.forEach(i=>{
        const dt = new Date(items[i].createdAt).getTime();
        const weeksAgo = Math.floor((now - dt)/weekMs);
        if(weeksAgo < 8) counts[7 - weeksAgo] += 1; // reverse for oldest->newest
      });

      // Heuristic advice generation based on top terms and sentiment
      let advice = 'Review these feedback examples and take action as needed.';
      const tstr = topTerms.join(' ');
      const lowSent = avgSent < 0;
      if(/wait|slow|delay|long|queue|waiting/.test(tstr) || /wait|slow|delay|long|queue|waiting/.test(tstr)){
        advice = 'Customers mention delays; investigate staffing/queueing and streamline service flow.';
      } else if(/price|cost|expensive|charge/.test(tstr)){
        advice = 'Price concerns detected; review pricing, offer promotions, or clarify value.';
      } else if(/dirty|clean|hygiene|smell/.test(tstr)){
        advice = 'Cleanliness issues reported; schedule immediate cleaning and inspect facilities.';
      } else if(/staff|rude|friendly|service/.test(tstr)){
        advice = 'Customer-facing staff issues; consider training and feedback sessions.';
      } else if(/order|app|website|ux|checkout/.test(tstr)){
        advice = 'UX/order issues found; review the ordering flow and fix errors or edge-cases.';
      } else if(lowSent && docIndices.length>5){
        advice = 'Multiple negative feedback items found; triage top examples and prioritize fixes.';
      } else if(docIndices.length>10){
        advice = 'This is a recurring topic — investigate root cause and monitor after fixes.';
      }

      return { id: cid, size: docIndices.length, label: topTerms.slice(0,3).join(', '), topTerms, avgSentiment: avgSent, examples, timeseries: counts, advice };
    });

    return res.json({ success:true, topics });
  }catch(e){ next(e); }
};

// Worker-friendly wrapper used by cron
exports.runForBusiness = async function(businessId){
  // lightweight wrapper that doesn't require req/res
  const items = await Feedback.find({ businessId }).sort({ createdAt:-1 }).limit(500).lean();
  if(!items.length) return null;
  const texts = items.map(i=> (i.text || i.content || i.message || '') ).filter(Boolean);
  const corpus = texts.join('\n');
  const scores = texts.map(t=> sentiment.analyze(t).score );
  const avgSentiment = scores.reduce((a,b)=>a+b,0)/scores.length;
  const keywords = extractKeywords(corpus, 12);
  const topKeywords = keywords.slice(0,6);
  // Deduplicate advice for runForBusiness as well
  const recsByKeyword = topKeywords.map((k) => ({ topic: k, advice: adviceForKeyword(k) }));
  const uniqueRecsMap = new Map();
  recsByKeyword.forEach(r => {
    if(uniqueRecsMap.has(r.advice)){
      uniqueRecsMap.get(r.advice).topics.push(r.topic);
    } else {
      uniqueRecsMap.set(r.advice, { advice: r.advice, topics: [r.topic] });
    }
  });
  const uniqueRecs = Array.from(uniqueRecsMap.values());
  const summary = uniqueRecs.map((r,i) => `${i+1}. ${r.advice} (topics: ${r.topics.join(', ')})`).join('\n');
  const trends = uniqueRecs.map(r => ({ label: r.topics.join(', '), recommendation: r.advice }));
  const report = await Report.create({ businessId, generatedAt: new Date(), summary, trends, stats:{ totalFeedback: items.length, avgSentiment }, meta:{ generatedBy:'local-nlp-v1', triggeredBy:'cron' } });
  return report;
};
