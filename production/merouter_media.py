#!/usr/bin/env python3
"""Auditable Merouter media jobs. No POST retries. Credentials stay on curl stdin."""
from __future__ import annotations
import argparse
import base64
import contextlib
import datetime as dt
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import socket
import subprocess
import tempfile
from urllib.parse import quote, urljoin, urlsplit

BASE = 'https://merouter.play.one2x.ai'
ENDPOINTS = {'image': '/v1/images/generations', 'music': '/v1/music/generations', 'speech': '/v1/audio/speech', 'chat': '/v1/chat/completions'}
DEFAULT_CATALOG = Path(__file__).resolve().parents[1] / 'production-v2/merouter/models-live.json'
TERMINAL = {'completed', 'failed', 'unknown', 'corrupt'}

class AdapterError(RuntimeError): pass
class TransportError(AdapterError): pass

def load_credentials(environ=None, shell_config=None):
    """Read only two constant exports; never source/execute a shell profile."""
    environment = os.environ if environ is None else environ
    names = ('MEROUTER_SERVICE_KEY', 'MEROUTER_API_KEY')
    values = {name: environment.get(name) for name in names}
    if not any(values.values()):
        path = Path(shell_config) if shell_config is not None else Path.home()/'.zshrc'
        try:
            with path.open() as stream:
                for line in stream:
                    if not re.match(r'^\s*export\s+(MEROUTER_SERVICE_KEY|MEROUTER_API_KEY)=', line): continue
                    try: words = shlex.split(line, comments=True, posix=True)
                    except ValueError: continue
                    if len(words) != 2 or words[0] != 'export' or '=' not in words[1]: continue
                    name, value = words[1].split('=', 1)
                    # Reject expansions and shell expressions rather than guessing their value.
                    if name in names and value and not any(char in value for char in ('$', '`', ';', '\n', '\r')):
                        values[name] = value
        except (FileNotFoundError, PermissionError): pass
    for name in names:
        value = values.get(name)
        if value:
            if not isinstance(value, str) or '\n' in value or '\r' in value: raise AdapterError('Merouter credentials are invalid')
            return ('X-Service-Key' if name == names[0] else 'X-Api-Key'), value
    raise AdapterError('Merouter credentials are missing; no request was submitted')

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def encoded(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
def digest(value): return hashlib.sha256(value).hexdigest()
def clean_error(value):
    text = str(value)
    for key in ('MEROUTER_SERVICE_KEY', 'MEROUTER_API_KEY'):
        if os.environ.get(key): text = text.replace(os.environ[key], '[REDACTED]')
    text = re.sub(r'https?://[^\s\"\x27]+', '[URL REDACTED]', text)
    text = re.sub(r'\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}', '[TOKEN REDACTED]', text)
    return text[:350]

def private_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(prefix='.write-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'wb') as stream: stream.write(data)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

def read_json(path): return json.loads(Path(path).read_text())
def json_write(path, value): private_write(path, json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode())

def validate_recipe(recipe, catalog):
    if not isinstance(recipe, dict): raise AdapterError('Recipe must be an object')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', str(recipe.get('id', ''))): raise AdapterError('Invalid recipe id')
    kind = recipe.get('kind')
    if kind not in ENDPOINTS or recipe.get('endpoint') != ENDPOINTS[kind]: raise AdapterError('Kind/endpoint is not allowlisted')
    basename = recipe.get('output_basename', recipe['id'])
    if not isinstance(basename, str) or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}', basename): raise AdapterError('Unsafe output_basename')
    payload = recipe.get('payload')
    if not isinstance(payload, dict) or not isinstance(payload.get('model'), str): raise AdapterError('Payload model is required')
    encoded(payload)
    rows = catalog.get('data', catalog.get('models', [])) if isinstance(catalog, dict) else catalog
    if isinstance(rows, dict): rows = rows.get('data', rows.get('items', []))
    model = next((row for row in rows if row.get('id') == payload['model']), None)
    if model is None: raise AdapterError('Model is absent from the verified catalog')
    modality = {'image': 'image', 'music': 'audio', 'speech': 'audio', 'chat': 'llm'}[kind]
    if model.get('merouter_modalities') and modality not in model['merouter_modalities']: raise AdapterError('Model modality does not support this recipe kind')
    support = model.get('merouter_parameter_support')
    domains = model.get('merouter_parameter_domains')
    if support is None: raise AdapterError('Model parameter support is unknown; refusing to guess')
    allowed = set(support) | set(domains or {}) | {'model'}
    unknown = set(payload) - allowed
    if unknown: raise AdapterError('Unsupported payload parameters: ' + ', '.join(sorted(unknown)))
    for key, domain in (domains or {}).items():
        if key not in payload: continue
        value = payload[key]
        def equal(a, b): return a == b and (isinstance(a, bool) == isinstance(b, bool))
        if 'const' in domain and not equal(value, domain['const']): raise AdapterError(f'Parameter {key} violates const domain')
        if 'enum' in domain and not any(equal(value, item) for item in domain['enum']): raise AdapterError(f'Parameter {key} violates enum domain')
        for bound, compare in [('minimum', lambda x, y: x < y), ('maximum', lambda x, y: x > y)]:
            if domain.get(bound) is not None:
                if isinstance(value, bool) or not isinstance(value, (int, float)) or compare(value, domain[bound]): raise AdapterError(f'Parameter {key} violates {bound} domain')
    required = {'image': 'prompt', 'music': 'prompt', 'speech': 'input', 'chat': 'messages'}[kind]
    if required not in payload: raise AdapterError(f'Required payload parameter missing: {required}')
    return model

def public_https_target(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443): raise AdapterError('Artifact URL must use public HTTPS without userinfo')
    host = parsed.hostname.lower().rstrip('.')
    if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')): raise AdapterError('Local artifact host is forbidden')
    try:
        records = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        addresses = sorted({row[4][0] for row in records})
    except OSError as error: raise TransportError('Artifact DNS resolution failed') from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses): raise AdapterError('Private or non-global artifact address is forbidden')
    address = addresses[0]
    return host, '[' + address + ']' if ':' in address else address

