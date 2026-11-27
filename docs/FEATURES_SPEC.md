# Nexus Wallet 全功能与交互逻辑权威说明书 (FEATURES_SPEC.md)

> **唯一真相源（Single Source of Truth）**：本文档完整定义 Nexus Wallet 所有业务视图、弹窗（Bottom Sheets）、Preact 框架组件、状态流转以及已废弃历史设计的边界。任何功能迭代必须同步更新本文档，严禁保留无入口的僵尸代码。

---

## 一、 核心架构与多链身份模型

### 1.1 账户派生与多链地址体系
1. **NEAR 主身份**：
   - 助记词按 `m/44'/397'/0'` (SLIP-10 Ed25519) 派生 64 位隐式账户 (`nearAddress`) 及密钥对；
   - 支持链上自动发现或注册 `.near` 命名账户 (`nearNamedAccount`)，一旦存在命名账户，所有 NEAR 交易、NEP-141 资产与 MPC 派生均以 `nearNamedAccount` 为主身份。
2. **NEAR MPC (`v1.signer`) 链抽象与本地自愈派生**：
   - **EVM 10 链** (`eth`, `base`, `arb`, `bsc`, `op`, `pol`, `avax`, `hype`, `hood`, `arc`)：统一使用 `mpcEvmAddress || evmAddress`；
   - **Solana (`sol`)**：使用 `solAddress`；
   - **Pearl (`prl`)**：BIP-86 Taproot (`m/86'/808276'/0'/0/0`) 派生 `prl1p...` 地址，支持在【多链收款地址】弹窗单独绑定/更换独立挖矿助记词 (`prlMnemonic`) 或一键恢复默认派生；
   - **Bitcoin (`btc`)**：BIP-86 Taproot (`m/86'/0'/0'/0/0`) 派生 `bc1p...` 地址。

### 1.2 单根 Preact 应用架构 (`src/app/` -> `src/framework-ui.js`)
- **设计定位**：全应用采用单根 Preact 外壳架构，`index.html` 仅保留 `<div id="app-root"></div>` 挂载点；`src/app/App.jsx` 通过 `memo` 稳定组合全部主视图（`views/AppShellViews.jsx`、`views/TradingViews.jsx`）与底部弹窗（`sheets/CoreSheets.jsx`、`sheets/ToolsAndChainSheets.jsx`），并在视图与弹窗中注册 44 个 `PanelSlot`；`src/app/main.jsx` 在 `src/ui-controller.js` 启动前同步调用 `mountAppRoot(document.getElementById('app-root'))` 完成外壳 DOM 挂载；同时通过 `NearCAFramework.mount*` 入口提供命令式桥接兼容，并在 Node 单测无 DOM 环境下平滑降级。
- **挂载点与组件职责（严禁在同一容器上混用 `Preact.render` 与 `innerHTML`）**：
  1. `mountAssetList` (`#home-unified-asset-list`)：渲染首页聚合资产卡片与小额资产 (`< $0.05`) 折叠抽屉；
  2. `mountTokenPicker` (`#token-picker-list`)：**统一**渲染闪兑选币与限价单选币列表；
  3. `mountSwapHistory` (`#swap-history-list`)：响应式订阅 `['swap', 'lang']`，渲染近期闪兑记录；
  4. `mountPerpOverview` (`#perp-overview-list`)：渲染永续合约行情列表；
  5. `mountPerpOrderbookSide` (`#perp-ob-bids` / `#perp-ob-asks`)：300ms 节流渲染买卖盘 8 档深度；
  6. `mountPerpBottomList` (`#perp-bottom-list`)：渲染永续合约底部 6 宫格持仓、当前委托（含止盈止损触发单）与历史成交（含方向、盈亏与手续费）；
  7. `mountLimitOrdersPanel` (`#limit-orders-list`)：响应式订阅 `['limit', 'lang']`，渲染限价单活跃挂单与历史记录；
  8. `mountEarnPoolsPanel` (`#staking-pools-list`)：响应式订阅 `['earn', 'lang']`，渲染质押池卡片与实时 APY（未返回时显示 `--`）；
  9. `mountTokenHistoryPanel` (`#token-detail-history-list`)：渲染代币详情交易历史记录；
  10. `mountContactsPanel` (`#contacts-list`)：渲染地址簿联系人列表；
  11. `mountNearKeysPanel` / `mountSolRentPanel` / `mountNearStoragePanel`：渲染 NEAR 密钥管理、Solana 租金回收与 NEAR 存储退押金面板；
  12. `mountWalletListPanel` / `mountBackupSecretsPanel` / `mountWalletAddressesPanel`：渲染多钱包切换列表、助记词/私钥安全备份与全链地址列表；
  13. `mountSendFeeSummaryPanel` / `mountReceiveAddressListPanel`：渲染跨链发送路由费用预览与收款网络/QTC 充值地址状态；
  14. `mountTokenBreakdownPanel` / `mountTxDetailPanel` / `mountTxHistorySheetPanel`：渲染代币多链分布、交易详情弹窗与完整交易记录列表；
  15. `mountSwapActiveOrderPanel` / `mountSwapRouteInfoPanel`：渲染闪兑进行中订单状态与路由/报价提示；
  16. `mountPerpMarketsSheetPanel` (`#perp-market-list`) / `mountPerpFundingInfoPanel` / `mountPerpChartHudPanel`：渲染永续选币弹窗、资金费率说明与 K 线交互 HUD；
  17. `mountEarnStakeSheetPanel` / `mountEarnValidatorsPanel`：渲染质押锁仓档位/回执与验证节点列表；
  18. `mountMiningTelemetryPanel` / `mountMiningWorkersPanel` / `mountWcSessionsPanel` / `mountWcProposalPanel` / `mountDAppBookmarksPanel` / `mountDAppApprovePanel`：渲染 Pearl 矿机遥测与矿工、WalletConnect 会话与审批、DApp 浏览器书签与签名审批；
  19. `TokenIconBadge` 与 `components/ui/`（`ActionButton`、`EmptyState`、`StatusBadge`、`ToastBanner`）：共享 UI 原语与图标徽章（覆盖全部视图与弹窗；`showToast` 通过 `mountToastBanner` 挂载至 `#toast-host` 并渲染 `#toast`）；
  20. `useWalletStore.js`：微任务合并通知（`notifyFrameworkState`）与按 topic 订阅（`wallet`, `nav`, `contacts`, `balances`, `earn`, `perp`, `swap`, `limit`, `receive`, `lang`，语言切换仅通过 `lang` topic 触发单次重绘），以及 `useLang` / `useActiveWallet` hooks；`jsQR` 通过 `src/jsqr-lazy.js` 按需懒加载。

