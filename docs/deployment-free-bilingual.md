# Vercel Hobby MVP Demo / Vercel Hobby 完全免费 MVP Demo

> **Purpose / 用途:** Personal, non-commercial, publicly reachable prototype /
> 个人、非商业、可公开访问的原型
>
> **Hosting / 托管:** Vercel Hobby
>
> **Backend / 后端:** Two Supabase Free projects
>
> **Payments / 支付:** Stripe Sandboxes only; no live charges
>
> **Email / 邮件:** Disabled by default
>
> **Last verified / 最后核对:** 2026-09-20

This track has no recurring hosting fee when every provider remains within its
free allowance. It is not a commercial production configuration and does not
claim support for 300 simultaneous Realtime customers.

只要所有服务都保持在免费额度内，本 Track 没有固定托管费用。它不是商业生产环境，
也不宣称支持 300 个同时在线的 Realtime 客户。

## 0. Mandatory legal and capacity boundary / 强制使用边界

Vercel Hobby permits personal, non-commercial use. Do not use this track to:

Vercel Hobby 仅允许个人、非商业使用。禁止将本 Track 用于：

- Accept live Stripe payments / 接收 Stripe 真实付款
- Advertise or operate a jewelry business / 宣传或运营珠宝业务
- Deliver paid client work / 交付付费客户项目
- Host work produced as paid employment or consulting / 托管付费雇佣或咨询成果

For any commercial use, switch to the Vercel Pro production runbook in
`docs/deployment-bilingual.md`.

任何商业用途都必须切换到 `docs/deployment-bilingual.md` 中的 Vercel Pro 生产流程。

Supabase Free currently allows fewer than the target 300 simultaneous
Realtime connections. Keep this demo to a controlled group, preferably 5–25
users, and treat all demo data as disposable.

Supabase Free 当前无法满足 300 个同时 Realtime 连接。Demo 应控制在小范围内，建议
5–25 人，并把所有数据视为可丢弃测试数据。

## 1. Accounts to create / 需要注册的账户

Create the following accounts with the future owner’s email where possible:

尽量使用未来所有者的邮箱注册以下账户：

1. GitHub account and public repository / GitHub 账户与公共仓库
2. Vercel personal account on Hobby / Vercel Hobby 个人账户
3. Supabase account with two Free projects / Supabase 账户与两个 Free 项目
4. Google Cloud account and one OAuth testing project / Google Cloud 与一个 OAuth 测试项目
5. Stripe account with two Sandboxes / Stripe 与两个 Sandbox

Resend is optional and should remain unconfigured for this free demo.

Resend 为可选项；免费 Demo 默认不配置。

Enable MFA on every provider account. Store recovery codes in the owner’s
password manager. Do not use an employer-owned account for a public handoff.

所有服务账户都应启用 MFA，并把恢复码保存在所有者的密码管理器中。公共项目交接不得
依赖雇主所有的账户。

## 2. Environment layout / 环境布局

Use one Vercel project with two Vercel environments:

使用一个 Vercel Project，并配置两个 Vercel 环境：

| Vercel environment | Supabase       | Stripe    | Application origin                      |
| ------------------ | -------------- | --------- | --------------------------------------- |
| Preview            | Free project A | Sandbox A | Stable public preview alias             |
| Production         | Free project B | Sandbox B | Stable `*.vercel.app` production domain |

Both environments use:

两个环境都使用：

```text
NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo
STRIPE_MODE=test
```

Never share Supabase service-role keys, Stripe keys, webhook secrets, or
Server Action encryption keys between Preview and Production.

Preview 与 Production 不得共用 Supabase service-role key、Stripe key、webhook
secret 或 Server Action encryption key。

## 3. Prepare and verify the repository / 准备并验证仓库

```powershell
npm ci
npm run vercel:doctor
npm run check:manual-workflows
npm run check:public-dependencies
npm audit --audit-level=high
npm run verify
npm run test:e2e
npm run demo:build
```

Expected results / 预期结果：

- The Vercel native CLI reports the pinned version / Vercel native CLI 显示锁定版本
- GitHub Actions remains `workflow_dispatch` only / GitHub Actions 仅手动触发
- All dependencies resolve from public npm / 所有依赖来自公共 npm
- `npm audit` reports zero high or critical findings / 无 high/critical 漏洞
- Unit, component, browser, type, lint, and build checks pass / 所有测试和构建通过

