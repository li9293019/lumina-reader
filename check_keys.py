import re
keys = ['fontsRestoredFromDocuments', 'fontRestoreProgress', 'restoringFonts', 'fontRestoreFailed']
for name in ['zh', 'zh-TW', 'en']:
    with open(f'app/www/js/i18n/{name}.js', 'r', encoding='utf-8') as f:
        content = f.read()
    for k in keys:
        m = re.search(rf"{k}:\\s*('.*?')", content)
        print(f'{name} {k}:', m.group(1) if m else 'MISSING')
    print()
