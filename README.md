# Sistema de Gestión de Calificaciones - E.E.S.T. Nº 6

Sistema web para gestionar calificaciones de estudiantes a partir de archivos Excel.

## Características

- ✅ Carga múltiple de archivos Excel
- ✅ Extracción automática de información de curso y estudiantes
- ✅ Búsqueda por estudiante o materia
- ✅ Filtros por curso y tipo de calificación
- ✅ Estadísticas de aprobados/desaprobados
- ✅ Diseño acorde al logo institucional
- ✅ Responsive design

## Estructura de Excel Esperada

- **Fila 7**: Información del curso (AÑO: X SECCIÓN: Y)
- **Columna B**: Nombres de estudiantes
- **Columna I**: 1º Valoración Preliminar
- **Columna J**: Calificación 1º Cuatrimestre
- **Columna Q**: 2º Valoración Preliminar
- **Columna R**: Calificación 2º Cuatrimestre
- **Columna W**: Calificación Final

## Instalación

1. Clona el repositorio
2. Instala dependencias: `npm install`
3. Ejecuta en desarrollo: `npm run dev`
4. Para producción: `npm run build && npm start`

## Despliegue en Netlify

1. Conecta tu repositorio de GitHub con Netlify
2. Configura el comando de build: `npm run build`
3. Directorio de publicación: `.next`
4. Despliega automáticamente

## Uso

1. Sube archivos Excel usando el área de carga
2. Usa los filtros para buscar información específica
3. Navega entre las pestañas para ver calificaciones, estudiantes y estadísticas
4. Los archivos se procesan automáticamente según la estructura esperada
