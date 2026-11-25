# Nexus Wallet 开发规范与质量红线

任何在本仓库工作的 AI 编程助手与开发者必须严格遵守以下规范：

## 1. 零假数据与真实闭环红线
- **严禁伪造数据**：禁止在 UI 中写入硬编码的假价格、假 APY、假报价、假余额、假手续费或兜底占位地址。外部接口未返回数据时显示 `--`，绝不能用默认值伪装成真实数据。
- **未接通真实签名广播的功能不得上线**：任何交易、兑换、质押入口都必须真实构建交易、使用本地私钥签名并广播至对应链 RPC；若某条链或协议暂未接通，必须明确拦截或不可用，禁止弹出仅提示文案的假执行。

## 2. 交易前置校验规范
- **先校验余额再发网络请求**：在发起任何链上转账、DEX 兑换或合约质押前，必须在本地先校验当前钱包该链可用余额（含 Gas 预留）。余额不足时直接提示 `XXX 余额不足 (当前可用: ...)`，禁止直接打到 RPC/聚合器导致抛出 `HTTP 400/403` 错误。
- **派生私钥按需自愈**：对历史缓存钱包，执行交易或质押前必须自动检查并按助记词补齐 EVM / Solana / NEAR 派生私钥，不允许因旧缓存缺字段而报错阻断。

## 3. 中英双语规范
- **禁止中文固化**：所有新增界面元素（`src/parts/index-html/*.part.html`）必须带有 `data-i18n` 并在 `src/parts/state/010-i18n-dict.part.js` 的 `i18nDict` 中同步维护 `zh` / `en` 两套词条；所有 JS 动态渲染文案必须使用 `t(zh, en)` 辅助函数，并在 `applyLanguage()` 中触发动态视图重绘。

## 4. 界面极简原则与移动端 UX 红线
- **面向终端用户**：钱包界面内禁止出现面向开发者的解释性文字、技术调试术语或冗长段落说明；保持卡片简洁、操作路径直观。
- **表单生命周期双清红线（严禁跨币种/跨弹窗残留）**：
  - 凡切换币种、切换链、翻转币对、提交下单/兑换成功、或关闭弹窗，必须同步清空 State 与 DOM 输入框（使用 `resetFormFields()` / `resetPerpOrderForm()`，或在 Preact 组件中使用 `key` 卸载重建）；
  - 严禁在 `render()` 函数中反向读取 DOM `<input>.value` 覆盖已重置的 State；仅持久化用户偏好（闪兑币对、自选列表、滑点、语言），不持久化交易金额与委托价格。
- **移动端交互 5 项必查清单**：
  1. **按钮即时反馈**：所有异步操作（刷新状态、下单、撤单、质押）点击后必须立即禁用并展示 loading 文案，结束时必须给出明确 toast 反馈，禁止静默吞错；
  2. **零布局跳动（Zero CLS）**：详情栏/提示栏优先采用常驻固定高度设计（如 K 线信息栏常态显示区间高低/最新价，触摸时原地切换），禁止点击后突然插入大块 DOM 导致页面跳动；
  3. **375px 窄屏适配**：列头、买卖盘汇总与标签需控制在单行内（`white-space: nowrap`），不得误导文案（如堆叠盘口列头统一为“价格”）；
  4. **触摸手势死区**：下拉刷新与图表手势必须设置 6~8px 方向死区与轻阻尼，禁止首帧微抖掐死垂直滑动，后台静默同步不得锁死用户手动下拉；
  5. **交易记录页内闭环**：闪兑/限价/合约页均需在当前视图直接可查近期记录与状态，并支持切回前台自动续查未终态订单。

## 5. 发布前验证流程
- 每次修改后必须依次执行：
  1. 递增缓存版本号与静态资源 `?v=` 参数（6 处：`sw.js`、`src/parts/index-html/{000-head-shell,010-view-onboarding-wallet,090-scripts-footer}.part.html`、`src/parts/ui-controller/{000-core,230-walletconnect}.part.js`）；
  2. 运行 `npm run build`（依次执行 `scripts/build-parts.js` 拼接分片、`npx vite build` 编译 `src/app/` -> `src/framework-ui.js`、`scripts/sync-assets.js` 使用 `esbuild` 压缩 `src/*.js` 与 `style.css` 并同步 22 个资源到 `dist/`、`android/`、`ios/`）；
  3. 运行 `npm test` 确认全部测试用例 100% 通过后方可提交本地 Git（CI 流程需在 `npm run build` 前执行 `npm ci`）。

