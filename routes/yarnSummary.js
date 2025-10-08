const express = require('express');
const router = express.Router();
const client = require('../db/connection');

/**
 * @swagger
 * /yarnSummary/efficiency/{organisation_id}:
 *   get:
 *     summary: Calculate Yarn Realization and Waste Output percentages for an organisation
 *     tags:
 *       - Yarn Summary
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
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
 *     responses:
 *       200:
 *         description: Calculated percentages for Yarn Realization and Waste Output
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 material_input:
 *                   type: number
 *                   description: Total raw material input
 *                 yarn_output:
 *                   type: number
 *                   description: Total yarn output
 *                 total_waste:
 *                   type: number
 *                   description: Total waste output
 *                 yarn_realization:
 *                   type: string
 *                   description: Yarn realization percentage (to 2 decimals)
 *                 waste_output:
 *                   type: string
 *                   description: Waste output percentage (to 2 decimals)
 *       500:
 *         description: Internal server error
 */
router.get('/efficiency/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("raw_material_input"::NUMERIC), 0) AS material_input,
      COALESCE(SUM("yarn_output"::NUMERIC), 0) AS yarn_output,
      COALESCE(SUM("total_waste"::NUMERIC), 0) AS total_waste
    FROM "yarn_realisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Efficiency Query Error:', err.message);
      return res.status(500).send('Error calculating efficiency');
    }

    const { material_input, yarn_output, total_waste } = result.rows[0];

    let yarn_realization = 0;
    let waste_output = 0;
    let invisible_loss = 0;

    if (material_input > 0) {
      yarn_realization = (yarn_output / material_input) * 100;
      waste_output = (total_waste / material_input) * 100;
      invisible_loss = 100 - (yarn_realization + waste_output);
    }

    res.json({
      material_input: parseFloat(material_input),
      yarn_output: parseFloat(yarn_output),
      total_waste: parseFloat(total_waste),
      yarn_realization: yarn_realization.toFixed(2),
      waste_output: waste_output.toFixed(2),
      invisible_loss: invisible_loss.toFixed(2)
    });
  });
});

/**
 * @swagger
 * /yarnSummary/waste-summary/{organisation_id}:
 *   get:
 *     summary: Calculate categorized waste summary for an organisation
 *     tags:
 *       - Yarn Summary
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
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
 *     responses:
 *       200:
 *         description: Calculated waste summary grouped by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 blowroom_waste:
 *                   type: string
 *                   description: Total blowroom waste
 *                 filter_waste:
 *                   type: string
 *                   description: Total filter waste
 *                 roving_waste:
 *                   type: string
 *                   description: Total roving waste
 *                 other_waste:
 *                   type: string
 *                   description: Total other waste
 *                 waste_output:
 *                   type: string
 *                   description: Sum of all categorized wastes
 *       500:
 *         description: Internal server error
 */
router.get('/waste-summary/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("raw_material_input"::NUMERIC), 0) AS raw_material_input,
      COALESCE(SUM("total_dropping"::NUMERIC), 0) AS total_dropping,
      COALESCE(SUM("flat_waste"::NUMERIC), 0) AS flat_waste,
      COALESCE(SUM("micro_dust"::NUMERIC), 0) AS micro_dust,
      COALESCE(SUM("contamination_collection"::NUMERIC), 0) AS contamination_collection,
      COALESCE(SUM("ohtc_waste"::NUMERIC), 0) AS ohtc_waste,
      COALESCE(SUM("prep_fan_waste"::NUMERIC), 0) AS prep_fan_waste,
      COALESCE(SUM("plant_room_waste"::NUMERIC), 0) AS plant_room_waste,
      COALESCE(SUM("ring_frame_roving_waste"::NUMERIC), 0) AS ring_frame_roving_waste,
      COALESCE(SUM("speed_frame_roving_waste"::NUMERIC), 0) AS speed_frame_roving_waste,
      COALESCE(SUM("all_dept_sweeping_waste"::NUMERIC), 0) AS all_dept_sweeping_waste,
      COALESCE(SUM("comber_waste"::NUMERIC), 0) AS comber_waste,
      COALESCE(SUM("hard_waste"::NUMERIC), 0) AS hard_waste,
      COALESCE(SUM("invisible_loss"::NUMERIC), 0) AS invisible_loss
    FROM "yarn_realisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Waste Summary Query Error:', err.message);
      return res.status(500).send('Error calculating waste summary');
    }

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

    const percent = (part) => input > 0 ? ((part / input) * 100).toFixed(2) : "0.00";

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
      waste_percent_of_input: percent(waste_output)
    });
  });
});



