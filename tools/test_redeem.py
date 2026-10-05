"""Offline handler tests with a fake backend; no sockets or external API calls."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hub_server', ROOT / 'hub_server.py')
hub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hub)


class Tests(unittest.TestCase):
    def setUp(self):
        self.files = {'players': [{'fid': '123', 'kid': '7', 'name': 'Demo'}], 'history': {}}
        self.calls = []

        def redeem(fid, kid, cdk):
            self.calls.append((fid, kid, cdk))
            self.files['history'].setdefault(cdk, {})[fid] = {'msg': 'mock done'}
            return {'done': True, 'retry': False, 'bad_cdk': False, 'msg': 'mock done'}

        self.backend = SimpleNamespace(DEFAULT_KINGDOM='7', PLAYERS_FILE='players', HISTORY_FILE='history',
            load_json=lambda file, default: copy.deepcopy(self.files.get(file, default)),
            save_json=lambda file, data: self.files.__setitem__(file, copy.deepcopy(data)),
            check_player=lambda fid, kid: {'ok': True}, redeem=redeem)

    def invoke(self, path, body=None, headers=None, missing=False):
        cls = hub.make_handler(None if missing else self.backend)
        h = cls.__new__(cls)
        h.server = SimpleNamespace(server_address=('127.0.0.1', 8766))
        h.path = path
        raw = json.dumps(body).encode() if body is not None else b''
        h.headers = {'Host': '127.0.0.1:8766', 'Origin': 'http://127.0.0.1:8766', 'Content-Type': 'application/json', 'Content-Length': str(len(raw))}
        h.headers.update(headers or {})
        h.rfile = io.BytesIO(raw)
        h.send = lambda status, value, ctype=None: setattr(h, 'result', (status, value))
        (h.do_POST if body is not None else h.do_GET)()
        return h.result

    def test_health_and_state_are_read_only(self):
        before = copy.deepcopy(self.files)
        self.assertTrue(self.invoke('/api/redeem-tool/health')[1]['ready'])
        self.assertEqual(self.invoke('/api/redeem-tool/state')[1]['players'], before['players'])
        self.assertEqual(self.files, before)
        self.assertEqual(self.calls, [])

    def test_missing_backend(self):
        self.assertFalse(self.invoke('/api/redeem-tool/health', missing=True)[1]['ready'])
        self.assertEqual(self.invoke('/api/redeem-tool/state', missing=True)[0], 503)

    def test_wrong_host_and_cross_origin_blocked(self):
        for headers in [{'Host': 'evil.invalid:8766'}, {'Origin': 'http://other.invalid'}, {'Sec-Fetch-Site': 'cross-site'}, {'Origin': None}]:
            self.assertEqual(self.invoke('/api/redeem-tool/redeem', {'fid': '123', 'cdk': 'DEMO'}, headers)[0], 403)
        self.assertEqual(self.calls, [])

    def test_registration_changes_use_same_store(self):
        self.assertEqual(self.invoke('/api/redeem-tool/players', {'fid': '456', 'kid': '8', 'name': 'New'})[0], 200)
        self.assertEqual(len(self.files['players']), 2)
        self.invoke('/api/redeem-tool/players/rename', {'fid': '456', 'name': 'Renamed'})
        self.assertEqual(self.files['players'][1]['name'], 'Renamed')
        self.invoke('/api/redeem-tool/players/delete', {'fid': '456'})
        self.assertEqual(len(self.files['players']), 1)

    def test_mock_redeem_uses_kingdom_and_skips_recorded(self):
        body = {'fid': '123', 'cdk': 'DEMO'}
        self.assertTrue(self.invoke('/api/redeem-tool/redeem', body)[1]['done'])
        self.assertTrue(self.invoke('/api/redeem-tool/redeem', body)[1]['done'])
        self.assertEqual(self.calls, [('123', '7', 'DEMO')])

    def test_invalid_player_code_and_payload_do_not_call_backend(self):
        for body in [{'fid': '999', 'cdk': 'DEMO'}, {'fid': '123', 'cdk': ''}, {'fid': 'x', 'cdk': 'DEMO'}, []]:
            self.assertEqual(self.invoke('/api/redeem-tool/redeem', body)[0], 400)
        self.assertEqual(self.calls, [])

    def test_private_paths_not_served(self):
        for path in ['/hub_server.py', '/redeem_backend.py', '/start_hub.bat', '/players.json', '/.redeem-data/players.json', '/apps/redeem/players.json', '/%2e%2e/wos_redeem/players.json', '/api/unknown']:
            self.assertEqual(self.invoke(path)[0], 404, path)
        for path in ['/', '/apps/redeem/index.html', '/assets/app.js']:
            self.assertEqual(self.invoke(path)[0], 200, path)

    def test_external_failure_is_bounded_error(self):
        def fail(*args):
            raise OSError('fake unavailable')
        self.backend.redeem = fail
        self.assertEqual(self.invoke('/api/redeem-tool/redeem', {'fid': '123', 'cdk': 'DEMO'})[0], 502)

    def test_bundled_backend_is_available_without_sibling_tool(self):
        original_root = hub.ROOT
        with tempfile.TemporaryDirectory() as folder:
            isolated = Path(folder) / 'portal'
            isolated.mkdir()
            shutil.copy2(ROOT / 'redeem_backend.py', isolated / 'redeem_backend.py')
            hub.ROOT = isolated
            try:
                backend, label = hub.resolve_backend(isolated.parent / 'missing')
                self.assertIsNotNone(backend)
                self.assertIn('内蔵データ', label)
                self.assertEqual(backend.load_json(backend.PLAYERS_FILE, []), [])
            finally:
                hub.ROOT = original_root


if __name__ == '__main__':
    unittest.main()
