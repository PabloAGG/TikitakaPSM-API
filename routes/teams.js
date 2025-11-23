// routes/teams.js - Gestión de equipos
const express = require('express');
const db = require('../config/database');
const router = express.Router();

// GET /api/teams - Obtener todos los equipos
router.get('/', async (req, res) => {
    try {
        const [teams] = await db.execute(`
            SELECT t.id, t.name, t.logo_url, t.confederation,
                   (SELECT COUNT(*) FROM users WHERE team_id = t.id) as fans_count,
                   (SELECT COUNT(*) FROM posts WHERE team_id = t.id AND is_draft = 0) as posts_count
            FROM teams t
            ORDER BY t.confederation, t.name
        `);

        // Agrupar por confederación
        const teamsByConfederation = teams.reduce((acc, team) => {
            if (!acc[team.confederation]) {
                acc[team.confederation] = [];
            }
            acc[team.confederation].push(team);
            return acc;
        }, {});

        res.json({
            success: true,
            teams: teams,
            teams_by_confederation: teamsByConfederation
        });

    } catch (error) {
        console.error('Error obteniendo equipos:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/teams/:id - Obtener información detallada de un equipo
router.get('/:id', async (req, res) => {
    try {
        const teamId = req.params.id;

        // Obtener información del equipo
        const [teams] = await db.execute(`
            SELECT t.id, t.name, t.logo_url, t.confederation,
                   (SELECT COUNT(*) FROM users WHERE team_id = t.id) as fans_count,
                   (SELECT COUNT(*) FROM posts WHERE team_id = t.id AND is_draft = 0) as posts_count
            FROM teams t
            WHERE t.id = ?
        `, [teamId]);

        if (teams.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Equipo no encontrado'
            });
        }

        // Obtener posts recientes del equipo
        const [recentPosts] = await db.execute(`
            SELECT p.id, p.content, p.image_url, p.created_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
                   (SELECT COUNT(*) FROM favorites WHERE post_id = p.id) as favorites_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.team_id = ? AND p.is_draft = 0
            ORDER BY p.created_at DESC
            LIMIT 10
        `, [teamId]);

        // Obtener fans destacados (usuarios con más posts del equipo)
        const [topFans] = await db.execute(`
            SELECT u.id, u.username, u.full_name, u.profile_image,
                   COUNT(p.id) as posts_count
            FROM users u
            LEFT JOIN posts p ON u.id = p.user_id AND p.team_id = ? AND p.is_draft = 0
            WHERE u.team_id = ?
            GROUP BY u.id, u.username, u.full_name, u.profile_image
            ORDER BY posts_count DESC, u.username
            LIMIT 10
        `, [teamId, teamId]);

        const team = teams[0];
        team.recent_posts = recentPosts;
        team.top_fans = topFans;

        res.json({
            success: true,
            team: team
        });

    } catch (error) {
        console.error('Error obteniendo equipo:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/teams/:id/posts - Obtener posts de un equipo específico
router.get('/:id/posts', async (req, res) => {
    try {
        const teamId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Verificar que el equipo existe
        const [teams] = await db.execute('SELECT id FROM teams WHERE id = ?', [teamId]);
        if (teams.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Equipo no encontrado'
            });
        }

        const [posts] = await db.execute(`
            SELECT p.id, p.content, p.image_url, p.created_at,
                   u.id as user_id, u.username, u.full_name, u.profile_image,
                   t.name as team_name, t.logo_url as team_logo,
                   (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
                   (SELECT COUNT(*) FROM favorites WHERE post_id = p.id) as favorites_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            JOIN teams t ON p.team_id = t.id
            WHERE p.team_id = ? AND p.is_draft = 0
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [teamId, limit, offset]);

        res.json({
            success: true,
            posts: posts,
            pagination: {
                page: page,
                limit: limit,
                hasMore: posts.length === limit
            }
        });

    } catch (error) {
        console.error('Error obteniendo posts del equipo:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/teams/:id/fans - Obtener fans de un equipo
router.get('/:id/fans', async (req, res) => {
    try {
        const teamId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Verificar que el equipo existe
        const [teams] = await db.execute('SELECT id, name FROM teams WHERE id = ?', [teamId]);
        if (teams.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Equipo no encontrado'
            });
        }

        const [fans] = await db.execute(`
            SELECT u.id, u.username, u.full_name, u.profile_image, u.created_at,
                   (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND team_id = ? AND is_draft = 0) as posts_count
            FROM users u
            WHERE u.team_id = ?
            ORDER BY posts_count DESC, u.created_at DESC
            LIMIT ? OFFSET ?
        `, [teamId, teamId, limit, offset]);

        res.json({
            success: true,
            team_name: teams[0].name,
            fans: fans,
            pagination: {
                page: page,
                limit: limit,
                hasMore: fans.length === limit
            }
        });

    } catch (error) {
        console.error('Error obteniendo fans del equipo:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/teams/confederation/:confederation - Obtener equipos por confederación
router.get('/confederation/:confederation', async (req, res) => {
    try {
        const confederation = req.params.confederation.toUpperCase();
        
        const validConfederations = ['UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'];
        if (!validConfederations.includes(confederation)) {
            return res.status(400).json({
                success: false,
                message: 'Confederación no válida'
            });
        }

        const [teams] = await db.execute(`
            SELECT t.id, t.name, t.logo_url, t.confederation,
                   (SELECT COUNT(*) FROM users WHERE team_id = t.id) as fans_count,
                   (SELECT COUNT(*) FROM posts WHERE team_id = t.id AND is_draft = 0) as posts_count
            FROM teams t
            WHERE t.confederation = ?
            ORDER BY t.name
        `, [confederation]);

        res.json({
            success: true,
            confederation: confederation,
            teams: teams
        });

    } catch (error) {
        console.error('Error obteniendo equipos por confederación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/teams/search?q=query - Buscar equipos
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        
        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Query debe tener al menos 2 caracteres'
            });
        }

        const [teams] = await db.execute(`
            SELECT t.id, t.name, t.logo_url, t.confederation,
                   (SELECT COUNT(*) FROM users WHERE team_id = t.id) as fans_count,
                   (SELECT COUNT(*) FROM posts WHERE team_id = t.id AND is_draft = 0) as posts_count
            FROM teams t
            WHERE t.name LIKE ?
            ORDER BY fans_count DESC, t.name
            LIMIT 20
        `, [`%${query}%`]);

        res.json({
            success: true,
            query: query,
            teams: teams
        });

    } catch (error) {
        console.error('Error buscando equipos:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/teams/stats/popular - Obtener equipos más populares
router.get('/stats/popular', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const [teams] = await db.execute(`
            SELECT t.id, t.name, t.logo_url, t.confederation,
                   (SELECT COUNT(*) FROM users WHERE team_id = t.id) as fans_count,
                   (SELECT COUNT(*) FROM posts WHERE team_id = t.id AND is_draft = 0) as posts_count
            FROM teams t
            ORDER BY fans_count DESC, posts_count DESC
            LIMIT ?
        `, [limit]);

        res.json({
            success: true,
            popular_teams: teams
        });

    } catch (error) {
        console.error('Error obteniendo equipos populares:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/teams/stats/active - Equipos con más actividad reciente
router.get('/stats/active', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const days = parseInt(req.query.days) || 7;

        const [teams] = await db.execute(`
            SELECT t.id, t.name, t.logo_url, t.confederation,
                   (SELECT COUNT(*) FROM users WHERE team_id = t.id) as fans_count,
                   COUNT(p.id) as recent_posts_count
            FROM teams t
            LEFT JOIN posts p ON t.id = p.team_id 
                AND p.is_draft = 0 
                AND p.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY t.id, t.name, t.logo_url, t.confederation
            ORDER BY recent_posts_count DESC, fans_count DESC
            LIMIT ?
        `, [days, limit]);

        res.json({
            success: true,
            days_period: days,
            active_teams: teams
        });

    } catch (error) {
        console.error('Error obteniendo equipos activos:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;