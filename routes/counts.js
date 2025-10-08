const express = require('express');
const router = express.Router();
const client = require('../db/connection');

/**
 * @swagger
 * /counts:
 *   get:
 *     summary: Get total counts of consultants, users, and organisations
  *     tags:
 *       - counts
 *     description: Returns the number of consultants, users, and organisations in the system.
 *     responses:
 *       200:
 *         description: Successfully retrieved all counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 consultant_count:
 *                   type: integer
 *                   example: 10
 *                 user_count:
 *                   type: integer
 *                   example: 25
 *                 organisation_count:
 *                   type: integer
 *                   example: 5
 *       500:
 *         description: Server error while fetching counts
 */
router.get('/', (req, res) => {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM consultants) AS consultant_count,
            (SELECT COUNT(*) FROM users) AS user_count,
            (SELECT COUNT(*) FROM organisation) AS organisation_count
    `;

    client.query(query, (err, result) => {
        if (!err) {
            res.send(result.rows[0]);
        } else {
            console.error(err.message);
            res.status(500).send('Failed to fetch counts');
        }
    });
});

module.exports = router;
