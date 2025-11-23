// test-auth.js - Script para probar endpoints de autenticación
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Colores para consola
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`)
};

// Datos de prueba
const testUser = {
    email: `test_${Date.now()}@tikitaka.com`,
    password: 'test123456',
    username: `test_user_${Date.now()}`,
    full_name: 'Usuario de Prueba',
    team_id: 1 // Argentina
};

let authToken = null;

// Test 1: Verificar que el servidor está corriendo
async function testServerStatus() {
    try {
        log.info('Probando conexión al servidor...');
        const response = await axios.get('http://localhost:3000/');
        if (response.data.status === 'online') {
            log.success('Servidor en línea');
            return true;
        }
    } catch (error) {
        log.error('Servidor no disponible. Asegúrate de ejecutar: npm run dev');
        return false;
    }
}

// Test 2: Obtener equipos
async function testGetTeams() {
    try {
        log.info('Obteniendo lista de equipos...');
        const response = await axios.get(`${BASE_URL}/teams`);
        if (response.data.success && response.data.teams.length > 0) {
            log.success(`${response.data.teams.length} equipos disponibles`);
            log.info(`Primer equipo: ${response.data.teams[0].name}`);
            return true;
        } else {
            log.error('No se pudieron obtener equipos');
            return false;
        }
    } catch (error) {
        log.error(`Error obteniendo equipos: ${error.message}`);
        return false;
    }
}

// Test 3: Registro de usuario
async function testRegister() {
    try {
        log.info('Probando registro de usuario...');
        log.info(`Email: ${testUser.email}`);
        
        const response = await axios.post(`${BASE_URL}/auth/register`, testUser);
        
        if (response.data.success && response.data.token) {
            authToken = response.data.token;
            log.success('Registro exitoso');
            log.info(`Token recibido: ${authToken.substring(0, 20)}...`);
            log.info(`Usuario: ${response.data.user.username}`);
            log.info(`Equipo: ${response.data.user.team_name}`);
            return true;
        } else {
            log.error('Registro falló');
            return false;
        }
    } catch (error) {
        if (error.response) {
            log.error(`Error en registro: ${error.response.data.message || error.message}`);
        } else {
            log.error(`Error en registro: ${error.message}`);
        }
        return false;
    }
}

// Test 4: Login de usuario
async function testLogin() {
    try {
        log.info('Probando login...');
        
        const response = await axios.post(`${BASE_URL}/auth/login`, {
            email: testUser.email,
            password: testUser.password
        });
        
        if (response.data.success && response.data.token) {
            authToken = response.data.token;
            log.success('Login exitoso');
            log.info(`Token recibido: ${authToken.substring(0, 20)}...`);
            log.info(`Bienvenido: ${response.data.user.full_name}`);
            return true;
        } else {
            log.error('Login falló');
            return false;
        }
    } catch (error) {
        if (error.response) {
            log.error(`Error en login: ${error.response.data.message || error.message}`);
        } else {
            log.error(`Error en login: ${error.message}`);
        }
        return false;
    }
}

// Test 5: Verificar token
async function testVerifyToken() {
    try {
        log.info('Verificando token...');
        
        const response = await axios.post(`${BASE_URL}/auth/verify-token`, {}, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.data.success) {
            log.success('Token válido');
            log.info(`Usuario verificado: ${response.data.user.username}`);
            return true;
        } else {
            log.error('Token inválido');
            return false;
        }
    } catch (error) {
        log.error(`Error verificando token: ${error.message}`);
        return false;
    }
}

// Test 6: Obtener perfil
async function testGetProfile() {
    try {
        log.info('Obteniendo perfil del usuario...');
        
        const response = await axios.get(`${BASE_URL}/users/profile`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.data.success) {
            log.success('Perfil obtenido');
            log.info(`Usuario: ${response.data.user.username}`);
            log.info(`Email: ${response.data.user.email}`);
            log.info(`Equipo: ${response.data.user.team_name}`);
            return true;
        } else {
            log.error('Error obteniendo perfil');
            return false;
        }
    } catch (error) {
        log.error(`Error obteniendo perfil: ${error.message}`);
        return false;
    }
}

// Ejecutar todos los tests
async function runAllTests() {
    console.log('\n🧪 INICIANDO TESTS DE AUTENTICACIÓN\n');
    console.log('='.repeat(50));
    
    const results = {
        total: 6,
        passed: 0,
        failed: 0
    };
    
    // Test 1: Servidor
    console.log('\n📡 Test 1: Estado del Servidor');
    if (await testServerStatus()) {
        results.passed++;
    } else {
        results.failed++;
        console.log('\n❌ Tests detenidos: servidor no disponible\n');
        return;
    }
    
    // Test 2: Equipos
    console.log('\n⚽ Test 2: Obtener Equipos');
    if (await testGetTeams()) {
        results.passed++;
    } else {
        results.failed++;
        log.warn('Continuando con tests de autenticación...');
    }
    
    // Test 3: Registro
    console.log('\n📝 Test 3: Registro de Usuario');
    if (await testRegister()) {
        results.passed++;
    } else {
        results.failed++;
        console.log('\n❌ Tests de autenticación detenidos\n');
        return;
    }
    
    // Test 4: Login
    console.log('\n🔐 Test 4: Login de Usuario');
    if (await testLogin()) {
        results.passed++;
    } else {
        results.failed++;
    }
    
    // Test 5: Verificar Token
    console.log('\n🎫 Test 5: Verificar Token');
    if (await testVerifyToken()) {
        results.passed++;
    } else {
        results.failed++;
    }
    
    // Test 6: Obtener Perfil
    console.log('\n👤 Test 6: Obtener Perfil');
    if (await testGetProfile()) {
        results.passed++;
    } else {
        results.failed++;
    }
    
    // Resultados finales
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 RESULTADOS DE LOS TESTS\n');
    console.log(`Total: ${results.total}`);
    log.success(`Pasados: ${results.passed}`);
    if (results.failed > 0) {
        log.error(`Fallidos: ${results.failed}`);
    }
    
    const percentage = ((results.passed / results.total) * 100).toFixed(1);
    console.log(`\nÉxito: ${percentage}%\n`);
    
    if (results.passed === results.total) {
        log.success('¡Todos los tests pasaron! ✨');
        log.info('El sistema de autenticación está funcionando correctamente');
    } else {
        log.warn('Algunos tests fallaron. Revisa los errores arriba.');
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
}

// Ejecutar
runAllTests().catch(error => {
    log.error(`Error ejecutando tests: ${error.message}`);
    process.exit(1);
});