const express = require('express');
const router = express.Router();
const client = require('../db/connection');

// /**
//  * @swagger
//  * /yarn_realisation:
//  *   get:
//  *     summary: Get yarn realisation data
//  *     description: Fetches all records from the yarn_realisation table.
//  *     responses:
//  *       200:
//  *         description: Yarn realisation data retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 type: object
//  *       500:
//  *         description: Error fetching yarn realisation data
//  */
// router.get('/yarn_realisation', (req, res) => {
//     client.query('SELECT * FROM yarn_realisation', (err, result) => {
//         if (!err) res.send(result.rows);
//         else {
//             console.error(err.message);
//             res.status(500).send('Error fetching screens');
//         }
//     });
// });

// /**
//  * @swagger
//  * /rf_utilisation:
//  *   get:
//  *     summary: Get RF utilisation data
//  *     description: Fetches all records from the rf_utilisation table.
//  *     responses:
//  *       200:
//  *         description: RF utilisation data retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 type: object
//  *       500:
//  *         description: Error fetching RF utilisation data
//  */


// router.get('/rf_utilisation', (req, res) => {
//     client.query('SELECT * FROM rf_utilisation', (err, result) => {
//         if (!err) res.send(result.rows);
//         else {
//             console.error(err.message);
//             res.status(500).send('Error fetching screens');
//         }
//     });
// });


// /**
//  * @swagger
//  * /production_efficency:
//  *   get:
//  *     summary: Get production efficiency data
//  *     description: Fetches all records from the production_efficency table.
//  *     responses:
//  *       200:
//  *         description: Production efficiency data retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 type: object
//  *       500:
//  *         description: Error fetching production efficiency data
//  */


// router.get('/production_efficency', (req, res) => {
//     client.query('SELECT * FROM production_efficency', (err, result) => {
//         if (!err) res.send(result.rows);
//         else {
//             console.error(err.message);
//             res.status(500).send('Error fetching screens');
//         }
//     });
// });
// /**
//  * @swagger
//  * /eup:
//  *   get:
//  *     summary: Get EUP data
//  *     description: Fetches all records from the eup table.
//  *     responses:
//  *       200:
//  *         description: EUP data retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 type: object
//  *       500:
//  *         description: Error fetching EUP data
//  */


// router.get('/eup', (req, res) => {
//     client.query('SELECT * FROM eup', (err, result) => {
//         if (!err) res.send(result.rows);
//         else {
//             console.error(err.message);
//             res.status(500).send('Error fetching screens');
//         }
//     });
// });

// /**
//  * @swagger
//  * /unit_per_kg:
//  *   get:
//  *     summary: Get unit per kg data
//  *     description: Fetches all records from the unit_per_kg table.
//  *     responses:
//  *       200:
//  *         description: Unit per kg data retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 type: object
//  *       500:
//  *         description: Error fetching unit per kg data
//  */

// router.get('/unit_per_kg', (req, res) => {
//     client.query('SELECT * FROM unit_per_kg', (err, result) => {
//         if (!err) res.send(result.rows);
//         else {
//             console.error(err.message);
//             res.status(500).send('Error fetching screens');
//         }
//     });
// });

module.exports = router;