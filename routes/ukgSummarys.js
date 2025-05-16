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
 * /ukgSummarys/br_carding_awes_ukg/{organisation_id}:
 *   get:
 *     summary: Get total BR Crading and awes produced in Unit per KG
 *     tags:
 *       - UKG Summarys
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
 *         description: Total BR Crading and awes produced
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
router.get('/br_carding_awes_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(br_carding_awes_ukg::NUMERIC), 0) AS total_br_carding_awes_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_br_carding_awes_ukg } = result.rows[0];
    res.json({ total_br_carding_awes_ukg: parseFloat(total_br_carding_awes_ukg) || 0 });
  } catch (err) {
    console.error('BR Crading and awes Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total BR Crading and awes' });
  }
});



/**
 * @swagger
 * /ukgSummarys/humidification_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Humidification produced in Unit per KG
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Humidification produced
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
router.get('/humidification_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(humidification_ukg::NUMERIC), 0) AS total_humidification_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_humidification_ukg } = result.rows[0];
    res.json({ total_humidification_ukg: parseFloat(total_humidification_ukg) || 0 });
  } catch (err) {
    console.error('Humidification Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total Humidification' });
  }
});


/**
 * @swagger
 * /ukgSummarys/compressor_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Compressor produced in Unit per KG
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Compressor produced
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
router.get('/compressor_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(compressor_ukg::NUMERIC), 0) AS total_compressor_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_humidification_ukg } = result.rows[0];
    res.json({ total_compressor_ukg: parseFloat(total_compressor_ukg) || 0 });
  } catch (err) {
    console.error('Compressor Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total Compressor' });
  }
});


/**
 * @swagger
 * /ukgSummarys/lighting_other_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Lightning and other produced in Unit per KG
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Lightning and other produced
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
router.get('/lighting_other_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(lighting_other_ukg::NUMERIC), 0) AS total_lighting_other_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_lighting_other_ukg } = result.rows[0];
    res.json({ total_lighting_other_ukg: parseFloat(total_lighting_other_ukg) || 0 });
  } catch (err) {
    console.error('Lightning and other Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total Lightning and other' });
  }
});


/**
 * @swagger
 * /ukgSummarys/speed_frame_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Speed Frame produced in Unit per KG
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Speed Frame produced
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
router.get('/speed_frame_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(speed_frame_ukg::NUMERIC), 0) AS total_speed_frame_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_speed_frame_ukg } = result.rows[0];
    res.json({ total_speed_frame_ukg: parseFloat(total_speed_frame_ukg) || 0 });
  } catch (err) {
    console.error('Speed Frame Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total Speed Frame' });
  }
});



/**
 * @swagger
 * /ukgSummarys/ring_frame_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Ring Frame produced in Unit per KG
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Ring Frame produced
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
router.get('/ring_frame_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(ring_frame_ukg::NUMERIC), 0) AS total_ring_frame_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_ring_frame_ukg } = result.rows[0];
    res.json({ total_ring_frame_ukg: parseFloat(total_ring_frame_ukg) || 0 });
  } catch (err) {
    console.error('Ring Frame Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total Ring Frame' });
  }
});



/**
 * @swagger
 * /ukgSummarys/autoconer_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Autoconer produced in Unit per KG
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Autoconer produced
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
router.get('/autoconer_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(autoconer_ukg::NUMERIC), 0) AS total_autoconer_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { total_autoconer_ukg } = result.rows[0];
    res.json({ total_autoconer_ukg: parseFloat(total_autoconer_ukg) || 0 });
  } catch (err) {
    console.error('Autoconer Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating total Autoconer' });
  }
});


/**
 * @swagger
 * /ukgSummarys/draw_frame_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Draw Frame UKG values
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Draw Frame UKG
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 first_passage_ukg:
 *                   type: number
 *                   example: 1200.5
 *                 second_passage_ukg:
 *                   type: number
 *                   example: 980.3
 *       500:
 *         description: Internal server error
 */
