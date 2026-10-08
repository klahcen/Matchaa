# Matcha

Matcha is a full-stack dating application built with React, Express, TypeScript,
PostgreSQL, and Socket.IO. It includes account verification, profile discovery,
advanced search, likes, profile views, real-time chat, notifications, and date
proposals.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express 5, TypeScript
- **Database:** PostgreSQL
- **Real-time features:** Socket.IO
- **Email:** Resend
- **Development:** Docker Compose

## Project structure

```text
Matchaa/
├── Backend/          # REST API, Socket.IO server, migrations, and seed scripts
├── Frontend/         # React application
├── docker-compose.yml
├── schema.sql        # Initial database schema
├── Makefile          # Docker, migration, and seed shortcuts
└── package.json      # Root development scripts
```

## Prerequisites

- Node.js 22 or newer
- npm
- Docker and Docker Compose
- GNU Make (optional, for the Makefile commands)

## Environment configuration

Create `Backend/.env` and keep it out of version control:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=replace_with_a_local_password
DB_NAME=matcha_db

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=24h

RESEND_API_KEY=replace_with_your_resend_key
MAIL_FROM=onboarding@resend.dev

APP_URL=http://localhost:3000
CLIENT_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

When the backend runs directly on your machine, use `DB_PORT=5433` because
Docker publishes PostgreSQL on host port `5433`. When the backend runs inside
Docker, Compose overrides the database connection to `matcha-pg:5432`.

Create the frontend environment file:

```bash
cp Frontend/.env.example Frontend/.env
```

Generate a JWT secret with:

```bash
openssl rand -hex 64
```

The Resend variables are required for verification and password-reset emails.
With a Resend sandbox sender, delivery is limited to addresses allowed by your
Resend account.

## Local development

Install all dependencies:

```bash
npm install
npm --prefix Backend install
npm --prefix Frontend install
```

Start PostgreSQL:

```bash
npm run dev:db
```

The schema is loaded automatically the first time the PostgreSQL volume is
created. To apply all later migrations manually:

```bash
for file in Backend/migrations/*.sql; do
  docker compose exec -T db psql -U postgres -d matcha_db < "$file"
done
```

Start the backend and frontend together:

```bash
npm run dev
```

Open the application at [http://localhost:5173](http://localhost:5173). The API
runs at [http://localhost:3000/api](http://localhost:3000/api), and its health
endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).
Adminer is available at [http://localhost:8080](http://localhost:8080) when its
Compose service is running.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the backend and frontend in watch mode |
| `npm run dev:backend` | Run only the backend |
| `npm run dev:frontend` | Run only the frontend |
| `npm run dev:db` | Start only PostgreSQL |
| `npm run db:stop` | Stop PostgreSQL |
| `npm run db:logs` | Follow PostgreSQL logs |
| `npm --prefix Backend run typecheck` | Type-check the backend |
| `npm --prefix Frontend run lint` | Lint the frontend |
| `npm --prefix Frontend run build` | Build the frontend |

## Docker workflow

The Makefile provides shortcuts for running the complete stack:

```bash
make build       # Build the application images
make setup       # Start services, apply migrations, and seed sample users
make logs        # Follow application logs
make down        # Stop and remove containers
```

Use a different number of generated profiles with:

```bash
make seed SEED_COUNT=100
```

Seed data is for local development only. The seed script's optional
`PEXELS_API_KEY` is used to obtain profile images and is not used by the running
application.

## Production notes

- Replace every development password and secret.
- Restrict `CORS_ORIGIN` to the deployed frontend origin.
- Configure a verified email domain in Resend.
- Serve the application over HTTPS and place the API behind a trusted proxy.
- Set `TRUSTED_PROXIES` only to the proxy IP addresses or CIDR ranges you use.
- Store uploaded files in persistent storage.

## License

No license has been specified for this project.
