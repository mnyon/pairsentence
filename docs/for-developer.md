# PairSentence 开发说明

## 项目结构

源码统一放在根目录 `src/` 下；插件清单、构建脚本和发布资源保留在 `plugin/`，构建产物输出到 `dist/`。

```text
PairSentence/
├─ src/                         # 插件运行时源码，按依赖方向分层
│  ├─ domain/                   # 领域层：状态、规则、校验（不依赖 DOM 与宿主）
│  │  ├─ engine.js              # 配对、关联、图谱分量及冷却规则
│  │  └─ validation.js          # JSON 图谱校验
│  ├─ usecases/                 # 应用用例层：串行事务与持久化边界
│  │  └─ application.js
│  ├─ adapters/                 # 适配层：与思源和宿主耦合的部分
│  │  ├─ siyuan/
│  │  │  ├─ adapter.js          # 工作空间存储与 SQL API 适配
│  │  │  └─ navigation.js       # 思源块协议跳转
│  │  └─ host/
│  │     └─ mobile-input.js     # 移动端输入与键盘桥接
│  ├─ ui/                       # 界面层：页面、动效、模板与样式
│  │  ├─ app.js                 # 页面控制器与交互装配
│  │  ├─ motion.js              # 交互动效
│  │  ├─ view.html              # 页面模板
│  │  ├─ style.css              # 基础界面样式
│  │  ├─ settings.css           # 设置区域样式
│  │  └─ mobile.css             # 移动端样式
│  └─ plugin/
│     └─ shell.cjs              # 思源插件生命周期与宿主桥接（组合根）
├─ test/                        # 与 src 分层对应的测试
│  ├─ engine.test.js
│  ├─ application.test.js
│  ├─ validation.test.js
│  ├─ navigation.test.js
│  ├─ mobile-input.test.js
│  ├─ plugin.test.js
│  └─ architecture.test.js      # 分层与耦合守卫
├─ plugin/                      # 插件元数据、构建和发布资源
│  ├─ build.mjs                 # 按分层清单打包目录与 ZIP 发布包
│  ├─ plugin.json               # 插件清单
│  ├─ icon.svg / icon.png       # 插件图标
│  └─ 许可证与第三方声明
├─ docs/                        # 开发、安装和发布文档
├─ .github/workflows/           # CI 检查与发布工作流
├─ dist/                        # 构建生成目录，不应直接编辑
├─ package.json                 # npm 脚本与项目元数据
├─ README.md                    # 项目概览（中文，GitHub 首页）
├─ README.en.md                 # 英文说明（集市默认）
└─ LICENSE                      # 项目许可证
```

- 分层依赖方向是 `domain <- usecases <- ui / adapters`；`adapters/` 是唯一允许直接接触思源协议与宿主 API 的目录，`plugin/shell.cjs` 作为组合根把它们装配起来。
- `src/ui/app.js`：插件页面、交互与应用用例装配。
- `src/ui/view.html`：插件页面模板。
- `src/ui/style.css`、`src/ui/settings.css`、`src/ui/mobile.css`：基础界面、设置及手机适配。
- `src/domain/engine.js`：配对、关联、图谱分量及历史规则。
- `src/usecases/application.js`：串行用例与保存成功后发布的状态边界。
- `src/domain/validation.js`：JSON 图谱校验；保持既有备份兼容。
- `src/adapters/siyuan/navigation.js`：思源笔记块跳转。
- `src/ui/motion.js`：交互动效，不参与持久化决策。
- `src/plugin/shell.cjs`：思源生命周期、原生页签、移动全屏与同步通知。
- `src/adapters/siyuan/adapter.js`：当前工作空间 API 与插件存储。
- `src/adapters/host/mobile-input.js`：隔离页面中输入框的手机焦点与键盘桥接。
- `plugin/build.mjs`：按分层清单打包 `src/` 插件源文件，并由根目录 README 生成包内说明，生成目录和标准 ZIP。
- 包内说明在构建时生成：`README.en.md` → 包内 `README.md`（default），`README.md`（中文）→ 包内 `README.zh-CN.md`；图片改写为 `main` 分支的绝对 URL。不要另建 `plugin/README.md`，也不要提交生成的副本。

