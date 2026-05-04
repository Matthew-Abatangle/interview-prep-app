# AI Interview Prep

An AI-powered behavioral interview preparation app.

## Structure

```
.
├── frontend/   # React + Vite
└── backend/    # FastAPI + Python
```

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # add your keys
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and the backend on `http://localhost:8000`.
