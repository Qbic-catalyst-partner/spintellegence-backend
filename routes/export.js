const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');

/**
 * @swagger
 * /export:
 *   get:
 *     summary: Export table data as CSV or Excel
 *     tags:
 *       - Export
 *     parameters:
 *       - in: query
 *         name: table
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the table to export
 *       - in: query
 *         name: columns
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated list of additional columns to export
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for date range filter (yyyy-mm-dd)
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for date range filter (yyyy-mm-dd)
 *       - in: query
 *         name: shift
 *         required: false
 *         schema:
 *           type: integer
 *         description: Optional shift filter (1, 2, 3)
 *       - in: query
 *         name: organisation_id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional organisation ID filter
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [csv, xlsx]
 *         description: Export format
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: No data found
 *       500:
 *         description: Server error
 */
router.get('/', async (req, res) => {
  const {
    table,
    columns,
    start_date,
    end_date,
    shift,
    organisation_id,
    format: exportFormat,
  } = req.query;

  // Validation
  if (!table || !columns || !start_date || !end_date || !exportFormat) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Always include base columns
  const baseColumns = ['user_id', 'date', 'shift'];

  // Parse user-specified columns
  const userColumns = columns
    .split(',')
    .map(col => col.trim())
    .filter(col => col.length > 0);

  // Merge and remove duplicates
  const finalColumns = [...new Set([...baseColumns, ...userColumns])];

  // Quote column names for SQL safety
  const selectedColumns = finalColumns.map(col => `"${col}"`).join(', ');

  // Build WHERE clause
  const conditions = [`date BETWEEN $1 AND $2`];
  const values = [start_date, end_date];
  let paramIndex = 3;

  if (shift) {
    conditions.push(`shift = $${paramIndex++}`);
    values.push(shift);
  }

  if (organisation_id) {
    conditions.push(`organisation_id = $${paramIndex++}`);
    values.push(organisation_id);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT ${selectedColumns}
    FROM ${table}
    ${whereClause}
  `;

  try {
    const result = await client.query(query, values);
    const data = result.rows;

    if (!data.length) {
      return res.status(404).json({ error: 'No data found for the given filters' });
    }

    const fileName = `${table}_${start_date}_to_${end_date}`;

    if (exportFormat === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Export');

      worksheet.columns = Object.keys(data[0]).map(key => ({
        header: key,
        key,
      }));

      data.forEach(row => worksheet.addRow(row));

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } else if (exportFormat === 'csv') {
      const parser = new Parser({ fields: Object.keys(data[0]) });
      const csv = parser.parse(data);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}.csv`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Invalid format. Use csv or xlsx.' });
    }
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
