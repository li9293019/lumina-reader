Lumina.I18n.data = {};

Lumina.I18n.t = (key, ...args) => {
    const lang = Lumina.State?.settings?.language || 'zh';
    let text = Lumina.I18n.data[lang]?.[key] || Lumina.I18n.data.zh[key] || key;
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        const params = args[0];
        text = text.replace(/\{(\w+)\}/g, (match, name) => params[name] !== undefined ? params[name] : match);
    } else {
        text = args.reduce((str, arg, i) => str.replace(`$${i + 1}`, arg), text);
    }
    return text;
};
