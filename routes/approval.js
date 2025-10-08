const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const bcrypt = require('bcryptjs');

/**
 * @swagger
 * /approval/approve/{user_id}:
 *   post:
 *     summary: Approve a user from approval_list and move to users table
 *     tags:
 *       - Approval
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to approve
 *     responses:
 *       200:
 *         description: User approved and moved to users table
 *       404:
 *         description: User not found or not in approved status
 *       500:
 *         description: Error approving user
 */
router.post('/approve/:user_id', async (req, res) => {
    const userId = req.params.user_id;

    try {
        const fetchQuery = `SELECT * FROM approval_list WHERE user_id = $1`;
        const fetchResult = await client.query(fetchQuery, [userId]);

        if (fetchResult.rows.length === 0) {
            return res.status(404).send('User not found or not in approved status');
        }

        const user = fetchResult.rows[0];

        const updateStatusQuery = `UPDATE approval_list SET status = 'approved' WHERE user_id = $1`;
        await client.query(updateStatusQuery, [userId]);

        const hashedPassword = await bcrypt.hash(user.password, 10);

        const insertQuery = `
            INSERT INTO users (
                user_id, first_name, last_name, org_code, role, email, contact_number,
                status, created_time, password
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), $8)
        `;

        await client.query(insertQuery, [
            user.user_id,
            user.first_name,
            user.last_name,
            user.org_code,
            user.role,
            user.email,
            user.contact_number,
            hashedPassword
        ]);

        res.send('User approved and moved to users table');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error approving user');
    }
});


/**
 * @swagger
 * /approval/reject:
 *   post:
 *     summary: Reject a user from the approval list
 *     tags:
 *       - Approval
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: "123"
 *     responses:
 *       200:
 *         description: User rejected successfully
 *       400:
 *         description: user_id is required
 *       404:
 *         description: User not found
 *       500:
 *         description: Error rejecting user
 */
router.post('/reject', (req, res) => {
    const { user_id } = req.body;

    if (!user_id) return res.status(400).send('user_id is required');

    const updateQuery = `UPDATE approval_list SET status = 'rejected' WHERE user_id = $1`;

    client.query(updateQuery, [user_id], (err, result) => {
        if (!err) {
            if (result.rowCount === 0) {
                res.status(404).send('User not found');
            } else {
                res.send('User rejected successfully');
            }
        } else {
            console.error(err.message);
            res.status(500).send('Error rejecting user');
        }
    });
});

/**
 * @swagger
 * /approval/inactive:
 *   post:
 *     summary: Inactivate a user account
 *     tags:
 *       - Approval
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: "123"
 *     responses:
 *       200:
 *         description: User inactivated successfully
 *       400:
 *         description: user_id is required
 *       404:
 *         description: User not found
 *       500:
 *         description: Error inactivating user
 */
router.post('/inactive', (req, res) => {
    const { user_id } = req.body;

    if (!user_id) return res.status(400).send('user_id is required');

    const updateQuery = `UPDATE users SET status = 'inactive' WHERE user_id = $1`;

    client.query(updateQuery, [user_id], (err, result) => {
        if (!err) {
            if (result.rowCount === 0) {
                res.status(404).send('User not found');
            } else {
                res.send('User inactivated successfully');
            }
        } else {
            console.error(err.message);
            res.status(500).send('Error inactivating user');
        }
    });
});

/**
 * @swagger
 * /approval/{user_id}:
 *   delete:
 *     summary: Delete a user from users table
 *     tags:
 *       - Approval
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: Error deleting user
 */
router.delete('/:user_id', async (req, res) => {
    const userId = req.params.user_id;

    try {
        const deleteQuery = `DELETE FROM users WHERE user_id = $1`;
        const result = await client.query(deleteQuery, [userId]);

        if (result.rowCount === 0) {
            return res.status(404).send('User not found');
        }

        res.send(`User ${userId} deleted successfully`);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error deleting user');
    }
});

/**
 * @swagger
 * /approval/role/{user_id}:
 *   put:
 *     summary: Update the role of a user
 *     tags:
 *       - Approval
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               new_role:
 *                 type: string
 *                 example: "admin"
 *     responses:
 *       200:
 *         description: User role updated
 *       400:
 *         description: new_role is required
 *       404:
 *         description: User not found
 *       500:
 *         description: Error updating role
 */
router.put('/role/:user_id', async (req, res) => {
    const userId = req.params.user_id;
    const { new_role } = req.body;

    if (!new_role) return res.status(400).send('new_role is required');

    try {
        const updateQuery = `UPDATE users SET role = $1 WHERE user_id = $2`;
        const result = await client.query(updateQuery, [new_role, userId]);

        if (result.rowCount === 0) {
            return res.status(404).send('User not found');
        }

        res.send(`User ${userId} role updated to ${new_role}`);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error updating role');
    }
});

/**
 * @swagger
 * /approval/approval_list:
 *   get:
 *     summary: Get approval list with pagination
 *     tags:
 *       - Approval
 *     description: Retrieve a paginated list from the approval_list table.
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
 *         description: A paginated list of approval records
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
 *                       approval_id:
 *                         type: string
 *                         example: "APP123"
 *                       status:
 *                         type: string
 *                         example: "Pending"
 *                       requested_by:
 *                         type: string
 *                         example: "user@example.com"
 *                       created_time:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-01T12:34:56Z"
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       500:
 *         description: Error fetching approval list
 */
router.get('/approval_list', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        const dataQuery = 'SELECT * FROM approval_list ORDER BY created_time DESC LIMIT $1 OFFSET $2';
        const countQuery = 'SELECT COUNT(*) FROM approval_list';

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
        res.status(500).send('Error fetching approval list');
    }
});


module.exports = router;
