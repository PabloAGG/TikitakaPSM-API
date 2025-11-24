// routes/users.js - Gestión de usuarios
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configuración de multer para subir imágenes de perfil
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/profiles/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB límite
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif)'));
    }
  },
});

// Validadores
const validateUpdateProfile = [
  body('username')
    .optional()
    .isLength({ min: 3 })
    .withMessage('Username debe tener al menos 3 caracteres'),
  body('full_name').optional().isLength({ min: 1 }).withMessage('Nombre completo requerido'),
  body('team_id').optional().isInt({ min: 1 }).withMessage('Debe seleccionar un equipo válido'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio no puede exceder 500 caracteres'),
];

const validateChangePassword = [
  body('current_password').notEmpty().withMessage('Password actual requerido'),
  body('new_password')
    .isLength({ min: 6 })
    .withMessage('Nuevo password debe tener al menos 6 caracteres'),
];

// GET /api/users/profile - Obtener perfil del usuario autenticado
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [users] = await db.execute(
      `
            SELECT u.id, u.email, u.username, u.full_name, u.bio, u.profile_image,
                   u.created_at, t.name as team_name, t.logo_url as team_logo,
                   (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND is_draft = 0) as posts_count,
                   (SELECT COUNT(*) FROM user_favorites WHERE user_id = u.id) as favorites_count
            FROM users u 
            JOIN teams t ON u.team_id = t.id 
            WHERE u.id = ?
        `,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    res.json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// GET /api/users/:id - Obtener perfil de otro usuario
router.get('/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const [users] = await db.execute(
      `
            SELECT u.id, u.username, u.full_name, u.bio, u.profile_image,
                   u.created_at, t.name as team_name, t.logo_url as team_logo,
                   (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND is_draft = 0) as posts_count,
                   (SELECT COUNT(*) FROM user_favorites WHERE user_id = u.id) as favorites_count
            FROM users u 
            JOIN teams t ON u.team_id = t.id 
            WHERE u.id = ?
        `,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    res.json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// PUT /api/users/profile - Actualizar perfil
router.put('/profile', authenticateToken, validateUpdateProfile, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array(),
      });
    }

    const { username, full_name, team_id, bio } = req.body;
    const userId = req.user.id;

    // Verificar si el username ya existe (si se está cambiando)
    if (username) {
      const [existingUsers] = await db.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, userId]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'El username ya está en uso',
        });
      }
    }

    // Verificar que el equipo existe (si se está cambiando)
    if (team_id) {
      const [teams] = await db.execute('SELECT id FROM teams WHERE id = ?', [team_id]);
      if (teams.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Equipo no válido',
        });
      }
    }

    // Construir query dinámicamente
    const updateFields = [];
    const updateValues = [];

    if (username) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }
    if (full_name) {
      updateFields.push('full_name = ?');
      updateValues.push(full_name);
    }
    if (team_id) {
      updateFields.push('team_id = ?');
      updateValues.push(team_id);
    }
    if (bio !== undefined) {
      updateFields.push('bio = ?');
      updateValues.push(bio);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar',
      });
    }

    updateValues.push(userId);

    // Actualizar usuario
    await db.execute(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

    // Obtener información actualizada
    const [updatedUser] = await db.execute(
      `
            SELECT u.id, u.email, u.username, u.full_name, u.bio, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo
            FROM users u 
            JOIN teams t ON u.team_id = t.id 
            WHERE u.id = ?
        `,
      [userId]
    );

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      user: updatedUser[0],
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// POST /api/users/upload-avatar - Subir imagen de perfil
router.post('/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó imagen',
      });
    }

    const imageUrl = `/uploads/profiles/${req.file.filename}`;
    const userId = req.user.id;

    // Obtener imagen anterior para eliminarla
    const [currentUser] = await db.execute('SELECT profile_image FROM users WHERE id = ?', [
      userId,
    ]);

    // Actualizar imagen en base de datos
    await db.execute('UPDATE users SET profile_image = ? WHERE id = ?', [imageUrl, userId]);

    // Eliminar imagen anterior si existe
    if (currentUser[0]?.profile_image && currentUser[0].profile_image !== imageUrl) {
      const oldImagePath = path.join(__dirname, '..', currentUser[0].profile_image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    res.json({
      success: true,
      message: 'Imagen de perfil actualizada exitosamente',
      image_url: imageUrl,
    });
  } catch (error) {
    console.error('Error subiendo imagen:', error);

    // Eliminar archivo subido si hay error
    if (req.file) {
      const filePath = req.file.path;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error subiendo imagen',
    });
  }
});

// PUT /api/users/change-password - Cambiar contraseña
router.put('/change-password', authenticateToken, validateChangePassword, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array(),
      });
    }

    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    // Obtener password actual
    const [users] = await db.execute('SELECT password FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    // Verificar password actual
    const isCurrentPasswordValid = await bcrypt.compare(current_password, users[0].password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Password actual incorrecto',
      });
    }

    // Encriptar nuevo password
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(new_password, salt);

    // Actualizar password
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId]);

    res.json({
      success: true,
      message: 'Contraseña cambiada exitosamente',
    });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// GET /api/users/search?q=query - Buscar usuarios
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query debe tener al menos 2 caracteres',
      });
    }

    const [users] = await db.execute(
      `
            SELECT u.id, u.username, u.full_name, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo
            FROM users u 
            JOIN teams t ON u.team_id = t.id 
            WHERE u.username LIKE ? OR u.full_name LIKE ?
            ORDER BY u.username
            LIMIT 20
        `,
      [`%${query}%`, `%${query}%`]
    );

    res.json({
      success: true,
      users: users,
    });
  } catch (error) {
    console.error('Error buscando usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

module.exports = router;
