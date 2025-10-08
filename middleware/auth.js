const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Token missing' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        
        if (err) return res.status(403).json({ message: 'Token invalid or expired' });        
        req.user = user;
        next();
    });
}

module.exports = { authenticateToken};


// middleware/authenticateToken.js
// const jwt = require('jsonwebtoken');
// const client = require('../db/connection');

// async function authenticateToken(req, res, next) {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) return res.status(401).json({ message: 'Token missing' });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     // Look up role_id using role name from token
//     const result = await client.query(
//       'SELECT role_id FROM roles WHERE role_name = $1',
//       [decoded.role]
//     );

//     if (result.rows.length === 0) {
//       return res.status(403).json({ message: 'Role not found' });
//     }

//     req.user = {
//       user_id: decoded.user_id,
//       email: decoded.email,
//       role_name: decoded.role,
//       role_id: result.rows[0].role_id
//     };

//     next();
//   } catch (err) {
//     console.error('JWT error:', err.message);
//     res.status(403).json({ message: 'Token invalid or expired' });
//   }
// }

// module.exports = { authenticateToken };
