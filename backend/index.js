// backend/index.js
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

// Import Models
const User = require('./models/User');
const Project = require('./models/Project');
const { sendOTPEmail } = require('./utils/emailService');
const auth = require('./middleware/auth');

dotenv.config();

const app = express();

// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(mongoSanitize());
app.use(xss());
app.use(compression());
app.use(cookieParser());
app.use(morgan('dev'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// CORS Configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/sila-web-hosting?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ MongoDB Connected Successfully');
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
});

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/projects', express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }
}));

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueId}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.endsWith('.zip')) {
        cb(null, true);
    } else {
        cb(new Error('Please upload ZIP file only'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// ============ AUTHENTICATION ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'User with this email or username already exists'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create user
        const user = new User({
            username,
            email,
            password: hashedPassword,
            otp,
            otpExpiry
        });

        await user.save();

        // Send OTP email
        try {
            await sendOTPEmail(email, otp);
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Continue even if email fails - user can resend OTP
        }

        // Generate JWT for partial authentication
        const token = jwt.sign(
            { userId: user._id, email: user.email, temp: true },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 10 * 60 * 1000 // 10 minutes
        });

        res.json({
            success: true,
            message: 'Registration successful. Please verify OTP sent to your email.',
            data: {
                email: user.email,
                requiresOTP: true
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check if email is verified
        if (!user.isVerified) {
            // Generate new OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            user.otp = otp;
            user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
            await user.save();

            // Send OTP
            await sendOTPEmail(email, otp);

            // Generate temp token
            const token = jwt.sign(
                { userId: user._id, email: user.email, temp: true },
                process.env.JWT_SECRET,
                { expiresIn: '10m' }
            );

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 10 * 60 * 1000
            });

            return res.json({
                success: true,
                message: 'Please verify your email first. OTP sent.',
                data: {
                    email: user.email,
                    requiresOTP: true
                }
            });
        }

        // Generate full token
        const token = jwt.sign(
            { userId: user._id, email: user.email, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                userId: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check OTP
        if (user.otp !== otp || user.otpExpiry < new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired OTP'
            });
        }

        // Verify user
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        // Generate full token
        const token = jwt.sign(
            { userId: user._id, email: user.email, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            message: 'Email verified successfully',
            data: {
                userId: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Resend OTP
app.post('/api/auth/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Generate new OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        // Send OTP
        await sendOTPEmail(email, otp);

        res.json({
            success: true,
            message: 'OTP resent successfully'
        });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Get current user
app.get('/api/auth/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password -otp -otpExpiry -__v');
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// ============ PROJECT ROUTES ============

// Upload ZIP (Protected)
app.post('/api/projects/upload/zip', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }

        const file = req.file;
        const projectId = uuidv4();
        const projectName = req.body.name || file.originalname.replace('.zip', '');
        const extractPath = path.join(uploadsDir, projectId);
        
        // Create directory
        fs.mkdirSync(extractPath, { recursive: true });

        // Extract ZIP
        const zip = new AdmZip(file.path);
        const zipEntries = zip.getEntries();
        
        let hasIndexHtml = false;
        const extractedFiles = [];
        
        zipEntries.forEach(entry => {
            const entryName = entry.entryName;
            if (entryName === 'index.html' || entryName.endsWith('/index.html')) {
                hasIndexHtml = true;
            }
            extractedFiles.push(entryName);
        });

        if (!hasIndexHtml) {
            fs.rmSync(extractPath, { recursive: true, force: true });
            fs.unlinkSync(file.path);
            return res.status(400).json({ 
                success: false, 
                error: 'ZIP file must contain index.html' 
            });
        }

        zip.extractAllTo(extractPath, true);

        // Get all files
        const getAllFiles = (dirPath) => {
            const files = fs.readdirSync(dirPath);
            let fileList = [];
            
            files.forEach(file => {
                const fullPath = path.join(dirPath, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    fileList = [...fileList, ...getAllFiles(fullPath)];
                } else {
                    fileList.push(path.relative(extractPath, fullPath));
                }
            });
            
            return fileList;
        };

        const allFiles = getAllFiles(extractPath);

        // Save to database
        const project = new Project({
            projectId,
            userId: req.userId,
            name: projectName,
            type: 'zip',
            url: `/projects/${projectId}/`,
            fileSize: file.size,
            files: allFiles,
            status: 'active'
        });

        await project.save();

        // Update user's projects
        await User.findByIdAndUpdate(req.userId, {
            $push: { projects: project._id }
        });

        // Clean up zip
        fs.unlinkSync(file.path);

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const fullUrl = `${baseUrl}/projects/${projectId}/`;

        res.json({
            success: true,
            message: '✅ Project uploaded successfully',
            data: {
                ...project.toObject(),
                url: fullUrl
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        res.status(500).json({ 
            success: false, 
            error: 'Server error. Please try again.' 
        });
    }
});

// Upload HTML (Protected)
app.post('/api/projects/upload/html', auth, async (req, res) => {
    try {
        const { html, name } = req.body;
        
        if (!html) {
            return res.status(400).json({ 
                success: false, 
                error: 'No HTML code provided' 
            });
        }

        const projectId = uuidv4();
        const projectName = name || `Project-${projectId.slice(0, 8)}`;
        const projectPath = path.join(uploadsDir, projectId);
        
        fs.mkdirSync(projectPath, { recursive: true });

        // Format HTML
        let formattedHtml = html;
        if (!html.includes('<!DOCTYPE')) {
            formattedHtml = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${projectName}</title>\n</head>\n<body>\n${html}\n</body>\n</html>`;
        }

        fs.writeFileSync(path.join(projectPath, 'index.html'), formattedHtml);

        // Save to database
        const project = new Project({
            projectId,
            userId: req.userId,
            name: projectName,
            type: 'html',
            url: `/projects/${projectId}/`,
            fileSize: Buffer.byteLength(formattedHtml, 'utf8'),
            files: ['index.html'],
            status: 'active'
        });

        await project.save();

        // Update user's projects
        await User.findByIdAndUpdate(req.userId, {
            $push: { projects: project._id }
        });

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const fullUrl = `${baseUrl}/projects/${projectId}/`;

        res.json({
            success: true,
            message: '✅ HTML code uploaded successfully',
            data: {
                ...project.toObject(),
                url: fullUrl
            }
        });

    } catch (error) {
        console.error('HTML upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error. Please try again.' 
        });
    }
});

// Get user's projects
app.get('/api/projects/my-projects', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const projects = await Project.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Project.countDocuments({ userId: req.userId });

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        
        const projectsWithUrls = projects.map(project => ({
            ...project.toObject(),
            fullUrl: `${baseUrl}${project.url}`
        }));

        res.json({
            success: true,
            data: {
                projects: projectsWithUrls,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Get single project
app.get('/api/projects/:projectId', auth, async (req, res) => {
    try {
        const project = await Project.findOne({ 
            projectId: req.params.projectId,
            userId: req.userId 
        });
        
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                error: 'Project not found' 
            });
        }

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        
        res.json({
            success: true,
            data: {
                ...project.toObject(),
                fullUrl: `${baseUrl}${project.url}`
            }
        });

    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Delete project
app.delete('/api/projects/:projectId', auth, async (req, res) => {
    try {
        const project = await Project.findOne({ 
            projectId: req.params.projectId,
            userId: req.userId 
        });
        
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                error: 'Project not found' 
            });
        }

        // Delete files
        const projectPath = path.join(uploadsDir, project.projectId);
        if (fs.existsSync(projectPath)) {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }

        // Delete from database
        await Project.deleteOne({ _id: project._id });

        // Remove from user
        await User.findByIdAndUpdate(req.userId, {
            $pull: { projects: project._id }
        });

        res.json({ 
            success: true, 
            message: '✅ Project deleted successfully' 
        });

    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Update project
app.put('/api/projects/:projectId', auth, async (req, res) => {
    try {
        const { name, description, isPublic } = req.body;
        
        const project = await Project.findOneAndUpdate(
            { projectId: req.params.projectId, userId: req.userId },
            { name, description, isPublic },
            { new: true }
        );
        
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                error: 'Project not found' 
            });
        }

        res.json({
            success: true,
            message: '✅ Project updated successfully',
            data: project
        });

    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Track project view (public)
app.post('/api/projects/:projectId/view', async (req, res) => {
    try {
        const project = await Project.findOneAndUpdate(
            { projectId: req.params.projectId },
            { $inc: { views: 1 } },
            { new: true }
        );

        res.json({
            success: true,
            views: project?.views || 0
        });

    } catch (error) {
        res.json({ success: false });
    }
});

// Get public projects (for homepage)
app.get('/api/projects/public/recent', async (req, res) => {
    try {
        const projects = await Project.find({ isPublic: true })
            .sort({ createdAt: -1 })
            .limit(6)
            .populate('userId', 'username');

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        
        const projectsWithUrls = projects.map(project => ({
            id: project.projectId,
            name: project.name,
            type: project.type,
            views: project.views,
            username: project.userId?.username || 'Anonymous',
            url: `${baseUrl}${project.url}`,
            createdAt: project.createdAt
        }));

        res.json({
            success: true,
            data: projectsWithUrls
        });

    } catch (error) {
        console.error('Get public projects error:', error);
        res.json({ success: false, data: [] });
    }
});

// Get stats
app.get('/api/stats', async (req, res) => {
    try {
        const totalProjects = await Project.countDocuments();
        const totalUsers = await User.countDocuments();
        const totalViews = await Project.aggregate([
            { $group: { _id: null, total: { $sum: "$views" } } }
        ]);

        res.json({
            success: true,
            data: {
                totalProjects,
                totalUsers,
                totalViews: totalViews[0]?.total || 0
            }
        });

    } catch (error) {
        res.json({ 
            success: true, 
            data: { totalProjects: 0, totalUsers: 0, totalViews: 0 }
        });
    }
});

// ============ ERROR HANDLING ============

app.use((err, req, res, next) => {
    console.error(err.stack);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                error: 'File too large. Maximum size is 100MB.' 
            });
        }
    }
    
    res.status(500).json({ 
        success: false, 
        error: err.message || 'Server error' 
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Endpoint not found' 
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════╗
    ║     🚀 SILA WEB HOSTING - BACKEND v2.0      ║
    ╠══════════════════════════════════════════════╣
    ║  Status:     ✅ RUNNING                      ║
    ║  Port:       📡 ${PORT}                          ║
    ║  MongoDB:    💾 CONNECTED                    ║
    ║  JWT Auth:   🔐 ACTIVE                       ║
    ║  Email:      📧 GMAIL READY                  ║
    ║  Uploads:    📁 ${uploadsDir}    ║
    ╚══════════════════════════════════════════════╝
    `);
});