# Veyra Atelier Deployment Runbook / Veyra Atelier 中英双语部署手册

> **Document status / 文档状态:** Manual deployment only / 仅支持手动部署
>
> **Last verified / 最后核对日期:** 2026-09-20
>
> **Repository type / 仓库类型:** Public GitHub repository / GitHub 公共仓库
>
> **Application language / 网站语言:** English / 英文
>
> **Runbook language / 手册语言:** English and Simplified Chinese / 英文与简体中文

This runbook is the single ordered procedure for preparing, configuring,
deploying, validating, monitoring, and recovering Veyra Atelier. Run commands
from the repository root unless a step says otherwise.

本手册是 Veyra Atelier 从准备、服务配置、部署、验证、监控到恢复的单一有序流程。
除非步骤另有说明，否则所有命令都应在仓库根目录执行。

Do not paste real credentials into this file, Git commits, issues, screenshots,
chat, or logs.

不要把真实密钥粘贴到本文件、Git 提交、Issue、截图、聊天记录或日志中。

For a zero-recurring-cost MVP Demo with reduced capacity and free-tier
availability limits, use `docs/deployment-free-bilingual.md`. This document
remains the recommended production/approximately-300-customer track.

如需零固定托管费用、容量较低且接受免费层可用性限制的 MVP Demo，请使用
`docs/deployment-free-bilingual.md`。本文件仍为推荐生产/约 300 客户 Track。

### Vercel CLI security gate / Vercel CLI 安全 Gate

The standard Node-based Vercel CLI reviewed on 2026-09-20 contained
high/critical transitive advisories and is intentionally absent. The
repository instead pins Vercel's official code-signed experimental native CLI
`@vercel/vc-native@59.23.2`, whose installed two-package tree passed
`npm audit --audit-level=high`.

2026-09-20 审核的标准 Node 版 Vercel CLI 含 high/critical 传递依赖漏洞，因此不进入
项目。仓库改为锁定 Vercel 官方签名的实验性 native CLI
`@vercel/vc-native@59.23.2`；其两包依赖树已通过
`npm audit --audit-level=high`。

```powershell
npm ci
npm audit --audit-level=high
npm run vercel:doctor

$Vercel = (Resolve-Path `
  ".\node_modules\@vercel\vc-native\bin\vercel.exe").Path
```

On macOS/Linux use
`./node_modules/@vercel/vc-native/bin/vercel.exe`; the provider keeps this
filename for its signed native binaries on every supported OS. Do not replace
this with bare `npx vercel`, a global standard Node CLI, or an unpinned
version. Re-run the audit immediately before deployment.

macOS/Linux 使用 `./node_modules/@vercel/vc-native/bin/vercel.exe`；服务商在所有
支持的系统中都保留该文件名。禁止替换为裸 `npx vercel`、全局标准 Node CLI 或未锁定
版本。每次部署前重新执行 audit。

---

## 0. Deployment model and unavoidable costs / 部署模式与不可避免的费用

### Recommended managed production / 推荐的托管生产环境

| Service / 服务  | Tier / 方案                                     | Purpose / 用途                                                     | Expected cost / 预计费用                              |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Vercel          | Pro, one deploying seat / Pro，1 个部署席位     | Commercial Next.js hosting / 商业 Next.js 托管                     | From USD 20/month / 约 20 美元/月起                   |
| Supabase        | Pro, one Micro project / Pro，1 个 Micro 项目   | PostgreSQL, Auth, Realtime, Storage / 数据库、认证、实时通信、存储 | From USD 25/month / 约 25 美元/月起                   |
| Google OAuth    | Basic OAuth client / 基础 OAuth 客户端          | Google sign-in / Google 登录                                       | No separate service fee identified / 未发现单独服务费 |
| Stripe Checkout | Standard hosted Checkout / 标准托管收银台       | Final payment / 最终付款                                           | Transaction fees / 交易手续费                         |
| Resend          | Disabled or Free initially / 初期关闭或免费方案 | Optional transactional email / 可选事务邮件                        | USD 0 within current limits / 当前额度内 0 美元       |
| Domain / 域名   | Registrar-dependent / 取决于注册商              | Production identity / 生产域名                                     | Registration and renewal / 注册与续费                 |

**Managed fixed-cost floor / 托管固定费用下限:** approximately USD 45/month,
plus domain, taxes, Stripe fees, and overages.

约为每月 45 美元，另加域名、税费、Stripe 交易手续费和超额用量费用。

Normal preview testing can use a separate Supabase Free project. The required
300-connection test cannot: it needs a temporary Pro-capable non-production
project. Under the current Supabase organization pricing, a second Micro
project in the same Pro organization can add approximately USD 10/month while
it exists because the organization includes one USD 10 compute credit. Confirm
the current invoice preview before creating it.

普通预览测试可以使用独立的 Supabase 免费项目，但 300 连接测试不可以；该测试需要临时
使用具备 Pro 容量的非生产项目。按照当前 Supabase 组织计费方式，同一 Pro 组织中的
第二个 Micro 项目在存续期间可能增加约 10 美元/月，因为组织只包含一份 10 美元计算
额度。创建前必须检查账单预览。

Vercel Hobby is restricted to non-commercial personal use. Supabase Free
supports 200 concurrent Realtime connections, below the target of about 300
simultaneous customers. A fully free managed production deployment does not
meet the stated commercial and concurrency requirements.

Vercel Hobby 仅适用于非商业个人用途。Supabase 免费方案只支持 200 个并发 Realtime
连接，低于约 300 名同时在线客户的目标。因此，完全免费的托管生产方案无法满足当前
商业用途和并发要求。

### Cost approval gate / 费用批准 Gate

- [ ] English: Confirm approval for Vercel Pro and Supabase Pro before creating
      production resources.
- [ ] 中文：创建生产资源之前，确认已批准 Vercel Pro 和 Supabase Pro 费用。
- [ ] English: Record the merchant country because Stripe pricing and
      availability vary by country.
- [ ] 中文：记录商户所在国家，因为 Stripe 的可用性和费率因国家而异。
- [ ] English: Record the domain purchase and renewal price.
- [ ] 中文：记录域名购买价和续费价。
- [ ] English: Keep Resend disabled until email volume and domain verification
      justify enabling it.
- [ ] 中文：在邮件量和域名验证明确之前，保持 Resend 关闭。

**GO/NO-GO 0:** Do not continue to production account creation without owner
approval for unavoidable costs.

**上线/停止 Gate 0：** 未获得业务所有者对不可避免费用的批准前，不要创建生产账户。

---

## 1. Decide production values / 确定生产参数

Record these values in a private password manager or deployment worksheet, not
in Git.

将以下值记录在私密密码管理器或部署工作表中，不要提交到 Git。

- [ ] Merchant legal country / 商户法定所在国家
- [ ] Stripe account country / Stripe 账户国家
- [ ] Production domain, for example `https://example.com` / 生产域名
- [ ] Preview domain or Vercel preview URL / 预览域名或 Vercel 预览 URL
- [ ] Default ISO currency, for example `USD` / 默认 ISO 货币代码
- [ ] Business IANA timezone, for example `America/Chicago` / IANA 业务时区
- [ ] Exact administrator Google email / 管理员 Google 邮箱
- [ ] Administrator notification email / 管理员通知邮箱
- [ ] Approved deliverable hosts, for example `dropbox.com` /
      允许的交付链接域名
- [ ] Cancellation and refund policy / 取消与退款政策
- [ ] Privacy and retention periods / 隐私与数据保留期限
- [ ] Recovery objectives, RPO and RTO / 恢复点和恢复时间目标
- [ ] Named owner for Vercel, Supabase, Google, Stripe, Resend, and DNS /
      各服务和 DNS 的负责人

Use `USD` and `UTC` only as development defaults unless they are correct for
the business.

只有在确实符合业务时才可在生产环境使用 `USD` 和 `UTC`；它们默认仅用于开发。

---

## 2. Prepare the public GitHub repository / 准备 GitHub 公共仓库

### 2.0 Clone and select the release revision / 克隆并选择发布版本

Replace the placeholders with the public repository URL and the approved
release branch or tag:

将占位符替换为公共仓库 URL 和已批准的发布分支或标签：

```powershell
git clone <PUBLIC_REPOSITORY_URL> jewel_web
Set-Location jewel_web
git fetch --all --tags --prune
git checkout <RELEASE_BRANCH_OR_TAG>
git status --porcelain
git rev-parse HEAD
```

`git status --porcelain` must return no output. Record the exact commit hash
from `git rev-parse HEAD` in the deployment worksheet.

`git status --porcelain` 必须没有输出。把 `git rev-parse HEAD` 返回的精确提交哈希
记录到部署工作表。

### 2.1 Verify public dependencies / 验证公共依赖

Inspect the committed registry configuration before installing tools:

安装工具前先检查已提交的 registry 配置：

```powershell
Get-Content .npmrc
Select-String `
  -Path package-lock.json,package.json `
  -Pattern 'npm\.deere\.com|artifactory/api/npm|@deere|john-?deere|"(file|link|workspace|git\+ssh|git\+https|ssh):|"resolved"\s*:\s*"(?!https://registry\.npmjs\.org/)'
```

`.npmrc` must show `https://registry.npmjs.org/`, and `Select-String` must
return no match. This rejects Deere/private registry references and arbitrary
local, Git, SSH, or non-public tarball sources before `npm ci`. §3 performs the
executable npm installation and audit after Node.js is available.

`.npmrc` 必须显示 `https://registry.npmjs.org/`，`Select-String` 必须无匹配。
该检查会在 `npm ci` 之前拒绝 Deere/私有 registry、本地、Git、SSH 或非公共 tarball
来源。Node.js 可用后，§3 会执行实际 npm 安装和审计。

Expected result / 预期结果：

- `npm ci` installs from `https://registry.npmjs.org/`.
- `npm ci` 从 `https://registry.npmjs.org/` 安装依赖。
- No dependency name starts with `@deere` or contains John Deere branding.
- 不存在以 `@deere` 开头或包含 John Deere 品牌名称的依赖。
- `package-lock.json` contains no internal Artifactory URL.
- `package-lock.json` 不包含内部 Artifactory URL。
- The audit reports no high or critical vulnerability.
- 审计没有高危或严重漏洞。

The repository-level `.npmrc` and `check:public-dependencies` script enforce
this public-only dependency boundary.

仓库中的 `.npmrc` 和 `check:public-dependencies` 脚本会持续强制使用公共依赖源。

### 2.2 Verify secret exclusions / 验证密钥排除规则

```powershell
git status --short
git check-ignore .env.local
```

Confirm the following are not committed / 确认以下内容不会提交：

- [ ] `.env.local` and `.env.production` / 本地和生产环境文件
- [ ] Supabase service-role keys / Supabase service-role 密钥
- [ ] Google client secrets / Google 客户端密钥
- [ ] Stripe keys and webhook secrets / Stripe 密钥和 webhook 密钥
- [ ] Resend API keys / Resend API 密钥
- [ ] Database dumps / 数据库导出文件
- [ ] Customer images, messages, and deliverables / 客户图片、消息和交付文件
- [ ] Playwright screenshots and traces / Playwright 截图和 trace
- [ ] Load-test access tokens / 压测访问令牌

Only `.env.example` may be committed. It contains names and placeholders, not
secrets.

只有 `.env.example` 可以提交；其中只能包含变量名和占位值。

The checked-in `.vercelignore` independently excludes `.env*`,
keys/certificates, database assets, tests, documentation, and generated
artifacts from manual CLI source deployments. Review it before every release.

仓库中的 `.vercelignore` 还会在手动 CLI source deployment 时排除 `.env*`、
key/certificate、数据库文件、测试、文档和生成产物；每次发布前都必须复核。

### 2.3 Verify GitHub Actions behavior / 验证 GitHub Actions 行为

`.github/workflows/manual-verify.yml` must contain only:

`.github/workflows/manual-verify.yml` 必须只包含：

```yaml
on:
  workflow_dispatch:
```

- [ ] No `push` trigger / 无 `push` 触发
- [ ] No `pull_request` trigger / 无 `pull_request` 触发
- [ ] No `schedule` trigger / 无定时触发
- [ ] No deployment or migration step / 无部署或数据库迁移步骤
- [ ] No production provider secrets / 无生产服务密钥

Inspect **every** workflow file, not only the named workflow:

检查 `.github/workflows` 中的**每一个** workflow，而不只是指定文件：

```powershell
$workflowFiles = Get-ChildItem `
  -Path .github\workflows\*.yml,.github\workflows\*.yaml `
  -File
$workflowFiles | Select-Object FullName
$workflowFiles | Select-String `
  -Pattern '(?i)\b(push|pull_request|schedule|workflow_run|repository_dispatch|merge_group|release|deployment)\b'
```

The final `Select-String` command must return no automatic trigger. It is a
fail-safe text scan and may report a word used in a comment or step name; open
every listed workflow and manually confirm its complete `on:` value contains
only `workflow_dispatch`, including inline-array syntax.

最后一条 `Select-String` 不得返回自动触发器。该命令是保守文本扫描，可能匹配注释或
步骤名称；必须逐个打开 workflow，检查完整 `on:` 配置及内联数组语法，确认唯一事件为
`workflow_dispatch`。

Run it manually from GitHub **Actions > Manual verification > Run workflow**.

需要时在 GitHub 的 **Actions > Manual verification > Run workflow** 手动执行。

In the branch/ref selector choose the exact approved
`<RELEASE_BRANCH_OR_TAG>`. After the run starts, inspect the checkout step and
confirm its commit SHA matches the value recorded in §2.0.

在 branch/ref 选择器中选择已批准的 `<RELEASE_BRANCH_OR_TAG>`；运行开始后检查 checkout
步骤，确认提交 SHA 与 §2.0 记录完全一致。

**GO/NO-GO 1:** Stop if public dependency verification or secret exclusion
fails.

**上线/停止 Gate 1：** 公共依赖检查或密钥排除失败时必须停止。

---

## 3. Prepare the local toolchain / 准备本地工具链

### Required tools / 必需工具

- Git
- Node.js version from `.nvmrc`
- npm 10 or newer
- Docker Desktop for local Supabase
- Stripe CLI for local webhook forwarding
- A modern Chromium browser

中文说明：

- Git：克隆和选择精确发布版本。
- Node.js 与 npm：安装依赖、运行构建和测试。
- Docker Desktop：运行本地 Supabase/PostgreSQL 和 pgTAP。
- Stripe CLI：转发本地测试 webhook。
- Chromium：执行 Playwright 浏览器与无障碍测试。

### Install and verify versions / 安装并验证版本

1. Install Git from its official distribution, then run `git --version`.
2. 从官方渠道安装 Git，然后执行 `git --version`。
3. Install a Node version manager or the official Node distribution. With
   nvm-windows:
4. 安装 Node 版本管理器或官方 Node；使用 nvm-windows 时：

```powershell
$requiredNode = (Get-Content .nvmrc).Trim()
nvm install $requiredNode
nvm use $requiredNode
node --version
npm --version
```

`node --version` must match `.nvmrc`; npm must be version 10 or newer.

`node --version` 必须与 `.nvmrc` 一致；npm 必须为 10 或更高版本。

5. Install Docker Desktop from the official provider, start it, complete any
   required organization sign-in, then run:
6. 从官方渠道安装 Docker Desktop，启动并完成组织登录，然后执行：

```powershell
docker version
docker info
```

7. Install Stripe CLI from Stripe's official distribution, then run:
8. 从 Stripe 官方渠道安装 Stripe CLI，然后执行：

```powershell
stripe version
```

9. Install PostgreSQL client tools from the official PostgreSQL distribution
   for the restore drill, then run:
10. 为恢复演练安装官方 PostgreSQL 客户端工具，然后执行：

```powershell
psql --version
```

11. Verify PowerShell 7 or a compatible Windows PowerShell:
12. 验证 PowerShell 7 或兼容的 Windows PowerShell：

```powershell
$PSVersionTable
```

### Windows PowerShell / Windows PowerShell 步骤

```powershell
npm ci
npm run check:public-dependencies
npm audit --audit-level=high
Copy-Item .env.example .env.local
npx playwright install chromium
docker info
```

### POSIX shell / POSIX Shell 步骤

```bash
npm ci
npm run check:public-dependencies
npm audit --audit-level=high
cp .env.example .env.local
npx playwright install chromium
docker info
```

All three npm commands must pass before continuing.

三个 npm 命令必须全部通过后才能继续。

On managed corporate computers, Docker Desktop may require organization
sign-in. Complete that approved sign-in before running Supabase. Do not bypass
organization policy.

在企业管理电脑上，Docker Desktop 可能要求组织登录。请先完成获批登录，不要绕过企业
策略。

---

## 4. Start and validate local Supabase / 启动并验证本地 Supabase

```powershell
npm run db:start
npx supabase status
```

Copy the local values into `.env.local`:

把本地值复制到 `.env.local`：

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
ADMIN_GOOGLE_EMAIL=designer@example.test
BUSINESS_TIMEZONE=UTC
DEFAULT_CURRENCY=USD
DELIVERABLE_ALLOWED_HOSTS=www.dropbox.com,dropbox.com
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_` variable.

