/*
const screens {1:'Yarn realisation'}
GET-/yarn-realisation/: screens[1]

'Yarn realisation' which role has access 
next()
unrt

*/
// middleware/checkPermission.js
const client = require('../db/connection');

function checkPermission(screenName, action = 'can_view') {
  return async (req, res, next) => {
    const roleId = req.user?.role_id;
    if (!roleId) return res.status(403).json({ message: 'Missing role_id' });

    try {
      const result = await client.query(`
        SELECT ${action}
        FROM role_permissions
        WHERE role_id = $1 AND screen_name = $2
      `, [roleId, screenName]);

      if (!result.rows.length || !result.rows[0][action]) {
        return res.status(403).json({ message: 'Access denied' });
      }

      next();
    } catch (err) {
      console.error('Permission check failed:', err.message);
      res.status(500).json({ message: 'Internal permission check error' });
    }
  };
}

module.exports = { checkPermission };

