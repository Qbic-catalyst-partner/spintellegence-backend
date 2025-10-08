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
 * /yarnSummarys/efficiency/{organisation_id}:
 *   get:
 *     summary: Calculate Yarn Realization, Waste Output, and Invisible Loss percentages
 *     tags:
 *       - Yarn Summarys
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
 *         description: Calculated values and percentages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 MaterialInput:
 *                   type: number
 *                   example: 12000
 *                 YarnOutput:
 *                   type: number
 *                   example: 10000
 *                 TotalWaste:
 *                   type: number
 *                   example: 1500
 *                 YarnRealization:
 *                   type: number
 *                   example: 83.33
 *                 WasteOutput:
 *                   type: number
 *                   example: 12.5
 *                 InvisibleLoss:
 *                   type: number
 *                   example: 4.17
 *       500:
 *         description: Internal server error
 */

router.get('/efficiency/:organisation_id', async (req, res) => {
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
      COALESCE(SUM(raw_material_input::NUMERIC), 0) AS material_input,
      COALESCE(SUM(yarn_output::NUMERIC), 0) AS yarn_output,
      COALESCE(SUM(total_waste::NUMERIC), 0) AS total_waste
    FROM yarn_realisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { material_input, yarn_output, total_waste } = result.rows[0];

    const mi = parseFloat(material_input) || 0;
    const yo = parseFloat(yarn_output) || 0;
    const tw = parseFloat(total_waste) || 0;

    let yr = 0, wo = 0, il = 0;
    if (mi > 0) {
      yr = (yo / mi) * 100;
      wo = (tw / mi) * 100;
      il = 100 - (yr + wo);
    }

    res.json({
      MaterialInput: mi,
      YarnOutput: yo,
      TotalWaste: tw,
      YarnRealization: parseFloat(yr.toFixed(2)),
      WasteOutput: parseFloat(wo.toFixed(2)),
      InvisibleLoss: parseFloat(il.toFixed(2))
    });
  } catch (err) {
    console.error('Efficiency Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating yarn efficiency' });
  }
});



/**
 * @swagger
 * /yarnSummarys/waste-summary/{organisation_id}:
 *   get:
 *     summary: Categorized waste summary and percentage of input
 *     tags:
 *       - Yarn Summarys
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
 *         description: Filter by year(s)
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by month(s) (1-12)
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
 *         description: Filter by quarter(s) (1-4)
 *     responses:
 *       200:
 *         description: Categorized waste summary and total waste output
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 raw_material_input:
 *                   type: string
 *                 blowroom_waste:
 *                   type: string
 *                 blowroom_percent:
 *                   type: string
 *                 filter_waste:
 *                   type: string
 *                 filter_percent:
 *                   type: string
 *                 roving_waste:
 *                   type: string
 *                 roving_percent:
 *                   type: string
 *                 other_waste:
 *                   type: string
 *                 other_percent:
 *                   type: string
 *                 waste_output:
 *                   type: string
 *                 waste_percent_of_input:
 *                   type: string
 *       500:
 *         description: Internal server error
 */

router.get('/waste-summary/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);

  const customQuarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12],
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
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const row = result.rows[0];
    const input = parseFloat(row.raw_material_input) || 0;

    const blowroom_waste =
      parseFloat(row.total_dropping) +
      parseFloat(row.flat_waste) +
      parseFloat(row.micro_dust) +
      parseFloat(row.contamination_collection);

    const filter_waste =
      parseFloat(row.ohtc_waste) +
      parseFloat(row.prep_fan_waste) +
      parseFloat(row.plant_room_waste);

    const roving_waste =
      parseFloat(row.ring_frame_roving_waste) +
      parseFloat(row.speed_frame_roving_waste);

    const other_waste =
      parseFloat(row.all_dept_sweeping_waste) +
      parseFloat(row.comber_waste) +
      parseFloat(row.hard_waste) +
      parseFloat(row.invisible_loss);

    const waste_output = blowroom_waste + filter_waste + roving_waste + other_waste;

    const percent = (val) => input > 0 ? ((val / input) * 100).toFixed(2) : "0.00";

    res.json({
      raw_material_input: input.toFixed(2),

      blowroom_waste: blowroom_waste.toFixed(2),
      blowroom_percent: percent(blowroom_waste),

      filter_waste: filter_waste.toFixed(2),
      filter_percent: percent(filter_waste),

      roving_waste: roving_waste.toFixed(2),
      roving_percent: percent(roving_waste),

      other_waste: other_waste.toFixed(2),
      other_percent: percent(other_waste),

      waste_output: waste_output.toFixed(2),
      waste_percent_of_input: percent(waste_output),
    });
  } catch (err) {
    console.error('Waste Summary Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating waste summary' });
  }
});

