# 首次上架与后续更新

插件仓库：https://github.com/mnyon/pairsentence
官方集市：https://github.com/siyuan-note/bazaar

## 首次发布

1. 在真实桌面和手机端确认阅读、建立关联、输入法、编辑、移除关联、JSON 备份、笔记跳转均正常。两设备按顺序同步，确认图谱与偏好保留。
2. `package.json` 与 `plugin/plugin.json` 的版本必须相同。当前版本为 `0.1.14`。
3. 运行 `npm test` 和 `npm run build`，提交并推送源文件。
4. 在项目目录创建并推送对应标签：

   ```powershell
   git tag v0.1.14
   git push origin v0.1.14
   ```

5. 打开 GitHub 的 Actions，等待 Release 工作流成功。它会生成安装包并创建 Release 草稿。
6. 打开 Releases，编辑对应草稿。确认版本标签正确、附件名为 `package.zip`，补充功能简介和更新说明。完成实机验收后点击 **Publish release**，不勾选预发布。

请使用工作流生成的草稿发布，避免另建同名 Release。正式版本是集市检查的前提；草稿和预发布不会作为正式上架包。构建包根目录直接包含 plugin.json、index.js、icon.png、README 和许可文件，不再嵌套一层目录。

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
