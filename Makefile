# ChefMind — Steuerung der lokalen Entwicklung.
#
#   make          zeigt alle Befehle
#   make up       vom frischen Checkout zur laufenden App
#
# Alle Ziele sind aus jedem Zustand heraus aufrufbar: fehlende Abhängigkeiten,
# eine fehlende .env oder eine leere Datenbank werden angelegt, statt mit einem
# Fehler abzubrechen.

PORT     ?= 3000
BASE_URL := http://localhost:$(PORT)
DB       ?= data/chefmind.db

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Docker-Daemon oder Podman — je nachdem, was auf diesem Rechner tatsächlich
# läuft. Ohne Prüfung scheitern die Container-Ziele mit einer nichtssagenden
# Socket-Fehlermeldung.
COMPOSE := $(shell \
	if docker info >/dev/null 2>&1; then echo "docker compose"; \
	elif command -v podman-compose >/dev/null 2>&1; then echo "podman-compose"; \
	else echo ""; fi)

.PHONY: help up dev stop restart open install env build start check test watch \
        typecheck lint fix migrate generate seed studio reset backup sql mcp \
        mcp-add mcp-desktop ai-check docker-build docker-up docker-down docker-logs \
        docker-shell clean clean-all require-compose

# Primäre LAN-Adresse dieses Rechners — für Clients auf anderen Geräten.
LAN_IP := $(shell ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($$i=="src") print $$(i+1)}')

## ---------------------------------------------------------------- Entwicklung

help: ## Diese Übersicht
	@echo ""
	@echo "  ChefMind — lokale Entwicklung"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} \
		/^## -+ / { sub(/^## -+ /, ""); printf "\n  \033[1m%s\033[0m\n", $$0; next } \
		/^[a-zA-Z_-]+:.*?## / { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""
	@echo -e "  Port ändern:  \033[36mmake dev PORT=4000\033[0m"
	@echo ""

up: install env migrate seed ## Erststart: alles einrichten und Server starten
	@echo ""
	@echo "  ChefMind läuft gleich auf $(BASE_URL)"
	@echo ""
	@echo "  Anschauen lohnt sich hier:"
	@echo "    $(BASE_URL)/                               Rezeptliste"
	@echo "    $(BASE_URL)/rezepte/kartoffelsuppe-mit-majoran"
	@echo "                                               Portionsregler — 4 auf 10 stellen"
	@echo "    $(BASE_URL)/rezepte/hefezopf               Backrezept mit exakten Mengen"
	@echo "    $(BASE_URL)/rezepte/kartoffelsuppe-mit-majoran/kochen"
	@echo "                                               Kochmodus, ein Schritt pro Bildschirm"
	@echo "    $(BASE_URL)/plan                           Wochenplan"
	@echo "    $(BASE_URL)/import                         Import aus URL, Foto oder Text"
	@echo ""
	@echo "  Beenden mit Strg-C."
	@echo ""
	@$(MAKE) --no-print-directory dev

dev: ## Entwicklungsserver starten (Vordergrund)
	npm run dev -- --port $(PORT)

stop: ## Laufenden Entwicklungsserver beenden
	@if command -v fuser >/dev/null 2>&1; then \
		fuser -k -n tcp $(PORT) >/dev/null 2>&1 && echo "  Port $(PORT) freigegeben." || echo "  Auf Port $(PORT) lief nichts."; \
	elif command -v lsof >/dev/null 2>&1; then \
		pids=$$(lsof -ti :$(PORT) 2>/dev/null); \
		if [ -n "$$pids" ]; then kill $$pids && echo "  Port $(PORT) freigegeben."; else echo "  Auf Port $(PORT) lief nichts."; fi; \
	else \
		echo "  Weder fuser noch lsof gefunden — bitte von Hand beenden."; \
	fi

restart: stop dev ## Server neu starten

open: ## App im Browser öffnen
	@command -v xdg-open >/dev/null 2>&1 && xdg-open $(BASE_URL) >/dev/null 2>&1 || echo "  $(BASE_URL)"

