#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import http.server
import socketserver
import json
import sqlite3
import os
import urllib.parse
import threading
import gzip
import io
from pathlib import Path
from http.server import ThreadingHTTPServer

# 尝试使用 ujson，快 5-10 倍
try:
    import ujson
    JSON_ENCODE = ujson.dumps
    JSON_DECODE = ujson.loads
    print("[加速] 使用 ujson 进行 JSON 序列化")
except ImportError:
    JSON_ENCODE = json.dumps
    JSON_DECODE = json.loads
    print("[提示] pip install ujson 可获得 5 倍 JSON 性能提升")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "lumina_reader.db"

class Database:
    # 全局单例连接，所有线程复用
    _conn = None
    _lock = threading.Lock()
    _initialized = False
    
    def __init__(self):
        if not Database._initialized:
            self.init_db()
            Database._initialized = True
    
    @classmethod
    def get_conn(cls):
        """获取全局复用的数据库连接（线程安全）"""
        if cls._conn is None:
            with cls._lock:
                if cls._conn is None:
                    cls._conn = sqlite3.connect(
                        DB_PATH, 
                        check_same_thread=False
                        # 不使用 isolation_level=None，以便手动管理事务
                    )
                    cls._conn.row_factory = sqlite3.Row
                    
                    # 关键性能优化
                    cls._conn.execute("PRAGMA journal_mode=WAL")        # 读写不阻塞
                    cls._conn.execute("PRAGMA synchronous=NORMAL")      # 不强制等待磁盘
                    cls._conn.execute("PRAGMA cache_size=-64000")       # 64MB内存缓存
                    cls._conn.execute("PRAGMA temp_store=MEMORY")       # 临时表放内存
                    cls._conn.execute("PRAGMA mmap_size=268435456")     # 256MB内存映射
                    print("[SQLite] WAL模式已启用，连接已优化")
        return cls._conn
    
    def init_db(self):
        """初始化数据库表结构"""
        conn = self.get_conn()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS books (
                    fileKey TEXT PRIMARY KEY,
                    fileName TEXT NOT NULL,
                    fileType TEXT,
                    fileSize INTEGER DEFAULT 0,
                    content TEXT,
                    wordCount INTEGER DEFAULT 0,
                    lastChapter INTEGER DEFAULT 0,
                    lastScrollIndex INTEGER DEFAULT 0,
                    chapterTitle TEXT,
                    lastReadTime TEXT,
                    customRegex TEXT,
                    chapterNumbering TEXT DEFAULT 'none',
                    annotations TEXT,
                    cover TEXT,
                    heatMap TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # 索引优化查询
            conn.execute("CREATE INDEX IF NOT EXISTS idx_filename ON books(fileName)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_lastread ON books(lastReadTime)")
            # 为已存在的表添加 heatMap 字段（兼容旧数据库）
            try:
                conn.execute("ALTER TABLE books ADD COLUMN heatMap TEXT")
                print("[SQLite] 已添加 heatMap 字段")
            except sqlite3.OperationalError:
                pass  # 字段已存在
            print("[SQLite] 数据库初始化完成")
        except sqlite3.Error as e:
            print(f"[SQLite Error] 初始化失败: {e}")
            raise
    
    def save(self, fileKey, data):
        """保存或更新书籍（事务保证原子性）"""
        try:
            conn = self.get_conn()
            
            # 手动管理事务
            conn.execute("BEGIN IMMEDIATE")
            try:
                heat_map_json = JSON_ENCODE(data.get('heatMap')) if data.get('heatMap') is not None else None
                
                conn.execute("""
                    INSERT OR REPLACE INTO books (
                        fileKey, fileName, fileType, fileSize, content, wordCount,
                        lastChapter, lastScrollIndex, chapterTitle, lastReadTime,
                        customRegex, chapterNumbering, annotations, cover, heatMap, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (
                    fileKey,
                    data.get('fileName', ''),
                    data.get('fileType', 'txt'),
                    data.get('fileSize', 0),
                    JSON_ENCODE(data.get('content', [])),
                    data.get('wordCount', 0),
                    data.get('lastChapter', 0),
                    data.get('lastScrollIndex', 0),
                    data.get('chapterTitle', ''),
                    data.get('lastReadTime', ''),
                    JSON_ENCODE(data.get('customRegex', {})),
                    data.get('chapterNumbering', 'none'),
                    JSON_ENCODE(data.get('annotations', [])),
                    data.get('cover', None),
                    heat_map_json
                ))
                
                conn.execute("COMMIT")
                return True
            except Exception as e:
                conn.execute("ROLLBACK")
                raise e
                
        except sqlite3.Error as e:
            print(f"[DB Save Error] {e}", flush=True)
            return False
    
    def get(self, fileKey):
        """获取单本书（含 content）"""
        try:
            conn = self.get_conn()
            row = conn.execute(
                "SELECT * FROM books WHERE fileKey = ?", (fileKey,)
            ).fetchone()
            
            if not row:
                return None
            
            result = dict(row)
            if result.get('content'):
                result['content'] = JSON_DECODE(result['content'])
            if result.get('customRegex'):
                result['customRegex'] = JSON_DECODE(result['customRegex'])
            if result.get('annotations'):
                result['annotations'] = JSON_DECODE(result['annotations'])
            if result.get('heatMap'):
                result['heatMap'] = JSON_DECODE(result['heatMap'])
            return result
            
        except sqlite3.Error as e:
            print(f"[DB Get Error] {e}")
            return None
    
    def get_list(self):
        """获取列表（不含 content，但含 cover）"""
        try:
            conn = self.get_conn()
            rows = conn.execute("""
                SELECT fileKey, fileName, fileType, fileSize, wordCount, 
                    lastChapter, lastScrollIndex, chapterTitle, lastReadTime, 
                    chapterNumbering, updated_at, cover
                FROM books 
                ORDER BY lastReadTime DESC
            """).fetchall()
            return [dict(row) for row in rows]
        except sqlite3.Error as e:
            print(f"[DB List Error] {e}")
            return []
    
    def get_stats(self):
        """快速统计（预计算）"""
        try:
            conn = self.get_conn()
            row = conn.execute("""
                SELECT COUNT(*) as count, 
                       COALESCE(SUM(LENGTH(content)), 0) as content_size,
                       COALESCE(SUM(LENGTH(cover)), 0) as cover_size
                FROM books
            """).fetchone()
            
            total_mb = (row['content_size'] + row['cover_size']) / (1024 * 1024)
            return {
                'totalFiles': row['count'],
                'totalSize': round(total_mb, 2),
                'imageCount': 0
            }
        except sqlite3.Error as e:
            print(f"[DB Stats Error] {e}")
            return {'totalFiles': 0, 'totalSize': 0, 'imageCount': 0}
    
    def delete(self, fileKey):
        """删除书籍"""
        try:
            conn = self.get_conn()
            with conn:
                conn.execute("DELETE FROM books WHERE fileKey = ?", (fileKey,))
            return True
        except sqlite3.Error as e:
            print(f"[DB Delete Error] {e}")
            return False

# 全局数据库实例
db = Database()

class APIHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    
    def log_message(self, format, *args):
        # 精简日志，只打印 API 请求
        try:
            if args and isinstance(args[0], str) and '/api/' in args[0]:
                print(f"[{self.log_date_time_string()}] {args[0]}")
        except:
            pass
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        if path == '/api/health':
            self._send_json({'status': 'ok', 'mode': 'sqlite_optimized'})
        
        elif path == '/api/files':
            files = db.get_list()
            self._send_json(files)
        
        elif path.startswith('/api/file/'):
            fileKey = urllib.parse.unquote(path[10:])
            result = db.get(fileKey)
            self._send_json(result)
        
        elif path == '/api/stats':
            self._send_json(db.get_stats())
        
        else:
            super().do_GET()
    
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        content_len = int(self.headers.get('Content-Length', 0))
        
        if content_len > 100 * 1024 * 1024:  # 100MB 限制
            self._send_error(413, "Payload too large")
            return
        
        body = self.rfile.read(content_len)
        
        try:
            data = JSON_DECODE(body.decode('utf-8'))
        except:
            self._send_error(400, "Invalid JSON")
            return
        
        if path == '/api/save':
            success = db.save(data['fileKey'], data.get('data', {}))
            self._send_json({'success': success})
        
        elif path == '/api/batch':
            # 批量查询，减少 HTTP 往返
            requests = data.get('requests', [])
            results = []
            
            for req in requests:
                method = req.get('method')
                params = req.get('params', {})
                
                try:
                    if method == 'getList':
                        results.append(db.get_list())
                    elif method == 'getStats':
                        results.append(db.get_stats())
                    elif method == 'getFile':
                        results.append(db.get(params.get('fileKey')))
                    else:
                        results.append(None)
                except Exception as e:
                    results.append({'error': str(e)})
            
            self._send_json(results)
        
        else:
            self.send_error(404)
    
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        if path.startswith('/api/file/'):
            fileKey = urllib.parse.unquote(path[10:])
            success = db.delete(fileKey)
            self._send_json({'success': success})
        else:
            self.send_error(404)
    
    def _send_json(self, data):
        """发送 JSON，自动压缩大响应"""
        self.send_response(200)
        
        json_bytes = JSON_ENCODE(data, ensure_ascii=False).encode('utf-8')
        
        # 大于 1KB 启用 gzip
        if len(json_bytes) > 1024 and 'gzip' in self.headers.get('Accept-Encoding', ''):
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb') as f:
                f.write(json_bytes)
            compressed = buf.getvalue()
            
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', len(compressed))
            self.end_headers()
            self.wfile.write(compressed)
        else:
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(json_bytes))
            self.end_headers()
            self.wfile.write(json_bytes)
    
    def _send_error(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(JSON_ENCODE({'error': message}).encode('utf-8'))

class LargeRequestHandler(APIHandler):
    """支持大请求的处理类"""
    timeout = 300  # 5分钟超时

def run_server(port=8080):
    # 增加socket缓冲区大小
    socketserver.TCPServer.allow_reuse_address = True
    
    with ThreadingHTTPServer(("", port), LargeRequestHandler) as httpd:
        print(f"=" * 60)
        print(f"流萤阅读器服务器 [优化版]")
        print(f"访问: http://localhost:{port}")
        print(f"优化: 单连接复用 + WAL模式 + 智能缓存")
        print(f"请求限制: 100MB")
        print(f"=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[服务器] 正在关闭...")
            # 优雅关闭时提交 WAL
            if Database._conn:
                Database._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                Database._conn.close()
                print("[SQLite] 已安全关闭")

if __name__ == '__main__':
    run_server()