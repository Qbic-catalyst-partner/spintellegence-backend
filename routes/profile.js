// const express = require('express');
// const router = express.Router();
// const { upload, uploadToAzure } = require('../upload'); // You must implement this
// const auth = require('../middleware/middleware'); // Should attach `req.user.id`
// const client = require('../db/connection');

// /**
//  * @swagger
//  * tags:
//  *   name: Profile
//  *   description: User profile management
//  */

// /**
//  * @swagger
//  * /profile/upload-profile-pic:
//  *   post:
//  *     summary: Upload a user profile picture
//  *     tags:
//  *       - Profile
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         multipart/form-data:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               image:
//  *                 type: string
//  *                 format: binary
//  *                 description: The image file to upload
//  *     responses:
//  *       200:
//  *         description: Image uploaded successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 imageUrl:
//  *                   type: string
//  *                   format: uri
//  *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
//  *       400:
//  *         description: No image uploaded
//  *       500:
//  *         description: Upload failed
//  *     security:
//  *       - bearerAuth: []
//  */
// router.post('/upload-profile-pic', auth, upload.single('image'), async (req, res) => {
//   try {
//     const file = req.file;
//     const userId = req.user.id;

//     if (!file) {
//       return res.status(400).json({ error: 'No image uploaded' });
//     }

//     const imageUrl = await uploadToAzure(file.buffer, file.originalname, file.mimetype);

//     await client.query(
//       'UPDATE users SET profile_picture_url = $1 WHERE user_id = $2',
//       [imageUrl, userId]
//     );

//     res.json({ imageUrl });
//   } catch (err) {
//     console.error('Upload failed:', err);
//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

// /**
//  * @swagger
//  * /profile/profile-picture:
//  *   get:
//  *     summary: Get the current user's profile picture URL
//  *     tags:
//  *       - Profile
//  *     responses:
//  *       200:
//  *         description: Successfully retrieved profile picture URL
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 imageUrl:
//  *                   type: string
//  *                   format: uri
//  *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
//  *       404:
//  *         description: No profile picture found
//  *       500:
//  *         description: Error retrieving profile picture
//  *     security:
//  *       - bearerAuth: []
//  */
// router.get('/profile-picture', auth, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const result = await client.query(
//       'SELECT profile_picture_url FROM users WHERE user_id = $1',
//       [userId]
//     );

//     if (result.rows.length === 0 || !result.rows[0].profile_picture_url) {
//       return res.status(404).json({ error: 'No profile picture found' });
//     }

//     res.json({ imageUrl: result.rows[0].profile_picture_url });
//   } catch (err) {
//     console.error('Retrieval failed:', err);
//     res.status(500).json({ error: 'Error retrieving profile picture' });
//   }
// });

// module.exports = router;

const express = require('express');
const router = express.Router();
const { upload, uploadToAzure } = require('../upload'); // Ensure this is implemented
const client = require('../db/connection'); // PostgreSQL client

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: User profile management
 */

/**
 * @swagger
 * /profile/upload-profile-pic:
 *   post:
 *     summary: Upload a user profile picture
 *     tags:
 *       - Profile
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               user_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   format: uri
 *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
 *       400:
 *         description: Bad request
 *       500:
 *         description: Upload failed
 */
router.post('/upload-profile-pic', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.body.user_id;

    if (!file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const imageUrl = await uploadToAzure(file.buffer, file.originalname, file.mimetype);

    await client.query(
      'UPDATE users SET profile_picture_url = $1 WHERE user_id = $2',
      [imageUrl, userId]
    );

    res.json({ imageUrl });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/**
 * @swagger
 * /profile/profile-picture:
 *   get:
 *     summary: Get the user's profile picture URL by user_id
 *     tags:
 *       - Profile
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to retrieve profile picture for
 *     responses:
 *       200:
 *         description: Successfully retrieved profile picture URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   format: uri
 *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
 *       400:
 *         description: Missing user_id
 *       404:
 *         description: No profile picture found
 *       500:
 *         description: Error retrieving profile picture
 */
router.get('/profile-picture', async (req, res) => {
  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    const result = await client.query(
      'SELECT profile_picture_url FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].profile_picture_url) {
      return res.status(404).json({ error: 'No profile picture found' });
    }

    res.json({ imageUrl: result.rows[0].profile_picture_url });
  } catch (err) {
    console.error('Retrieval failed:', err);
    res.status(500).json({ error: 'Error retrieving profile picture' });
  }
});

/**
 * @swagger
 * /profile/update-profile-pic:
 *   put:
 *     summary: Update a user profile picture
 *     tags:
 *       - Profile
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               user_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile picture updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   format: uri
 *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
 *       400:
 *         description: Bad request (e.g. missing image or user_id)
 *       500:
 *         description: Failed to update profile picture
 */
router.put('/update-profile-pic', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.body.user_id;

    if (!file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const imageUrl = await uploadToAzure(file.buffer, file.originalname, file.mimetype);

    await client.query(
      'UPDATE users SET profile_picture_url = $1 WHERE user_id = $2',
      [imageUrl, userId]
    );

    res.json({ imageUrl });
  } catch (err) {
    console.error('Update failed:', err);
    res.status(500).json({ error: 'Failed to update profile picture' });
  }
});

