import sys
from pathlib import Path

# Them thu muc backend vao sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app

if __name__ == "__main__":
    import uvicorn
    import sys
    if "--frontend-only" in sys.argv:
        from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
        from app.core.config import settings

        class FrontendHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(settings.FRONTEND_DIST), **kwargs)

            def do_GET(self):
                from urllib.parse import urlsplit

                path = urlsplit(self.path).path
                if not (settings.FRONTEND_DIST / path.lstrip("/")).is_file():
                    self.path = "/index.html"
                super().do_GET()

        ThreadingHTTPServer(("127.0.0.1", 5173), FrontendHandler).serve_forever()
    else:
        is_dev = "--reload" in sys.argv
        uvicorn.run(
            app if getattr(sys, "frozen", False) else "app.main:app",
            host="127.0.0.1",
            port=8000,
            reload=is_dev,
            reload_dirs=[str(backend_dir)] if is_dev else None,
        )
