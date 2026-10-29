# GitHub Copilot-CN（macOS 独立桌面版）

适用于 GitHub Copilot 独立 macOS 应用 1.1.33（arm64）的非官方简体中文界面补丁源码。本仓库提供 UI 文本审查、翻译、资源重建、结构验证和本地模型库签名修复工具。它不包含 GitHub 官方应用、可执行文件、模型权重、账户数据或签名证书。

**维护状态：**截至 2026-10-29，GitHub Copilot 桌面应用没有文档化的 UI 语言包或本地化扩展接口，不能像 VS Code 一样通过受支持的语言包跟随产品更新。当前构建仍绑定到 1.1.33 的原版主程序 SHA-256；遇到其他版本会停止。更新后可运行 `python3 scripts/check-upstream.py '/Applications/GitHub Copilot.app'`，只读检查版本和资源指纹，并在 `outputs/upstream-review-*` 生成精确词典候选差异供审查；它不会把候选译文应用到应用包。详情、限制和更新流程见 [低维护本地化维护方式](docs/低维护本地化维护方式.md)。

## 已完成范围

- 对 1,065 个打包 JavaScript 模块审查固定界面文本；覆盖 16,859 处静态显示文字与 7,472 个 UI 渲染位置。
- 处理动态提示、隐藏状态筛选、原生设置元数据、菜单显示文字及七个内置自动化模板；保留路由、枚举、模型 ID、快捷键与用户输入。
- 修复补丁导致的 Foundry Local 动态库签名团队不一致问题：使用同一个有效的本地 Apple 开发签名签署主应用和四个进程内动态库，并保留强化运行时与库验证。
- 原构建的 38 项行为回归测试及 249 个已修改模块的结构验证通过。完整记录见 docs/中文版完整审查与模型修复结果.md；独立复现结果见 docs/公开源码复现验证.md。

这是一套按原版二进制 SHA-256 固定的补丁，不能直接套到其他版本。固定包内 UI 与已知原生文本已有映射；未知的未来云端文本、当前窗口的全部实际显示状态及麦克风转录尚未完成现场验收。模型目录测试确认 81 个模型、其中 9 个语音识别模型，但不代表模型已下载或录音成功。

## 本地构建

需要 macOS arm64、Python 3、Node.js/npm、Xcode 命令行工具、原版官方应用 1.1.33，以及本机有效的 Apple Development 签名身份。先用 security find-identity -v -p codesigning 查看可用身份。使用**未打补丁的官方原版**，不要把现有中文版当作原版输入。

    ./scripts/build-local.sh '/path/to/original/GitHub Copilot.app' 'YOUR_LOCAL_SIGNING_IDENTITY'

脚本核对原版 SHA-256 后在仓库本地保留原版副本，提取 UI 资源、构建汉化、运行测试、生成 dist/GitHub Copilot 中文版.app 并验证签名。它不会安装、退出或重启正在使用的应用，也不会更改系统安全设置。输出目录已被 Git 忽略。首次运行可能需要下载 npm/Python 构建依赖；如果系统默认 Python 不适合，可用 COPILOT_PYTHON 环境变量指定一个 Python 3 解释器。构建不会向翻译服务发送用户内容。

可选的 scripts/restore-original.command 会在正常退出应用后保留当前安装并恢复本地官方原版副本，不会强制关闭或清除用户数据。若只检查模型目录，可使用 scripts/check-model-catalog.sh 传入已签名的应用和同一签名身份。该检查只枚举目录，不下载或选择模型；目录查询可能需要联网。

## 目录

- work/localization：词典、AST/UI 显示层转换、原生菜单处理、资源补丁和回归测试。
- work/research/inspect_embedded_ui.py：从用户自己的官方应用提取打包前端资源。
- work/model-diagnosis：模型库加载与目录测试的原生源码及脱敏验收摘要。
- work/runtime：Node 依赖清单与锁文件。
- docs：本机原构建的审查与验收记录，含已知未验收项。
- scripts/check-upstream.py：更新后的本机版本/资源指纹检查与候选译文差异预览；只读应用包。

译文参考了 zhao818/copilot-desktop-zh 和 Moyxi/copilot-desktop-zh-ai 的公开 MIT 词典；署名和许可文本见 THIRD_PARTY_NOTICES.md。GitHub、GitHub Copilot、Microsoft Foundry Local 及相关标识属于各自权利人。本仓库与官方项目无关联。
