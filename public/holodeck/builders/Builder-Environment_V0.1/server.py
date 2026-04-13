#!/usr/bin/env python3
"""
Dev server for EnvironmentBuilder V2.
Serves static files with correct MIME types for ES modules.
"""

import http.server, os, sys

PORT = int(os.environ.get('PORT', 8080))
DIR = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
        '.md': 'text/markdown',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(DIR)
    with http.server.HTTPServer(('', PORT), Handler) as httpd:
        print(f'EnvironmentBuilder V2 → http://localhost:{PORT}')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')
