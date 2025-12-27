#!/usr/bin/env node
require('dotenv').config({ path: process.env.ENV_PATH || '.env' });
const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const Business = require('../models/Business');

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

const sampleTexts = [
  'Amazing food and friendly staff!',
  'Waited too long for the order.',
  'Food was cold when served.',
  'Great ambiance, will come again.',
  'Server was rude and inattentive.',
  'Portion sizes were small for the price.',
  'Loved the dessert! Highly recommended.',
  'Order was incorrect, they fixed it quickly.',
  'Music was too loud for conversation.',
  'Excellent value and fast service.'
];

function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

async function run(){
  const args = parseArgs();
  const businessId = args.businessId || args.bid;
  const count = parseInt(args.count || '30', 10);
  if(!businessId){
    console.error('Usage: node src/scripts/seedFeedbackForBusiness.js --businessId <id> [--count N]');
    process.exit(1);
  }

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/senditbox';
  await mongoose.connect(MONGODB_URI);

  const biz = await Business.findById(businessId).lean();
  if(!biz){
    console.error('Business not found:', businessId);
    await mongoose.disconnect();
    process.exit(1);
  }

  const created = [];
  const now = Date.now();
  for(let i=0;i<count;i++){
    const text = sampleTexts[randInt(0, sampleTexts.length-1)];
    const rating = randInt(1,5);
    const createdAt = new Date(now - randInt(0, 8*7*24*3600*1000));
    const doc = new Feedback({ businessId, feedbackType: 'text', content: text, rating, createdAt });
    await doc.save();
    created.push(doc);
  }

  console.log(`Inserted ${created.length} feedback items for business ${businessId}`);
  await mongoose.disconnect();
}

run().catch(err=>{ console.error(err); process.exit(1); });