---

## 二、 五大主视图（Tabs）功能与交互逻辑

### 2.1 资产首页 (`view-wallet`)
1. **顶部栏与总资产 Hero 区**：
   - 左上角切换/管理多钱包（`sheet-wallets`），右上角 WalletConnect v2（`sheet-walletconnect`）与语言切换（中/英）；DApp 浏览器（`sheet-dapp-browser`）位于枢纽页（`view-hub`）；
   - 显示总资产 USD 估值（所有已加载链上资产实时汇总，未返回价格时显示 `--`）、当前 NEAR 账户 ID（一键复制，未注册 `.near` 时显示注册入口）；
   - 四个快捷金刚区按钮：**发送** (`openSendSheet`)、**收款** (`openReceiveSheet`)、**闪兑** (`switchTab('swap')`)、**赚币** (`switchTab('earn')`)。
2. **下拉刷新 (`initHomePullToRefresh`)**：
   - 8px 方向死区 + 指数阻尼 (`computePtrPullDistance`)，下拉超过阈值释放触发 `refreshAllBalancesAsync(true)` 并发同步 14 条链原生币、NEP-141、SPL、ERC-20 及质押仓位。
3. **聚合资产列表 (`buildAggregatedAssetGroups`)**：
   - 按币种 Symbol 聚合多链余额（如 `USDC` 聚合 NEAR、Solana、Ethereum、Arbitrum、Base、Arc 等链上余额）；
   - 默认核心币种 (`NEAR`, `PRL`, `QTC`, `SOL`, `ETH`, `BNB`, `BTC`) 常驻展示，其余非核心代币在余额 `> 0` 时自动展示；
   - 非核心且总价值 `< $0.05` 的有余额代币自动归入底部【小额资产】折叠抽屉；
   - **交互规范（已废弃首页内联展开子链抽屉）**：点击任意资产行，**直接打开 OKX 风格代币详情弹窗 (`openTokenDetailSheet(symbolKey)`)**。

