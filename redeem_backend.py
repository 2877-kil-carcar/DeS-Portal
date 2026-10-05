"""Built-in Whiteout Survival gift-code backend for the local DeS portal.

This module contains no web server. ``hub_server.py`` is the only HTTP entry
point and keeps the API bound to 127.0.0.1.
"""
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

DEFAULT_KINGDOM = "2856"
API_BASE = "https://wos-giftcode-api.centurygame.com/api"
SALT = "tB87#kPtkxqOS2"
CHECK_CDK = "ZZCHECKONLY0"

DATA_DIR = Path(__file__).resolve().parent / ".redeem-data"
PLAYERS_FILE = DATA_DIR / "players.json"
HISTORY_FILE = DATA_DIR / "history.json"

MESSAGES = {
    20000: "交換成功",
    40004: "サーバービジー。しばらく待って再試行",
    40005: "交換回数上限に達しています",
    40006: "大溶鉱炉レベル不足",
    40007: "交換期限切れ",
    40008: "受取済み",
    40011: "同タイプのコードは一度しか使えません",
    40012: "アカウント登録期間が条件外",
    40014: "交換コードが存在しません（大文字小文字を確認）",
    40015: "交換コードが正しくありません",
    40016: "サーバー混雑中。報酬は後ほど送付",
    40017: "交換条件を満たしていません",
    40018: "領主バトラー利用中アカウント専用コード",
    40019: "操作頻度制限オーバー",
    40020: "IDまたは王国が正しくありません",
}
DONE_CODES = {20000, 40008, 40011, 40016}
RETRY_CODES = {40004, 40019}
BAD_CDK_CODES = {40007, 40014, 40015}


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def save_json(path, data):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(target)


def sign_params(params):
    safe = "-_.!~*'()"
    query = "&".join(
        f"{key}={urllib.parse.quote(str(params[key]), safe=safe)}"
        for key in sorted(params)
    )
    return {"sign": hashlib.md5((query + SALT).encode()).hexdigest(), **params}


def call_api(path, params):
    data = sign_params(params)
    boundary = uuid.uuid4().hex
    body = b"".join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        for key, value in data.items()
    ) + f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        API_BASE + path,
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Origin": "https://wos-giftcode.centurygame.com",
            "Referer": "https://wos-giftcode.centurygame.com/",
            "User-Agent": "Mozilla/5.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        return {"code": 1, "err_code": None, "msg": f"HTTP {error.code}（交換サイト側の仕様変更の可能性）"}


def gift_code(fid, kid, cdk):
    response = call_api("/gift_code", {"fid": fid, "kid": kid, "cdk": cdk, "time": int(time.time())})
    code = response.get("err_code")
    message = MESSAGES.get(code) or response.get("msg") or "不明なエラー"
    if code == 40006 and isinstance(response.get("data"), dict) and response["data"].get("tips"):
        message += f"（Lv.{response['data']['tips']} 以上）"
    return {
        "err_code": code,
        "msg": message,
        "done": code in DONE_CODES,
        "retry": code in RETRY_CODES,
        "bad_cdk": code in BAD_CDK_CODES,
    }


def check_player(fid, kid):
    result = gift_code(fid, kid, CHECK_CDK)
    return {"ok": True} if result["err_code"] == 40014 else {"ok": False, "msg": result["msg"]}


def redeem(fid, kid, cdk):
    result = gift_code(fid, kid, cdk)
    if result["done"]:
        history = load_json(HISTORY_FILE, {})
        history.setdefault(cdk, {})[fid] = {"msg": result["msg"], "at": time.strftime("%Y-%m-%d %H:%M")}
        save_json(HISTORY_FILE, history)
    return result
