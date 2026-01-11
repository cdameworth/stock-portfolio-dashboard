/**
 * Email Service - Handles sending emails for password resets and notifications
 */

const nodemailer = require('nodemailer');
const aws = require('@aws-sdk/client-ses');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'email-service' },
  transports: [
    new winston.transports.Console()
  ]
});

class EmailService {
  constructor(options = {}) {
    this.transporter = null;
    this.sesClient = null;
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@stock-portfolio.net';
    this.baseUrl = process.env.BASE_URL || 'https://stock-portfolio.net';
    this.useAwsSes = process.env.EMAIL_PROVIDER === 'ses' || process.env.AWS_REGION;
    
    this.initializeTransporter();
  }
  
  initializeTransporter() {
    // Try to use AWS SES first
    if (this.useAwsSes) {
      try {
        this.sesClient = new aws.SESClient({
          region: process.env.AWS_REGION || 'us-east-1'
        });
        
        // Create nodemailer transporter with SES
        this.transporter = nodemailer.createTransport({
          SES: { 
            ses: this.sesClient,
            aws: aws
          }
        });
        
        logger.info('Email service initialized with AWS SES');
        return;
      } catch (error) {
        logger.error('Failed to initialize AWS SES, falling back to SMTP:', error);
      }
    }
    
    // Fallback to SMTP if SES fails or not configured
    if (process.env.SMTP_HOST) {
      const config = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      };
      
      // Handle different email providers
      if (process.env.EMAIL_PROVIDER === 'gmail') {
        config.service = 'gmail';
      } else if (process.env.EMAIL_PROVIDER === 'sendgrid') {
        config.host = 'smtp.sendgrid.net';
        config.port = 587;
        config.auth = {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        };
      }
      
      this.transporter = nodemailer.createTransporter(config);
      
      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('Email service configuration error:', error);
          this.useConsoleFallback = true;
        } else {
          logger.info('Email service ready to send messages via SMTP');
        }
      });
    } else {
      logger.warn('No email configuration found. Email service will use console logging for development.');
      this.useConsoleFallback = true;
    }
  }
  
  async sendPasswordResetEmail(email, resetToken, userName = '') {
    const resetUrl = `${this.baseUrl}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject: 'Reset Your Password - Stock Portfolio Dashboard',
      html: this.generatePasswordResetHTML(resetUrl, userName),
      text: this.generatePasswordResetText(resetUrl, userName)
    };
    
    return this.sendEmail(mailOptions);
  }
  
  async sendPasswordResetConfirmation(email, userName = '') {
    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject: 'Password Successfully Reset - Stock Portfolio Dashboard',
      html: this.generatePasswordResetConfirmationHTML(userName),
      text: this.generatePasswordResetConfirmationText(userName)
    };
    
    return this.sendEmail(mailOptions);
  }
  
  async sendEmail(mailOptions) {
    try {
      if (this.useConsoleFallback) {
        // Development fallback - log email to console
        console.log('\n=== EMAIL SERVICE (Development Mode) ===');
        console.log('TO:', mailOptions.to);
        console.log('SUBJECT:', mailOptions.subject);
        console.log('--- EMAIL CONTENT ---');
        console.log(mailOptions.text);
        console.log('--- END EMAIL ---\n');
        
        logger.info('Email would be sent (development mode):', {
          to: mailOptions.to,
          subject: mailOptions.subject,
          text: mailOptions.text
        });
        return { success: true, messageId: 'dev-mode-' + Date.now() };
      }
      
      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully:', {
        messageId: info.messageId,
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Failed to send email:', {
        error: error.message,
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      throw new Error('Failed to send email: ' + error.message);
    }
  }
  
  generatePasswordResetHTML(resetUrl, userName) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f8f9fa; }
        .button { display: inline-block; padding: 12px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Stock Portfolio Dashboard</h1>
        </div>
        <div class="content">
            <h2>Reset Your Password</h2>
            ${userName ? `<p>Hi ${userName},</p>` : '<p>Hello,</p>'}
            <p>We received a request to reset your password for your Stock Portfolio Dashboard account.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 3px;">
                ${resetUrl}
            </p>
            <div class="warning">
                <strong>Important:</strong> This link will expire in 1 hour for security reasons. If you didn't request this password reset, please ignore this email.
            </div>
        </div>
        <div class="footer">
            <p>© 2025 Stock Portfolio Dashboard. All rights reserved.</p>
            <p>If you're having trouble clicking the button, copy and paste the URL above into your web browser.</p>
        </div>
    </div>
</body>
</html>`;
  }
  
  generatePasswordResetText(resetUrl, userName) {
    return `
Stock Portfolio Dashboard - Reset Your Password

${userName ? `Hi ${userName},` : 'Hello,'}

We received a request to reset your password for your Stock Portfolio Dashboard account.

Click the link below to reset your password:
${resetUrl}

Important: This link will expire in 1 hour for security reasons. If you didn't request this password reset, please ignore this email.

© 2025 Stock Portfolio Dashboard. All rights reserved.`;
  }
  
  generatePasswordResetConfirmationHTML(userName) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Successful</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f8f9fa; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Stock Portfolio Dashboard</h1>
        </div>
        <div class="content">
            <h2>Password Reset Successful</h2>
            ${userName ? `<p>Hi ${userName},</p>` : '<p>Hello,</p>'}
            <p>Your password has been successfully reset for your Stock Portfolio Dashboard account.</p>
            <p>You can now log in with your new password at:</p>
            <p><strong>https://stock-portfolio.net</strong></p>
            <p>If you didn't make this change or have any concerns, please contact our support team immediately.</p>
        </div>
        <div class="footer">
            <p>© 2025 Stock Portfolio Dashboard. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }
  
  generatePasswordResetConfirmationText(userName) {
    return `
Stock Portfolio Dashboard - Password Reset Successful

${userName ? `Hi ${userName},` : 'Hello,'}

Your password has been successfully reset for your Stock Portfolio Dashboard account.

You can now log in with your new password at:
https://stock-portfolio.net

If you didn't make this change or have any concerns, please contact our support team immediately.

© 2025 Stock Portfolio Dashboard. All rights reserved.`;
  }
}

module.exports = EmailService;