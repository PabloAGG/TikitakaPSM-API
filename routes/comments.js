// routes/comments.js - Gestión de comentarios en posts
const express = require('express');
const db = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Validadores
const validateComment = [
    body('content').trim().notEmpty().withMessage('Contenido del comentario requerido')
        .isLength({ min: 1, max: 500 }).withMessage('Comentario debe tener entre 1 y 500 caracteres')
];

// GET /api/comments/post/:postId - Obtener comentarios de un post
router.get('/post/:postId', optionalAuth, async (req, res) => {
    try {
        const postId = req.params.postId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const userId = req.user?.id;

        // Verificar que el post existe
        const [posts] = await db.execute('SELECT id FROM posts WHERE id = ?', [postId]);
        if (posts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }

        // Obtener comentarios con información del usuario
        const [comments] = await db.execute(`
            SELECT c.id, c.content, c.created_at, c.updated_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes_count,
                   ${userId ? `(SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) > 0 as is_liked` : '0 as is_liked'}
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, userId ? [userId, postId, limit, offset] : [postId, limit, offset]);

        // Contar total de comentarios
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as total FROM comments WHERE post_id = ?',
            [postId]
        );
        const total = countResult[0].total;
        const hasMore = offset + comments.length < total;

        res.json({
            success: true,
            comments: comments,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                hasMore: hasMore
            }
        });

    } catch (error) {
        console.error('Error obteniendo comentarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/comments/post/:postId - Crear comentario en un post
router.post('/post/:postId', authenticateToken, validateComment, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: errors.array()
            });
        }

        const postId = req.params.postId;
        const { content } = req.body;
        const userId = req.user.id;

        // Verificar que el post existe y no es borrador
        const [posts] = await db.execute(
            'SELECT id FROM posts WHERE id = ? AND is_draft = 0',
            [postId]
        );

        if (posts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado o es borrador'
            });
        }

        // Crear comentario
        const [result] = await db.execute(
            'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
            [postId, userId, content]
        );

        const commentId = result.insertId;

        // Obtener información del post y crear notificación
        const [postInfo] = await db.execute(
            'SELECT user_id FROM posts WHERE id = ?',
            [postId]
        );
        
        // Crear notificación si no es el mismo usuario
        if (postInfo[0] && postInfo[0].user_id !== userId) {
            const [commenterInfo] = await db.execute('SELECT full_name FROM users WHERE id = ?', [userId]);
            const { createNotification, sendPushNotification } = require('./notifications');
            await createNotification(
                postInfo[0].user_id,
                'comment',
                'Nuevo comentario',
                `${commenterInfo[0].full_name} comentó en tu publicación`,
                { post_id: postId, comment_id: commentId, user_id: userId }
            );
            await sendPushNotification(
                postInfo[0].user_id,
                'Nuevo comentario',
                `${commenterInfo[0].full_name} comentó en tu publicación`,
                { post_id: postId, comment_id: commentId, type: 'comment' }
            );
        }

        // Obtener comentario con información del usuario
        const [comments] = await db.execute(`
            SELECT c.id, c.content, c.created_at, c.updated_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   0 as likes_count, 0 as is_liked
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [commentId]);

        res.status(201).json({
            success: true,
            message: 'Comentario creado exitosamente',
            comment: comments[0]
        });

    } catch (error) {
        console.error('Error creando comentario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// PUT /api/comments/:id - Actualizar comentario
router.put('/:id', authenticateToken, validateComment, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: errors.array()
            });
        }

        const commentId = req.params.id;
        const { content } = req.body;
        const userId = req.user.id;

        // Verificar que el comentario existe y pertenece al usuario
        const [comments] = await db.execute(
            'SELECT id FROM comments WHERE id = ? AND user_id = ?',
            [commentId, userId]
        );

        if (comments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Comentario no encontrado o no tienes permisos'
            });
        }

        // Actualizar comentario
        await db.execute(
            'UPDATE comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [content, commentId]
        );

        // Obtener comentario actualizado
        const [updatedComments] = await db.execute(`
            SELECT c.id, c.content, c.created_at, c.updated_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes_count,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) > 0 as is_liked
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [userId, commentId]);

        res.json({
            success: true,
            message: 'Comentario actualizado exitosamente',
            comment: updatedComments[0]
        });

    } catch (error) {
        console.error('Error actualizando comentario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// DELETE /api/comments/:id - Eliminar comentario
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user.id;

        // Verificar que el comentario existe y pertenece al usuario
        const [comments] = await db.execute(
            'SELECT id FROM comments WHERE id = ? AND user_id = ?',
            [commentId, userId]
        );

        if (comments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Comentario no encontrado o no tienes permisos'
            });
        }

        // Eliminar likes del comentario
        await db.execute('DELETE FROM comment_likes WHERE comment_id = ?', [commentId]);

        // Eliminar comentario
        await db.execute('DELETE FROM comments WHERE id = ?', [commentId]);

        res.json({
            success: true,
            message: 'Comentario eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error eliminando comentario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/comments/:id/like - Dar/quitar like a comentario
router.post('/:id/like', authenticateToken, async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user.id;

        // Verificar que el comentario existe
        const [comments] = await db.execute('SELECT id FROM comments WHERE id = ?', [commentId]);
        if (comments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Comentario no encontrado'
            });
        }

        // Verificar si ya tiene like
        const [existingLikes] = await db.execute(
            'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?',
            [commentId, userId]
        );

        let isLiked;
        if (existingLikes.length > 0) {
            // Quitar like
            await db.execute(
                'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
                [commentId, userId]
            );
            isLiked = false;
        } else {
            // Dar like
            await db.execute(
                'INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)',
                [commentId, userId]
            );
            isLiked = true;
        }

        // Contar likes
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?',
            [commentId]
        );
        const likesCount = countResult[0].count;

        res.json({
            success: true,
            message: isLiked ? 'Like agregado' : 'Like removido',
            data: {
                is_liked: isLiked,
                likes_count: likesCount
            }
        });

    } catch (error) {
        console.error('Error procesando like:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;