Review `.vercelignore`. It must exclude `.env*`, keys/certificates,
`node_modules`, build/test artifacts, `supabase`, and other non-runtime files
before any CLI source deployment.

任何 CLI source deployment 前都必须检查 `.vercelignore`；它应排除 `.env*`、
key/certificate、`node_modules`、构建/测试产物、`supabase` 和其他非运行时文件。

`vercel.json` sets `git.deploymentEnabled=false`, so connecting Git cannot
create deployments on commits. Deployment remains manual.

`vercel.json` 已设置 `git.deploymentEnabled=false`，即使连接 Git，commit 也不会
自动部署；发布始终为手动操作。

## 4. Create two Supabase Free projects / 创建两个 Supabase Free 项目

Create clearly named projects, for example:

创建名称清晰的两个项目，例如：

```text
veyra-preview-free
veyra-demo-free
```

For each project:

对每个项目：

1. Record the project reference and URL.
2. Record the browser-safe publishable/anonymous key.
3. Store the service-role/secret key in a password manager.
4. Keep the database password outside Git.
5. Apply the migrations from a trusted workstation.

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked
npx supabase migration list --linked
```

Run the database test suite only against an approved disposable test project:

数据库测试只能针对获批的可丢弃测试项目：

```powershell
npx supabase test db --linked supabase/tests/database
```

Do not run destructive pgTAP fixtures against the demo project after real
test users have begun using it.

真实测试用户开始使用 Demo 后，不得再对该项目运行破坏性 pgTAP fixtures。

## 5. Configure Google OAuth / 配置 Google OAuth

Create one Google Cloud project with the consent screen in **Testing** and add
only controlled test users.

创建一个 Google Cloud 项目，把 consent screen 保持为 **Testing**，并只加入受控
test users。

Create two Web OAuth clients, one per Supabase project. For each client, add
the corresponding Google-to-Supabase callback:

创建两个 Web OAuth client，每个 Supabase 项目一个，并加入对应回调：

```text
https://PREVIEW_PROJECT_REF.supabase.co/auth/v1/callback
https://DEMO_PROJECT_REF.supabase.co/auth/v1/callback
```

In each Supabase project:

在每个 Supabase 项目中：

1. Enable Google and enter that environment’s client ID and secret.
2. Disable Email/password, Phone, Anonymous, manual identity linking, and all
   non-Google providers.
3. Configure the Vercel application callback under Auth > URL Configuration.

Preview / Preview：

```text
Site URL: https://YOUR_STABLE_PREVIEW_HOST
Redirect URL: https://YOUR_STABLE_PREVIEW_HOST/auth/callback
```

Production demo / Production Demo：

```text
Site URL: https://YOUR_PROJECT.vercel.app
Redirect URL: https://YOUR_PROJECT.vercel.app/auth/callback
```

The browser first goes Google → Supabase, then Supabase →
`/auth/callback`. Do not place a Google client secret in Vercel; it belongs in
the Supabase Auth provider configuration.

浏览器流程为 Google → Supabase，然后 Supabase → `/auth/callback`。Google client
secret 不放入 Vercel，而应保存在 Supabase Auth provider 设置中。

## 6. Create two Stripe Sandboxes / 创建两个 Stripe Sandbox

Create:

创建：

```text
Veyra Preview Sandbox
Veyra Demo Sandbox
```

Record each Sandbox secret key. Do not use any `sk_live_...` value.

记录两个 Sandbox 的 secret key；不得使用 `sk_live_...`。

Webhook endpoints are created after the Vercel URLs exist:

Vercel URL 确定后再创建 webhook：

```text
https://YOUR_STABLE_PREVIEW_HOST/api/webhooks/stripe
https://YOUR_PROJECT.vercel.app/api/webhooks/stripe
```

Each endpoint has its own `whsec_...` secret. Never reuse the Preview secret in
Production or the Production secret in Preview.

每个 endpoint 都有独立 `whsec_...`；不得跨环境复用。

Subscribe to exactly the events listed in `docs/payments.md`.

只订阅 `docs/payments.md` 列出的事件。

## 7. Create and link the Vercel project / 创建并关联 Vercel 项目

The repository uses the official code-signed native Vercel CLI pinned in the
lockfile. The standard Node-based Vercel CLI is intentionally absent because
the reviewed version contained high/critical advisories.

仓库锁定了官方签名的 native Vercel CLI。标准 Node 版 Vercel CLI 的已审核版本包含
high/critical 漏洞，因此不进入本应用依赖。

```powershell
npm run vercel:doctor
npm run vercel:login
npm run vercel:link
```

Choose:

选择：

- Personal Hobby scope / 个人 Hobby scope
- Create a new project / 创建新 Project
- Framework: Next.js / 框架：Next.js
- Repository root: current directory / 根目录：当前目录

Do not add a deploy hook. Git deployment is disabled by `vercel.json`.

不要创建 Deploy Hook。`vercel.json` 已关闭 Git 自动部署。

In Project Settings, keep the repository build settings:

在 Project Settings 保持仓库定义的构建设置：

```text
Install Command: npm ci
Build Command: npm run build:vercel
```

Enable **Automatically expose System Environment Variables**. The build
requires Vercel's `VERCEL_ENV`; if the setting is disabled, deployment fails
closed.

启用 **Automatically expose System Environment Variables**。构建必须读取 Vercel
提供的 `VERCEL_ENV`；关闭该设置会使 deployment 主动失败。

## 8. Choose stable origins / 选择稳定地址

The application deliberately uses explicit stable origins rather than
ephemeral deployment URLs.

应用必须使用明确、稳定的 origin，而不是每次变化的临时 deployment URL。

Production uses the project’s stable free hostname:

Production 使用项目的稳定免费域名：

```text
https://YOUR_PROJECT.vercel.app
```

For Preview, add a separate stable domain or available `vercel.app` alias in
Vercel Project > Settings > Domains, for example:

Preview 应在 Vercel Project > Settings > Domains 添加独立稳定域名或可用的
`vercel.app` alias，例如：

```text
https://YOUR_PROJECT-preview.vercel.app
```

Preview OAuth and Stripe webhooks require a public stable address. Disable
Deployment Protection for that Preview alias or add a domain exception.
Application authentication still protects private pages. Do not put a Vercel
protection-bypass secret in a browser OAuth URL.

Preview OAuth 与 Stripe webhook 需要公开稳定地址。应为该 Preview alias 关闭
Deployment Protection 或添加 domain exception。应用自身认证仍保护私有页面。不得把
Vercel protection-bypass secret 放入浏览器 OAuth URL。

## 9. Configure Vercel environment variables / 配置 Vercel 环境变量

Open Vercel Project > Settings > Environment Variables.

打开 Vercel Project > Settings > Environment Variables。

Create every variable separately for **Preview** and **Production**:

为 **Preview** 与 **Production** 分别创建所有变量：

Before entering anything, prepare a private two-column worksheet and compare
the values side by side. Record the Supabase project refs and Stripe Sandbox
names. Confirm every secret and Server Action key was generated or copied
independently. After validation, enter server secrets with Vercel's
**Sensitive** option and delete the temporary worksheet according to the
owner's credential policy.

录入前先在私密位置准备 Preview/Production 双栏 worksheet 并逐项比较，记录
Supabase project ref 与 Stripe Sandbox 名称，确认每个 secret 和 Server Action key
都独立生成或复制。验证后使用 Vercel **Sensitive** 类型录入服务端密钥，并按所有者的
凭据政策删除临时 worksheet。

| Variable                             | Preview                      | Production demo                    |
| ------------------------------------ | ---------------------------- | ---------------------------------- |
| `NEXT_PUBLIC_APP_URL`                | Stable Preview origin        | Stable project `vercel.app` origin |
| `NEXT_PUBLIC_DEPLOYMENT_TRACK`       | `free-demo`                  | `free-demo`                        |
| `VEYRA_VERCEL_ENV`                   | `preview`                    | `production`                       |
| `NEXT_PUBLIC_SUPABASE_URL`           | Supabase project A           | Supabase project B                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Project A public key         | Project B public key               |
| `SUPABASE_SERVICE_ROLE_KEY`          | Project A secret             | Project B secret                   |
| `ADMIN_GOOGLE_EMAIL`                 | Controlled test Google email | Controlled test Google email       |
| `STRIPE_MODE`                        | `test`                       | `test`                             |
| `STRIPE_SECRET_KEY`                  | Sandbox A `sk_test_...`      | Sandbox B `sk_test_...`            |
| `STRIPE_WEBHOOK_SECRET`              | Preview endpoint `whsec_...` | Demo endpoint `whsec_...`          |
| `BUSINESS_TIMEZONE`                  | Valid IANA timezone          | Valid IANA timezone                |
| `DEFAULT_CURRENCY`                   | ISO code such as `USD`       | ISO code such as `USD`             |
| `DELIVERABLE_ALLOWED_HOSTS`          | Approved test hosts          | Approved test hosts                |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Preview-specific key         | Different Demo key                 |

Generate two different Server Action keys:

生成两个不同的 Server Action key：

```powershell
$previewKeyBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($previewKeyBytes)
[Convert]::ToBase64String($previewKeyBytes)

$demoKeyBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($demoKeyBytes)
[Convert]::ToBase64String($demoKeyBytes)
```

Each decoded key must be exactly 32 bytes. Never use a plain 32-character
password.

解码后必须恰好 32 bytes；不得使用普通 32 字符密码代替。

Leave `RESEND_API_KEY`, `EMAIL_FROM`, and `ADMIN_NOTIFICATION_EMAIL` unset to
disable email.

保持 `RESEND_API_KEY`、`EMAIL_FROM`、`ADMIN_NOTIFICATION_EMAIL` 未设置，以关闭
邮件。

Every environment-variable change requires a new deployment.

任何环境变量修改后都必须重新部署。

## 10. Validate environment variables / 验证环境变量

Vercel Sensitive variables are write-only. A local command cannot retrieve
and prove their remote values. Recheck the private pre-entry worksheet from
§9. In Vercel, compare only visible scopes, origins, Supabase project URLs,
and Stripe Sandbox/endpoint identifiers; confirm each hidden Sensitive entry
exists only in its intended scope.

Vercel Sensitive variables 为 write-only，本地命令无法下载并证明远程值。重新检查
§9 的私密录入前 worksheet；在 Vercel 中只比较可见 scope、origin、Supabase project
URL 和 Stripe Sandbox/endpoint identifier，并确认每个隐藏 Sensitive entry 只存在
于预期 scope。

- Application origins / 应用 origin
- Supabase projects, public keys, and service-role keys /
  Supabase project、公钥和 service-role key
- Stripe Sandboxes, secret keys, webhook endpoints, and webhook secrets /
  Stripe Sandbox、secret key、webhook endpoint 和 webhook secret
- Server Action encryption keys / Server Action encryption key

If you have loaded the exact worksheet values into a trusted local shell,
validate that shell before entering them in Vercel:

如果已把精确 worksheet 值加载到可信本地 shell，可在录入 Vercel 前验证：

```powershell
npm run check:vercel:preview
npm run check:vercel:production
```

These commands check only the current shell; they do not claim to read remote
Sensitive values. They check:

这些命令只检查当前 shell，不宣称读取远程 Sensitive 值。检查内容包括：

- Exact HTTPS application origin / 精确 HTTPS origin
- Explicit `VEYRA_VERCEL_ENV` target / 明确的 `VEYRA_VERCEL_ENV` target
- Distinct public and service-role Supabase keys / Supabase 公钥与 service key 不同
- Non-placeholder administrator email / 非占位管理员邮箱
- Test-only Stripe mode and matching key / Stripe test mode 与 key 匹配
- Webhook signing secret / webhook secret
- 32-byte Base64 Server Action key / 32-byte Base64 Server Action key
- Timezone, currency, and deliverable host allowlist / 时区、货币、交付 host

The authoritative validation runs automatically inside every remote Vercel
Preview and Production build through `next.config.ts`, where Sensitive values
are available. `build:vercel` also requires Vercel's system `VERCEL_ENV` and
rejects any disagreement with `VEYRA_VERCEL_ENV`. An invalid scope fails
before deployment completes.

每个 Vercel Preview/Production 远程 build 都会在能访问 Sensitive 值的环境中，通过
`next.config.ts` 执行权威验证；`build:vercel` 还要求 Vercel 系统 `VERCEL_ENV`，
并拒绝它与 `VEYRA_VERCEL_ENV` 不一致；配置无效时 deployment 会在完成前失败。

## 11. Build and deploy manually / 手动构建与部署

Vercel’s first deployment is a Production-environment deployment. Upload
source and let Vercel build it remotely so write-only Sensitive values are
available. Create it as an unpromoted candidate:

Vercel 的第一次部署属于 Production 环境。上传源码并由 Vercel 远程构建，使
write-only Sensitive 值可用；先创建不绑定域名的候选版本：

```powershell
npm run vercel:deploy:candidate
```

The wrapper runs `vercel deploy --prod --skip-domain`. The remote build runs
the environment validator and fails closed.

wrapper 执行 `vercel deploy --prod --skip-domain`；远程 build 会执行环境验证并在
失败时停止。

Copy the exact `https://...vercel.app` candidate URL from the output:

