COMPOSE := docker compose
DB_SERVICE := db
BACKEND_SERVICE := backend
DB_USER := postgres
DB_NAME := matcha_db
SEED_COUNT ?= 500

.PHONY: help run setup up start cert cert-info urls build rebuild migrate seed logs down restart ps

help:
	@echo "Matcha local commands"
	@echo ""
	@echo "  make run       Start Docker from local images, run migrations, seed 500 users, then show logs"
	@echo "  make setup     Start Docker from local images, run migrations, and seed 500 users"
	@echo "  make up        Start all Docker services in the background without rebuilding"
	@echo "  make cert      Generate an HTTPS certificate for localhost and your current LAN IP"
	@echo "  make cert-info Show how to trust the local certificate authority on other devices"
	@echo "  make urls      Show the app addresses, including the one for other devices on your network"
	@echo "  make build     Build Docker images (requires Docker Hub/network if base images are missing)"
	@echo "  make rebuild   Build images, then start all Docker services"
	@echo "  make migrate   Apply Backend/migrations/*.sql to the database"
	@echo "  make seed      Create fake users; override count with SEED_COUNT=100"
	@echo "  make logs      Follow backend and frontend logs"
	@echo "  make down      Stop and remove containers"
	@echo "  make restart   Restart all Docker services"
	@echo "  make ps        Show Docker service status"

run: setup logs

setup: start migrate seed urls

# Keep an existing database in sync with the code on every normal start.
up: start migrate urls

# `up` without printing the addresses (used by `setup`, which prints them at the end).
start: cert
	$(COMPOSE) up -d --wait

cert:
	@./scripts/generate-dev-cert.sh

cert-info:
	@echo ""
	@echo "  Trust this local certificate authority on every device that opens Matcha:"
	@echo "  $(CURDIR)/.certs/matcha-local-ca.pem"
	@echo ""
	@echo "  macOS: double-click the file, add it to the System keychain, then set it to Always Trust."
	@echo "  iPhone/iPad: AirDrop the file, install the downloaded profile, then enable it under"
	@echo "               Settings > General > About > Certificate Trust Settings."
	@echo "  Android: install it from Settings > Security > Encryption & credentials > Install a certificate."
	@echo ""
	@echo "  Keep .certs/matcha-local-ca.key private. Never copy or commit that file."
	@echo ""

# Local and network addresses. The network IP is the host's default-route
# interface (macOS: route/ipconfig; Linux: hostname -I, then ip route).
urls:
	@front=$$($(COMPOSE) port frontend 5173 2>/dev/null | sed 's/.*://'); \
	adminer=$$($(COMPOSE) port adminer 8080 2>/dev/null | sed 's/.*://'); \
	ip=""; \
	if command -v ipconfig >/dev/null 2>&1 && command -v route >/dev/null 2>&1; then \
		iface=$$(route -n get default 2>/dev/null | awk '/interface:/{print $$2}'); \
		[ -n "$$iface" ] && ip=$$(ipconfig getifaddr "$$iface" 2>/dev/null); \
	fi; \
	[ -z "$$ip" ] && ip=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
	[ -z "$$ip" ] && ip=$$(ifconfig 2>/dev/null | awk '/inet / && $$2 !~ /^127\./ && $$2 !~ /^169\.254\./ {print $$2; exit}'); \
	[ -z "$$ip" ] && ip=$$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($$i == "src") print $$(i + 1)}'); \
	echo ""; \
	echo "  Matcha is running"; \
	echo "  ------------------------------------------------------------"; \
	scheme=http; [ -f .certs/dev-cert.pem ] && scheme=https; \
	echo "  This computer   $$scheme://localhost:$${front:-5173}"; \
	if [ -n "$$ip" ]; then \
		echo "  Your network    $$scheme://$$ip:$${front:-5173}   (phones, other laptops)"; \
	else \
		echo "  Your network    no network address found (are you offline?)"; \
	fi; \
	echo "  Adminer         http://localhost:$${adminer:-8080}   (this computer only)"; \
	echo ""; \
	if [ "$$scheme" = https ]; then \
		echo "  HTTPS is enabled. Run 'make cert-info' to trust the local CA on each device."; \
	else \
		echo "  HTTPS is not configured. Run 'make cert', then restart the frontend."; \
	fi; \
	echo ""

build:
	$(COMPOSE) build

rebuild: build up

migrate:
	@for file in Backend/migrations/*.sql; do \
		echo "Applying $$file"; \
		$(COMPOSE) exec -T $(DB_SERVICE) psql -U $(DB_USER) -d $(DB_NAME) < "$$file"; \
	done

seed:
	$(COMPOSE) exec -T $(BACKEND_SERVICE) npm run seed:fake -- --count $(SEED_COUNT) --wipe

logs:
	$(COMPOSE) logs -f backend frontend

down:
	$(COMPOSE) down

restart: cert
	$(COMPOSE) restart
	@$(MAKE) --no-print-directory urls

ps:
	$(COMPOSE) ps
