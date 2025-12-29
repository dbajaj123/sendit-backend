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
    const businessId = req.user?.businessId || req.body.businessId;
    if(!businessId) return res.status(400).json({ success:false, message:'businessId required' });

    const biz = await Business.findById(businessId).lean();
    if(!biz) return res.status(404).json({ success:false, message:'Business not found' });

    const items = await Feedback.find({ businessId }).sort({ createdAt:-1 }).limit(500).lean();
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

    if(process.env.GEMINI_API_KEY){
      try{
        const sample = texts.slice(0,100).join('\n\n');
          const prompt = `You are an assistant that outputs STRICT JSON only. Produce an object with keys: "summary" (2-4 sentences), "recommendations" (array of {advice, topics, actions}), "trends" (array of {label, recommendation}), and "categories" which must contain a "scores" object. "scores" should map "complaint","feedback","suggestion" to objects with numeric "quality","food","service" values between 0 and 10. Do NOT include raw feedback examples. Feedback:\n${sample}`;
        const aiText = await summarizeWithOpenAI(prompt, { max_tokens: 800 });
        console.log('Gemini raw output:', aiText);
        // try to extract JSON from AI output
        let parsed = null;
        try{ parsed = JSON.parse(aiText); }catch(e){
          // try simple extraction of JSON block
          const m = aiText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i) || aiText.match(/(\{[\s\S]*\})/);
          if(m && m[1]){
            try{ parsed = JSON.parse(m[1]); }catch(e2){ parsed = { summary: aiText }; }
          } else {
            parsed = { summary: aiText };
          }
        }
        if(parsed){
          // If the model returned a JSON string inside the `summary` field (some models wrap JSON in code fences),
          // try to extract and parse that inner JSON and merge useful keys (like categories.scores).
          try{
            if(parsed.summary && typeof parsed.summary === 'string'){
              const s = parsed.summary.trim();
              const innerMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || s.match(/(\{[\s\S]*\})/);
              if(innerMatch && innerMatch[1]){
                try{
                  const inner = JSON.parse(innerMatch[1]);
                  console.log('Gemini inner parsed JSON extracted from summary:', inner);
                  // merge sensible fields
                  if(inner.summary) parsed.summary = inner.summary;
                  if(!parsed.recommendations && inner.recommendations) parsed.recommendations = inner.recommendations;
                  if(!parsed.trends && inner.trends) parsed.trends = inner.trends;
                  if(!parsed.categories && inner.categories) parsed.categories = inner.categories;
                  if(!parsed.scores && inner.scores) parsed.scores = inner.scores;
                }catch(e){ /* ignore inner parse errors */ }
              }
            }
          }catch(e){ console.warn('Inner JSON extraction failed', e); }
          console.log('Gemini parsed JSON:', parsed);
          const aiSummary = parsed.summary || (parsed.recommendations ? parsed.recommendations.map(r=>r.advice).join('\n') : null) || parsed.advice || null;
          if(aiSummary) summary = (typeof aiSummary === 'string') ? aiSummary : Array.isArray(aiSummary) ? aiSummary.join('\n') : summary;
          if(Array.isArray(parsed.trends)){
            const mapped = parsed.trends.map(t => ({ label: t.label, recommendation: t.recommendation || adviceForKeyword(t.label || '') }));
            const trendMap = new Map();
            mapped.forEach(t => {
              if(trendMap.has(t.recommendation)){
                trendMap.get(t.recommendation).labels.push(t.label);
              } else {
                trendMap.set(t.recommendation, { recommendation: t.recommendation, labels: [t.label] });
              }
            });
            finalTrends = Array.from(trendMap.values()).map(v => ({ label: v.labels.join(', '), recommendation: v.recommendation }));
          }
          // Build aiInsights structure if recommendations provided
          if(Array.isArray(parsed.recommendations)){
            const recs = parsed.recommendations.map(r=>({ advice: r.advice||r.text||'', topics: r.topics||[], actions: r.actions||[] }));
            // dedupe by advice
            const map = new Map();
            recs.forEach(r=>{
              const key = (r.advice||'').trim();
              if(!key) return;
              if(map.has(key)){
                const cur = map.get(key);
                cur.topics = Array.from(new Set(cur.topics.concat(r.topics)));
                cur.actions = Array.from(new Set(cur.actions.concat(r.actions)));
              } else map.set(key, { advice: key, topics: Array.from(new Set(r.topics)), actions: Array.from(new Set(r.actions)) });
            });
            var aiInsights = { source: 'gemini', recommendations: Array.from(map.values()) };
          }
            // If model provided explicit category scores, apply them (ensure numeric and clamp 0..10)
            try{
              const p = parsed.categories && parsed.categories.scores ? parsed.categories.scores : (parsed.scores || parsed.category_scores || null);
              if(p){
                ['complaint','feedback','suggestion'].forEach(cat=>{
                  if(p[cat]){
                    ['quality','food','service'].forEach(param=>{
                      const v = p[cat][param];
                      if(typeof v === 'number' && !isNaN(v)){
                        const nv = Math.max(0, Math.min(10, v));
                        categoryScores[cat][param] = Math.round(nv*10)/10;
                          }
                    });
                  }
                });
              }
                  console.log('categoryScores after LLM parse:', categoryScores);
            }catch(e){ console.warn('Failed to apply parsed category scores', e); }
        }
      }catch(e){ console.error('Gemini summarize failed', e); }
    }

    // `trends` already assembled above (either local or Gemini-assisted)

    const report = await Report.create({
      businessId,
      generatedAt: new Date(),
      periodStart: items.length? items[items.length-1].createdAt : undefined,
      periodEnd: items[0].createdAt,
      summary,
      trends: finalTrends,
      aiInsights: aiInsights || null,
      stats: { totalFeedback: items.length, avgSentiment },
      categories: { counts: categoryCounts, avgSentiment: categoryAvgSent, scores: categoryScores },
      meta: { generatedBy: process.env.GEMINI_API_KEY ? 'gemini-assisted-v1' : 'local-nlp-v1' }
    });

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