保存输出中的候选 URL：

```powershell
npm run vercel:inspect -- https://CANDIDATE.vercel.app
```

Keep the candidate unpromoted. Test its public pages, `/api/health`,
configuration, logs, and build resources, then create a Preview deployment:

保持 candidate 未提升。先测试其公共页面、`/api/health`、配置、日志和 build
resource，然后创建 Preview：

```powershell
npm run vercel:deploy:preview
```

Assign the stable Preview alias through the Vercel Dashboard or the native CLI
and then repeat OAuth/webhook smoke tests.

通过 Vercel Dashboard 或 native CLI 把稳定 Preview alias 指向该 deployment，然后
重复 OAuth/webhook 冒烟测试。

Complete the full Preview gate, including Google OAuth, Stripe Sandbox
webhooks, Server Actions, and uploads. Only then promote the original
Production candidate:

完成完整 Preview Gate，包括 Google OAuth、Stripe Sandbox webhook、Server
Actions 和上传。全部通过后，才提升原 Production candidate：

```powershell
npm run vercel:promote -- https://CANDIDATE.vercel.app
```

After promotion, run Google OAuth and Stripe webhook smoke tests against the
stable Production demo domain before inviting users.

提升后，在邀请用户之前，对稳定 Production Demo 域名执行 Google OAuth 与 Stripe
webhook 冒烟测试。

