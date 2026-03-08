// backend/utils/emailService.js
const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'silatechnology@gmail.com',
        pass: 'swgp tpof kcvr zufs' // App password
    }
});

// Send OTP Email
const sendOTPEmail = async (to, otp) => {
    const mailOptions = {
        from: '"SILA WEB HOSTING" <silatechnology@gmail.com>',
        to: to,
        subject: 'Verify Your Email - SILA WEB HOSTING',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }
                .header {
                    background: linear-gradient(135deg, #0066ff, #00cc99);
                    padding: 40px;
                    text-align: center;
                }
                .header h1 {
                    color: white;
                    margin: 0;
                    font-size: 32px;
                    font-weight: 800;
                }
                .content {
                    padding: 40px;
                    text-align: center;
                }
                .otp-code {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    font-size: 48px;
                    font-weight: 900;
                    letter-spacing: 10px;
                    padding: 20px;
                    border-radius: 15px;
                    margin: 30px 0;
                    display: inline-block;
                    font-family: monospace;
                }
                .message {
                    color: #666;
                    font-size: 16px;
                    line-height: 1.6;
                    margin-bottom: 30px;
                }
                .footer {
                    background: #f5f5f5;
                    padding: 30px;
                    text-align: center;
                    color: #999;
                    font-size: 14px;
                }
                .warning {
                    color: #ff3366;
                    font-size: 14px;
                    margin-top: 20px;
                }
                .button {
                    background: linear-gradient(135deg, #0066ff, #00cc99);
                    color: white;
                    padding: 15px 30px;
                    text-decoration: none;
                    border-radius: 8px;
                    display: inline-block;
                    margin-top: 20px;
                    font-weight: 600;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SILA WEB HOSTING</h1>
                </div>
                <div class="content">
                    <h2>Verify Your Email Address</h2>
                    <p class="message">Thank you for registering with SILA WEB HOSTING! Please use the following OTP code to verify your email address. This code will expire in 10 minutes.</p>
                    
                    <div class="otp-code">${otp}</div>
                    
                    <p class="message">If you didn't request this, please ignore this email.</p>
                    
                    <a href="http://localhost:5000/verify-otp.html?email=${to}" class="button">Verify Email</a>
                    
                    <p class="warning">⚠️ Never share this OTP with anyone. Our team will never ask for your OTP.</p>
                </div>
                <div class="footer">
                    <p>© 2024 SILA WEB HOSTING. All rights reserved.</p>
                    <p>Need help? Contact us at support@silawebhosting.com</p>
                </div>
            </div>
        </body>
        </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ OTP email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        throw error;
    }
};

// Send Welcome Email
const sendWelcomeEmail = async (to, username) => {
    const mailOptions = {
        from: '"SILA WEB HOSTING" <silatechnology@gmail.com>',
        to: to,
        subject: 'Welcome to SILA WEB HOSTING! 🚀',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #0066ff, #00cc99); padding: 40px; text-align: center; }
                .header h1 { color: white; margin: 0; }
                .content { padding: 40px; }
                .button { background: linear-gradient(135deg, #0066ff, #00cc99); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to SILA WEB HOSTING!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${username}! 👋</h2>
                    <p>Your account has been successfully verified. You can now start hosting your websites for free!</p>
                    <p>Features available to you:</p>
                    <ul>
                        <li>✅ Upload ZIP files</li>
                        <li>✅ Paste HTML code</li>
                        <li>✅ Free SSL certificates</li>
                        <li>✅ View analytics</li>
                        <li>✅ 100MB per project</li>
                    </ul>
                    <a href="http://localhost:5000/dashboard.html" class="button">Go to Dashboard</a>
                </div>
            </div>
        </body>
        </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Welcome email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('❌ Welcome email failed:', error);
        return false;
    }
};

module.exports = { sendOTPEmail, sendWelcomeEmail };