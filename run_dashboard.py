"""
Script to host the Microplastic Detection System interactive dashboard on a specified host and port.
Serves the project root so all static files, live datasets, and report outputs are accessible.
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import argparse
import socket


class DashboardHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Redirect root URL to /dashboard/
        if self.path in ('/', ''):
            self.send_response(302)
            self.send_header('Location', '/dashboard/')
            self.end_headers()
            return
        super().do_GET()


def get_local_ip():
    """Retrieve the primary local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def start_server(host: str = '0.0.0.0', port: int = 8000, open_browser: bool = True):
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)

    Handler = DashboardHTTPRequestHandler
    
    # Allow socket address reuse
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer((host, port), Handler) as httpd:
        local_ip = get_local_ip()
        print("\n" + "=" * 60)
        print("🔬 MICROPLASTIC DETECTION DASHBOARD SERVER")
        print("=" * 60)
        print(f"Server running on host: {host} (port: {port})")
        print(f"\nAccess the dashboard at:")
        print(f"  👉 Local URL:   http://localhost:{port}/dashboard/")
        print(f"  👉 Network URL: http://{local_ip}:{port}/dashboard/")
        print("=" * 60)
        print("Press Ctrl+C to stop the server.\n")

        if open_browser:
            webbrowser.open(f"http://localhost:{port}/dashboard/")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down dashboard server...")
            httpd.shutdown()


def main():
    parser = argparse.ArgumentParser(description="Run Microplastic Detection Dashboard Web Server")
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host IP address to bind (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=8000, help='Port number to serve on (default: 8000)')
    parser.add_argument('--no-browser', action='store_true', help='Do not automatically open the browser')

    args = parser.parse_args()
    start_server(host=args.host, port=args.port, open_browser=not args.no_browser)


if __name__ == '__main__':
    main()
