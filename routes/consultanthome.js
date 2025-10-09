const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const dayjs = require('dayjs');

/**
 * @swagger
 * /consultanthome/org-count/{consultant_id}:
 *   get:
 *     summary: Get org count for a specific consultant
 *     parameters:
 *       - in: path
 *         name: consultant_id
 *         schema:
 *           type: string
 *         required: true
 *         description: Consultant ID (e.g., CONS0006)
 *     responses:
 *       200:
 *         description: Consultant org count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 consultant_id:
 *                   type: string
 *                   example: CONS0006
 *                 org_count:
 *                   type: integer
 *                   example: 2
 *       404:
 *         description: Consultant not found
 *       500:
 *         description: Internal Server Error
 */


// Use `client` not `pool` if that's your connection name
router.get('/org-count/:consultant_id', async (req, res) => {
  const consultantId = req.params.consultant_id;

  const sql = `
    SELECT 
      consultant_id,
      CASE
        WHEN org_mapping IS NULL OR org_mapping = '' THEN 0
        ELSE LENGTH(org_mapping) - LENGTH(REPLACE(org_mapping, ',', '')) + 1
      END AS org_count
    FROM consultants
    WHERE consultant_id = $1
  `;

  try {
    const result = await client.query(sql, [consultantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching consultant org count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /consultanthome/mapped-orgs/{consultant_id}:
 *   get:
 *     summary: Get organization details mapped to a consultant
 *     description: Returns a list of organizations (org_id, org_name, org_code) mapped to the given consultant.
 *     parameters:
 *       - in: path
 *         name: consultant_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The consultant ID (e.g., CONS0006)
 *     responses:
 *       200:
 *         description: List of mapped organization details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   org_id:
 *                     type: string
 *                   org_name:
 *                     type: string
 *                   org_code:
 *                     type: string
 *       404:
 *         description: Consultant not found or no orgs mapped
 *       500:
 *         description: Server error
 */
router.get('/mapped-orgs/:consultant_id', async (req, res) => {
  const consultantId = req.params.consultant_id;

  try {
    const result = await client.query(
      'SELECT org_mapping FROM consultants WHERE consultant_id = $1',
      [consultantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    let orgMappingRaw = result.rows[0].org_mapping;

    if (!orgMappingRaw) {
      return res.status(404).json({ message: 'No organizations mapped to this consultant' });
    }



    // If the orgMappingRaw is already an array, use it directly
    // If it's a string like '{"ORG001","UNI0024","UNI0026"}', parse it:
    let orgMapping;

    if (Array.isArray(orgMappingRaw)) {
      orgMapping = orgMappingRaw;
    } else if (typeof orgMappingRaw === 'string') {
      // Clean and parse the string representation of the array
      orgMapping = orgMappingRaw
        .replace(/^{|}$/g, '')    // Remove braces
        .split(',')              // Split by comma
        .map(item => item.trim().replace(/^"|"$/g, ''))  // Trim spaces and remove quotes
        .filter(Boolean);        // Remove empty strings
    } else {
      // Unexpected format
      return res.status(500).json({ message: 'Unexpected org_mapping format' });
    }


    if (orgMapping.length === 0) {
      return res.status(404).json({ message: 'No valid orgs found in org_mapping' });
    }

    const placeholders = orgMapping.map((_, i) => `$${i + 1}`).join(',');

    const orgQuery = `
      SELECT org_id, org_name, org_code
      FROM organisation
      WHERE org_code IN (${placeholders})
    `;


    const orgResult = await client.query(orgQuery, orgMapping);


    if (orgResult.rows.length === 0) {
      return res.status(404).json({ message: 'No matching organizations found' });
    }

    return res.status(200).json(orgResult.rows);

  } catch (error) {
    console.error('Error fetching mapped organizations:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});


/**
 * @swagger
 * /consultanthome/combined-summary/{organisation_id}:
 *   get:
 *     summary: Get combined summary data with filters
 *     tags:
 *       - Consultant Home
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
 *         description: Filter by a specific date (YYYY-MM-DD)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for date range filter (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for date range filter (YYYY-MM-DD)
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
 *         description: Filter by one or more months (1-12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by week of the month (1-5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by one or more quarters (1-4)
 *     responses:
 *       200:
 *         description: Combined summary of performance metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 yarn_realisation_ratio:
 *                   type: string
 *                   example: "0.87"
 *                 yarn_realisation_percent:
 *                   type: string
 *                   example: "87.00"
 *                 rf_utilisation_ratio:
 *                   type: string
 *                   example: "0.95"
 *                 rf_utilisation_percent:
 *                   type: string
 *                   example: "95.00"
 *                 total_eup:
 *                   type: number
 *                   example: 523.75
 *                 unit_per_kg:
 *                   type: string
 *                   example: "7.12"
 *                 total_efficiency:
 *                   type: number
 *                   example: 83.4
 *       500:
 *         description: Error fetching combined summary
 */
router.get('/combined-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number).filter(w => w >= 1 && w <= 5);
  const quarters = toArray(req.query.quarter).map(Number);

  const dayjs = require('dayjs');
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
    const from = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = dayjs().endOf('month').format('YYYY-MM-DD');
    filters.push(`date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const queries = {
    yarnRealisation: `
      SELECT 
        COALESCE(SUM(raw_material_input::NUMERIC), 0) AS material_input,
        COALESCE(SUM(yarn_output::NUMERIC), 0) AS yarn_output
      FROM yarn_realisation
      ${whereClause};
    `,
    rfUtilisation: `
      SELECT 
        COALESCE(SUM(allocated_spindle::NUMERIC), 0) AS total_allocated,
        COALESCE(SUM(worked_spindle::NUMERIC), 0) AS total_worked
      FROM rf_utilisation
      ${whereClause};
    `,
    eupTotal: `
      SELECT 
        ROUND(SUM(eup::NUMERIC), 2) AS total_eup
      FROM production_efficiency
      ${whereClause};
    `,
    unitPerKg: `
      SELECT 
        COALESCE(SUM(br_carding_awes_ukg::NUMERIC), 0) +
        COALESCE(SUM(first_passage_ukg::NUMERIC), 0) +
        COALESCE(SUM(second_passage_ukg::NUMERIC), 0) +
        COALESCE(SUM(speed_frame_ukg::NUMERIC), 0) +
        COALESCE(SUM(ring_frame_ukg::NUMERIC), 0) +
        COALESCE(SUM(autoconer_ukg::NUMERIC), 0) +
        COALESCE(SUM(humidification_ukg::NUMERIC), 0) +
        COALESCE(SUM(compressor_ukg::NUMERIC), 0) +
        COALESCE(SUM(lighting_other_ukg::NUMERIC), 0) AS unit_per_kg
      FROM unit_per_kg
      ${whereClause};
    `,
    efficiencyTotal: `
      SELECT 
        ROUND(SUM(production_efficiency::NUMERIC), 2) AS total_efficiency
      FROM production_efficiency
      ${whereClause};
    `
  };

  try {
    const [
      yarnRes,
      rfRes,
      eupRes,
      ukgRes,
      effRes
    ] = await Promise.all([
      client.query(queries.yarnRealisation, values),
      client.query(queries.rfUtilisation, values),
      client.query(queries.eupTotal, values),
      client.query(queries.unitPerKg, values),
      client.query(queries.efficiencyTotal, values)
    ]);

    const material_input = parseFloat(yarnRes.rows[0]?.material_input || 0);
    const yarn_output = parseFloat(yarnRes.rows[0]?.yarn_output || 0);
    const yarn_ratio = material_input > 0 ? (yarn_output / material_input).toFixed(2) : "0.00";
    const yarn_percent = material_input > 0 ? ((yarn_output / material_input) * 100).toFixed(2) : "0.00";

    const total_allocated = parseFloat(rfRes.rows[0]?.total_allocated || 0);
    const total_worked = parseFloat(rfRes.rows[0]?.total_worked || 0);
    const rf_ratio = total_allocated > 0 ? (total_worked / total_allocated).toFixed(2) : "0.00";
    const rf_percent = total_allocated > 0 ? ((total_worked / total_allocated) * 100).toFixed(2) : "0.00";

    res.json({
      yarn_realisation_ratio: yarn_ratio,
      yarn_realisation_percent: yarn_percent,
      rf_utilisation_ratio: rf_ratio,
      rf_utilisation_percent: rf_percent,
      total_eup: parseFloat(eupRes.rows[0]?.total_eup || 0),
      unit_per_kg: parseFloat(ukgRes.rows[0]?.unit_per_kg || 0).toFixed(2),
      total_efficiency: parseFloat(effRes.rows[0]?.total_efficiency || 0)
    });
  } catch (err) {
    console.error('Combined Summary Error:', err.message);
    res.status(500).json({ error: 'Error fetching combined summary' });
  }
});


const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);

// Shared filter + grouping builder
function buildFiltersAndGrouping(req, prefix = 'pe') {
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const organisation_id = req.params.organisation_id;

  const filters = [`${prefix}.organisation_id = $1`];
  const values = [organisation_id];
  let idx = 2;

  if (startDate && endDate) {
    filters.push(`${prefix}.date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(startDate, endDate);
    idx += 2;
  } else if (years.length) {
    filters.push(`EXTRACT(YEAR FROM ${prefix}.date) = ANY($${idx})`);
    values.push(years);
    idx++;
  }

  if (months.length) {
    filters.push(`EXTRACT(MONTH FROM ${prefix}.date) = ANY($${idx})`);
    values.push(months);
    idx++;
  }

  if (weeks.length) {
    const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
    if (validWeeks.length) {
      filters.push(`FLOOR((EXTRACT(DAY FROM ${prefix}.date) - 1) / 7 + 1) = ANY($${idx})`);
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
      filters.push(`EXTRACT(MONTH FROM ${prefix}.date) = ANY($${idx})`);
      values.push(quarterMonths);
      idx++;
    }
  }

  // Default last 12 months
  if (!startDate && !endDate && !years.length && !months.length && !weeks.length && !quarters.length) {
    const today = dayjs();
    const from = today.subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
    const to = today.endOf('month').format('YYYY-MM-DD');
    filters.push(`${prefix}.date BETWEEN $${idx} AND $${idx + 1}`);
    values.push(from, to);
    idx += 2;
  }

  // Grouping logic
  let labelExpr, groupByExpr, orderByExpr;
  if ((startDate && endDate) || weeks.length) {
    labelExpr = `TO_CHAR(${prefix}.date, 'YYYY-MM-DD')`;
    groupByExpr = `${prefix}.date`;
    orderByExpr = `${prefix}.date`;
  } else if (months.length) {
    labelExpr = `CONCAT('Week ', FLOOR((EXTRACT(DAY FROM ${prefix}.date) - 1) / 7 + 1), '-', TO_CHAR(${prefix}.date, 'Mon YYYY'))`;
    groupByExpr = `FLOOR((EXTRACT(DAY FROM ${prefix}.date) - 1) / 7 + 1), TO_CHAR(${prefix}.date, 'Mon YYYY')`;
    orderByExpr = `MIN(${prefix}.date)`;
  } else {
    labelExpr = `TO_CHAR(${prefix}.date, 'Mon YYYY')`;
    groupByExpr = labelExpr;
    orderByExpr = `MIN(${prefix}.date)`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  return { whereClause, values, labelExpr, groupByExpr, orderByExpr };
}

/**
 * @swagger
 * /consultanthome/yarn_realisation/{organisation_id}:
 *   get:
 *     summary: Get average yarn realisation by date grouping
 *     tags:
 *       - consultanthome
 *     description: Returns average `yarn_realisation` grouped by date according to filters.
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
 *         description: Summary of average yarn realisation
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   yarn_realisation:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/yarn_realisation/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const { whereClause, values, labelExpr, groupByExpr, orderByExpr } = buildFiltersAndGrouping(req, 'yr');

  const query = `
    SELECT
      ${labelExpr} AS label,
      ROUND(AVG(yr.realisation)::numeric, 2) AS yarn_realisation
    FROM yarn_realisation yr
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching yarn realisation:', err);
    res.status(500).json({ error: 'Error fetching yarn realisation data' });
  }
});


/**
 * @swagger
 * /consultanthome/rf_utilisation/{organisation_id}:
 *   get:
 *     summary: Get average RF utilisation by date grouping
 *     tags:
 *       - consultanthome
 *     description: Returns average `rf_utilisation` grouped by date according to filters.
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
 *         description: Summary of average RF utilisation
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   rf_utilisation:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/rf_utilisation/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const { whereClause, values, labelExpr, groupByExpr, orderByExpr } = buildFiltersAndGrouping(req, 'ru');

  const query = `
    SELECT
      ${labelExpr} AS label,
      ROUND(AVG(ru.utilisation)::numeric, 2) AS rf_utilisation
    FROM rf_utilisation ru
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching rf utilisation:', err);
    res.status(500).json({ error: 'Error fetching rf utilisation data' });
  }
});


/**
 * @swagger
 * /consultanthome/production_efficiency/{organisation_id}:
 *   get:
 *     summary: Get average production efficiency by date grouping
 *     tags:
 *       - consultanthome
 *     description: Returns average `production_efficiency` grouped by date according to filters.
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
 *         description: Summary of average production efficiency
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
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/production_efficiency/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const { whereClause, values, labelExpr, groupByExpr, orderByExpr } = buildFiltersAndGrouping(req, 'pe');

  const query = `
    SELECT
      ${labelExpr} AS label,
      ROUND(AVG(pe.production_efficiency)::numeric, 2) AS production_efficiency
    FROM production_efficiency pe
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching production efficiency:', err);
    res.status(500).json({ error: 'Error fetching production efficiency data' });
  }
});


/**
 * @swagger
 * /consultanthome/eup/{organisation_id}:
 *   get:
 *     summary: Get average EUP by date grouping
 *     tags:
 *       - consultanthome
 *     description: Returns average `eup` grouped by date according to filters.
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
 *         description: Summary of average EUP
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
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */
router.get('/eup/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  const { whereClause, values, labelExpr, groupByExpr, orderByExpr } = buildFiltersAndGrouping(req, 'eup');

const query = `
  SELECT
    ${labelExpr} AS label,
    ROUND(AVG((eup.eup[1])::numeric), 2) AS eup
  FROM eup eup
  ${whereClause}
  GROUP BY ${groupByExpr}
  ORDER BY ${orderByExpr};
`;



  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching EUP:', err);
    res.status(500).json({ error: 'Error fetching EUP data' });
  }
});

/**
 * @swagger
 * /consultanthome/unit_per_kg/{organisation_id}:
 *   get:
 *     summary: Get average Unit per KG by date grouping
 *     tags:
 *       - consultanthome
 *     description: Returns average `total_unit_per_kg` grouped by date according to filters.
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
 *         description: Filter by week(s)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Filter by quarter(s)
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
 *         description: Average unit per kg by period
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                   unit_per_kg:
 *                     type: number
 *                     format: float
 *       400:
 *         description: Missing organisation_id
 *       500:
 *         description: Server error
 */

router.get('/unit_per_kg/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  if (!organisation_id) return res.status(400).json({ error: 'organisation_id is required' });

  // Assuming this helper uses alias-aware filtering (adjust if needed)
  const {
    whereClause,
    values,
    labelExpr,
    groupByExpr,
    orderByExpr
  } = buildFiltersAndGrouping(req, 'unit'); // 👈 make sure alias is passed here if needed

  const query = `
    SELECT
      ${labelExpr} AS label,
      ROUND(AVG(unit.total_unit_per_kg)::numeric, 2) AS unit_per_kg
    FROM unit_per_kg AS unit
    ${whereClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${orderByExpr};
  `;

  try {
    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching unit_per_kg:', err);
    res.status(500).json({ error: 'Error fetching unit_per_kg data' });
  }
});



module.exports = router;
