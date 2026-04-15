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
    """简单的 Markdown 解析器，支持标题、列表、表格、段落"""
    
    def parse(self, text):
        lines = text.split('\n')
        items = []
        i = 0
        
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            
            if not stripped:
                i += 1
                continue
            
            # 表格检测：以 | 开头，且至少包含两行（含表头分隔行）
            if stripped.startswith('|'):
                table_lines = []
                while i < len(lines) and lines[i].strip().startswith('|'):
                    table_lines.append(lines[i].strip())
                    i += 1
                table_item = self._parse_table(table_lines)
                if table_item:
                    items.append(table_item)
                continue
            
            if re.match(r'^-{3,}\s*$', stripped) or re.match(r'\*{3,}\s*$', stripped) or re.match(r'_{3,}\s*$', stripped):
                items.append({'type': 'hr'})
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
            while i < len(lines) and lines[i].strip() and not re.match(r'^#{1,3}\s|^[-*]\s|^\d+\.\s|^\|', lines[i]):
                para_lines.append(lines[i].strip())
                i += 1
            
            if para_lines:
                text_block = ' '.join(para_lines)
                text_block = self.parse_inline(text_block)
                items.append({'type': 'paragraph', 'text': text_block})
        
        return items
    
    def parse_inline(self, text):
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        return text
    
    def _parse_table(self, lines):
        """解析 Markdown 表格，返回 table item 或 None"""
        rows = []
        for line in lines:
            # 跳过表头分隔行 |---|---|
            if re.match(r'^\|[-:\s|]+\|$', line):
                continue
            # 提取单元格
            cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
            rows.append(cells)
        
        if len(rows) < 1:
            return None
        
        return {'type': 'table', 'rows': rows}


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
        elif item_type == 'hr':
            parts.append('<hr style="border:none;border-top:1px solid var(--border-color);margin:16px 0;">')
        elif item_type == 'paragraph':
            parts.append(f"<p>{item['text']}</p>")
        elif item_type == 'list':
            parts.append("<ul>")
            for li in item['items']:
                li_text = parser.parse_inline(li)
                parts.append(f"<li>{li_text}</li>")
            parts.append("</ul>")
        elif item_type == 'orderedList':
            parts.append("<ol>")
            for li in item['items']:
                li_text = parser.parse_inline(li)
                parts.append(f"<li>{li_text}</li>")
            parts.append("</ol>")
        elif item_type == 'table':
            parts.append('<div class="table-wrapper"><table style="width:100%;border-collapse:collapse;font-size:14px;">')
            for idx, row in enumerate(item['rows']):
                tag = 'th' if idx == 0 else 'td'
                parts.append("<tr>")
                for cell in row:
                    cell_text = parser.parse_inline(cell)
                    border = 'border:1px solid var(--border-color);'
                    bg = 'background:var(--bg-secondary);' if idx == 0 else ''
                    align = 'text-align:left;'
                    parts.append(f"<{tag} style=\"{border}{bg}{align}\">{cell_text}</{tag}>")
                parts.append("</tr>")
            parts.append("</table></div>")
    
    return ''.join(parts)


def load_config(script_dir):
    """加载配置文件 config.js，返回 {lang: {key: value}}"""
    config_path = os.path.join(script_dir, 'config.js')
    if not os.path.exists(config_path):
        return {}
    
    with open(config_path, 'r', encoding='utf-8') as f:
        js_content = f.read()
    
    # 去掉单行注释 //
    js_content = re.sub(r'//.*', '', js_content)
    # 去掉多行注释 /* */
    js_content = re.sub(r'/\*.*?\*/', '', js_content, flags=re.DOTALL)
    
    # 从 JS 内容中提取 JSON 对象（找 LegalConfig = 后面的 {）
    assign_idx = js_content.find('LegalConfig')
    if assign_idx == -1:
        return {}
    start = js_content.find('{', assign_idx)
    end = js_content.rfind('}')
    if start == -1 or end == -1 or end <= start:
        return {}
    
    try:
        raw = json.loads(js_content[start:end+1])
    except json.JSONDecodeError as e:
        print(f"[ERR] 解析 config.js 失败: {e}")
        return {}
    
    shared = raw.get('shared', {})
    result = {}
    for lang in ['zh', 'zh-Hant', 'en']:
        lang_config = shared.copy()
        lang_config.update(raw.get(lang, {}))
        result[lang] = lang_config
    
    return result


def substitute_vars(text, config):
    """将 {{VAR}} 替换为配置值"""
    for key, value in config.items():
        text = text.replace(f'{{{{{key}}}}}', str(value))
    return text


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
    
    config = load_config(script_dir)
    parser = SimpleMarkdownParser()
    
    # 数据结构: { lang: { docType: htmlContent } }
    legal_data = {}
    
    languages = ['zh', 'zh-Hant', 'en']
    doc_types = ['terms', 'privacy']
    
    for lang in languages:
        legal_data[lang] = {}
        lang_config = config.get(lang, {})
        
        for doc_type in doc_types:
            md_path = os.path.join(lang, f"{doc_type}.md")
            
            if not os.path.exists(md_path):
                print(f"[SKIP] 文件不存在: {md_path}")
                continue
            
            try:
                with open(md_path, 'r', encoding='utf-8') as f:
                    md_content = f.read()
                
                # 参数替换
                md_content = substitute_vars(md_content, lang_config)
                
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