### 2.2 代币详情弹窗 (`sheet-token-detail`) 与 OKX Web3 风格交易记录
1. **多链网络筛选胶囊 (`#token-detail-chains`)**：
   - 顶部提供 `全部网络` 与各持仓子链筛选胶囊（如 `NEAR · 12.5`、`ARB · 50.0`）；
   - 选中具体单链时显示该链专属收款地址与区块浏览器地址跳转按钮。
2. **多链资产分布卡片 (`#token-detail-breakdown-card`)**：
   - 在 `全部网络` 视图下展示该币种在各条链上的明细行，每行右侧提供快捷 **【闪兑】** 与 **【转账】** 按钮（点击直达对应链与资产的闪兑/发送页面）。
3. **关联赚币入口 (`#token-detail-earn-card`)**：
   - 自动匹配支持该代币的链上质押 (`Staking`) 或借贷金库 (`Lending & Earn`) 池，显示实时 APY，点击直达对应质押弹窗。
4. **OKX Web3 风格交易记录与交易详情 (`sheet-tx-history` / `sheet-tx-detail`)**：
   - **列表项四要素**：
     1. 动作方向圆标（`↑ 发送`、`↓ 接收`、`⇄ 闪兑`、`⚡ 质押`、`🔓 解质押`、`⛏ 挖矿收款`）；
     2. **交易动作主标题**（如 `发送 NEAR`、`接收 USDC`、`闪兑 NEAR ➔ USDC`）；
     3. **时间与网络副标题**（`刚刚 / X分钟前 / MM-DD HH:mm` · `NEAR / SOL / ARB`）；
     4. **交易数额与状态**（流入绿色 `+Amount Symbol`，流出白色 `-Amount Symbol`，附状态标签 `已确认 / 确认中 / 失败`）。
   - **OKX Web3 风格交易详情弹窗 (`sheet-tx-detail`)**（已废弃旧版冗长的 PRL UTXO 输入/输出表格）：
     - 顶部核心区：方向大图标 + 交易动作标题 + 大号净变动数额 + 状态胶囊；
     - 极简元数据卡片：**交易类型（动作）**、**所属网络**、**交易时间**、**对方地址/路由（如有）**、**网络手续费（如有）**、**交易哈希 (TxHash + 一键复制)**；
     - 底部主操作按钮：**`↗ 在区块浏览器中查看`**（覆盖全部 14 条链的官方浏览器链接）。

### 2.3 发送 / 跨链直转弹窗 (`sheet-send`)
1. **选币与源链选择**：支持选择任意币种及具体持仓源链，自动计算并预留原生 Gas（当输入金额导致剩余原生币不足 Gas 时弹出黄色智能修正条，一键填入最大可转金额）。
2. **智能地址识别与跨链直转预询价**：
   - 输入或扫码粘贴收款地址后，自动识别目标网络（`NEAR` / `Solana` / `EVM 10 链选择胶囊` / `Pearl` / `Bitcoin`）并校验 Checksum；
   - **同链转账**：直接构建对应链原生或代币转账交易签名广播；
   - **跨链直转（源链 != 目标链）**：输入地址与金额后，**350ms 防抖自动在后台发起 `dry: true` 1Click 跨链预询价**，在路由预览栏实时显示精确预估到账金额；点击【确认发送】时复用预询价结果立即调起生物识别/PIN，验证通过后请求正式充值地址并签名广播。

### 2.4 闪兑 (`view-swap` - Market Mode)
1. **超级聚合询价 (`fetchLiveSwapQuoteAsync`)**：
   - 同链 DEX：NEAR (Ref V2 + Rhea DCL 多池比价)、Solana (Jupiter V1)、EVM/Arc (链上 V2/V3 路由 + ParaSwap/0x 聚合)；
   - 跨链与组合路由：1Click 跨链意图、PRL/QTC 组合桥接、以及 `源链 -> NEAR/Base/Solana 中转 -> 目标链 DEX` 的两阶段/三阶段超级聚合路由。
2. **多阶段跨链订单追踪与续签 (`renderSwapOrderCard`)**：
   - 订单卡片实时轮询状态；
   - 对包含第二/第三阶段自动跟单 (`hasPendingSwapFollowUp`) 的跨链订单，醒目提示当前所处阶段（如 `阶段 1/2：跨链桥接中，到账后自动执行阶段 2 兑换`）；
   - 若因切后台/锁屏或网络抖动导致后续阶段未自动完成，高亮展示 **【继续完成第二阶段兑换】** 按钮与提示说明。