/**
 * @swagger
 * /yarnSummary/blow-room-waste/{organisation_id}:
 *   get:
 *     summary: Returns breakdown of Dropping, Flat Waste, Micro Dust, and Contamination in kg and percentage
 *     tags:
 *       - Yarn Summary
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
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
 *     responses:
 *       200:
 *         description: Waste breakdown in kg and %
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dropping_kg:
 *                   type: string
 *                   description: Total Dropping Waste (kg)
 *                 dropping_percent:
 *                   type: string
 *                   description: Dropping as percentage of input
 *                 flat_waste_kg:
 *                   type: string
 *                   description: Flat Waste (kg)
 *                 flat_waste_percent:
 *                   type: string
 *                   description: Flat Waste in %
 *                 micro_dust_kg:
 *                   type: string
 *                   description: Micro Dust (kg)
 *                 micro_dust_percent:
 *                   type: string
 *                   description: Micro Dust in %
 *                 contamination_kg:
 *                   type: string
 *                   description: Contamination (kg)
 *                 contamination_percent:
 *                   type: string
 *                   description: Contamination in %
 *       500:
 *         description: Internal server error
 */

router.get('/blow-room-waste/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("raw_material_input"::NUMERIC), 0) AS material_input,
      COALESCE(SUM("total_dropping"::NUMERIC), 0) AS total_dropping,
      COALESCE(SUM("flat_waste"::NUMERIC), 0) AS flat_waste,
      COALESCE(SUM("micro_dust"::NUMERIC), 0) AS micro_dust,
      COALESCE(SUM("contamination_collection"::NUMERIC), 0) AS contamination_collection
    FROM "yarn_realisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Waste Breakdown Query Error:', err.message);
      return res.status(500).send('Error calculating waste breakdown');
    }

    const {
      material_input,
      total_dropping,
      flat_waste,
      micro_dust,
      contamination_collection
    } = result.rows[0];

    const mi = parseFloat(material_input) || 0;

    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (waste) => mi > 0 ? ((Number(waste) / mi) * 100).toFixed(2) : "0.00";


    res.json({
      dropping_kg: format(total_dropping),
      dropping_percent: percent(total_dropping),

      flat_waste_kg: format(flat_waste),
      flat_waste_percent: percent(flat_waste),

      micro_dust_kg: format(micro_dust),
      micro_dust_percent: percent(micro_dust),

      contamination_kg: format(contamination_collection),
      contamination_percent: percent(contamination_collection)
    });
  });
});

/**
 * @swagger
 * /yarnSummary/filter-waste/{organisation_id}:
 *   get:
 *     summary: Returns Prep Fan Waste and Plant Room Waste in kg and percentage
 *     tags:
 *       - Yarn Summary
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
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
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
 *                   description: Prep Fan Waste (kg)
 *                 prep_fan_waste_percent:
 *                   type: string
 *                   description: Prep Fan Waste in %
 *                 plant_room_waste_kg:
 *                   type: string
 *                   description: Plant Room Waste (kg)
 *                 plant_room_waste_percent:
 *                   type: string
 *                   description: Plant Room Waste in %
 *       500:
 *         description: Internal server error
 */

router.get('/filter-waste/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("raw_material_input"::NUMERIC), 0) AS material_input,
      COALESCE(SUM("prep_fan_waste"::NUMERIC), 0) AS prep_fan_waste,
      COALESCE(SUM("plant_room_waste"::NUMERIC), 0) AS plant_room_waste
    FROM "yarn_realisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Filter Waste Query Error:', err.message);
      return res.status(500).send('Error calculating filter waste breakdown');
    }

    const {
      material_input,
      prep_fan_waste,
      plant_room_waste
    } = result.rows[0];

    const mi = Number(material_input) || 0;
    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (val) => mi > 0 ? ((Number(val) / mi) * 100).toFixed(2) : "0.00";

    res.json({
      prep_fan_waste_kg: format(prep_fan_waste),
      prep_fan_waste_percent: percent(prep_fan_waste),
      plant_room_waste_kg: format(plant_room_waste),
      plant_room_waste_percent: percent(plant_room_waste)
    });
  });
});