## 12. File uploads and Proxy / 文件上传与 Proxy

Vercel limits:

Vercel 限制：

- Routing Middleware request body: 4 MB
- Function request/response body: 4.5 MB
- Server Actions body: 1 MB in this project

The Next.js Proxy matcher excludes `/api/*`. API routes perform their own
authentication and authorization, while this avoids applying the 4 MB
Middleware body limit before the upload Function.

Next.js Proxy matcher 排除 `/api/*`。API Route 自行执行认证与授权，同时避免上传在
到达 Function 前先触发 4 MB Middleware 限制。

Images remain limited to 4 MiB, plus bounded multipart overhead, and are sent
to `/api/uploads`, not through a Server Action. The route validates content,
normalizes with Sharp, and writes privately to Supabase through the
service-role client.

图片仍限制为 4 MiB，并加上受控 multipart overhead；上传到 `/api/uploads`，不经过
Server Action。Route 会检查真实内容、使用 Sharp 规范化，并通过 service-role 私密写入
Supabase。

Test:

测试：

- Valid JPEG/PNG/WebP just below 4 MiB / 接近 4 MiB 的合法图片
- File above 4 MiB returns 413 / 超过 4 MiB 返回 413
- Invalid MIME/content mismatch is rejected / MIME 与内容不匹配被拒绝
- Customer cannot upload to another customer / 客户不能上传到其他客户

## 13. Google sign-in smoke / Google 登录冒烟

On both stable domains:

在两个稳定域名：

1. Open an incognito browser.
2. Sign in with an allowed Google test user.
3. Confirm Google returns to Supabase.
4. Confirm Supabase returns to the exact `/auth/callback`.
5. Confirm the customer reaches `/app`.
6. Confirm an external `next` value is rejected.
7. Confirm password/phone/anonymous login remains disabled.

The administrator identity must sign in once before synchronization. Run the
command **twice**, once for each isolated Supabase project:

管理员 identity 必须先登录一次。以下命令必须执行**两次**，分别对应两个独立
Supabase project：

