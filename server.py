#!/usr/bin/env python3
"""THE PICKS 홈페이지/관리자용 무설치 백엔드 서버."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import tempfile
import threading
import time
import uuid
import webbrowser
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
CONTENT_FILE = DATA_DIR / "content.json"
INQUIRY_FILE = DATA_DIR / "inquiries.json"
ADMIN_FILE = DATA_DIR / "admin.json"
MAX_BODY = 10 * 1024 * 1024
SESSION_TTL = 12 * 60 * 60
SESSIONS: dict[str, float] = {}
WRITE_LOCK = threading.Lock()
KST = timezone(timedelta(hours=9))

CATEGORY_NAMES = {"photobooth": "포토부스", "game": "게임 키오스크", "saju": "AI 사주", "mosaic": "모자이크 월"}

DEFAULT_CONTENT = {
    "site": {
        "hero_eyebrow": "PREMIUM KIOSK RENTAL",
        "hero_title": "프리미엄",
        "hero_accent": "포토부스 대여",
        "hero_description": "다년간의 이벤트 기획·진행 노하우와 축적된 운영 경험으로 특별한 순간을 더욱 특별하게 만들어 드립니다.",
        "hero_image": "photobooth_white.jpg",
        "hero_slides": [
            {"id":"default-hero","image":"photobooth_white.jpg","created_at":""}
        ]
    },
    "service": {
        "intro_image": "",
        "signature_image": "",
        "compact_image": ""
    },
    "photobooth_page": {
        "screens": [],
        "ai_content": {
            "background": [],
            "beauty": [],
            "webtoon": [],
            "meme": [],
            "figure": []
        },
        "backwalls": []
    },
    "frames": {
        "basic": {"main_image":"", "gallery":[]},
        "ai": {"main_image":"", "gallery":[]},
        "collage": {"main_image":"", "gallery":[]}
    },
    "portfolio": [
        {"id":"photo-1","category":"photobooth","title":"기업 행사","summary":"브랜드 프로모션","image":"port_1.jpg","created_at":"2026-09-02 16:00"},
        {"id":"photo-2","category":"photobooth","title":"학교 행사","summary":"캠퍼스 이벤트","image":"port_2.jpg","created_at":"2026-09-02 15:00"},
        {"id":"photo-3","category":"photobooth","title":"지역 축제","summary":"지역 페스티벌","image":"port_3.jpg","created_at":"2026-09-02 14:00"},
        {"id":"photo-4","category":"photobooth","title":"브랜드 팝업","summary":"팝업 스토어","image":"port_4.jpg","created_at":"2026-09-02 13:00"},
        {"id":"game-1","category":"game","title":"기업 프로모션","summary":"참여형 게임 이벤트","image":"port_1.jpg","created_at":"2026-09-02 12:00"},
        {"id":"game-2","category":"game","title":"지역 축제","summary":"게임 키오스크 운영","image":"port_2.jpg","created_at":"2026-09-02 11:00"},
        {"id":"game-3","category":"game","title":"학교 행사","summary":"캠퍼스 게임 이벤트","image":"port_3.jpg","created_at":"2026-09-02 10:00"},
        {"id":"game-4","category":"game","title":"브랜드 팝업","summary":"고객 참여 프로모션","image":"port_4.jpg","created_at":"2026-09-02 09:00"},
        {"id":"saju-1","category":"saju","title":"기업 행사","summary":"AI 사주 체험","image":"port_1.jpg","created_at":"2026-09-01 16:00"},
        {"id":"saju-2","category":"saju","title":"지역 축제","summary":"AI 운세 이벤트","image":"port_2.jpg","created_at":"2026-09-01 15:00"},
        {"id":"saju-3","category":"saju","title":"박람회","summary":"방문객 참여 콘텐츠","image":"port_3.jpg","created_at":"2026-09-01 14:00"},
        {"id":"saju-4","category":"saju","title":"브랜드 팝업","summary":"맞춤형 AI 사주","image":"port_4.jpg","created_at":"2026-09-01 13:00"}
    ]
}


def ensure_storage() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    if not CONTENT_FILE.exists():
        write_json(CONTENT_FILE, DEFAULT_CONTENT)
    if not INQUIRY_FILE.exists():
        write_json(INQUIRY_FILE, [])


def read_json(path: Path, default):
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except (OSError, json.JSONDecodeError):
        return default


def load_content() -> dict:
    content = read_json(CONTENT_FILE, {})
    if not isinstance(content, dict):
        content = {}
    for section in ("site", "service", "photobooth_page", "frames", "portfolio"):
        if section not in content:
            content[section] = json.loads(json.dumps(DEFAULT_CONTENT[section], ensure_ascii=False))
    if not isinstance(content.get("frames"), dict):
        content["frames"] = {}
    site = content.setdefault("site", {})
    if not isinstance(site.get("hero_slides"), list):
        legacy_image = site.get("hero_image", "")
        site["hero_slides"] = [{"id":"legacy-hero","image":legacy_image,"created_at":""}] if legacy_image else []
    site["hero_slides"] = [item for item in site["hero_slides"] if isinstance(item, dict) and item.get("image")][:5]
    service = content.setdefault("service", {})
    if not isinstance(service, dict):
        service = {}
        content["service"] = service
    for slot in ("intro_image", "signature_image", "compact_image"):
        service.setdefault(slot, "")
    photobooth_page = content.setdefault("photobooth_page", {})
    if not isinstance(photobooth_page, dict):
        photobooth_page = {}
        content["photobooth_page"] = photobooth_page
    for gallery_name in ("screens", "backwalls"):
        if not isinstance(photobooth_page.get(gallery_name), list):
            photobooth_page[gallery_name] = []
    ai_content = photobooth_page.setdefault("ai_content", {})
    if not isinstance(ai_content, dict):
        ai_content = {}
        photobooth_page["ai_content"] = ai_content
    for category in ("background", "beauty", "webtoon", "meme", "figure"):
        if not isinstance(ai_content.get(category), list):
            ai_content[category] = []
    for frame_type in ("basic", "ai", "collage"):
        frame = content["frames"].setdefault(frame_type, {})
        frame.setdefault("main_image", "")
        frame.setdefault("gallery", [])
    return content


def write_json(path: Path, value) -> None:
    path.parent.mkdir(exist_ok=True)
    with WRITE_LOCK:
        handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp")
        try:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
            temp_name = handle.name
        finally:
            handle.close()
        os.replace(temp_name, path)


def now_text() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M")


def clean_text(value, maximum: int, required: bool = False) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise ValueError("필수 항목을 입력해 주세요.")
    return text[:maximum]


def password_record(password: str) -> dict:
    salt = secrets.token_bytes(16)
    rounds = 240_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return {"salt": salt.hex(), "hash": digest.hex(), "rounds": rounds}


def password_matches(password: str, record: dict) -> bool:
    try:
        salt = bytes.fromhex(record["salt"])
        expected = bytes.fromhex(record["hash"])
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(record["rounds"]))
        return hmac.compare_digest(actual, expected)
    except (KeyError, TypeError, ValueError):
        return False


def save_image(file_info: dict | None) -> str | None:
    if not file_info or not file_info.get("data"):
        return None
    payload = file_info["data"]
    if len(payload) > 8 * 1024 * 1024:
        raise ValueError("사진은 8MB 이하만 업로드할 수 있습니다.")
    if payload.startswith(b"\xff\xd8\xff"):
        extension = ".jpg"
    elif payload.startswith(b"\x89PNG\r\n\x1a\n"):
        extension = ".png"
    elif len(payload) > 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        extension = ".webp"
    else:
        raise ValueError("JPG, PNG, WEBP 사진만 업로드할 수 있습니다.")
    destination = UPLOAD_DIR / f"{uuid.uuid4().hex}{extension}"
    destination.write_bytes(payload)
    return f"uploads/{destination.name}"


def delete_uploaded_image(relative_path: str) -> None:
    if not relative_path.startswith("uploads/"):
        return
    candidate = (BASE_DIR / relative_path).resolve()
    if candidate.parent == UPLOAD_DIR.resolve() and candidate.exists():
        candidate.unlink()


class ThePicksHandler(SimpleHTTPRequestHandler):
    server_version = "ThePicks/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        path = urlparse(self.path).path.lower()
        if path == "/" or path.endswith((".html", ".css", ".js")):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_HEAD(self):
        if urlparse(self.path).path in {"/portfolio", "/portfolio/", "/photobooth", "/photobooth/"}:
            self.send_response(HTTPStatus.FOUND)
            target = "/photobooth.html" if "photobooth" in urlparse(self.path).path else "/portfolio.html"
            self.send_header("Location", target)
            self.end_headers()
            return
        if self._protected_path():
            return self.send_error(HTTPStatus.NOT_FOUND)
        super().do_HEAD()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in {"/portfolio", "/portfolio/", "/photobooth", "/photobooth/"}:
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/photobooth.html" if "photobooth" in path else "/portfolio.html")
            self.end_headers()
            return
        if path == "/api/content":
            return self._json(HTTPStatus.OK, load_content())
        if path == "/api/version":
            return self._json(HTTPStatus.OK, {"version": "22", "company_nav": True, "photobooth_nav": True, "photobooth_screens": True, "screen_centered": True, "screen_unlimited": True, "screen_lightbox": True, "ai_content": True, "ai_content_white": True, "ai_content_four_each": True, "content_order": "screen-ai-backwall-signature", "backwall_gallery": True, "backwall_unlimited": True, "successful_events": "10000+", "service_page": True, "service_photos_equal": True, "service_text_size": "15px", "archive_paper_sizes": "2x3/2x4", "service_admin_photos": True})
        if path == "/api/admin/status":
            return self._json(HTTPStatus.OK, {"configured": ADMIN_FILE.exists(), "authenticated": self._authenticated()})
        if path == "/api/admin/data":
            if not self._require_auth(): return
            return self._json(HTTPStatus.OK, self._all_data())
        if self._protected_path():
            return self.send_error(HTTPStatus.NOT_FOUND)
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/inquiries": return self._create_inquiry()
            if path == "/api/admin/setup": return self._setup_admin()
            if path == "/api/admin/login": return self._login()
            if path == "/api/admin/logout": return self._logout()
            if path.startswith("/api/admin/") and not self._require_auth(): return
            if path == "/api/admin/site": return self._save_site()
            if path == "/api/admin/hero-slide": return self._save_hero_slide()
            if path == "/api/admin/service-photo": return self._save_service_photo()
            if path == "/api/admin/photobooth-screen": return self._save_photobooth_screen()
            if path == "/api/admin/ai-content": return self._save_ai_content()
            if path == "/api/admin/backwall": return self._save_backwall()
            if path == "/api/admin/frame-main": return self._save_frame_main()
            if path == "/api/admin/frame-gallery": return self._save_frame_gallery()
            if path == "/api/admin/portfolio": return self._save_portfolio()
            if path == "/api/admin/inquiry-status": return self._save_inquiry_status()
            self._json(HTTPStatus.NOT_FOUND, {"message": "요청한 기능을 찾을 수 없습니다."})
        except ValueError as error:
            self._json(HTTPStatus.BAD_REQUEST, {"message": str(error)})
        except Exception:
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path not in {"/api/admin/portfolio", "/api/admin/frame-gallery", "/api/admin/hero-slide", "/api/admin/photobooth-screen", "/api/admin/ai-content", "/api/admin/backwall"}: return self._json(HTTPStatus.NOT_FOUND, {"message":"요청한 기능을 찾을 수 없습니다."})
        if not self._require_auth(): return
        query = parse_qs(urlparse(self.path).query)
        item_id = query.get("id", [""])[0]
        content = load_content()
        if path == "/api/admin/portfolio":
            item = next((entry for entry in content["portfolio"] if entry.get("id") == item_id), None)
            if not item: return self._json(HTTPStatus.NOT_FOUND, {"message":"삭제할 글을 찾을 수 없습니다."})
            content["portfolio"] = [entry for entry in content["portfolio"] if entry.get("id") != item_id]
        elif path == "/api/admin/frame-gallery":
            frame_type = query.get("frame", [""])[0]
            if frame_type not in {"basic", "ai", "collage"}: return self._json(HTTPStatus.BAD_REQUEST, {"message":"프레임 종류를 확인해 주세요."})
            gallery = content["frames"][frame_type]["gallery"]
            item = next((entry for entry in gallery if entry.get("id") == item_id), None)
            if not item: return self._json(HTTPStatus.NOT_FOUND, {"message":"삭제할 사진을 찾을 수 없습니다."})
            content["frames"][frame_type]["gallery"] = [entry for entry in gallery if entry.get("id") != item_id]
        elif path == "/api/admin/hero-slide":
            slides = content["site"].get("hero_slides", [])
            item = next((entry for entry in slides if entry.get("id") == item_id), None)
            if not item: return self._json(HTTPStatus.NOT_FOUND, {"message":"삭제할 슬라이드 사진을 찾을 수 없습니다."})
            remaining = [entry for entry in slides if entry.get("id") != item_id]
            content["site"]["hero_slides"] = remaining
            content["site"]["hero_image"] = remaining[0].get("image", "") if remaining else ""
        elif path == "/api/admin/photobooth-screen":
            gallery = content["photobooth_page"]["screens"]
            item = next((entry for entry in gallery if entry.get("id") == item_id), None)
            if not item: return self._json(HTTPStatus.NOT_FOUND, {"message":"삭제할 화면 사진을 찾을 수 없습니다."})
            content["photobooth_page"]["screens"] = [entry for entry in gallery if entry.get("id") != item_id]
        elif path == "/api/admin/backwall":
            gallery = content["photobooth_page"]["backwalls"]
            item = next((entry for entry in gallery if entry.get("id") == item_id), None)
            if not item: return self._json(HTTPStatus.NOT_FOUND, {"message":"삭제할 백월 사진을 찾을 수 없습니다."})
            content["photobooth_page"]["backwalls"] = [entry for entry in gallery if entry.get("id") != item_id]
        else:
            category = query.get("category", [""])[0]
            if category not in {"background", "beauty", "webtoon", "meme", "figure"}:
                return self._json(HTTPStatus.BAD_REQUEST, {"message":"AI 콘텐츠 종류를 확인해 주세요."})
            gallery = content["photobooth_page"]["ai_content"][category]
            item = next((entry for entry in gallery if entry.get("id") == item_id), None)
            if not item: return self._json(HTTPStatus.NOT_FOUND, {"message":"삭제할 AI 콘텐츠 사진을 찾을 수 없습니다."})
            content["photobooth_page"]["ai_content"][category] = [entry for entry in gallery if entry.get("id") != item_id]
        write_json(CONTENT_FILE, content)
        delete_uploaded_image(item.get("image", ""))
        self._json(HTTPStatus.OK, self._all_data())

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None

    def _protected_path(self) -> bool:
        path = urlparse(self.path).path.lower()
        return path.startswith("/data/") or path in {"/server.py", "/start_admin.bat", "/사용방법.txt"}

    def _json(self, status: int, value: dict | list, extra_headers: dict | None = None):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, header_value in (extra_headers or {}).items(): self.send_header(name, header_value)
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> bytes:
        try: length = int(self.headers.get("Content-Length", "0"))
        except ValueError: raise ValueError("잘못된 요청입니다.")
        if length <= 0 or length > MAX_BODY: raise ValueError("전송할 내용이 없거나 파일이 너무 큽니다.")
        return self.rfile.read(length)

    def _read_json(self) -> dict:
        try: return json.loads(self._read_body().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError): raise ValueError("입력 내용을 확인해 주세요.")

    def _read_multipart(self) -> tuple[dict, dict]:
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type: raise ValueError("사진 업로드 형식이 올바르지 않습니다.")
        raw = self._read_body()
        header = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
        message = BytesParser(policy=policy.default).parsebytes(header + raw)
        fields, files = {}, {}
        for part in message.iter_parts():
            if part.get_content_disposition() != "form-data": continue
            name = part.get_param("name", header="content-disposition")
            filename = part.get_filename()
            payload = part.get_payload(decode=True) or b""
            if filename:
                files[name] = {"filename": filename, "data": payload}
            else:
                fields[name] = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        return fields, files

    def _cookie_token(self) -> str:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get("thepicks_admin")
        return morsel.value if morsel else ""

    def _authenticated(self) -> bool:
        token = self._cookie_token()
        expires = SESSIONS.get(token, 0)
        if expires < time.time():
            SESSIONS.pop(token, None)
            return False
        SESSIONS[token] = time.time() + SESSION_TTL
        return True

    def _require_auth(self) -> bool:
        if self._authenticated(): return True
        self._json(HTTPStatus.UNAUTHORIZED, {"message":"관리자 로그인이 필요합니다."})
        return False

    def _all_data(self) -> dict:
        content = load_content()
        return {"site": content.get("site", {}), "service": content.get("service", {}), "photobooth_page": content.get("photobooth_page", {}), "frames": content.get("frames", {}), "portfolio": content.get("portfolio", []), "inquiries": read_json(INQUIRY_FILE, [])}

    def _setup_admin(self):
        if ADMIN_FILE.exists(): return self._json(HTTPStatus.CONFLICT, {"message":"이미 관리자 비밀번호가 설정되어 있습니다."})
        password = clean_text(self._read_json().get("password"), 200, True)
        if len(password) < 8: raise ValueError("비밀번호는 8자 이상으로 설정해 주세요.")
        write_json(ADMIN_FILE, password_record(password))
        return self._new_session()

    def _login(self):
        if not ADMIN_FILE.exists(): return self._json(HTTPStatus.BAD_REQUEST, {"message":"먼저 관리자 비밀번호를 설정해 주세요."})
        password = clean_text(self._read_json().get("password"), 200, True)
        if not password_matches(password, read_json(ADMIN_FILE, {})):
            time.sleep(0.35)
            return self._json(HTTPStatus.UNAUTHORIZED, {"message":"비밀번호가 맞지 않습니다."})
        self._new_session()

    def _new_session(self):
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = time.time() + SESSION_TTL
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        cookie = f"thepicks_admin={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL}{secure}"
        self._json(HTTPStatus.OK, {"ok":True}, {"Set-Cookie":cookie})

    def _logout(self):
        SESSIONS.pop(self._cookie_token(), None)
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        self._json(HTTPStatus.OK, {"ok":True}, {"Set-Cookie":f"thepicks_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{secure}"})

    def _save_site(self):
        fields, _files = self._read_multipart()
        content = load_content()
        site = content.setdefault("site", {})
        for name, maximum in {"hero_eyebrow":60,"hero_title":60,"hero_accent":60,"hero_description":300}.items():
            site[name] = clean_text(fields.get(name), maximum, True)
        write_json(CONTENT_FILE, content)
        self._json(HTTPStatus.OK, self._all_data())

    def _save_hero_slide(self):
        _fields, files = self._read_multipart()
        content = load_content()
        slides = content["site"].setdefault("hero_slides", [])
        if len(slides) >= 5:
            raise ValueError("슬라이드 사진은 최대 5장까지 등록할 수 있습니다.")
        new_image = save_image(files.get("image"))
        if not new_image:
            raise ValueError("등록할 슬라이드 사진을 선택해 주세요.")
        slides.append({"id":uuid.uuid4().hex,"image":new_image,"created_at":now_text()})
        content["site"]["hero_image"] = slides[0]["image"]
        write_json(CONTENT_FILE, content)
        self._json(HTTPStatus.OK, self._all_data())

    def _save_service_photo(self):
        fields, files = self._read_multipart()
        slot = clean_text(fields.get("slot"), 30, True)
        if slot not in {"intro_image", "signature_image", "compact_image"}:
            raise ValueError("서비스 사진 위치를 확인해 주세요.")
        new_image = save_image(files.get("image"))
        if not new_image:
            raise ValueError("등록할 서비스 소개 사진을 선택해 주세요.")
        content = load_content()
        service = content.setdefault("service", {})
        old_image = service.get(slot, "")
        service[slot] = new_image
        write_json(CONTENT_FILE, content)
        delete_uploaded_image(old_image)
        self._json(HTTPStatus.OK, self._all_data())

    def _gallery_image(self, gallery: list, files: dict, maximum: int | None = None) -> None:
        if maximum is not None and len(gallery) >= maximum:
            raise ValueError(f"사진은 최대 {maximum}장까지 등록할 수 있습니다.")
        new_image = save_image(files.get("image"))
        if not new_image:
            raise ValueError("등록할 사진을 선택해 주세요.")
        gallery.append({"id": uuid.uuid4().hex, "image": new_image, "created_at": now_text()})

    def _save_photobooth_screen(self):
        _fields, files = self._read_multipart()
        content = load_content()
        self._gallery_image(content["photobooth_page"]["screens"], files)
        write_json(CONTENT_FILE, content)
        self._json(HTTPStatus.OK, self._all_data())

    def _save_ai_content(self):
        fields, files = self._read_multipart()
        category = clean_text(fields.get("category"), 20, True)
        if category not in {"background", "beauty", "webtoon", "meme", "figure"}:
            raise ValueError("AI 콘텐츠 종류를 확인해 주세요.")
        content = load_content()
        self._gallery_image(content["photobooth_page"]["ai_content"][category], files, 4)
        write_json(CONTENT_FILE, content)
        self._json(HTTPStatus.OK, self._all_data())

    def _save_backwall(self):
        _fields, files = self._read_multipart()
        content = load_content()
        self._gallery_image(content["photobooth_page"]["backwalls"], files)
        write_json(CONTENT_FILE, content)
        self._json(HTTPStatus.OK, self._all_data())

    def _frame_type(self, fields: dict) -> str:
        frame_type = clean_text(fields.get("frame_type"), 20, True)
        if frame_type not in {"basic", "ai", "collage"}:
            raise ValueError("프레임 종류를 확인해 주세요.")
        return frame_type

    def _save_frame_main(self):
        fields, files = self._read_multipart()
        frame_type = self._frame_type(fields)
        new_image = save_image(files.get("main_image"))
        if not new_image: raise ValueError("등록할 대표사진을 선택해 주세요.")
        content = load_content()
        old_image = content["frames"][frame_type].get("main_image", "")
        content["frames"][frame_type]["main_image"] = new_image
        write_json(CONTENT_FILE, content)
        delete_uploaded_image(old_image)
        self._json(HTTPStatus.OK, self._all_data())

    def _save_frame_gallery(self):
        fields, files = self._read_multipart()
        frame_type = self._frame_type(fields)
        new_image = save_image(files.get("image"))
        if not new_image: raise ValueError("등록할 샘플 사진을 선택해 주세요.")
        content = load_content()
        content["frames"][frame_type]["gallery"].append({"id":uuid.uuid4().hex,"image":new_image,"created_at":now_text()})
        write_json(CONTENT_FILE, content)
        self._json(HTTPStatus.OK, self._all_data())

    def _save_portfolio(self):
        fields, files = self._read_multipart()
        category = clean_text(fields.get("category"), 20, True)
        if category not in CATEGORY_NAMES: raise ValueError("게시글 분류를 선택해 주세요.")
        item_id = clean_text(fields.get("id"), 80)
        title = clean_text(fields.get("title"), 80, True)
        summary = clean_text(fields.get("summary"), 160, True)
        content = load_content()
        posts = content.setdefault("portfolio", [])
        existing = next((item for item in posts if item.get("id") == item_id), None) if item_id else None
        new_image = save_image(files.get("image"))
        if not existing and not new_image: raise ValueError("새 글에 사용할 사진을 선택해 주세요.")
        if existing:
            existing.update({"category":category,"title":title,"summary":summary})
            if new_image:
                old_image = existing.get("image", "")
                existing["image"] = new_image
                delete_uploaded_image(old_image)
        else:
            posts.insert(0, {"id":uuid.uuid4().hex,"category":category,"title":title,"summary":summary,"image":new_image,"created_at":now_text()})
        write_json(CONTENT_FILE, content)
        self._json(HTTPStatus.OK, self._all_data())

    def _create_inquiry(self):
        values = self._read_json()
        if not values.get("privacy"): raise ValueError("개인정보 수집 및 이용에 동의해 주세요.")
        event_type = clean_text(values.get("event_type"), 40, True)
        record = {
            "id": uuid.uuid4().hex,
            "created_at": now_text(),
            "status": "new",
            "name": clean_text(values.get("name"), 30, True),
            "phone": clean_text(values.get("phone"), 20, True),
            "email": clean_text(values.get("email"), 100),
            "event_type": event_type,
            "event_date": clean_text(values.get("event_date"), 20),
            "location": clean_text(values.get("location"), 80),
            "attendees": clean_text(values.get("attendees"), 20),
            "budget": clean_text(values.get("budget"), 50),
            "message": clean_text(values.get("message"), 2000, True)
        }
        inquiries = read_json(INQUIRY_FILE, [])
        inquiries.insert(0, record)
        write_json(INQUIRY_FILE, inquiries[:5000])
        self._json(HTTPStatus.CREATED, {"ok":True,"message":"견적 문의가 접수되었습니다."})

    def _save_inquiry_status(self):
        values = self._read_json()
        item_id = clean_text(values.get("id"), 80, True)
        status = values.get("status")
        if status not in {"new", "done"}: raise ValueError("상담 상태가 올바르지 않습니다.")
        inquiries = read_json(INQUIRY_FILE, [])
        item = next((entry for entry in inquiries if entry.get("id") == item_id), None)
        if not item: return self._json(HTTPStatus.NOT_FOUND, {"message":"문의 내역을 찾을 수 없습니다."})
        item["status"] = status
        write_json(INQUIRY_FILE, inquiries)
        self._json(HTTPStatus.OK, self._all_data())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--open", choices=["admin", "home", "none"], default="none")
    args = parser.parse_args()
    ensure_storage()
    url = f"http://{args.host}:{args.port}/{'admin.html' if args.open == 'admin' else 'index.html'}"
    if args.open != "none": threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    server = ThreadingHTTPServer((args.host, args.port), ThePicksHandler)
    print("\nTHE PICKS 홈페이지 서버가 실행되었습니다.")
    print(f"홈페이지: http://{args.host}:{args.port}/")
    print(f"관리자:   http://{args.host}:{args.port}/admin.html")
    print("종료하려면 이 창에서 Ctrl+C를 누르세요.\n")
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__ == "__main__":
    main()
