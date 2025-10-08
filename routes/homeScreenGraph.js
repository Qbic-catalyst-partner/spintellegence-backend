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
 * /homeScreenGraph/efficiency_summary/{organisation_id}:
 *   get:
 *     summary: Get average production metrics by date grouping
 *     tags:
 *       - HomeScreenGraph
 *     description: |
 *       Returns average values for:
 *       - `production_efficiency`
 *       - `eup`
 *       - `utilisation`
 *       - `realisation`
 *
 *       Grouping and labels vary by filters:
 *       - Default (no filters): Last 12 months grouped by month.
 *       - `year`: Grouped monthly (12–24 months).
 *       - `month`: Grouped by week (max 5 weeks).
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
 *         description: Summary of average metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   production_efficiency:
 *                     type: number
 *                     format: float
 *                   eup:
 *                     type: number
 *                     format: float
 *                   utilisation:
 *                     type: number
 *                     format: float
 *                   realisation:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */

router.get('/efficiency_summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  const filters = [`pe.organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
    filters.push(`pe.date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(startDate, endDate);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM pe.date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM pe.date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM pe.date) - 1) / 7 + 1) = ANY($${idx})`);
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
      filters.push(`EXTRACT(MONTH FROM pe.date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
    }
  }

  // Default: last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`pe.date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Label / group logic
  let labelExpr, groupByExpr, orderByExpr;
  if ((startDate && endDate) || weeks.length) {
    labelExpr = `TO_CHAR(pe.date, 'YYYY-MM-DD')`;
    groupByExpr = `pe.date`;
    orderByExpr = `pe.date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM pe.date) - 1) / 7 + 1), '-', TO_CHAR(pe.date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM pe.date) - 1) / 7 + 1), TO_CHAR(pe.date, 'Mon YYYY')`;
    orderByExpr = `MIN(pe.date)`;
  } else {
    labelExpr = `TO_CHAR(pe.date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(pe.date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const query = `
    SELECT
      ${labelExpr} AS label,
      ROUND(AVG(pe.production_efficiency)::numeric, 2) AS production_efficiency,
      ROUND(AVG(pe.eup)::numeric, 2) AS eup,
      ROUND(AVG(ru.utilisation)::numeric, 2) AS utilisation,
      ROUND(AVG(yr.realisation)::numeric, 2) AS realisation
    FROM production_efficiency pe
    LEFT JOIN rf_utilisation ru 
      ON pe.organisation_id = ru.organisation_id AND pe.date = ru.date
    LEFT JOIN yarn_realisation yr 
      ON pe.organisation_id = yr.organisation_id AND pe.date = yr.date
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching efficiency summary:', err);
    res.status(500).json({ error: 'Error fetching summary data' });
  }
});

module.exports = router;