class Response:
    def __init__(self, status, body, headers=None):
        self.status, self.body = int(status), body
        self.headers = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
        self.content_type = self.headers.get('content-type', '').split(';')[0].lower()
        length = self.headers.get('content-length')
        if length and length.isdigit() and int(length) != len(body): raise TransportError('Incomplete HTTP content-length')
    def json(self): return json.loads(self.body)

class CurlTransport:
    def __init__(self, directory): self.directory, self._credentials = Path(directory), None
    def preflight(self):
        if self._credentials is None: self._credentials = load_credentials()
        return self._credentials
    def request(self, method, url, payload=None, *, auth=False, timeout=180):
        if auth and not url.startswith(BASE + '/v1/'): raise AdapterError('Authenticated request escaped Merouter origin')
        for redirect in range(6):
            config = [f'url = {json.dumps(url, ensure_ascii=False)}']
            args = ['/usr/bin/curl', '--silent', '--show-error', '--http1.1', '--proto', '=https', '--connect-timeout', '15', '--max-time', str(timeout), '--request', method, '--config', '-']
            if auth:
                header, key = self.preflight()
                config.append('header = ' + json.dumps(header + ': ' + key, ensure_ascii=False))
            else:
                host, address = public_https_target(url)
                args += ['--noproxy', '*', '--resolve', f'{host}:443:{address}']
            if payload is not None:
                # curl config understands quoted strings, not JSON's \uXXXX escape.
                # Keep actual UTF-8 here; outer quoting still preserves the JSON
                # body's backslash escapes, embedded quotes, and line breaks.
                config += ['header = "Content-Type: application/json"', 'data = ' + json.dumps(encoded(payload).decode(), ensure_ascii=False)]
            with tempfile.TemporaryDirectory(prefix='.http-', dir=self.directory) as tmp:
                body_path, headers_path = Path(tmp)/'body', Path(tmp)/'headers'
                args += ['--output', str(body_path), '--dump-header', str(headers_path), '--write-out', '%{http_code}']
                try:
                    proc = subprocess.run(args, input=('\n'.join(config)+'\n').encode(), capture_output=True, timeout=timeout+10)
                except subprocess.TimeoutExpired as error: raise TransportError('Transport timeout; request outcome may be unknown') from error
                if proc.returncode: raise TransportError(f'curl transport failed (code {proc.returncode}); no POST retry')
                try: status = int(proc.stdout.decode().strip())
                except ValueError as error: raise TransportError('Missing HTTP status') from error
                headers = {}
                for line in headers_path.read_text(errors='replace').splitlines():
                    if line.startswith('HTTP/'): headers = {}
                    elif ':' in line:
                        name, value = line.split(':', 1); headers[name.lower()] = value.strip()
                body = body_path.read_bytes()
            if status in (301, 302, 303, 307, 308):
                if auth: raise AdapterError('Authenticated redirects are not followed')
                if method != 'GET' or not headers.get('location'): raise AdapterError('Unexpected artifact redirect')
                url = urljoin(url, headers['location'])
                continue
            return Response(status, body, headers)
        raise AdapterError('Artifact redirect limit exceeded')

