const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { setOtp, getOtp, deleteOtp } = require('../utils/otpStore');

// Use your own email and app password
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dthakur827@gmail.com',
    pass: 'awchmbcoreigpltn',
  },
});

// In-memory user store
const users = {};
const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register user with email and send OTP
 *     tags: [Auth]
 *     description: Sends OTP to the user's email for verification.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP sent to email
 *       400:
 *         description: User already exists and verified
 *       500:
 *         description: Failed to send OTP
 */
router.post('/register', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  // Check if user is already verified recently
  if (users[email] && users[email].verified) {
    const verifiedAt = users[email].verifiedAt || 0;
    if (Date.now() - verifiedAt < FIVE_MINUTES) {
      return res.status(400).json({ message: 'User already verified recently. Try again later.' });
    }
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with expiration (5 mins)
    setOtp(email, otp);

    // Send OTP
    await transporter.sendMail({
      from: 'dthakur827@gmail.com',
      to: email,
      subject: 'Your OTP for Verification',
      text: `Your OTP is: ${otp}`,
    });

    // Create or update user with verified: false
    users[email] = { email, verified: false };

    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(500).json({ message: 'Error sending OTP' });
  }
});

/**
 * @swagger
 * /auth/verify:
 *   post:
 *     summary: Verify OTP sent to email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 *       500:
 *         description: Server error
 */
router.post('/verify', (req, res) => {
  const { email, otp } = req.body;
  const stored = getOtp(email);

  if (!stored) {
    return res.status(400).json({ message: 'OTP not found or expired' });
  }

  if (Date.now() > stored.expiresAt) {
    deleteOtp(email);
    return res.status(400).json({ message: 'OTP expired' });
  }

  if (stored.otp !== otp) {
    return res.status(400).json({ message: 'Invalid OTP' });
  }

  users[email].verified = true;
  users[email].verifiedAt = Date.now(); // Set verified timestamp
  deleteOtp(email);

  res.json({ message: 'Email verified successfully' });
});

/**
 * @swagger
 * /auth/resend:
 *   post:
 *     summary: Resend OTP to email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP resent
 *       400:
 *         description: User already verified or email missing
 *       500:
 *         description: Failed to resend OTP
 */
router.post('/resend', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  if (users[email]?.verified) {
    const verifiedAt = users[email].verifiedAt || 0;
    if (Date.now() - verifiedAt < FIVE_MINUTES) {
      return res.status(400).json({ message: 'User already verified recently. Try again later.' });
    }
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP again with expiration
    setOtp(email, otp);

    await transporter.sendMail({
      from: 'dthakur827@gmail.com',
      to: email,
      subject: 'Resent OTP for Verification',
      text: `Your OTP is: ${otp}`,
    });

    res.json({ message: 'OTP resent to email' });
  } catch (err) {
    console.error('Resend OTP error:', err.message);
    res.status(500).json({ message: 'Error resending OTP' });
  }
});

module.exports = router;
