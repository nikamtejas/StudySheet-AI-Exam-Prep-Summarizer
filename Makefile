.PHONY: install dev dev-backend dev-frontend verify test lint typecheck up down logs clean

install:
	cd backend && npm install
	cd frontend && npm install

# Runs the api, the worker, and the frontend dev server together.
# Ctrl+C stops all three.
dev:
	@trap 'kill 0' EXIT INT TERM; \
	(cd backend && npm run dev:api) & \
	(cd backend && npm run dev:worker) & \
	(cd frontend && npm run dev) & \
	wait

dev-backend:
	@trap 'kill 0' EXIT INT TERM; \
	(cd backend && npm run dev:api) & \
	(cd backend && npm run dev:worker) & \
	wait

dev-frontend:
	cd frontend && npm run dev

# Lint + typecheck + test, in both folders. This is the CI gate, runnable locally.
verify:
	cd backend && npm run verify
	cd frontend && npm run verify

test:
	cd backend && npm run test
	cd frontend && npm run test

lint:
	cd backend && npm run lint
	cd frontend && npm run lint

typecheck:
	cd backend && npm run typecheck
	cd frontend && npm run typecheck

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

clean:
	rm -rf backend/dist backend/node_modules frontend/.next frontend/node_modules
