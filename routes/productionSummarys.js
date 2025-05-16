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
 * /productionSummarys/totalKgs/{organisation_id}:
 *   get:
 *     summary: Get total kilograms produced from production_efficiency
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Total kgs produced
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_kgs:
 *                   type: number
 *                   example: 15420.5
 *       500:
 *         description: Internal server error
 */
router.get('/totalKgs/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
      COALESCE(SUM(kgs::NUMERIC), 0) AS total_kgs
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_kgs } = result.rows[0];
    res.json({ total_kgs: parseFloat(total_kgs) || 0 });
  } catch (err) {
    console.error('Production Kgs Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total kgs' });
  }
});
/**
 * @swagger
 * /productionSummarys/totalKgs/shift1/{organisation_id}:
 *   get:
 *     summary: Get total kilograms produced for shift 1
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Total kilograms produced for shift 1
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_kgs:
 *                   type: number
 *                   example: 8120.75
 *       500:
 *         description: Internal server error
 */
router.get('/totalKgs/shift1/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 1`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
      COALESCE(SUM(kgs::NUMERIC), 0) AS total_kgs
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_kgs } = result.rows[0];
    res.json({ total_kgs: parseFloat(total_kgs) || 0 });
  } catch (err) {
    console.error('Shift 1 Total Kgs Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 1 total kgs' });
  }
});
/**
 * @swagger
 * /productionSummarys/totalKgs/shift2/{organisation_id}:
 *   get:
 *     summary: Get total kilograms produced for shift 2
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Total kilograms produced for shift 2
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_kgs:
 *                   type: number
 *                   example: 9420.75
 *       500:
 *         description: Internal server error
 */
router.get('/totalKgs/shift2/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 2`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
      COALESCE(SUM(kgs::NUMERIC), 0) AS total_kgs
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_kgs } = result.rows[0];
    res.json({ total_kgs: parseFloat(total_kgs) || 0 });
  } catch (err) {
    console.error('Shift 2 Total Kgs Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 2 total kgs' });
  }
});
/**
 * @swagger
 * /productionSummarys/totalKgs/shift3/{organisation_id}:
 *   get:
 *     summary: Get total kilograms produced for shift 3
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Total kilograms produced for shift 3
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_kgs:
 *                   type: number
 *                   example: 7320.65
 *       500:
 *         description: Internal server error
 */
router.get('/totalKgs/shift3/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 3`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
      COALESCE(SUM(kgs::NUMERIC), 0) AS total_kgs
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_kgs } = result.rows[0];
    res.json({ total_kgs: parseFloat(total_kgs) || 0 });
  } catch (err) {
    console.error('Shift 3 Total Kgs Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 3 total kgs' });
  }
});

/**
 * @swagger
 * /productionSummarys/uPercent/{organisation_id}:
 *   get:
 *     summary: Get average U% from production_efficiency
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Average U% across filtered records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 average_u_percent:
 *                   type: number
 *                   example: 8.23
 *       500:
 *         description: Internal server error
 */
router.get('/uPercent/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
    ROUND(AVG(
      CASE 
        WHEN "u%"::TEXT ~ '^[0-9]+(\\.[0-9]+)?$' 
        THEN "u%"::NUMERIC 
        ELSE 0 
      END
    ), 2) AS average_u_percent
  FROM production_efficiency
  ${whereClause};
`;


  try {
    const result = await client.query(query, values);
    const { average_u_percent } = result.rows[0];
    res.json({ average_u_percent: parseFloat(average_u_percent) || 0 });
  } catch (err) {
    console.error('U% Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating U%' });
  }
});


/**
 * @swagger
 * /productionSummarys/uPercent/shift1/{organisation_id}:
 *   get:
 *     summary: Get average U% for shift 1
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more months (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by week-of-month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1–4)
 *     responses:
 *       200:
 *         description: Average U% for shift 1
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 average_u_percent:
 *                   type: number
 *                   example: 7.35
 *       500:
 *         description: Internal server error
 */
router.get('/uPercent/shift1/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 1`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
      ROUND(AVG(
        CASE 
          WHEN "u%"::TEXT ~ '^[0-9]+(\\.[0-9]+)?$' 
          THEN "u%"::NUMERIC 
          ELSE 0 
        END
      ), 2) AS average_u_percent
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { average_u_percent } = result.rows[0];
    res.json({ average_u_percent: parseFloat(average_u_percent) || 0 });
  } catch (err) {
    console.error('Shift 1 U% Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 1 U%' });
  }
});


/**
 * @swagger
 * /productionSummarys/uPercent/shift2/{organisation_id}:
 *   get:
 *     summary: Get average U% for shift 2
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more months (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by week-of-month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1–4)
 *     responses:
 *       200:
 *         description: Average U% for shift 2
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 average_u_percent:
 *                   type: number
 *                   example: 6.78
 *       500:
 *         description: Internal server error
 */
