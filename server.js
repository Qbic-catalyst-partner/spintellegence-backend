require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // ✅ Import cors
const client = require('./db/connection');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { authenticateToken } = require('./middleware/auth');
const app = express();
const PORT = process.env.PORT;

if (!PORT) {
  console.error('Error: PORT environment variable is not set.');
  process.exit(1);
}

// ✅ Enable CORS (allow all origins)
app.use(cors()); 

// If you want to restrict it:
// app.use(cors({
//   origin: 'http://your-frontend-domain.com',
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   credentials: true
// }));

// Middleware
app.use(bodyParser.json());

// Connect to DB
client.connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL');
  })
  .catch((err) => {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
    // Don't exit, let app still run to show errors on front-end or logs
  });


// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Your API Docs',
      version: '1.0.0',
      description: 'API documentation for your backend services',
    },
    servers: [
      {
        url: 'https://spintellegence-backend-aahdgvdcf7hgdudk.centralindia-01.azurewebsites.net/',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: ['./routes/*.js'], // Scan route files for JSDoc comments
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// // Register routes
// //app.use('/consultants', require('./routes/consultants'));
// app.use('/consultants',authenticateToken,  require('./routes/consultants'));
// app.use('/organisation', require('./routes/organisation'));
// app.use('/screens', require('./routes/screens'));
// app.use('/users', require('./routes/users'));
// app.use('/service_agreement', require('./routes/service_agreement'));
// app.use('/counts', require('./routes/counts'));
// app.use('/approval', require('./routes/approval'));
// app.use('/roles', require('./routes/roles'));
// app.use('/yarnUpload', require('./routes/yarnUpload'));
// app.use('/file_upload_history', require('./routes/file_upload_history'));
// app.use('/managerhome', require('./routes/managerhome'));
// app.use('/yarnSummary', require('./routes/yarnSummary'));
// app.use('/yarnSummarys',authenticateToken, require('./routes/yarnSummarys'));
// app.use('/rfSummary', require('./routes/rfSummary'));
// app.use('/rfSummarys', require('./routes/rfSummarys'));
// app.use('/yarnCharts', require('./routes/yarnCharts'));
// app.use('/rfCharts', require('./routes/rfCharts'));
// app.use('/productionSummarys', require('./routes/productionSummarys'));
// app.use('/rfCharts', require('./routes/rfCharts'));
// app.use('/productChart', require('./routes/productChart'));
// app.use('/unit_per_kg_charts', require('./routes/unit_per_kg_charts'));
// app.use('/ukgSummarys', require('./routes/ukgSummarys'));
// app.use('/export', require('./routes/export'));
// app.use('/auth', require('./routes/auth'));
// app.use('/password', require('./routes/password'));
// app.use('/homeScreenGraph', require('./routes/homeScreenGraph'));
// app.use('/profile', require('./routes/profile'));

app.use('/users', require('./routes/users')); // no auth

// Apply authenticateToken middleware explicitly to other routes
app.use('/consultants', authenticateToken, require('./routes/consultants'));
app.use('/organisation', authenticateToken, require('./routes/organisation'));
app.use('/screens', authenticateToken, require('./routes/screens'));
app.use('/service_agreement', authenticateToken, require('./routes/service_agreement'));
app.use('/counts', authenticateToken, require('./routes/counts'));
app.use('/approval', authenticateToken, require('./routes/approval'));
app.use('/roles', authenticateToken, require('./routes/roles'));
app.use('/yarnUpload', authenticateToken, require('./routes/yarnUpload'));
app.use('/file_upload_history', authenticateToken, require('./routes/file_upload_history'));
app.use('/managerhome', authenticateToken, require('./routes/managerhome'));
app.use('/yarnSummary', authenticateToken, require('./routes/yarnSummary'));
app.use('/yarnSummarys', authenticateToken, require('./routes/yarnSummarys'));
app.use('/rfSummary', authenticateToken, require('./routes/rfSummary'));
app.use('/rfSummarys', authenticateToken, require('./routes/rfSummarys'));
app.use('/yarnCharts', authenticateToken, require('./routes/yarnCharts'));
app.use('/rfCharts', authenticateToken, require('./routes/rfCharts'));
app.use('/productionSummarys', authenticateToken, require('./routes/productionSummarys'));
app.use('/productChart', authenticateToken, require('./routes/productChart'));
app.use('/unit_per_kg_charts', authenticateToken, require('./routes/unit_per_kg_charts'));
app.use('/ukgSummarys', authenticateToken, require('./routes/ukgSummarys'));
app.use('/export', authenticateToken, require('./routes/export'));
app.use('/auth', require('./routes/auth'));
app.use('/password', require('./routes/password'));
app.use('/homeScreenGraph', authenticateToken, require('./routes/homeScreenGraph'));
app.use('/profile', authenticateToken, require('./routes/profile'));
app.use('/download',  require('./routes/download'));
app.use('/consultanthome',authenticateToken,  require('./routes/consultanthome'));

// Start server

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is now listening at port ${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
