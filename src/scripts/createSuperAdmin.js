require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const createSuperAdmin = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Check if super admin already exists
    const existingAdmin = await Admin.findOne({ role: 'super-admin' });
    
    if (existingAdmin) {
      console.log('Super admin already exists');
      console.log('Email:', existingAdmin.email);
      process.exit(0);
    }

    // Create super admin
    const superAdmin = await Admin.create({
      name: 'Super Admin',
      email: 'admin@senditbox.com',
      password: 'admin123456', // Change this in production!
      role: 'super-admin',
      permissions: {
        canManageBusinesses: true,
        canManageQRCodes: true,
        canViewSystemLogs: true,
        canManageAdmins: true
      }
    });

    console.log('Super admin created successfully!');
    console.log('Email:', superAdmin.email);
    console.log('Password: admin123456');
    console.log('\n⚠️  IMPORTANT: Change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('Error creating super admin:', error);
    process.exit(1);
  }
};

createSuperAdmin();
