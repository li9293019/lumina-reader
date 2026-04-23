// 本地版本信息（供 file:// 模式无 CORS 加载）
// 与 version.json 保持同步
window.AppVersion = {
  "version": "2.1.5",
  "build": "20250422",
  "minNativeVersion": "1.0.0",
  "requiresNativeUpdate": false,
  "changelog": "修复外部intent打开新书时currentFile残留数据污染问题；.lmn/.json单本导入后自动进入阅读区并打开详情页"
};
