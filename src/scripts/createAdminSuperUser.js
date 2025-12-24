/*
  createAdminSuperUser.js
  Usage:
    NODE_ENV=production node src/scripts/createAdminSuperUser.js
  Or provide env vars in .env: MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD
*/

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config({ path: process.env.ENV_PATH || '.env' });
const Admin = require('../models/Admin');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/sendit';

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function run() {
  try {
    console.log('Connecting to', MONGODB_URI);
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    let email = process.env.ADMIN_EMAIL;
    let password = process.env.ADMIN_PASSWORD;
    let name = process.env.ADMIN_NAME || 'Super Admin';

    if (!email) email = (await prompt('Admin email: ')).trim();
    if (!password) password = (await prompt('Admin password (min 8 chars): ')).trim();

    if (!email || !password) {
      console.error('Email and password are required');
      process.exit(1);
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() }).select('+password');
    if (existing) {
      console.log('An admin with that email already exists. Updating role to super-admin and password if provided.');
      existing.role = 'super-admin';
      if (password) existing.password = password;
      if (name) existing.name = name;
      await existing.save();
      console.log('Updated existing admin:', existing.email);
      process.exit(0);
    }

    const admin = new Admin({ name, email: email.toLowerCase(), password, role: 'super-admin', isActive: true });
    await admin.save();
    console.log('Super-admin created:', admin.email);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
