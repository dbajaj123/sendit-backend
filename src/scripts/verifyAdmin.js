require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/senditbox';

async function verifyAdmin() {
  try {
    console.log('Connecting to:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check all admins
    const admins = await Admin.find({}).select('+password');
    console.log(`Found ${admins.length} admin(s) in database:\n`);
    
    if (admins.length === 0) {
      console.log('❌ No admins found in database!');
      console.log('\nCreating super admin now...\n');
      
      const superAdmin = await Admin.create({
        name: 'Super Admin',
        email: 'admin@senditbox.com',
        password: 'admin123456',
        role: 'super-admin',
        isActive: true,
        permissions: {
          canManageBusinesses: true,
          canManageQRCodes: true,
          canViewSystemLogs: true,
          canManageAdmins: true
        }
      });
      
      console.log('✅ Super admin created successfully!');
      console.log('Email:', superAdmin.email);
      console.log('Password: admin123456');
      console.log('Role:', superAdmin.role);
      console.log('\n⚠️  IMPORTANT: Change the password after first login!');
    } else {
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. Email: ${admin.email}`);
        console.log(`   Name: ${admin.name}`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Active: ${admin.isActive}`);
        console.log(`   Created: ${admin.createdAt}`);
        console.log('');
      });
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyAdmin();
