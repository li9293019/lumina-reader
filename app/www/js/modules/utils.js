// ==================== 2. 工具函数 ====================

Lumina.Utils.escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// 转义正则表达式特殊字符
Lumina.Utils.escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

Lumina.Utils.escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

Lumina.Utils.formatTimeAgo = (isoString) => {
    if (!isoString) return Lumina.I18n.t('unknown');
    const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diff < 60) return Lumina.I18n.t('timeJustNow');
    if (diff < 3600) return Lumina.I18n.t('timeMinutesAgo', Math.floor(diff / 60));
    if (diff < 86400) return Lumina.I18n.t('timeHoursAgo', Math.floor(diff / 3600));
    return Lumina.I18n.t('timeDaysAgo', Math.floor(diff / 86400));
};

Lumina.Utils.formatReadTime = (minutes) => {
    if (!minutes) return '';
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins === 0 ? `${hours}${Lumina.I18n.t('hours')}` : `${hours}${Lumina.I18n.t('hours')}${mins}${Lumina.I18n.t('mins')}`;
    }
    return `${minutes}${Lumina.I18n.t('mins')}`;
};

Lumina.Utils.formatWordCount = (count) => count >= 1000 ? `${(count / 1000).toFixed(1)}k` : (count || '0').toString();

// 格式化文件大小：自动选择 B/KB/MB 单位
Lumina.Utils.formatFileSize = (bytes) => {
    const num = parseFloat(bytes) || 0;
    if (num === 0) return '0B';
    if (num < 1024) return num + 'B';
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + 'K';
    return (num / (1024 * 1024)).toFixed(1) + 'M';
};

Lumina.Utils.numberToChinese = (num) => {
    const chars = '零一二三四五六七八九十';
    if (num <= 10) return chars[num] || num.toString();
    if (num < 20) return '十' + (num === 10 ? '' : chars[num - 10]);
    if (num < 100) {
        const ten = Math.floor(num / 10);
        const one = num % 10;
        return chars[ten] + '十' + (one === 0 ? '' : chars[one]);
    }
    return num.toString();
};

Lumina.Utils.numberToRoman = (num, upper = true) => {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let r = '', n = num;
    for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
    return upper ? r : r.toLowerCase();
};

Lumina.Utils.debounce = (fn, delay) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
};

Lumina.Utils.throttle = (fn, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

Lumina.Utils.validateRegex = (pattern) => {
    if (!pattern) return true;
    try { new RegExp(pattern); return true; } catch (e) { return false; }
};

// 底层详细统计（用于分页、调试等）
Lumina.Utils.calculateContentStats = (text) => {
    if (!text) return { chars: 0, words: 0, total: 0 };
    
    // 中文字符（含标点）
    const cn = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g)?.length || 0;
    
    // 英文单词（连续字母）
    const enWords = text.match(/[a-zA-Z]+/g)?.length || 0;
    
    // 数字串（可选，作为独立计数或并入英文）
    const numbers = text.match(/\d+/g)?.length || 0;
    
    // 统一"阅读字数"：中文单字 + 英文单词
    const readingWords = cn + enWords;
    
    // 纯字符长度（用于内存估算）
    const charLength = text.length;

    const result = {
        cn,           // 中文字符数
        enWords,      // 英文单词数
        numbers,      // 数字串数
        readingWords, // 阅读字数（与历史记录一致）
        charLength    // 字符长度
    };

    return result;
};

// 便捷函数（用于历史记录等只需总字数的场景）
Lumina.Utils.calculateWordCount = (items) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((count, item) => {
        if (!item.text) return count;
        // 直接复用 calculateContentStats
        const stats = Lumina.Utils.calculateContentStats(item.text);
        return count + stats.readingWords;
    }, 0);
};

// ==================== 外部链接跳转（通用） ====================

// 打开外部链接（自动区分 APP/Web 环境）
Lumina.Utils.openExternal = (url) => {
    if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.()) {
        window.open(url, '_system');
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
};

// 跳转前确认
Lumina.Utils.confirmExternalLink = (url) => {
    const t = Lumina.I18n?.t || ((k) => k);
    const message = (t('externalLinkConfirm') || '将访问阅读器外地址，是否跳转？\n\n$1').replace('$1', url);
    Lumina.UI.showDialog(message, 'confirm', (result) => {
        if (result === true) Lumina.Utils.openExternal(url);
    });
};

// 将容器内的纯文本 URL 和邮箱自动转为可点击链接
Lumina.Utils.linkifyContent = (container) => {
    if (!container) return;
    
    // URL 正则：匹配 http(s):// 或 ftp:// 开头的链接
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    // 邮箱正则
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const nodesToReplace = [];
    
    while (walker.nextNode()) {
        const node = walker.currentNode;
        // 跳过已在 <a> 标签内的文本
        if (node.parentElement?.closest('a')) continue;
        
        const text = node.textContent;
        if (!urlRegex.test(text) && !emailRegex.test(text)) {
            urlRegex.lastIndex = 0;
            emailRegex.lastIndex = 0;
            continue;
        }
        urlRegex.lastIndex = 0;
        emailRegex.lastIndex = 0;
        
        nodesToReplace.push(node);
    }
    
    nodesToReplace.forEach(node => {
        const text = node.textContent;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        
        // 合并正则，按位置排序匹配
        const matches = [];
        let m;
        while ((m = urlRegex.exec(text)) !== null) {
            matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], type: 'url' });
        }
        while ((m = emailRegex.exec(text)) !== null) {
            matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], type: 'email' });
        }
        // 去重并排序
        matches.sort((a, b) => a.index - b.index);
        const unique = [];
        matches.forEach(match => {
            if (!unique.some(u => match.index < u.end && match.end > u.index)) {
                unique.push(match);
            }
        });
        
        unique.forEach(match => {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            const a = document.createElement('a');
            a.href = match.type === 'email' ? 'mailto:' + match.text : match.text;
            a.textContent = match.text;
            a.className = 'external-link';
            fragment.appendChild(a);
            lastIndex = match.end;
        });
        
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        
        node.parentNode.replaceChild(fragment, node);
    });
    
    // 统一绑定点击事件
    container.querySelectorAll('a.external-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            Lumina.Utils.confirmExternalLink(link.href);
        });
    });
};

