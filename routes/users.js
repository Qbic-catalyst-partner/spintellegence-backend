const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const client = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
/**
 * @swagger
 * /users:
 *   post:
 *     summary: Register a new user in the approval list
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               org_code:
 *                 type: string
 *               role:
 *                 type: string
 *               email:
 *                 type: string
 *               contact_number:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User registration successful
 *       500:
 *         description: Error during registration
 */

function getPrefix(orgCode) {
    return orgCode.trim().toUpperCase().substring(0, 3);
}

async function generateUserId(orgCode) {
    const prefix = getPrefix(orgCode);
    const countQuery = `SELECT COUNT(*) FROM approval_list WHERE user_id::text LIKE $1`;
    const countResult = await client.query(countQuery, [`${prefix}%`]);
    const count = parseInt(countResult.rows[0].count, 10) + 1;
    const padded = String(count).padStart(3, '0');
    return `${prefix}${padded}`;
}

router.post('/', async (req, res) => {
    const user = req.body;

    try {
        const userId = await generateUserId(user.org_code);
        const hashedPassword = await bcrypt.hash(user.password, 10);

        const insertQuery = `
            INSERT INTO approval_list(
                user_id, first_name, last_name, org_code, role, email, contact_number,
                status, created_time, password
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), $8)
        `;

        const values = [
            userId,
            user.first_name,
            user.last_name,
            user.org_code,
            user.role,
            user.email,
            user.contact_number,
            hashedPassword
        ];

        await client.query(insertQuery, values);
        res.send(`User registration successful with user_id: ${userId}`);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error during registration');
    }
});

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: Login user and get JWT token
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               org_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: User logged in successfully, returns JWT token and user details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     org_code:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: User not found or invalid credentials
 *       500:
 *         description: Login failed
 */
router.post('/login', async (req, res) => {
    const { email, password, org_code } = req.body;

    try {
        // Step 1: Fetch user info from `users` table
        const userResult = await client.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0)
            return res.status(400).send('User not found');

        const user = userResult.rows[0];

        if (user.org_code !== org_code)
            return res.status(401).send('Invalid organization code');

        // Step 2: Fetch hashed password from `approval_list` for the same email
        const approvalResult = await client.query('SELECT password FROM approval_list WHERE email = $1', [email]);

        if (approvalResult.rows.length === 0)
            return res.status(400).send('Password record not found');

        const hashedPassword = approvalResult.rows[0].password;

        // Step 3: Compare password
        const isMatch = await bcrypt.compare(password, hashedPassword);
        if (!isMatch)
            return res.status(401).send('Invalid credentials');

        // Step 4: Generate and return token with extended user details
        const token = jwt.sign(
            {
                user_id: user.user_id,
                email: user.email,
                org_code: user.org_code,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            token,
            user: {
                user_id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                org_code: user.org_code,
                status: user.status,
                contact_number: user.contact_number
            }
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).send('Login failed');
    }
});


/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get a list of all users (authentication required)
 *     tags:
 *       - Users
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of users (excluding passwords)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   user_id:
 *                     type: string
 *                   first_name:
 *                     type: string
 *                   last_name:
 *                     type: string
 *                   org_code:
 *                     type: string
 *                   role:
 *                     type: string
 *                   email:
 *                     type: string
 *                   contact_number:
 *                     type: string
 *                   status:
 *                     type: string
 *                   created_time:
 *                     type: string
 *                     format: date-time
 *                   update_time:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized - JWT token required
 *       500:
 *         description: Database error
 */
router.get('/', authenticateToken, (req, res) => {
    client.query('SELECT * FROM users', (err, result) => {
        if (err) return res.status(500).send("Database error");

        const usersWithoutPasswords = result.rows.map(u => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
        });

        res.send(usersWithoutPasswords);
    });
});

/**
 * @swagger
 * /users/user_list:
 *   get:
 *     summary: Get all users with pagination
 *     tags:
 *       - Users
 *     description: Retrieve a paginated list of users.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: A paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       500:
 *         description: Server error
 */

router.get('/user_list', authenticateToken, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        const dataQuery = 'SELECT * FROM users LIMIT $1 OFFSET $2';
        const countQuery = 'SELECT COUNT(*) FROM users';

        const dataResult = await client.query(dataQuery, [limit, offset]);
        const countResult = await client.query(countQuery);

        const total = parseInt(countResult.rows[0].count);

        res.json({
            data: dataResult.rows,
            total,
            page,
            limit
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error fetching users');
    }
});
/**
 * @swagger
 * /users/consultants/login:
 *   post:
 *     summary: Login consultants and get JWT token
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Consultant logged in successfully, returns JWT token and consultant details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 consultant:
 *                   type: object
 *                   properties:
 *                     consultant_id:
 *                       type: string
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     status:
 *                       type: string
 *                     consultant_organisation_name:
 *                       type: string
 *                     phone:
 *                       type: string
 *       400:
 *         description: Consultant not found or invalid credentials
 *       500:
 *         description: Login failed
 */
router.post('/consultants/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await client.query(
      'SELECT * FROM consultants WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).send('Consultant not found');
    }

    const consultant = result.rows[0];
    const storedPassword = consultant.password;

    let isMatch = false;

    // Step 1: Try bcrypt comparison if password looks hashed
    if (storedPassword && storedPassword.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, storedPassword);
    } else {
      // Step 2: Fall back to plain-text comparison
      isMatch = password === storedPassword;

      // Step 3 (optional): Rehash plain-text password to bcrypt and update DB
      if (isMatch) {
        const hashed = await bcrypt.hash(password, 10);
        await client.query(
          'UPDATE consultants SET password = $1 WHERE consultant_id = $2',
          [hashed, consultant.consultant_id]
        );
        console.log(`Password for ${consultant.email} upgraded to bcrypt.`);
      }
    }

    if (!isMatch) {
      return res.status(401).send('Invalid credentials');
    }

    // Step 4: Generate JWT token
    const token = jwt.sign(
      {
        consultant_id: consultant.consultant_id,
        email: consultant.email,
        role: consultant.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Step 5: Send response
    res.json({
      token,
      consultant: {
        consultant_id: consultant.consultant_id,
        first_name: consultant.first_name,
        last_name: consultant.last_name,
        email: consultant.email,
        role: consultant.role,
        status: consultant.status,
        consultant_organisation_name: consultant.consultant_organisation_name,
        phone: consultant.phone
      }
    });

  } catch (err) {
    console.error('Consultant login error:', err.message);
    res.status(500).send('Login failed');
  }
});


module.exports = router;
