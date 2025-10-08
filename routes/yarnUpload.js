const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const client = require('../db/connection');

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Table mapping
const tableMap = {
  'Yarn Realisation': {
    table: 'Yarn_Realisation',
    columns: [
      'user_id', 'transaction_id', 'organisation_id', 'date', 'shift',
      'raw_material_input', 'yarn_output', 'br_droppings', 'lickerin_droppings',
      'total_dropping', 'flat_waste', 'micro_dust', 'contamination_collection',
      'ohtc_waste', 'prep_fan_waste', 'plant_room_waste', 'all_dept_sweeping_waste',
      'ring_frame_roving_waste', 'speed_frame_roving_waste', 'comber_waste',
      'hard_waste', 'invisible_loss', 'total_waste'
    ]
  },
  'RF Utilisation': {
    table: 'Rf_Utilisation',
    columns: [
      'user_id', 'transaction_id', 'organisation_id', 'date', 'shift',
      'allocated_spindle', 'worked_spindle', 'cleaning_work', 'full_cleaning',
      'routine_maintainance', 'cots_change', 'jockey_pulley_box_change', 'scheduled_maintainance',
      'preventive_maintainance', 'ohtc_work', 'top_arm_pressure_hose_damage', 'waste_drum_check',
      'mechanical_breakdown', 'fan_motor_fault', 'main_belt_cut', 'main_motor_belt_change',
      'electrical_breakdown', 'planned_maintainance', 'power_cut', 'power_failure',
      'labour_absentism', 'labour_unrest', 'labour_shortage', 'doff_delay', 'bobbin_shortage',
      'lot_count_change', 'lot_count_runout', 'quality_checking', 'quality_deviation',
      'traveller_change', 'other', 'total'
    ]
  },
  'Production Efficiency': {
    table: 'Production_Efficiency',
    columns: [
      'user_id', 'transaction_id', 'organisation_id', 'date', 'shift',
      'allocated_spindle', 'speed_spindle', 'tm', 'stopped_minutes', 'hank_run', 'count', 'cal_efficiency', 'rf_no'
    ]
  },
  'Unit Per KG': {
    table: 'Unit_per_kg',
    columns: [
      'user_id', 'transaction_id', 'organisation_id', 'date', 'shift',
      'actual_production', 'average_count', 'conversion_factor_40s', 'converted_production_40s',
      'blowroom_carding_awes', 'first_passage', 'second_passage', 'speed_frame',
      'ring_frame', 'autoconer', 'humidification', 'compressor', 'lighting_other'
    ]
  },
  'EUP': {
    table: 'EUP',
    columns: [
      'user_id', 'transaction_id', 'organisation_id','date', 'shift', 
      'yarn_realisation', 'rf_utilisation', 'production_efficiency', 'eup'
    ]
  }
};

// Helper
const convertExcelDate = (excelSerial) => {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const days = parseInt(excelSerial, 10);
  return new Date(epoch.getTime() + days * 86400000);
};

/**
 * @swagger
 * tags:
 *   name: YarnUpload
 *   description:
 */

/**
 * @swagger
 * /yarnUpload/upload-yarn:
 *   post:
 *     summary: Upload Excel data to the selected table
 *     tags: [YarnUpload]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: query
 *         name: option
 *         schema:
 *           type: string
 *         required: true
 *         description: Table name to insert data into (dropdown option)
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Date to validate against the Excel file
 *       - in: query
 *         name: shift
 *         schema:
 *           type: string
 *         required: true
 *         description: Shift to validate against the Excel file
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               excelFile:
 *                 type: string
 *                 format: binary
 *                 description: Excel (.xlsx) file to upload. `transaction_id` is auto-generated, so do not include it.
 *     responses:
 *       200:
 *         description: Upload successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "✅ Uploaded successfully to Yarn_Realisation"
 *                 transaction_ids:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["TRN0001", "TRN0002"]
 *       400:
 *         description: Bad request, missing or invalid parameters
 *       500:
 *         description: Internal server error while processing the file
 */