### 2.5 限价单 (`view-swap` - Limit Mode)
1. **多链限价协议**：
   - **NEAR (`dclv2.ref-labs.near`)**：链上 DCL 离散流动性限价单，支持 Tick 步进微调（`-1 Tick / +1 Tick`）、双 Tick 50%/50% 拆分挂单、已成交领取 (`Claim`) 与撤单；
   - **NEAR 原生币自动封装**：当卖出 `wNEAR` 且 `wNEAR` 余额不足但 `wNEAR + NEAR` 总可用余额充足时，主按钮直接允许点击 **【自动封装并提交限价单】**，在 `placeNearDclLimitOrder` 内部自动补齐差额 `near_deposit` 并挂单，同时保留手动封装入口；
   - **Solana (`Jupiter Trigger V1`)**：链上托管限价单，撤单自动退回账户租金；
   - **EVM 6 链 (`ETH`, `Base`, `Arbitrum`, `BSC`, `Polygon`, `Avalanche` - `CoW Protocol`)**：0 Gas 离线 EIP-712 签名限价单与 0 Gas 撤单。

### 2.6 永续合约 (`view-perp` - Hyperliquid L1)
1. **合约行情概览页 (`#perp-overview-panel`)**：
   - 展示账户总权益、可用保证金、未实现盈亏及入金/划转按钮（支持一键跨链闪兑入金、Arbitrum USDC 桥接、Spot<->Perp 互转及提现）；
   - 支持 **⭐ 自选 / 加密合约 / 美股与商品 (`xyz:` 等 HIP-3 市场) / 全部** 分类筛选、搜索及按成交量/最新价/24h涨跌幅排序；
   - 点击任意合约星标 `★` 实时收藏/取消收藏（精确匹配含大小写前缀的 `m.name` 如 `xyz:CRCL`），点击行进入合约交易页。
2. **OKX 风格专业交易页 (`#perp-trade-panel`，3 卡片极简布局)**：
   - **卡片 1：头部行情条 + 常驻 SVG K 线图 (`161-perps-chart.part.js`)**：头部支持长合约名省略号截断与 375px 窄屏零溢出（保留返回、币对、24h 涨跌与自选星标）；K 线支持 `5m / 15m / 1h / 4h / 1d` 周期、MA5/10/20 均线、最高最低价标注、GPU `translate3d` 平滑单指平移与惯性滑动/点按十字线查价/双指缩放（`touch-action: pan-y` 保障页面纵向滑动，`xMidYMin meet` + `aspect-ratio` 消除顶部留白），点按/长按 K 线时自动避让当前柱体左右停靠 **10 项浮窗 HUD**（时间/开盘/最高/最低/收盘/涨跌额/涨跌幅/振幅/成交量/成交额），常态自动隐藏；
   - **卡片 2：左 57% 下单区 + 右 43% 实时盘口 (`PerpOrderbookSidePanel`)**：
     - 盘口顶部展示 1h 资金费率与结算倒计时，WebSocket `l2Book`（含 3s 无推送自动 HTTP 回退兜底）实时驱动买卖 8 档深度（左价格 / 右数量）与底部 `B xx% / S xx%` 买卖力量比例条，点击档位价格自动填入限价框；
     - 下单面板支持逐仓/全仓切换、内联杠杆滑块 (`#perp-leverage-slider`，`1x ~ Max`)、市价/限价/只做Maker (Post-Only)、0%/25%/50%/75%/100% 保证金快捷圆点、只减仓 (`Reduce-Only`)、附带止盈/止损 (`TP/SL`) 及垂直堆叠双色操作按钮（`买入(做多)` / `卖出(做空)`）；
   - **底部仓位与委托管理 (`PerpBottomListPanel`)**：
     - **当前持仓**：完整 6 宫格展示持仓数量、保证金、预估强平价、开仓均价、实时标记价、收益率 ROE% 与已设止盈止损价，支持【反手】、【止盈/止损设置弹窗】（完整中英双语标签与留空清除提示）、【市价平仓】及【一键全平】；
     - **当前委托**：区分普通限价单与条件止盈止损单（显示触发价 `Trigger` 并支持点击【修改】），支持单笔撤单与【全部撤单】；
     - **历史成交**：展示币对、买入/卖出方向、成交均价与数量、已实现盈亏 (`Closed PnL`) 与手续费 (`Fee`)。