/**
 * @swagger
 * /yarnSummarys/blow-room-waste/{organisation_id}:
 *   get:
 *     summary: Breakdown of blow room waste types and their percentage of input
 *     tags:
 *       - Yarn Summarys
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
 *         description: Year(s) to filter by
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Month(s) to filter by (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Week(s) of month to filter by (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Quarter(s) to filter by (1–4)
 *     responses:
 *       200:
 *         description: Waste breakdown in kg and percentage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dropping_kg:
 *                   type: string
 *                 dropping_percent:
 *                   type: string
 *                 flat_waste_kg:
 *                   type: string
 *                 flat_waste_percent:
 *                   type: string
 *                 micro_dust_kg:
 *                   type: string
 *                 micro_dust_percent:
 *                   type: string
 *                 contamination_kg:
 *                   type: string
 *                 contamination_percent:
 *                   type: string
 *       500:
 *         description: Internal server error
 */

router.get('/blow-room-waste/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
  const quarters = toArray(req.query.quarter).map(Number);

  const quarterMap = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12],
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

  const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
  if (validWeeks.length) {
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(validWeeks);
  }

  if (quarters.length) {
    const expandedMonths = quarters.flatMap(q => quarterMap[q] || []);
    if (expandedMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expandedMonths);
    }
  }

  // Default to last 12 months if no filters
  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length &&
    !weeks.length && !quarters.length
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
      COALESCE(SUM(raw_material_input::NUMERIC), 0) AS material_input,
      COALESCE(SUM(total_dropping::NUMERIC), 0) AS total_dropping,
      COALESCE(SUM(flat_waste::NUMERIC), 0) AS flat_waste,
      COALESCE(SUM(micro_dust::NUMERIC), 0) AS micro_dust,
      COALESCE(SUM(contamination_collection::NUMERIC), 0) AS contamination_collection
    FROM yarn_realisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const row = result.rows[0];
    const input = parseFloat(row.material_input) || 0;

    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (val) => input > 0 ? ((val / input) * 100).toFixed(2) : "0.00";

    res.json({
      dropping_kg: format(row.total_dropping),
      dropping_percent: percent(row.total_dropping),

      flat_waste_kg: format(row.flat_waste),
      flat_waste_percent: percent(row.flat_waste),

      micro_dust_kg: format(row.micro_dust),
      micro_dust_percent: percent(row.micro_dust),

      contamination_kg: format(row.contamination_collection),
      contamination_percent: percent(row.contamination_collection),
    });
  } catch (err) {
    console.error('Blow Room Waste Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating blow room waste breakdown' });
  }
});

/**
 * @swagger
 * /yarnSummarys/filter-waste/{organisation_id}:
 *   get:
 *     summary: Returns Prep Fan Waste and Plant Room Waste in kg and percentage
 *     tags:
 *       - Yarn Summarys
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
 *         description: Year(s) to filter by
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Month(s) to filter by (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Week(s) of month to filter by (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Quarter(s) to filter by (1–4)
 *     responses:
 *       200:
 *         description: Filter waste breakdown in kg and %
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 prep_fan_waste_kg:
 *                   type: string
 *                 prep_fan_waste_percent:
 *                   type: string
 *                 plant_room_waste_kg:
 *                   type: string
 *                 plant_room_waste_percent:
 *                   type: string
 *       500:
 *         description: Internal server error
 */