install: ## Abhängigkeiten installieren (nur wenn nötig)
	@if [ ! -d node_modules ]; then \
		echo "  Installiere Abhängigkeiten…"; \
		npm install; \
	else \
		echo "  Abhängigkeiten sind vorhanden."; \
	fi

env: ## .env aus .env.example anlegen (vorhandene bleibt unberührt)
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "  .env aus .env.example angelegt."; \
		echo "  Für Foto- und Textimport dort einen API-Key eintragen;"; \
		echo "  der URL-Import funktioniert auch ohne."; \
	else \
		echo "  .env ist vorhanden."; \
	fi

build: ## Produktionsbuild erzeugen
	npm run build

start: build migrate ## Produktionsbuild lokal starten
	npm start

## ------------------------------------------------------------------ Qualität

check: typecheck lint test ## Alles prüfen, was auch die CI prüft
	@echo ""
	@echo "  Alles grün."

test: ## Tests der Domain-Schicht
	npm test

watch: ## Tests im Watch-Modus
	npm run test:watch

typecheck: ## TypeScript prüfen
	npm run typecheck

lint: ## ESLint
	npm run lint

fix: ## ESLint mit --fix
	npx eslint . --fix

## ----------------------------------------------------------------- Datenbank

migrate: ## Ausstehende Migrationen anwenden
	@npm run --silent db:migrate

generate: ## Migration aus dem Schema erzeugen
	npm run db:generate

seed: ## Beispielrezepte anlegen (nur in eine leere Datenbank)
	@count=$$(sqlite3 $(DB) "select count(*) from recipes" 2>/dev/null || echo 0); \
	if [ "$$count" = "0" ]; then \
		npx tsx scripts/seed.ts; \
	else \
		echo "  Datenbank enthält bereits $$count Rezept(e) — nicht überschrieben."; \
	fi

studio: ## Drizzle Studio öffnen
	npm run db:studio

sql: ## SQLite-Shell auf der Datenbank
	@sqlite3 $(DB)

backup: ## Snapshot nach data/backups/ (im Betrieb sicher)
	@mkdir -p data/backups
	@sqlite3 $(DB) ".backup 'data/backups/chefmind-$$(date +%Y%m%d-%H%M%S).db'"
	@echo "  Gesichert nach data/backups/"

reset: ## Datenbank löschen und neu aufbauen (LÖSCHT ALLE REZEPTE)
	@echo "  Das löscht $(DB) samt aller Rezepte und Fotos."
	@read -p "  Wirklich? [j/N] " a; [ "$$a" = "j" ] || { echo "  Abgebrochen."; exit 1; }
	@$(MAKE) --no-print-directory backup 2>/dev/null || true
	rm -rf data/chefmind.db data/chefmind.db-wal data/chefmind.db-shm data/uploads
	@$(MAKE) --no-print-directory migrate
	@npx tsx scripts/seed.ts

## ----------------------------------------------------------------------- MCP

mcp: ## Prüfen, ob der MCP-Endpunkt antwortet, und Tools auflisten
	@curl -sf -X POST $(BASE_URL)/mcp \
		-H 'Content-Type: application/json' \
		-H 'Accept: application/json, text/event-stream' \
		-d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
		| sed 's/^data: //' \
		| python3 -c "import sys,json; \
			d=json.loads([l for l in sys.stdin if l.startswith('{')][0]); \
			t=d['result']['tools']; \
			print(f'  {len(t)} Tools verfügbar:'); \
			[print('   -', x['name']) for x in t]" \
		|| echo "  Keine Antwort. Läuft 'make dev'? Steht der Host in CHEFMIND_ALLOWED_HOSTS?"

