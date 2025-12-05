FoodFlow — Local Development Guide
==================================

Quick steps to run the frontend (Next.js) and backend (Azure Functions) locally.

Prerequisites
-------------
- Node.js 18+ and npm
- Python 3.10+ (matches Azure Functions Python)
- Azure Functions Core Tools v4
- (Optional) upgrade pip: `python3 -m pip install --upgrade pip`

Frontend (Next.js)
------------------
```bash
cd frontend
npm install
npm run dev   # serves http://localhost:3000
```

Backend (Azure Functions, Python)
---------------------------------
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# add secrets to local.settings.json (git-ignored)
func start    # serves http://localhost:7071
```

Notes
-----
- API routes are under `/api/`, e.g. `/api/geocoding/search?q=Madrid`.
- Start the backend before calling these endpoints from the frontend.