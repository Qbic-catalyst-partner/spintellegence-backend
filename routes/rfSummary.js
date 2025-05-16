const express = require('express');
const router = express.Router();
const client = require('../db/connection');
/**
 * @swagger
 * /rfSummary/spindle-summary/{organisation_id}:
 *   get:
 *     summary: Returns total allocated and worked spindles for an organisation
 *     tags:
 *       - rfSummary
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Total allocated and worked spindles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allocated_spindle:
 *                   type: number
 *                 worked_spindle:
 *                   type: number
 *       500:
 *         description: Internal server error
 */
router.get('/spindle-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  const filters = [`"organisation_id" = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }
  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }
  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }
  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }
  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("allocated_spindle"::NUMERIC), 0) AS allocated_spindle,
      COALESCE(SUM("worked_spindle"::NUMERIC), 0) AS worked_spindle
    FROM "rf_utilisation"
    ${whereClause}
  `;

  try {
    const result = await client.query(query, values);
    const { allocated_spindle, worked_spindle } = result.rows[0];
    res.json({
      allocated_spindle: Number(allocated_spindle),
      worked_spindle: Number(worked_spindle)
    });
  } catch (err) {
    console.error('Error fetching spindle summary:', err);
    res.status(500).send('Error fetching spindle data');
  }
});

/**
 * @swagger
 * /rfSummary/mechanical-maintainance-summary/{organisation_id}:
 *   get:
 *     summary: Get spindle and maintainance summary with percentages
 *     tags:
 *       - rfSummary
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID (e.g., UNI0024)
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Exact date (YYYY-MM-DD)
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *         description: Month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Quarter (1-4)
 *     responses:
 *       200:
 *         description: Spindle maintainance summary with percentages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allocated_spindle:
 *                   type: number
 *                 worked_spindle:
 *                   type: number
 *                 routine_maintainance:
 *                   type: number
 *                 routine_maintainance_percent:
 *                   type: string
 *                 preventive_maintainance:
 *                   type: number
 *                 preventive_maintainance_percent:
 *                   type: string
 *                 mechanical_maintainance:
 *                   type: number
 *                 mechanical_maintainance_percent:
 *                   type: string
 *       500:
 *         description: Internal Server Error
 */
router.get('/mechanical-maintainance-summary/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("allocated_spindle"::NUMERIC), 0) AS allocated_spindle,
      COALESCE(SUM("worked_spindle"::NUMERIC), 0) AS worked_spindle,
      COALESCE(SUM("routine_maintainance"::NUMERIC), 0) AS routine_maintainance,
      COALESCE(SUM("preventive_maintainance"::NUMERIC), 0) AS preventive_maintainance,
      COALESCE(SUM("mechanical_breakdown"::NUMERIC), 0) AS mechanical_maintainance
    FROM "rf_utilisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Spindle maintainance Query Error:', err.message);
      return res.status(500).send('Error fetching spindle maintainance summary');
    }

    const {
      allocated_spindle,
      worked_spindle,
      routine_maintainance,
      preventive_maintainance,
      mechanical_maintainance
    } = result.rows[0];

    const as = Number(allocated_spindle) || 0;

    const percent = (val) => as > 0 ? ((Number(val) / as) * 100).toFixed(2) : "0.00";

    res.json({
      routine_maintainance: Number(routine_maintainance),
      routine_maintainance_percent: percent(routine_maintainance),
      preventive_maintainance: Number(preventive_maintainance),
      preventive_maintainance_percent: percent(preventive_maintainance),
      mechanical_maintainance: Number(mechanical_maintainance),
      mechanical_maintainance_percent: percent(mechanical_maintainance)
    });
  });
});

/**
 * @swagger
 * /rfSummary/electrical-maintainance-summary/{organisation_id}:
 *   get:
 *     summary: Get electrical and maintainance summary with percentages
 *     tags:
 *       - rfSummary
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date (YYYY-MM-DD)
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *         description: Month (1–12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Week number
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Quarter (1–4)
 *     responses:
 *       200:
 *         description: maintainance summary with percentages
 */
router.get('/electrical-maintainance-summary/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("allocated_spindle"::NUMERIC), 0) AS allocated_spindle,
      COALESCE(SUM("power_failure"::NUMERIC), 0) AS power_failure,
      COALESCE(SUM("electrical_breakdown"::NUMERIC), 0) AS electrical_breakdown,
      COALESCE(SUM("planned_maintainance"::NUMERIC), 0) AS planned_maintainance
    FROM "rf_utilisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Spindle maintainance Query Error:', err.message);
      return res.status(500).send('Error fetching spindle maintainance summary');
    }

    const {
      allocated_spindle,
      power_failure,
      electrical_breakdown,
      planned_maintainance
    } = result.rows[0];

    const as = Number(allocated_spindle) || 0;
    const percent = (val) => as > 0 ? ((Number(val) / as) * 100).toFixed(2) : "0.00";

    res.json({
      power_failure: Number(power_failure),
      power_failure_percent: percent(power_failure),

      electrical_breakdown: Number(electrical_breakdown),
      electrical_breakdown_percent: percent(electrical_breakdown),

      planned_maintainance: Number(planned_maintainance),
      planned_maintainance_percent: percent(planned_maintainance),
    });
  });
});


/**
 * @swagger
 * /rfSummary/labour-summary/{organisation_id}:
 *   get:
 *     summary: Labour-related maintainance summary with values and percentages
 *     tags:
 *       - rfSummary
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID (e.g., UNI0024)
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by exact date (YYYY-MM-DD)
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
 *     responses:
 *       200:
 *         description: Labour maintainance data in kg and percentage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 labour_absentism:
 *                   type: number
 *                 labour_absentism_percent:
 *                   type: string
 *                 labour_shortage:
 *                   type: number
 *                 labour_shortage_percent:
 *                   type: string
 *                 labour_rest:
 *                   type: number
 *                 labour_rest_percent:
 *                   type: string
 *                 day_off_delay:
 *                   type: number
 *                 day_off_delay_percent:
 *                   type: string
 *       500:
 *         description: Internal server error
 */

router.get('/labour-summary/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) filters.push(`"date" = $${idx++}`), values.push(date);
  if (month) filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`), values.push(month);
  if (year) filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`), values.push(year);
  if (week) filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`), values.push(week);
  if (quarter) filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`), values.push(quarter);

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
SELECT 
  COALESCE(SUM("allocated_spindle"::NUMERIC), 0) AS allocated_spindle,
  COALESCE(SUM("labour_absentism"::NUMERIC), 0) AS labour_absentism,
  COALESCE(SUM("labour_shortage"::NUMERIC), 0) AS labour_shortage,
  COALESCE(SUM("labour_unrest"::NUMERIC), 0) AS labour_unrest,
  COALESCE(SUM("doff_delay"::NUMERIC), 0) AS doff_delay
FROM "rf_utilisation"

    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Labour Summary Query Error:', err.message);
      return res.status(500).send('Error calculating labour summary');
    }

    const {
      allocated_spindle,
      labour_absentism,
      labour_shortage,
      labour_rest,
      day_off_delay
    } = result.rows[0];

    const base = parseFloat(allocated_spindle) || 0;
    const percent = (val) => base > 0 ? ((Number(val) / base) * 100).toFixed(2) : "0.00";

    res.json({
      labour_absentism: parseFloat(labour_absentism),
      labour_absentism_percent: percent(labour_absentism),
      labour_shortage: parseFloat(labour_shortage),
      labour_shortage_percent: percent(labour_shortage),
      labour_rest: parseFloat(labour_rest),
      labour_rest_percent: percent(labour_rest),
      day_off_delay: parseFloat(day_off_delay),
      day_off_delay_percent: percent(day_off_delay)
    });
  });
});
/**
 * @swagger
 * /rfSummary/process-loss-summary/{organisation_id}:
 *   get:
 *     summary: Process loss reasons summary with values and percentages
 *     tags:
 *       - rfSummary
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID (e.g., UNI0024)
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by specific date (YYYY-MM-DD)
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
 *     responses:
 *       200:
 *         description: Production loss reasons with % and values
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bobbin_shortage:
 *                   type: number
 *                 bobbin_shortage_percent:
 *                   type: string
 *                 lot_count_changes:
 *                   type: number
 *                 lot_count_changes_percent:
 *                   type: string
 *                 lot_count_runout:
 *                   type: number
 *                 lot_count_runout_percent:
 *                   type: string
 *                 quality_checking:
 *                   type: number
 *                 quality_checking_percent:
 *                   type: string
 *                 quality_deviation:
 *                   type: number
 *                 quality_deviation_percent:
 *                   type: string
 *                 traveller_changes:
 *                   type: number
 *                 traveller_changes_percent:
 *                   type: string
 *       500:
 *         description: Internal server error
 */

router.get('/process-loss-summary/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) filters.push(`"date" = $${idx++}`), values.push(date);
  if (month) filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`), values.push(month);
  if (year) filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`), values.push(year);
  if (week) filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`), values.push(week);
  if (quarter) filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`), values.push(quarter);

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
SELECT 
  COALESCE(SUM("allocated_spindle"::NUMERIC), 0) AS allocated_spindle,
  COALESCE(SUM("bobbin_shortage"::NUMERIC), 0) AS bobbin_shortage,
  COALESCE(SUM("lot_count_change"::NUMERIC), 0) AS lot_count_change,
  COALESCE(SUM("lot_count_runout"::NUMERIC), 0) AS lot_count_runout,
  COALESCE(SUM("quality_checking"::NUMERIC), 0) AS quality_checking,
  COALESCE(SUM("quality_deviation"::NUMERIC), 0) AS quality_deviation,
  COALESCE(SUM("traveller_change"::NUMERIC), 0) AS traveller_change
FROM "rf_utilisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Production Loss Summary Query Error:', err.message);
      return res.status(500).send('Error retrieving production loss summary');
    }

    const {
      allocated_spindle,
      bobbin_shortage,
      lot_count_changes,
      lot_count_runout,
      quality_checking,
      quality_deviation,
      traveller_changes
    } = result.rows[0];

    const base = parseFloat(allocated_spindle) || 0;
    const percent = (val) => base > 0 ? ((Number(val) / base) * 100).toFixed(2) : "0.00";

    res.json({
      bobbin_shortage: parseFloat(bobbin_shortage),
      bobbin_shortage_percent: percent(bobbin_shortage),
      lot_count_changes: parseFloat(lot_count_changes),
      lot_count_changes_percent: percent(lot_count_changes),
      lot_count_runout: parseFloat(lot_count_runout),
      lot_count_runout_percent: percent(lot_count_runout),
      quality_checking: parseFloat(quality_checking),
      quality_checking_percent: percent(quality_checking),
      quality_deviation: parseFloat(quality_deviation),
      quality_deviation_percent: percent(quality_deviation),
      traveller_changes: parseFloat(traveller_changes),
      traveller_changes_percent: percent(traveller_changes)
    });
  });
});

/**
 * @swagger
 * /rfSummary/loss-summary/{organisation_id}:
 *   get:
 *     summary: Returns grouped loss summary by category
 *     tags:
 *       - rfSummary
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Loss summary by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mechanical:
 *                   type: number
 *                 electrical:
 *                   type: number
 *                 labour:
 *                   type: number
 *                 process:
 *                   type: number
 */
/**
 * @swagger
 * /rfSummary/loss-summary/{organisation_id}:
 *   get:
 *     summary: Returns grouped loss summary by category along with percentage
 *     tags:
 *       - rfSummary
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Loss summary by category with percentages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mechanical:
 *                   type: number
 *                 mechanical_percent:
 *                   type: string
 *                 electrical:
 *                   type: number
 *                 electrical_percent:
 *                   type: string
 *                 labour:
 *                   type: number
 *                 labour_percent:
 *                   type: string
 *                 process:
 *                   type: number
 *                 process_percent:
 *                   type: string
 */
router.get('/loss-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  const filters = [`"organisation_id" = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }
  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }
  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }
  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }
  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("allocated_spindle"::NUMERIC), 0) AS allocated_spindle,

      -- Mechanical
      COALESCE(SUM("routine_maintainance"::NUMERIC), 0) +
      COALESCE(SUM("preventive_maintainance"::NUMERIC), 0) +
      COALESCE(SUM("mechanical_breakdown"::NUMERIC), 0) AS mechanical,

      -- Electrical
      COALESCE(SUM("electrical_breakdown"::NUMERIC), 0) +
      COALESCE(SUM("planned_maintainance"::NUMERIC), 0) +
      COALESCE(SUM("power_failure"::NUMERIC), 0) AS electrical,

      -- Labour
      COALESCE(SUM("labour_absentism"::NUMERIC), 0) +
      COALESCE(SUM("labour_shortage"::NUMERIC), 0) +
      COALESCE(SUM("labour_unrest"::NUMERIC), 0) +
      COALESCE(SUM("doff_delay"::NUMERIC), 0) AS labour,

      -- Process
      COALESCE(SUM("bobbin_shortage"::NUMERIC), 0) +
      COALESCE(SUM("lot_count_change"::NUMERIC), 0) +
      COALESCE(SUM("lot_count_runout"::NUMERIC), 0) +
      COALESCE(SUM("quality_checking"::NUMERIC), 0) +
      COALESCE(SUM("quality_deviation"::NUMERIC), 0) +
      COALESCE(SUM("traveller_change"::NUMERIC), 0) AS process
    FROM "rf_utilisation"
    ${whereClause}
  `;

  try {
    const result = await client.query(query, values);
    const row = result.rows[0];

    const allocatedSpindle = parseFloat(row.allocated_spindle) || 0;

    const percent = (val) =>
      allocatedSpindle > 0 ? ((Number(val) / allocatedSpindle) * 100).toFixed(2) : "0.00";

    res.json({
      mechanical: Number(row.mechanical),
      mechanical_percent: percent(row.mechanical),
      electrical: Number(row.electrical),
      electrical_percent: percent(row.electrical),
      labour: Number(row.labour),
      labour_percent: percent(row.labour),
      process: Number(row.process),
      process_percent: percent(row.process)
    });
  } catch (err) {
    console.error('Error fetching loss summary:', err.message);
    res.status(500).send('Error fetching loss data');
  }
});


module.exports = router;