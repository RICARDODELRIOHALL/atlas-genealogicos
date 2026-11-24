# Árbol Genealógico Armando Amaya Romero

Aplicación independiente para la familia Armando Amaya Romero. Los datos de inicio están incluidos en esta compilación.

## Privacidad

Este proyecto contiene datos genealógicos en `src/data/atlas.json` y en el JavaScript generado. GitHub Pages es alojamiento público: cualquiera que conozca o encuentre la URL puede leer la información. No publiques datos de personas vivas o privados sin autorización expresa. Ocultar la URL no restringe el acceso.

## Actualizaciones y datos locales

Al abrir por primera vez, la app copia el JSON incluido a IndexedDB. Las futuras actualizaciones del sitio no sustituyen ni fusionan automáticamente esos datos locales; se conservan los cambios realizados en el dispositivo. Para obtener el árbol nuevo incluido en una versión, descarga primero una copia de seguridad y usa **Datos → Restaurar datos originales incluidos**.

URL prevista: `https://USUARIO.github.io/familia-armando-amaya-romero/`

Base de publicación: `/familia-armando-amaya-romero/`. Cambia el usuario o propietario al crear el repositorio. El flujo de Pages ya está en `.github/workflows/deploy.yml`.

Instala dependencias con `npm ci` y crea la carpeta `dist/` con `npm run build`.
