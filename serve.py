"""
EyeKart Development Server
Serves all 22 Stitch panels with robust threading, routing rewrites, and asset mapping.
"""
import http.server
import socketserver
import os
import sys

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class EyeKartHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # Redirect root to homepage panel
        if self.path == '/' or self.path == '/index.html':
            self.path = '/Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html'
        elif self.path.startswith('/Stitch/assets/'):
            # Safe static alias for /Stitch/assets/ -> /assets/
            self.path = self.path.replace('/Stitch/assets/', '/assets/', 1)
        
        return super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

class ThreadingEyeKartServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def run_server(port=PORT):
    httpd = ThreadingEyeKartServer(("", port), EyeKartHTTPRequestHandler)
    print("==================================================")
    print("  EyeKart Optical Commerce Platform — Local Server")
    print("  Visual Freeze & Stitch Preservation Protocol v1.1")
    print("==================================================")
    print(f"  Running at: http://localhost:{port}/")
    print("  Root Panel: Flagship Homepage")
    print("  Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down EyeKart server.")
        httpd.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port)
