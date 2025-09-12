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
router.post('/update-password', authenticateToken, async (req, res) => {
  const { user_id, newPassword } = req.body;

  if (!user_id || !newPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Optional: Enforce strong password rules
  const isStrongPassword = (password) => {
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/;
    return strongPasswordRegex.test(password);
  };

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: 'Password does not meet strength requirements' });
  }

  const clientConnection = await client.connect();

  try {
    await clientConnection.query('BEGIN');

    // Check if user exists
    const userResult = await clientConnection.query(
      'SELECT user_id FROM users WHERE user_id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      await clientConnection.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in users table
    await clientConnection.query(
      'UPDATE users SET password = $1 WHERE user_id = $2',
      [newHashedPassword, user_id]
    );

    // Update password in approval_list table
    await clientConnection.query(
      'UPDATE approval_list SET password = $1 WHERE user_id = $2',
      [newHashedPassword, user_id]
    );

    await clientConnection.query('COMMIT');

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    await clientConnection.query('ROLLBACK');
    console.error('Error updating password:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    clientConnection.release();
  }
});

module.exports = router;