/**
 * @swagger
 * /profile/contact-info:
 *   get:
 *     summary: Get user's phone number and email by user_id
 *     tags:
 *       - Profile
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user
 *     responses:
 *       200:
 *         description: Contact info retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phone_number:
 *                   type: string
 *                   example: "+1234567890"
 *                 email:
 *                   type: string
 *                   example: "user@example.com"
 *       400:
 *         description: Missing user_id
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/contact-info', async (req, res) => {
  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    const result = await client.query(
      'SELECT phone_number, email FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { phone_number, email } = result.rows[0];
    res.json({ phone_number, email });
  } catch (err) {
    console.error('Failed to retrieve contact info:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /profile/contact-info:
 *   put:
 *     summary: Update user's phone number and/or email
 *     tags:
 *       - Profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: string
 *               phone_number:
 *                 type: string
 *                 example: "+1234567890"
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Contact info updated successfully
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put('/contact-info', async (req, res) => {
  const { user_id, phone_number, email } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  if (!phone_number && !email) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const updates = [];
    const values = [];
    let index = 1;

    if (phone_number) {
      updates.push(`phone_number = $${index++}`);
      values.push(phone_number);
    }

    if (email) {
      updates.push(`email = $${index++}`);
      values.push(email);
    }

    values.push(user_id);

    const result = await client.query(
      `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${index} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Contact info updated successfully' });
  } catch (err) {
    console.error('Failed to update contact info:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/**
 * @swagger
 * /profile/consultants/upload-profile-pic:
 *   post:
 *     summary: Upload a consultant profile picture
 *     tags:
 *       - Consultant Profile
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               consultant_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   format: uri
 *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
 *       400:
 *         description: Bad request
 *       500:
 *         description: Upload failed
 */
router.post('/consultants/upload-profile-pic', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const consultantId = req.body.consultant_id;

    if (!file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    if (!consultantId) {
      return res.status(400).json({ error: 'Missing consultant_id' });
    }

    const imageUrl = await uploadToAzure(file.buffer, file.originalname, file.mimetype);

    await client.query(
      'UPDATE consultants SET profile = $1 WHERE consultant_id = $2',
      [imageUrl, consultantId]
    );

    res.json({ imageUrl });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/**
 * @swagger
 * /profile/consultants/profile-picture:
 *   get:
 *     summary: Get the consultant's profile picture URL by consultant_id
 *     tags:
 *       - Consultant Profile
 *     parameters:
 *       - in: query
 *         name: consultant_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the consultant to retrieve profile picture for
 *     responses:
 *       200:
 *         description: Successfully retrieved profile picture URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   format: uri
 *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
 *       400:
 *         description: Missing consultant_id
 *       404:
 *         description: No profile picture found
 *       500:
 *         description: Error retrieving profile picture
 */
router.get('/consultants/profile-picture', async (req, res) => {
  const consultantId = req.query.consultant_id;

  if (!consultantId) {
    return res.status(400).json({ error: 'Missing consultant_id' });
  }

  try {
    const result = await client.query(
      'SELECT profile FROM consultants WHERE consultant_id = $1',
      [consultantId]
    );

    if (result.rows.length === 0 || !result.rows[0].profile) {
      return res.status(404).json({ error: 'No profile picture found' });
    }

    res.json({ imageUrl: result.rows[0].profile });
  } catch (err) {
    console.error('Retrieval failed:', err);
    res.status(500).json({ error: 'Error retrieving profile picture' });
  }
});


/**
 * @swagger
 * /profile/consultants/update-profile-pic:
 *   put:
 *     summary: Update a consultant profile picture
 *     tags:
 *       - Consultant Profile
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               consultant_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile picture updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   format: uri
 *                   example: https://yourstorage.blob.core.windows.net/profile-pictures/image.jpg
 *       400:
 *         description: Bad request (e.g. missing image or consultant_id)
 *       500:
 *         description: Failed to update profile picture
 */
router.put('/consultants/update-profile-pic', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const consultantId = req.body.consultant_id;

    if (!file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    if (!consultantId) {
      return res.status(400).json({ error: 'Missing consultant_id' });
    }

    const imageUrl = await uploadToAzure(file.buffer, file.originalname, file.mimetype);

    await client.query(
      'UPDATE consultants SET profile = $1 WHERE consultant_id = $2',
      [imageUrl, consultantId]
    );

    res.json({ imageUrl });
  } catch (err) {
    console.error('Update failed:', err);
    res.status(500).json({ error: 'Failed to update profile picture' });
  }
});



module.exports = router;
