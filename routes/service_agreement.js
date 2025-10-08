const express = require('express');
const router = express.Router();
const client = require('../db/connection');

/**
 * @swagger
 * /service_agreement/customer:
 *   post:
 *     summary: Insert a new service agreement for a customer
 *     tags:
 *       - Service Agreement
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               document_id:
 *                 type: integer
 *               organisation_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               document_name:
 *                 type: string
 *               file_size:
 *                 type: integer
 *               file_status:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Service agreement record inserted successfully
 *       500:
 *         description: Error inserting data
 */
router.post('/customer', (req, res) => {
    const data = req.body;

    const insertQuery = `
        INSERT INTO service_agreement_customer (
            document_id, organisation_id, user_id, 
            document_name, file_size, file_status, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const values = [
        data.document_id,
        data.organisation_id,
        data.user_id,
        data.document_name,
        data.file_size,
        data.file_status,
        data.timestamp
    ];

    client.query(insertQuery, values, (err) => {
        if (!err) {
            res.send('Service agreement record inserted successfully');
        } else {
            console.error(err.message);
            res.status(500).send('Error inserting data');
        }
    });
});

/**
 * @swagger
 * /service_agreement/consultant:
 *   post:
 *     summary: Insert a new service agreement for a consultant
 *     tags:
 *       - Service Agreement
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               document_id:
 *                 type: integer
 *               consultant_id:
 *                 type: integer
 *               document_name:
 *                 type: string
 *               file_size:
 *                 type: integer
 *               file_status:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Consultant service agreement record inserted successfully
 *       500:
 *         description: Error inserting data
 */
router.post('/consultant', (req, res) => {
    const data = req.body;

    const insertQuery = `
        INSERT INTO service_agreement_consultant (
            document_id, consultant_id, document_name, 
            file_size, file_status, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const values = [
        data.document_id,
        data.consultant_id,
        data.document_name,
        data.file_size,
        data.file_status,
        data.timestamp
    ];

    client.query(insertQuery, values, (err) => {
        if (!err) {
            res.send('Consultant service agreement record inserted successfully');
        } else {
            console.error(err.message);
            res.status(500).send('Error inserting data');
        }
    });
});

/**
 * @swagger
 * /service_agreement/customer:
 *   get:
 *     summary: Get all customer service agreements
 *     tags:
 *       - Service Agreement
 *     responses:
 *       200:
 *         description: A list of customer service agreements
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 additionalProperties: true
 *       500:
 *         description: Error fetching customer service agreements
 */
router.get('/customer', (req, res) => {
    const selectQuery = `SELECT * FROM service_agreement_customer`;

    client.query(selectQuery, (err, result) => {
        if (!err) {
            res.send(result.rows);
        } else {
            console.error(err.message);
            res.status(500).send('Error fetching customer service agreements');
        }
    });
});

/**
 * @swagger
 * /service_agreement/consultant:
 *   get:
 *     summary: Get all consultant service agreements
 *     tags:
 *       - Service Agreement
 *     responses:
 *       200:
 *         description: A list of consultant service agreements
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 additionalProperties: true
 *       500:
 *         description: Error fetching consultant service agreements
 */
router.get('/consultant', (req, res) => {
    const selectQuery = `SELECT * FROM service_agreement_consultant`;

    client.query(selectQuery, (err, result) => {
        if (!err) {
            res.send(result.rows);
        } else {
            console.error(err.message);
            res.status(500).send('Error fetching consultant service agreements');
        }
    });
});

module.exports = router;
