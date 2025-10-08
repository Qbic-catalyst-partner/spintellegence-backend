const express = require('express');
const router = express.Router();
const client = require('../db/connection');

/**
 * @swagger
 * /organisation:
 *   post:
 *     summary: Create a new organisation
 *     tags:
 *       - Organisation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               org_name:
 *                 type: string
 *               org_code:
 *                 type: string
 *               poc_name:
 *                 type: string
 *               poc_email:
 *                 type: string
 *               poc_contact_no:
 *                 type: string
 *               user_count:
 *                 type: integer
 *               gst_count:
 *                 type: integer
 *               spindle_count:
 *                 type: integer
 *               pan:
 *                 type: string
 *               cin:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               billing_address:
 *                 type: string
 *               mill_address:
 *                 type: string
 *               status:
 *                 type: string
 *             required:
 *               - org_id
 *               - org_name
 *               - org_code
 *               - poc_name
 *               - poc_email
 *               - status
 *     responses:
 *       200:
 *         description: Insertion was successful
 *       500:
 *         description: Insertion failed
 */
function generateOrgId(count) {
    return `ORG${String(count).padStart(4, '0')}`;
}

async function getNextOrgId() {
    const countQuery = `SELECT COUNT(*) FROM organisation WHERE org_id LIKE 'ORG%'`;
    const result = await client.query(countQuery);
    const count = parseInt(result.rows[0].count, 10) + 1;
    return generateOrgId(count);
}

router.post('/', async (req, res) => {
    const o = req.body;

    try {
        const orgId = await getNextOrgId();

        const query = `
            INSERT INTO organisation(
                org_id, org_name, org_code, poc_name, poc_email, poc_contact_no,
                user_count, gst_count, spindle_count, pan, cin, logo_url,
                billing_address, mill_address, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `;

        const values = [
            orgId,
            o.org_name,
            o.org_code,
            o.poc_name,
            o.poc_email,
            o.poc_contact_no,
            o.user_count,
            o.gst_count,
            o.spindle_count,
            o.pan,
            o.cin,
            o.logo_url,
            o.billing_address,
            o.mill_address,
            o.status
        ];

        await client.query(query, values);
        res.send(`Insertion was successful with org_id: ${orgId}`);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Insertion failed');
    }
});


/**
 * @swagger
 * /organisation:
 *   get:
 *     summary: Get all organisations with pagination
 *     tags:
 *       - Organisation
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
 *         description: A paginated list of organisations
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
 *                       org_id:
 *                         type: string
 *                       org_name:
 *                         type: string
 *                       org_code:
 *                         type: string
 *                       poc_name:
 *                         type: string
 *                       poc_email:
 *                         type: string
 *                       poc_contact_no:
 *                         type: string
 *                       user_count:
 *                         type: integer
 *                       gst_count:
 *                         type: integer
 *                       spindle_count:
 *                         type: integer
 *                       pan:
 *                         type: string
 *                       cin:
 *                         type: string
 *                       logo_url:
 *                         type: string
 *                       billing_address:
 *                         type: string
 *                       mill_address:
 *                         type: string
 *                       status:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       500:
 *         description: Error fetching organisation
 */

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        const dataQuery = 'SELECT * FROM organisation LIMIT $1 OFFSET $2';
        const countQuery = 'SELECT COUNT(*) FROM organisation';

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
        res.status(500).send('Error fetching organisation');
    }
});


/**
 * @swagger
 * /organisation/{org_id}:
 *   put:
 *     summary: Update organisation details
 *     tags:
 *       - Organisation
 *     parameters:
 *       - in: path
 *         name: org_id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the organisation to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               org_name:
 *                 type: string
 *               org_code:
 *                 type: string
 *               poc_name:
 *                 type: string
 *               poc_email:
 *                 type: string
 *               poc_contact_no:
 *                 type: string
 *               user_count:
 *                 type: integer
 *               gst_count:
 *                 type: integer
 *               spindle_count:
 *                 type: integer
 *               pan:
 *                 type: string
 *               cin:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               billing_address:
 *                 type: string
 *               mill_address:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Update was successful
 *       500:
 *         description: Update failed
 */

router.put('/:org_id', (req, res) => {
    const org_id = req.params.org_id;
    const o = req.body;

    const query = `
        UPDATE organisation SET
            org_name = $1,
            org_code = $2,
            poc_name = $3,
            poc_email = $4,
            poc_contact_no = $5,
            user_count = $6,
            gst_count = $7,
            spindle_count = $8,
            pan = $9,
            cin = $10,
            logo_url = $11,
            billing_address = $12,
            mill_address = $13,
            status = $14
        WHERE org_id = $15
    `;

    const values = [
        o.org_name,
        o.org_code,
        o.poc_name,
        o.poc_email,
        o.poc_contact_no,
        o.user_count,
        o.gst_count,
        o.spindle_count,
        o.pan,
        o.cin,
        o.logo_url,
        o.billing_address,
        o.mill_address,
        o.status,
        org_id
    ];

    client.query(query, values, (err) => {
        if (!err) res.send('Update was successful');
        else {
            console.error(err.message);
            res.status(500).send('Update failed');
        }
    });
});

/**
 * @swagger
 * /organisation/{org_id}/activate:
 *   patch:
 *     summary: Activate an organisation
 *     tags:
 *       - Organisation
 *     parameters:
 *       - in: path
 *         name: org_id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the organisation to activate
 *     responses:
 *       200:
 *         description: Organisation activated successfully
 *       404:
 *         description: Organisation not found
 *       500:
 *         description: Failed to activate organisation
 */

router.patch('/:org_id/activate', (req, res) => {
    const org_id = req.params.org_id;
    const query = `UPDATE organisation SET status = 'Active' WHERE org_id = $1`;

    client.query(query, [org_id], (err, result) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Failed to activate organisation');
        }

        if (result.rowCount === 0) {
            return res.status(404).send('Organisation not found');
        }

        res.send('Organisation activated successfully');
    });
});

/**
 * @swagger
 * /organisation/{org_id}/deactivate:
 *   patch:
 *     summary: Deactivate an organisation
 *     tags:
 *       - Organisation
 *     parameters:
 *       - in: path
 *         name: org_id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the organisation to deactivate
 *     responses:
 *       200:
 *         description: Organisation deactivated successfully
 *       404:
 *         description: Organisation not found
 *       500:
 *         description: Failed to deactivate organisation
 */


router.patch('/:org_id/deactivate', (req, res) => {
    const org_id = req.params.org_id;
    const query = `UPDATE organisation SET status = 'Deactive' WHERE org_id = $1`;

    client.query(query, [org_id], (err, result) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Failed to deactivate organisation');
        }

        if (result.rowCount === 0) {
            return res.status(404).send('Organisation not found');
        }

        res.send('Organisation deactivated successfully');
    });
});

/**
 * @swagger
 * /organisation/names:
 *   get:
 *     summary: Get all organisation names with their IDs
 *     tags:
 *       - Organisation
 *     responses:
 *       200:
 *         description: A list of organisation names and IDs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   org_id:
 *                     type: string
 *                     example: ORG001
 *                   org_name:
 *                     type: string
 *                     example: Cotton Mills Ltd              
 *       500:
 *         description: Error fetching organisation names
 */
router.get('/names', async (req, res) => {
    try {
        const result = await client.query(
            'SELECT org_id, org_code, org_name FROM organisation ORDER BY org_name ASC'
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching organisation names:', err.message);
        res.status(500).send('Error fetching organisation names');
    }
});

module.exports = router;
