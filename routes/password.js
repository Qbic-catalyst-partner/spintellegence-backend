// routes/password.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authenticateToken } = require('../middleware/auth');
const client = require('../db/connection'); // your pg client

/**
 * @swagger
 * tags:
 *   name: Password
 *   description: APIs to change or update user password
 */
// /**
//  * @swagger
//  * /password/change-password:
//  *   post:
//  *     summary: Change user password
//  *     tags: [Password]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - user_id
//  *               - newPassword
//  *             properties:
//  *               user_id:
//  *                 type: string
//  *                 example: "UNI003"
//  *               newPassword:
//  *                 type: string
//  *                 example: newpass456
//  *     responses:
//  *       200:
//  *         description: Password changed successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 message:
//  *                   type: string
//  *                   example: Password changed successfully
//  *       400:
//  *         description: Missing required fields
//  *       404:
//  *         description: User not found
//  *       500:
//  *         description: Internal server error
//  */
// router.post('/change-password', async (req, res) => {
//   const { user_id, newPassword } = req.body;

//   if (!user_id || !newPassword) {
//     return res.status(400).json({ message: 'Missing required fields' });
//   }

//   try {
//     const userResult = await client.query('SELECT password FROM users WHERE user_id=$1', [user_id]);
//     if (userResult.rows.length === 0) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     const newHashedPassword = await bcrypt.hash(newPassword, 10);
//     await client.query('UPDATE users SET password=$1 WHERE user_id=$2', [newHashedPassword, user_id]);

//     res.json({ message: 'Password changed successfully' });
//   } catch (err) {
//     console.error('Error changing password:', err);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

/**
 * @swagger
 * /password/change-password:
 *   post:
 *     summary: Change user password in both users and approval_list tables
 *     tags: [Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *               newPassword:
 *                 type: string
 *                 example: newpass456
 *     responses:
 *       200:
 *         description: Password changed successfully in both tables
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/change-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const userResult = await client.query('SELECT password FROM users WHERE email=$1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // Begin transaction to ensure atomic update
    await client.query('BEGIN');

    // Update users table
    await client.query(
      'UPDATE users SET password=$1 WHERE email=$2',
      [newHashedPassword, email]
    );

    // Update approval_list table
    await client.query(
      'UPDATE approval_list SET password=$1 WHERE email=$2',
      [newHashedPassword, email]
    );

    // Commit transaction
    await client.query('COMMIT');

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    // Roll back on error to avoid partial update
    await client.query('ROLLBACK');
    console.error('Error changing password:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});




/**
 * @swagger
 * /password/update-password:
 *   post:
 *     summary: Update user password directly (e.g., admin or reset)
 *     tags: [Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - newPassword
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: "UNI003"
 *               newPassword:
 *                 type: string
 *                 example: newpass456
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password updated successfully
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/update-password', authenticateToken, async (req, res) => {
  const { user_id, newPassword } = req.body;

  if (!user_id || !newPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const userResult = await client.query('SELECT password FROM users WHERE user_id=$1', [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await client.query('UPDATE users SET password=$1 WHERE user_id=$2', [newHashedPassword, user_id]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /consultants/update-password:
 *   post:
 *     summary: Update consultant password (authenticated)
 *     tags: [Consultant Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consultant_id
 *               - newPassword
 *             properties:
 *               consultant_id:
 *                 type: string
 *                 example: "CONS123"
 *               newPassword:
 *                 type: string
 *                 example: newSecurePass123
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password updated successfully
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Consultant not found
 *       500:
 *         description: Internal server error
 */
router.post('/consultants/update-password', authenticateToken, async (req, res) => {
  const { consultant_id, newPassword } = req.body;

  if (!consultant_id || !newPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const consultant = await client.query('SELECT password FROM consultants WHERE consultant_id=$1', [consultant_id]);
    if (consultant.rows.length === 0) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await client.query(
      'UPDATE consultants SET password=$1 WHERE consultant_id=$2',
      [hashedPassword, consultant_id]
    );

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error updating consultant password:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /consultants/forgot-password:
 *   post:
 *     summary: Reset consultant password via email (forgot password)
 *     tags: [Consultant Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 example: consultant@example.com
 *               newPassword:
 *                 type: string
 *                 example: ResetPass@2025
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successfully
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Consultant not found
 *       500:
 *         description: Internal server error
 */
router.post('/consultants/forgot-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const consultant = await client.query('SELECT password FROM consultants WHERE email=$1', [email]);
    if (consultant.rows.length === 0) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await client.query(
      'UPDATE consultants SET password=$1 WHERE email=$2',
      [hashedPassword, email]
    );

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Error resetting consultant password:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});



module.exports = router;
