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
 * /productChart/production/efficiency/{organisation_id}:
 *   get:
 *     summary: Get average production efficiency by shift and overall
 *     tags:
 *       - Production Charts
 *     description: |
 *       Returns average efficiency values from the `production_efficiency` table for shifts 1, 2, 3 and overall combined.
 *       Data is grouped and labeled based on filters:
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
 *         description: Successful response with production efficiency data
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
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                     description: Average efficiency for Shift 1
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                     description: Average efficiency for Shift 2
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                     description: Average efficiency for Shift 3
 *                   overall:
 *                     type: number
 *                     format: float
 *                     description: Overall average efficiency for all shifts
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/production/efficiency/:organisation_id', async (req, res) => {
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
      1: [3, 4, 5],   // Mar–May
      2: [6, 7, 8],   // Jun–Aug
      3: [9, 10, 11], // Sep–Nov
      4: [12, 1, 2],  // Dec–Feb
    };
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
    ROUND(AVG(CASE WHEN shift = 1 THEN production_efficiency END)::numeric, 2) AS shift_1,
    ROUND(AVG(CASE WHEN shift = 2 THEN production_efficiency END)::numeric, 2) AS shift_2,
    ROUND(AVG(CASE WHEN shift = 3 THEN production_efficiency END)::numeric, 2) AS shift_3,
    ROUND(AVG(production_efficiency)::numeric, 2) AS overall
  FROM production_efficiency
  ${whereClause}
  GROUP BY ${groupByExpr}
  ORDER BY ${orderByExpr};
`;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching production efficiency:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /productChart/production/kgs/{organisation_id}:
 *   get:
 *     summary: Get average kgs produced by shift and overall
 *     tags:
 *       - Production Charts
 *     description: |
 *       Returns average kgs produced from the `production_kgs` table for shifts 1, 2, 3 and overall combined.
 *       Data is grouped and labeled based on filters:
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
 *         description: Successful response with production kgs data
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
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                     description: Average kgs produced for Shift 1
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                     description: Average kgs produced for Shift 2
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                     description: Average kgs produced for Shift 3
 *                   overall:
 *                     type: number
 *                     format: float
 *                     description: Overall average kgs produced for all shifts
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/production/kgs/:organisation_id', async (req, res) => {
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
      1: [3, 4, 5],   // Mar–May
      2: [6, 7, 8],   // Jun–Aug
      3: [9, 10, 11], // Sep–Nov
      4: [12, 1, 2],  // Dec–Feb
    };
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
      ROUND(AVG(CASE WHEN shift = 1 THEN kgs END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = 2 THEN kgs END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = 3 THEN kgs END)::numeric, 2) AS shift_3,
      ROUND(AVG(kgs)::numeric, 2) AS overall
    FROM production_efficiency
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching production kgs:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /productChart/production/gps/{organisation_id}:
 *   get:
 *     summary: Get average GPS values by shift and overall
 *     tags:
 *       - Production Charts
 *     description: |
 *       Returns average GPS values from the `production_gps` table for shifts 1, 2, 3 and overall combined.
 *       Data is grouped and labeled based on filters:
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
 *         description: Successful response with GPS data
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
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                     description: Average GPS for Shift 1
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                     description: Average GPS for Shift 2
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                     description: Average GPS for Shift 3
 *                   overall:
 *                     type: number
 *                     format: float
 *                     description: Overall average GPS for all shifts
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/production/gps/:organisation_id', async (req, res) => {
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
      1: [3, 4, 5],   // Mar–May
      2: [6, 7, 8],   // Jun–Aug
      3: [9, 10, 11], // Sep–Nov
      4: [12, 1, 2],  // Dec–Feb
    };
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
    ROUND(AVG(CASE WHEN shift = 1 THEN gps END)::numeric, 2) AS shift_1,
    ROUND(AVG(CASE WHEN shift = 2 THEN gps END)::numeric, 2) AS shift_2,
    ROUND(AVG(CASE WHEN shift = 3 THEN gps END)::numeric, 2) AS shift_3,
    ROUND(AVG(gps)::numeric, 2) AS overall
  FROM production_efficiency
  ${whereClause}
  GROUP BY ${groupByExpr}
  ORDER BY ${orderByExpr};
`;


  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching production GPS:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /productChart/production/utilization/{organisation_id}:
 *   get:
 *     summary: Get average Utilization % (U%) by shift and overall
 *     tags:
 *       - Production Charts
 *     description: |
 *       Returns average Utilization % from the `production_utilization` table for shifts 1, 2, 3 and overall combined.
 *       Data is grouped and labeled based on filters:
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
 *         description: Successful response with utilization data
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
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                     description: Average utilization % for Shift 1
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                     description: Average utilization % for Shift 2
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                     description: Average utilization % for Shift 3
 *                   overall:
 *                     type: number
 *                     format: float
 *                     description: Overall average utilization %
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/production/utilization/:organisation_id', async (req, res) => {
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
      1: [3, 4, 5],   // Mar–May
      2: [6, 7, 8],   // Jun–Aug
      3: [9, 10, 11], // Sep–Nov
      4: [12, 1, 2],  // Dec–Feb
    };
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

ROUND(AVG(CASE 
  WHEN shift = 1 AND ("u%"::text) ~ '^[0-9]+(\\.[0-9]+)?$' 
  THEN "u%"::NUMERIC 
  ELSE NULL 
END), 2) AS shift_1,

