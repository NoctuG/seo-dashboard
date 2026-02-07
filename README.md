# SEO Tool MVP

A lightweight, self-hosted SEO tool built with Python (FastAPI) and React (Vite).

## Features

- **Project Management**: Create and manage multiple projects.
- **Crawler**: Crawl websites, extract metadata, and analyze internal links.
- **Audit**: Detect common SEO issues (404, missing title/description, duplicate content).
- **Dashboard**: View crawl statistics and issue breakdowns.

## Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLModel (SQLite), Alembic.
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite.

## Setup Instructions

### Backend

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Create a virtual environment (optional but recommended):
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4.  Initialize the database:
    ```bash
    alembic upgrade head
    ```

5.  Start the server:
    ```bash
    uvicorn app.main:app --reload
    ```
    The API will be available at `http://localhost:8000`.

### Frontend

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173`.

## Usage

1.  Open the frontend in your browser.
2.  Create a new project by entering a name and domain (e.g., `https://example.com`).
3.  Click on the project card.
4.  Click **Start Crawl** to begin analyzing the website.
5.  Once the crawl is complete, view the results in the Dashboard, Pages, and Issues tabs.
