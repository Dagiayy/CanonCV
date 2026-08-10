# Contributing to CanonCV

Thank you for your interest in contributing to **CanonCV**! We welcome contributions from developers, researchers, and open-source enthusiasts of all skill levels. 

This document provides guidelines and instructions for setting up your local development environment, making changes, and submitting Pull Requests (PRs).

---

## 📜 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How Can I Contribute?](#-how-can-i-contribute)
- [Development Setup](#-development-setup)
  - [Prerequisites](#prerequisites)
  - [Local Setup (Bare-Metal)](#local-setup-bare-metal)
  - [Docker Setup](#docker-setup)
- [Project Architecture](#-project-architecture)
- [Coding Standards & Style Guidelines](#-coding-standards--style-guidelines)
- [Submitting a Pull Request](#-submitting-a-pull-request)

---

## 🤝 Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

---

## 💡 How Can I Contribute?

You can contribute to CanonCV in many ways:
- 🐛 **Reporting Bugs**: Help us find issues by opening detailed bug reports.
- 💡 **Suggesting Features**: Share your ideas for new dataset adapters, quality algorithms, or Annotation Studio UI improvements.
- 📝 **Improving Documentation**: Fix typos, add explanations, or write tutorials.
- 🔧 **Submitting Code**: Pick up open issues labeled `good first issue` or `help wanted` and submit a Pull Request.

---

## 🛠️ Development Setup

### Prerequisites
- **Git**
- **Python 3.10+** (with `pip` and `venv`)
- **Node.js 18+** & `npm`
- *(Optional)* **Docker** and **Docker Compose**

---

### Local Setup (Bare-Metal)

#### 1. Clone the Repository
```bash
git clone https://github.com/Dagiayy/CanonCV.git
cd CanonCV
```

#### 2. Backend Setup (FastAPI)
```bash
cd backend
python -m venv .venv

# On Windows (PowerShell)
./.venv/Scripts/Activate.ps1

# On Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt

# Seed initial database and project taxonomy
python -m app.seed

# Start dev server (runs on http://localhost:8000)
uvicorn app.main:app --reload
```

#### 3. Frontend Setup (React / Vite)
In a separate terminal window:
```bash
cd frontend
npm install

# Start Vite dev server (runs on http://localhost:5173)
npm run dev
```

Visit `http://localhost:5173` in your browser. API requests are automatically proxied to `http://localhost:8000`.

---

### Docker Setup

To run the entire stack in containers:
```bash
docker compose build
docker compose up -d
docker compose exec backend python -m app.seed
```

---

## 🏗️ Project Architecture

CanonCV is structured as a decoupled full-stack application:

```
CanonCV/
├── backend/                  FastAPI service, SQLAlchemy DB models, and ETL engines
│   ├── app/
│   │   ├── adapters/         Format adapters (COCO, YOLO, VOC, Classification)
│   │   ├── routers/          API endpoints (annotate, quality, datasets, exports, splits)
│   │   └── services/         Core business logic & image processing engines
├── frontend/                 React + Vite + Tailwind SPA
│   ├── src/
│   │   ├── components/       Annotation canvas, mapping builder, quality modals
│   │   └── pages/            Studio, Taxonomy, Quality, Splits, Lineage views
├── data/                     Application SQLite database and generated state
├── normalization datases/    Raw input dataset storage directory
└── normalization.md          Detailed architecture & technical specification
```

---

## 📐 Coding Standards & Style Guidelines

### Python (Backend)
- Follow **PEP 8** style guidelines.
- Use explicit type hints for function signatures where applicable.
- Keep FastAPI endpoint handlers lean by delegating logic to `app/services/`.
- Format backend code cleanly.

### JavaScript / React (Frontend)
- Use functional React components with hooks.
- Keep components modular and reusable under `frontend/src/components/`.
- Ensure custom UI controls use standard HTML accessibility attributes where possible.

---

## 📬 Submitting a Pull Request

1. **Fork the repository** and create your branch from `main`:
   ```bash
   git checkout -b feature/my-amazing-feature
   ```
2. **Make your changes** and test them locally.
3. **Commit your changes** with clear, descriptive commit messages:
   ```bash
   git commit -m "feat(adapters): add support for LabelMe JSON format"
   ```
4. **Push to your fork** and open a Pull Request targeting the `main` branch.
5. Fill out the **Pull Request Template** completely.
6. Respond to any code review feedback from maintainers.

Thank you for helping make **CanonCV** better for everyone! 🚀
