// routes/posts.js - Gestión de posts
const express = require('express');
const db = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
// const { createNotification, sendPushNotification } = require('./notifications');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configuración de multer para subir imágenes de posts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/posts/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'post-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB límite
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('video/');

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes y videos'));
    }
  },
});

// Validadores
const validatePost = [
  body('content').notEmpty().withMessage('Contenido requerido'),
  body('team_id').isInt({ min: 1 }).withMessage('Debe seleccionar un equipo válido'),
  body('is_draft').optional().isBoolean().withMessage('is_draft debe ser boolean'),
];

// GET /api/posts - Obtener feed de posts
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const team_id = req.query.team_id;

    let whereClause = 'WHERE p.is_draft = 0';
    let queryParams = [];

    if (team_id) {
      whereClause += ' AND p.team_id = ?';
      queryParams.push(team_id);
    }

    queryParams.push(limit, offset);

    const [posts] = await db.execute(
      `
            SELECT p.id, p.content, p.image_url, p.team_id, p.created_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo,
                   (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
                   (SELECT COUNT(*) FROM user_favorites WHERE post_id = p.id) as favorites_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            JOIN teams t ON p.team_id = t.id
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `,
      queryParams.slice(0, queryParams.length - 2)
    );

    // Si hay usuario autenticado, verificar likes y favoritos
    if (req.user) {
      const postIds = posts.map((p) => p.id);
      if (postIds.length > 0) {
        const [userLikes] = await db.execute(
          `SELECT post_id FROM post_likes WHERE user_id = ? AND post_id IN (${postIds
            .map(() => '?')
            .join(',')})`,
          [req.user.id, ...postIds]
        );

        const [userFavorites] = await db.execute(
          `SELECT post_id FROM user_favorites WHERE user_id = ? AND post_id IN (${postIds
            .map(() => '?')
            .join(',')})`,
          [req.user.id, ...postIds]
        );

        const likedPosts = new Set(userLikes.map((l) => l.post_id));
        const favoritePosts = new Set(userFavorites.map((f) => f.post_id));

        posts.forEach((post) => {
          post.is_liked = likedPosts.has(post.id) ? true : false;
          post.is_favorited = favoritePosts.has(post.id) ? true : false;
        });
      } else {
        posts.forEach((post) => {
          post.is_liked = false;
          post.is_favorited = false;
        });
      }
    } else {
      posts.forEach((post) => {
        post.is_liked = false;
        post.is_favorited = false;
      });
    }

    res.json({
      success: true,
      posts: posts,
      pagination: {
        page: page,
        limit: limit,
        hasMore: posts.length === limit,
      },
    });
  } catch (error) {
    console.error('Error obteniendo posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// GET /api/posts/user/:userId - Obtener posts de un usuario
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [posts] = await db.execute(
      `
            SELECT p.id, p.content, p.image_url, p.team_id, p.created_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo,
                   (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
                   (SELECT COUNT(*) FROM user_favorites WHERE post_id = p.id) as favorites_count,
                   0 as is_liked,
                   0 as is_favorited
            FROM posts p
            JOIN users u ON p.user_id = u.id
            JOIN teams t ON p.team_id = t.id
            WHERE p.user_id = ? AND p.is_draft = 0
            ORDER BY p.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `,
      [userId]
    );

    // Convertir a booleanos
    posts.forEach((post) => {
      post.is_liked = false;
      post.is_favorited = false;
    });

    res.json({
      success: true,
      posts: posts,
      pagination: {
        page: page,
        limit: limit,
        hasMore: posts.length === limit,
      },
    });
  } catch (error) {
    console.error('Error obteniendo posts del usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// GET /api/posts/drafts - Obtener borradores del usuario autenticado
router.get('/drafts', authenticateToken, async (req, res) => {
  try {
    const [drafts] = await db.execute(
      `
            SELECT p.id, p.content, p.image_url, p.team_id, p.created_at,
                   t.name as team_name, t.logo_url as team_logo
            FROM posts p
            JOIN teams t ON p.team_id = t.id
            WHERE p.user_id = ? AND p.is_draft = 1
            ORDER BY p.created_at DESC
        `,
      [req.user.id]
    );

    res.json({
      success: true,
      drafts: drafts,
    });
  } catch (error) {
    console.error('Error obteniendo borradores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// POST /api/posts - Crear nuevo post
router.post('/', authenticateToken, validatePost, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array(),
      });
    }

    const { content, team_id, is_draft = false } = req.body;

    // Verificar que el equipo existe
    const [teams] = await db.execute('SELECT id FROM teams WHERE id = ?', [team_id]);
    if (teams.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Equipo no válido',
      });
    }

    // Crear post
    const [result] = await db.execute(
      'INSERT INTO posts (user_id, content, team_id, is_draft) VALUES (?, ?, ?, ?)',
      [req.user.id, content, team_id, is_draft]
    );

    // Obtener post creado con información completa
    const [newPost] = await db.execute(
      `
            SELECT p.id, p.content, p.image_url, p.team_id, p.created_at, p.is_draft,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo,
                   0 as likes_count,
                   0 as favorites_count,
                   0 as is_liked,
                   0 as is_favorited
            FROM posts p
            JOIN users u ON p.user_id = u.id
            JOIN teams t ON p.team_id = t.id
            WHERE p.id = ?
        `,
      [result.insertId]
    );

    // Convertir a booleanos
    newPost[0].is_liked = false;
    newPost[0].is_favorited = false;

    res.status(201).json({
      success: true,
      message: is_draft ? 'Borrador guardado exitosamente' : 'Post creado exitosamente',
      post: newPost[0],
    });
  } catch (error) {
    console.error('Error creando post:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// POST /api/posts/upload - Subir imagen para post
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó imagen',
      });
    }

    const imageUrl = `/uploads/posts/${req.file.filename}`;

    res.json({
      success: true,
      message: 'Imagen subida exitosamente',
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

// PUT /api/posts/:id - Actualizar post
router.put('/:id', authenticateToken, validatePost, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array(),
      });
    }

    const postId = req.params.id;
    const { content, team_id, is_draft } = req.body;

    // Verificar que el post existe y pertenece al usuario
    const [posts] = await db.execute('SELECT id FROM posts WHERE id = ? AND user_id = ?', [
      postId,
      req.user.id,
    ]);

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post no encontrado o no tienes permisos',
      });
    }

    // Verificar que el equipo existe
    const [teams] = await db.execute('SELECT id FROM teams WHERE id = ?', [team_id]);
    if (teams.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Equipo no válido',
      });
    }

    // Actualizar post
    await db.execute('UPDATE posts SET content = ?, team_id = ?, is_draft = ? WHERE id = ?', [
      content,
      team_id,
      is_draft,
      postId,
    ]);

    // Obtener post actualizado
    const [updatedPost] = await db.execute(
      `
            SELECT p.id, p.content, p.image_url, p.team_id, p.created_at, p.is_draft,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo
            FROM posts p
            JOIN users u ON p.user_id = u.id
            JOIN teams t ON p.team_id = t.id
            WHERE p.id = ?
        `,
      [postId]
    );

    res.json({
      success: true,
      message: 'Post actualizado exitosamente',
      post: updatedPost[0],
    });
  } catch (error) {
    console.error('Error actualizando post:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// DELETE /api/posts/:id - Eliminar post
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;

    // Verificar que el post existe y pertenece al usuario
    const [posts] = await db.execute(
      'SELECT id, image_url FROM posts WHERE id = ? AND user_id = ?',
      [postId, req.user.id]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post no encontrado o no tienes permisos',
      });
    }

    // Eliminar imagen si existe
    if (posts[0].image_url) {
      const imagePath = path.join(__dirname, '..', posts[0].image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Eliminar post (esto también eliminará likes y favoritos por CASCADE)
    await db.execute('DELETE FROM posts WHERE id = ?', [postId]);

    res.json({
      success: true,
      message: 'Post eliminado exitosamente',
    });
  } catch (error) {
    console.error('Error eliminando post:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// POST /api/posts/:id/like - Dar/quitar like a un post
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    // Verificar que el post existe
    const [posts] = await db.execute('SELECT id FROM posts WHERE id = ?', [postId]);
    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post no encontrado',
      });
    }

    // Verificar si ya tiene like
    const [existingLike] = await db.execute(
      'SELECT id FROM post_likes WHERE user_id = ? AND post_id = ?',
      [userId, postId]
    );

    let isLiked;

    if (existingLike.length > 0) {
      // Quitar like
      await db.execute('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?', [
        userId,
        postId,
      ]);
      isLiked = false;
    } else {
      // Agregar like
      await db.execute('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)', [userId, postId]);
      isLiked = true;

      // Obtener información del post y usuario para notificación
      const [postInfo] = await db.execute(
        'SELECT p.user_id, u.full_name FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?',
        [postId]
      );

      // Crear notificación si no es el mismo usuario
      if (postInfo[0] && postInfo[0].user_id !== userId) {
        const [likerInfo] = await db.execute('SELECT full_name FROM users WHERE id = ?', [userId]);
        /* await createNotification(
                    postInfo[0].user_id,
                    'like',
                    'Nuevo like',
                    `A ${likerInfo[0].full_name} le gustó tu publicación`,
                    { post_id: postId, user_id: userId }
                );
                await sendPushNotification(
                    postInfo[0].user_id,
                    'Nuevo like',
                    `A ${likerInfo[0].full_name} le gustó tu publicación`,
                    { post_id: postId, type: 'like' }
                ); */
      }
    }

    // Obtener nuevo conteo de likes
    const [likeCount] = await db.execute(
      'SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?',
      [postId]
    );

    res.json({
      success: true,
      message: isLiked ? 'Like agregado' : 'Like removido',
      is_liked: isLiked,
      likes_count: likeCount[0].count,
    });
  } catch (error) {
    console.error('Error con like:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// POST /api/posts/:id/favorite - Agregar/quitar de favoritos
router.post('/:id/favorite', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    // Verificar que el post existe
    const [posts] = await db.execute('SELECT id FROM posts WHERE id = ?', [postId]);
    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post no encontrado',
      });
    }

    // Verificar si ya está en favoritos
    const [existingFavorite] = await db.execute(
      'SELECT id FROM user_favorites WHERE user_id = ? AND post_id = ?',
      [userId, postId]
    );

    let isFavorited;

    if (existingFavorite.length > 0) {
      // Quitar de favoritos
      await db.execute('DELETE FROM user_favorites WHERE user_id = ? AND post_id = ?', [
        userId,
        postId,
      ]);
      isFavorited = false;
    } else {
      // Agregar a favoritos
      await db.execute('INSERT INTO user_favorites (user_id, post_id) VALUES (?, ?)', [
        userId,
        postId,
      ]);
      isFavorited = true;
    }

    res.json({
      success: true,
      message: isFavorited ? 'Agregado a favoritos' : 'Removido de favoritos',
      is_favorited: isFavorited,
    });
  } catch (error) {
    console.error('Error con favorito:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// GET /api/posts/favorites - Obtener posts favoritos del usuario
router.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [posts] = await db.execute(
      `
            SELECT p.id, p.content, p.image_url, p.team_id, p.created_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo,
                   (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
                   (SELECT COUNT(*) FROM user_favorites WHERE post_id = p.id) as favorites_count,
                   true as is_favorited
            FROM posts p
            JOIN users u ON p.user_id = u.id
            JOIN teams t ON p.team_id = t.id
            JOIN user_favorites f ON p.id = f.post_id
            WHERE f.user_id = ? AND p.is_draft = 0
            ORDER BY f.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `,
      [req.user.id]
    );

    res.json({
      success: true,
      posts: posts,
      pagination: {
        page: page,
        limit: limit,
        hasMore: posts.length === limit,
      },
    });
  } catch (error) {
    console.error('Error obteniendo favoritos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

module.exports = router;