## 6. Git 提交与推送规范
- **按模块分步本地提交**：每完成一个独立功能模块并严格通过上述验证流程后，仅执行本地 `git commit` 保存版本节点，便于分步回溯与验收。
- **严禁自动推送远端**：未经用户明确确认验收，严禁主动执行 `git push`；必须等待用户明确指令后，再推送至 GitHub 触发 iOS / Android 包编译流程。

## 7. 源码分片与 Vite + Preact 框架开发规范
- **生成文件由分片自动拼接**：`index.html` 与 `src/{ui-controller,chain-contracts,near-intents,token-registry,state,crypto-engine}.js` 由 `scripts/build-parts.js` 按文件名顺序拼接 `src/parts/<name>/` 生成；`src/framework-ui.js` 由 `vite.config.mjs` 从 `src/app/main.jsx` 编译生成。**只改分片与 `src/app/`，禁止直接编辑生成文件**；改完运行 `npm run build`，`test/08-build-parts.test.js` 会校验分片同步。
- **渐进式 Preact 框架层（`src/app/`）**：新增独立 UI 面板与交互组件优先写入 `src/app/components/*.jsx`，通过 `src/app/store/useWalletStore.js` 订阅 `NearCAState` 并由 `src/app/main.jsx` 挂载到对应容器，保持 Node 单测兼容降级。
- **产物已移出 Git（`.gitignore`）**：上述 7 个拼接产物、`src/framework-ui.js`、`src/jsqr-lazy.js` 以及 `dist/`、`android/app/src/main/assets/public/`、`ios/App/App/public/` 均在 `.gitignore` 中排除，由本地及 GitHub Actions CI（`npm ci && npm run build`）自动生成并压缩。
- **按需读取与分片上限**：定位代码后只读相关分片，禁止整读生成的大文件。新增页面/模块/链时新建分片（如 `125-xxx.part.js`），**单分片软上限 50 KB（硬上限 60 KB）**，禁止再出现百 KB 巨型分片；`globalHandlers` 与 `NearCAUI` 严禁重复键名。
- **测试分文件**：公共工具在 `test/helpers.js`，新版本测试写入对应 `test/NN-*.test.js`（或新建），禁止再堆回单文件。

## 8. 项目地图与搜索防污染规范

### 8.1 搜索范围硬约束（省额度关键）
- **只允许搜索源码目录/文件**：`src/parts/`、`src/app/`、`src/limit-orders.js`、`src/hyperliquid-perps.js`、`src/mining-pro.js`、`style.css`、`sw.js`、`server.js`、`scripts/`、`test/`。
- **严禁全仓搜索**：`node_modules/`、`dist/`、`android/app/src/main/assets/public/`、`ios/App/App/public/`、生成的 `index.html`、生成的 7 个 `src/*.js`，以及第三方单行压缩库（`ethers.umd.min.js`、`walletconnect.umd.min.js`、`qrcode.min.js`、`bip39-wordlist.js`）。

### 8.2 项目架构与分片索引（直达目标文件）
- **权威功能规范文档**：`docs/FEATURES_SPEC.md`（全功能与交互逻辑唯一真相源，任何功能与交互修改必须同步更新此文档并清理废弃僵尸代码）。
- **运行入口与构建**：`index.html` 按序加载全局 IIFE 脚本与 `src/framework-ui.js`；`scripts/build-parts.js` 拼接分片，`vite.config.mjs` 编译 Preact 组件，`scripts/sync-assets.js` 使用 `esbuild` 压缩并同步 22 个资源到 `dist/`、`android/`、`ios/`；`server.js` 提供本地静态服务与 `/pearl-proxy`、`/kryptex-proxy`；`sw.js` 管理 PWA 离线缓存；`style.css` 存放全局样式。
- **Preact 框架目录（`src/app/` -> `src/framework-ui.js`）**：`main.jsx`（入口挂载与全局桥接 `window.NearCAFramework`，含 35 个挂载入口与共享组件，覆盖全部主视图与弹窗）、`store/useWalletStore.js`（微任务合并响应式状态订阅、`useLang` / `useActiveWallet`）、`components/ui/`（`ActionButton`、`EmptyState`、`StatusBadge`、`ToastBanner`）及业务面板组件；`jsQR` 由 `scripts/build-jsqr.js` 单独打包为 `src/jsqr-lazy.js` 按需懒加载。
- **原生插件（受保护，勿误删）**：Android (`android/app/src/main/{AndroidManifest.xml,java/io/nexus/wallet/{MainActivity,NativeSecurityPlugin}.java}`)；iOS (`ios/App/App/{Info.plist,MainViewController,NativeSecurityPlugin}.swift`)。CI 编译流在 `.github/workflows/{build-android-apk,build-ios-ipa}.yml`。
- **`src/parts/index-html/`（10 个 HTML 片段 -> `index.html`）**：
  - `000-head-shell` 锁屏/隐私遮罩与顶栏；`010-view-onboarding-wallet` 引导与资产首页；`020-view-swap-limit` 闪兑与限价单；`030-view-perp` 永续合约；`040-view-earn` 质押理财；`050-view-hub-nav` 枢纽设置与底栏；
  - `060-sheets-core` 发送/收款/代币详情/选币；`070-sheets-tools` 矿机/历史/详情/WC/联系人/多钱包/备份/PIN/地址；`080-sheets-chain-perp-auth` NEAR账户密钥/SOL租金/NEAR存储/永续选币与出入金/生物识别锁；`090-scripts-footer` 脚本标签。
