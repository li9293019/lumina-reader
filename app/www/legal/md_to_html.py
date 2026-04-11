#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown 转 HTML 工具
遍历当前目录及子目录，将所有 .md 文件转换为同名 .html
纯结构 HTML，无内嵌样式

使用方法:
    python md_to_html.py
    或双击 convert.bat
"""

import os
import re
import html

class SimpleMarkdownParser:
    """简单的 Markdown 解析器"""
    
    def parse(self, text):
        lines = text.split('\n')
        items = []
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            # 空行
            if not line.strip():
                i += 1
                continue
            
            # H1: # 标题
            if line.startswith('# '):
                items.append({
                    'type': 'h1',
                    'text': line[2:].strip()
                })
                i += 1
                continue
            
            # H2: ## 标题
            if line.startswith('## '):
                items.append({
                    'type': 'h2',
                    'text': line[3:].strip()
                })
                i += 1
                continue
            
            # H3: ### 标题
            if line.startswith('### '):
                items.append({
                    'type': 'h3',
                    'text': line[4:].strip()
                })
                i += 1
                continue
            
            # 无序列表
            if re.match(r'^[-*]\s', line):
                list_items = []
                while i < len(lines) and re.match(r'^[-*]\s', lines[i]):
                    list_items.append(lines[i][2:].strip())
                    i += 1
                items.append({
                    'type': 'list',
                    'items': list_items
                })
                continue
            
            # 有序列表
            if re.match(r'^\d+\.\s', line):
                list_items = []
                while i < len(lines) and re.match(r'^\d+\.\s', lines[i]):
                    list_items.append(re.sub(r'^\d+\.\s', '', lines[i]).strip())
                    i += 1
                items.append({
                    'type': 'orderedList',
                    'items': list_items
                })
                continue
            
            # 段落（处理多行）
            para_lines = []
            while i < len(lines) and lines[i].strip() and not re.match(r'^#{1,3}\s|^[-*]\s|^\d+\.\s', lines[i]):
                para_lines.append(lines[i].strip())
                i += 1
            
            if para_lines:
                text = ' '.join(para_lines)
                text = self.parse_inline(text)
                items.append({
                    'type': 'paragraph',
                    'text': text
                })
        
        return items
    
    def parse_inline(self, text):
        # 粗体 **text**
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        # 斜体 *text*
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        return text


class HtmlGenerator:
    """HTML 生成器 - 纯结构，无样式"""
    
    def __init__(self, parser=None):
        self.parser = parser
    
    def generate(self, items, lang='zh'):
        body_parts = []
        
        for item in items:
            item_type = item['type']
            
            if item_type == 'h1':
                body_parts.append(f"    <h1>{html.escape(item['text'])}</h1>")
            
            elif item_type == 'h2':
                body_parts.append(f"    <h2>{html.escape(item['text'])}</h2>")
            
            elif item_type == 'h3':
                body_parts.append(f"    <h3>{html.escape(item['text'])}</h3>")
            
            elif item_type == 'paragraph':
                body_parts.append(f"    <p>{item['text']}</p>")
            
            elif item_type == 'list':
                body_parts.append("    <ul>")
                for li in item['items']:
                    # 处理列表项中的行内格式
                    li_text = self.parser.parse_inline(li) if self.parser else html.escape(li)
                    body_parts.append(f"        <li>{li_text}</li>")
                body_parts.append("    </ul>")
            
            elif item_type == 'orderedList':
                body_parts.append("    <ol>")
                for li in item['items']:
                    # 处理列表项中的行内格式
                    li_text = self.parser.parse_inline(li) if self.parser else html.escape(li)
                    body_parts.append(f"        <li>{li_text}</li>")
                body_parts.append("    </ol>")
        
        body = '\n'.join(body_parts)
        
        return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title></title>
</head>
<body>
{body}
</body>
</html>"""


def convert_md_to_html(md_path):
    """转换单个 MD 文件为 HTML"""
    parser = SimpleMarkdownParser()
    generator = HtmlGenerator(parser)
    
    # 读取 MD 文件
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
    
    # 解析
    items = parser.parse(md_content)
    
    # 生成 HTML
    # 从文件路径推断语言 (zh, zh-Hant, en)
    parts = md_path.split(os.sep)
    lang = 'zh'
    for part in parts:
        if part in ['zh', 'zh-Hant', 'en']:
            lang = part
            break
    
    html_content = generator.generate(items, lang)
    
    # 生成输出路径
    html_path = md_path.replace('.md', '.html')
    
    # 写入 HTML 文件
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    return html_path


def main():
    """主函数：遍历当前目录及子目录，转换所有 MD 文件"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print(f"工作目录: {script_dir}")
    print("开始扫描 Markdown 文件...\n")
    
    converted = []
    errors = []
    
    # 遍历目录
    for root, dirs, files in os.walk('.'):
        for filename in files:
            if filename.endswith('.md'):
                md_path = os.path.join(root, filename)
                try:
                    html_path = convert_md_to_html(md_path)
                    converted.append((md_path, html_path))
                    print(f"[OK] 转换成功: {md_path} -> {html_path}")
                except Exception as e:
                    errors.append((md_path, str(e)))
                    print(f"[ERR] 转换失败: {md_path} - {e}")
    
    # 打印统计
    print(f"\n{'='*50}")
    print(f"转换完成: {len(converted)} 个文件")
    if errors:
        print(f"失败: {len(errors)} 个文件")
        for path, error in errors:
            print(f"  - {path}: {error}")
    print(f"{'='*50}")
    
    # 防止 Windows 控制台立即关闭
    input("\n按 Enter 键退出...")


if __name__ == '__main__':
    main()