绝不能把 `SUPABASE_SERVICE_ROLE_KEY` 放入任何 `NEXT_PUBLIC_` 变量。

Apply all local migrations and fictional development seed data:

应用全部本地迁移和虚构开发数据：

```powershell
npm run db:reset
npm run db:types
```

Run executable RLS tests:

执行 RLS 测试：

```powershell
npm run test:rls
```

Start the application in **Terminal A** and leave it running:

在**终端 A** 中启动应用并保持运行：

```powershell
npm run dev
```

Verify `http://localhost:3000/api/health` before opening a second terminal.

打开第二个终端前，先验证 `http://localhost:3000/api/health`。

Required result / 必须满足：

- [ ] All migrations apply once / 所有迁移只执行一次并成功
- [ ] pgTAP tests pass / pgTAP 测试通过
- [ ] Customer A cannot access Customer B / 客户 A 无法访问客户 B
- [ ] Generic customer commission transitions are denied /
      客户无法调用通用佣金状态变更
- [ ] Messages and read markers use secure RPCs / 消息和已读标记使用安全 RPC
- [ ] Portfolio and commission buckets are private / 作品集和佣金存储桶为私有
- [ ] Stripe event and deliverable functions exist / Stripe 和交付函数存在

**Important:** production deployment must not proceed until this executable
test has passed on an approved Docker/PostgreSQL environment.

**重要：** 必须在获批的 Docker/PostgreSQL 环境中通过该可执行测试后，才能部署生产。

---

## 5. Configure local Stripe test mode / 配置本地 Stripe 测试模式

In **Terminal B**, install/authenticate the Stripe CLI using a test account.
`stripe listen` is a long-running foreground process; leave it running while
Terminal A runs Next.js:

在**终端 B** 中安装或登录 Stripe CLI。`stripe listen` 是持续运行的前台进程；让它与
终端 A 中的 Next.js 同时运行：

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the test values to `.env.local`:

把测试值写入 `.env.local`：

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart `npm run dev` after changing environment variables.

修改环境变量后重启 `npm run dev`。

Never use `sk_live_` locally. Never make a real charge in automated tests.

本地环境禁止使用 `sk_live_`，自动化测试禁止发起真实扣款。

---

## 6. Generate the Server Action encryption key / 生成 Server Action 加密密钥

Generate one production secret and store it in the password manager:

生成一个生产密钥并存入密码管理器：

### PowerShell

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

### POSIX

```bash
openssl rand -base64 32
```

Use the result as `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Keep it stable across
simultaneously active Vercel instances. Rotating it can invalidate in-flight
Server Actions.

将结果设置为 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`。同时运行的 Vercel 实例必须使用
相同值。轮换该值可能使正在进行的 Server Action 失效。

Generate **different** values for Preview and Production. Never copy the
production value into Preview.

Preview 和 Production 必须分别生成不同的值，禁止把生产值复制到 Preview。

---

## 7. Run the complete local application gate / 执行完整本地质量 Gate

```powershell
npm run verify
npm run test:e2e
npm audit --audit-level=high
npm run check:public-dependencies
```

`npm run verify` performs / `npm run verify` 包含：

1. Formatting check / 格式检查
2. Public dependency provenance / 公共依赖来源检查
3. ESLint / ESLint 检查
4. Next.js type generation / Next.js 路由类型生成
5. Strict TypeScript / 严格 TypeScript
6. Unit and API tests with coverage / 单元和 API 测试及覆盖率
7. Component tests / 组件测试
8. Credential-free integration discovery / 无凭据集成测试发现
9. Production build / 生产构建

Current verified baseline / 当前已验证基线：

- 403 unit/API tests passed / 403 个单元与 API 测试通过
- 27 component tests passed / 27 个组件测试通过
- 28 public browser tests passed, with 4 intentional device-role skips /
  28 个公共页面浏览器测试通过，另有 4 个按设备职责设计的跳过项
- Production build passed / 生产构建通过
- Dependency audit: zero vulnerabilities / 依赖漏洞为 0
- Coverage: 85.28% statements, 81.23% branches, 93.44% functions, 85.31%
  lines / 覆盖率：statements 85.28%、branches 81.23%、functions 93.44%、
  lines 85.31%

**GO/NO-GO 2:** Do not deploy a preview if formatting, lint, typecheck, tests,
public dependencies, or production build fails.

**上线/停止 Gate 2：** 格式、Lint、类型、测试、公共依赖或生产构建任一失败时，不得
部署预览。

---

## 8. Create isolated service environments / 创建隔离的服务环境

Use independent resources:

必须使用相互隔离的资源：

| Environment / 环境 | Supabase                        | Stripe                   | Resend                     | Customer data / 客户数据    |
| ------------------ | ------------------------------- | ------------------------ | -------------------------- | --------------------------- |
| Local / 本地       | Local Docker                    | Test mode                | Disabled                   | Fictional only / 仅虚构数据 |
| Preview / 预览     | Separate non-production project | Test mode                | Disabled or test recipient | Fictional only / 仅虚构数据 |
| Production / 生产  | Supabase Pro production project | Live mode after approval | Verified production sender | Real data / 真实数据        |

Never point Vercel Preview at the production Supabase database.

Vercel Preview 绝不能连接生产 Supabase 数据库。

Never expose production secrets to public pull requests or forks.

绝不能把生产密钥暴露给公共 Pull Request 或 Fork。

### 8.1 Create the preview Supabase project / 创建 Preview Supabase 项目

1. English: Create a separate non-production Supabase project. Free is
   acceptable for normal preview testing.
   中文：创建独立的非生产 Supabase 项目；普通预览测试可使用免费方案。
2. English: Choose a name containing `preview`, `staging`, or `test`.
   中文：项目名称应明确包含 `preview`、`staging` 或 `test`。
3. English: Link the CLI to the preview project and apply migrations.
   中文：将 CLI 关联到 Preview 项目并应用迁移。

```powershell
npx supabase link --project-ref YOUR_PREVIEW_PROJECT_REF
npx supabase db push --linked
npx supabase migration list --linked
```

4. English: Do not insert real customers, payments, or deliverables.
   中文：不要插入真实客户、付款或交付数据。
5. English: Use fictional preview data only.
   中文：只能使用虚构预览数据。

### 8.2 Execute pgTAP against preview / 在 Preview 执行 pgTAP

Run only against the dedicated non-production project:

仅对独立非生产项目执行：

```powershell
npx supabase test db --linked supabase/tests/database
```

Do not run destructive test fixtures against production. Review every pgTAP
file before using `--linked`.

禁止对生产运行破坏性测试。使用 `--linked` 前必须审核每个 pgTAP 文件。

### 8.3 Configure preview Google OAuth / 配置 Preview Google OAuth

Create a separate Google Cloud testing project and Web OAuth client.

创建独立的 Google Cloud 测试项目和 Web OAuth 客户端。

Authorized redirect URI:

授权回调 URI：

```text
https://YOUR_PREVIEW_PROJECT_REF.supabase.co/auth/v1/callback
```

Enable Google in the Preview Supabase project. Disable Email/password, Phone,
Anonymous, manual identity linking, and every non-Google provider. The
database requires the current JWT's OAuth AMR plus a confirmed linked Google
identity. The Vercel preview redirect URL will be added after §8.6 creates the
stable preview alias.

在 Preview Supabase 项目中启用 Google，并关闭 Email/password、Phone、Anonymous、
manual identity linking 和所有非 Google provider。数据库要求当前 JWT 的 OAuth AMR
以及已确认并关联的 Google identity。§8.6 创建稳定 Preview alias 后，再添加应用
回调 URL。

Use this testing Google project for localhost and Preview only. Configure
authorized JavaScript origins `http://localhost:3000` and the stable Preview
origin. In Preview Supabase URL settings, use the stable Preview origin as Site
URL and allow `http://localhost:3000/auth/callback` plus the stable Preview
`/auth/callback`. Never add these testing URLs to the production Google or
Supabase project.

该测试 Google 项目只用于 localhost 和 Preview。Authorized JavaScript origins
配置 `http://localhost:3000` 及稳定 Preview origin。Preview Supabase URL 设置中，
Site URL 使用稳定 Preview origin，并允许 `http://localhost:3000/auth/callback`
及稳定 Preview `/auth/callback`。禁止把这些测试 URL 加入生产 Google 或 Supabase
项目。

### 8.4 Configure preview Stripe / 配置 Preview Stripe

Use Stripe **test mode** only. Create the preview webhook after §8.6 provides
the stable preview alias. Its secret belongs only in Vercel Preview.

只使用 Stripe **测试模式**。§8.6 获得稳定 Preview alias 后再创建 Preview webhook；
该 webhook secret 只能放在 Vercel Preview。

### 8.5 Capacity-test project / 容量测试项目

The ordinary Free preview project cannot run 300 Realtime connections. Before
§22, temporarily add or upgrade a clearly named non-production project to a
Pro-capable tier, obtain cost approval, run the test, export required evidence,
then downgrade/delete it if it is no longer needed.

普通免费 Preview 项目不能测试 300 个 Realtime 连接。执行 §22 前，应在获得费用批准后
临时创建或升级一个名称明确的非生产项目到 Pro 容量，完成测试并保存结果；不再需要时
降级或删除。

Before the capacity test, apply the same migrations, configure the same
Realtime publication and RLS, enable the testing Google provider if browser
journeys are included, and run pgTAP:

容量测试前，必须应用相同迁移、配置相同 Realtime publication 和 RLS；如包含浏览器
流程则启用测试 Google provider，并执行 pgTAP：

```powershell
npx supabase link --project-ref YOUR_CAPACITY_PROJECT_REF
npx supabase db push --linked
npx supabase test db --linked supabase/tests/database
```

### 8.6 Create the Vercel project and stable Preview / 创建 Vercel 项目和稳定 Preview

Complete Vercel setup **before creating or changing production resources**:

必须在创建或修改生产资源之前完成 Vercel Preview：

```powershell
npm run vercel:login
npm run vercel:link
```

Create a new Vercel project, confirm Next.js detection, and do not connect Git
auto-deployment. The checked-in `vercel.json` also sets
`git.deploymentEnabled=false`.

创建新 Vercel 项目，确认识别为 Next.js，不连接 Git 自动部署。仓库中的
`vercel.json` 也设置了 `git.deploymentEnabled=false`。

Before any deployment, configure these Project Settings now:

任何 deployment 前，立即配置以下 Project Settings：

- Framework Preset: Next.js
- Install Command: `npm ci`
- Build Command: `npm run build:vercel`
- Enable Automatically expose System Environment Variables /
  启用 Automatically expose System Environment Variables

Choose the stable Preview alias now. Add it to the Vercel project, configure
DNS, wait for TLS, and make it publicly reachable through a Deployment
Protection domain exception:

现在选择稳定 Preview alias。把它加入 Vercel Project，配置 DNS、等待 TLS，并通过
Deployment Protection domain exception 让它可公开访问：

```powershell
& $Vercel domains add <STABLE_PREVIEW_ALIAS>
```

Configure that alias in Preview Supabase and create the Stripe Sandbox
webhook **before** entering the environment matrix:

在录入环境变量矩阵**之前**，先把该 alias 配置到 Preview Supabase，并创建 Stripe
Sandbox webhook：

```text
Supabase Site URL: https://STABLE_PREVIEW_ALIAS
Supabase Redirect URL: https://STABLE_PREVIEW_ALIAS/auth/callback
Stripe webhook: https://STABLE_PREVIEW_ALIAS/api/webhooks/stripe
```

Copy the resulting Preview `whsec_...`. OAuth and Stripe cannot complete
through a protected browser origin; application authentication still protects
`/app` and `/admin`.

保存生成的 Preview `whsec_...`。OAuth 与 Stripe 无法通过受保护的浏览器 origin；
应用自身认证仍保护 `/app` 与 `/admin`。

Also complete the §13 environment matrix now. In Preview set
`VEYRA_VERCEL_ENV=preview`, the non-production Supabase project, Stripe test
values, test administrator, business settings, and a Preview-specific Server
Action key. In temporary bootstrap Production set
`VEYRA_VERCEL_ENV=production` and the explicitly temporary `free-demo` values
described below. Sections 12–13 later are mandatory re-verification, not the
first time these prerequisites are configured.

现在还必须完成 §13 环境变量矩阵。Preview 设置
`VEYRA_VERCEL_ENV=preview`、非生产 Supabase、Stripe test、测试管理员、业务设置
和 Preview 专用 Server Action key。临时 bootstrap Production 设置
`VEYRA_VERCEL_ENV=production`，并使用下文明确说明的临时 `free-demo` 值。后续
§12–§13 是强制复核，不是首次配置这些先决条件。

Vercel treats a project's first deployment as Production even without
`--prod`. To bootstrap safely, temporarily set the Vercel **Production**
environment to the same fictional Preview Supabase/Stripe test resources,
with `NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo`. Create an unaliased bootstrap
deployment:

Vercel 会把 Project 的第一次部署视为 Production，即使未使用 `--prod`。安全
bootstrap 方式是：临时把 Vercel **Production** 环境配置为与 Preview 相同的虚构
Supabase/Stripe test 资源，并设置
`NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo`，然后创建不绑定域名的 bootstrap：

```powershell
npm run vercel:deploy:candidate
```