router.get('/filter-waste/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => val ? (Array.isArray(val) ? val : [val]) : [];
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
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

  const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
  if (validWeeks.length) {
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(validWeeks);
  }

  if (quarters.length) {
    const expandedMonths = quarters.flatMap(q => quarterMap[q] || []);
    if (expandedMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expandedMonths);
    }
  }

  // Default to last 12 months if no filters
  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length &&
    !weeks.length && !quarters.length
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
      COALESCE(SUM(raw_material_input::NUMERIC), 0) AS material_input,
      COALESCE(SUM(prep_fan_waste::NUMERIC), 0) AS prep_fan_waste,
      COALESCE(SUM(plant_room_waste::NUMERIC), 0) AS plant_room_waste
    FROM yarn_realisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const row = result.rows[0];
    const input = parseFloat(row.material_input) || 0;

    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (val) => input > 0 ? ((val / input) * 100).toFixed(2) : "0.00";

    res.json({
      prep_fan_waste_kg: format(row.prep_fan_waste),
      prep_fan_waste_percent: percent(row.prep_fan_waste),
      plant_room_waste_kg: format(row.plant_room_waste),
      plant_room_waste_percent: percent(row.plant_room_waste)
    });
  } catch (err) {
    console.error('Filter Waste Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating filter waste breakdown' });
  }
});


/**
 * @swagger
 * /yarnSummarys/roving-waste/{organisation_id}:
 *   get:
 *     summary: Returns Roving Waste in Preparatory and Spinning in kg and %
 *     tags:
 *       - Yarn Summarys
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
 *         description: Year(s) to filter by
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Month(s) to filter by (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Week(s) of month to filter by (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Quarter(s) to filter by (1–4)
 *     responses:
 *       200:
 *         description: Roving waste breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roving_preparatory_kg:
 *                   type: string
 *                   description: Roving Waste in Preparatory (kg)
 *                 roving_preparatory_percent:
 *                   type: string
 *                   description: Roving Waste in Preparatory (%)
 *                 roving_spinning_kg:
 *                   type: string
 *                   description: Roving Waste in Spinning (kg)
 *                 roving_spinning_percent:
 *                   type: string
 *                   description: Roving Waste in Spinning (%)
 *       500:
 *         description: Internal server error
 */

router.get('/roving-waste/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => val ? (Array.isArray(val) ? val : [val]) : [];
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
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

  const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
  if (validWeeks.length) {
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(validWeeks);
  }

  if (quarters.length) {
    const expandedMonths = quarters.flatMap(q => quarterMap[q] || []);
    if (expandedMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expandedMonths);
    }
  }

  // Default to last 12 months if no filters are passed
  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length &&
    !weeks.length && !quarters.length
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
      COALESCE(SUM(raw_material_input::NUMERIC), 0) AS material_input,
      COALESCE(SUM(speed_frame_roving_waste::NUMERIC), 0) AS roving_preparatory,
      COALESCE(SUM(ring_frame_roving_waste::NUMERIC), 0) AS roving_spinning
    FROM yarn_realisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const row = result.rows[0];
    const input = parseFloat(row.material_input) || 0;

    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (val) => input > 0 ? ((val / input) * 100).toFixed(2) : "0.00";

    res.json({
      roving_preparatory_kg: format(row.roving_preparatory),
      roving_preparatory_percent: percent(row.roving_preparatory),
      roving_spinning_kg: format(row.roving_spinning),
      roving_spinning_percent: percent(row.roving_spinning)
    });
  } catch (err) {
    console.error('Roving Waste Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating roving waste breakdown' });
  }
});
/**
 * @swagger
 * /yarnSummarys/other-waste/{organisation_id}:
 *   get:
 *     summary: Returns sweeping, comber, hard waste, and invisible loss in kg and percentage
 *     tags:
 *       - Yarn Summarys
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
 *         description: Start date for range (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for range (YYYY-MM-DD)
 *       - in: query
 *         name: year
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Year(s) filter
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Month(s) filter (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Week(s) of month filter (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Quarter(s) filter (1–4)
 *     responses:
 *       200:
 *         description: Other waste summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sweeping_waste_kg:
 *                   type: string
 *                 sweeping_waste_percent:
 *                   type: string
 *                 comber_waste_kg:
 *                   type: string
 *                 comber_waste_percent:
 *                   type: string
 *                 hard_waste_kg:
 *                   type: string
 *                 hard_waste_percent:
 *                   type: string
 *                 invisible_loss_kg:
 *                   type: string
 *                 invisible_loss_percent:
 *                   type: string
 *       500:
 *         description: Internal server error
 */

