const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const dayjs = require('dayjs');

const toArray = (param) => {
  if (!param) return [];
  return Array.isArray(param) ? param : [param];
};

const customQuarterMap = {
  1: [3, 4, 5],
  2: [6, 7, 8],
  3: [9, 10, 11],
  4: [12, 1, 2],
};

/**
 * @swagger
 * /rfSummarys/spindle-summary/{organisation_id}:
 *   get:
 *     summary: Get average allocated and worked spindle values for an organisation
 *     tags:
 *       - rfSummarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom date range (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom date range (YYYY-MM-DD)
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by one or more years (e.g., 2023, 2024)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by one or more months (1 = Jan, 12 = Dec)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
 *     responses:
 *       200:
 *         description: Average allocated and worked spindles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allocated_spindle:
 *                   type: number
 *                   format: float
 *                   description: Average allocated spindle
 *                 worked_spindle:
 *                   type: number
 *                   format: float
 *                   description: Average worked spindle
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/spindle-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const singleDate = req.query.date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (singleDate) {
    filters.push(`date = $${idx++}`);
    values.push(singleDate);
  } else if (startDate && endDate) {
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(startDate, endDate);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx++})`);
    values.push(years);
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
    values.push(months);
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
      values.push(validWeeks);
    }
  }

  if (quarters.length) {
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default: last 12 months
  if (
    !singleDate && !startDate && !endDate &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(AVG(allocated_spindle::NUMERIC), 2) AS allocated_spindle,
      ROUND(AVG(worked_spindle::NUMERIC), 2) AS worked_spindle
    FROM rf_utilisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { allocated_spindle, worked_spindle } = result.rows[0] || {};
    res.json({
      allocated_spindle: Number(allocated_spindle) || 0,
      worked_spindle: Number(worked_spindle) || 0,
    });
  } catch (err) {
    console.error('Error fetching spindle summary:', err);
    res.status(500).json({ error: 'Error fetching spindle summary data' });
  }
});

/**
 * @swagger
 * /rfSummarys/mechanical-maintainance-summary/{organisation_id}:
 *   get:
 *     summary: Get spindle and mechanical maintenance summary with percentages
 *     tags:
 *       - rfSummarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom date range (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom date range (YYYY-MM-DD)
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by one or more years
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by one or more months (1 = Jan, 12 = Dec)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
 *     responses:
 *       200:
 *         description: Spindle maintenance summary with percentages
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
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/mechanical-maintainance-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const singleDate = req.query.date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (singleDate) {
    filters.push(`date = $${idx++}`);
    values.push(singleDate);
  } else if (startDate && endDate) {
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(startDate, endDate);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx++})`);
    values.push(years);
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
    values.push(months);
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
      values.push(validWeeks);
    }
  }

  if (quarters.length) {
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default: last 12 months
  if (
    !singleDate && !startDate && !endDate &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      COALESCE(SUM(allocated_spindle::NUMERIC), 0) AS allocated_spindle,
      COALESCE(SUM(worked_spindle::NUMERIC), 0) AS worked_spindle,
      COALESCE(SUM(routine_maintainance::NUMERIC), 0) AS routine_maintainance,
      COALESCE(SUM(preventive_maintainance::NUMERIC), 0) AS preventive_maintainance,
      COALESCE(SUM(mechanical_breakdown::NUMERIC), 0) AS mechanical_maintainance
    FROM rf_utilisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);

    const {
      allocated_spindle,
      worked_spindle,
      routine_maintainance,
      preventive_maintainance,
      mechanical_maintainance
    } = result.rows[0] || {};

    const as = Number(allocated_spindle) || 0;

    const percent = (val) => as > 0 ? ((Number(val) / as) * 100).toFixed(2) : "0.00";

    res.json({
      allocated_spindle: Number(allocated_spindle),
      worked_spindle: Number(worked_spindle),
      routine_maintainance: Number(routine_maintainance),
      routine_maintainance_percent: percent(routine_maintainance),
      preventive_maintainance: Number(preventive_maintainance),
      preventive_maintainance_percent: percent(preventive_maintainance),
      mechanical_maintainance: Number(mechanical_maintainance),
      mechanical_maintainance_percent: percent(mechanical_maintainance),
    });
  } catch (err) {
    console.error('Spindle maintenance summary query failed:', err);
    res.status(500).json({ error: 'Error fetching spindle maintenance summary' });
  }
});


/**
 * @swagger
 * /rfSummarys/electrical-maintainance-summary/{organisation_id}:
 *   get:
 *     summary: Get electrical maintainance summary with percentages
 *     tags:
 *       - rfSummarys
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
 *         description: Filter by exact date (YYYY-MM-DD)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom range
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom range
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by one or more years
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by one or more months
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by weeks of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
 *     responses:
 *       200:
 *         description: Electrical maintainance summary with percentages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 power_failure:
 *                   type: number
 *                 power_failure_percent:
 *                   type: string
 *                 electrical_breakdown:
 *                   type: number
 *                 electrical_breakdown_percent:
 *                   type: string
 *                 planned_maintainance:
 *                   type: number
 *                 planned_maintainance_percent:
 *                   type: string
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/electrical-maintainance-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const singleDate = req.query.date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (singleDate) {
    filters.push(`date = $${idx++}`);
    values.push(singleDate);
  } else if (startDate && endDate) {
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(startDate, endDate);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx++})`);
    values.push(years);
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
    values.push(months);
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
      values.push(validWeeks);
    }
  }

  if (quarters.length) {
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default to last 12 months if no filters
  if (
    !singleDate && !startDate && !endDate &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      COALESCE(SUM(allocated_spindle::NUMERIC), 0) AS allocated_spindle,
      COALESCE(SUM(power_failure::NUMERIC), 0) AS power_failure,
      COALESCE(SUM(electrical_breakdown::NUMERIC), 0) AS electrical_breakdown,
      COALESCE(SUM(planned_maintainance::NUMERIC), 0) AS planned_maintainance
    FROM rf_utilisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const {
      allocated_spindle,
      power_failure,
      electrical_breakdown,
      planned_maintainance
    } = result.rows[0] || {};

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
  } catch (err) {
    console.error('Electrical maintainance summary query failed:', err.message);
    res.status(500).json({ error: 'Error fetching electrical maintainance summary' });
  }
});

/**
 * @swagger
 * /rfSummarys/labour-summary/{organisation_id}:
 *   get:
 *     summary: Labour-related maintainance summary with values and percentages
 *     tags:
 *       - rfSummarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for range
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for range
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: One or more years
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: One or more months (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Weeks of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (1: Mar–May, 2: Jun–Aug, etc.)"
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
router.get('/labour-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const singleDate = req.query.date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (singleDate) {
    filters.push(`date = $${idx++}`);
    values.push(singleDate);
  } else if (startDate && endDate) {
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(startDate, endDate);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx++})`);
    values.push(years);
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
    values.push(months);
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
      values.push(validWeeks);
    }
  }

  if (quarters.length) {
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default to last 12 months if no filters
  if (
    !singleDate && !startDate && !endDate &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      COALESCE(SUM(allocated_spindle::NUMERIC), 0) AS allocated_spindle,
      COALESCE(SUM(labour_absentism::NUMERIC), 0) AS labour_absentism,
      COALESCE(SUM(labour_shortage::NUMERIC), 0) AS labour_shortage,
      COALESCE(SUM(labour_unrest::NUMERIC), 0) AS labour_rest,
      COALESCE(SUM(doff_delay::NUMERIC), 0) AS day_off_delay
    FROM rf_utilisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const {
      allocated_spindle,
      labour_absentism,
      labour_shortage,
      labour_rest,
      day_off_delay
    } = result.rows[0] || {};

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
      day_off_delay_percent: percent(day_off_delay),
    });
  } catch (err) {
    console.error('Labour Summary Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating labour summary' });
  }
});


/**
 * @swagger
 * /rfSummarys/process-loss-summary/{organisation_id}:
 *   get:
 *     summary: Process loss reasons summary with values and percentages
 *     tags:
 *       - rfSummarys
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
 *         description: Exact date filter (YYYY-MM-DD)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for range filter (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for range filter (YYYY-MM-DD)
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more years (e.g., year=2024&year=2025)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more months (1-12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by week numbers (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarter(s) (1-4)
 *     responses:
 *       200:
 *         description: Production loss summary with values and percentages
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
 *         description: Internal Server Error
 */
