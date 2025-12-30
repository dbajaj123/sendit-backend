const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReportSchema = new Schema({
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
  generatedAt: { type: Date, default: Date.now },
  periodStart: Date,
  periodEnd: Date,
  summary: String,
  trends: [{ label: String, score: Number, examples: [Schema.Types.Mixed] }],
  stats: { type: Schema.Types.Mixed },
  categories: { type: Schema.Types.Mixed },
  aiInsights: { type: Schema.Types.Mixed },
  meta: { type: Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);