router.get('/uPercent/shift2/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 2`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
      ROUND(AVG(
        CASE 
          WHEN "u%"::TEXT ~ '^[0-9]+(\\.[0-9]+)?$' 
          THEN "u%"::NUMERIC 
          ELSE 0 
        END
      ), 2) AS average_u_percent
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { average_u_percent } = result.rows[0];
    res.json({ average_u_percent: parseFloat(average_u_percent) || 0 });
  } catch (err) {
    console.error('Shift 2 U% Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 2 U%' });
  }
});



/**
 * @swagger
 * /productionSummarys/uPercent/shift3/{organisation_id}:
 *   get:
 *     summary: Get average U% for shift 3
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more months (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by week-of-month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1–4)
 *     responses:
 *       200:
 *         description: Average U% for shift 3
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 average_u_percent:
 *                   type: number
 *                   example: 9.87
 *       500:
 *         description: Internal server error
 */
router.get('/uPercent/shift3/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 3`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

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
      ROUND(AVG(
        CASE 
          WHEN "u%"::TEXT ~ '^[0-9]+(\\.[0-9]+)?$' 
          THEN "u%"::NUMERIC 
          ELSE 0 
        END
      ), 2) AS average_u_percent
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { average_u_percent } = result.rows[0];
    res.json({ average_u_percent: parseFloat(average_u_percent) || 0 });
  } catch (err) {
    console.error('Shift 3 U% Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 3 U%' });
  }
});


/**
 * @swagger
 * /productionSummarys/efficiencyTotal/{organisation_id}:
 *   get:
 *     summary: Get total production efficiency (sum of values)
 *     tags:
 *       - Production Summarys
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
 *         description: Specific date (YYYY-MM-DD)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total production efficiency
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_efficiency:
 *                   type: number
 *                   example: 7821.50
 *       500:
 *         description: Internal server error
 */
router.get('/efficiencyTotal/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(production_efficiency::NUMERIC), 2) AS total_efficiency
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_efficiency } = result.rows[0];
    res.json({ total_efficiency: parseFloat(total_efficiency) || 0 });
  } catch (err) {
    console.error('Production Efficiency Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total production efficiency' });
  }
});

/**
 * @swagger
 * /productionSummarys/gpsTotal/{organisation_id}:
 *   get:
 *     summary: Get total GPS from production_efficiency
 *     tags:
 *       - Production Summarys
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
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total GPS value
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_gps:
 *                   type: number
 *                   example: 26400.75
 *       500:
 *         description: Internal server error
 */
router.get('/gpsTotal/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(gps::NUMERIC), 2) AS total_gps
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_gps } = result.rows[0];
    res.json({ total_gps: parseFloat(total_gps) || 0 });
  } catch (err) {
    console.error('GPS Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total GPS' });
  }
});



/**
 * @swagger
 * /productionSummarys/gpsTotal/shift1/{organisation_id}:
 *   get:
 *     summary: Get total GPS for shift 1 from production_efficiency
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Total GPS value for shift 1
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_gps:
 *                   type: number
 *                   example: 13200.5
 *       500:
 *         description: Internal server error
 */
router.get('/gpsTotal/shift1/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 1`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(gps::NUMERIC), 2) AS total_gps
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_gps } = result.rows[0];
    res.json({ total_gps: parseFloat(total_gps) || 0 });
  } catch (err) {
    console.error('Shift 1 GPS Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total GPS for shift 1' });
  }
});



/**
 * @swagger
 * /productionSummarys/gpsTotal/shift2/{organisation_id}:
 *   get:
 *     summary: Get total GPS for shift 2 from production_efficiency
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Total GPS value for shift 2
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_gps:
 *                   type: number
 *                   example: 13200.5
 *       500:
 *         description: Internal server error
 */
router.get('/gpsTotal/shift2/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 2`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(gps::NUMERIC), 2) AS total_gps
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_gps } = result.rows[0];
    res.json({ total_gps: parseFloat(total_gps) || 0 });
  } catch (err) {
    console.error('Shift 2 GPS Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total GPS for shift 2' });
  }
});

/**
 * @swagger
 * /productionSummarys/gpsTotal/shift3/{organisation_id}:
 *   get:
 *     summary: Get total GPS for shift 3 from production_efficiency
 *     tags:
 *       - Production Summarys
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
 *         description: Filter by one or more years
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
 *         description: Filter by week-of-month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by quarters (1-4)
 *     responses:
 *       200:
 *         description: Total GPS value for shift 3
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_gps:
 *                   type: number
 *                   example: 11000.75
 *       500:
 *         description: Internal server error
 */
router.get('/gpsTotal/shift3/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 3`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(gps::NUMERIC), 2) AS total_gps
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_gps } = result.rows[0];
    res.json({ total_gps: parseFloat(total_gps) || 0 });
  } catch (err) {
    console.error('Shift 3 GPS Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total GPS for shift 3' });
  }
});


