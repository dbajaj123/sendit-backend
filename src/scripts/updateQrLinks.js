require('dotenv').config();
const mongoose = require('mongoose');
const QRCode = require('../models/QRCode');
const qrcode = require('qrcode');
const connectDB = require('../config/database');

(async function main(){
  try {
    await connectDB();
    const customerBase = process.env.CUSTOMER_APP_URL;
    if (!customerBase) {
      console.error('Please set CUSTOMER_APP_URL in your .env before running this script.');
      process.exit(1);
    }
    const base = customerBase.replace(/\/$/, '');
    const qrs = await QRCode.find({});
    console.log('Found', qrs.length, 'QR records');
    for (const qr of qrs) {
      const qrData = `${base}/feedback/${qr.qrId}`;
      const qrCodeUrl = await qrcode.toDataURL(qrData);
      qr.targetUrl = qrData;
      qr.qrCodeUrl = qrCodeUrl;
      await qr.save();
      console.log('Updated', qr.qrId);
    }
    console.log('Done');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
