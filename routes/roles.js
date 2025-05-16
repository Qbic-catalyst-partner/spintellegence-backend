const express = require('express');
const router = express.Router();
const client = require('../db/connection');

/**
 * Utility to generate role_id like ROL001
 */
function generateRoleId(count) {
    return `ROL${String(count).padStart(3, '0')}`;
}

async function getNextRoleId() {
    const result = await client.query(`
        SELECT role_id FROM roles
        WHERE role_id ~ '^ROL[0-9]+$'
        ORDER BY role_id DESC
        LIMIT 1
    `);

    if (result.rows.length === 0) {
        return 'ROL001';
    }

    const lastRoleId = result.rows[0].role_id; // e.g., 'ROL023'
    const lastNumber = parseInt(lastRoleId.replace('ROL', ''), 10);
    return generateRoleId(lastNumber + 1);
}

/**
 * @swagger
 * /roles:
 *   post:
 *     summary: Create a new role with grouped screen permissions
 *     tags:
 *       - Roles
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role_name
 *               - permissions
 *             properties:
 *               role_name:
 *                 type: string
 *                 example: Supervisor
 *               permissions:
 *                 type: object
 *                 description: Grouped screen permissions by screen category
 *                 additionalProperties:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       screen_id:
 *                         type: integer
 *                         example: 13
 *                       screen_name:
 *                         type: string
 *                         example: Blow_room_waste
 *                       can_view:
 *                         type: boolean
 *                         example: true
 *                       can_edit:
 *                         type: boolean
 *                         example: true
 *                       can_delete:
 *                         type: boolean
 *                         example: false
 *     responses:
 *       200:
 *         description: Role and permissions created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Role 'Supervisor' created successfully
 *                 role_id:
 *                   type: string
 *                   example: ROL007
 *       500:
 *         description: Error creating role
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Error creating role and permissions
 */
router.post('/', async (req, res) => {
    const { role_name, permissions } = req.body;

    try {
        // Optional: Prevent duplicate role names
        const existingRole = await client.query(
            'SELECT role_id FROM roles WHERE role_name = $1',
            [role_name]
        );
        if (existingRole.rows.length > 0) {
            return res.status(400).json({
                error: `Role '${role_name}' already exists.`,
                role_id: existingRole.rows[0].role_id
            });
        }

        const roleId = await getNextRoleId();

        // Insert the role
        await client.query(
            `INSERT INTO roles (role_id, role_name) VALUES ($1, $2)`,
            [roleId, role_name]
        );

        const permissionQuery = `
            INSERT INTO role_permissions (role_id, screen_name, can_view, can_edit, can_delete)
            VALUES ($1, $2, $3, $4, $5)
        `;

        const flatPermissions = [];

        for (const groupName in permissions) {
            const group = permissions[groupName];
            if (typeof group === 'object') {
                for (const screenKey in group) {
                    const screen = group[screenKey];
                    if (screen && screen.screen_name) {
                        flatPermissions.push({
                            screen_name: screen.screen_name,
                            can_view: screen.can_view || false,
                            can_edit: screen.can_edit || false,
                            can_delete: screen.can_delete || false
                        });
                    }
                }
            }
        }

        const uniquePermissionsMap = new Map();
        flatPermissions.forEach(p => {
            if (!uniquePermissionsMap.has(p.screen_name)) {
                uniquePermissionsMap.set(p.screen_name, p);
            }
        });

        const uniquePermissions = Array.from(uniquePermissionsMap.values());

        for (const p of uniquePermissions) {
            await client.query(permissionQuery, [
                roleId,
                p.screen_name,
                p.can_view,
                p.can_edit,
                p.can_delete
            ]);
        }

        res.status(200).json({
            message: `Role '${role_name}' created successfully`,
            role_id: roleId
        });
    } catch (err) {
        console.error('Error creating role and permissions:', err.message);
        res.status(500).send('Error creating role and permissions');
    }
});



/**
 * @swagger
 * /roles:
 *   get:
 *     summary: Get all roles with their screen permissions
 *     tags:
 *       - Roles
 *     responses:
 *       200:
 *         description: List of all roles with permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   role:
 *                     type: object
 *                     properties:
 *                       role_id:
 *                         type: string
 *                       role_name:
 *                         type: string
 *                   permissions:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         screen_name:
 *                           type: string
 *                         can_view:
 *                           type: boolean
 *                         can_edit:
 *                           type: boolean
 *                         can_delete:
 *                           type: boolean
 *       500:
 *         description: Error retrieving roles
 */
router.get('/', async (req, res) => {
  try {
    const roleQuery = `SELECT * FROM roles ORDER BY role_id`;
    const roleResult = await client.query(roleQuery);

    const roles = [];

    for (const role of roleResult.rows) {
      const permissionQuery = `
        SELECT screen_name, can_view, can_edit, can_delete
        FROM role_permissions
        WHERE role_id = $1
      `;
      const permissionsResult = await client.query(permissionQuery, [role.role_id]);

      roles.push({
        role,
        permissions: permissionsResult.rows
      });
    }

    res.status(200).json(roles);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving roles');
  }
});
/**
 * @swagger
 * /roles/{role_id}/permissions:
 *   put:
 *     summary: Update screen permissions for a role
 *     tags:
 *       - Roles
 *     parameters:
 *       - in: path
 *         name: role_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 screen_name:
 *                   type: string
 *                 can_view:
 *                   type: boolean
 *                 can_edit:
 *                   type: boolean
 *                 can_delete:
 *                   type: boolean
 *     responses:
 *       200:
 *         description: Permissions updated
 *       500:
 *         description: Update failed
 */
router.put('/:role_id/permissions', async (req, res) => {
    const roleId = req.params.role_id;
    const permissions = req.body;

    try {
        // Clear existing permissions
        await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

        // Insert new ones
        const insertQuery = `
            INSERT INTO role_permissions (role_id, screen_name, can_view, can_edit, can_delete)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const p of permissions) {
            await client.query(insertQuery, [
                roleId,
                p.screen_name,
                p.can_view || false,
                p.can_edit || false,
                p.can_delete || false
            ]);
        }

        res.send('Permissions updated');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Update failed');
    }
});
/**
 * @swagger
 * /roles/{role_id}:
 *   delete:
 *     summary: Delete a role and its permissions
 *     tags:
 *       - Roles
 *     parameters:
 *       - in: path
 *         name: role_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role deleted
 *       500:
 *         description: Delete failed
 */
router.delete('/:role_id', async (req, res) => {
    const roleId = req.params.role_id;

    try {
        // Delete role (permissions will be auto-deleted if foreign key is ON DELETE CASCADE)
        await client.query(`DELETE FROM roles WHERE role_id = $1`, [roleId]);
        res.send('Role deleted');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Delete failed');
    }
});

module.exports = router;
