// backend/models/Project.js
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    projectId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['zip', 'html'],
        required: true
    },
    url: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        default: 0
    },
    views: {
        type: Number,
        default: 0
    },
    isPublic: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['active', 'archived', 'deleted'],
        default: 'active'
    },
    files: [{
        type: String
    }],
    settings: {
        password: String,
        customDomain: String,
        redirectUrl: String
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes
projectSchema.index({ userId: 1, createdAt: -1 });
projectSchema.index({ projectId: 1 });
projectSchema.index({ views: -1 });

module.exports = mongoose.model('Project', projectSchema);
