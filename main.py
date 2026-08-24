"""Dev entry point. Runs the FastAPI app (which also launches the bot).

    python main.py

For auto-reload during development use:

    uvicorn app.main:app --reload
"""
import uvicorn

from app.config import settings

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)
