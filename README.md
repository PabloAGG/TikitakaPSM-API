# TikiTaka API - Backend para la aplicación TikiTaka

API REST desarrollada con Node.js y Express.js para la aplicación móvil TikiTaka, una red social de fútbol donde los usuarios pueden crear posts, seguir equipos y interactuar con otros fanáticos.

## 🚀 Características

- **Autenticación JWT**: Sistema completo de registro, login y verificación de tokens
- **Gestión de Usuarios**: Perfiles, edición, búsqueda y subida de imágenes
- **Posts y Contenido**: Creación, edición, eliminación de posts con soporte para imágenes
- **Sistema de Likes y Favoritos**: Interacciones sociales completas
- **Equipos de Fútbol**: 35 equipos de diferentes confederaciones
- **Borradores**: Sistema de guardado de posts como borradores
- **Búsqueda**: Búsqueda de usuarios, equipos y contenido
- **Estadísticas**: Equipos populares, usuarios activos, etc.

## 🛠️ Tecnologías

- **Node.js** - Entorno de ejecución
- **Express.js** - Framework web
- **MySQL** - Base de datos relacional
- **JWT** - Autenticación y autorización
- **Bcrypt** - Encriptación de contraseñas
- **Multer** - Subida de archivos
- **Express Validator** - Validación de datos
- **Helmet** - Seguridad HTTP
- **CORS** - Cross-Origin Resource Sharing
- **Rate Limiting** - Limitación de peticiones

## 📋 Prerrequisitos

- Node.js (v14 o superior)
- MySQL (v8.0 o superior)
- npm o yarn

## 🔧 Instalación

1. **Clonar el repositorio**
```bash
cd tikitaka-api
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```

Editar el archivo `.env` con tus configuraciones:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=tikitaka_db
JWT_SECRET=tu_clave_secreta_muy_segura
```

4. **Configurar la base de datos**
- Crear la base de datos MySQL
- Ejecutar el script SQL `tikitaka_database.sql` para crear las tablas
- Insertar los datos de equipos usando el script incluido

5. **Crear directorios de uploads**
```bash
mkdir -p uploads/profiles
mkdir -p uploads/posts
```

## 🚀 Uso

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 📚 API Endpoints

### Autenticación
- `POST /api/auth/register` - Registro de usuario
- `POST /api/auth/login` - Inicio de sesión
- `POST /api/auth/verify-token` - Verificar token
- `POST /api/auth/refresh-token` - Refrescar token

### Usuarios
- `GET /api/users/profile` - Obtener perfil propio
- `GET /api/users/:id` - Obtener perfil de usuario
- `PUT /api/users/profile` - Actualizar perfil
- `POST /api/users/upload-avatar` - Subir imagen de perfil
- `PUT /api/users/change-password` - Cambiar contraseña
- `GET /api/users/search` - Buscar usuarios

### Posts
- `GET /api/posts` - Obtener feed de posts
- `GET /api/posts/user/:userId` - Posts de un usuario
- `GET /api/posts/drafts` - Obtener borradores
- `GET /api/posts/favorites` - Posts favoritos
- `POST /api/posts` - Crear post
- `PUT /api/posts/:id` - Actualizar post
- `DELETE /api/posts/:id` - Eliminar post
- `POST /api/posts/:id/like` - Dar/quitar like
- `POST /api/posts/:id/favorite` - Agregar/quitar favorito
- `POST /api/posts/upload` - Subir imagen para post

### Equipos
- `GET /api/teams` - Obtener todos los equipos
- `GET /api/teams/:id` - Información de equipo
- `GET /api/teams/:id/posts` - Posts de un equipo
- `GET /api/teams/:id/fans` - Fans de un equipo
- `GET /api/teams/confederation/:confederation` - Equipos por confederación
- `GET /api/teams/search` - Buscar equipos
- `GET /api/teams/stats/popular` - Equipos populares
- `GET /api/teams/stats/active` - Equipos con más actividad

## 🔐 Autenticación

La API utiliza JWT (JSON Web Tokens) para la autenticación. Para acceder a endpoints protegidos, incluye el token en el header:

```
Authorization: Bearer tu_jwt_token
```

## 📝 Estructura de Respuestas

Todas las respuestas siguen el formato:

```json
{
  "success": true|false,
  "message": "Mensaje descriptivo",
  "data": "Datos solicitados (opcional)",
  "errors": "Array de errores (opcional)"
}
```

## 🎯 Equipos Disponibles

La API incluye 35 equipos de fútbol organizados por confederaciones:

### UEFA (Europa)
- Real Madrid, FC Barcelona, Manchester United, Liverpool, etc.

### CONMEBOL (Sudamérica)
- Boca Juniors, River Plate, Flamengo, Santos, etc.

### CONCACAF (Norte y Centroamérica)
- Club América, Chivas, LA Galaxy, etc.

### CAF, AFC, OFC
- Al-Hilal, Urawa Red Diamonds, Auckland City

## 🔒 Seguridad

- **Helmet**: Protección de headers HTTP
- **CORS**: Configuración de origins permitidos
- **Rate Limiting**: Limitación de peticiones por IP
- **Bcrypt**: Encriptación de contraseñas
- **JWT**: Tokens seguros con expiración
- **Validación**: Validación estricta de todos los inputs

## 📁 Estructura del Proyecto

```
tikitaka-api/
├── config/
│   └── database.js          # Configuración de MySQL
├── middleware/
│   └── auth.js              # Middleware de autenticación
├── routes/
│   ├── auth.js              # Rutas de autenticación
│   ├── users.js             # Rutas de usuarios
│   ├── posts.js             # Rutas de posts
│   └── teams.js             # Rutas de equipos
├── uploads/                 # Archivos subidos
│   ├── profiles/            # Imágenes de perfil
│   └── posts/               # Imágenes de posts
├── .env.example             # Variables de entorno de ejemplo
├── package.json             # Dependencias
└── server.js                # Punto de entrada
```

## 🐛 Resolución de Problemas

### Error de conexión a MySQL
- Verificar que MySQL esté ejecutándose
- Comprobar credenciales en el archivo `.env`
- Asegurar que la base de datos existe

### Error de permisos de archivos
- Verificar permisos de escritura en directorio `uploads/`
- Crear directorios manualmente si es necesario

### Error de JWT
- Verificar que `JWT_SECRET` esté configurado
- Comprobar que el token no haya expirado

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama para feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo `LICENSE` para detalles.

## 👥 Autor

Desarrollado para el proyecto TikiTaka PSM

## 📞 Soporte

Para soporte, crear un issue en el repositorio o contactar al equipo de desarrollo.