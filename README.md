# Angular TODO + Express API

This repository contains:

- an Angular TODO application with a clean UI
- an Express REST API backed by SQLite
- Google OAuth2 login (per-user TODO lists)

## Prerequisites

- Node.js 20+
- A Google OAuth2 Web Client ID

## Install

```bash
npm ci
```

## Run the API

```bash
GOOGLE_CLIENT_ID="<your-client-id>" npm run start:server
```

The API runs on `http://localhost:3000`.

## Run the Angular app

```bash
npm run start
```

The app runs on `http://localhost:4200` and proxies `/api` to the Express server.

## REST API

All TODO endpoints require an `Authorization` header containing a Google ID token.

- `GET /api/config`
- `GET /api/me`
- `GET /api/todos`
- `POST /api/todos` `{ "title": "..." }`
- `PATCH /api/todos/:id` `{ "completed": true|false }`
- `DELETE /api/todos/:id`

TODOs are scoped by the authenticated Google user (`sub` claim).

## Tests

```bash
npm run test -- --watch=false
```

## Build

```bash
npm run build
```
