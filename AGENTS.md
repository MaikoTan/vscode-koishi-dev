# AGENTS.md - Koishi Dev VSCode Extension

## 项目概述
这是一个为 Koishi 开发者提供支持的 VSCode 扩展，主要功能包括：
- `package.json` 中 `koishi` 字段的 JSON Schema 验证
- `koishi.yml` 配置文件的 YAML Schema 验证
- TypeScript/JavaScript 代码片段

## 目录结构
```
├── src/
│   ├── extension.ts          # 扩展入口（当前为空）
│   └── test/                 # 测试文件
├── schemata/
│   ├── koishi-yml.yaml       # koishi.yml 的 YAML Schema 定义
│   ├── koishi-yml.json       # 转换后的 JSON Schema（供 VSCode 使用）
│   ├── package-json.yaml     # package.json 中 koishi 字段的 Schema
│   └── package-json.json     # 转换后的 JSON Schema
├── snippets/
│   ├── koishi.common.yaml    # 代码片段定义
│   └── koishi.common.json    # 转换后的代码片段
├── scripts/
│   └── convert.ts            # YAML 转 JSON 的转换脚本
├── .vscode/                  # VSCode 配置
├── package.json              # 扩展清单
├── tsconfig.json             # TypeScript 配置
└── README.md                 # 文档
```

## 核心工作流

### 1. Schema 更新流程
修改 `.yaml` 文件后，运行：
```bash
yarn run convert
# 或
npx tsx scripts/convert.ts
```
这会将 YAML 转换为 VSCode 可识别的 JSON 格式。

### 2. 开发调试
```bash
yarn run compile          # 编译 TypeScript
yarn run watch            # 监听模式编译
F5                        # 启动扩展开发主机调试
```

### 3. 打包发布
```bash
yarn run vscode:prepublish  # 编译 + 转换
yarn run package            # 生成 .vsix 包
```

## 贡献指南
- Schema 定义使用 YAML 编写，支持注释和更好的可读性
- 代码片段定义在 `snippets/koishi.common.yaml`
- 发布前需运行 `yarn run vscode:prepublish`
- 遵循 AGPL-3.0 许可证

## 技术栈
- TypeScript 4.9+
- VSCode Extension API
- js-yaml (YAML 解析)
- vsce (打包工具)
- ESLint + TypeScript ESLint