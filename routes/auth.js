// routes/auth.js - Autenticación
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Middleware de validación para registro
const validateRegister = [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Password debe tener al menos 6 caracteres'),
    body('username').isLength({ min: 3 }).withMessage('Username debe tener al menos 3 caracteres'),
    body('full_name').isLength({ min: 2 }).withMessage('Nombre completo debe tener al menos 2 caracteres'),
    body('team_id').isInt({ min: 1 }).withMessage('Debe seleccionar un equipo válido')
];

// Middleware de validación para login
const validateLogin = [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Password requerido')
];

// POST /api/auth/register - Registro de usuario
router.post('/register', validateRegister, async (req, res) => {
    try {
        // Validar campos
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: errors.array()
            });
        }

        const { email, password, username, team_id, full_name, first_name, last_name } = req.body;

        // Verificar si el usuario ya existe
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'El email o username ya están en uso'
            });
        }

        // Verificar que el equipo existe
        const [teams] = await db.execute('SELECT id FROM teams WHERE id = ?', [team_id]);
        if (teams.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Equipo no válido'
            });
        }

        // Encriptar password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Preparar el nombre completo
        const finalFullName = full_name || (first_name && last_name ? `${first_name} ${last_name}` : username);

        // Crear usuario
        const [result] = await db.execute(
            'INSERT INTO users (email, password, username, team_id, full_name, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [email, hashedPassword, username, team_id, finalFullName, first_name || null, last_name || null]
        );

        // Generar JWT
        const token = jwt.sign(
            { 
                userId: result.insertId,
                email: email,
                username: username
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Obtener información del usuario con equipo
        const [userData] = await db.execute(`
            SELECT u.id, u.email, u.username, u.full_name, u.profile_image, 
                   t.name as team_name, t.logo_url as team_logo, t.flag_url as team_flag
            FROM users u 
            JOIN teams t ON u.team_id = t.id 
            WHERE u.id = ?
        `, [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            token: token,
            user: userData[0]
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/login - Login de usuario
router.post('/login', validateLogin, async (req, res) => {
    try {
        // Validar campos
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Buscar usuario por email
        const [users] = await db.execute(`
            SELECT u.id, u.email, u.password, u.username, u.full_name, u.profile_image, u.team_id,
                   t.name as team_name, t.logo_url as team_logo, t.flag_url as team_flag
            FROM users u 
            JOIN teams t ON u.team_id = t.id 
            WHERE u.email = ? AND u.is_active = TRUE
        `, [email]);

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const user = users[0];

        // Verificar password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Generar JWT
        const token = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                username: user.username
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Remover password de la respuesta
        delete user.password;

        res.json({
            success: true,
            message: 'Login exitoso',
            token: token,
            user: user
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/verify-token - Verificar token JWT
router.post('/verify-token', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token no proporcionado'
            });
        }

        // Verificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Obtener información actualizada del usuario
        const [users] = await db.execute(`
            SELECT u.id, u.email, u.username, u.full_name, u.profile_image, u.team_id,
                   t.name as team_name, t.logo_url as team_logo, t.flag_url as team_flag
            FROM users u 
            JOIN teams t ON u.team_id = t.id 
            WHERE u.id = ? AND u.is_active = TRUE
        `, [decoded.userId]);

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Token válido',
            user: users[0]
        });

    } catch (error) {
        console.error('Error verificando token:', error);
        res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
});

// POST /api/auth/refresh-token - Refrescar token
router.post('/refresh-token', async (req, res) => {
    try {
        const oldToken = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!oldToken) {
            return res.status(401).json({
                success: false,
                message: 'Token no proporcionado'
            });
        }

        // Verificar token (incluso si está expirado)
        let decoded;
        try {
            decoded = jwt.verify(oldToken, process.env.JWT_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                decoded = jwt.decode(oldToken);
            } else {
                throw error;
            }
        }

        // Generar nuevo token
        const newToken = jwt.sign(
            { 
                userId: decoded.userId,
                email: decoded.email,
                username: decoded.username
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Token refrescado exitosamente',
            token: newToken
        });

    } catch (error) {
        console.error('Error refrescando token:', error);
        res.status(401).json({
            success: false,
            message: 'Error refrescando token'
        });
    }
});

module.exports = router;