# Development Guide — Automation OS

This guide will help you set up, develop, and test Automation OS locally on your computer.

## 1. Prerequisites

Before setting up the project, make sure you have the following installed:
* **Node.js** (v18.0.0 or higher)
* **Redis Server** (for BullMQ queues)
* **Python** (v3.8+; required only if running native `pywinauto` adapters)
* **Java** (v11+; required only if running visual `OculiX` automation modules)

---

## 2. Installation and Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/automation-os/automation-os.git
   cd automation-os
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```

3. **Install Dependencies:**
   ```bash
   npm install
   ```

---

## 3. Running Services Locally

Since the stack consists of multiple microservices and workers, you can run them concurrently during development.

### Running with Docker Compose (Recommended)
```bash
docker-compose up --build
```

### Running Manually
For individual package development, you can spin up the required backing engines and start specific directories:

1. **Start Redis Server:**
   ```bash
   redis-server
   ```

2. **Start Services:**
   * Gateway: `npm run dev --workspace=apps/gateway`
   * Auth Service: `npm run dev --workspace=services/auth-service`
   * Automation Service: `npm run dev --workspace=services/automation-service`
   * Worker: `npm run dev --workspace=workers/automation-worker`

---

## 4. Local Execution Mocks (Headless Testing)

When developing or running in continuous integration, you can toggle the mock engine mode in `.env`:
```ini
USE_MOCK_ADAPTER=true
```
This forces the worker to leverage the `MockAutomationAdapter`, allowing you to run, test, and step through full workflows without opening real browser interfaces or having native desktop dependencies.
