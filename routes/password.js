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
 *     summary: Change user password (requires old password)
 *     tags: [Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: "UNI003"
 *               oldPassword:
 *                 type: string
 *                 example: oldpass123
 *               newPassword:
 *                 type: string
 *                 example: newpass456
 *     responses:
 *       200:
 *         description: Password changed successfully
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
 *       401:
 *         description: Old password incorrect
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/change-password', async (req, res) => {
  const { user_id, oldPassword, newPassword } = req.body;

  if (!user_id || !oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const userResult = await client.query('SELECT password FROM users WHERE user_id=$1', [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const hashedPassword = userResult.rows[0].password;
    const isMatch = await bcrypt.compare(oldPassword, hashedPassword);

    if (!isMatch) {
      return res.status(401).json({ message: 'Old password is incorrect' });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await client.query('UPDATE users SET password=$1 WHERE user_id=$2', [newHashedPassword, user_id]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
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
router.post('/update-password',authenticateToken, async (req, res) => {
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

module.exports = router;
