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

    // keywords
    const keywords = extractKeywords(corpus, 12);

    // If OPENAI_API_KEY configured, use OpenAI to generate a concise JSON report
    let summary = summarizeExtractive(corpus, keywords, 6);
    let trends = keywords.slice(0,6).map(k=>{
      const examples = texts.filter(t=> t.toLowerCase().includes(k)).slice(0,3);
      return { label: k, score: undefined, examples };
    });

    if(process.env.OPENAI_API_KEY){
      try{
        const sample = texts.slice(0,100).join('\n\n');
        const prompt = `Analyze the following customer feedback entries and return a JSON object with keys: summary (short, 2-4 sentences), trends (array of {label, examples}), statsNote (one-line about sentiment).\n\nFeedback:\n${sample}`;
        const aiText = await summarizeWithOpenAI(prompt, { max_tokens: 600 });
        // try to parse JSON from AI output
        let parsed = null;
        try{ parsed = JSON.parse(aiText); }catch(e){
          // fallback: put the text as summary
          parsed = { summary: aiText };
        }
        if(parsed){
          summary = parsed.summary || summary;
          if(Array.isArray(parsed.trends)) trends = parsed.trends.map(t=>({ label: t.label, examples: t.examples || [] }));
        }
      }catch(e){ console.error('OpenAI summarize failed', e); }
    }

    // `trends` already assembled above (either local or OpenAI-assisted)

    const report = await Report.create({
      businessId,
      generatedAt: new Date(),
      periodStart: items.length? items[items.length-1].createdAt : undefined,
      periodEnd: items[0].createdAt,
      summary,
      trends,
      stats: { totalFeedback: items.length, avgSentiment },
      meta: { generatedBy: process.env.OPENAI_API_KEY ? 'openai-assisted-v1' : 'local-nlp-v1' }
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

      return { id: cid, size: docIndices.length, label: topTerms.slice(0,3).join(', '), topTerms, avgSentiment: avgSent, examples, timeseries: counts };
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
  const summary = summarizeExtractive(corpus, keywords, 6);
  const trends = keywords.slice(0,6).map(k=>{
    const examples = texts.filter(t=> t.toLowerCase().includes(k)).slice(0,3);
    return { label: k, score: undefined, examples };
  });
  const report = await Report.create({ businessId, generatedAt: new Date(), summary, trends, stats:{ totalFeedback: items.length, avgSentiment }, meta:{ generatedBy:'local-nlp-v1', triggeredBy:'cron' } });
  return report;
};