`vercel:deploy:candidate` is pinned to
`vercel deploy --prod --skip-domain`; Vercel uploads source, validates the
write-only Sensitive variables during its remote build, and cannot assign the
Production domain.

`vercel:deploy:candidate` 固定执行
`vercel deploy --prod --skip-domain`；Vercel 上传源码，在远程 build 中验证
write-only Sensitive 变量，并且不会绑定 Production 域名。

Copy the exact bootstrap deployment URL from the output, but do not promote
it. It exists only to establish the Vercel project.
Before §20, replace every temporary Production value with the real production
values and validate them again.

从输出复制精确的 bootstrap deployment URL，但不要 promote；它只用于建立 Vercel
Project。§20 前必须把全部临时 Production 变量替换为真实生产变量，并重新验证。

The temporary Production `NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo`,
non-production Supabase values, and Stripe test values must all be removed.
Set `NEXT_PUBLIC_DEPLOYMENT_TRACK=production`, the real production Supabase
values, `STRIPE_MODE=live`, the matching live key/webhook secret, and a
production-only Server Action key. Section 20 is blocked until
the two Dashboard scopes have been compared manually and the remote
Production build passes its `next.config.ts` environment gate.

临时 Production 中的 `NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo`、非生产 Supabase
和 Stripe test 值必须全部移除。改为
`NEXT_PUBLIC_DEPLOYMENT_TRACK=production`、真实生产 Supabase、
`STRIPE_MODE=live`、匹配的 live key/webhook secret 和生产专用 Server Action key。
必须手动比较两个 Dashboard scope，并且远程 Production build 通过
`next.config.ts` 环境 Gate 后，才能执行 §20。

Set `NEXT_PUBLIC_APP_URL=https://STABLE_PREVIEW_ALIAS`, the matching Preview
`STRIPE_WEBHOOK_SECRET`, and a dedicated 32-byte Base64
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Deploy from source so the authoritative
environment gate runs remotely, then alias the Preview:

设置 `NEXT_PUBLIC_APP_URL=https://STABLE_PREVIEW_ALIAS`、匹配的 Preview
`STRIPE_WEBHOOK_SECRET` 和独立的 32-byte Base64
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`，然后远程构建、部署并绑定 Preview：

```powershell
npm run vercel:deploy:preview
```

Copy the exact Preview deployment URL from the output, then:

从输出复制精确的 Preview deployment URL，然后执行：

```powershell
$validatedPreview = "https://EXACT-PREVIEW-DEPLOYMENT.vercel.app"
& $Vercel alias set $validatedPreview <STABLE_PREVIEW_ALIAS>
```

Open the stable Preview alias and sign in once with the controlled Google test
account so Preview Supabase creates the Auth identity and profile. Then
synchronize the fictional Preview administrator before the mandatory gate.
Prompt for the Preview service-role key so it is not written into shell
history:

先打开稳定 Preview alias，使用受控 Google 测试账户登录一次，让 Preview Supabase
创建 Auth identity 和 profile；然后在强制 Preview Gate 前同步虚构管理员。通过安全
提示输入 Preview service-role key，避免写入 shell 历史：

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://YOUR_PREVIEW_PROJECT_REF.supabase.co"
$env:ADMIN_GOOGLE_EMAIL = "<CONTROLLED_GOOGLE_TEST_EMAIL>"
$previewRoleKey = Read-Host "Preview Supabase service-role key" -AsSecureString
$previewRolePointer =
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($previewRoleKey)
try {
  $env:SUPABASE_SERVICE_ROLE_KEY =
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($previewRolePointer)
  npm run admin:sync
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($previewRolePointer)
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_GOOGLE_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
}
```

Sign out and sign in again before testing `/admin`.

测试 `/admin` 前退出并重新登录。

`CONTROLLED_GOOGLE_TEST_EMAIL` must be a real Google account controlled by the
operator, contain no real customer data, and be added to the testing OAuth
consent screen's test-user list before login.

`CONTROLLED_GOOGLE_TEST_EMAIL` 必须是操作人员控制的真实 Google 账户，不包含真实客户
数据，并在登录前加入测试 OAuth consent screen 的 test-user 列表。

### 8.7 Mandatory full Preview gate / 强制完整 Preview Gate

Before continuing to §9, execute the complete §21 functional checklist against
`https://STABLE_PREVIEW_ALIAS` using fictional users and Stripe test mode. Also
run:

继续到 §9 前，必须使用虚构用户和 Stripe 测试模式，在
`https://STABLE_PREVIEW_ALIAS` 执行完整 §21 功能清单，并运行：

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://STABLE_PREVIEW_ALIAS"
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Record Google customer/admin login, RLS isolation, messaging, quote,
commission, upload, Checkout/webhook, deliverable lock, aftercare, and public
portfolio evidence. **Do not create or migrate production resources until
this gate passes.**

记录 Google 客户/管理员登录、RLS 隔离、聊天、报价、佣金、上传、Checkout/webhook、
交付锁定、售后和公共作品集证据。**该 Gate 通过前不得创建或迁移生产资源。**

---

## 9. Create the production Supabase project / 创建生产 Supabase 项目

1. English: Create or select the production Supabase organization.
   中文：创建或选择生产 Supabase 组织。
2. English: Select the Pro plan.
   中文：选择 Pro 方案。
3. English: Create one project on Micro compute.
   中文：创建一个使用 Micro 计算规格的项目。
4. English: Choose the region nearest customers and Vercel execution.
   中文：选择靠近主要客户和 Vercel 执行区域的数据中心。
5. English: Generate a strong database password and store it privately.
   中文：生成高强度数据库密码并安全保存。
6. English: Enable MFA for provider administrators.
   中文：为服务管理员启用 MFA。
7. English: Record the project reference, URL, anon key, and service-role key.
   中文：记录项目引用、URL、anon key 和 service-role key。
8. English: Configure spend notifications and review the spend cap.
   中文：配置费用提醒并检查 spend cap 设置。

Do not change a bucket or schema to public to solve an application error.

不要为了绕过应用错误而把存储桶或 schema 改成公开。

---

## 10. Back up and apply production migrations / 备份并应用生产迁移

For an existing deployment, verify a restorable Supabase managed Backup/PITR
point and copy Storage objects before applying any migration. Raw database
dumps are supplemental evidence only. For the first deployment to a brand-new
empty project, record that the pre-application backup is not applicable; skip
the application-bucket copy until migrations create the buckets, then create
the mandatory post-migration baseline described at the end of §11.

已有部署必须在迁移前确认可恢复的 Supabase 托管 Backup/PITR 时间点，并复制 Storage
对象；原始数据库 dump 只作为辅助证据。首次部署到全新空项目时，应记录“应用前备份
不适用”；在迁移创建 bucket 前跳过应用 bucket 复制，并在 §11 末尾创建强制的迁移后
基线。

Authenticate and link the correct project:

登录并关联正确项目：

```powershell
function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory)] [scriptblock] $Command,
    [Parameter(Mandatory)] [string] $Step
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

Invoke-NativeChecked { npx supabase login } "Supabase login"
Invoke-NativeChecked {
  npx supabase link --project-ref YOUR_PROJECT_REF
} "Supabase production link"
Invoke-NativeChecked {
  npx supabase migration list --linked
} "Production migration list"
```

Before changing production, write backups outside the repository:

修改生产环境之前，把备份写到仓库外部：

```powershell
$backupRoot = Join-Path $env:USERPROFILE "veyra-secure-backups"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$releaseStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$schemaBackup = Join-Path $backupRoot "veyra-$releaseStamp-schema.sql"
$dataBackup = Join-Path $backupRoot "veyra-$releaseStamp-data.sql"
Invoke-NativeChecked {
  npx supabase db dump --linked --file $schemaBackup
} "Schema backup"
Invoke-NativeChecked {
  npx supabase db dump --linked --data-only --use-copy --file $dataBackup
} "Data backup"
Get-FileHash $schemaBackup,$dataBackup -Algorithm SHA256
```

Upload the files to an approved encrypted backup vault, verify their hashes,
then remove the temporary cleartext files:

把文件上传到获批的加密备份库，核对哈希后删除临时明文文件：

```powershell
Remove-Item -LiteralPath $schemaBackup,$dataBackup
```

Store backups outside Git. Record:

把导出文件加密保存在 Git 外部，并记录：

- [ ] Git commit or release identifier / Git 提交或发布标识
- [ ] Migration identifiers / 迁移标识
- [ ] Backup location and timestamp / 备份位置和时间
- [ ] Operator name / 操作人
- [ ] Restore-test status / 恢复测试状态

### Back up Storage object bytes / 备份 Storage 对象文件

Database dumps include metadata rows, not the binary object contents. Download
all three private buckets to the same approved temporary backup root:

数据库导出包含对象元数据，但不包含二进制文件。把三个私有存储桶下载到同一个获批的
临时备份目录：

