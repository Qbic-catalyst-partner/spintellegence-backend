const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const dayjs = require('dayjs'); 

// Helper: Convert to array
const toArray = (param) => {
  if (!param) return [];
  if (Array.isArray(param)) return param;
  return [param];
};

// Custom quarter map: March to February
const customQuarterMap = {
  1: [3, 4, 5],
  2: [6, 7, 8],
  3: [9, 10, 11],
  4: [12, 1, 2],
};

/**
 * @swagger
 * /yarnCharts/blow-room/total-droppings/{organisation_id}:
 *   get:
 *     summary: Get average total droppings chart data for an organisation
 *     description: |
 *       Returns average total dropping data grouped by:
 *       
 *       - 🕒 **Default** (no filters): Last 12 months, grouped by month.
 *       - 📅 **Year(s)**: 12 months per year, grouped by month.
 *       - 🗓️ **Month(s)**: 5 weeks of that month, grouped by week number.
 *       - 📆 **Week(s)**: Specific dates of selected weeks, grouped by day.
 *       - 📍 **Custom date range** (`start_date`, `end_date`): Grouped by date.
 *       - 🧭 **Quarter(s)**: Custom quarters (Q1–Q4 as defined).
 *
 *     tags:
 *       - Yarn Charts
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
 *         description: Filter by year(s) (e.g., 2024, 2025). Returns 12 months per year.
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 12
 *         style: form
 *         explode: true
 *         description: Filter by month(s) (1 = Jan, 12 = Dec). Returns 5 weeks of each.
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 5
 *         style: form
 *         explode: true
 *         description: Filter by week(s) (1–5). Returns daily data for those weeks.
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 4
 *         style: form
 *         explode: true
 *         description: |
 *           Custom quarter filter:
 *             - Q1 = March–May
 *             - Q2 = June–Aug
 *             - Q3 = Sept–Nov
 *             - Q4 = Dec–Feb
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
 *         description: Successfully fetched grouped chart data
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
 *                   avg_total_dropping:
 *                     type: number
 *                     format: float
 *                     description: Average total dropping for the group
 *       400:
 *         description: organisation_id is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Server/database error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */

