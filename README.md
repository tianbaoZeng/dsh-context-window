# dsh-context-window

DeepSeek Harness（DSH）插件：**上下文窗口优化器**。监视会话的 token 消耗，在上下文接近上限时自动压缩历史，同时提供文件锁定、diff 增量注入与会话快照，让长任务中的模型不再"忘记"早期指令。

## 功能

- **实时用量仪表**：监听 `session/event` 与 `llm/stream`，累计 token 用量（优先取事件携带的真实 usage，否则按 CJK≈1 token/字、其余≈4 字符/token 估算），`/context-status` 输出 ANSI 进度条（达到阈值变红）。
- **自动摘要**：用量比例达到阈值（默认 80%）且新增消息足够多时，把早期历史压缩为摘要消息，并通过 `dsh-context-window/summary-ready` 事件把结果交给宿主注入上下文。默认使用抽取式摘要兜底；接上 LLM 回调后可改为模型摘要（见 `src/adapter.ts`）。
- **文件锁定**：`/pin <file>` 把文件内容钉在上下文中（记录 pin 时的内容快照），`/unpin <file>` 释放；受 `maxPinnedFiles` 上限约束。
- **Diff 增量注入**：用户消息命中触发短语（默认 "continue from where we left off"）时，对已 pin 文件计算 `git diff`，通过 `dsh-context-window/diff-inject` 事件发出增量而非全文；Agent 也可随时调用 `context_diff` 工具主动拉取。
- **会话快照**：`/snapshot` 把当前用量、pin 列表、最近消息存到 `<snapshotDir>/snapshot-<id>.json`；`/restore <id>` 恢复用量并重新 pin 文件。

与生态中已有插件的关系：`dsh-context`/`dsh-cost-meter` 侧重**用量与计费展示**，本插件侧重**主动腾挪上下文预算**；`dsh-mnemon` 提供**跨会话**长期记忆，本插件只管理**当前会话**的上下文预算。

## 安装

```bash
# 本地目录（开发）
dsh plugin --profile <name> add ./dsh-context-window

# tarball
pnpm pack
dsh plugin --profile <name> add ./dsh-context-window-0.1.0.tgz

# GitHub / npm
dsh plugin --profile <name> add github:<org>/dsh-context-window
dsh plugin --profile <name> add dsh-context-window
```

安装后在 Profile 里启用。最小补丁见 `cordis.patch.yml`；如需调参，在装配配置中覆盖 `config` 字段即可。

## 配置

| 字段 | 默认值 | 说明 |
|---|---|---|
| `threshold` | `0.80` | 触发自动摘要的用量比例（0..1） |
| `maxPinnedFiles` | `5` | 同时 pin 的文件数上限 |
| `windowTokens` | `65536` | 模型上下文窗口大小（仪表分母） |
| `diffTrigger` | `"continue from where we left off"` | 触发 diff 注入的短语（不区分大小写） |
| `snapshotDir` | `".dsh"` | 快照存储目录 |
| `autoSummarize` | `true` | 是否启用自动摘要 |

## 斜杠命令（用户直接触发）

| 命令 | 作用 |
|---|---|
| `/pin <file>` | 锁定文件到上下文 |
| `/unpin <file>` | 释放锁定的文件 |
| `/snapshot` | 保存当前上下文状态 |
| `/restore <id>` | 按 id 恢复快照 |
| `/context-status` | 查看用量比例、进度条与 pin 列表 |

## 工具（Agent 可调用）

| 工具 | 参数 | 作用 |
|---|---|---|
| `context_status` | — | 查询用量与 pin 列表 |
| `context_diff` | `path?` | 拉取 pin 文件的 git diff |
| `context_pin` / `context_unpin` | `path` | 锁定 / 释放文件 |
| `context_snapshot` | — | 保存快照 |
| `context_restore` | `id` | 恢复快照 |

## 事件

**监听**：`session/event`（token 记账、历史投影、触发检查）、`llm/stream`（流式增量记账）。
**发出**：`dsh-context-window/summary-ready`（摘要结果）、`dsh-context-window/diff-inject`（pin 文件 diff 增量）。

## 开发

```bash
npm run build   # tsc，产物在 dist/
npm test        # jest，46 个用例（含 fake Cordis 宿主装配测试）
npm run demo    # 本地冒烟演示：fake 宿主模拟会话，打印仪表条/摘要/pin/快照效果
```

### 与 DSH 版本的适配

DSH 处于 developer preview，插件 API 随版本演进。本插件所有真实 API 触点集中在 [`src/adapter.ts`](src/adapter.ts) 一个文件（事件名、`ctx.commands`/`ctx.tools` 注册形态）；`src/core/` 为纯业务逻辑，与宿主无关。若安装版本的类型定义与本仓库的 `src/types/dsh-api.d.ts` 不一致，先改 adapter，勿动 core。模型摘要的 LLM 调用点也留在 adapter 中待接线（当前默认抽取式摘要，功能完整可用）。

## 发布清单

1. 在 GitHub 建公开仓库，主题（topics）打 `dsh-plugin`、`deepseek-harness`；
2. `npm publish`（或直接以 `github:` 源分发）；
3. 向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 提 PR 收录；dsh-market 等社区索引会按 `dsh-plugin` topic 自动聚合。

## License

MIT
