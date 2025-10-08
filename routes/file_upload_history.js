const express = require('express');
const router = express.Router();
const client = require('../db/connection');

/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: File upload log management
 */

/**
 * @swagger
 * /file_upload_history/log-upload:
 *   post:
 *     summary: Upload a new file log
 *     tags: [Logs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - kpi_name
 *               - user_name
 *               - shift
 *               - status
 *             properties:
 *               kpi_name:
 *                 type: string
 *               user_name:
 *                 type: string
 *               shift:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Log saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transaction_id:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Failed to save log
 */
router.post('/log-upload', async (req, res) => {
  const { kpi_name, user_name, shift, status } = req.body;

  if (!kpi_name || !user_name || !shift || !status) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const result = await client.query(`
      SELECT transaction_id FROM file_upload_logs
      WHERE transaction_id LIKE 'TRANS%'
      ORDER BY transaction_id DESC
      LIMIT 1
    `);

    let nextNumber = 1;

    if (result.rows.length > 0) {
      const lastId = result.rows[0].transaction_id;
      const numericPart = parseInt(lastId.replace('TRANS', ''), 10);
      nextNumber = numericPart + 1;
    }

    const transactionId = `TRANS${String(nextNumber).padStart(5, '0')}`;

    await client.query(`
      INSERT INTO file_upload_logs (transaction_id, kpi_name, user_name, shift, status)
      VALUES ($1, $2, $3, $4, $5)
    `, [transactionId, kpi_name, user_name, shift, status]);

    res.status(200).json({ message: '✅ Log saved successfully', transaction_id: transactionId });
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Failed to save log');
  }
});
/**
 * @swagger
 * /file_upload_history/log-upload:
 *   get:
 *     summary: Get logs with optional filters and pagination
 *     tags: [Logs]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: user_name
 *         schema:
 *           type: string
 *         description: Filter by user name
 *       - in: query
 *         name: kpi_name
 *         schema:
 *           type: string
 *         description: Filter by KPI name
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
 *         description: A filtered and paginated list of logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       500:
 *         description: Failed to fetch logs
 */
router.get('/log-upload', async (req, res) => {
  const { status, user_name, kpi_name } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    let baseQuery = 'FROM file_upload_logs WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      baseQuery += ` AND status = $${params.length}`;
    }
    if (user_name) {
      params.push(user_name);
      baseQuery += ` AND user_name = $${params.length}`;
    }
    if (kpi_name) {
      params.push(kpi_name);
      baseQuery += ` AND kpi_name = $${params.length}`;
    }

    const dataQuery = `SELECT * ${baseQuery} ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const countQuery = `SELECT COUNT(*) ${baseQuery}`;

    const dataParams = [...params, limit, offset];

    const [dataResult, countResult] = await Promise.all([
      client.query(dataQuery, dataParams),
      client.query(countQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.status(200).json({
      data: dataResult.rows,
      total,
      page,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Failed to fetch logs');
  }
});


/**
 * @swagger
 * /file_upload_history/log-upload/{transaction_id}:
 *   delete:
 *     summary: Delete a log by transaction ID
 *     tags: [Logs]
 *     parameters:
 *       - in: path
 *         name: transaction_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Log deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted:
 *                   type: object
 *       404:
 *         description: Log not found
 *       500:
 *         description: Failed to delete log
 */
router.delete('/log-upload/:transaction_id', async (req, res) => {
  const { transaction_id } = req.params;

  if (!transaction_id) {
    return res.status(400).send('Transaction ID is required');
  }

  try {
    const result = await client.query(
      'DELETE FROM file_upload_logs WHERE transaction_id = $1 RETURNING *',
      [transaction_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send('Log not found');
    }

    res.status(200).json({ message: '✅ Log deleted', deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Failed to delete log');
  }
});

module.exports = router;