- **`src/parts/crypto-engine/`（5 个分片 -> `src/crypto-engine.js`）**：
  - `000-core-hash-bip39` 编码/Borsh/SHA/Keccak/PBKDF2/BIP39；`010-address-encoding` Base58/Bech32m/EIP55/各链地址校验；`020-secp256k1-bip32` Secp256k1/BIP32/BIP340 Schnorr；`030-ed25519-derivation` Ed25519/SLIP10/多链助记词派生；`040-intents-mpc-vault` NEP-413 签名/MPC 地址派生/Vault 加密。
- **`src/parts/token-registry/`（5 个分片 -> `src/token-registry.js`）**：
  - `000-core-icon-data`、`010-icon-map-resolvers`（内联/动态图标解析）；`020-chain-meta-render`（链元数据与角标渲染）；`030-core-tokens`（核心代币）；`040-dex-tokens-indexes`（DEX/xStocks/Arc/Rhea 索引）。
- **`src/parts/near-intents/`（10 个分片 -> `src/near-intents.js`）**：
  - `000-core-utils`、`010-near-tokens`、`020-prices`（1Click/Defuse/DexScreener 实时价）；`030-ref-dex`（Ref/Rhea）；`040-oneclick`（1Click 报价/执行/状态）；`050-near-pair-swap`、`060-bridges`、`070-smart-hub`、`080-cross-chain-relay`（SOL/EVM/Arc 跨链中继）；`090-intents-exports`。
- **`src/parts/chain-contracts/`（15 个分片 -> `src/chain-contracts.js`）**：
  - `000-config-evm-chains`、`010-staking-pools-data`、`020-utils-crypto`、`030-rpc-balances`；按链签名广播：`040-solana`、`050-pearl`、`060-bitcoin`、`070-evm`、`080-near`、`090-near-keys`；质押与扩展：`100-staking-metrics`、`110-staking-execute`、`120-near-ref-dex`、`130-near-storage-misc`、`140-exports`。
- **`src/parts/state/`（3 个分片 -> `src/state.js`）**：
  - `000-store`（钱包存储/迁移/全局状态）；`010-i18n-dict`（`i18nDict` 中英词典）；`020-i18n-render`（`t()` / `applyLanguage()`）。
- **`src/parts/ui-controller/`（32 个分片 -> `src/ui-controller.js`）**：
  - `000-core`、`010-security`（锁屏/PIN/生物识别）、`020-navigation`、`030-onboarding`、`040-balance-sync`、`050-token-list`、`060-token-detail-core` / `061-token-detail-ui`、`070-home`、`080-send`、`090-receive`；
  - 闪兑模块：`100-swap-state`、`110-swap-quote`、`120-swap-execute-core`（校验/同链DEX/SmartHub）、`121-swap-execute-prl`（PRL/QTC 组合路由）、`122-swap-execute-relay`（SOL/EVM/Arc 超级聚合与直连 1Click）、`130-swap-orders`、`140-token-picker`；
  - 业务视图与工具：`150-limit-orders-core` / `151-limit-orders-ui`、`160-perps-core` / `161-perps-chart` / `162-perps-orderbook` / `163-perps-trade` / `164-perps-funding`、`170-earn`、`180-near-keys`、`190-mining`、`200-solana-rent`、`210-near-storage`、`220-contacts`、`230-walletconnect`、`240-lifecycle`。
- **独立模块（未分片，直接编辑）**：`src/limit-orders.js`（NEAR DCL / Jupiter Trigger / CoW 限价单）、`src/hyperliquid-perps.js`（Hyperliquid 永续协议）、`src/mining-pro.js`（Pearl 矿机遥测与扫币，按需懒加载）。
- **测试文件（`test/`）**：`helpers.js` + `01-core-modules` / `02-v1-v2.0` / `03-v2.1-v3.3` / `04-v4-v5` / `05-v6.0-v6.4` / `06-v6.7-v6.10` / `07-v6.11-plus` / `08-build-parts.test.js`。