router.post('/upload-yarn', upload.single('excelFile'), async (req, res) => {
  try {
    const selectedOption = req.query.option;
    const uiDate = req.query.date;
    const uiShift = req.query.shift;

    if (!selectedOption || !uiDate || !uiShift) {
      return res.status(400).send('Missing required query parameters: option, date, shift.');
    }

    const config = tableMap[selectedOption];
    if (!config) {
      return res.status(400).send('Invalid dropdown option.');
    }

    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = xlsx.utils.sheet_to_json(sheet);

    const insertedTransactionIds = [];

    for (const [index, row] of jsonData.entries()) {
      const excelShift = row['shift']?.toString().trim();
      if (excelShift !== uiShift) {
        fs.unlinkSync(req.file.path);
        return res.status(400).send(`Shift mismatch in row ${index + 2}. Expected: ${uiShift}, Found: ${excelShift}`);
      }

      const excelRawDate = row['date'];
      const excelDate = typeof excelRawDate === 'number'
        ? convertExcelDate(excelRawDate).toISOString().split('T')[0]
        : new Date(excelRawDate).toISOString().split('T')[0];

      if (excelDate !== uiDate) {
        fs.unlinkSync(req.file.path);
        return res.status(400).send(`Date mismatch in row ${index + 2}. Expected: ${uiDate}, Found: ${excelDate}`);
      }
    }

    for (const row of jsonData) {
      // Generate unique transaction_id
      const idResult = await client.query(`SELECT COUNT(*) FROM ${config.table}`);
      const count = parseInt(idResult.rows[0].count, 10);
      const transactionId = `TRN${(count + 1).toString().padStart(4, '0')}`;
      insertedTransactionIds.push(transactionId);

      // Prepare values
      const values = config.columns.map((col) => {
        if (col === 'transaction_id') return transactionId;
        if (col.toLowerCase() === 'date') {
          const rawDate = row[col];
          return typeof rawDate === 'number' ? convertExcelDate(rawDate) : new Date(rawDate);
        }
        return row[col] ?? null;
      });

      const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
      const query = `INSERT INTO ${config.table} (${config.columns.map(col => `"${col}"`).join(', ')}) VALUES (${placeholders});`;
      await client.query(query, values);
    }

    fs.unlinkSync(req.file.path);
    res.status(200).json({
      message: `✅ Uploaded successfully to ${config.table}`,
      transaction_ids: insertedTransactionIds
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Failed to process the upload.');
  }
});

/**
 * @swagger
 * /yarnUpload/fetch-yarn:
 *   get:
 *     summary: Fetch yarn data by transaction_id
 *     tags: [YarnUpload]
 *     parameters:
 *       - in: query
 *         name: option
 *         required: true
 *         schema:
 *           type: string
 *         description: Dropdown option to determine which table to query
 *       - in: query
 *         name: transaction_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID to fetch data for (e.g., TRN0001)
 *     responses:
 *       200:
 *         description: Successful fetch
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 additionalProperties: true
 *       400:
 *         description: Missing or invalid query parameters
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Missing required query parameters: option, transaction_id."
 *       404:
 *         description: No matching records found
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: No data found for the provided transaction_id.
 *       500:
 *         description: Server error
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: ❌ Failed to fetch data.
 */
router.get('/fetch-yarn', async (req, res) => {
  try {
    const { option, transaction_id } = req.query;

    if (!option || !transaction_id) {
      return res.status(400).send('Missing required query parameters: option, transaction_id.');
    }

    const config = tableMap[option];
    if (!config) {
      return res.status(400).send('Invalid dropdown option.');
    }

    // Support multiple transaction IDs
    let transactionIds = Array.isArray(transaction_id)
      ? transaction_id
      : transaction_id.split(',').map(id => id.trim());

    if (transactionIds.length === 0) {
      return res.status(400).send('At least one transaction_id must be provided.');
    }

    const placeholders = transactionIds.map((_, i) => `$${i + 1}`).join(', ');
    const query = `SELECT * FROM ${config.table} WHERE transaction_id IN (${placeholders})`;

    const result = await client.query(query, transactionIds);

    if (result.rows.length === 0) {
      return res.status(404).send('No data found for the provided transaction_id(s).');
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Failed to fetch data.');
  }
});


/**
 * @swagger
 * /yarnUpload/update-yarn:
 *   put:
 *     summary: Update yarn record by transaction_id
 *     tags: [YarnUpload]
 *     parameters:
 *       - in: query
 *         name: option
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: transaction_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Record updated
 *       400:
 *         description: Invalid request
 *       404:
 *         description: No record found
 */
router.put('/update-yarn', async (req, res) => {
  try {
    const { option, transaction_id } = req.query;
    const updates = req.body;

    if (!option || !transaction_id) {
      return res.status(400).send('Missing required query parameters: option, transaction_id.');
    }

    const config = tableMap[option];
    if (!config) {
      return res.status(400).send('Invalid dropdown option.');
    }

    const updateKeys = Object.keys(updates).filter(k => config.columns.includes(k));
    if (updateKeys.length === 0) {
      return res.status(400).send('No valid fields provided for update.');
    }

    const setClause = updateKeys.map((key, idx) => `"${key}" = $${idx + 1}`).join(', ');
    const values = updateKeys.map(k => updates[k]);

    const query = `
      UPDATE ${config.table}
      SET ${setClause}
      WHERE transaction_id = $${updateKeys.length + 1}
      RETURNING *;
    `;

    const result = await client.query(query, [...values, transaction_id]);

    if (result.rows.length === 0) {
      return res.status(404).send('No record found with the given transaction_id.');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Failed to update data.');
  }
});

module.exports = router;