```powershell
$storageBackup = Join-Path $backupRoot "veyra-$releaseStamp-storage"
New-Item -ItemType Directory -Force -Path $storageBackup | Out-Null
Invoke-NativeChecked {
  npx supabase --experimental storage cp --linked --recursive `
    ss:///commission-private `
    $storageBackup
} "Commission Storage backup"
Invoke-NativeChecked {
  npx supabase --experimental storage cp --linked --recursive `
    ss:///portfolio-public `
    $storageBackup
} "Portfolio Storage backup"
Invoke-NativeChecked {
  npx supabase --experimental storage cp --linked --recursive `
    ss:///deliverables-private `
    $storageBackup
} "Deliverables Storage backup"
$storageBackupRoot = (Resolve-Path $storageBackup).Path
$storageManifestPath = Join-Path $storageBackup "sha256.csv"
Remove-Item -LiteralPath $storageManifestPath -Force -ErrorAction SilentlyContinue
$storageManifest = @(
  Get-ChildItem $storageBackup -Recurse -File |
    ForEach-Object {
      [pscustomobject]@{
        RelativePath = [IO.Path]::GetRelativePath(
          $storageBackupRoot,
          $_.FullName
        ).Replace("\", "/")
        SHA256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
      }
    } |
    Sort-Object RelativePath
)
$storageManifest | Export-Csv $storageManifestPath -NoTypeInformation
```

Copying each remote bucket to `$storageBackup` creates local
`commission-private`, `portfolio-public`, and `deliverables-private`
directories. During restore, copying those bucket-named directories to
`ss://` preserves the original object keys; do not target
`ss:///bucket-name`, which would add an extra nested prefix.

把每个远程 bucket 复制到 `$storageBackup` 会创建三个同名本地目录。恢复时把这些
同名目录复制到 `ss://` 才能保留原对象 key；不要目标设为
`ss:///bucket-name`，否则会多出一层嵌套前缀。

Upload the database dumps, object files, and `sha256.csv` to the encrypted
backup vault. Compare object counts with `storage.objects`, then delete the
temporary cleartext directory:

将数据库导出、对象文件和 `sha256.csv` 上传到加密备份库。对比 `storage.objects`
记录数量后，删除临时明文目录：

```powershell
Remove-Item -LiteralPath $storageBackup -Recurse -Force
```

If a bucket does not exist on the first deployment, stop only that object-copy
substep, record it as “not yet created,” and continue to migrations. Any missing
bucket on an existing deployment is an incident and blocks the release.

首次部署时如 bucket 尚不存在，可停止该对象复制子步骤，记录“尚未创建”，然后继续迁移。
已有部署缺少 bucket 则属于故障，必须阻止发布。

Review every migration for:

逐个检查迁移：

- Long locks / 长时间锁
- Table rewrites / 表重写
- Destructive drops or type changes / 破坏性删除或类型修改
- Required extensions and privileges / 所需扩展和权限
- RLS and function grants / RLS 与函数权限
- `SECURITY DEFINER` fixed `search_path` / 固定 `search_path`

Apply migrations manually:

手动应用迁移：

```powershell
Invoke-NativeChecked {
  npx supabase db push --linked
} "Production migration push"
Invoke-NativeChecked {
  npx supabase migration list --linked
} "Production migration verification"
```

Do not run `supabase db reset` against production. Do not delete migration
history. Do not reverse SQL manually without a reviewed recovery plan.

禁止对生产执行 `supabase db reset`，禁止删除迁移历史，禁止在没有审核恢复计划时
手工反向执行 SQL。

Production `db push` must not run `supabase/seed.sql`.

生产 `db push` 不得导入 `supabase/seed.sql`。

**GO/NO-GO 3:** Application deployment may continue only after migrations,
RLS, functions, and storage policies are confirmed.

**上线/停止 Gate 3：** 只有在迁移、RLS、函数和存储策略全部确认后，才能继续部署
应用。

---

## 11. Verify Supabase database, RLS, Storage, and Realtime / 验证数据库、RLS、存储与实时通信

### Database and RLS / 数据库与 RLS

- [ ] Public users read only published portfolio and public settings metadata.
- [ ] 未登录用户只能读取已发布作品集和公开设置元数据。
- [ ] Customer A cannot query Customer B's requests, conversations, messages,
      quotes, commissions, payments, or files.
- [ ] 客户 A 无法查询客户 B 的请求、会话、消息、报价、佣金、付款或文件。
- [ ] Customers cannot directly insert messages, counteroffers, read markers,
      quote decisions, or commission transitions.
- [ ] 客户无法直接插入消息、还价、已读标记、报价决策或佣金状态。
- [ ] Administrator access requires the active allowlist.
- [ ] 管理员访问必须通过 active allowlist。
- [ ] Service-only Stripe and deliverable functions reject ordinary users.
- [ ] Stripe 与交付的 service-only 函数拒绝普通用户。

### Storage buckets / 存储桶

Confirm all three buckets are private:

确认以下三个存储桶均为私有：

| Bucket ID / 存储桶 ID  | Required `public` value / 必须的 public 值 | Purpose / 用途                                                                  |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `commission-private`   | `false`                                    | Request, message, and draft images / 请求、消息、草稿图片                       |
| `portfolio-public`     | `false`                                    | Portfolio media; legacy name, private behavior / 作品集媒体；名称保留但实际私有 |
| `deliverables-private` | `false`                                    | Final uploaded delivery support / 最终交付文件支持                              |

Published portfolio bytes must use `/api/portfolio-media/[id]/open`. Private
attachments must use `/api/attachments/[id]/open`. Final external links must
use `/api/deliverables/[id]/open`.

已发布作品图片必须通过 `/api/portfolio-media/[id]/open`；私有附件必须通过
`/api/attachments/[id]/open`；最终外部链接必须通过
`/api/deliverables/[id]/open`。

### Realtime / 实时通信

- [ ] `messages` and `conversations` are in the required Realtime publication.
- [ ] `messages` 和 `conversations` 已加入所需 Realtime publication。
- [ ] RLS remains enabled for Realtime reads.
- [ ] Realtime 读取继续受 RLS 保护。
- [ ] No presence or typing channel is enabled.
- [ ] 未启用 presence 或 typing 通道。
- [ ] Admin inbox uses one global subscription, not one per customer.
- [ ] 管理员收件箱使用一个全局订阅，而不是每个客户一个订阅。

### Production RLS verification after §29 / §29 提升后的生产 RLS 验证

Prepare the two controlled accounts now, but execute these application checks
only after §29 promotes the candidate to the final domain. Do not execute
destructive pgTAP fixtures against production.

现在准备两个受控账户，但必须在 §29 将候选版本提升到最终域名后再执行以下检查。
禁止对生产执行破坏性 pgTAP。

1. Customer A creates a request, message, and image.
2. 客户 A 创建请求、消息和图片。
3. Customer B attempts A's copied request, conversation, attachment, quote,
   commission, and deliverable URLs.
4. 客户 B 尝试访问客户 A 的所有复制 URL。
5. Every attempt must return leak-safe not-found or permission denial.
6. 每次访问都必须返回不泄露数据的 not-found 或权限拒绝。
7. The administrator can access the records only while actively allowlisted.
8. 管理员只有在 active allowlist 中时才可访问。
9. Record the test timestamp and result without storing tokens or customer
   content.
10. 记录测试时间和结果，但不要保存 token 或客户内容。

### Mandatory post-migration baseline / 强制迁移后基线

After database, RLS, functions, buckets, and Realtime publication are verified,
record the current managed Backup/PITR coverage and repeat the §10 supplemental
database dump and Storage object-copy procedure. For a first deployment this is
the first recovery baseline, but it is not a complete restore point until the
managed backup workflow passes the §25 restore drill.

验证数据库、RLS、函数、bucket 和 Realtime publication 后，记录当前托管
Backup/PITR 覆盖，并再次执行 §10 的辅助数据库导出和 Storage 对象复制。首次部署时，
这是第一个恢复基线；只有托管备份流程通过 §25 恢复演练后，才可视为完整恢复点。

---

## 12. Create the Vercel project without automatic Git deployment / 创建不自动部署的 Vercel 项目

The project and stable Preview were created in §8.6. Use this section to verify
the shared project configuration before adding Production values; do not
create a second Vercel project.

Vercel 项目和稳定 Preview 已在 §8.6 创建。本节用于在添加 Production 值前复核同一
项目配置，不要创建第二个项目。

Verify and invoke the pinned native Vercel CLI:

验证并调用锁定的 Vercel native CLI：

```powershell
npm run vercel:doctor
npm run vercel:login
npm run vercel:link
```

When prompted:

出现提示时：

1. Select the production Vercel account/team.
2. 选择生产 Vercel 账户或团队。
3. Select the existing project created in §8.6.
4. 选择 §8.6 已创建的同一项目。
5. Confirm Next.js framework detection.
6. 确认框架识别为 Next.js。
7. Do not import/connect the GitHub repository for automatic deployment.
8. 不要导入或连接 GitHub 仓库进行自动部署。

If the project was imported through the dashboard, disable Git deployments in
Project Settings before continuing. The checked-in `vercel.json` independently
sets `git.deploymentEnabled=false`.

如果通过 Dashboard 导入项目，继续之前必须在 Project Settings 中关闭 Git 自动部署。
仓库中的 `vercel.json` 也独立设置了 `git.deploymentEnabled=false`。

Set:

设置：

- Node.js version matching `.nvmrc` / 与 `.nvmrc` 一致的 Node.js 版本
- Build command: `npm run build:vercel`
- Install command: `npm ci`
- Framework preset: Next.js
- Function region near Supabase / Function 区域尽量靠近 Supabase
- Enable Automatically expose System Environment Variables /
  启用 Automatically expose System Environment Variables

`build:vercel` fails when Vercel's system `VERCEL_ENV` is absent or disagrees
with the manually scoped `VEYRA_VERCEL_ENV`. Do not override the repository
build command in the Dashboard.

`build:vercel` 会在 Vercel 系统 `VERCEL_ENV` 缺失，或与手动 scope 的
`VEYRA_VERCEL_ENV` 不一致时失败。不要在 Dashboard 覆盖仓库定义的 build command。

Do not add a migration command to the Vercel build.

禁止在 Vercel build 中加入数据库迁移命令。

---

## 13. Configure Vercel environment variables / 配置 Vercel 环境变量

Before entering write-only Sensitive values, create a private two-column
Preview/Production worksheet. Compare the actual values side by side and
record the Supabase project refs and Stripe Sandbox/live account plus endpoint
IDs. Confirm the service-role keys, Stripe keys/webhook secrets, and Server
Action keys were copied or generated independently. Sign off this comparison,
then delete the temporary plaintext worksheet according to the credential
policy.

录入 write-only Sensitive 值之前，先在私密位置建立 Preview/Production 双栏
worksheet，逐项比较真实值，并记录 Supabase project ref、Stripe Sandbox/live
account 与 endpoint ID。确认 service-role key、Stripe key/webhook secret 和 Server
Action key 都独立复制或生成。完成签字记录后，按凭据政策删除临时明文 worksheet。

Use the Vercel dashboard or `& $Vercel env add`. Enter secrets interactively;
do not place them in shell history.

使用 Vercel Dashboard 或 `& $Vercel env add`。密钥应交互式输入，避免写入 shell
历史。

### Environment matrix / 环境变量矩阵

| Variable / 变量                      | Preview / 预览                        | Production / 生产            | Browser-visible / 浏览器可见 |
| ------------------------------------ | ------------------------------------- | ---------------------------- | ---------------------------- |
| `NEXT_PUBLIC_APP_URL`                | Stable preview URL after first deploy | Final HTTPS domain           | Yes / 是                     |
| `NEXT_PUBLIC_DEPLOYMENT_TRACK`       | `production`                          | `production`                 | Yes / 是                     |
| `NEXT_PUBLIC_SUPABASE_URL`           | Non-prod Supabase                     | Prod Supabase                | Yes / 是                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Non-prod anon key                     | Prod anon key                | Yes / 是                     |
| `VEYRA_VERCEL_ENV`                   | `preview`                             | `production`                 | No / 否                      |
| `SUPABASE_SERVICE_ROLE_KEY`          | Non-prod only                         | Prod only                    | **No / 否**                  |
| `ADMIN_GOOGLE_EMAIL`                 | Test admin                            | Real admin                   | No / 否                      |
| `STRIPE_MODE`                        | `test`                                | `live`                       | No / 否                      |
| `STRIPE_SECRET_KEY`                  | `sk_test_...`                         | `sk_live_...` after approval | No / 否                      |
| `STRIPE_WEBHOOK_SECRET`              | Preview/test endpoint                 | Live endpoint                | No / 否                      |
| `RESEND_API_KEY`                     | Empty or test                         | Empty or production key      | No / 否                      |
| `EMAIL_FROM`                         | Test sender                           | Verified sender              | No / 否                      |
| `ADMIN_NOTIFICATION_EMAIL`           | Test recipient                        | Real admin recipient         | No / 否                      |
| `BUSINESS_TIMEZONE`                  | Test value                            | Actual IANA timezone         | No / 否                      |
| `DEFAULT_CURRENCY`                   | Test ISO code                         | Actual ISO code              | No / 否                      |
| `DELIVERABLE_ALLOWED_HOSTS`          | Test hosts                            | Approved production hosts    | No / 否                      |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Preview-specific                      | Stable production key        | No / 否                      |

中文说明：本生产手册中 Preview 与 Production 都必须把 deployment track 设置为
`production`；Preview 仍使用非生产 Supabase、Stripe 测试密钥、测试管理员和独立
Server Action 密钥；Production 列必须使用生产 Supabase、Stripe live 密钥、真实管理员、
实际时区/货币和批准的交付域名。只有四个 `NEXT_PUBLIC_` 变量可进入浏览器；其余全部为
服务端密钥或业务配置。

Do not create `VERCEL_ENV` yourself; Vercel supplies it. Do not derive
`NEXT_PUBLIC_APP_URL` from the per-deployment `VERCEL_URL`. OAuth, cookies,
Stripe returns, and webhooks use the explicit stable Preview or Production
origin.

不要手动创建 `VERCEL_ENV`，它由 Vercel 提供。不要用每次变化的 `VERCEL_URL` 派生
`NEXT_PUBLIC_APP_URL`；OAuth、cookie、Stripe return 和 webhook 必须使用明确稳定的
Preview 或 Production origin。

After changing environment variables, create a new deployment. Existing
deployments do not automatically receive new values.

修改环境变量后必须重新部署；已有部署不会自动获得新值。

Vercel Sensitive variables are write-only, so a local command cannot download
and certify their remote values. If an operator has loaded an exact worksheet
into a trusted shell, validate that shell before entering the values:

Vercel Sensitive 变量为 write-only，因此本地命令无法下载并认证其远程值。如果操作
人员已把精确 worksheet 加载到可信 shell，可在录入 Vercel 前验证：

```powershell
npm run check:vercel:preview
npm run check:vercel:production
```

These commands inspect only the current shell. The authoritative validator
runs in `next.config.ts` during every Vercel remote source build, where
Sensitive values are available. It checks exact HTTPS origins, distinct
public/service keys within a scope, Google administrator email, Stripe
mode/key/webhook consistency, 32-byte Base64 Server Action keys, timezone,
currency, and deliverable hosts.

这些命令只检查当前 shell。权威验证由每个 Vercel remote source build 中的
`next.config.ts` 执行，此时可以访问 Sensitive 值。它会检查精确 HTTPS origin、同一
scope 中不同的 public/service key、Google 管理员邮箱、Stripe mode/key/webhook
一致性、32-byte Base64 Server Action key、时区、货币和交付 host。

Because Vercel intentionally cannot reveal Sensitive values after creation,
cross-scope secret equality cannot be audited locally. Before every release,
manually compare the Dashboard scopes and the provider resource identifiers;
record that Preview and Production use different origins, Supabase projects,
Stripe Sandboxes/endpoints, and Server Action keys.

由于 Vercel 创建 Sensitive 值后不会再显示它们，本地无法比较跨 scope 的 secret
是否相同。每次发布前必须手动比较 Dashboard scope 和服务商 resource identifier，
并记录 Preview 与 Production 使用不同 origin、Supabase project、Stripe
Sandbox/endpoint 和 Server Action key。

### Vercel request boundaries / Vercel 请求边界

- Server Actions remain limited to 1 MB.
- Server Actions 保持 1 MB 限制。
- Images use `/api/uploads`, not a Server Action, and are limited to 4 MiB
  plus bounded multipart overhead.
- 图片通过 `/api/uploads` 而不是 Server Action，文件限制为 4 MiB，并加受控
  multipart overhead。
- `/api/*` is excluded from Next.js Proxy. Protected API routes authenticate
  independently, avoiding Vercel Routing Middleware's 4 MB body limit.
- `/api/*` 排除在 Next.js Proxy 外；受保护 API Route 自行认证，以避免 Vercel
  Routing Middleware 的 4 MB body limit。
- The upload route remains below Vercel Function's 4.5 MB request limit.
- 上传 Route 保持低于 Vercel Function 4.5 MB request limit。
- Stripe webhooks also bypass Proxy and preserve the raw signed body.
- Stripe webhook 同样绕过 Proxy，并保留原始签名 body。

Select and add the stable Preview alias before building. Set its exact HTTPS
origin as `NEXT_PUBLIC_APP_URL`; the Vercel environment validator rejects a
missing or temporary value. Do not use an immutable deployment URL for OAuth
configuration.

构建前先选择并添加稳定 Preview alias，并把其精确 HTTPS origin 设置为
`NEXT_PUBLIC_APP_URL`；Vercel 环境验证器会拒绝缺失或临时值。OAuth 配置不得使用
每次变化的 immutable deployment URL。

---

## 14. Create the first manual preview / 创建首次手动预览

The bootstrap and validated Preview were already created in §8.6. Re-run this
procedure only when the stable Preview alias, OAuth settings, Stripe test
endpoint, or Preview environment variables change.

bootstrap 与验证后的 Preview 已在 §8.6 创建。只有稳定 Preview alias、OAuth、
Stripe 测试 endpoint 或 Preview 环境变量变化时，才重新执行本节。

Before assigning an owned alias such as `preview.example.com`, add it to the
Vercel project, add the required DNS record at the registrar, and wait for TLS
validation:

绑定 `preview.example.com` 等自有 alias 前，先在 Vercel 项目添加该域名，在注册商处
添加所需 DNS 记录，并等待 TLS 验证：

```powershell
& $Vercel domains add <STABLE_PREVIEW_ALIAS>
& $Vercel alias set <PREVIEW_DEPLOYMENT_URL> <STABLE_PREVIEW_ALIAS>
```

`STABLE_PREVIEW_ALIAS` should be an owned hostname such as
`preview.example.com`, not the immutable deployment URL.

`STABLE_PREVIEW_ALIAS` 应为自有稳定主机名，例如 `preview.example.com`，而不是
不可变部署 URL。

The stable Preview domain must be publicly reachable for browser OAuth and
Stripe webhooks. In Vercel Deployment Protection, add a domain exception or
disable protection for this alias. Application authentication still protects
private routes. A Stripe query-string bypass does not solve browser OAuth and
must never be added to the OAuth callback.

稳定 Preview 域名必须允许浏览器 OAuth 与 Stripe webhook 公开访问。应在 Vercel
Deployment Protection 中为该 alias 添加 domain exception，或关闭其 protection。
应用认证仍保护私有路由。Stripe query-string bypass 无法解决浏览器 OAuth，且绝不能
加入 OAuth callback。

Set `NEXT_PUBLIC_APP_URL` in Vercel Preview to that stable alias. Add the exact
origin and `/auth/callback` URL to the Preview Google client and Preview
Supabase URL configuration. Create a Stripe test webhook at:

把 Vercel Preview 的 `NEXT_PUBLIC_APP_URL` 更新为该稳定 alias；将 origin 和
`/auth/callback` 添加到 Preview Google 客户端及 Preview Supabase URL 配置；创建
Stripe 测试 webhook：

```text
https://YOUR_PREVIEW_DOMAIN/api/webhooks/stripe
```

Set that test endpoint's `whsec_...` only in Vercel Preview, then validate,
build, deploy, and point the stable alias at the new immutable deployment:

仅在 Vercel Preview 设置该测试 endpoint 的 `whsec_...`，然后再次部署并重新绑定
稳定 alias：

```powershell
npm run vercel:deploy:preview
& $Vercel alias set <PREVIEW_DEPLOYMENT_URL> <STABLE_PREVIEW_ALIAS>
```

Confirm the Preview uses only non-production Supabase and Stripe test mode.

确认 Preview 只使用非生产 Supabase 和 Stripe 测试模式。

Preview checks / 预览检查：

- [ ] `/api/health` returns `status: ok` without secrets.
- [ ] `/api/health` 返回 `status: ok` 且不包含密钥。
- [ ] Public pages and portfolio detail routes render.
- [ ] 公共页面和作品详情页面正常。
- [ ] Sign-in uses the non-production project.
- [ ] 登录连接非生产项目。
- [ ] Private routes are `noindex`.
- [ ] 私有路由为 `noindex`。
- [ ] Stripe key is test mode.
- [ ] Stripe 密钥为测试模式。
- [ ] Email is disabled or limited to a controlled test recipient.
- [ ] 邮件关闭或仅发送到受控测试收件人。

---

## 15. Add and verify the production domain / 添加并验证生产域名

1. English: Purchase or select the owned domain.
   中文：购买或选择自有域名。
2. English: Add the domain in Vercel Project Settings.
   中文：在 Vercel Project Settings 中添加域名。
3. English: Add the DNS records shown by Vercel at the registrar.
   中文：在域名注册商处添加 Vercel 提供的 DNS 记录。
4. English: Wait for DNS and HTTPS certificate validation.
   中文：等待 DNS 和 HTTPS 证书验证。
5. English: Verify both apex and `www` behavior; choose one canonical origin.
   中文：检查根域名与 `www`，并确定唯一 canonical origin。
6. English: Redirect the non-canonical host to the canonical host.
   中文：将非 canonical 主机重定向到 canonical 主机。

Update `NEXT_PUBLIC_APP_URL` to the exact canonical HTTPS origin without a
trailing slash.

把 `NEXT_PUBLIC_APP_URL` 更新为精确的 HTTPS canonical origin，末尾不要 `/`。

---

## 16. Configure Google OAuth for production / 配置生产 Google OAuth

### Google Cloud / Google Cloud 设置

1. Create a dedicated production Google Cloud project.
2. 创建独立的生产 Google Cloud 项目。
3. Configure Google Auth branding with application name, domain, homepage,
   privacy policy, and terms.
4. 配置应用名称、域名、主页、隐私政策和条款。
5. Request only `openid`, `email`, and `profile`.
6. 只申请 `openid`、`email` 和 `profile`。
7. Create a Web OAuth client.
8. 创建 Web OAuth 客户端。
9. Add the production authorized JavaScript origin:
10. 添加生产 Authorized JavaScript origin：

```text
https://YOUR_DOMAIN
```

11. Add the Supabase authorized redirect URI:
12. 添加 Supabase Authorized redirect URI：

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

### Supabase Auth / Supabase Auth 设置

1. Open Authentication > Providers > Google.
2. 打开 Authentication > Providers > Google。
3. Enable Google.
4. 启用 Google。
5. Enter the production Google client ID and secret.
6. 输入生产 Google client ID 和 secret。
7. Disable Email/password, Phone, Anonymous, manual identity linking, and
   every non-Google provider.
8. 关闭 Email/password、Phone、Anonymous、manual identity linking 和所有非
   Google provider。
9. The database requires both an OAuth authentication-method claim in the
   current JWT and a confirmed linked Google identity.
10. 数据库同时要求当前 JWT 包含 OAuth authentication-method claim，并且账户已关联
    且确认 Google identity。
11. Set Site URL:
12. 设置 Site URL：

```text
https://YOUR_DOMAIN
```

13. Add the production redirect URL only:
14. 仅添加生产回调 URL：

```text
https://YOUR_DOMAIN/auth/callback
```

Local and preview redirects belong to the separate testing Google/Supabase
projects configured in §8. Do not add them to production.

本地和 Preview 回调属于 §8 中配置的独立测试 Google/Supabase 项目，不要加入生产
项目。

Set the OAuth audience to the intended external production audience, add test
users while the consent screen is in testing, verify the owned domain, and
publish/move the consent screen to production only after Google requirements
are satisfied.

将 OAuth audience 设置为计划使用的外部生产用户；在 consent screen 处于测试状态时
添加测试用户；验证自有域名；只有满足 Google 要求后才发布或切换到生产状态。

### OAuth verification after §29 / §29 提升后的 OAuth 验证

Configure OAuth now, but execute these checks only after the first production
candidate is promoted to the final production domain in §29. The unpromoted
candidate cannot retain a final-domain OAuth session.

本节先完成配置；以下验证必须在 §29 将候选版本提升到最终生产域名后执行。未提升的
候选版本无法保留最终域名的 OAuth session。

- [ ] Normal Google account returns to `/app` as customer.
- [ ] 普通 Google 账户登录后进入 `/app`，角色为客户。
- [ ] Safe `/app/**` deep link survives sign-in.
- [ ] 安全的 `/app/**` 深链接在登录后保持。
- [ ] Safe `/admin/**` deep link survives for admin.
- [ ] 管理员的 `/admin/**` 深链接保持。
- [ ] External and protocol-relative `next` values are rejected.
- [ ] 外部和协议相对 `next` 值被拒绝。
- [ ] OAuth tokens do not appear in logs.
- [ ] OAuth token 不出现在日志中。
- [ ] Email/password sign-in is rejected; retain the §8.2 pgTAP `014`
      evidence that a password-AMR JWT from a linked Google account cannot use
      application RLS/RPCs.
- [ ] Email/password 登录被拒绝；保留 §8.2 pgTAP `014` 证据，证明已关联 Google
      的账户若使用 password-AMR JWT，也无法调用应用 RLS/RPC。

---

## 17. Synchronize and verify the administrator / 同步并验证管理员

For a brand-new production project, run this synchronization immediately after
the first administrator Google sign-in on the final domain in §29. For an
existing project whose administrator identity already exists, synchronization
may run before deployment, but browser verification still waits for the final
domain in §29.

全新生产项目应在 §29 最终域名首次管理员 Google 登录后立即执行同步。已有管理员
identity 的项目可以在部署前同步，但浏览器验证仍必须等待 §29 最终域名。

Use a trusted workstation. Set production Supabase values only in the process
environment, not in a committed file.

使用可信工作站，只在进程环境中设置生产 Supabase 值，不要提交到文件。

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$env:ADMIN_GOOGLE_EMAIL = "owner@your-domain.example"
$secureRoleKey = Read-Host "Production Supabase service-role key" -AsSecureString
$roleKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureRoleKey)
try {
  $env:SUPABASE_SERVICE_ROLE_KEY =
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($roleKeyPointer)
  npm run admin:sync
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($roleKeyPointer)
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}
```

For every project, execute these browser checks only on the final domain in
§29. A new project runs them immediately after its first sign-in and
synchronization:

所有项目都只能在 §29 最终域名执行这些浏览器检查。全新项目应在首次登录和同步后立即
执行：

- [ ] Sign in with the exact confirmed Google email.
- [ ] 使用完全匹配且已验证的 Google 邮箱登录。
- [ ] Confirm `/admin` is accessible.
- [ ] 确认可以访问 `/admin`。
- [ ] Confirm a normal user cannot access `/admin`.
- [ ] 确认普通用户无法访问 `/admin`。
- [ ] Change/remove the allowlist in a test and prove stale profile role does
      not grant access.
- [ ] 在测试中移除 allowlist，并确认旧 profile role 无法继续授权。

Clear remaining operator variables afterward:

完成后清除敏感 shell 变量：

```powershell
Remove-Item Env:ADMIN_GOOGLE_EMAIL
Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL
```

There is no public administrator registration and no “first user becomes
admin” behavior.

系统没有公开管理员注册，也不存在“第一个用户自动成为管理员”的逻辑。

---

## 18. Configure Stripe test and live webhooks / 配置 Stripe 测试与生产 Webhook

### Preview test endpoint first / 先配置 Preview 测试端点

Create:

创建：

```text
https://YOUR_PREVIEW_DOMAIN/api/webhooks/stripe
```

Subscribe to exactly these handled events:

只订阅以下已处理事件：

```text
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
payment_intent.processing
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
refund.created
refund.updated
refund.failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
```

Set this endpoint's test values in Vercel Preview only:

在 Vercel Preview 设置测试值：

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Test:

测试：

- [ ] Customer cannot change amount, currency, owner, or commission.
- [ ] 客户无法修改金额、货币、所有者或佣金 ID。
- [ ] Checkout returns to `/app/commissions/[id]?payment=processing`.
- [ ] Checkout 成功返回 `?payment=processing`。
- [ ] Cancellation returns `?payment=cancelled`.
- [ ] 取消返回 `?payment=cancelled`。
- [ ] Return page does not mark payment successful.
- [ ] 返回页面不会直接把付款标记为成功。
- [ ] Verified webhook advances payment.
- [ ] 验证通过的 webhook 才推进付款状态。
- [ ] Duplicate webhook is idempotent.
- [ ] 重复 webhook 幂等。
- [ ] Expired/failed Checkout can start a new attempt.
- [ ] 过期或失败 Checkout 可以重新付款。
- [ ] Active Checkout resumes instead of creating a duplicate.
- [ ] 活跃 Checkout 会恢复，而不是重复创建。
- [ ] `requires_action` refund blocks deliverable access.
- [ ] `requires_action` 退款会阻止交付访问。
- [ ] Dispute blocks delivery.
- [ ] 争议会阻止交付。
- [ ] Late successful payment after cancellation is recorded and disputed.
- [ ] 取消后的迟到成功付款会被记录并进入争议状态。

### Live mode / Live 模式

1. Complete Stripe business verification.
2. 完成 Stripe 商户认证。
3. Create a separate live webhook endpoint.
4. 创建独立的 live webhook endpoint。
5. Subscribe to the same 17 events.
6. 订阅同样的 17 个事件。
7. Set `sk_live_...` and the live `whsec_...` only in Vercel Production.
8. 仅在 Vercel Production 设置 `sk_live_...` 和 live `whsec_...`。
9. Keep automated refunds disabled.
10. 保持自动退款功能关闭。

All test-mode payment flows must pass on the stable Preview before the
production candidate is built. Configure the Production environment with the
approved live Stripe key and live webhook secret before §20; do not switch
Stripe credentials by redeploying after candidate sign-off.

所有 Stripe 测试模式流程必须先在稳定 Preview 通过。§20 前，应在 Production 环境中
配置已批准的 live Stripe key 和 live webhook secret；候选版本签字后禁止通过再次部署
切换 Stripe 密钥。

### Approved live reconciliation smoke / 获批的 Live 对账测试

Only the merchant owner may approve a real live-mode smoke payment. If
approved and permitted by Stripe/account policy:

只有商户所有者可以批准真实 live 模式付款测试。如 Stripe 和账户政策允许且已批准：

1. Create a clearly named internal smoke commission at the minimum practical
   amount within the application's supported range.
2. 创建名称明确的内部 smoke commission，金额使用允许范围内的最小合理值。
3. Pay with an authorized real payment method; do not use Stripe test cards in
   live mode.
4. 使用获批真实付款方式；live 模式禁止使用 Stripe 测试卡。
5. Confirm Stripe amount/currency, database payment ledger, commission status,
   and webhook event IDs agree.
6. 对比 Stripe 金额/货币、数据库付款账本、佣金状态和 webhook event ID。
7. If the owner approves a refund, initiate it manually in Stripe, observe the
   verified refund webhook, and reconcile the database cumulative refund.
8. 如所有者批准退款，在 Stripe 手工发起退款，观察验证过的 refund webhook，并核对
   数据库累计退款。
9. Preserve financial, webhook, commission, and audit records. Mark the
   internal smoke record clearly; do not delete or rewrite it.
10. 保留付款、webhook、佣金和审计记录。明确标记内部测试记录，不得删除或重写。

Real transaction and refund fees may be non-refundable. If the owner does not
approve a live charge, document that the first real customer transaction will
receive active monitoring and reconciliation.

真实交易与退款费用可能不退。如所有者不批准 live 测试扣款，应记录：首笔真实客户
交易必须由负责人实时监控并完成对账。

Stripe Checkout is one-time payment only. Deposits are disabled and constrained
to zero. Current accepted amounts must be between 1 and 99,999,999 minor units.

Stripe Checkout 仅处理一次性付款。定金功能已关闭并强制为 0。当前接受金额必须在
1 到 99,999,999 最小货币单位之间。

---

## 19. Configure optional Resend email / 配置可选 Resend 邮件

Resend can remain disabled. In-app state remains authoritative.

Resend 可以保持关闭；应用内状态始终是权威来源。

Current Free limits should be rechecked. At the last review, Free included
3,000 emails/month and 100/day. Three hundred customers can exceed 100/day.

上线前必须重新确认免费额度。最后核对时免费方案为每月 3,000 封、每天 100 封；
300 名客户可能超过每日额度。

### Setup / 设置步骤

1. Add the sending domain in Resend.
2. 在 Resend 添加发信域名。
3. Add SPF, DKIM, and DMARC DNS records.
4. 添加 SPF、DKIM 和 DMARC DNS 记录。
5. Wait for domain verification.
6. 等待域名验证。
7. Create a restricted API key.
8. 创建受限 API key。
9. Configure:
10. 设置：

```dotenv
RESEND_API_KEY=re_...
EMAIL_FROM=Veyra Atelier <projects@YOUR_DOMAIN>
ADMIN_NOTIFICATION_EMAIL=owner@YOUR_DOMAIN
```

11. Send only to controlled recipients first.
12. 首先只发送到受控测试收件人。

Email must not contain message bodies, private images, signed URLs, or final
deliverable links.

邮件中禁止包含消息正文、私有图片、签名 URL 或最终交付链接。

If disabled:

如果关闭：

```dotenv
RESEND_API_KEY=
```

When Resend is disabled, omit `EMAIL_FROM` and
`ADMIN_NOTIFICATION_EMAIL` from Vercel or leave them unset; they are required
only when a Resend key is configured.

Resend 关闭时，在 Vercel 中省略或不设置 `EMAIL_FROM` 和
`ADMIN_NOTIFICATION_EMAIL`；只有配置 Resend key 时才需要它们。

The application records an explicit disabled result rather than pretending
email was sent.

应用会明确记录“邮件已关闭”，不会伪装成发送成功。

---

## 20. Create an unpromoted production candidate / 创建未提升的生产候选部署

Run the release gate again immediately before deployment:

部署前再次执行：

```powershell
npm ci
npm run verify
npm run test:e2e
npm audit --audit-level=high
npm run check:public-dependencies
```

Freeze source and migration changes now. Verify the exact release revision
again:

现在冻结源代码和迁移变更，并再次确认精确发布版本：

```powershell
git status --porcelain
git rev-parse HEAD
```

The working tree must be clean and the SHA must match §2.0 and the manual
GitHub verification run.

工作树必须干净，SHA 必须与 §2.0 以及手动 GitHub 验证完全一致。

Confirm production migrations and the post-migration baseline backup. Create a
production-environment candidate **without assigning the production domain**:

确认生产迁移和迁移后基线备份，然后创建一个**不绑定生产域名**的生产环境候选部署：

Before running the command, review the signed pre-entry worksheet from §13.
In the Dashboard, compare the visible scopes, origins, Supabase project URLs,
and Stripe endpoint/account identifiers. Confirm the hidden Sensitive entries
are present in only their intended scope; do not claim to reveal or compare
their stored values.

执行命令前复核 §13 的录入前签字 worksheet。在 Dashboard 中比较可见 scope、origin、
Supabase project URL 和 Stripe endpoint/account identifier；确认隐藏的 Sensitive
entry 只存在于预期 scope，不要声称能重新显示或比较其存储值。

```powershell
npm run vercel:deploy:candidate
```

The wrapper executes `vercel deploy --prod --skip-domain`; Vercel builds the
uploaded source with its write-only Sensitive values. If the
native CLI no longer accepts that option, the command fails rather than
silently assigning the Production domain.

wrapper 执行 `vercel deploy --prod --skip-domain`；Vercel 使用 write-only
Sensitive 值远程构建源码。如果 native CLI 不再接受该参数，命令会失败，而不是静默
绑定 Production 域名。

Copy the exact URL printed by the deploy command, then inspect it:

复制 deploy 输出中的精确 URL，然后检查：

```powershell
$candidateUrl = "https://EXACT-CANDIDATE.vercel.app"
npm run vercel:inspect -- $candidateUrl
```

Record:

记录：

- [ ] Git commit / Git 提交
- [ ] Vercel deployment ID and URL / Vercel 部署 ID 与 URL
- [ ] Supabase migration IDs / Supabase 迁移 ID
- [ ] Stripe webhook endpoint version/time / Stripe webhook 端点时间
- [ ] Environment-variable change owner / 环境变量变更负责人
- [ ] Backup location / 备份位置
- [ ] Candidate URL / 候选 URL

The build must not:

构建过程不得：

- Connect to local Docker / 连接本地 Docker
- Apply migrations / 应用迁移
- Insert seed customer/payment data / 插入示例客户或付款数据
- Create real charges / 发起真实扣款
- Send email / 发送邮件
- Expose secrets / 暴露密钥

Do not run `vercel promote` yet. The main production domain remains on the
previous known-good deployment or remains unassigned for the first release.

此时不要执行 `vercel promote`。生产主域名继续指向上一正常版本；首次发布时则保持未绑定。

---

## 21. Candidate smoke test and final-smoke preparation / 候选冒烟测试与最终冒烟准备

Use controlled production test accounts and non-sensitive test content. Do not
delete payment, webhook, commission, acceptance, delivery, aftercare, or audit
records. Clearly label smoke records and anonymize/close only through the
documented retention process.

使用受控生产测试账户和非敏感测试内容。禁止删除付款、webhook、佣金、接受、交付、
售后或审计记录；应清楚标记 smoke 数据，并且只能通过正式保留流程匿名化或关闭。

Run public pages, `/api/health`, build/runtime configuration, Supabase
connectivity, private-route `noindex`, and log-redaction checks against
`$candidateUrl`. OAuth callbacks, production-domain deep links, the live Stripe
endpoint, and final domain behavior are executed after promotion in §29. The
functional customer/commission/payment checklist should already have passed on
the stable Preview environment and is repeated against production in §29.

For a new project, do not alter OAuth origins to point at the immutable
candidate: the build intentionally uses the final production origin. The
Preview gate already verified the atomic administrator-sync workflow. The
production identity is created and synchronized immediately after promotion in
§29.

全新项目不要把 OAuth origin 改为不可变候选 URL；候选构建故意使用最终生产 origin。
Preview Gate 已验证原子管理员同步流程，生产 identity 在 §29 promote 后立即创建并同步。

在 `$candidateUrl` 上检查公共页面、`/api/health`、构建/运行配置、Supabase 连接、私有
路由 `noindex` 和日志脱敏。OAuth 回调、生产域名深链接、live Stripe endpoint 和最终
域名行为必须在 §29 promote 后执行。完整客户/佣金/付款清单应先在稳定 Preview 环境
通过，并在 §29 对生产重复。

### Public site / 公共网站

- [ ] Home, portfolio, detail, process, about, FAQ, contact, and legal pages
      return 200.
- [ ] 首页、作品集、详情、流程、关于、FAQ、联系和法律页面返回 200。
- [ ] Canonical metadata, Open Graph, sitemap, and robots are correct.
- [ ] Canonical、Open Graph、sitemap 和 robots 正确。
- [ ] Published portfolio media loads through the controlled endpoint.
- [ ] 已发布作品图片通过受控端点加载。
- [ ] Draft and archived media cannot be opened anonymously.
- [ ] 草稿和归档媒体不能匿名访问。
- [ ] Mobile navigation and keyboard focus work.
- [ ] 移动端导航和键盘焦点正常。

### Authentication / 认证

- [ ] Normal Google user is customer.
- [ ] 普通 Google 用户为客户。
- [ ] Configured email is admin.
- [ ] 配置邮箱为管理员。
- [ ] Safe deep link returns to the exact `/app/**` or `/admin/**` route.
- [ ] 安全深链接返回精确私有路由。
- [ ] Customer cannot access admin pages.
- [ ] 客户无法访问管理员页面。

### Customer isolation / 客户隔离

- [ ] Create Customer A and Customer B.
- [ ] 创建客户 A 和客户 B。
- [ ] Customer A cannot open B's request, conversation, attachment, quote,
      commission, payment, or deliverable URL.
- [ ] 客户 A 无法访问客户 B 的任何私有记录或文件。

### Request and messaging / 请求与聊天

- [ ] Customer creates more than one request.
- [ ] 客户可以创建多个请求。
- [ ] Valid JPEG/PNG/WebP upload is normalized and private.
- [ ] 有效图片被规范化并保持私有。
- [ ] Invalid type and oversized upload fail clearly.
- [ ] 非法类型和超大文件明确失败。
- [ ] Text-only and attachment-only messages work.
- [ ] 纯文本和纯附件消息均正常。
- [ ] Retry does not duplicate message or attachment.
- [ ] 重试不会重复消息或附件。
- [ ] New customer message moves that conversation to the top of admin inbox.
- [ ] 新客户消息使会话移动到管理员列表顶部。
- [ ] Unread badge, preview, sender, and relative time update.
- [ ] 未读标记、预览、发送者和相对时间更新。
- [ ] Closed and archived conversations can be marked read but cannot send.
- [ ] 关闭或归档会话可标记已读但不能发送。

### Quote and commission / 报价与佣金

- [ ] Admin sends multiple zero-deposit quote options.
- [ ] 管理员发送多个零定金报价。
- [ ] Customer submits a counteroffer.
- [ ] 客户提交还价。
- [ ] Accepted counteroffer takes precedence over original options.
- [ ] 已接受还价优先于原始选项。
- [ ] Declining one quote leaves inquiry open for revision.
- [ ] 拒绝单个报价不会关闭整个询价。
- [ ] Exactly one quote/counteroffer can be accepted.
- [ ] 只能接受一个报价或还价。
- [ ] Accepted terms are immutable.
- [ ] 已接受条款不可变。
- [ ] Admin confirms and sets ETA.
- [ ] 管理员确认并设置预计完成时间。
- [ ] Draft publication atomically publishes parent/revision and enters review.
- [ ] 草稿发布原子地更新父记录、版本和审核状态。
- [ ] Obsolete draft cannot be approved.
- [ ] 旧草稿不能被批准。
- [ ] Revision allowance and override rules work.
- [ ] 修改次数和管理员豁免规则正常。

### Payment and delivery / 付款与交付

- [ ] Browser cannot change trusted price.
- [ ] 浏览器无法修改可信价格。
- [ ] Checkout retry/resume works.
- [ ] Checkout 重试与恢复正常。
- [ ] Success return shows processing until webhook.
- [ ] 成功返回在 webhook 前只显示处理中。
- [ ] Duplicate/out-of-order webhooks are harmless.
- [ ] 重复和乱序 webhook 不造成错误。
- [ ] Deliverable is denied before payment.
- [ ] 付款前无法访问交付文件。
- [ ] Deliverable is denied during refund `requires_action` or dispute.
- [ ] 退款需操作或争议期间无法访问交付。
- [ ] First valid access records `paid -> delivered`.
- [ ] 首次有效访问记录 `paid -> delivered`。

### Aftercare and history / 售后与历史

- [ ] Customer can open aftercare from delivered state.
- [ ] 客户可从 delivered 状态开启售后。
- [ ] Customer completes cases through the case RPC.
- [ ] 客户通过 case RPC 完成售后。
- [ ] Full history paginates beyond 200 records without truncation.
- [ ] 历史记录超过 200 条仍可完整分页。

### Privacy and logs / 隐私与日志

- [ ] Logs contain no tokens, message bodies, image bytes, signed URLs, or raw
      deliverable URLs.
- [ ] 日志不包含 token、消息正文、图片、签名 URL 或原始交付链接。
- [ ] Private routes are absent from sitemap and marked `noindex`.
- [ ] 私有路由不在 sitemap 中并设置 `noindex`。

**GO/NO-GO 4:** Do not announce launch until every required smoke test passes.

**上线/停止 Gate 4：** 所有必需冒烟测试通过之前，不得宣布上线。

---

## 22. Validate approximately 300 simultaneous customers / 验证约 300 名同时在线客户

### HTTP preview load / HTTP 预览压测

Run only against an approved preview or staging deployment:

仅对获批的预览或测试环境执行：

```powershell
$env:LOAD_TEST_URL = "https://YOUR_PREVIEW_DOMAIN"
$env:LOAD_TEST_CONCURRENCY = "300"
$env:LOAD_TEST_REQUESTS_PER_CLIENT = "3"
$env:LOAD_TEST_TIMEOUT_MS = "30000"
try {
  npm run load:http
  if ($LASTEXITCODE -ne 0) {
    throw "HTTP load test failed."
  }
}
finally {
  Remove-Item Env:LOAD_TEST_URL -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_CONCURRENCY -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_REQUESTS_PER_CLIENT -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_TIMEOUT_MS -ErrorAction SilentlyContinue
}
```

Required / 要求：

- [ ] Zero failed requests / 0 个失败请求
- [ ] Record requests/second / 记录每秒请求数
- [ ] Record p50, p95, and p99 / 记录 p50、p95、p99
- [ ] Review Vercel function errors and throttling / 检查 Vercel 错误和限流
- [ ] Public/health smoke target p95 is at most 3 seconds and p99 at most
      5 seconds, unless the owner approves a documented alternative.
- [ ] 公共页面和 health 压测目标为 p95 不超过 3 秒、p99 不超过 5 秒；如需调整，
      必须由业务所有者书面批准。

Local baseline on 2026-09-17:

2026-09-17 本地生产构建基线：

- 300 concurrent clients / 300 个并发客户端
- 900 requests / 900 个请求
- 0 failures / 0 失败
- About 220 requests/second / 约 220 请求/秒
- p95 about 2.0 seconds / p95 约 2.0 秒

This local result is not a production SLA.

该本地结果不是生产 SLA。

### Realtime connection test / Realtime 连接测试

Use a dedicated non-production Supabase project capable of more than 300
connections:

使用可支持 300 以上连接的独立非生产 Supabase 项目：

Create a temporary test user:

创建临时测试用户：

1. Open the non-production Supabase Dashboard.
2. 打开非生产 Supabase Dashboard。
3. Go to Authentication > Users > Add user.
4. 进入 Authentication > Users > Add user。
5. Temporarily enable Email/password **only in this disposable capacity
   project**.
6. 仅在这个可丢弃容量测试项目中临时启用 Email/password。
7. Create a fictional email/password user with confirmed email.
8. 创建虚构邮箱/密码用户，并标记邮箱已确认。
9. Exchange that password for a short-lived access token:
10. 用该密码换取短期 access token：

```powershell
$capacityPassword = Read-Host "Temporary capacity-user password" -AsSecureString
$capacityPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($capacityPassword)
try {
  $capacityPasswordText =
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($capacityPointer)
  $tokenBody = @{
    email = "capacity-user@example.test"
    password = $capacityPasswordText
  } | ConvertTo-Json
  $tokenResponse = Invoke-RestMethod `
    -Method Post `
    -Uri "https://YOUR-STAGING-PROJECT.supabase.co/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = "<staging-anon-key>" } `
    -ContentType "application/json" `
    -Body $tokenBody
  $env:LOAD_TEST_ACCESS_TOKEN = $tokenResponse.access_token
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($capacityPointer)
  $capacityPasswordText = $null
  $tokenBody = $null
}
```

Do not print or save the token. Keep it only in the current shell until the
connection test finishes.

不要打印或保存 token；只在当前 shell 中保留到连接测试结束。

```powershell
$env:LOAD_TEST_CONFIRM_NON_PRODUCTION = "I_UNDERSTAND"
$env:LOAD_TEST_EXPECTED_PROJECT_REF = "stagingprojectref"
$env:LOAD_TEST_PRODUCTION_PROJECT_REF = "productionprojectref"
$env:LOAD_TEST_SUPABASE_URL = "https://stagingprojectref.supabase.co"
$env:LOAD_TEST_SUPABASE_ANON_KEY = "<staging-anon-key>"
$env:LOAD_TEST_CONNECTIONS = "300"
$env:LOAD_TEST_HOLD_SECONDS = "30"
try {
  npm run load:realtime
  if ($LASTEXITCODE -ne 0) {
    throw "Realtime load test failed."
  }
}
finally {
  Remove-Item Env:LOAD_TEST_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_EXPECTED_PROJECT_REF -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_PRODUCTION_PROJECT_REF -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_CONFIRM_NON_PRODUCTION -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_CONNECTIONS -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_TEST_HOLD_SECONDS -ErrorAction SilentlyContinue
  $tokenResponse = $null
}
```

This built-in script uses public Postgres Changes channels and intentionally
uses one short-lived non-production user to validate the project connection
ceiling, join rate, and cleanup of 300 simultaneous WebSockets. It does
**not** prove 300-user RLS isolation or message throughput. RLS isolation is
validated by pgTAP and the two-account production smoke. For an authenticated
message-load claim, provision an approved pool of fictional users in a
dedicated environment and exercise the actual request/message APIs with a
provider-approved load harness; record that harness and result in the release
evidence.

内置脚本使用 public Postgres Changes channels，并故意使用一个短期非生产用户来
验证项目能否建立并清理 300 个同时 WebSocket 连接，以及 join 速率。它**不能**证明
300 个不同用户的 RLS 隔离或消息吞吐。RLS 隔离由 pgTAP 和双账户生产冒烟测试验证。
如需宣称 300 用户消息负载能力，必须在专用环境准备获批的虚构用户池，并使用经服务商
批准的压测工具调用真实请求/消息 API；把工具和结果记录为发布证据。

After the command exits—whether it passed or failed—confirm the variables were
cleared, delete the temporary user, and disable Email/password again in the
capacity project:

命令结束后，无论成功或失败，都应确认变量已清除，并在 Supabase Authentication 中
删除临时用户，然后在容量项目中再次关闭 Email/password：

```powershell
Get-ChildItem Env:LOAD_TEST_*
```

The final command must return no variables.

最后一条命令不得返回任何变量。

Never use a production token or real customer account.

禁止使用生产 token 或真实客户账户。

Verify / 验证：

- [ ] At least 300 connections subscribe successfully.
- [ ] 至少 300 个连接订阅成功。
- [ ] No one-channel-per-customer design exists.
- [ ] 不存在每客户一个 channel 的设计。
- [ ] Sustained connection warning is configured at 400.
- [ ] 持续连接数达到 400 时触发预警。

The following are **separate external authenticated-workload gates**, not
claims made by the built-in one-user connection script:

以下是**独立外部认证负载 Gate**，不能由内置单用户连接脚本证明：

- [ ] One admin inbox subscription receives new durable activity.
- [ ] 一个管理员收件箱订阅接收到新的持久化活动。
- [ ] New messages reorder the list after database persistence.
- [ ] 消息持久化后列表重新排序。
- [ ] A controlled reconnect storm remains below 500 joins/second.
- [ ] 受控重连高峰低于每秒 500 次 join。
- [ ] p95 durable message persistence is at most 2 seconds.
- [ ] 消息持久化 p95 不超过 2 秒。
- [ ] p95 authoritative inbox reorder is at most 3 seconds.
- [ ] 管理员列表权威重排 p95 不超过 3 秒。

If sustained usage approaches 400, investigate extra tabs and subscription
lifetime before the 500-connection limit.

持续接近 400 时，应先检查多标签页和订阅生命周期，再触及 500 连接上限。

**GO/NO-GO 5:** The 300-connection Realtime test must pass before claiming
300-user production capacity.

**上线/停止 Gate 5：** 只有通过 300 个 Realtime 连接测试后，才能宣称支持 300 名
同时在线用户。

---

## 23. Hold the candidate and complete operations readiness / 保持候选版本并完成运维准备

Do not promote or announce launch. Preserve `$candidateUrl` and continue in
order through:

不要 promote，也不要宣布上线。保存 `$candidateUrl`，并按顺序继续：

1. §24 monitoring and tested alerts / §24 监控和告警测试
2. §25 backup, rollback, and restore drill / §25 备份、回滚和恢复演练
3. §26 maintenance ownership / §26 维护负责人
4. §27 troubleshooting readiness / §27 故障排查准备
5. §28 final release sign-off / §28 最终上线签字
6. §29 promotion, full production smoke, and announcement /
   §29 提升、完整生产冒烟和公告

---

## 24. Monitoring and alerts / 监控与告警

Configure and test alerts before §29 promotion. Provider interfaces and available thresholds can
change; record the exact configured rule and test result in the release
worksheet.

必须在 §29 promote 前配置并测试告警。服务界面和可用阈值可能变化；在发布工作表记录实际规则和
测试结果。

### Alert setup procedure / 告警配置步骤

1. English: In Vercel, enable deployment-failure notifications, function 5xx
   monitoring, latency monitoring, and spend notifications available to the
   selected plan.
   中文：在 Vercel 启用当前方案支持的部署失败、Function 5xx、延迟和费用通知。
2. English: In Supabase organization/project settings, enable usage and billing
   notifications. Set or externally monitor an 80% Realtime threshold, which
   is 400 of 500 Pro connections.
   中文：在 Supabase 组织和项目设置启用用量与费用通知；配置或外部监控 80%
   Realtime 阈值，即 Pro 的 500 个连接中的 400 个。
3. English: In Stripe, enable failed-webhook notifications and assign an owner
   to the production endpoint.
   中文：在 Stripe 启用 webhook 失败通知，并为生产 endpoint 指定负责人。
4. English: If Resend is enabled, configure bounce, complaint, and daily-volume
   review.
   中文：如启用 Resend，配置退信、投诉和每日发送量检查。
5. English: Send or simulate one safe test alert from every available provider
   and record the recipient, timestamp, and acknowledgement.
   中文：对每个可用服务发送或模拟一次安全测试告警，记录接收人、时间和确认结果。

If a selected plan does not support a custom alert, do not claim the alert is
active. Assign a named operator to watch the provider dashboard during launch,
or approve a separate monitoring service and its cost.

如果当前方案不支持自定义告警，不得声称告警已启用。应在上线期间指定人员监控
Dashboard，或另行批准监控服务及费用。

Recommended initial rules / 推荐初始规则：

| Signal / 信号                 | Location / 配置位置                              | Initial threshold / 初始阈值                          | Test / 测试                                                                 |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Public health                 | Approved uptime monitor or named launch operator | Two consecutive failures within 2 minutes             | Temporarily monitor an approved preview URL, then disable the preview       |
| Vercel 5xx                    | Vercel Observability/Logs or named operator      | More than 1% for 5 minutes                            | Verify one known preview failure appears in logs                            |
| Route p95                     | Vercel Observability                             | More than 3 seconds for 10 minutes                    | Compare with §22 HTTP result                                                |
| Supabase Realtime connections | Supabase Dashboard or approved external monitor  | 400 sustained for 5 minutes                           | Observe §22 connection test                                                 |
| Database connections/CPU      | Supabase Database Reports                        | 80% of plan capacity for 10 minutes                   | Record baseline during §22                                                  |
| Stripe webhook failures       | Stripe Webhook endpoint notifications            | Any production delivery exhausted or repeated failure | Use Stripe test-mode resend on Preview; verify owner notification           |
| Payment processing age        | Application operations review                    | `processing` longer than 15 minutes                   | Create a controlled test-mode delayed event in Preview                      |
| Resend bounce/complaint       | Resend Dashboard, if enabled                     | Bounce above 4% or complaint above 0.08%              | Verify dashboard and owner access; do not intentionally generate complaints |
| Spend                         | Vercel and Supabase billing settings             | 80% of approved monthly budget                        | Send provider-supported test notification or capture configuration evidence |

| 信号                   | 配置位置                                 | 初始阈值                       | 测试方法                                        |
| ---------------------- | ---------------------------------------- | ------------------------------ | ----------------------------------------------- |
| 公共 health            | 获批 uptime 监控或指定上线值守人员       | 2 分钟内连续失败 2 次          | 先监控获批 Preview URL，测试后关闭 Preview 监控 |
| Vercel 5xx             | Vercel Observability/Logs 或指定值守人员 | 5 分钟内超过 1%                | 确认一次已知 Preview 失败出现在日志             |
| 路由 p95               | Vercel Observability                     | 连续 10 分钟超过 3 秒          | 与 §22 HTTP 结果对比                            |
| Supabase Realtime 连接 | Supabase Dashboard 或获批外部监控        | 连续 5 分钟达到 400            | 观察 §22 连接测试                               |
| 数据库连接/CPU         | Supabase Database Reports                | 连续 10 分钟达到方案容量 80%   | 在 §22 记录基线                                 |
| Stripe webhook 失败    | Stripe endpoint 通知                     | 任一生产事件耗尽重试或重复失败 | 在 Preview 用测试模式重发并验证负责人收到通知   |
| 付款 processing 时长   | 应用运维检查                             | 超过 15 分钟                   | 在 Preview 创建受控延迟事件                     |
| Resend 退信/投诉       | Resend Dashboard（如启用）               | 退信超过 4% 或投诉超过 0.08%   | 验证 Dashboard 和负责人权限；不要故意产生投诉   |
| 费用                   | Vercel 与 Supabase 计费设置              | 达到批准月预算 80%             | 发送服务支持的测试通知或保存配置证据            |

中文说明：

- Public health：2 分钟内连续失败 2 次即告警。
- Vercel 5xx：5 分钟内超过 1% 即告警。
- 路由延迟：p95 连续 10 分钟超过 3 秒即告警。
- Supabase Realtime：连接数连续 5 分钟达到 400 即告警。
- 数据库资源：连接或 CPU 连续 10 分钟达到方案容量 80% 即告警。
- Stripe：生产 webhook 重复失败或耗尽重试即告警。
- 付款状态：`processing` 超过 15 分钟即人工调查。
- Resend：退信超过 4% 或投诉超过 0.08% 即调查。
- 费用：达到批准月度预算 80% 时提醒。

Adjust thresholds only with an owner-approved reason recorded in the release
worksheet.

只有在发布工作表中记录业务所有者批准的理由后，才能调整阈值。

### Vercel

- Function error rate / Function 错误率
- p95 route latency / 路由 p95 延迟
- Function invocation and transfer usage / Function 调用和流量
- Deployment failures / 部署失败
- Spend notifications / 费用提醒

### Supabase

- Realtime connections; warn at 400 / Realtime 连接数，400 时预警
- Realtime messages and joins per second / 每秒消息与 join
- Database CPU, memory, connections, locks, and slow queries /
  数据库 CPU、内存、连接、锁和慢查询
- Database and storage size / 数据库和存储大小
- Egress / 出站流量
- Auth failures / 登录失败
- Backup success / 备份成功状态

### Stripe

- Webhook delivery failures and retries / Webhook 失败与重试
- Payments stuck in pending or processing / 长时间 pending/processing 的付款
- Multiple attempts or duplicate success / 多次尝试或重复成功
- Refunds in `requires_action` / `requires_action` 退款
- Open disputes / 未解决争议
- Reconciliation between Stripe and database / Stripe 与数据库对账

### Resend

- Daily and monthly volume / 每日和每月发送量
- Bounce rate / 退信率
- Complaint rate / 投诉率
- Failed delivery attempts / 发送失败
- Domain verification / 域名验证状态

### Application

- Rate-limit RPC failures / 限流 RPC 失败
- Upload rejection and cleanup failures / 上传拒绝与清理失败
- Realtime reconnect frequency / Realtime 重连频率
- Admin inbox refresh errors / 管理员收件箱刷新错误
- Deliverable denial anomalies / 交付访问拒绝异常
- Audit-log anomalies / 审计日志异常

Define who receives each alert and the escalation path.

必须明确每类告警的接收人和升级路径。

---

## 25. Backup, rollback, and disaster recovery / 备份、回滚与灾难恢复

### Before every release / 每次发布前

- [ ] Verify Supabase automated backup status.
- [ ] 检查 Supabase 自动备份。
- [ ] Create a manual dump for high-risk migrations.
- [ ] 高风险迁移前创建手动导出。
- [ ] Record deployment and migration IDs.
- [ ] 记录部署和迁移 ID。
- [ ] Test restore periodically in a separate project.
- [ ] 定期在独立项目中测试恢复。

### Backup cadence tied to RPO / 与 RPO 绑定的备份频率

- Database: rely on the selected Supabase managed backup schedule and verify it
  daily. If the approved RPO is shorter than that schedule, purchase/configure
  PITR or another approved database backup method.
- 数据库：使用所选 Supabase 自动备份计划并每日检查。如批准的 RPO 小于该备份周期，
  必须购买/配置 PITR 或其他获批备份方案。
- Storage objects: run the §10 object copy at least nightly for a 24-hour RPO,
  and before every release that changes storage metadata or policy. Use a more
  frequent approved job if the RPO is shorter.
- Storage 对象：若 RPO 为 24 小时，至少每晚执行一次 §10 对象复制；每次修改存储
  元数据或策略的发布前也必须执行。更短 RPO 需要更频繁的获批任务。
- Retain immutable encrypted copies according to the approved retention policy
  and test one restore each quarter.
- 根据批准的保留政策保存不可变加密副本，并每季度至少测试一次恢复。

### Application rollback / 应用回滚

1. Identify the last known-good Vercel deployment.
2. 找到最近的正常 Vercel 部署。
3. Confirm it is compatible with the current database schema.
4. 确认它与当前数据库 schema 兼容。
5. Promote/redeploy the known-good deployment.
6. 提升或重新部署该版本。
7. Repeat authentication, messaging, payment, and delivery smoke tests.
8. 重新执行认证、聊天、付款和交付测试。

Executable Vercel CLI sequence / 可执行 Vercel CLI 流程：

```powershell
& $Vercel list
& $Vercel inspect <LAST_KNOWN_GOOD_DEPLOYMENT_URL>
& $Vercel rollback <LAST_KNOWN_GOOD_DEPLOYMENT_URL>
```

If `rollback` is unavailable for the account/plan, use:

如果账户或方案不支持 `rollback`，使用：

```powershell
& $Vercel promote <LAST_KNOWN_GOOD_DEPLOYMENT_URL>
```

Do not automatically reverse database migrations when rolling back code.

应用回滚时不要自动反向执行数据库迁移。

### Database incident / 数据库故障

1. Stop or restrict writes if integrity is at risk.
2. 如果数据完整性有风险，停止或限制写入。
3. Preserve database, application, and provider logs.
4. 保留数据库、应用和服务日志。
5. Take a fresh backup if safe.
6. 在安全情况下创建最新备份。
7. Determine partial migration effects.
8. 判断迁移已执行的部分。
9. Prefer a reviewed forward corrective migration.
10. 优先使用经过审核的前向修复迁移。
11. Test repair or restore in a separate project.
12. 在独立项目测试修复或恢复。
13. Validate RLS, record counts, money totals, payment reconciliation,
    commission history, and storage references.
14. 验证 RLS、记录数量、金额、付款对账、佣金历史和存储引用。
15. Switch traffic only after smoke tests pass.
16. 仅在冒烟测试通过后切换流量。

Never:

禁止：

- Run production reset / 重置生产数据库
- Delete migration history / 删除迁移历史
- Guess reverse SQL / 猜测性执行反向 SQL
- Restore over the only copy before validation / 未验证就覆盖唯一数据副本

### Restore drill in a separate project / 在独立项目执行恢复演练

A raw `supabase db dump` is supplemental evidence, not a complete Supabase restore artifact: managed `auth`, `storage`, and migration-history objects require provider-aware recovery. For the paid Production Track, use Supabase managed Backups or PITR according to the current Dashboard procedure. Do not import the full raw data dump over a migrated project.

原始 `supabase db dump` 只是辅助证据，不是完整 Supabase 恢复文件；托管的 `auth`、`storage` 和迁移历史需要服务感知的恢复。付费 Production Track 必须按照当前 Supabase Dashboard 流程使用托管 Backup 或 PITR，禁止把完整 raw data dump 覆盖导入已迁移项目。

1. Create or select an isolated restore target according to the current Supabase backup-restore workflow.
2. 按当前 Supabase 备份恢复流程创建或选择隔离恢复目标。
3. Restore the selected managed backup/PITR point through Supabase Dashboard or provider support. Record the backup ID and recovery timestamp.
4. 通过 Supabase Dashboard 或服务支持恢复所选 Backup/PITR 时间点，记录备份 ID 和恢复时间。
5. Link the CLI to the restored target and verify migration state:
6. 把 CLI 关联到恢复目标并验证迁移状态：

   ```powershell
   npx supabase link --project-ref YOUR_RESTORE_PROJECT_REF
   if ($LASTEXITCODE -ne 0) { throw "Restore-project link failed." }
   npx supabase migration list --linked
   if ($LASTEXITCODE -ne 0) { throw "Migration verification failed." }
   ```

7. Compare the restored migration history with the recorded production migration IDs. Apply only reviewed forward migrations that are newer than the restored backup; never replay all migrations blindly.
8. 将恢复后的迁移历史与记录的生产迁移 ID 对比；只应用备份时间点之后、已审核的前向迁移，禁止盲目重放全部迁移。
9. Retrieve and decrypt the three Storage backup directories and `sha256.csv` from the approved vault.
10. 从获批备份库取回并解密三个 Storage 目录和 `sha256.csv`。
11. Restore object bytes with the experimental Storage CLI and fail on every native command:
12. 使用实验性 Storage CLI 恢复对象，每条原生命令失败都必须中止：

```powershell
function Invoke-RestoreChecked {
  param(
    [Parameter(Mandatory)] [scriptblock] $Command,
    [Parameter(Mandatory)] [string] $Step
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

Invoke-RestoreChecked {
  npx supabase --experimental storage cp --linked --recursive `
    <STORAGE_BACKUP_PATH>\commission-private `
    ss://
} "Commission Storage restore"
Invoke-RestoreChecked {
  npx supabase --experimental storage cp --linked --recursive `
    <STORAGE_BACKUP_PATH>\portfolio-public `
    ss://
} "Portfolio Storage restore"
Invoke-RestoreChecked {
  npx supabase --experimental storage cp --linked --recursive `
    <STORAGE_BACKUP_PATH>\deliverables-private `
    ss://
} "Deliverables Storage restore"
```

13. Re-download each restored bucket into a clean temporary directory, generate `{ RelativePath, SHA256 }` rows, and compare them with the stored manifest using `Compare-Object`. Any difference fails the drill.
14. 把每个恢复后的 bucket 重新下载到干净临时目录，生成 `{ RelativePath, SHA256 }`，并用 `Compare-Object` 与清单比较；任何差异都判定失败。

```powershell
$verifyRoot = Join-Path $env:TEMP "veyra-restore-verify"
Remove-Item $verifyRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $verifyRoot | Out-Null
Invoke-RestoreChecked {
  npx supabase --experimental storage cp --linked --recursive `
    ss:///commission-private `
    $verifyRoot
} "Commission Storage re-download"
Invoke-RestoreChecked {
  npx supabase --experimental storage cp --linked --recursive `
    ss:///portfolio-public `
    $verifyRoot
} "Portfolio Storage re-download"
Invoke-RestoreChecked {
  npx supabase --experimental storage cp --linked --recursive `
    ss:///deliverables-private `
    $verifyRoot
} "Deliverables Storage re-download"
$verifyRootResolved = (Resolve-Path $verifyRoot).Path
$actualManifest = Get-ChildItem $verifyRoot -Recurse -File |
  ForEach-Object {
    [pscustomobject]@{
      RelativePath = [IO.Path]::GetRelativePath(
        $verifyRootResolved,
        $_.FullName
      ).Replace("\", "/")
      SHA256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    }
  }
$expectedManifest = Import-Csv <STORAGE_BACKUP_PATH>\sha256.csv
$differences = Compare-Object `
  -ReferenceObject $expectedManifest `
  -DifferenceObject $actualManifest `
  -Property RelativePath,SHA256
if ($differences) {
  $differences | Format-Table
  throw "Restored Storage objects do not match the backup manifest."
}
Remove-Item $verifyRoot -Recurse -Force
```

15. Run pgTAP against the isolated restored target only after reviewing that the tests are non-destructive for that target:
16. 审核测试对该目标无破坏性后，才对隔离恢复目标执行 pgTAP：

```powershell
npx supabase test db --linked supabase/tests/database
if ($LASTEXITCODE -ne 0) { throw "Restore-project pgTAP failed." }
```

17. Validate Google identities, administrator singleton, customer isolation, accepted totals, payment/refund/dispute ledgers, commission histories, attachment references, bucket privacy, object counts, and relative hashes.
18. 验证 Google identity、单一管理员、客户隔离、已接受金额、付款/退款/争议账本、佣金历史、附件引用、bucket 隐私、对象数量和相对哈希。
19. Only after every check passes, mark the restore drill complete and remove the isolated target according to provider policy.
20. 所有检查通过后，才可标记恢复演练完成，并按服务政策删除隔离目标。

If the selected Supabase plan or current provider workflow cannot restore a managed backup to an isolated target, the restore drill is blocked. Upgrade/contact provider support before collecting data whose RPO/RTO depends on that recovery path.

如果当前 Supabase 方案或服务流程不能把托管备份恢复到隔离目标，则恢复演练为阻塞状态。收集依赖该 RPO/RTO 的数据前，应升级方案或联系服务支持。

### Credential incident / 密钥泄露

1. Revoke and rotate the affected credential.
2. 撤销并轮换泄露密钥。
3. Update Vercel environment variables.
4. 更新 Vercel 环境变量。
5. Redeploy.
6. 重新部署。
7. Review logs and audit records for misuse.
8. 检查日志和审计记录。
9. Invalidate sessions if the affected key can compromise sessions.
10. 如可能影响会话，撤销相关会话。

Rotate at the owning provider first:

必须先在密钥所属服务中轮换：

| Credential / 密钥            | Rotate at / 轮换位置      | Then update / 然后更新                                     |
| ---------------------------- | ------------------------- | ---------------------------------------------------------- |
| Supabase service/anon key    | Supabase Dashboard        | Vercel Preview/Production and trusted operator environment |
| Supabase database password   | Supabase Dashboard        | Approved migration/backup clients only                     |
| Google client secret         | Google Cloud              | Matching Supabase Auth provider                            |
| Stripe secret key            | Stripe Dashboard          | Matching Vercel environment                                |
| Stripe webhook secret        | Stripe endpoint           | Matching Vercel environment                                |
| Resend API key               | Resend Dashboard          | Matching Vercel environment                                |
| Vercel token                 | Vercel account/team       | Local secret store or GitHub only if explicitly used       |
| Registrar/DNS credential     | Domain registrar          | Operator password manager                                  |
| Server Action encryption key | Operator password manager | Coordinated Vercel Preview/Production deployment           |

Not every credential belongs in Vercel. Update only the environments that use
the rotated value, then redeploy and test.

并非所有密钥都存放在 Vercel。只更新实际使用该值的环境，然后重新部署和测试。

Use an overlap-and-revoke sequence where the provider supports two active
credentials:

服务支持双密钥时，使用重叠轮换流程：

1. Create the new credential without revoking the old one.
2. 创建新密钥，暂不撤销旧密钥。
3. Update and test Preview.
4. 更新并测试 Preview。
5. Update Production and redeploy.
6. 更新 Production 并重新部署。
7. Run the affected smoke test and inspect logs.
8. 执行相关冒烟测试并检查日志。
9. Revoke the old credential.
10. 撤销旧密钥。
11. Record the rotation and next due date.
12. 记录轮换及下次时间。

For `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, there is no provider overlap.
Schedule a coordinated deployment, warn active users to refresh, update all
simultaneously active production instances, deploy, test form actions, and
retire old deployments.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` 不支持服务商双密钥。应安排协调部署，通知在线
用户刷新，同时更新所有活动生产实例，部署并测试表单操作，最后停用旧部署。

---

## 26. Routine maintenance / 日常维护

### Every month / 每月

```powershell
npm ci
npm audit --audit-level=high
npm run check:public-dependencies
npm run verify
```

- Review provider cost and quotas / 检查服务费用与额度
- Review Supabase backup success / 检查 Supabase 备份
- Review Stripe webhook health / 检查 Stripe webhook
- Review administrator allowlist / 检查管理员 allowlist
- Review failed uploads and email attempts / 检查上传和邮件失败
- Review dependency release notes before upgrades / 升级前检查依赖发布说明

### Every quarter / 每季度

- Restore a backup into a separate project / 在独立项目恢复备份
- Exercise provider outage behavior / 演练服务故障
- Exercise duplicate/out-of-order webhooks / 演练重复与乱序 webhook
- Rerun 300-client HTTP and Realtime tests / 重新执行 300 并发测试
- Review retention and deletion operations / 检查数据保留和删除流程
- Review RPO/RTO with the business owner / 与业务所有者复核 RPO/RTO

---

## 27. Troubleshooting table / 故障排查表

| Symptom / 现象                                     | Checks / 检查项                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in disabled / 登录关闭                        | Verify public Supabase URL/key; restart deployment / 检查 Supabase URL/key 并重新部署                                                 |
| OAuth redirect error / OAuth 重定向错误            | Compare Google callback, Supabase Site URL, Redirect URLs, and canonical domain / 对比 Google callback、Supabase URL 和域名           |
| Admin sees customer UI / 管理员进入客户界面        | Verify confirmed email, `ADMIN_GOOGLE_EMAIL`, rerun `admin:sync`, sign in again / 检查邮箱并重新同步                                  |
| Customer can see another record / 客户可见他人数据 | Stop launch, inspect RLS and relationship predicates, run pgTAP / 停止上线并检查 RLS                                                  |
| Message not live / 消息不实时                      | Confirm persistence first, Realtime publication, RLS, one shared client, reconnect logs / 检查持久化、publication、RLS 和重连         |
| Admin inbox not reordered / 管理员列表未置顶       | Confirm `send_message` updated activity, Realtime event arrived, ranked RPC refresh succeeded / 检查消息活动时间与 ranked RPC         |
| Image does not load locally / 本地图片不显示       | Verify development CSP, private bucket, signed endpoint, object metadata / 检查 CSP、私有桶、签名端点                                 |
| Draft cannot publish / 草稿无法发布                | Confirm working unpublished parent, latest revision, at least one asset, correct commission state / 检查父草稿、版本、附件和状态      |
| Checkout stays pending / Checkout 一直处理中       | Confirm webhook URL/secret, event delivery, database event receipt / 检查 webhook URL、密钥和事件记录                                 |
| Checkout cannot retry / Checkout 无法重试          | Check active session expiry, attempt generation, Stripe retrieval, settled-payment guard / 检查 session、attempt 和 settled 状态      |
| Deliverable remains locked / 交付一直锁定          | Confirm succeeded final payment, no blocking refund/dispute, released metadata, allowed commission state / 检查付款、退款、争议和状态 |
| Email not sent / 邮件未发送                        | Check whether Resend is disabled, domain verification, daily limit, delivery attempt / 检查是否关闭、域名和额度                       |
| Migration fails / 迁移失败                         | Stop deployment, preserve logs, inspect partial effects, create forward fix / 停止部署并创建前向修复                                  |
| Too many Realtime connections / Realtime 连接过多  | Check extra tabs, leaked subscriptions, reconnect storms, warning threshold / 检查多标签、订阅泄漏和重连                              |
| Unexpected bill / 费用异常                         | Review Vercel/Supabase usage, egress, storage, email, Stripe fees, alerts / 检查各服务用量和告警                                      |

---

## 28. Final release sign-off / 最终上线签字

### Engineering / 工程

- [ ] Public dependency verification passed / 公共依赖检查通过
- [ ] Formatting, lint, typecheck, tests, and build passed /
      格式、Lint、类型、测试和构建通过
- [ ] Executable pgTAP/RLS passed / 可执行 pgTAP/RLS 通过
- [ ] Preview smoke test passed / 预览冒烟测试通过
- [ ] 300-client HTTP test passed / 300 客户 HTTP 测试通过
- [ ] 300-connection Realtime test passed / 300 Realtime 连接测试通过

### Security / 安全

- [ ] No secrets in Git or logs / Git 和日志无密钥
- [ ] Customer isolation verified / 客户隔离已验证
- [ ] Existing project: production administrator allowlist verified /
      已有项目：生产管理员 allowlist 已验证
- [ ] New project: Preview atomic admin sync verified, and the production
      administrator account, service-role access, and §29 sync operator are
      ready / 全新项目：Preview 原子管理员同步已验证，生产管理员账户、service-role
      访问和 §29 同步负责人已准备
- [ ] Private buckets and signed endpoints verified / 私有桶和签名端点已验证
- [ ] Stripe signature and replay behavior verified / Stripe 签名和幂等已验证

### Business / 业务

- [ ] Costs approved / 费用已批准
- [ ] Domain approved / 域名已批准
- [ ] Currency and timezone approved / 货币与时区已批准
- [ ] Legal, privacy, cancellation, refund, and retention text approved /
      法律、隐私、取消、退款和保留政策已批准
- [ ] Administrator and escalation contacts confirmed /
      管理员和故障联系人已确认

### Operations / 运维

- [ ] Backup verified / 备份已验证
- [ ] Restore drill completed / 恢复演练完成
- [ ] Monitoring and alerts active / 监控与告警已启用
- [ ] Rollback owner assigned / 已指定回滚负责人
- [ ] Release identifiers recorded / 发布标识已记录

**Final GO:** Production launch is approved only when all required boxes are
checked by the named owners.

**最终上线：** 只有所有必需项目均由对应负责人确认后，才可正式上线。

---

## 29. Promote, run final production smoke, and announce / 提升、执行最终生产冒烟并公告

Confirm the exact candidate is still the signed-off deployment:

确认候选版本仍是已签字版本：

```powershell
git status --porcelain
git rev-parse HEAD
npm run vercel:inspect -- $candidateUrl
```

Promote it to the configured production domains:

把候选版本提升到生产域名：

```powershell
npm run vercel:promote -- $candidateUrl
```

Immediately execute every applicable item in §21 against
`https://YOUR_DOMAIN`, including:

立即在 `https://YOUR_DOMAIN` 执行 §21 中所有适用项目，包括：

- For a new project, sign in once with the administrator Google account,
  execute §17 `admin:sync`, sign out, and sign in again /
  全新项目先使用管理员 Google 账户登录一次，执行 §17 `admin:sync`，退出并重新登录
- Google customer and administrator sign-in / Google 客户与管理员登录
- Safe private deep links / 安全私有深链接
- Customer A/B isolation / 客户 A/B 隔离
- Messaging and admin inbox reorder / 消息和管理员列表置顶
- Quote, counteroffer, draft, and aftercare flows / 报价、还价、草稿和售后
- Stripe live reconciliation or documented first-transaction monitoring from
  §18 / §18 的 Stripe live 对账或已记录的首笔交易监控
- Deliverable gating / 交付锁定
- Log and privacy checks / 日志与隐私检查

If a critical test fails, stop announcements and immediately run:

任何关键测试失败时，停止公告并立即执行：

```powershell
npm run vercel:rollback -- https://LAST-KNOWN-GOOD.vercel.app
```

If the failed release was the first deployment and no prior production
deployment exists, remove the production alias from the candidate, keep the
site unavailable, and correct forward rather than exposing a known-bad release.

如失败的是首次发布且没有上一生产版本，应从候选版本移除生产 alias，保持网站不可用，
并进行前向修复，不要暴露已知错误版本。

After every final smoke check passes:

全部最终冒烟检查通过后：

1. Record the promoted deployment ID, commit SHA, migration IDs, backup IDs,
   alert-test evidence, capacity evidence, and smoke-test result.
2. 记录部署 ID、提交 SHA、迁移 ID、备份 ID、告警证据、容量证据和冒烟结果。
3. Confirm named responders are online for the launch window.
4. 确认发布窗口内负责人在线。
5. Announce launch.
6. 宣布上线。
7. Monitor Vercel, Supabase, Stripe, and application logs through the agreed
   launch window.
8. 在约定上线观察期内监控 Vercel、Supabase、Stripe 和应用日志。

---

## Related documentation / 相关文档

- `README.md` - Project entry point / 项目入口
- `docs/service-setup.md` - Cost and account setup / 费用与账户设置
- `docs/deployment.md` - Concise English deployment guide / 英文简版部署
- `docs/local-development.md` - Local development / 本地开发
- `docs/capacity.md` - 300-user capacity and inbox design / 300 用户容量与聊天列表
- `docs/security.md` - Security model / 安全模型
- `docs/database.md` - Database and RLS / 数据库与 RLS
- `docs/payments.md` - Stripe workflow / Stripe 流程
- `docs/operations.md` - Ongoing operations / 日常运维
- `docs/ci-cd-plan.md` - Manual Actions and future CI/CD / 手动 Actions 与未来 CI/CD

Official provider references / 官方服务商参考：

- Vercel CLI deployment:
  <https://vercel.com/docs/projects/deploy-from-cli>
- Vercel environment variables:
  <https://vercel.com/docs/environment-variables>
- Vercel Function limits:
  <https://vercel.com/docs/functions/limitations>
- Vercel Routing Middleware:
  <https://vercel.com/docs/routing-middleware>
- Vercel Hobby commercial-use boundary:
  <https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage>
- Supabase Google OAuth:
  <https://supabase.com/docs/guides/auth/social-login/auth-google>
- Supabase redirect URLs:
  <https://supabase.com/docs/guides/auth/redirect-urls>
- Stripe webhooks:
  <https://docs.stripe.com/webhooks>