运行 `npm test`（等价于 `node --test test`）检查领域、用例、输入处理、存储、打包和分层约束；运行 `npm run build` 生成 `dist/pairsentence/` 和 `dist/package.zip`。无需安装依赖。不要编辑生成文件。

## 配对与保存

插件提供 link/skip 两种卡片的。跳过的组合会产生一个冷却时间，从 10 分钟倍增，最长 24 小时，并降低重复组合的候选分数；不隔离单个片段。原有会话近期回避仍生效，旧备份的关联和思考保留。领域层保留旧判断历史的兼容规则。

配对产生的策略约为 45% 探索孤立片段、35% 将孤立片段接入已有分量、20% 连接不同分量。无候选时回退，回避已在同一分量的片段。查询最多 160 个超过 15 字符的段落。

页面每 45 秒、恢复焦点及提交判断前核对片段，隐藏时停止定时查询；每完成 12 次判断补充候选。确认缺失的节点暂不可用，相同 ID 恢复后接通；快照、关联与思考保留。

所有修改均在私有草稿中计算，保存成功后才发布状态。判断、同步、导入、撤销和编辑串行执行。编辑清空思考不删除关联；移除关联会一并移除其思考。

## 工作空间存储

图谱与偏好保存在 `data/storage/petal/pairsentence/`，使用思源数据同步。仅支持单人、同一时间一台设备修改。读取失败不能作为空图谱，写入需核实成功状态。存在未提交输入时延后读取同步数据。

普通卸载保留私有插件存储；手动删除该目录会丢失记录。本插件没有删除数据的卸载钩子。导入只替换图谱，JSON 导出不包含配色偏好。上述操作不修改笔记原文。

## 手机界面

600px 以下采用两行导航和单列片段，常用按钮至少 44px，输入字号 16px。星图保留最小 600px 宽度并在图内横向滚动。容器使用动态视口和安全区。

移动端选填思考在页内展开，不自动聚焦文本框；桌面端保留模态对话框。保存失败保留输入，取消不提交。

Shadow DOM 会把输入框点击重定向为宿主容器，思源全局 canInput 无法识别。因此在实际输入框触摸时启用原生焦点，点击中同步 focus，并调用可用的 Android/Harmony 键盘桥接。绑定覆盖动态编辑框和搜索框，卸载时移除。浏览器测试不等同于原生输入法实机验收。

发布与后续更新见下文“开发与发布”与“只更新介绍图片时”。

## 架构与业务逻辑定位

### 调用链

运行时由插件壳创建页面并注入适配器，页面控制器再装配应用用例：

```text
src/plugin/shell.cjs
  -> startPairSentence()
    -> src/ui/app.js
      -> src/usecases/application.js
        -> src/domain/engine.js
      -> src/adapters/siyuan/adapter.js
        -> 思源文件 API / SQL API
```

`plugin/build.mjs` 会在构建时将 `src/domain/engine.js`、`src/domain/validation.js`、`src/usecases/application.js`、`src/ui/motion.js`、`src/adapters/siyuan/navigation.js` 和 `src/ui/app.js` 内联到单个 `index.js` 中。`dist/` 是生成目录，不应直接编辑。

### 业务逻辑集中位置

- `src/domain/engine.js` 是领域层。负责图谱状态、片段合并、同步删除、连通分量、配对候选、`explore/attach/bridge` 分类、冷却、拒绝隔离和建立关联。
- `src/usecases/application.js` 是业务用例层，也是持久化事务边界。负责加载、刷新、同步、提交判断、撤销、导入、编辑和移除关联；所有命令串行执行，必须先校验、计算和保存，保存成功后才发布内部状态。
- `src/ui/app.js` 是 UI 控制器和视图投影。负责事件绑定、页面渲染、图谱搜索、联想列表与阅读器、星图展示、提示、动画和导入导出，不应直接修改内部图谱。
- `src/adapters/siyuan/adapter.js` 是基础设施适配层，将应用层的 repository/fragments 端口映射到思源插件存储和 SQL 查询。
- `src/plugin/shell.cjs` 只负责思源生命周期、桌面页签、移动全屏视图、数据变更通知和宿主事件桥接。

