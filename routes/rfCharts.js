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
 * /rfCharts/mechanical/routine-maintainance/{organisation_id}:
 *   get:
 *     summary: Get average routine maintenance values from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `routine_maintainance` from the `rf_utilisation` table.
 *       Data is grouped and labeled based on the filters provided.
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly (12–24 months).
 *       - `month`: Grouped by week (max 5 weeks).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarter (Mar–May, etc.).
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
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
 *         description: Filter by week of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom range (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom range (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Successful response with chart data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (month, week, or date)
 *                   avg_routine_maintainance:
 *                     type: number
 *                     format: float
 *                     description: Average routine maintenance value
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */

router.get('/mechanical/routine-maintainance/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  // Default last 12 months data if no filters
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Label and grouping based on filters
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(routine_maintainance::NUMERIC), 2) AS avg_routine_maintainance
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching routine_maintainance:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /rfCharts/mechanical/preventive-maintainance/{organisation_id}:
 *   get:
 *     summary: Get average preventive maintenance values from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `preventive_maintainance` from the `rf_utilisation` table.
 *       Grouping is dynamic based on the filters provided:
 *       - No filters: Last 12 months grouped by month
 *       - year: Monthly grouping
 *       - month: Weekly grouping (max 5)
 *       - week: Daily grouping
 *       - start_date + end_date: Custom date range (daily)
 *       - quarter: Uses custom financial quarter mapping
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
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
 *         description: Filter by week of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with label and average preventive maintainance
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (month, week, or date)
 *                   avg_preventive_maintainance:
 *                     type: number
 *                     format: float
 *                     description: Average preventive maintenance value
 *       400:
 *         description: organisation_id is required
 *       500:
 *         description: Internal server error
 */
router.get('/mechanical/preventive-maintainance/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(preventive_maintainance::NUMERIC), 2) AS avg_preventive_maintainance
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching preventive_maintainance:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /rfCharts/mechanical/mechanical-breakdown/{organisation_id}:
 *   get:
 *     summary: Get average mechanical breakdown from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `mechanical_breakdown` from the `rf_utilisation` table.
 *       Grouped by:
 *       - Last 12 months if no filters (monthly)
 *       - year → 12–24 months
 *       - month → up to 5 weeks
 *       - week or custom dates → daily
 *       - quarter → custom financial months
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s) (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by week(s) of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average mechanical breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_mechanical_breakdown:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */

router.get('/mechanical/mechanical-breakdown/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(mechanical_breakdown::NUMERIC), 2) AS avg_mechanical_breakdown
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching mechanical_breakdown:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/electrical/electrical-breakdown/{organisation_id}:
 *   get:
 *     summary: Get average electrical breakdown from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `electrical_breakdown` from the `rf_utilisation` table.
 *       Data is dynamically grouped based on the filters used:
 *       - No filters: Last 12 months grouped monthly
 *       - year: Monthly
 *       - month: Weekly (max 5)
 *       - week or start_date + end_date: Daily
 *       - quarter: Based on custom month mapping (Q1 = Mar–May, etc.)
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Year(s) to filter
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Month(s) to filter (1 = Jan, ..., 12 = Dec)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week(s) of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average electrical breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_electrical_breakdown:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/electrical/electrical-breakdown/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(electrical_breakdown::NUMERIC), 2) AS avg_electrical_breakdown
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching electrical_breakdown:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/electrical/planned-maintainance/{organisation_id}:
 *   get:
 *     summary: Get average planned maintainance from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `planned_maintainance` from the `rf_utilisation` table.
 *       Grouping is dynamic based on filters:
 *       - No filters → last 12 months by month
 *       - year → 12–24 months by month
 *       - month → up to 5 weeks
 *       - week or custom dates → daily
 *       - quarter → custom quarters (e.g., Q1 = Mar–May)
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s) (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by week(s) of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average planned maintainance
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_planned_maintainance:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/electrical/planned-maintainance/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(planned_maintainance::NUMERIC), 2) AS avg_planned_maintainance
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching planned_maintainance:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/electrical/power-failure/{organisation_id}:
 *   get:
 *     summary: Get average power failure from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `power_failure` from the `rf_utilisation` table.
 *       Grouping changes based on provided filters:
 *       - Default: Last 12 months grouped monthly
 *       - year: Monthly (up to 24 months)
 *       - month: Weekly (max 5)
 *       - week or custom range: Daily
 *       - quarter: Mar–May, Jun–Aug, etc.
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Year(s) to filter
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Month(s) to filter (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week(s) of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average power failure
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_power_failure:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */

router.get('/electrical/power-failure/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  // Default: last 12 months if no filters provided
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping logic
  let labelExpr, groupByExpr, orderByExpr;
  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(power_failure::NUMERIC), 2) AS avg_power_failure
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching power_failure:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/labour/labour-absentism/{organisation_id}:
 *   get:
 *     summary: Get average labour absentism from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `labour_absentism` from the `rf_utilisation` table.
 *       Grouping varies by filter:
 *       - Default: Last 12 months grouped by month
 *       - year: Monthly (up to 24 months)
 *       - month: Weekly (max 5)
 *       - week or custom date range: Daily
 *       - quarter: Financial quarter (e.g., Q1 = Mar–May)
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
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
 *         description: Filter by month (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by week of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average labour absentism
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_labour_absentism:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/labour/labour-absentism/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping expressions
  let labelExpr, groupByExpr, orderByExpr;
  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(labour_absentism::NUMERIC), 2) AS avg_labour_absentism
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching labour_absentism:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/labour/labour-unrest/{organisation_id}:
 *   get:
 *     summary: Get average labour unrest from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns average of `labour_unrest` from the `rf_utilisation` table.
 *       Data is grouped by:
 *       - Default: Last 12 months grouped monthly
 *       - year: Monthly (up to 24 months)
 *       - month: Weekly (max 5)
 *       - week or custom date range: Daily
 *       - quarter: Financial quarter (e.g., Q1 = Mar–May)
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s) (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by week(s) of the month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average labour unrest
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_labour_unrest:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/labour/labour-unrest/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping
  let labelExpr, groupByExpr, orderByExpr;
  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(labour_unrest::NUMERIC), 2) AS avg_labour_unrest
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching labour_unrest:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/labour/labour-shortage/{organisation_id}:
 *   get:
 *     summary: Get average labour shortage from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `labour_shortage` from the `rf_utilisation` table.
 *       Grouping varies based on filters:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly (12–24 months)
 *       - month: Weekly (Week 1–5)
 *       - week or custom dates: Daily
 *       - quarter: Custom quarter (e.g., Q1 = Mar–May)
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
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
 *     responses:
 *       200:
 *         description: Chart data with average labour shortage
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_labour_shortage:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/labour/labour-shortage/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(labour_shortage::NUMERIC), 2) AS avg_labour_shortage
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching labour_shortage:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/labour/doff-delay/{organisation_id}:
 *   get:
 *     summary: Get average doff delay from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns average of `doff_delay` from the `rf_utilisation` table.
 *       Grouping depends on filters:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly breakdown
 *       - month: 5-week breakdown
 *       - week or custom date range: Daily
 *       - quarter: Financial quarter logic (Q1: Mar–May, etc.)
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
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
 *     responses:
 *       200:
 *         description: Chart data with average doff delay
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_doff_delay:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/labour/doff-delay/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  // Default last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(doff_delay::NUMERIC), 2) AS avg_doff_delay
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching doff_delay:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/process/bobbin-shortage/{organisation_id}:
 *   get:
 *     summary: Get average bobbin shortage from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns average of `bobbin_shortage` from the `rf_utilisation` table.
 *       Grouped by:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly
 *       - month: Weekly (1–5)
 *       - week or custom date: Daily
 *       - quarter: Custom Q1–Q4 grouping
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average bobbin shortage
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_bobbin_shortage:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/process/bobbin-shortage/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Label & group logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(bobbin_shortage::NUMERIC), 2) AS avg_bobbin_shortage
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching bobbin_shortage:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/process/lot-count-change/{organisation_id}:
 *   get:
 *     summary: Get average lot count change from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns average of `lot_count_change` from the `rf_utilisation` table.
 *       Grouped dynamically based on filters:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly
 *       - month: Weekly (1–5)
 *       - week or date range: Daily
 *       - quarter: Custom Q1–Q4 logic
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average lot count change
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_lot_count_change:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/process/lot-count-change/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  // Default: Last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(lot_count_change::NUMERIC), 2) AS avg_lot_count_change
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lot_count_change:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/process/lot-count-runout/{organisation_id}:
 *   get:
 *     summary: Get average lot count runout from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `lot_count_runout` from the `rf_utilisation` table.
 *       Grouped dynamically based on filters:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly
 *       - month: Weekly (1–5)
 *       - week or custom date: Daily
 *       - quarter: Custom Q1–Q4 logic
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average lot count runout
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_lot_count_runout:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/process/lot-count-runout/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  // Default last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Determine grouping
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(lot_count_runout::NUMERIC), 2) AS avg_lot_count_runout
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lot_count_runout:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/process/quality-checking/{organisation_id}:
 *   get:
 *     summary: Get average quality checking value from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `quality_checking` from the `rf_utilisation` table.
 *       Grouping depends on filters:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly (up to 24)
 *       - month: Weekly (1–5)
 *       - week or custom date: Daily
 *       - quarter: Custom financial quarters
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
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
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom range (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom range (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Chart data with average quality_checking
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_quality_checking:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/process/quality-checking/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  // Default: Last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(quality_checking::NUMERIC), 2) AS avg_quality_checking
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching quality_checking:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/process/quality-deviation/{organisation_id}:
 *   get:
 *     summary: Get average quality deviation from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `quality_deviation` from the `rf_utilisation` table.
 *       Grouping and granularity adapt based on filter input:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly
 *       - month: Weekly
 *       - week or date range: Daily
 *       - quarter: Custom financial quarter
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarters (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
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
 *     responses:
 *       200:
 *         description: Chart data with average quality_deviation
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_quality_deviation:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/process/quality-deviation/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(quality_deviation::NUMERIC), 2) AS avg_quality_deviation
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching quality_deviation:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/process/traveller-change/{organisation_id}:
 *   get:
 *     summary: Get average traveller change from rf_utilisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns the average of `traveller_change` from the `rf_utilisation` table.
 *       Grouping behavior changes dynamically:
 *       - Default: Last 12 months (monthly)
 *       - year: Monthly (12–24 months)
 *       - month: Weekly (1–5 weeks)
 *       - week or date range: Daily
 *       - quarter: Custom quarter mapping (e.g., Q1: Mar–May)
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organisation ID
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
 *         description: Filter by one or more months (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Week(s) of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: "Custom quarter (Q1: Mar–May, Q2: Jun–Aug, Q3: Sep–Nov, Q4: Dec–Feb)"
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Custom start date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Custom end date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Chart data with average traveller_change
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_traveller_change:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */
router.get('/process/traveller-change/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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

  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(traveller_change::NUMERIC), 2) AS avg_traveller_change
    FROM rf_utilisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching traveller_change:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /rfCharts/loss-summary/{organisation_id}:
 *   get:
 *     summary: Get grouped loss summary for an organisation
 *     tags:
 *       - RF Charts
 *     description: |
 *       Returns grouped loss summary (no percentages) from RF Utilisation.
 *       
 *       **Grouping rules:**
 *       - If `start_date`/`end_date` or `week` are passed → grouped by day.
 *       - If `month` is passed → grouped by week number within the month.
 *       - Otherwise → grouped by month (default: last 12 months).
 *       
 *       **Categories:**
 *       - Mechanical = routine + preventive + breakdown
 *       - Electrical = breakdown + planned + power failure
 *       - Labour = absentism + shortage + unrest + doff delay
 *       - Process = bobbin + count change + runout + quality issues + traveller change
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the organisation
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by month(s)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by week(s) of month (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by quarter(s) (1–4)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for range filtering (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for range filtering (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Grouped loss summary
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (e.g., "Jul 2024" or "2024-07-12")
 *                   allocated_spindle:
 *                     type: number
 *                     description: Total allocated spindle count
 *                   mechanical:
 *                     type: number
 *                     description: Total mechanical loss
 *                   electrical:
 *                     type: number
 *                     description: Total electrical loss
 *                   labour:
 *                     type: number
 *                     description: Total labour-related loss
 *                   process:
 *                     type: number
 *                     description: Total process-related loss
 *       400:
 *         description: organisation_id is required
 *       500:
 *         description: Internal error occurred while fetching loss summary
 */
router.get('/loss-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
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
    const customQuarterMap = {
      1: [1, 2, 3],
      2: [4, 5, 6],
      3: [7, 8, 9],
      4: [10, 11, 12]
    };
    const quarterMonths = quarters.flatMap(q => customQuarterMap[q] || []);
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default to last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate || weeks.length) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT 
      ${labelExpr} AS label,
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
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);

    const response = result.rows.map(row => ({
      label: row.label,
      allocated_spindle: Number(row.allocated_spindle),
      mechanical: Number(row.mechanical),
      electrical: Number(row.electrical),
      labour: Number(row.labour),
      process: Number(row.process)
    }));

    res.json(response);
  } catch (err) {
    console.error('Loss Summary Error:', err);
    res.status(500).json({ error: 'Failed to fetch loss summary' });
  }
});

module.exports = router;