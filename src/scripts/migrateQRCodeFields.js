/**
 * Migration script to add isMapped field to existing QR codes
 * Run this once to update all existing QR codes that don't have isMapped set
 */

const mongoose = require('mongoose');
require('dotenv').config();
const QRCode = require('../models/QRCode');

async function migrate() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully');

    // Find all QR codes without isMapped field or businessId
    const unmappedQRs = await QRCode.updateMany(
      { 
        $or: [
          { isMapped: { $exists: false } },
          { businessId: null }
        ]
      },
      { 
        $set: { isMapped: false }
      }
    );

    console.log(`Updated ${unmappedQRs.modifiedCount} QR codes with isMapped: false`);

    // Find all QR codes with businessId set (these are mapped)
    const mappedQRs = await QRCode.updateMany(
      { 
        businessId: { $ne: null },
        $or: [
          { isMapped: { $exists: false } },
          { isMapped: false }
        ]
      },
      { 
        $set: { isMapped: true }
      }
    );

    console.log(`Updated ${mappedQRs.modifiedCount} QR codes with isMapped: true`);

    // Verify
    const totalQRs = await QRCode.countDocuments();
    const mappedCount = await QRCode.countDocuments({ isMapped: true });
    const unmappedCount = await QRCode.countDocuments({ isMapped: false });

    console.log('\n--- Migration Summary ---');
    console.log(`Total QR codes: ${totalQRs}`);
    console.log(`Mapped: ${mappedCount}`);
    console.log(`Unmapped: ${unmappedCount}`);

    await mongoose.connection.close();
    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();
