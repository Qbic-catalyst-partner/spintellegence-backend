const express = require('express');
const router = express.Router();
const client = require('../db/connection');

/**
 * @swagger
 * /screens:
 *   get:
 *     summary: Retrieve all screens structured by categories
 *     tags:
 *       - Screens
 *     responses:
 *       200:
 *         description: A structured object of screens grouped by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 additionalProperties:
 *                   type: object
 *                   properties:
 *                     screen_id:
 *                       type: integer
 *                     screen_name:
 *                       type: string
 *       500:
 *         description: Error fetching screens
 */

router.get('/', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM screens');
        const screens = result.rows;

        const screenMap = {};
        screens.forEach(screen => {
            screenMap[screen.screen_name] = screen;
        });

        const screenGroups = {
            "Yarn_realization_screen": [
                "Blow_room_waste",
                "Filter_waste",
                "Roving_waste",
                "Other"
            ],
            "RF_Utilization_screen": [
                "Mechanical",
                "Electrical",
                "Labour",
                "Process"
            ],
            "Product_efficiency_screen": [
                "Production_Efficiency",
                "KGS",
                "U%",
                "GPS"
            ],
            "EUP_screen": [
                "Utilization",
                "PRODN_efficiency",
                "EUP_homescreen"
            ],
            "Unit_per_kg_screen": [
                "Waste",
                "Operation",
                "Machine"
            ]
        };

        const structuredScreens = {};

        // Build grouped sections
        for (const [parent, children] of Object.entries(screenGroups)) {
            structuredScreens[parent] = {};
            children.forEach(child => {
                if (screenMap[child]) {
                    structuredScreens[parent][child] = screenMap[child];
                }
            });
        }

        // Add standalone screens
        screens.forEach(screen => {
            const isGrouped = Object.values(screenGroups)
                .flat()
                .includes(screen.screen_name);

            const isParent = screenGroups.hasOwnProperty(screen.screen_name);

            if (!isGrouped && !isParent) {
                structuredScreens[screen.screen_name] = {};
            }
        });

        res.json(structuredScreens);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error fetching screens');
    }
});

module.exports = router;