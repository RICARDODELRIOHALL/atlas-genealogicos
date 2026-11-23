# Árbol Genealógico Jaime del Río Castillo

Aplicación independiente para la familia Del Río Castillo. Los datos de inicio están incluidos en esta compilación.

## Privacidad

Este proyecto contiene datos genealógicos en `src/data/atlas.json` y en el JavaScript generado. GitHub Pages es alojamiento público: cualquiera que conozca o encuentre la URL puede leer la información. No publiques datos de personas vivas o privados sin autorización expresa. Ocultar la URL no restringe el acceso.

## Actualizaciones y datos locales

Al abrir por primera vez, la app copia el JSON incluido a IndexedDB. Las futuras actualizaciones del sitio no sustituyen ni fusionan automáticamente esos datos locales; se conservan los cambios realizados en el dispositivo. Para obtener el árbol nuevo incluido en una versión, descarga primero una copia de seguridad y usa **Datos → Restaurar datos originales incluidos**.

URL pública: `https://ricardodelriohall.github.io/atlas-genealogicos/familia-del-rio-castillo/`

Ruta base de publicación: `/familia-del-rio-castillo/`. El repositorio central compila esta carpeta y publica la app en GitHub Pages.

Instala dependencias con `npm ci` y crea la carpeta `dist/` con `npm run build`.
