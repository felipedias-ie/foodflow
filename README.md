FoodFlow
========

FoodFlow is a small full‑stack food ordering prototype:

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS v4, deployed as a static site to **GitHub Pages**
- **Backend**: Python **Azure Functions** HTTP API using **Azure Table Storage** + **Azure Blob Storage**, deployed to **Azure Functions**

Repository layout
-----------------

```
.
├─ frontend/          # Next.js app (static export for GitHub Pages)
├─ backend/           # Azure Functions (Python)
└─ .github/workflows/ # CI/CD for Pages + Azure Functions
```

Tech stack
----------

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend**: Azure Functions (Python), `azure-data-tables`, `azure-storage-blob`
- **Storage**: Azure Table Storage (entities) + Azure Blob Storage (menus/images)

Prerequisites
-------------

- **Node.js**: 20+ recommended (CI uses Node 20)
- **Python**: 3.11+ recommended (CI deploy uses Python 3.12)
- **Azure Functions Core Tools**: v4 (for `func start`)
- **Azure Storage**:
  - Local dev: Azurite (Blob + Table endpoints), or
  - A real Azure Storage account connection string

Python environment (Conda, optional)
------------------------------------

If you prefer Conda:

```bash
conda env create -f environment.yml
conda activate foodflow
```

Storage (local, optional)
-------------------------

If you want the backend to persist restaurants/meals/orders locally, run an Azure Storage emulator (Azurite) and point `AzureWebJobsStorage` at it.

```bash
azurite --location .azurite --debug .azurite/debug.log
```

Local development
-----------------

### Backend (Azure Functions)

From `./backend`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
func start
```

The API will be available at:

- `http://localhost:7071/api`

Backend configuration
---------------------

Azure Functions reads settings from `backend/local.settings.json` when running locally (this file is ignored by git).

At minimum you need:

- **`AzureWebJobsStorage`**: an Azure Storage connection string (or an Azurite connection string)
- **`FUNCTIONS_WORKER_RUNTIME`**: `python`

This project uses Table Storage and Blob Storage via `AzureWebJobsStorage`, so your storage target must support both.

Data model (storage)
--------------------

Primary tables/containers used by the backend:

- **Tables**: `Restaurants`, `CuisineIndex`, `Meals`, `MenuVersions`, `Baskets`, `Orders`
- **Blob container**: `images`

### Frontend (Next.js)

From `./frontend`:

```bash
npm install
npm run dev
```

The UI will be available at:

- `http://localhost:3000`

Frontend build (static export)
------------------------------

GitHub Pages uses a static build. From `./frontend`:

```bash
NEXT_PUBLIC_API_URL="https://<your-function-app>.azurewebsites.net/api" npm run build
```

The static site is output to `frontend/out`.

Frontend configuration
----------------------

The frontend calls the backend from the browser.

- **`NEXT_PUBLIC_API_URL`** (optional):
  - Default (local): `http://localhost:7071/api`
  - Production: set to your deployed Azure Function base URL + `/api`

GitHub Pages base path
----------------------

In production, `frontend/next.config.js` sets:

- `basePath: '/foodflow'`
- `assetPrefix: '/foodflow'`

If your GitHub Pages site is served from a different repository name/path, update the base path accordingly.

API overview
------------

All backend routes are prefixed by `/api` when running via Azure Functions.

### Geocoding

- `GET /api/geocoding/reverse?lat=...&lon=...`
- `GET /api/geocoding/search?q=...`
- `GET /api/geocoding/autocomplete?q=...&at=LAT,LON`
- `GET /api/geocoding/route?from_lat=...&from_lon=...&to_lat=...&to_lon=...`

### Restaurants

- `GET /api/restaurants/search?q=...&limit=20`
- `GET /api/restaurants/nearby?lat=...&lon=...&limit=20`
- `GET /api/restaurants/cuisine/{cuisine}?lat=...&lon=...&limit=20`
- `GET /api/restaurants/{restaurant_id}`
- `GET /api/restaurants/{restaurant_id}/menu`
- `GET /api/images/{image_type}/{filename}` (serves from Blob Storage)

### Orders

- `GET /api/baskets/{basket_id}?restaurant_id=...`
- `PUT /api/baskets/{basket_id}?restaurant_id=...`
- `POST /api/orders`
- `GET /api/orders/{order_id}`
- `PUT /api/orders/{order_id}/status`
- `POST /api/orders/{order_id}/refresh-eta`

### Management (admin utilities)

- `GET|POST /api/manage/restaurants`
- `GET|POST /api/manage/restaurants/{restaurant_id}/meals`
- `PUT|DELETE /api/manage/restaurants/{restaurant_id}/meals/{meal_id}`
- `GET /api/images/search?image_type=...&q=...&limit=...`
- `GET /api/meals/search?q=...&limit=...`

CI/CD
-----

### Frontend → GitHub Pages

Workflow: `.github/workflows/pages.yml`

- Builds the frontend and deploys `frontend/out` to GitHub Pages
- Requires repository secret: **`NEXT_PUBLIC_API_URL`** (your production API base URL)

### Backend → Azure Functions

Workflow: `.github/workflows/main_foodflow.yml`

- Deploys the `backend/` Azure Functions app
- Uses GitHub OIDC with Azure; configure the required Azure login secrets in your repository

The workflow expects these secret names (see `.github/workflows/main_foodflow.yml`):

- `AZUREAPPSERVICE_CLIENTID_C0F5A8EABBF3457A95CDE310E306C9F9`
- `AZUREAPPSERVICE_TENANTID_1B55B5E753CE4498909F527D4944F877`
- `AZUREAPPSERVICE_SUBSCRIPTIONID_85DABA06E4384FE99152FF1AB3653231`

Troubleshooting
---------------

- **CORS issues**: local dev sets permissive CORS in `local.settings.json`; for production, configure CORS in your Azure Function App settings.
- **Storage errors**: ensure `AzureWebJobsStorage` points to a storage account (or Azurite) with both Table + Blob endpoints available.