/**
 * @swagger
 * /productionSummarys/efficiencyTotal/shift1/{organisation_id}:
 *   get:
 *     summary: Get total production efficiency for shift 1
 *     tags:
 *       - Production Summarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total production efficiency for shift 1
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_efficiency:
 *                   type: number
 *                   example: 4382.10
 */
router.get('/efficiencyTotal/shift1/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 1`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(production_efficiency::NUMERIC), 2) AS total_efficiency
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_efficiency } = result.rows[0];
    res.json({ total_efficiency: parseFloat(total_efficiency) || 0 });
  } catch (err) {
    console.error('Shift 1 Efficiency Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 1 production efficiency' });
  }
});


/**
 * @swagger
 * /productionSummarys/efficiencyTotal/shift2/{organisation_id}:
 *   get:
 *     summary: Get total production efficiency for shift 2
 *     tags:
 *       - Production Summarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total production efficiency for shift 2
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_efficiency:
 *                   type: number
 *                   example: 4928.70
 */
router.get('/efficiencyTotal/shift2/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 2`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(production_efficiency::NUMERIC), 2) AS total_efficiency
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_efficiency } = result.rows[0];
    res.json({ total_efficiency: parseFloat(total_efficiency) || 0 });
  } catch (err) {
    console.error('Shift 2 Efficiency Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 2 production efficiency' });
  }
});
/**
 * @swagger
 * /productionSummarys/efficiencyTotal/shift3/{organisation_id}:
 *   get:
 *     summary: Get total production efficiency for shift 3
 *     tags:
 *       - Production Summarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total production efficiency for shift 3
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_efficiency:
 *                   type: number
 *                   example: 3725.45
 */
router.get('/efficiencyTotal/shift3/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 3`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(production_efficiency::NUMERIC), 2) AS total_efficiency
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_efficiency } = result.rows[0];
    res.json({ total_efficiency: parseFloat(total_efficiency) || 0 });
  } catch (err) {
    console.error('Shift 3 Efficiency Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 3 production efficiency' });
  }
});


/**
 * @swagger
 * /productionSummarys/eupTotal/shift1/{organisation_id}:
 *   get:
 *     summary: Get total EUP for shift 1
 *     tags:
 *       - Production Summarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total EUP for shift 1
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_eup:
 *                   type: number
 *                   example: 1450.30
 */
router.get('/eupTotal/shift1/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 1`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(eup::NUMERIC), 2) AS total_eup
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_eup } = result.rows[0];
    res.json({ total_eup: parseFloat(total_eup) || 0 });
  } catch (err) {
    console.error('Shift 1 EUP Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 1 EUP' });
  }
});


/**
 * @swagger
 * /productionSummarys/eupTotal/shift2/{organisation_id}:
 *   get:
 *     summary: Get total EUP for shift 2
 *     tags:
 *       - Production Summarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total EUP for shift 2
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_eup:
 *                   type: number
 *                   example: 1820.55
 */
router.get('/eupTotal/shift2/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 2`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(eup::NUMERIC), 2) AS total_eup
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_eup } = result.rows[0];
    res.json({ total_eup: parseFloat(total_eup) || 0 });
  } catch (err) {
    console.error('Shift 2 EUP Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 2 EUP' });
  }
});

/**
 * @swagger
 * /productionSummarys/eupTotal/shift3/{organisation_id}:
 *   get:
 *     summary: Get total production efficiency for shift 3
 *     tags:
 *       - Production Summarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total production efficiency for shift 3
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_efficiency:
 *                   type: number
 *                   example: 3725.45
 */

router.get('/eupTotal/shift3/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`, `shift = 3`];
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(eup::NUMERIC), 2) AS total_eup
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_eup } = result.rows[0];
    res.json({ total_eup: parseFloat(total_eup) || 0 });
  } catch (err) {
    console.error('Shift 3 EUP Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating shift 3 EUP' });
  }
});

/**
 * @swagger
 * /productionSummarys/eupTotal/overall/{organisation_id}:
 *   get:
 *     summary: Get total EUP for all shifts
 *     tags:
 *       - Production Summarys
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
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *     responses:
 *       200:
 *         description: Total EUP across all shifts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_eup:
 *                   type: number
 *                   example: 4723.50
 */
router.get('/eupTotal/overall/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12]
  };

  let filters = [`organisation_id = $1`]; // No shift filter — include all
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
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(weeks);
  }

  if (quarters.length) {
    const expanded = quarters.flatMap(q => quarterMap[q] || []);
    if (expanded.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expanded);
    }
  }

  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length && !weeks.length && !quarters.length
  ) {
    const dayjs = require('dayjs');
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ROUND(SUM(eup::NUMERIC), 2) AS total_eup
    FROM production_efficiency
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_eup } = result.rows[0];
    res.json({ total_eup: parseFloat(total_eup) || 0 });
  } catch (err) {
    console.error('Overall EUP Total Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating overall EUP' });
  }
});

module.exports = router;
