# Arina — ERP para negocio de comidas

Aplicación de gestión con cinco módulos: **Productos**, **Recetas**, **Materia prima**, **Clientes** y **Ventas y Caja**.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Base de datos | SQLite (archivo `backend/prisma/arina.db`) |
| ORM | Prisma |
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Estado/datos | TanStack Query |
| Escritorio | Tauri 2 |

## Desarrollo

```bash
# Instalar dependencias (una sola vez)
yarn install                 # raíz (tauri-cli + concurrently)
yarn --cwd backend install
yarn --cwd frontend install

# Crear/actualizar la base de datos
yarn --cwd backend db:push

# Levantar backend (puerto 3001) + frontend (puerto 5173) juntos
yarn dev
```

Abrí http://localhost:5173 en el navegador.

## PWA (usar desde el navegador o el teléfono)

```bash
yarn web   # compila todo y sirve la app completa en el puerto 3001
```

El backend sirve el frontend compilado como PWA instalable. Al arrancar imprime las
direcciones disponibles:

- En la PC: http://localhost:3001 — Chrome/Edge muestran el botón «Instalar» en la
  barra de direcciones (queda como app con su ícono, ventana propia y todo).
- Desde el teléfono (misma red WiFi): http://IP-DE-TU-PC:3001 (la IP aparece en la
  consola al arrancar). Funciona completo en el navegador.

> Limitación de los navegadores: la instalación como app («Agregar a pantalla de
> inicio» con service worker) requiere HTTPS o localhost. En la PC instala sin
> problema; desde el teléfono por HTTP de red local se usa como página web normal.
> Si querés instalarla también en el teléfono, las opciones son un túnel tipo
> Tailscale/ngrok o un proxy HTTPS local (Caddy).

El service worker solo cachea la interfaz (los datos de la API siempre van al
servidor), así que nunca vas a ver stock o precios viejos.

## App de escritorio (Tauri)

Requiere Rust (`cargo`) y las dependencias de sistema de Tauri (webkit2gtk en Linux).

```bash
yarn tauri dev   # desarrollo: levanta backend + frontend y abre la ventana
yarn dist        # producción: empaqueta el backend y genera .deb y .AppImage
```

Los instalables quedan en `src-tauri/target/release/bundle/`.

El backend va **embebido**: `yarn --cwd backend package` compila el servidor Node a
un binario único (esbuild + pkg) y lo deja gzipeado en
`src-tauri/resources/arina-backend.gz`. Al abrir la app instalada, Tauri lo
descomprime al directorio de datos, lo lanza, y el kernel lo termina junto con la
app (`PR_SET_PDEATHSIG`).

Detalles de implementación que conviene no tocar:

- El backend viaja **gzipeado como recurso** y no como `externalBin`: tanto el
  bundler de Tauri (strip) como linuxdeploy (patchelf) modifican los ELF de
  `externalBin`/`usr/bin` y eso destruye el payload que pkg agrega al final del
  binario.
- `yarn dist` usa `NO_STRIP=true` porque el `strip` viejo que trae linuxdeploy no
  entiende las secciones `.relr.dyn` de las libs de Arch y aborta el AppImage.
- La base vive en `~/.local/share/com.arina.erp/arina.db` (primer arranque: se copia
  desde la plantilla vacía `src-tauri/resources/arina-template.db`). El log del
  backend queda al lado, en `backend.log`.
- El query engine de Prisma se incluye como recurso y se inyecta vía
  `PRISMA_QUERY_ENGINE_LIBRARY`.
- Si cambiás el esquema de Prisma, regenerá la plantilla (base vacía) además de
  correr `yarn dist`.

## Cómo se conectan los módulos

- **Materia prima → Recetas**: el costo de cada receta se calcula con el último
  precio pagado por unidad de cada insumo. Registrar una compra actualiza ese costo.
- **Materia prima → Caja**: cada compra registrada aparece como gasto en la caja.
- **Ventas → Productos**: cada venta descuenta stock del producto; anular una venta lo repone.
- **Ventas → Clientes**: la venta puede asociarse a un cliente (o dejarse en blanco)
  y aparece en su historial de compras.
- **Caja**: ingresos (ventas) − gastos (compras de insumos), filtrable por hoy,
  semana, mes o rango de fechas.

## API

Base: `http://localhost:3001/api`

- `GET/POST /categories`, `DELETE /categories/:id`
- `GET/POST /products`, `PUT/DELETE /products/:id`, `POST /products/bulk-increase` (`{percent, categoryId?}`)
- `GET/POST /raw-materials`, `PUT/DELETE /raw-materials/:id`, `POST /raw-materials/:id/purchases`
- `GET/POST /recipes`, `PUT/DELETE /recipes/:id` (incluyen `totalCost` y `costPerUnit` calculados)
- `GET/POST /clients`, `PUT/DELETE /clients/:id`, `GET /clients/:id/sales`
- `GET/POST /sales` (`?from&to`), `DELETE /sales/:id` (anula y repone stock)
- `GET /cash?from&to` → `{income, expenses, balance, sales, purchases}`

# Cómo trabajar desde otra PC / IDE / IA en el futuro
En cualquier máquina con Git y Node.js:

git clone git@github.com:ezequielarcos-crypto/arina.git
cd arina
yarn install --cwd backend && yarn install --cwd frontend
yarn --cwd backend db:push
yarn dev
Y para guardar cambios que hagas más adelante:


git add -A
git commit -m "descripción de lo que cambiaste"
git push

