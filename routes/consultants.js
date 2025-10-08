const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const nodemailer = require('nodemailer');
// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dthakur827@gmail.com',
    pass: 'awchmbcoreigpltn',
  },
});

const DEFAULT_PASSWORD = 'Test@1234';

function generateConsultantId(count) {
  return `CONS${String(count).padStart(4, '0')}`;
}

async function getNextConsultantId() {
  const countQuery = `SELECT COUNT(*) FROM consultants WHERE consultant_id LIKE 'CONS%'`;
  const result = await client.query(countQuery);
  const count = parseInt(result.rows[0].count, 10) + 1;
  return generateConsultantId(count);
}

async function sendWelcomeEmail(email, password) {
  const mailOptions = {
    from: 'dthakur827@gmail.com',
    to: email,
    subject: 'Welcome to the Consultant Portal',
    text: `Hello,

Welcome to the Consultant Portal!

Your account has been created successfully.

Your temporary login credentials:
Email: ${email}
Password: ${password}

Please log in and change your password after your first login.

Best regards,
Spintel Team`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.error(`Failed to send welcome email to ${email}:`, err.message);
  }
}

/**
 * @swagger
 * /consultants:
 *   post:
 *     summary: Add a new consultant
 *     tags:
 *       - Consultants
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               consultant_id:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               org_mapping:
 *                 type: array
 *                 items:
 *                   type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *               status:
 *                 type: string
 *               consultant_organisation_name:
 *                 type: string
 *             required:
 *               - consultant_id
 *               - first_name
 *               - last_name
 *               - email
 *               - status
 *               - org_mapping
 *     responses:
 *       200:
 *         description: Insertion was successful
 *       500:
 *         description: Insertion failed
 */
router.post('/', async (req, res) => {
  const c = req.body;

  try {
    const consultantId = await getNextConsultantId();

    const orgMappingArray = Array.isArray(c.org_mapping)
      ? c.org_mapping
      : typeof c.org_mapping === 'string'
        ? c.org_mapping.split(',').map(s => s.trim())
        : [];

    const query = `
      INSERT INTO consultants(
        consultant_id,
        first_name,
        last_name,
        org_mapping,
        email,
        phone,
        role,
        status,
        consultant_organisation_name,
        password
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    const values = [
      consultantId,
      c.first_name,
      c.last_name,
      orgMappingArray,
      c.email,
      c.phone,
      c.role,
      c.status,
      c.consultant_organisation_name,
      DEFAULT_PASSWORD
    ];

    await client.query(query, values);

    // Send welcome email
    await sendWelcomeEmail(c.email, DEFAULT_PASSWORD);

    res.send(`Insertion was successful with consultant_id: ${consultantId}`);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Insertion failed');
  }
});

/**
 * @swagger
 * /consultants:
 *   get:
 *     summary: Get all consultants with pagination
 *     tags:
 *       - Consultants
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: A paginated list of consultants
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
 *                       consultant_id:
 *                         type: string
 *                       first_name:
 *                         type: string
 *                       last_name:
 *                         type: string
 *                       org_mapping:
 *                         type: array
 *                         items:
 *                           type: string
 *                       email:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       role:
 *                         type: string
 *                       status:
 *                         type: string
 *                       consultant_organisation_name:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       500:
 *         description: Error fetching consultants
 */

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    try {
        const dataQuery = `SELECT * FROM consultants ORDER BY consultant_id LIMIT $1 OFFSET $2`;
        const countQuery = `SELECT COUNT(*) FROM consultants`;

        const [dataResult, countResult] = await Promise.all([
            client.query(dataQuery, [limit, offset]),
            client.query(countQuery)
        ]);

        const total = parseInt(countResult.rows[0].count, 10);

        res.json({
            data: dataResult.rows,
            total,
            page,
            limit
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error fetching consultants');
    }
});


/**
 * @swagger
 * /consultants/{consultant_id}:
 *   put:
 *     summary: Update consultant details
 *     tags:
 *       - Consultants
 *     description: Updates the details of an existing consultant.
 *     parameters:
 *       - in: path
 *         name: consultant_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the consultant to update
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
 *               org_mapping:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *               status:
 *                 type: string
 *               consultant_organisation_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Update was successful
 *       404:
 *         description: Consultant not found
 *       500:
 *         description: Update failed due to server error
 */

router.put('/:consultant_id', (req, res) => {
    const consultant_id = req.params.consultant_id;
    const c = req.body;

    const query = `
        UPDATE consultants SET
            first_name = $1,
            last_name = $2,
            org_mapping = $3,
            email = $4,
            phone = $5,
            role = $6,
            status = $7,
            consultant_organisation_name = $8
        WHERE consultant_id = $9
    `;

    const values = [
        c.first_name,
        c.last_name,
        c.org_mapping,
        c.email,
        c.phone,
        c.role,
        c.status,
        c.consultant_organisation_name,
        consultant_id
    ];

    client.query(query, values, (err, result) => {
        if (!err) {
            if (result.rowCount === 0) {
                res.status(404).send('Consultant not found');
            } else {
                res.send('Update was successful');
            }
        } else {
            console.error(err.message);
            res.status(500).send('Update failed');
        }
    });
});

/**
 * @swagger
 * /consultants/{consultant_id}/activate:
 *   patch:
 *     summary: Activate a consultant
 *     tags:
 *       - Consultants
 *     parameters:
 *       - in: path
 *         name: consultant_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the consultant to activate
 *     responses:
 *       200:
 *         description: Consultant activated successfully
 *       404:
 *         description: Consultant not found
 *       500:
 *         description: Server error
 */
router.patch('/:consultant_id/activate', async (req, res) => {
    const consultant_id = req.params.consultant_id;
    try {
        const result = await client.query(
            `UPDATE consultants SET status = 'active' WHERE consultant_id = $1`,
            [consultant_id]
        );
        if (result.rowCount === 0) {
            res.status(404).send('Consultant not found');
        } else {
            res.send('Consultant activated successfully');
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Failed to activate consultant');
    }
});

/**
 * @swagger
 * /consultants/{consultant_id}/deactivate:
 *   patch:
 *     summary: Deactivate a consultant
 *     tags:
 *       - Consultants
 *     parameters:
 *       - in: path
 *         name: consultant_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the consultant to deactivate
 *     responses:
 *       200:
 *         description: Consultant deactivated successfully
 *       404:
 *         description: Consultant not found
 *       500:
 *         description: Server error
 */
router.patch('/:consultant_id/deactivate', async (req, res) => {
    const consultant_id = req.params.consultant_id;
    try {
        const result = await client.query(
            `UPDATE consultants SET status = 'inactive' WHERE consultant_id = $1`,
            [consultant_id]
        );
        if (result.rowCount === 0) {
            res.status(404).send('Consultant not found');
        } else {
            res.send('Consultant deactivated successfully');
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Failed to deactivate consultant');
    }
});


module.exports = router;
