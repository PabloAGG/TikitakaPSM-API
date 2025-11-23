// middleware/auth.js - Middleware de autenticación JWT
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Middleware para verificar token JWT
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token de acceso requerido'
            });
        }

        // Verificar el token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verificar que el usuario aún exista y esté activo
        const [users] = await db.execute(
            'SELECT id, email, username, full_name, profile_image, team_id, is_active FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no válido o inactivo'
            });
        }

        // Agregar información del usuario a la request
        req.user = {
            id: users[0].id,
            email: users[0].email,
            username: users[0].username,
            full_name: users[0].full_name,
            profile_image: users[0].profile_image,
            team_id: users[0].team_id
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expirado',
                error: 'TOKEN_EXPIRED'
            });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token inválido',
                error: 'INVALID_TOKEN'
            });
        } else {
            console.error('Error en autenticación:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor'
            });
        }
    }
};

// Middleware opcional - si hay token lo verifica, si no continúa
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [users] = await db.execute(
            'SELECT id, email, username, full_name, profile_image, team_id, is_active FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );

        if (users.length === 0) {
            req.user = null;
        } else {
            req.user = {
                id: users[0].id,
                email: users[0].email,
                username: users[0].username,
                full_name: users[0].full_name,
                profile_image: users[0].profile_image,
                team_id: users[0].team_id
            };
        }

        next();
    } catch (error) {
        // Si hay error en el token opcional, continuar sin usuario
        req.user = null;
        next();
    }
};

// Middleware para generar un nuevo token automáticamente
const generateNewToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            username: user.username
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

module.exports = {
    authenticateToken,
    optionalAuth,
    generateNewToken
};