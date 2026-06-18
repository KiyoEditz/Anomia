const mongoose = require('mongoose');

const TAG_CATEGORIES = ['genre', 'character', 'artist', 'group', 'language', 'format'];

const tagSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: { type: String, enum: TAG_CATEGORIES, required: true, index: true },
    usageCount: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

tagSchema.index({ category: 1, name: 1 });

tagSchema.methods.toJSON = function () {
  return {
    id: this._id,
    name: this.name,
    slug: this.slug,
    category: this.category,
    usageCount: this.usageCount,
  };
};

tagSchema.statics.CATEGORIES = TAG_CATEGORIES;

module.exports = mongoose.model('Tag', tagSchema);
module.exports.TAG_CATEGORIES = TAG_CATEGORIES;