| Run | Stable domain used for first sign-in | Supabase values                          |
| --- | ------------------------------------ | ---------------------------------------- |
| 1   | Stable Preview domain                | Preview project URL and service-role key |
| 2   | Stable Production demo domain        | Demo project URL and service-role key    |

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<environment-service-role-key>"
$env:ADMIN_GOOGLE_EMAIL = "<controlled-google-email>"
npm run admin:sync
```

Clear the shell variables after each run. Sign out and sign in again on that
same stable domain. Confirm `/admin` works only for the configured account,
then repeat the entire procedure for the other environment.

每次执行后清除 shell 变量，在同一个稳定域名退出并重新登录，确认只有配置账户能访问
`/admin`，然后对另一个环境重复完整流程。

## 14. Stripe webhook smoke / Stripe webhook 冒烟

For each stable environment:

对每个稳定环境：

1. Create the HTTPS webhook endpoint in the matching Sandbox.
2. Copy that endpoint’s `whsec_...` to the matching Vercel environment.
3. Redeploy.
4. Send a Stripe test event.
5. Confirm Vercel Function logs show a successful request without payload or
   secret leakage.
6. Complete a test Checkout.
7. Confirm the browser return alone does not mark payment successful.
8. Confirm the signed webhook changes the durable payment state.
9. Resend the same event and confirm idempotency.

If Preview Deployment Protection is enabled, Stripe cannot reach the endpoint.
Make the stable Preview domain public. A query-string protection bypass may be
used for Stripe, but it does not solve browser OAuth access.

若 Preview Deployment Protection 开启，Stripe 无法访问 endpoint。应把稳定 Preview
域名设为公开。Stripe 可使用 query-string protection bypass，但它不能解决浏览器 OAuth
访问。

## 15. Final demo gate / 最终 Demo Gate

- [ ] Vercel Hobby use remains personal and non-commercial.
- [ ] Vercel Hobby 仍为个人非商业用途。
- [ ] Git automatic deployment is disabled.
- [ ] Git 自动部署已关闭。
- [ ] Preview and Production use different Supabase projects.
- [ ] Preview 与 Production 使用不同 Supabase 项目。
- [ ] Preview and Production use different Stripe Sandboxes and webhook secrets.
- [ ] Preview 与 Production 使用不同 Stripe Sandbox 与 webhook secret。
- [ ] Both remote builds pass the `next.config.ts` Vercel environment gate.
- [ ] 两个远程 build 都通过 `next.config.ts` Vercel 环境 Gate。
- [ ] Google OAuth works only for controlled test users.
- [ ] Google OAuth 仅允许受控 test users。
- [ ] Upload, chat, quote, draft, payment, delivery, and aftercare smoke tests pass.
- [ ] 上传、聊天、报价、草稿、付款、交付和售后冒烟通过。
- [ ] No live Stripe key exists in Vercel Hobby.
- [ ] Vercel Hobby 中不存在 Stripe live key。
- [ ] All demo data is disposable.
- [ ] 所有 Demo 数据可丢弃。

## 16. Rollback / 回滚

Before the first launch, a failed candidate remains unpromoted; no rollback is
needed. After at least one known-good Production deployment exists, identify
it in the Vercel Dashboard and run:

首次上线前，如果 candidate 失败，只需保持未提升，无需 rollback。至少存在一个正常
Production deployment 后，才在 Vercel Dashboard 找到它并执行：

```powershell
npm run vercel:rollback -- https://LAST-KNOWN-GOOD.vercel.app
```

If the first promoted release fails and no previous Production deployment
exists, remove the Production alias from the failed deployment, keep the demo
unavailable, and correct forward.

如果首次 promote 后失败且没有上一 Production deployment，应移除失败版本的
Production alias，暂时保持 Demo 不可用，并前向修复。

Rollback changes application code only. It does not reverse database
migrations. Database corrections must use a reviewed forward migration.

Rollback 只回滚应用代码，不回滚数据库 migration；数据库必须使用审核后的前向修复。

## 17. Upgrade trigger / 升级条件

Move to the Vercel Pro production track immediately if any of these becomes
true:

出现以下任何情况，应立即切换 Vercel Pro：

- The site advertises or operates a real business.
- 网站宣传或运营真实业务。
- Live Stripe payments are enabled.
- 启用 Stripe live payment。
- Paid client work is stored or delivered.
- 保存或交付付费客户内容。
- More than a small controlled test group uses the site.
- 用户超过受控小范围测试组。
- The business requires uptime, managed backups, or 300 concurrent Realtime users.
- 业务需要 uptime、托管备份或 300 Realtime 并发。

## Official references / 官方参考

- Vercel Hobby and commercial use:
  <https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage>
- Vercel CLI deployments:
  <https://vercel.com/docs/projects/deploy-from-cli>
- Vercel environment variables:
  <https://vercel.com/docs/environment-variables>
- Vercel Function limits:
  <https://vercel.com/docs/functions/limitations>
- Vercel Routing Middleware:
  <https://vercel.com/docs/routing-middleware>
- Supabase redirect URLs:
  <https://supabase.com/docs/guides/auth/redirect-urls>
- Stripe webhooks:
  <https://docs.stripe.com/webhooks>