router.get('/blow-room/total-droppings/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;

  if (!organisation_id) {
    return res.status(400).json({ error: 'organisation_id is required' });
  }

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  // Handle date range (custom dates)
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // 🧠 Default: Last 12 months if no filters provided
  if (
    !startDate &&
    !endDate &&
    !years.length &&
    !months.length &&
    !weeks.length &&
    !quarters.length
  ) {
    const today = dayjs();
    const past12 = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const now = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(past12, now);
    idx += 2;
  }

  // 🔁 Determine label & grouping logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate) {
    // Custom date range → Group by day
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (weeks.length) {
    // Group by date of each day in that week
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (months.length) {
    // Group by week number of the month (1–5)
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), '-', TO_CHAR(date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1), TO_CHAR(date, 'Mon YYYY')`;
    orderByExpr = `MIN(date)`;
  } else {
    // Default and year filters → group by month
    labelExpr = `TO_CHAR(date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(date)`;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(total_dropping::NUMERIC), 2) AS avg_total_dropping
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching yarn chart data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /yarnCharts/blow-room/flat-waste/{organisation_id}:
 *   get:
 *     summary: Get average flat waste chart data for an organisation
 *     description: |
 *       Returns average flat waste grouped by:
 *       
 *       - 🕒 **Default**: Last 12 months, grouped by month.
 *       - 📅 **Year(s)**: 12 or 24 months, grouped by month.
 *       - 🗓️ **Month(s)**: 5 weeks, grouped by week number.
 *       - 📆 **Week(s)**: Dates of selected weeks, grouped by day.
 *       - 📍 **Custom date range**: Grouped by date.
 *       - 🧭 **Quarter(s)**: Custom quarters (Q1–Q4).
 *
 *     tags:
 *       - Yarn Charts
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 12
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 5
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 4
 *         style: form
 *         explode: true
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
 *     responses:
 *       200:
 *         description: Returns chart data grouped by date, week, or month
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_flat_waste:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal error
 */

router.get('/blow-room/flat-waste/:organisation_id', async (req, res) => {
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default: Last 12 months if no filters
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Labeling logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (weeks.length) {
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

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(flat_waste::NUMERIC), 2) AS avg_flat_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching flat waste chart data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/blow-room/micro-dust/{organisation_id}:
 *   get:
 *     summary: Get average micro dust chart data for an organisation
 *     description: |
 *       Returns average `micro_dust` grouped by:
 *       - Default: Last 12 months (by month)
 *       - Year(s): Each year by month
 *       - Month(s): 5 weeks of month
 *       - Week(s): Dates in selected week
 *       - Quarter(s): Custom months (Mar–May, etc.)
 *       - Custom date range: Grouped by day
 *     tags:
 *       - Yarn Charts
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 12
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 5
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Q1 = Mar–May, Q2 = Jun–Aug, etc.
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
 *     responses:
 *       200:
 *         description: Grouped average `micro_dust` data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_micro_dust:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */

router.get('/blow-room/micro-dust/:organisation_id', async (req, res) => {
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
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

  // Label logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (weeks.length) {
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

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(micro_dust::NUMERIC), 2) AS avg_micro_dust
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching micro dust chart data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/blow-room/contamination-collection/{organisation_id}:
 *   get:
 *     summary: Get average contamination collection data for an organisation
 *     description: |
 *       Filters and groups contamination collection by:
 *       - Default: Last 12 months (monthly)
 *       - Year(s): 12/24 months by month
 *       - Month(s): 5 weekly buckets
 *       - Week(s): By date
 *       - Custom Date: By date
 *       - Quarter: Uses custom quarter definitions
 *     tags:
 *       - Yarn Charts
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 12
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 5
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 4
 *         style: form
 *         explode: true
 *         description: Custom quarter grouping (Q1 = Mar–May)
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
 *     responses:
 *       200:
 *         description: Returns contamination collection averages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_contamination_collection:
 *                     type: number
 *       400:
 *         description: organisation_id required
 *       500:
 *         description: Error from database
 */

router.get('/blow-room/contamination-collection/:organisation_id', async (req, res) => {
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
    if (quarterMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(quarterMonths);
    }
  }

  // Default filter = Last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (weeks.length) {
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

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(contamination_collection::NUMERIC), 2) AS avg_contamination_collection
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching contamination collection data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/filter-waste/prep-fan-waste/{organisation_id}:
 *   get:
 *     summary: Get average prep fan waste data for an organisation
 *     description: |
 *       Filters and groups prep fan waste by:
 *       - Default: Last 12 months (monthly)
 *       - Year(s): 12/24 months by month
 *       - Month(s): 5 weekly buckets
 *       - Week(s): By date
 *       - Custom Date: By date
 *       - Quarter: Uses custom quarter definitions
 *     tags:
 *       - Yarn Charts
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Q1 = Mar–May, etc.
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
 *     responses:
 *       200:
 *         description: Grouped average prep fan waste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_prep_fan_waste:
 *                     type: number
 *       400:
 *         description: organisation_id is required
 *       500:
 *         description: Internal error
 */

router.get('/filter-waste/prep-fan-waste/:organisation_id', async (req, res) => {
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
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

  // Determine group/label logic
  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (weeks.length) {
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

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(prep_fan_waste::NUMERIC), 2) AS avg_prep_fan_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching prep fan waste data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/filter-waste/plant-room-waste/{organisation_id}:
 *   get:
 *     summary: Get average plant room waste for an organisation
 *     description: |
 *       Returns average `plant_room_waste` grouped by time period:
 *       - Default: Last 12 months (monthly)
 *       - Filter by: year, month, week, quarter, start_date, end_date
 *     tags:
 *       - Yarn Charts
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Q1 = Mar–May, Q2 = Jun–Aug, etc.
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
 *     responses:
 *       200:
 *         description: Average plant room waste grouped by time
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_plant_room_waste:
 *                     type: number
 *       400:
 *         description: organisation_id is required
 *       500:
 *         description: Internal error from database
 */
router.get('/filter-waste/plant-room-waste/:organisation_id', async (req, res) => {
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
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

  let labelExpr, groupByExpr, orderByExpr;

  if (startDate && endDate) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (weeks.length) {
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

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(plant_room_waste::NUMERIC), 2) AS avg_plant_room_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching plant room waste data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/roving-waste/ring-frame-roving-waste/{organisation_id}:
 *   get:
 *     summary: Get average ring frame roving waste for an organisation
 *     tags:
 *       - Yarn Charts
 *     description: |
 *       Returns time-based average of `ring_frame_roving_waste` using:
 *       - Default: Monthly (last 12 months)
 *       - year/month/quarter: Grouped accordingly
 *       - week or start_date+end_date: Grouped by day
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
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
 *     responses:
 *       200:
 *         description: Returns chart data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_ring_frame_roving_waste:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal server error
 */

router.get('/roving-waste/ring-frame-roving-waste/:organisation_id', async (req, res) => {
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
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

  if (startDate && endDate) {
    labelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    groupByExpr = `date`;
    orderByExpr = `date`;
  } else if (weeks.length) {
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

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(ring_frame_roving_waste::NUMERIC), 2) AS avg_ring_frame_roving_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching ring frame roving waste:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/roving-waste/speed-frame-roving-waste/{organisation_id}:
 *   get:
 *     summary: Get average speed frame roving waste for an organisation
 *     tags:
 *       - Yarn Charts
 *     description: |
 *       Returns grouped averages of `speed_frame_roving_waste`:
 *       - Default: Last 12 months (monthly)
 *       - month: grouped by week
 *       - week or custom date: grouped by day
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Q1 = Mar–May, Q2 = Jun–Aug, etc.
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
 *     responses:
 *       200:
 *         description: Returns speed frame roving waste data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_speed_frame_roving_waste:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal error
 */

router.get('/roving-waste/speed-frame-roving-waste/:organisation_id', async (req, res) => {
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
    let quarterMonths = [];
    quarters.forEach(q => {
      if (customQuarterMap[q]) {
        quarterMonths.push(...customQuarterMap[q]);
      }
    });
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

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      ${labelExpr} AS label,
      ROUND(AVG(speed_frame_roving_waste::NUMERIC), 2) AS avg_speed_frame_roving_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching speed frame roving waste data:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/other-waste/all-dept-sweeping-waste/{organisation_id}:
 *   get:
 *     summary: Get average all department sweeping waste for an organisation
 *     tags:
 *       - Yarn Charts
 *     description: |
 *       Returns grouped average of `all_dept_sweeping_waste` over time:
 *       - Default: Last 12 months grouped by month
 *       - year/month/quarter: filters apply
 *       - week/start_date: grouped by day
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
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
 *     responses:
 *       200:
 *         description: Chart data with label and average waste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_all_dept_sweeping_waste:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal error
 */

router.get('/other-waste/all-dept-sweeping-waste/:organisation_id', async (req, res) => {
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

  // Dynamic grouping
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
      ROUND(AVG(all_dept_sweeping_waste::NUMERIC), 2) AS avg_all_dept_sweeping_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all_dept_sweeping_waste:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/other-waste/comber-waste/{organisation_id}:
 *   get:
 *     summary: Get average comber waste for an organisation
 *     tags:
 *       - Yarn Charts
 *     description: |
 *       Returns grouped average of `comber_waste` over time:
 *       - Default: Last 12 months grouped by month
 *       - year/month/quarter: filters apply
 *       - week/start_date: grouped by day
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
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
 *     responses:
 *       200:
 *         description: Chart data with label and average waste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_comber_waste:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal error
 */

router.get('/other-waste/comber-waste/:organisation_id', async (req, res) => {
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

  // Dynamic grouping
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
      ROUND(AVG(comber_waste::NUMERIC), 2) AS avg_comber_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching comber_waste:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/other-waste/hard-waste/{organisation_id}:
 *   get:
 *     summary: Get average hard waste for an organisation
 *     tags:
 *       - Yarn Charts
 *     description: |
 *       Returns grouped average of `hard_waste` over time:
 *       - Default: Last 12 months grouped by month
 *       - year/month/quarter: filters apply
 *       - week/start_date: grouped by day
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
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
 *     responses:
 *       200:
 *         description: Chart data with label and average waste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_hard_waste:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal error
 */

router.get('/other-waste/hard-waste/:organisation_id', async (req, res) => {
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

  // Dynamic grouping
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
      ROUND(AVG(hard_waste::NUMERIC), 2) AS avg_hard_waste
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching hard_waste:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

/**
 * @swagger
 * /yarnCharts/other-waste/invisible-loss/{organisation_id}:
 *   get:
 *     summary: Get average invisible loss for an organisation
 *     tags:
 *       - Yarn Charts
 *     description: |
 *       Returns grouped average of `invisible_loss` over time:
 *       - Default: Last 12 months grouped by month
 *       - year/month/quarter: filters apply
 *       - week/start_date: grouped by day
 *     parameters:
 *       - in: path
 *         name: organisation_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
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
 *     responses:
 *       200:
 *         description: Chart data with label and average waste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   avg_invisible_loss:
 *                     type: number
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Internal error
 */

router.get('/other-waste/invisible-loss/:organisation_id', async (req, res) => {
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

  // Dynamic grouping
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
      ROUND(AVG(invisible_loss::NUMERIC), 2) AS avg_invisible_loss
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching invisible_loss:', err);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});


/**
 * @swagger
 * /yarnCharts/waste-summary/{organisation_id}:
 *   get:
 *     summary: Get grouped waste summary for an organisation
 *     tags:
 *       - Yarn Charts
 *     description: |
 *       Returns grouped waste summary (raw values only) over time.
 *       
 *       **Grouping logic:**
 *       - If `start_date`/`end_date` or `week` are passed → grouped by day.
 *       - If `month` is passed → grouped by week number within the month.
 *       - Otherwise → grouped by month (default: last 12 months).
 *       
 *       **Categories:**
 *       - blowroom_waste = total_dropping + flat_waste + micro_dust + contamination_collection
 *       - filter_waste = ohtc_waste + prep_fan_waste + plant_room_waste
 *       - roving_waste = ring_frame_roving_waste + speed_frame_roving_waste
 *       - other_waste = all_dept_sweeping_waste + comber_waste + hard_waste + invisible_loss
 *       - waste_output = total of all waste categories
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
 *         description: Filter by week(s) (1 to 5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by quarter(s) (1 to 4)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from this start date (inclusive)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter up to this end date (inclusive)
 *     responses:
 *       200:
 *         description: Grouped waste summary
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Time label (e.g., "Jul 2024", "2024-07-12", etc.)
 *                   raw_material_input:
 *                     type: string
 *                     description: Total raw material input
 *                   blowroom_waste:
 *                     type: string
 *                     description: Total blowroom waste
 *                   filter_waste:
 *                     type: string
 *                     description: Total filter waste
 *                   roving_waste:
 *                     type: string
 *                     description: Total roving waste
 *                   other_waste:
 *                     type: string
 *                     description: Total other waste
 *                   waste_output:
 *                     type: string
 *                     description: Total waste output (sum of all categories)
 *       400:
 *         description: organisation_id is required
 *       500:
 *         description: Internal error
 */
router.get('/waste-summary/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(raw_material_input::NUMERIC), 0) AS raw_material_input,
      COALESCE(SUM(total_dropping::NUMERIC), 0) AS total_dropping,
      COALESCE(SUM(flat_waste::NUMERIC), 0) AS flat_waste,
      COALESCE(SUM(micro_dust::NUMERIC), 0) AS micro_dust,
      COALESCE(SUM(contamination_collection::NUMERIC), 0) AS contamination_collection,
      COALESCE(SUM(ohtc_waste::NUMERIC), 0) AS ohtc_waste,
      COALESCE(SUM(prep_fan_waste::NUMERIC), 0) AS prep_fan_waste,
      COALESCE(SUM(plant_room_waste::NUMERIC), 0) AS plant_room_waste,
      COALESCE(SUM(ring_frame_roving_waste::NUMERIC), 0) AS ring_frame_roving_waste,
      COALESCE(SUM(speed_frame_roving_waste::NUMERIC), 0) AS speed_frame_roving_waste,
      COALESCE(SUM(all_dept_sweeping_waste::NUMERIC), 0) AS all_dept_sweeping_waste,
      COALESCE(SUM(comber_waste::NUMERIC), 0) AS comber_waste,
      COALESCE(SUM(hard_waste::NUMERIC), 0) AS hard_waste,
      COALESCE(SUM(invisible_loss::NUMERIC), 0) AS invisible_loss
    FROM yarn_realisation
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);

    const response = result.rows.map(row => {
      const blowroom = ['total_dropping', 'flat_waste', 'micro_dust', 'contamination_collection']
        .map(key => parseFloat(row[key]) || 0)
        .reduce((a, b) => a + b, 0);

      const filter = ['ohtc_waste', 'prep_fan_waste', 'plant_room_waste']
        .map(key => parseFloat(row[key]) || 0)
        .reduce((a, b) => a + b, 0);

      const roving = ['ring_frame_roving_waste', 'speed_frame_roving_waste']
        .map(key => parseFloat(row[key]) || 0)
        .reduce((a, b) => a + b, 0);

      const other = ['all_dept_sweeping_waste', 'comber_waste', 'hard_waste', 'invisible_loss']
        .map(key => parseFloat(row[key]) || 0)
        .reduce((a, b) => a + b, 0);

      const total = blowroom + filter + roving + other;

      return {
        label: row.label,
        raw_material_input: parseFloat(row.raw_material_input).toFixed(2),
        blowroom_waste: blowroom.toFixed(2),
        filter_waste: filter.toFixed(2),
        roving_waste: roving.toFixed(2),
        other_waste: other.toFixed(2),
        waste_output: total.toFixed(2)
      };
    });

    res.json(response);
  } catch (err) {
    console.error('Waste Summary Error:', err);
    res.status(500).json({ error: 'Failed to fetch waste summary' });
  }
});

module.exports = router;