def media_format(data, kind):
    if len(data) < 32: raise AdapterError('Media is too short to be valid')
    if kind == 'image':
        if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'png', 'image/png'
        if data.startswith(b'\xff\xd8\xff'): return 'jpg', 'image/jpeg'
        if data[:4] == b'RIFF' and data[8:12] == b'WEBP': return 'webp', 'image/webp'
    else:
        if data[:4] == b'RIFF' and data[8:12] == b'WAVE': return 'wav', 'audio/wav'
        if data.startswith(b'ID3') or (data[0] == 255 and data[1] & 224 == 224): return 'mp3', 'audio/mpeg'
        if data.startswith(b'OggS'): return 'ogg', 'audio/ogg'
        if data.startswith(b'fLaC'): return 'flac', 'audio/flac'
        if data[4:8] == b'ftyp': return 'm4a', 'audio/mp4'
    raise AdapterError('Media signature does not match expected kind')

class Adapter:
    def __init__(self, run_dir, transport=None):
        self.root = Path(run_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.root, 0o700)
        self.transport = transport or CurlTransport(self.root)
        self.ledger_path = self.root/'ledger.json'
    @contextlib.contextmanager
    def lock(self):
        fd = os.open(self.root/'.lock', os.O_CREAT | os.O_RDWR, 0o600)
        try:
            try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error: raise AdapterError('Run directory is locked by another process') from error
            yield
        finally: os.close(fd)
    def save(self, ledger):
        ledger['updated_at'] = now(); json_write(self.ledger_path, ledger)
    def raw(self, name, response):
        target = self.root/name
        sequence = 2
        while target.exists():
            target = self.root/f'{Path(name).stem}-{sequence}{Path(name).suffix}'
            sequence += 1
        private_write(target, response.body)
        return {'path': str(target), 'sha256': digest(response.body), 'bytes': len(response.body), 'http_status': response.status, 'content_type': response.content_type}
    def audit_completed(self, ledger):
        if ledger['status'] != 'completed': return ledger
        if not ledger.get('files') or any(not Path(item['path']).is_file() or digest(Path(item['path']).read_bytes()) != item['sha256'] for item in ledger['files']):
            ledger.update(status='corrupt', error='Recorded artifact is missing or changed; no resubmission is allowed')
            self.save(ledger)
        return ledger
    def run(self, recipe, catalog):
        validate_recipe(recipe, catalog)
        request_hash = digest(encoded({'endpoint': recipe['endpoint'], 'payload': recipe['payload']}))
        with self.lock():
            if self.ledger_path.exists():
                ledger = read_json(self.ledger_path)
                if ledger.get('request_hash') != request_hash or ledger.get('recipe_sha256') != digest(encoded(recipe)): raise AdapterError('Run directory already belongs to a different request')
                if ledger['status'] == 'submitting': ledger.update(status='unknown', error='Previous POST was interrupted; no resubmission is allowed'); self.save(ledger)
                return self.audit_completed(ledger)
            # Missing local credentials are a preflight failure, not an uncertain POST.
            # Injected mock transports may omit this hook; the real curl transport cannot.
            if callable(getattr(self.transport, 'preflight', None)): self.transport.preflight()
            json_write(self.root/'request.json', recipe)
            ledger = {'version': 1, 'recipe_id': recipe['id'], 'kind': recipe['kind'], 'model': recipe['payload']['model'], 'endpoint': recipe['endpoint'], 'request_hash': request_hash, 'recipe_sha256': digest(encoded(recipe)), 'catalog_sha256': digest(encoded(catalog)), 'created_at': now(), 'status': 'submitting', 'files': [], 'responses': []}
            self.save(ledger)  # Durable reservation BEFORE the only POST.
            try:
                response = self.transport.request('POST', BASE+recipe['endpoint'], recipe['payload'], auth=True, timeout=180 if recipe['kind'] in ('image', 'music') else 120)
                ledger['responses'].append(self.raw('response.raw', response))
                ledger['active_response_path'] = ledger['responses'][-1]['path']
                if not 200 <= response.status < 300:
                    ledger.update(status='unknown' if response.status >= 500 else 'failed', error=f'Generation returned HTTP {response.status}; no automatic resubmission')
                    self.save(ledger); return ledger
                self.accept_response(ledger, response)
                if ledger['status'] in ('ready', 'response_received'): self.collect_locked(ledger)
            except Exception as error:
                # A response already saved can be collected without another POST.
                ledger.update(status='collection_failed' if ledger['responses'] else 'unknown', error=clean_error(error))
                self.save(ledger)
            return ledger
    def accept_response(self, ledger, response):
        try: payload = response.json()
        except (ValueError, UnicodeDecodeError):
            ledger['response_binary'] = True; ledger['status'] = 'response_received'; self.save(ledger); return
        json_write(self.root/'response.json', payload)
        ledger.pop('response_binary', None)
        if isinstance(payload, dict) and payload.get('error'):
            ledger.update(status='failed', error='Provider returned an error object; inspect private response.json'); self.save(ledger); return
        if isinstance(payload, dict) and payload.get('usage') is not None: ledger['usage'] = payload['usage']
        if ledger['kind'] != 'music': ledger['status'] = 'response_received'; self.save(ledger); return
        data = payload.get('data') if isinstance(payload, dict) else None
        nested = data if isinstance(data, dict) else {}
        job_id = (payload.get('id') or payload.get('music_id') or nested.get('id') or nested.get('music_id')) if isinstance(payload, dict) else None
        if job_id: ledger['job_id'] = str(job_id)
        remote_status = str(payload.get('status') or nested.get('status') or '').lower() if isinstance(payload, dict) else ''
        ledger['remote_status'] = remote_status
        if remote_status in ('failed', 'error', 'cancelled', 'canceled'): ledger.update(status='failed', error='Music job ended without a completed artifact')
        elif remote_status in ('completed', 'complete', 'succeeded', 'success', 'done'): ledger['status'] = 'ready'
        elif ledger.get('job_id'): ledger['status'] = 'pending'
        else: ledger['status'] = 'response_received'
        self.save(ledger)
    def poll(self):
        with self.lock():
            ledger = read_json(self.ledger_path)
            if ledger['status'] in TERMINAL: return self.audit_completed(ledger)
            if ledger['kind'] != 'music' or not ledger.get('job_id'): raise AdapterError('No pollable music job id is recorded')
            try:
                url = BASE+'/v1/music/'+quote(ledger['job_id'], safe='')
                response = self.transport.request('GET', url, auth=True, timeout=120)
                ledger['responses'].append(self.raw('poll-response.raw', response))
                ledger['active_response_path'] = ledger['responses'][-1]['path']
                if not 200 <= response.status < 300:
                    ledger['error'] = f'Poll HTTP {response.status}; same job retained'; self.save(ledger); return ledger
                self.accept_response(ledger, response)
                if ledger['status'] == 'ready': self.collect_locked(ledger)
            except Exception as error: ledger['error'] = clean_error(error); self.save(ledger)
            return ledger
    def collect(self):
        with self.lock():
            ledger = read_json(self.ledger_path)
            if ledger['status'] in TERMINAL: return self.audit_completed(ledger)
            if ledger['status'] == 'submitting': ledger.update(status='unknown', error='Interrupted submission cannot be collected without a recorded response'); self.save(ledger); return ledger
            if ledger['status'] == 'pending': return ledger
            try: self.collect_locked(ledger)
            except Exception as error: ledger.update(status='collection_failed', error=clean_error(error)); self.save(ledger)
            return ledger
    def artifact(self, ledger, basename, data, kind, suffix=''):
        extension, content_type = media_format(data, kind)
        target = self.root/'artifacts'/f'{basename}{suffix}.{extension}'
        private_write(target, data)
        ledger['files'].append({'path': str(target), 'sha256': digest(data), 'bytes': len(data), 'content_type': content_type})
    def collect_locked(self, ledger):
        recipe = read_json(self.root/'request.json')
        basename = recipe.get('output_basename', recipe['id'])
        ledger['files'] = []
        if ledger.get('response_binary'):
            self.artifact(ledger, basename, Path(ledger.get('active_response_path', self.root/'response.raw')).read_bytes(), ledger['kind'])
        elif ledger['kind'] == 'chat':
            payload = read_json(self.root/'response.json')
            content = payload.get('choices', [{}])[0].get('message', {}).get('content')
            if isinstance(content, list): content = '\n'.join(part.get('text', '') for part in content if isinstance(part, dict))
            if not isinstance(content, str) or not content: raise AdapterError('Chat response contains no text content')
            try: data = json.loads(content); target = self.root/'content.json'; json_write(target, data)
            except json.JSONDecodeError: target = self.root/'content.txt'; private_write(target, content.encode())
            ledger['files'].append({'path': str(target), 'sha256': digest(target.read_bytes()), 'bytes': target.stat().st_size, 'content_type': 'application/json' if target.suffix == '.json' else 'text/plain'})
            ledger['semantic_validation'] = {'status': 'not_performed', 'note': 'Completion means content was extracted; downstream schema and artistic validity are not verified.'}
        else:
            payload = read_json(self.root/'response.json')
            if ledger['kind'] == 'music' and ledger.get('job_id'):
                response = self.transport.request('GET', BASE+'/v1/music/'+quote(ledger['job_id'], safe='')+'/content', auth=True, timeout=180)
                ledger['responses'].append(self.raw('content-response.raw', response))
                if response.status in (404, 409):
                    code = ''
                    try: code = response.json().get('error', {}).get('code', '')
                    except (ValueError, AttributeError): pass
                    ledger.update(status='failed' if 'archive_failed' in code else 'archival_pending', error='Artifact archival failed' if 'archive_failed' in code else 'Artifact archive is not ready; poll/collect the same job later')
                    self.save(ledger); return
                if not 200 <= response.status < 300: raise AdapterError(f'Content download HTTP {response.status}')
                try: payload = response.json()
                except (ValueError, UnicodeDecodeError): payload = None
                if payload is None:
                    self.artifact(ledger, basename, response.body, 'music')
            if not ledger['files']:
                rows = payload.get('data', payload) if isinstance(payload, dict) else payload
                if isinstance(rows, dict): rows = [rows]
                if not isinstance(rows, list) or not rows: raise AdapterError('Response has no recognizable media result')
                for index, row in enumerate(rows):
                    if not isinstance(row, dict): raise AdapterError('Unrecognized media result row')
                    audio = row.get('audio') or {}
                    b64 = row.get('b64_json') or (audio.get('data') if isinstance(audio, dict) else None)
                    url = row.get('url') or row.get('audio_url') or row.get('download_url')
                    if b64:
                        try: data = base64.b64decode(b64, validate=True)
                        except (ValueError, TypeError) as error: raise AdapterError('Malformed base64 media') from error
                    elif url:
                        # Deliberately no authenticated client or API headers on artifact origins.
                        response = self.transport.request('GET', url, auth=False, timeout=180)
                        if not 200 <= response.status < 300: raise AdapterError(f'External artifact HTTP {response.status}')
                        data = response.body
                    else: raise AdapterError('Media row has neither base64 content nor a downloadable URL')
                    self.artifact(ledger, basename, data, ledger['kind'], f'-{index+1}' if len(rows) > 1 else '')
        ledger.update(status='completed', completed_at=now())
        ledger.pop('error', None)
        self.save(ledger)