ROUND(AVG(CASE 
  WHEN shift = 2 AND ("u%"::text) ~ '^[0-9]+(\\.[0-9]+)?$' 
  THEN "u%"::NUMERIC 
  ELSE NULL 
END), 2) AS shift_2,

ROUND(AVG(CASE 
  WHEN shift = 3 AND ("u%"::text) ~ '^[0-9]+(\\.[0-9]+)?$' 
  THEN "u%"::NUMERIC 
  ELSE NULL 
END), 2) AS shift_3,

ROUND(AVG(CASE 
  WHEN ("u%"::text) ~ '^[0-9]+(\\.[0-9]+)?$' 
  THEN "u%"::NUMERIC 
  ELSE NULL 
END), 2) AS overall


  FROM production_efficiency
  ${whereClause}
  GROUP BY ${groupByExpr}
  ORDER BY ${orderByExpr};
`;


  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching utilization %:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /productChart/production/eup/{organisation_id}:
 *   get:
 *     summary: Get average Effective Utilization Percentage (EUP) by shift and overall
 *     tags:
 *       - Production Charts
 *     description: |
 *       Returns average EUP from the `production_eup` table for shifts 1, 2, 3 and overall combined.
 *       Data is grouped and labeled based on filters:
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
 *         description: Successful response with EUP data
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
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                     description: Average EUP for Shift 1
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                     description: Average EUP for Shift 2
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                     description: Average EUP for Shift 3
 *                   overall:
 *                     type: number
 *                     format: float
 *                     description: Overall average EUP
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/production/eup/:organisation_id', async (req, res) => {
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
      1: [3, 4, 5],   // Mar–May
      2: [6, 7, 8],   // Jun–Aug
      3: [9, 10, 11], // Sep–Nov
      4: [12, 1, 2],  // Dec–Feb
    };
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
  ROUND(AVG(CASE WHEN shift = 1 THEN eup END)::NUMERIC, 2) AS shift_1,
  ROUND(AVG(CASE WHEN shift = 2 THEN eup END)::NUMERIC, 2) AS shift_2,
  ROUND(AVG(CASE WHEN shift = 3 THEN eup END)::NUMERIC, 2) AS shift_3,
  ROUND(AVG(eup)::NUMERIC, 2) AS overall
    FROM production_efficiency
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching EUP:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 *  /productChart/production/prod_efficiency_home/{organisation_id}:
 *   get:
 *     summary: Get overall production efficiency home data (KGS, Utilization %, Production Efficiency, GPS)
 *     tags:
 *       - Production Charts
 *     description: |
 *       Returns average production efficiency metrics grouped by date/month/week based on filters.
 *       Data is grouped and labeled based on filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly (12–24 months).
 *       - `month`: Grouped by week (max 5 weeks).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarter (Mar–May, Jun–Aug, Sep–Nov, Dec–Feb).
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
 *         description: Successful response with production efficiency data
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
 *                   kgs:
 *                     type: number
 *                     format: float
 *                     description: Average KGS
 *                   utilization_percentage:
 *                     type: number
 *                     format: float
 *                     description: Average Utilization Percentage (U%)
 *                   production_efficiency:
 *                     type: number
 *                     format: float
 *                     description: Average Production Efficiency
 *                   gps:
 *                     type: number
 *                     format: float
 *                     description: Average GPS metric
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/production/prod_efficiency_home/:organisation_id', async (req, res) => {
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
      1: [3, 4, 5],   // Mar–May
      2: [6, 7, 8],   // Jun–Aug
      3: [9, 10, 11], // Sep–Nov
      4: [12, 1, 2],  // Dec–Feb
    };
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
      ROUND(AVG(kgs)::NUMERIC, 2) AS kgs,
      ROUND(
  AVG(
    CASE 
      WHEN ("u%"::text) ~ '^[0-9]+(\.[0-9]+)?$' THEN "u%"::NUMERIC
      ELSE NULL
    END
  ), 2
) AS utilization_percentage,
      ROUND(AVG(production_efficiency)::NUMERIC, 2) AS production_efficiency,
      ROUND(AVG(gps)::NUMERIC, 2) AS gps
    FROM production_efficiency
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 *  /productChart/production/eup_home/{organisation_id}:
 *   get:
 *     summary: Get overall production efficiency home data (EUP, Utilization %, Production Efficiency)
 *     tags:
 *       - Production Charts
 *     description: |
 *       Returns average production efficiency metrics grouped by date/month/week based on filters.
 *       Data is grouped and labeled based on filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly (12–24 months).
 *       - `month`: Grouped by week (max 5 weeks).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarter (Mar–May, Jun–Aug, Sep–Nov, Dec–Feb).
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
 *         description: Successful response with production efficiency data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   eup:
 *                     type: number
 *                     format: float
 *                   utilization_percentage:
 *                     type: number
 *                     format: float
 *                   production_efficiency:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */

router.get('/production/eup_home/:organisation_id', async (req, res) => {
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
      1: [3, 4, 5],
      2: [6, 7, 8],
      3: [9, 10, 11],
      4: [12, 1, 2],
    };
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
      ROUND(AVG(eup)::NUMERIC, 2) AS eup,
      ROUND(
        AVG(
          CASE 
            WHEN ("u%"::text) ~ '^[0-9]+(\\.[0-9]+)?$' THEN "u%"::NUMERIC
            ELSE NULL
          END
        ), 2
      ) AS utilization_percentage,
      ROUND(AVG(production_efficiency)::NUMERIC, 2) AS production_efficiency
    FROM production_efficiency
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


module.exports = router;