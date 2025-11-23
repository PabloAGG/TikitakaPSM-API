// server.js - Servidor principal de la API Tikitaka
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const teamRoutes = require('./routes/teams');
const commentRoutes = require('./routes/comments');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARES GLOBALES
// =====================================================

// Seguridad
app.use(helmet());

// CORS para permitir peticiones desde la app Android
app.use(cors({
    origin: ['http://localhost:3000', 'http://10.0.2.2:3000'], // Para emulador Android
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requests por IP
    message: {
        error: 'Demasiadas peticiones, intenta de nuevo más tarde.'
    }
});
app.use(limiter);

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// =====================================================
// RUTAS DE LA API
// =====================================================

// Ruta de prueba
app.get('/', (req, res) => {
    res.json({
        message: 'API Tikitaka PSM funcionando correctamente',
        version: '1.0.0',
        status: 'online'
    });
});

// Rutas principales
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);

// Servir archivos estáticos (imágenes subidas)
app.use('/uploads', express.static('uploads'));

// =====================================================
// MANEJO DE ERRORES
// =====================================================

// Ruta no encontrada
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado',
        message: `La ruta ${req.originalUrl} no existe en esta API`
    });
});

// Manejo global de errores
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    
    res.status(err.status || 500).json({
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
    });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {
    console.log(`🚀 Servidor Tikitaka API ejecutándose en puerto ${PORT}`);
    console.log(`📱 Para emulador Android usar: http://10.0.2.2:${PORT}`);
    console.log(`🌐 Para dispositivo físico usar tu IP local: http://[TU_IP]:${PORT}`);
});

module.exports = app;