因此，修改业务规则时优先查看 `src/domain/engine.js`；修改保存、同步、撤销、并发或导入行为时查看 `src/usecases/application.js`；修改按钮和页面交互时才进入 `src/ui/app.js`。

`test/architecture.test.js` 会守卫这条分层线：`domain/` 与 `usecases/` 中不得出现 `document`、`window`、`localStorage`、`fetch`、`siyuan` 等宿主或传输 API，且导入只能指向内层目录；构建清单引用的源文件必须真实存在。

### 核心数据流

启动流程为：读取已有图谱 -> 随机加载片段 -> 校验当前节点是否仍存在 -> 选择下一组片段 -> 渲染页面。建立关联流程为：

1. `src/ui/app.js` 收集当前 `pairId` 和思考文本。
2. `src/usecases/application.js` 校验 ticket 和输入，并重新查询两个片段。
3. `src/domain/engine.js` 计算判断结果并修改私有草稿。
4. `src/domain/validation.js` 校验完整图谱。
5. `src/adapters/siyuan/adapter.js` 保存成功后，`src/usecases/application.js` 发布新状态。
6. UI 更新计数、播放动效并进入下一组。

同步、导入、撤销、编辑和删除也遵循同一个“私有草稿 -> 校验 -> 持久化 -> 发布”流程。界面拿到的是 detached snapshot，不能通过修改快照反向改变应用内部状态。

### 状态模型

图谱根对象由以下字段组成：

```text
{
  version: 1,
  nodes: {},       # 思源片段及 seen、failures、deleted 等探索字段
  edges: [],       # 两个片段之间的关联和 thought
  history: {},     # 片段对的 link/reject/skip 冷却记录
  stats: { decisions: 0 }
}
```

图谱和偏好均保存在 `data/storage/petal/pairsentence/`。原始思源笔记只读，建立关联不会修改笔记正文；节点删除时只标记为不可用，关联和思考记录仍保留，节点以相同 ID 恢复后可以重新激活。

### 测试覆盖与剩余边界

测试统一放在 `test/`，分工如下：

- `test/engine.test.js`：配对、冷却、桥接、隔离和同步规则。
- `test/application.test.js`：保存事务、串行队列、重复点击、ticket、撤销、导入和离线快照。
- `test/validation.test.js`：备份格式、悬空引用和原型污染防护。
- `test/navigation.test.js`：思源块协议和 ID 编码。
- `test/plugin.test.js`：插件生命周期、适配器、工作空间存储、构建包和 SQL ID 校验。
- `test/mobile-input.test.js`：移动端输入焦点和键盘桥接。
- `test/ui-thoughts.test.js`：联想列表的标题/正文拆分、稳定编号与日期格式化。
- `test/architecture.test.js`：领域/用例层的宿主隔离、导入方向、构建清单与包内 README 映射一致性。

目前没有独立的 `app.test.js` 或 `motion.test.js`，因此完整 DOM 生命周期、真实思源桌面/手机行为和动效模式仍需结合发布前的实机验收。运行 `npm test` 和 `npm run build` 是提交前的最低检查。

## 开发与发布

