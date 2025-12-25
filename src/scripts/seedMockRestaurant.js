/**
 * seedMockRestaurant.js
 * Usage:
 *   node src/scripts/seedMockRestaurant.js --name "Joe's Diner" --email owner@joes.example --count 60
 * Or set env: MONGODB_URI
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: process.env.ENV_PATH || '.env' });
const Business = require('../models/Business');
const QRCode = require('../models/QRCode');
const Feedback = require('../models/Feedback');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/sendit';

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
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

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function run() {
  const args = parseArgs();
  const businessName = args.name || 'Mock Restaurant';
  const ownerEmail = args.email || `owner+${uuidv4().slice(0,6)}@example.com`;
  const ownerName = args.owner || 'Owner';
  const feedbackCount = parseInt(args.count || '60', 10) || 60;

  console.log('Connecting to', MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  // Create or update business
  let business = await Business.findOne({ email: ownerEmail });
  if (business) {
    console.log('Found existing business, using it:', business.email);
  } else {
    business = new Business({ businessName, ownerName, email: ownerEmail, password: 'password123', phone: '000-000-0000', businessType: 'restaurant', isVerified: true });
    await business.save();
    console.log('Created business:', business._id.toString());
  }

  // Create sample QR codes
  const locations = ['Main Counter', 'Table 1', 'Table 2', 'Restroom', 'Takeaway Counter'];
  const createdQrs = [];
  for (let i = 0; i < 3; i++) {
    const loc = locations[i % locations.length];
    const qr = new QRCode({ businessId: business._id, location: loc, targetUrl: `https://example.com/feedback/${uuidv4()}` });
    // ensure qrCodeUrl (simple placeholder)
    qr.qrCodeUrl = `data:image/png;base64,SEEDPLACEHOLDER${uuidv4()}`;
    await qr.save();
    createdQrs.push(qr);
    console.log('Created QR:', qr.qrId, 'location=', loc);
  }

  // Create feedback entries over the last 8 weeks
  const now = Date.now();
  const eightWeeks = 8 * 7 * 24 * 60 * 60 * 1000;
  const itemsPerQr = Math.max(5, Math.floor(feedbackCount / createdQrs.length));
  const createdFeedback = [];
  for (const qr of createdQrs) {
    for (let i = 0; i < itemsPerQr; i++) {
      const randText = sampleTexts[randInt(0, sampleTexts.length - 1)];
      const rating = randInt(1, 5);
      const createdAt = new Date(now - Math.floor(Math.random() * eightWeeks));
      const fb = new Feedback({
        businessId: business._id,
        qrId: qr.qrId,
        feedbackType: 'text',
        content: randText,
        customerName: ['Alice','Bob','Charlie','Dana','Eve'][randInt(0,4)],
        rating,
        createdAt
      });
      await fb.save();
      createdFeedback.push(fb);
    }
    // update counts
    qr.feedbackCount = await Feedback.countDocuments({ qrId: qr.qrId });
    await qr.save();
  }

  console.log(`Seeded business (${business._id}) with ${createdQrs.length} QR codes and ${createdFeedback.length} feedback entries.`);
  console.log('Business login:', ownerEmail, 'password: password123');

  await mongoose.disconnect();
}

run().catch(err => { console.error('Error seeding mock data:', err); process.exit(1); });
