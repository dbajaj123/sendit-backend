#!/usr/bin/env node
require('dotenv').config({ path: process.env.ENV_PATH || '.env' });
const mongoose = require('mongoose');
const QRCodeModel = require('../models/QRCode');
const Business = require('../models/Business');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

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
  const location = args.location || 'Main Location';
  const targetUrlArg = args.targetUrl; // optional

  if(!businessId){
    console.error('Usage: node src/scripts/createQrForBusiness.js --businessId <id> [--location "Table 1"] [--targetUrl "https://..."]');
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

  try{
    const qrId = uuidv4();
    const baseCustomerUrl = process.env.CUSTOMER_APP_URL || 'https://example.com';
    const targetUrl = targetUrlArg || `${baseCustomerUrl.replace(/\/$/, '')}/feedback/${qrId}`;

    // generate a data URL PNG for the targetUrl
    const qrCodeUrl = await qrcode.toDataURL(targetUrl, { margin: 1, width: 300 });

    const qr = new QRCodeModel({ qrId, businessId, qrCodeUrl, targetUrl, location });
    await qr.save();

    console.log('Created QR:', qr.qrId);
    console.log('Location:', qr.location);
    console.log('Target URL:', qr.targetUrl);
    console.log('qrCodeUrl (data URL length):', qr.qrCodeUrl.length);

    await mongoose.disconnect();
    process.exit(0);
  }catch(err){
    console.error('Error creating QR:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