router.get('/draw_frame_ukg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(first_passage_ukg::NUMERIC), 0) AS first_passage_ukg,
      COALESCE(SUM(second_passage_ukg::NUMERIC), 0) AS second_passage_ukg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Draw Frame UKG Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating Draw Frame UKG' });
  }
});


/**
 * @swagger
 * /ukgSummarys/machine_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Machine UKG values
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Machine UKG
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 first_passage_ukg:
 *                   type: number
 *                   example: 1200.5
 *                 second_passage_ukg:
 *                   type: number
 *                   example: 980.3
 *                 speed_frame_ukg:
 *                   type: number
 *                   example: 760.2
 *                 ring_frame_ukg:
 *                   type: number
 *                   example: 5400.0
 *                 autoconer_ukg:
 *                   type: number
 *                   example: 15420.5
 *       500:
 *         description: Internal server error
 */
router.get('/machine_ukg/:organisation_id', async (req, res) => {
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
    SELECT (
      COALESCE(SUM(first_passage_ukg::NUMERIC), 0) +
      COALESCE(SUM(second_passage_ukg::NUMERIC), 0) +
      COALESCE(SUM(speed_frame_ukg::NUMERIC), 0) +
      COALESCE(SUM(ring_frame_ukg::NUMERIC), 0) +
      COALESCE(SUM(autoconer_ukg::NUMERIC), 0) 
    ) AS machine
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Machine UKG Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating Machine UKG' });
  }
});

/**
 * @swagger
 * /ukgSummarys/operation_ukg/{organisation_id}:
 *   get:
 *     summary: Get total Operation UKG values
 *     tags:
 *       - UKG Summarys
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
 *         description: Total Operation UKG
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 humidification_ukg:
 *                   type: number
 *                   example: 1350.2
 *                 compressor_ukg:
 *                   type: number
 *                   example: 910.5
 *                 lighting_other_ukg:
 *                   type: number
 *                   example: 320.8
 *       500:
 *         description: Internal server error
 */
router.get('/operation_ukg/:organisation_id', async (req, res) => {
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
    SELECT (
      COALESCE(SUM(humidification_ukg::NUMERIC), 0) +
      COALESCE(SUM(compressor_ukg::NUMERIC), 0) +
      COALESCE(SUM(lighting_other_ukg::NUMERIC), 0)
    ) AS operation
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Operation UKG Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating Operation UKG' });
  }
});


/**
 * @swagger
 * /ukgSummarys/unit-per-kg/{organisation_id}:
 *   get:
 *     summary: Get total unit per kg (sum of all energy UKG values)
 *     tags:
 *       - UKG Summarys
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
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
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
 *         description: Total unit per kg
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unit_per_kg:
 *                   type: number
 *                   example: 3872.57
 *       500:
 *         description: Internal server error
 */
router.get('/unit-per-kg/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(br_carding_awes_ukg::NUMERIC), 0) +
      COALESCE(SUM(first_passage_ukg::NUMERIC), 0) +
      COALESCE(SUM(second_passage_ukg::NUMERIC), 0) +
      COALESCE(SUM(speed_frame_ukg::NUMERIC), 0) +
      COALESCE(SUM(ring_frame_ukg::NUMERIC), 0) +
      COALESCE(SUM(autoconer_ukg::NUMERIC), 0) +
      COALESCE(SUM(humidification_ukg::NUMERIC), 0) +
      COALESCE(SUM(compressor_ukg::NUMERIC), 0) +
      COALESCE(SUM(lighting_other_ukg::NUMERIC), 0)
      AS unit_per_kg
    FROM unit_per_kg
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { unit_per_kg } = result.rows[0] || {};
    res.json({ unit_per_kg: parseFloat(unit_per_kg || 0).toFixed(2) });
  } catch (err) {
    console.error('Unit per KG Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating unit per kg' });
  }
});


module.exports = router;