# AGENTS.md - Koishi Dev VSCode Extension

## 项目概述
这是一个为 Koishi 开发者提供支持的 VSCode 扩展，主要功能包括：
- `package.json` 中 `koishi` 字段的 JSON Schema 验证
- `koishi.yml` 配置文件的 YAML Schema 验证
- `koishi.yml` 的智能补全（字段 / 枚举 / 插件名）、悬停文档、跳转定义
- TypeScript/JavaScript 代码片段

## 目录结构
```
├── src/
│   ├── extension.ts          # 扩展入口，注册各类语言功能 Provider
│   ├── schema/               # JSON Schema 索引：按配置路径解析 schema
│   │   ├── types.ts          # SchemaNode / PathSegment 类型定义
│   │   └── index.ts          # SchemaIndex：路径解析、属性枚举、枚举值提取
│   ├── yaml/
│   │   └── document.ts       # koishi.yml 解析，光标偏移量 → 配置路径
│   ├── plugins/
│   │   ├── registry.ts       # 内置官方插件清单 + 包名 → 配置名转换
│   │   └── resolver.ts       # 扫描工作区 node_modules 合并已安装插件
│   ├── providers/
│   │   ├── completion.ts     # 补全：字段 / 枚举 / 插件名
│   │   ├── hover.ts          # 悬停：schema 文档 + 插件包信息
│   │   ├── definition.ts     # 跳转定义：插件名 → package.json
│   │   └── roots.ts          # 定位工作区目录
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

## 智能补全架构

三个 Provider 共享同一套「光标位置 → 配置路径」解析：

```
KoishiYamlDocument.cursorAt(offset) → { path, parentPath, onKey, word }
                                    ↓
                    SchemaIndex 按 path 查询 schema
```

- `path` — 光标所在的配置路径。光标在**键**上时是该键自身的路径；在**值**上是该值的路径。
- `parentPath` — 光标所在的最内层映射，即「新键可以出现」的层级。
- `onKey` — 区分光标在键上还是值上，决定补全给字段名还是枚举值。

注意事项：
- YAML 解析器无法表达「正在输入但尚未成键」的内容。`plugins:\n  ada` 中的 `ada`
  会被解析成 `plugins` 的标量值，因此 `cursorAt` 用缩进作为兜底信号来判断键位置。
- 空值槽（`prefixMode: |`）必须判定为值位置，否则枚举补全无法触发。
- 每次请求都会重新解析文档。配置文件规模下开销可忽略，也无需自行跟踪外部编辑。

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
- yaml (YAML 解析，带 offset 的 AST)
- js-yaml (仅构建期 `scripts/convert.ts` 使用)
- vsce (打包工具)
- ESLint + TypeScript ESLint

## 测试
```bash
yarn run pretest    # compile + lint
yarn test           # 启动 VSCode 实例运行 mocha 测试
```
测试分为三层：`schema.test.ts`（纯逻辑）、`plugins.test.ts`（纯逻辑 + 临时目录）、
`providers.test.ts`（在真实 VSCode 中调用各 Provider）。