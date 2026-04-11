#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 legal 目录下的 MD 文件转换为 JS 模块
生成 legal-content.js，包含所有协议内容的内嵌字符串

使用方法:
    python build_legal_js.py
"""

import os
import re
import json
import html
from datetime import datetime

class SimpleMarkdownParser:
    """简单的 Markdown 解析器"""
    
    def parse(self, text):
        lines = text.split('\n')
        items = []
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            if not line.strip():
                i += 1
                continue
            
            if line.startswith('# '):
                items.append({'type': 'h1', 'text': line[2:].strip()})
                i += 1
                continue
            
            if line.startswith('## '):
                items.append({'type': 'h2', 'text': line[3:].strip()})
                i += 1
                continue
            
            if line.startswith('### '):
                items.append({'type': 'h3', 'text': line[4:].strip()})
                i += 1
                continue
            
            if re.match(r'^[-*]\s', line):
                list_items = []
                while i < len(lines) and re.match(r'^[-*]\s', lines[i]):
                    list_items.append(lines[i][2:].strip())
                    i += 1
                items.append({'type': 'list', 'items': list_items})
                continue
            
            if re.match(r'^\d+\.\s', line):
                list_items = []
                while i < len(lines) and re.match(r'^\d+\.\s', lines[i]):
                    list_items.append(re.sub(r'^\d+\.\s', '', lines[i]).strip())
                    i += 1
                items.append({'type': 'orderedList', 'items': list_items})
                continue
            
            para_lines = []
            while i < len(lines) and lines[i].strip() and not re.match(r'^#{1,3}\s|^[-*]\s|^\d+\.\s', lines[i]):
                para_lines.append(lines[i].strip())
                i += 1
            
            if para_lines:
                text = ' '.join(para_lines)
                text = self.parse_inline(text)
                items.append({'type': 'paragraph', 'text': text})
        
        return items
    
    def parse_inline(self, text):
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        return text


def render_to_html(items, parser):
    """将解析后的 items 渲染为 HTML 字符串"""
    parts = []
    
    for item in items:
        item_type = item['type']
        
        if item_type == 'h1':
            parts.append(f"<h1>{html.escape(item['text'])}</h1>")
        elif item_type == 'h2':
            parts.append(f"<h2>{html.escape(item['text'])}</h2>")
        elif item_type == 'h3':
            parts.append(f"<h3>{html.escape(item['text'])}</h3>")
        elif item_type == 'paragraph':
            parts.append(f"<p>{item['text']}</p>")
        elif item_type == 'list':
            parts.append("<ul>")
            for li in item['items']:
                # 处理列表项中的行内格式
                li_text = parser.parse_inline(li)
                parts.append(f"<li>{li_text}</li>")
            parts.append("</ul>")
        elif item_type == 'orderedList':
            parts.append("<ol>")
            for li in item['items']:
                # 处理列表项中的行内格式
                li_text = parser.parse_inline(li)
                parts.append(f"<li>{li_text}</li>")
            parts.append("</ol>")
    
    return ''.join(parts)


def escape_js_string(s):
    """转义 JS 字符串"""
    s = s.replace('\\', '\\\\')
    s = s.replace("'", "\\'")
    s = s.replace('"', '\\"')
    s = s.replace('\n', '\\n')
    s = s.replace('\r', '\\r')
    return s


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print(f"工作目录: {script_dir}")
    print("开始构建法律协议 JS 模块...\n")
    
    parser = SimpleMarkdownParser()
    
    # 数据结构: { lang: { docType: htmlContent } }
    legal_data = {}
    
    languages = ['zh', 'zh-Hant', 'en']
    doc_types = ['terms', 'privacy']
    
    for lang in languages:
        legal_data[lang] = {}
        for doc_type in doc_types:
            md_path = os.path.join(lang, f"{doc_type}.md")
            
            if not os.path.exists(md_path):
                print(f"[SKIP] 文件不存在: {md_path}")
                continue
            
            try:
                with open(md_path, 'r', encoding='utf-8') as f:
                    md_content = f.read()
                
                items = parser.parse(md_content)
                html_content = render_to_html(items, parser)
                legal_data[lang][doc_type] = html_content
                print(f"[OK] 已处理: {md_path}")
            except Exception as e:
                print(f"[ERR] 处理失败: {md_path} - {e}")
    
    # 生成 JS 文件
    js_content = generate_js_module(legal_data)
    
    output_path = os.path.join('..', 'js', 'modules', 'legal-content.js')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"\n{'='*50}")
    print(f"生成成功: {output_path}")
    print(f"包含 {sum(len(docs) for docs in legal_data.values())} 个文档")
    print(f"{'='*50}")


def generate_js_module(legal_data):
    """生成 JS 模块代码"""
    
    # 构建 JS 对象字符串
    data_str = json.dumps(legal_data, ensure_ascii=False, indent=4)
    
    return f"""// ==================== 法律协议内容模块 ====================
// 由 build_legal_js.py 自动生成，请勿手动修改
// 生成时间: {datetime.now().isoformat()}

Lumina.LegalContent = {data_str};

// 获取指定语言和类型的协议内容
Lumina.LegalContent.get = function(lang, type) {{
    return this[lang]?.[type] || this['zh']?.[type] || '';
}};
"""


if __name__ == '__main__':
    main()
