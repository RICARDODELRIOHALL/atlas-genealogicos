# Project notes

- This is an independent static React + Vite app. Do not connect it to Lovable, a remote database, or paid APIs.
- `src/data/atlas.json` must remain an empty valid dataset. Never commit a real family tree or private export.
- `src/lib/genealogy/store.ts` owns the independent IndexedDB database name. Do not migrate data from another atlas database.
- Keep genealogy imports, exports, relationships, and original source records intact. Do not invent facts or relationships.
- This is the permanent blank master; its `src/data/app-config.json` is a neutral default.
- New family apps are configured by `../fabrica_genealogica/generate-app.mjs` with an app-specific GitHub Pages path, PWA identity, cache, viewport key, and IndexedDB name.
- Never place family data in this master. Do not publish without explicit authorization.
