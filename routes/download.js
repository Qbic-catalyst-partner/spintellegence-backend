const express = require('express');
const path = require('path');
const router = express.Router();

/**
 * @swagger
 * /download/{templateName}:
 *   get:
 *     summary: Download a specific Excel template
 *     tags:
 *       - Templates
 *     parameters:
 *       - in: path
 *         name: templateName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Yarn_realisation, Rf_utlilisation, Production_efficiency, Unit_per_kg]
 *         description: The exact name of the template to download
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *       404:
 *         description: Template not found
 *       500:
 *         description: Internal server error
 */
router.get('/:templateName', (req, res) => {
  const templateMap = {
    Yarn_realisation: 'Yarn_realisation.xlsx',
    Rf_utlilisation: 'Rf_utlilisation.xlsx',
    Production_efficiency: 'Production_efficiency.xlsx',
    Unit_per_kg: 'Unit_per_kg.xlsx',
  };

  const templateName = req.params.templateName;
  const fileName = templateMap[templateName];

  if (!fileName) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const filePath = path.join(__dirname, '..', 'templates', fileName);

  res.download(filePath, fileName, (err) => {
    if (err) {
      console.error('Error sending file:', err);
      res.status(500).send('Internal Server Error');
    }
  });
});

module.exports = router;
