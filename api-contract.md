# Shared website and mobile API contract

The mobile client uses the website server origin configured by `EXPO_PUBLIC_API_URL`. The website implements mobile Google sign-in and bearer session routes. Its catalog API and shared server-side bag are not implemented yet; the browser storefront still keeps its bag in `localStorage`.

## Authentication

- `POST /auth/mobile/google` accepts `{ "idToken": "..." }` and returns `{ "token": "...", "user": { "id", "name", "email", "picture" } }`. This route is implemented by the website server.
- Validate the Google ID token signature, issuer, expiry, verified email, and audience. Allow only the website Web OAuth client and the configured iOS and Android client IDs.
- Resolve `google_sub` to the same `public.users` row as `/auth/google/callback`; do not create a separate mobile user for the same Google account.
- Issue an unpredictable, expiring bearer token tied to that user. The current server keeps the token in its in-memory session map; use persistent hashed session storage before running multiple server instances.
- `GET /auth/me` accepts the bearer token and returns `{ "user": ... }`; `POST /auth/logout` revokes it. Both routes accept mobile bearer sessions as well as the website's existing HTTP-only cookie session. These sessions resolve to the same user but are held in server memory and expire after seven days.

## Catalog

- `GET /api/products` returns `{ "products": [...] }` with the same numeric product IDs and fields used by the current website catalog: `id`, `name`, `detail`, `category`, `price`, `color`, `badge`, and `image`.
- Keep IDs stable: the app posts a product ID when adding it to the bag. The initial mobile catalog mirrors the website's current eight products.

## Shared bag

All cart routes require `Authorization: Bearer <token>`. The website must identify its user from its cookie session. Both authentication methods read and write one server-side cart keyed to the same `public.users.id`.

- `GET /api/cart` returns `{ "items": [{ "id", "name", "detail", "category", "price", "color", "badge", "image", "qty" }] }`.
- `POST /api/cart/items` accepts `{ "productId": 1, "quantity": 1 }`. Add the quantity to the existing quantity and return the full cart as `{ "items": [...] }`.
- `PUT /api/cart/items/:productId` accepts `{ "quantity": 2 }`. Replace the quantity; zero removes the item. Return the full cart.
- Validate product IDs and positive integer quantities, and derive product data and price from the server catalog rather than trusting client-submitted prices.
- Change the website's `app.js` cart reads and writes to these endpoints for signed-in users. For signed-out visitors it may keep a temporary local bag, then merge that bag into the account cart at sign-in. Do not keep two separate signed-in carts.

The app polls `GET /api/cart` approximately every 1.2 seconds while signed in. Website changes therefore appear on the next poll. For lower latency at scale, add server-sent events or a realtime subscription and keep the read endpoint as recovery/resync.

## Security and deployment

- Serve the API over HTTPS outside local development.
- Return JSON errors with a useful `error` field and appropriate HTTP status codes.
- Apply per-user authorization to every cart read and write. Never accept a user ID from the client as the cart owner.
- If the website and API use different origins in the browser, configure CORS for the website origin and credentials as appropriate. The mobile bearer API itself does not rely on browser cookies.