/**
 * @swagger
 * /yarnSummary/roving-waste/{organisation_id}:
 *   get:
 *     summary: Returns Roving Waste in Preparatory and Spinning in kg and %
 *     tags:
 *       - Yarn Summary
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
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
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
router.get('/roving-waste/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("raw_material_input"::NUMERIC), 0) AS material_input,
      COALESCE(SUM("speed_frame_roving_waste"::NUMERIC), 0) AS roving_preparatory,
      COALESCE(SUM("ring_frame_roving_waste"::NUMERIC), 0) AS roving_spinning
    FROM "yarn_realisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Roving Waste Query Error:', err.message);
      return res.status(500).send('Error calculating roving waste breakdown');
    }

    const {
      material_input,
      roving_preparatory,
      roving_spinning
    } = result.rows[0];

    const mi = Number(material_input) || 0;
    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (val) => mi > 0 ? ((Number(val) / mi) * 100).toFixed(2) : "0.00";

    res.json({
      roving_preparatory_kg: format(roving_preparatory),
      roving_preparatory_percent: percent(roving_preparatory),
      roving_spinning_kg: format(roving_spinning),
      roving_spinning_percent: percent(roving_spinning)
    });
  });
});

/**
 * @swagger
 * /yarnSummary/other-waste/{organisation_id}:
 *   get:
 *     summary: Returns sweeping, comber, hard waste and invisible loss in kg and percentage
 *     tags:
 *       - Yarn Summary
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
 *         name: month
 *         schema:
 *           type: integer
 *         description: Filter by month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year (e.g., 2025)
 *       - in: query
 *         name: week
 *         schema:
 *           type: integer
 *         description: Filter by ISO week number (1-53)
 *       - in: query
 *         name: quarter
 *         schema:
 *           type: integer
 *         description: Filter by quarter (1-4)
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

router.get('/other-waste/:organisation_id', (req, res) => {
  const { organisation_id } = req.params;
  const { date, month, year, week, quarter } = req.query;

  let filters = [`"organisation_id" = $1`];
  let values = [organisation_id];
  let idx = 2;

  if (date) {
    filters.push(`"date" = $${idx++}`);
    values.push(date);
  }

  if (month) {
    filters.push(`EXTRACT(MONTH FROM "date") = $${idx++}`);
    values.push(month);
  }

  if (year) {
    filters.push(`EXTRACT(YEAR FROM "date") = $${idx++}`);
    values.push(year);
  }

  if (week) {
    filters.push(`EXTRACT(WEEK FROM "date") = $${idx++}`);
    values.push(week);
  }

  if (quarter) {
    filters.push(`EXTRACT(QUARTER FROM "date") = $${idx++}`);
    values.push(quarter);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      COALESCE(SUM("raw_material_input"::NUMERIC), 0) AS material_input,
      COALESCE(SUM("all_dept_sweeping_waste"::NUMERIC), 0) AS sweeping,
      COALESCE(SUM("comber_waste"::NUMERIC), 0) AS comber,
      COALESCE(SUM("hard_waste"::NUMERIC), 0) AS hard,
      COALESCE(SUM("invisible_loss"::NUMERIC), 0) AS invisible
    FROM "yarn_realisation"
    ${whereClause}
  `;

  client.query(query, values, (err, result) => {
    if (err) {
      console.error('Other Waste Query Error:', err.message);
      return res.status(500).send('Error calculating other waste');
    }

    const {
      material_input,
      sweeping,
      comber,
      hard,
      invisible
    } = result.rows[0];

    const mi = Number(material_input) || 0;
    const format = (val) => Number(val || 0).toFixed(2);
    const percent = (val) => mi > 0 ? ((Number(val) / mi) * 100).toFixed(2) : "0.00";

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
  });
});



module.exports = router;
