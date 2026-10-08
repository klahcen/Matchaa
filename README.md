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

Credentials live only in local `.env` files. Git ignores every `.env` and
`.env.*` file; only the `.env.example` templates are committed.

`JWT_SECRET` and `DB_PASSWORD` are required and have no default: without them
the backend prints the missing variable names and refuses to start.

**Docker.** Compose reads the root `.env`. Its `POSTGRES_PASSWORD` sets the
database password and is passed to the backend as `DB_PASSWORD` (Compose also
refuses to start without it). The backend container loads `./.env`, then
`./Backend/.env` (both optional; the later file wins), and Compose sets
`DB_HOST`/`DB_PORT` to `matcha-pg:5432`. A minimal root `.env`:

```env
POSTGRES_PASSWORD=replace_with_a_local_password
JWT_SECRET=replace_with_a_long_random_secret
RESEND_API_KEY=replace_with_your_resend_key
```

PostgreSQL applies `POSTGRES_PASSWORD` only when its volume is first created.
If you change it later, either change it in the database with `ALTER USER`
or recreate the volume with `docker compose down -v`, which deletes all data.

**Backend on your machine.** It reads `Backend/.env`, then the root `.env`.
Set `DB_PASSWORD` to the same value as `POSTGRES_PASSWORD`, and use
`DB_PORT=5433` because Docker publishes PostgreSQL on host port `5433`:

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
```

Optional variables:

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_HOST_PORT` | `5433` | Host port that Docker publishes PostgreSQL on |
| `ADMINER_HOST_PORT` | `8080` | Host port that Docker publishes Adminer on |
| `CORS_ORIGIN` | `CLIENT_URL` | Allowed browser origins, comma-separated. `*` is ignored |
| `SEED_PASSWORD` | random | Password for seeded accounts. If unset, the seed script prints a random one |

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