### 2.7 质押理财 (`view-earn`)
1. **多链真实生息协议**：
   - **NEAR**：Rhea `rNEAR`、`xRHEA`、`oRHEA` 锁仓转换（支持 15~181 天锁仓周期提示）、Meta Pool `stNEAR`、LiNEAR、Stader `NearX`、Burrow 活期存款、以及原生 Validator 节点质押；
   - **Solana**：Jito (`JitoSOL`)、Jupiter (`jupSOL`)、Marinade (`mSOL`)、Sanctum (`INF`)、Jupiter DAO (`JUP` 锁仓) 及 Solana 原生节点质押；
   - **EVM / Arc / HyperEVM**：Lido (`stETH`)、Ethena (`sUSDe`)、Aave V3 (`ETH / Base / Arbitrum`)、Morpho Steakhouse (`Arc USDC`)、Kinetiq (`kHYPE`)。
2. **我的持仓与赎回操作 (`#earn-my-positions-card`)**：
   - 自动汇总展示所有链上生息持仓、冷却期状态；
   - 支持点击【提取 / 解质押 / 赎回 / 换回】，对支持自定义赎回数量的池子（如 Aave V3、Burrow、ERC-4626 金库、流动性质押 LST）允许确认或输入部分赎回数量。

### 2.8 枢纽与安全中心 (`view-hub`)
1. **NEAR 账户与链上访问密钥管理 (`sheet-near-account`)**：
   - 注册新 `.near` 域名（自动无损归集原隐式账户余额）或绑定已有 `.near` 账号；
   - 查看链上 `FullAccess` 与 `FunctionCall` 密钥列表，支持删除多余密钥、添加新助记词密钥或一键轮换主控制助记词（自动保留有余额的旧链私钥并采用应用内二次点击确认，不弹出突兀的浏览器原生 `window.confirm`）。
2. **存储押金与租金回收**：
   - **Solana 租金回收 (`sheet-sol-rent`)**：扫描 0 余额闲置 SPL 代币账户 (ATA)，勾选一键关闭并退回 `~0.00204 SOL/个`；
   - **NEAR 存储押金回收 (`sheet-near-storage`)**：扫描 0 余额且无 DCL 挂单的 NEP-141 合约，一键注销退回存储 NEAR。
3. **矿机遥测 (`sheet-mining-pro`)、DApp 浏览器 (`sheet-dapp-browser`)、联系人地址簿 (`sheet-contacts`) 与设备原生生物识别安全锁 (`010-security.part.js`)**：
   - **设备原生安全验证**：统一调用设备原生能力（iOS `LocalAuthentication` / Android `BiometricPrompt` + 系统锁屏凭据 / 浏览器 WebAuthn 平台验证器）进行敏感操作校验与锁屏解锁；当设备不支持或未开启任何系统锁屏/生物识别时，提示建议开启系统锁屏并优雅放行，不阻断用户使用；
   - **内置 DApp 浏览器安全边界**：连接授权按 `wallet.id` 严格隔离，切/删钱包不暴露旧授权；内置生态白名单 (`DAPP_CATALOG`) 仅在确认 `.near` 命名账户后才免弹窗预授权，启动及 `near:signIn` 前自动绕过失效空锁并水合 `.near` 命名账户；手动输入的外部未知域名必须经过 `sheet-dapp-approve` 明确授权后方可获取钱包地址；Solana `solana:signTransaction` 透传 `Uint8Array`；NEAR `signAndSendTransaction` 多 Action 请求通过 `signAndSendNearActionsBatch` 原子打包进单笔链上交易签名广播；EVM `personal_sign` 通过 NEAR MPC 签名后自动执行 `yParity` 地址恢复校验；交易审批自动解码 ERC-20 `approve` 与 NFT `setApprovalForAll` 授权对象及额度，并对 `eth_sign` 原始高危盲签触发强制二次确认；
   - **全局错误清洗与终端用户文案规范**：所有链上/网络异常均通过 `toUserFriendlyError` 转换为自然友好的中英文提示，剔除底层 HTTP 状态码、RPC、WebView、CORS、合约协议名等开发者术语。
