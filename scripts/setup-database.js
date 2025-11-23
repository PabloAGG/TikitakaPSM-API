// setup-database.js - Script para configurar la base de datos
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const setupDatabase = async () => {
    let connection;
    
    try {
        console.log('🔄 Conectando a MySQL...');
        
        // Primero conectar sin base de datos para crearla
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true
        });

        // Crear la base de datos si no existe
        await connection.execute('CREATE DATABASE IF NOT EXISTS tikitaka_db');
        await connection.end();

        // Reconectar con la base de datos seleccionada
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'tikitaka_db',
            multipleStatements: true
        });

        console.log('✅ Conexión a MySQL establecida');

        // Leer el archivo SQL
        const sqlPath = path.join(__dirname, 'simple-db-setup.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        console.log('🔄 Ejecutando script de base de datos...');

        // Dividir el SQL en instrucciones individuales y ejecutarlas
        const statements = sqlContent
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await connection.execute(statement);
                } catch (error) {
                    // Ignorar errores de "database already exists"
                    if (!error.message.includes('database exists')) {
                        console.warn('⚠️ Warning ejecutando:', statement.substring(0, 50) + '...');
                        console.warn('   Error:', error.message);
                    }
                }
            }
        }

        console.log('✅ Base de datos configurada correctamente');
        console.log('📊 Tablas creadas:');
        console.log('   - teams (equipos de fútbol)');
        console.log('   - users (usuarios)');
        console.log('   - posts (publicaciones)');
        console.log('   - post_likes (likes de posts)');
        console.log('   - user_favorites (favoritos de usuarios)');
        console.log('   - user_sessions (sesiones de usuario)');
        console.log('🎯 Datos de prueba insertados');

    } catch (error) {
        console.error('❌ Error configurando la base de datos:', error.message);
        console.error('💡 Asegúrate de que:');
        console.error('   1. MySQL esté ejecutándose');
        console.error('   2. Las credenciales en .env sean correctas');
        console.error('   3. El usuario tenga permisos para crear bases de datos');
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};

// Función para probar la conexión con la base de datos configurada
const testConnection = async () => {
    let connection;
    
    try {
        console.log('🔄 Probando conexión con la base de datos configurada...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'tikitaka_db'
        });

        // Probar algunas consultas básicas
        const [teams] = await connection.execute('SELECT COUNT(*) as count FROM teams');
        const [users] = await connection.execute('SELECT COUNT(*) as count FROM users');
        const [posts] = await connection.execute('SELECT COUNT(*) as count FROM posts');

        console.log('✅ Conexión exitosa a la base de datos');
        console.log(`📊 Estadísticas:`);
        console.log(`   - Equipos: ${teams[0].count}`);
        console.log(`   - Usuarios: ${users[0].count}`);
        console.log(`   - Posts: ${posts[0].count}`);

    } catch (error) {
        console.error('❌ Error probando la conexión:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};

// Ejecutar según el argumento
const command = process.argv[2];

if (command === 'setup') {
    setupDatabase();
} else if (command === 'test') {
    testConnection();
} else {
    console.log('📚 Uso:');
    console.log('  node setup-database.js setup  - Configurar base de datos');
    console.log('  node setup-database.js test   - Probar conexión');
}

module.exports = { setupDatabase, testConnection };