def public_result(ledger):
    return {key: ledger[key] for key in ('recipe_id', 'model', 'status') if key in ledger} | {'localfiles': [item['path'] for item in ledger.get('files', [])], **({'error': clean_error(ledger['error'])} if ledger.get('error') else {})}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('run', 'poll', 'collect'):
        command = commands.add_parser(name); command.add_argument('--run-dir', required=True)
        if name == 'run':
            command.add_argument('--recipe', required=True); command.add_argument('--catalog', default=str(DEFAULT_CATALOG)); command.add_argument('--dry-run', action='store_true')
    args = parser.parse_args(argv)
    try:
        if args.command == 'run':
            recipe, catalog = read_json(args.recipe), read_json(args.catalog)
            validate_recipe(recipe, catalog)
            if args.dry_run:
                print(json.dumps({'recipe_id': recipe['id'], 'model': recipe['payload']['model'], 'status': 'validated', 'localfiles': []}, ensure_ascii=False)); return 0
            result = Adapter(args.run_dir).run(recipe, catalog)
        else: result = getattr(Adapter(args.run_dir), args.command)()
        print(json.dumps(public_result(result), ensure_ascii=False))
        return 1 if result['status'] in ('failed', 'unknown', 'corrupt', 'collection_failed') else 0
    except Exception as error:
        print(json.dumps({'status': 'error', 'localfiles': [], 'error': clean_error(error)}, ensure_ascii=False)); return 1

if __name__ == '__main__': raise SystemExit(main())
