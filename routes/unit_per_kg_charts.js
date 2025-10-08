const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const dayjs = require('dayjs');

const toArray = (param) => {
  if (!param) return [];
  return Array.isArray(param) ? param : [param];
};

/**
 * @swagger
 * /unit_per_kg_charts/br_carding_awes_ukg/{organisation_id}:
 *   get:
 *     summary: Get average BR Carding AWES UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `br_carding_awes_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly (12–24 months).
 *       - `month`: Grouped by week (max 5 weeks).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters.
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average BR Carding AWES UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/br_carding_awes_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN br_carding_awes_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN br_carding_awes_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN br_carding_awes_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(br_carding_awes_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching br_carding_awes_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /unit_per_kg_charts/first_passage_ukg/{organisation_id}:
 *   get:
 *     summary: Get average First Passage UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `first_passage_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly (12–24 months).
 *       - `month`: Grouped by week (max 5 weeks).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters.
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average First Passage UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/first_passage_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN first_passage_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN first_passage_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN first_passage_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(first_passage_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching first_passage_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /unit_per_kg_charts/second_passage_ukg/{organisation_id}:
 *   get:
 *     summary: Get average Second Passage UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `second_passage_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly.
 *       - `month`: Grouped by week (1–5).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average Second Passage UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (e.g., date or month name)
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */

router.get('/second_passage_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN second_passage_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN second_passage_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN second_passage_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(second_passage_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching second_passage_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});
/**
 * @swagger
 * /unit_per_kg_charts/speed_frame_ukg/{organisation_id}:
 *   get:
 *     summary: Get average Speed Frame UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `speed_frame_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly.
 *       - `month`: Grouped by week (1–5).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average Speed Frame UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (e.g., date or month name)
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */

router.get('/speed_frame_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN speed_frame_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN speed_frame_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN speed_frame_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(speed_frame_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching speed_frame_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /unit_per_kg_charts/ring_frame_ukg/{organisation_id}:
 *   get:
 *     summary: Get average Ring Frame UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `ring_frame_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly.
 *       - `month`: Grouped by week (1–5).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average Ring Frame UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (e.g., date or month name)
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */

router.get('/ring_frame_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN ring_frame_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN ring_frame_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN ring_frame_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(ring_frame_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching ring_frame_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /unit_per_kg_charts/autoconer_ukg/{organisation_id}:
 *   get:
 *     summary: Get average Autoconer UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `autoconer_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly.
 *       - `month`: Grouped by week (1–5).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average Autoconer UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (e.g., date or month name)
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/autoconer_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN autoconer_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN autoconer_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN autoconer_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(autoconer_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching autoconer_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /unit_per_kg_charts/humidification_ukg/{organisation_id}:
 *   get:
 *     summary: Get average Humidification UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `humidification_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly.
 *       - `month`: Grouped by week (1–5).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average Humidification UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (e.g., date or month name)
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/humidification_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN humidification_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN humidification_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN humidification_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(humidification_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching humidification_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /unit_per_kg_charts/compressor_ukg/{organisation_id}:
 *   get:
 *     summary: Get average Compressor UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `compressor_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly.
 *       - `month`: Grouped by week (1–5).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average Compressor UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (e.g., date or month name)
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/compressor_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN compressor_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN compressor_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN compressor_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(compressor_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching compressor_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});
/**
 * @swagger
 * /unit_per_kg_charts/lighting_other_ukg/{organisation_id}:
 *   get:
 *     summary: Get average Lighting & Other UKG values by shift and overall
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns average `lighting_other_ukg` values from the `unit_per_kg` table for shifts 1, 2, 3, and overall.
 *       
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly.
 *       - `month`: Grouped by week (1–5).
 *       - `week`: Grouped by exact date.
 *       - `start_date` + `end_date`: Grouped by exact date.
 *       - `quarter`: Uses custom financial quarters:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Custom quarter values:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
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
 *         description: Average Lighting & Other UKG values per shift
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   shift_1:
 *                     type: number
 *                     format: float
 *                   shift_2:
 *                     type: number
 *                     format: float
 *                   shift_3:
 *                     type: number
 *                     format: float
 *                   overall:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/lighting_other_ukg/:organisation_id', async (req, res) => {
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
    filters.push(`EXTRACT(YEAR FROM date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx})`);
      values.push(validWeeks);
      idx++;
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
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
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

  if ((startDate && endDate) || weeks.length) {
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
      ROUND(AVG(CASE WHEN shift = '1' THEN lighting_other_ukg END)::numeric, 2) AS shift_1,
      ROUND(AVG(CASE WHEN shift = '2' THEN lighting_other_ukg END)::numeric, 2) AS shift_2,
      ROUND(AVG(CASE WHEN shift = '3' THEN lighting_other_ukg END)::numeric, 2) AS shift_3,
      ROUND(AVG(lighting_other_ukg)::numeric, 2) AS overall
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lighting_other_ukg:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /unit_per_kg_charts/combined/{organisation_id}:
 *   get:
 *     summary: Get combined average values for Waste, Machine, and Operation metrics
 *     tags:
 *       - Unit Per KG
 *     description: |
 *       Returns combined average values for three categories:
 *       - **Waste**: average of `br_carding_awes_ukg`
 *       - **Machine**: sum of averages of `first_passage_ukg`, `second_passage_ukg`, `speed_frame_ukg`, `ring_frame_ukg`, and `autoconer_ukg`
 *       - **Operation**: sum of averages of `humidification_ukg`, `compressor_ukg`, and `lighting_other_ukg`
 *       
 *       The data is grouped by date/month/week depending on the filters applied.
 *       
 *       Filters supported:
 *       - `year`: filter by year(s)
 *       - `month`: filter by month(s)
 *       - `week`: filter by week(s) of the month (1-5)
 *       - `quarter`: filter by custom quarters
 *       - `start_date` and `end_date`: filter by date range
 *       
 *       Grouping logic:
 *       - Date range or week filter: grouped by exact date (YYYY-MM-DD)
 *       - Month filter: grouped by week of month + month-year
 *       - Default/no filter: grouped monthly (Mon YYYY)
 *       
 *       Custom quarters mapping:
 *         - Q1: Mar–May
 *         - Q2: Jun–Aug
 *         - Q3: Sep–Nov
 *         - Q4: Dec–Feb
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
 *         description: Filter by month(s) (1 = Jan, 12 = Dec)
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
 *         description: |
 *           Filter by custom quarters:
 *           - Q1: Mar–May
 *           - Q2: Jun–Aug
 *           - Q3: Sep–Nov
 *           - Q4: Dec–Feb
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date in YYYY-MM-DD format
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date in YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: Combined average values for Waste, Machine, and Operation
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Group label (date, week-month, or month-year)
 *                   waste:
 *                     type: number
 *                     format: float
 *                     description: Average of br_carding_awes_ukg
 *                   machine:
 *                     type: number
 *                     format: float
 *                     description: Sum of averages of first_passage_ukg, second_passage_ukg, speed_frame_ukg, ring_frame_ukg, autoconer_ukg
 *                   operation:
 *                     type: number
 *                     format: float
 *                     description: Sum of averages of humidification_ukg, compressor_ukg, lighting_other_ukg
 *       400:
 *         description: Missing organisation_id parameter
 *       500:
 *         description: Server error while fetching data
 */

router.get('/combined/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  // Convert query params to arrays, like before
  const toArray = val => (Array.isArray(val) ? val : val ? [val] : []);
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
    const dayjs = require('dayjs');
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Label & grouping
  let labelExpr, groupByExpr, orderByExpr;
  if ((startDate && endDate) || weeks.length) {
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

  // SQL: compute averages per column, then sum machine & operation metrics to get combined avg per category
  const query = `
    SELECT
      ${labelExpr} AS label,
      ROUND(AVG(br_carding_awes_ukg)::NUMERIC, 2) AS waste,
      ROUND(
        AVG(first_passage_ukg) +
        AVG(second_passage_ukg) +
        AVG(speed_frame_ukg) +
        AVG(ring_frame_ukg) +
        AVG(autoconer_ukg)
        , 2) AS machine,
      ROUND(
        AVG(humidification_ukg) +
        AVG(compressor_ukg) +
        AVG(lighting_other_ukg)
        , 2) AS operation
    FROM unit_per_kg
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching combined unit_per_kg data:', err);
    res.status(500).json({ error: 'Error fetching combined chart data' });
  }
});

module.exports = router;
