// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
    // Get token from cookie or header
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access denied. No token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if it's a temporary token (for OTP verification)
        if (decoded.temp) {
            return res.status(403).json({
                success: false,
                error: 'Please verify your email first',
                requiresOTP: true,
                email: decoded.email
            });
        }

        req.userId = decoded.userId;
        req.userEmail = decoded.email;
        req.username = decoded.username;
        
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired',
                expired: true
            });
        }
        
        res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
};