mcp-add: ## Befehl zum Einbinden in Claude Code anzeigen
	@echo ""
	@echo "  Auf diesem Rechner:"
	@echo "    claude mcp add --transport http chefmind $(BASE_URL)/mcp"
	@if [ -n "$(LAN_IP)" ]; then \
		echo ""; \
		echo "  Von einem anderen Gerät im LAN:"; \
		echo "    claude mcp add --transport http chefmind http://$(LAN_IP):$(PORT)/mcp"; \
		echo "    (dann muss $(LAN_IP) in CHEFMIND_ALLOWED_HOSTS stehen)"; \
	fi
	@echo ""
	@echo "  Danach z. B.: \"Plane mir eine vegetarische Woche und mach die Einkaufsliste für 3 Personen.\""
	@echo ""

mcp-desktop: ## Claude-Desktop-Konfiguration zum Kopieren ausgeben
	@echo ""
	@echo "  Claude Desktop gibt es nur für macOS und Windows — es läuft also auf"
	@echo "  einem anderen Gerät als dieser Server hier."
	@echo ""
	@echo "  1. Diese Datei bearbeiten (Einstellungen > Entwickler > Konfiguration bearbeiten):"
	@echo "       macOS    ~/Library/Application Support/Claude/claude_desktop_config.json"
	@echo "       Windows  %APPDATA%\\Claude\\claude_desktop_config.json"
	@echo ""
	@echo "  2. Diesen Eintrag einfügen:"
	@echo ""
	@echo '    {'
	@echo '      "mcpServers": {'
	@echo '        "chefmind": {'
	@echo '          "command": "npx",'
	@echo '          "args": ['
	@echo '            "-y",'
	@echo '            "mcp-remote",'
	@echo '            "http://$(or $(LAN_IP),DEINE-SERVER-IP):$(PORT)/mcp",'
	@echo '            "--allow-http",'
	@echo '            "--transport", "http-only"'
	@echo '          ]'
	@echo '        }'
	@echo '      }'
	@echo '    }'
	@echo ""
	@echo "  3. Claude Desktop vollständig beenden und neu starten."
	@echo ""
	@echo "  Aus dem LAN oder über Tailscale ist nichts weiter zu konfigurieren:"
	@echo "  der Container veröffentlicht den Port auf allen Interfaces, und private"
	@echo "  Adressen sind erlaubt. Nur eine eigene Domain braucht einen Eintrag in"
	@echo "  CHEFMIND_ALLOWED_HOSTS."
	@echo ""
	@echo "  Erreichbarkeit vom anderen Gerät aus prüfen:"
	@echo "    curl http://$(or $(LAN_IP),DEINE-SERVER-IP):$(PORT)/api/health"
	@echo ""

ai-check: ## KI-Anbieter live testen (ein kurzer Aufruf, Bruchteile eines Cents)
	@npx tsx --env-file=.env scripts/ai-check.ts

## ------------------------------------------------------------------ Container

require-compose:
	@if [ -z "$(COMPOSE)" ]; then \
		echo "  Kein laufender Docker-Daemon und kein podman-compose gefunden."; \
		echo "  Docker starten mit: sudo systemctl start docker"; \
		exit 1; \
	fi

docker-build: require-compose ## Container-Image bauen
	$(COMPOSE) build

docker-up: require-compose ## Container starten (wie auf dem Server)
	$(COMPOSE) up -d --build
	@echo "  Läuft auf http://127.0.0.1:3000 — Logs mit 'make docker-logs'."

docker-down: require-compose ## Container stoppen
	$(COMPOSE) down

docker-logs: require-compose ## Container-Logs verfolgen
	$(COMPOSE) logs -f chefmind

docker-shell: require-compose ## Shell im laufenden Container
	$(COMPOSE) exec chefmind sh

## ------------------------------------------------------------------ Aufräumen

clean: ## Build-Artefakte entfernen
	rm -rf .next coverage *.tsbuildinfo
	@echo "  Build-Artefakte entfernt. Daten und node_modules bleiben."

clean-all: clean ## Zusätzlich node_modules entfernen
	rm -rf node_modules
	@echo "  node_modules entfernt — 'make install' baut sie neu auf."