router.get('/process-loss-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);

  let filters = [`organisation_id = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`date = $${idx++}`);
    values.push(date);
  } else if (start_date && end_date) {
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(start_date, end_date);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx++})`);
    values.push(years);
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
    values.push(months);
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
      values.push(validWeeks);
    }
  }

  if (quarters.length) {
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      COALESCE(SUM(allocated_spindle::NUMERIC), 0) AS allocated_spindle,
      COALESCE(SUM(bobbin_shortage::NUMERIC), 0) AS bobbin_shortage,
      COALESCE(SUM(lot_count_change::NUMERIC), 0) AS lot_count_changes,
      COALESCE(SUM(lot_count_runout::NUMERIC), 0) AS lot_count_runout,
      COALESCE(SUM(quality_checking::NUMERIC), 0) AS quality_checking,
      COALESCE(SUM(quality_deviation::NUMERIC), 0) AS quality_deviation,
      COALESCE(SUM(traveller_change::NUMERIC), 0) AS traveller_changes
    FROM rf_utilisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
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
  } catch (err) {
    console.error('Process Loss Summary Query Error:', err.message);
    res.status(500).json({ error: 'Error retrieving process loss summary' });
  }
});

/**
 * @swagger
 * /rfSummarys/loss-summary/{organisation_id}:
 *   get:
 *     summary: Returns grouped loss summary by category with percentages
 *     tags:
 *       - rfSummarys
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
 *         description: Exact date filter (YYYY-MM-DD)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for range filter (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for range filter (YYYY-MM-DD)
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more years (e.g., year=2024&year=2025)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more months (1-12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by week numbers within month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarter(s) (1-4)
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
 *       500:
 *         description: Internal Server Error
 */

