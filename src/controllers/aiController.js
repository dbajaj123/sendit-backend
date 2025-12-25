const Sentiment = require('sentiment');
const Feedback = require('../models/Feedback');
const Report = require('../models/Report');
const Business = require('../models/Business');

const sentiment = new Sentiment();
const { summarizeWithOpenAI } = require('../lib/openaiClient');

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

    // assemble topical trends by keyword with examples
    const trends = keywords.slice(0,6).map(k=>{
      const examples = texts.filter(t=> t.toLowerCase().includes(k)).slice(0,3);
      return { label: k, score: undefined, examples };
    });

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