- `npm test`：运行测试。
- `npm run build`：生成插件目录和标准安装包 `dist/package.zip`。
- [插件说明](../README.md)
- [使用说明](for-user.md)
- [集市收录](#首次申请集市收录)

桌面、移动及浏览器前端均为支持目标。正式发布前仍需完成真实思源桌面、手机及两设备同步验收。

### 包内 README 与图片链接

包内说明由两份仓库源文件生成，仓库里不保存副本：

| 仓库源文件 | 包内文件 | `plugin.json` 映射 |
| --- | --- | --- |
| `README.md`（中文，GitHub 首页） | `README.zh-CN.md` | `readme.zh-CN` |
| `README.en.md`（英文） | `README.md` | `readme.default` |

日常主要编辑中文 `README.md`；需要更新英文时同步改 `README.en.md`。生成时 `docs/images/` 会改写为 `https://raw.githubusercontent.com/mnyon/pairsentence/main/docs/images/`。选择 `main` 而不是版本标签，是为了让集市页面始终显示最新截图，且开发构建时对应标签可能尚未创建；代价是将来若移动 `docs/images/` 或重命名 `main` 分支，旧安装包内的图片链接会失效，届时再考虑改为 `v<version>` 固定链接。`test/architecture.test.js` 会校验这份映射与绝对链接。

# 首次上架与后续更新

插件仓库：https://github.com/mnyon/pairsentence
官方集市：https://github.com/siyuan-note/bazaar

## 首次发布

1. 在真实桌面和手机端确认阅读、建立关联、输入法、编辑、移除关联、JSON 备份、笔记跳转均正常。两设备按顺序同步，确认图谱与偏好保留。

2. `package.json` 与 `plugin/plugin.json` 的版本必须相同。当前版本为 `0.1.16`。

3. 运行 `npm test` 和 `npm run build`，提交并推送源文件。

4. 在项目目录创建并推送对应标签：

   ```powershell
   git tag v0.1.16
   git push origin v0.1.16
   ```

5. 打开 GitHub 的 Actions，等待 Release 工作流成功。它会生成安装包并创建 Release 草稿。

6. 打开 Releases，编辑对应草稿。确认版本标签正确、附件名为 `package.zip`，补充功能简介和更新说明。完成实机验收后点击 **Publish release**，不勾选预发布。

请使用工作流生成的草稿发布，避免另建同名 Release。正式版本是集市检查的前提；草稿和预发布不会作为正式上架包。构建包根目录直接包含 plugin.json、index.js、icon.png、README 和许可文件，不再嵌套一层目录；其中 README 由仓库根目录生成，图片为绝对链接。

## 首次申请集市收录

此操作在独立目录或 GitHub 网页中完成，不把集市仓库放进插件项目。

1. 确认插件仓库公开，并已有带 `package.zip` 的正式 Latest Release。
2. Fork `siyuan-note/bazaar`。本地操作时，单独克隆 Fork，例如放在 `G:\development\PairSentence-marketplace`。
3. 从官方最新 main 建立 add-plugin-pairsentence 分支，在 plugins.txt 末尾仅新增一行 `mnyon/pairsentence`，不要重复添加或修改无关条目。
4. 提交并推送该分支，向 `siyuan-note/bazaar` 的 main 创建 Pull Request。可用标题：**Add mnyon/pairsentence**。
5. 按官方最新 PR 模板确认：无侵权内容；作者同意集市展示说明、缓存与分发安装包；代码与图标许可允许再分发。本项目代码为 MIT，Twemoji 图标为 CC BY 4.0，安装包附带许可与署名。开源插件不适用闭源源码审核条款。
6. 等待自动检查和维护者审核。失败时在同一个 PR 中修正，不重复提交申请。合并且集市索引更新后，重启思源刷新集市列表。

后续官方要求可能调整，以 bazaar 的 README 和 PR 模板为准。

## 后续更新

每次更新同步提升两处版本，测试、构建、提交和推送。再创建新的匹配标签，等待新的 Release 草稿，确认附件后发布正式版本。不要覆盖已发布标签或安装包；发现错误时使用更高的新版本修复。

首次收录后，通常无需再向 bazaar 发 PR。集市会自动拉取新的正式版本。若长时间没有更新，检查 Release 附件、版本号及 bazaar 的 Stage 工作流或 stage-fail Issue。

## 常见问题

- **看不到 Release 草稿**：确认已推送标签，去 Actions 检查 Release 工作流；失败后修复或重跑。
- **草稿缺少 package.zip**：不要先发布，先修复构建或附件上传。
- **上架检查失败**：查看同一个 PR 下的检查说明，修正插件仓库的正式 Release，等待复检。
- **发布前撤回**：保留草稿即可，尚未正式发布。正式发布后用更高版本修复。
- **本地数据和生成文件**：不提交笔记、连接凭据、dist 或临时预览。只有 package.zip 作为 Release 附件分发。

## 只更新介绍图片时

仓库 README（中文与英文）和现有 Release 的介绍可独立更新，无需新标签或新版本。审核中的收录 PR 也可补充截图，不必重新申请。示例图片必须使用虚构笔记，不包含真实工作空间数据。

集市从正式 Release 的 package.zip 读取清单和说明。只改仓库或 Release 描述，不会替换已有安装包中的 README。下次正常更新时重新构建，新的包内说明才会带上图片链接；不要为补图而覆盖已发布安装包。