router.get('/loss-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  // Helper function to normalize query params to arrays
  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);

  let filters = [`organisation_id = $1`];
  let values = [organisation_id];
  let idx = 2;

  // Date filters: exact date or date range or years array
  if (date) {
    filters.push(`date = $${idx++}`);
    values.push(date);
  } else if (start_date && end_date) {
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(start_date, end_date);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx++})`);
    values.push(years);
  }

  // Month filter array
  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
    values.push(months);
  }

  // Week of month filter 1-5 only
  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
      values.push(validWeeks);
    }
  }

  // Quarter filter expanded to months (assuming customQuarterMap is defined)
  // Example customQuarterMap:
  // const customQuarterMap = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };

  const customQuarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  if (quarters.length) {
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default filter: last 12 months if no date filters
  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      COALESCE(SUM(allocated_spindle::NUMERIC), 0) AS allocated_spindle,

      -- Mechanical
      COALESCE(SUM(routine_maintainance::NUMERIC), 0) +
      COALESCE(SUM(preventive_maintainance::NUMERIC), 0) +
      COALESCE(SUM(mechanical_breakdown::NUMERIC), 0) AS mechanical,

      -- Electrical
      COALESCE(SUM(electrical_breakdown::NUMERIC), 0) +
      COALESCE(SUM(planned_maintainance::NUMERIC), 0) +
      COALESCE(SUM(power_failure::NUMERIC), 0) AS electrical,

      -- Labour
      COALESCE(SUM(labour_absentism::NUMERIC), 0) +
      COALESCE(SUM(labour_shortage::NUMERIC), 0) +
      COALESCE(SUM(labour_unrest::NUMERIC), 0) +
      COALESCE(SUM(doff_delay::NUMERIC), 0) AS labour,

      -- Process
      COALESCE(SUM(bobbin_shortage::NUMERIC), 0) +
      COALESCE(SUM(lot_count_change::NUMERIC), 0) +
      COALESCE(SUM(lot_count_runout::NUMERIC), 0) +
      COALESCE(SUM(quality_checking::NUMERIC), 0) +
      COALESCE(SUM(quality_deviation::NUMERIC), 0) +
      COALESCE(SUM(traveller_change::NUMERIC), 0) AS process
    FROM rf_utilisation
    ${whereClause};
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
    console.error('Loss Summary Query Error:', err.message);
    res.status(500).json({ error: 'Error retrieving loss summary' });
  }
});

/**
 * @swagger
 * /rfSummarys/rf-utilisation/{organisation_id}:
 *   get:
 *     summary: Get RF Utilisation (Worked Spindle / Allocated Spindle) for an organisation
 *     tags:
 *       - rfSummarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom date range (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom date range (YYYY-MM-DD)
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more years (e.g., 2023, 2024)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more months (1 = Jan, 12 = Dec)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Week(s) of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
 *     responses:
 *       200:
 *         description: RF Utilisation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rf_utilisation_ratio:
 *                   type: string
 *                   example: "0.86"
 *                 rf_utilisation_percent:
 *                   type: string
 *                   example: "86.00"
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/rf-utilisation/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const toArray = (val) => val ? (Array.isArray(val) ? val : [val]) : [];
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);

  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const singleDate = req.query.date;

  const dayjs = require('dayjs');
  const customQuarterMap = {
    1: [3, 4, 5],   // Mar–May
    2: [6, 7, 8],   // Jun–Aug
    3: [9, 10, 11], // Sep–Nov
    4: [12, 1, 2],  // Dec–Feb
  };

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (singleDate) {
    filters.push(`date = $${idx++}`);
    values.push(singleDate);
  } else if (startDate && endDate) {
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(startDate, endDate);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx++})`);
    values.push(years);
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
    values.push(months);
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
      values.push(validWeeks);
    }
  }

  if (quarters.length) {
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default to last 12 months
  if (
    !singleDate && !startDate && !endDate &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      COALESCE(SUM(allocated_spindle::NUMERIC), 0) AS total_allocated,
      COALESCE(SUM(worked_spindle::NUMERIC), 0) AS total_worked
    FROM rf_utilisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_allocated, total_worked } = result.rows[0] || {};

    const allocated = parseFloat(total_allocated) || 0;
    const worked = parseFloat(total_worked) || 0;

    const ratio = allocated > 0 ? (worked / allocated).toFixed(2) : "0.00";
    const percent = allocated > 0 ? ((worked / allocated) * 100).toFixed(2) : "0.00";

    res.json({
      rf_utilisation_ratio: ratio,
      rf_utilisation_percent: percent
    });
  } catch (err) {
    console.error('Error calculating RF Utilisation:', err);
    res.status(500).json({ error: 'Error calculating RF Utilisation' });
  }
});

module.exports = router;