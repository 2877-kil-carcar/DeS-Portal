"""Local-only DeS portal with gift-code support. No work runs on import."""
import argparse
import importlib.util
import json
import mimetypes
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
PREFIX = '/api/redeem-tool/'
LOCK = threading.Lock()
PUBLIC_EXTENSIONS = {'.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.mp4', '.mov', '.woff', '.woff2', '.ico'}


def load_backend(folder):
    script = folder / 'server.py'
    if not script.is_file():
        return None
    spec = importlib.util.spec_from_file_location('wos_redeem_backend', script)
    backend = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backend)
    return backend


def resolve_backend(folder=None):
    """Prefer the existing store, then fall back to the bundled backend."""
    candidates = []
    if folder is not None:
        candidates.append(Path(folder))
    candidates.extend((ROOT.parent / 'wos_redeem', ROOT.parent / '_wos_redeem'))
    seen = set()
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        backend = load_backend(candidate)
        if backend is not None:
            return backend, f'既存データ: {candidate}'
    spec = importlib.util.spec_from_file_location('des_portal_redeem_backend', ROOT / 'redeem_backend.py')
    if spec is None or spec.loader is None:
        return None, '交換バックエンドを読み込めません'
    backend = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backend)
    return backend, f'内蔵データ: {backend.DATA_DIR}'


def open_portal(url, enabled=True):
    if enabled:
        threading.Timer(0.35, webbrowser.open, args=(url,)).start()


def make_handler(backend):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass  # Do not log player IDs, gift codes or roster contents.

        def send(self, status, body, ctype='application/json; charset=utf-8'):
            if not isinstance(body, bytes):
                body = json.dumps(body, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'SAMEORIGIN')
            self.end_headers()
            self.wfile.write(body)

        def allowed(self, mutation=False):
            port = self.server.server_address[1]
            hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
            host = self.headers.get('Host', '')
            origin = self.headers.get('Origin')
            if host not in hosts or self.headers.get('Sec-Fetch-Site') == 'cross-site':
                self.send(403, {'ok': False, 'msg': 'このPCの同一サイトからのみ利用できます。'})
                return False
            if (origin is not None and origin != 'http://' + host) or (mutation and origin != 'http://' + host):
                self.send(403, {'ok': False, 'msg': '送信元を確認できません。ローカル画面から操作してください。'})
                return False
            return True

        def do_GET(self):
            if not self.allowed():
                return
            route = urlsplit(self.path).path
            if route == PREFIX + 'health':
                self.send(200, {'service': 'wos-redeem-hub', 'ready': backend is not None})
                return
            if route == PREFIX + 'state':
                if backend is None:
                    self.send(503, {'ok': False, 'msg': '元の交換ツールが見つかりません。'})
                    return
                with LOCK:
                    state = {'kingdom': backend.DEFAULT_KINGDOM,
                             'players': backend.load_json(backend.PLAYERS_FILE, []),
                             'history': backend.load_json(backend.HISTORY_FILE, {})}
                self.send(200, state)
                return
            if route.startswith('/api/'):
                self.send(404, {'ok': False, 'msg': 'APIがありません。'})
                return
            # Serve only app assets, never Python, rosters, history, backups or arbitrary paths.
            relative = unquote(route).lstrip('/') or 'index.html'
            target = (ROOT / relative).resolve()
            if (not target.is_relative_to(ROOT) or not target.is_file()
                    or (target.parent != ROOT and target.relative_to(ROOT).parts[0] not in {'apps', 'assets'})
                    or (target.suffix.lower() not in PUBLIC_EXTENSIONS and relative != 'wos_rally_joiner_gen1-8.json')):
                self.send(404, {'ok': False, 'msg': 'ファイルがありません。'})
                return
            ctype = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html'}.get(target.suffix.lower()) or mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
            self.send(200, target.read_bytes(), ctype)

        def do_POST(self):
            if not self.allowed(mutation=True):
                return
            routes = {'players', 'players/rename', 'players/delete', 'redeem'}
            route = urlsplit(self.path).path
            action = route[len(PREFIX):] if route.startswith(PREFIX) else ''
            if action not in routes:
                self.send(404, {'ok': False, 'msg': 'APIがありません。'})
                return
            if backend is None:
                self.send(503, {'ok': False, 'msg': '元の交換ツールが見つかりません。'})
                return
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                self.send(415, {'ok': False, 'msg': 'JSON形式で送信してください。'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536:
                    raise ValueError('送信サイズが不正です。')
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError('送信形式が不正です。')
                fid = str(body.get('fid', ''))
                if not fid or not fid.isascii() or not fid.isdecimal():
                    raise ValueError('プレイヤーIDは数字で入力してください。')
                with LOCK:
                    players = backend.load_json(backend.PLAYERS_FILE, [])
                    current = next((p for p in players if p['fid'] == fid), None)
                    if action != 'players' and current is None:
                        raise ValueError('登録されていないプレイヤーです。再読込してください。')
                    if action == 'players':
                        kid = str(body.get('kid') or (current or {}).get('kid') or backend.DEFAULT_KINGDOM)
                        if not kid.isascii() or not kid.isdecimal():
                            raise ValueError('王国は数字で入力してください。')
                        result = backend.check_player(fid, kid)
                        if result.get('ok'):
                            entry = {'fid': fid, 'kid': kid, 'name': str(body.get('name', (current or {}).get('name', ''))).strip()[:100]}
                            players = [entry if p['fid'] == fid else p for p in players] if current else players + [entry]
                            backend.save_json(backend.PLAYERS_FILE, players)
                    elif action == 'players/rename':
                        current['name'] = str(body.get('name', '')).strip()[:100]
                        backend.save_json(backend.PLAYERS_FILE, players)
                        result = {'ok': True}
                    elif action == 'players/delete':
                        backend.save_json(backend.PLAYERS_FILE, [p for p in players if p['fid'] != fid])
                        result = {'ok': True}
                    else:
                        cdk = str(body.get('cdk', '')).strip()
                        if not cdk or len(cdk) > 256:
                            raise ValueError('交換コードを確認してください。')
                        history = backend.load_json(backend.HISTORY_FILE, {})
                        prior = history.get(cdk, {}).get(fid)
                        if prior:
                            result = {'done': True, 'retry': False, 'bad_cdk': False, 'msg': '記録済：' + prior['msg']}
                        else:
                            result = backend.redeem(fid, current.get('kid') or backend.DEFAULT_KINGDOM, cdk)
                self.send(200, result)
            except (ValueError, KeyError, TypeError) as error:
                self.send(400, {'ok': False, 'msg': str(error)})
            except Exception:
                self.send(502, {'ok': False, 'msg': '通信または保存に失敗しました。交換は完了している可能性があります。履歴とゲーム内を確認してください。'})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--redeem-dir', type=Path, default=None)
    parser.add_argument('--no-browser', action='store_true', help='do not open the local portal automatically')
    args = parser.parse_args()
    backend, backend_label = resolve_backend(args.redeem_dir)
    if backend is None:
        print('Gift-code backend could not be loaded.', flush=True)
    url = f'http://127.0.0.1:{args.port}/#redeem'
    print(f'DeS Portal: {url} (Ctrl+C to stop)', flush=True)
    print(f'Local PC only. {backend_label}', flush=True)
    with ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(backend)) as server:
        open_portal(url, not args.no_browser)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
