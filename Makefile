COMPOSE := docker compose
DB_SERVICE := db
BACKEND_SERVICE := backend
DB_USER := postgres
DB_NAME := matcha_db
SEED_COUNT ?= 500

.PHONY: help run setup up build rebuild migrate seed logs down restart ps

help:
	@echo "Matcha local commands"
	@echo ""
	@echo "  make run       Start Docker from local images, run migrations, seed 500 users, then show logs"
	@echo "  make setup     Start Docker from local images, run migrations, and seed 500 users"
	@echo "  make up        Start all Docker services in the background without rebuilding"
	@echo "  make build     Build Docker images (requires Docker Hub/network if base images are missing)"
	@echo "  make rebuild   Build images, then start all Docker services"
	@echo "  make migrate   Apply Backend/migrations/*.sql to the database"
	@echo "  make seed      Create fake users; override count with SEED_COUNT=100"
	@echo "  make logs      Follow backend and frontend logs"
	@echo "  make down      Stop and remove containers"
	@echo "  make restart   Restart all Docker services"
	@echo "  make ps        Show Docker service status"

run: setup logs

setup: up migrate seed

up:
	$(COMPOSE) up -d --wait

build:
	$(COMPOSE) build

rebuild: build up

migrate:
	@for file in Backend/migrations/*.sql; do \
		echo "Applying $$file"; \
		$(COMPOSE) exec -T $(DB_SERVICE) psql -U $(DB_USER) -d $(DB_NAME) < "$$file"; \
	done

seed:
	$(COMPOSE) exec $(BACKEND_SERVICE) npm run seed:fake -- --count $(SEED_COUNT) --wipe

logs:
	$(COMPOSE) logs -f backend frontend

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

ps:
	$(COMPOSE) ps