router.get('/other-waste/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => val ? (Array.isArray(val) ? val : [val]) : [];
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
    const expandedMonths = quarters.flatMap(q => quarterMap[q] || []);
    if (expandedMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expandedMonths);
    }
  }

  // Default: last 12 full months if no filter
  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length &&
    !weeks.length && !quarters.length
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
      COALESCE(SUM(raw_material_input::NUMERIC), 0) AS material_input,
      COALESCE(SUM(all_dept_sweeping_waste::NUMERIC), 0) AS sweeping,
      COALESCE(SUM(comber_waste::NUMERIC), 0) AS comber,
      COALESCE(SUM(hard_waste::NUMERIC), 0) AS hard,
      COALESCE(SUM(invisible_loss::NUMERIC), 0) AS invisible
    FROM yarn_realisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const { material_input, sweeping, comber, hard, invisible } = result.rows[0];
    const input = parseFloat(material_input) || 0;

    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (val) => input > 0 ? ((val / input) * 100).toFixed(2) : "0.00";

    res.json({
      sweeping_waste_kg: format(sweeping),
      sweeping_waste_percent: percent(sweeping),
      comber_waste_kg: format(comber),
      comber_waste_percent: percent(comber),
      hard_waste_kg: format(hard),
      hard_waste_percent: percent(hard),
      invisible_loss_kg: format(invisible),
      invisible_loss_percent: percent(invisible)
    });
  } catch (err) {
    console.error('Other Waste Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating other waste breakdown' });
  }
});


/**
 * @swagger
 * /yarnSummarys/yarn-realisation/{organisation_id}:
 *   get:
 *     summary: Returns Yarn Realisation (Output/Input ratio) as a percentage
 *     tags:
 *       - Yarn Summarys
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
 *         description: Year(s) to filter by
 *       - in: query
 *         name: month
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Month(s) to filter by (1–12)
 *       - in: query
 *         name: week
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Week(s) of month to filter by (1–5)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Quarter(s) to filter by (1–4)
 *     responses:
 *       200:
 *         description: Yarn realisation percentage and ratio
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 yarn_realisation_ratio:
 *                   type: string
 *                   example: "0.92"
 *                 yarn_realisation_percent:
 *                   type: string
 *                   example: "92.00"
 *       500:
 *         description: Internal server error
 */

router.get('/yarn-realisation/:organisation_id', async (req, res) => {
  const { organisation_id } = req.params;
  const { date, start_date, end_date } = req.query;

  const toArray = (val) => val ? (Array.isArray(val) ? val : [val]) : [];
  const years = toArray(req.query.year).map(Number);
  const months = toArray(req.query.month).map(Number);
  const weeks = toArray(req.query.week).map(Number);
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

  const validWeeks = weeks.filter(w => w >= 1 && w <= 5);
  if (validWeeks.length) {
    filters.push(`FLOOR((EXTRACT(DAY FROM date) - 1) / 7 + 1) = ANY($${idx++})`);
    values.push(validWeeks);
  }

  if (quarters.length) {
    const expandedMonths = quarters.flatMap(q => quarterMap[q] || []);
    if (expandedMonths.length) {
      filters.push(`EXTRACT(MONTH FROM date) = ANY($${idx++})`);
      values.push(expandedMonths);
    }
  }

  // Default to last 12 months if no filters
  if (
    !date && !start_date && !end_date &&
    !years.length && !months.length &&
    !weeks.length && !quarters.length
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
      COALESCE(SUM(raw_material_input::NUMERIC), 0) AS material_input,
      COALESCE(SUM(yarn_output::NUMERIC), 0) AS yarn_output
    FROM yarn_realisation
    ${whereClause};
  `;

  try {
    const result = await client.query(query, values);
    const row = result.rows[0];

    const input = parseFloat(row.material_input) || 0;
    const output = parseFloat(row.yarn_output) || 0;

    const ratio = input > 0 ? (output / input).toFixed(2) : "0.00";
    const percent = input > 0 ? ((output / input) * 100).toFixed(2) : "0.00";

    res.json({
      yarn_realisation_ratio: ratio,
      yarn_realisation_percent: percent
    });
  } catch (err) {
    console.error('Yarn Realisation Query Error:', err.message);
    res.status(500).json({ error: 'Error calculating yarn realisation' });
  }
});


module.exports = router;