# 发布与插件集市收录

公开仓库：https://github.com/mnyon/pairsentence

## 发布前验收

在真实思源中确认：右侧 🌱 一次点击打开普通页签、不展开右侧面板；重复点击回到已有页签；其他侧栏入口正常。手机端打开、建立关联、取消及保存思考、图谱编辑、JSON 导入导出均正常。配色与动效可用。

两设备依次同步，确认图谱与偏好保留。验证保存失败不会丢失当前输入；备份后验证普通卸载、重新安装可恢复数据。当前自动化测试覆盖宿主模拟和存储逻辑，不能替代以上设备验收。

## 创建版本

1. 同步修改 package.json 与 plugin/plugin.json 的版本，更新版本说明。
2. 执行 npm test 和 npm run build:plugin。安装包根目录须直接包含 plugin.json、index.js、icon.png 和 README，而非再嵌套一层目录。
3. 提交并推送 main，再创建与清单一致的标签，例如 v0.1.10。
4. 推送标签后，Release 工作流会运行检查、构建，并创建附带 package.zip 的 GitHub Release 草稿。
5. 检查草稿、补充说明及完成设备验收后，手动发布为正式 Release。集市读取正式版本，草稿或预发布不满足收录条件。

本次准备不创建标签、不发布正式版本，也不发送集市 PR。

## 首次收录

以官方最新要求为准：
https://github.com/siyuan-note/bazaar
https://github.com/siyuan-note/plugin-sample

仓库名、清单 name 和安装目录均为 pairsentence。正式 Release 的版本须与清单一致，附件须命名 package.zip。作者须有权分发代码和图标。

Fork siyuan-note/bazaar，在 main 分支的 plugins.txt 末尾新增一行：

    mnyon/pairsentence

向官方 main 提交 PR，使用官方当时提供的 PR 模板完成声明。可用标题：Add plugin: PairSentence。简介：让思源笔记片段彼此照见，建立关联、记录思考，并以阅读视图或星图回顾；图谱随工作空间同步。

收录后，通常只需更新版本、正式 Release 和 package.zip，无需每次重复申请收录。

## 文件与许可

构建包包含 MIT LICENSE、Twemoji 图标的 CC BY 4.0 许可及署名。源码库排除本机参考脚本、连接凭据、笔记数据和生成文件。GitHub 的 Checks 工作流在推送及 PR 时运行测试和插件构建，并保存安装包为构建产物。
