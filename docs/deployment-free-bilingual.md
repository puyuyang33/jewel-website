# Zero-Cost MVP Demo Deployment / 完全免费 MVP Demo 部署

> **Purpose / 用途:** A real, publicly reachable MVP demonstration with zero
> recurring hosting cost / 一个可公开访问、托管费用为 0 的 MVP 演示
>
> **Primary host / 主要托管:** Netlify Free
>
> **Backend / 后端:** Supabase Free
>
> **Default payment mode / 默认付款模式:** Stripe test mode
>
> **Email / 邮件:** Disabled / 关闭
>
> **Domain / 域名:** Free `*.netlify.app` hostname / 免费 `*.netlify.app` 地址
>
> **Last verified / 最后核对:** 2026-09-17

This is a prototype/demo track, not the recommended 300-concurrent-customer
production track. It preserves the same application, security model, database
schema, workflows, and visual design, but accepts free-tier availability and
quota limits.

这是原型/Demo Track，不是推荐的 300 并发客户生产方案。它保留相同代码、安全模型、
数据库 schema、业务流程和视觉设计，但接受免费额度的可用性和容量限制。

### Why Netlify Free / 为什么选择 Netlify Free

- Netlify officially supports App Router, SSR, React Server Components, Server
  Actions, Route Handlers, streaming, ISR, and Next.js image optimization.
- Netlify 官方支持 App Router、SSR、RSC、Server Actions、Route Handlers、
  Streaming、ISR 和 Next.js 图片优化。
- Its Functions use a normal Node/AWS-Lambda-compatible runtime where native
  `sharp` can run.
- Function 使用标准 Node/AWS Lambda 兼容运行时，可运行原生 `sharp`。
- The Free plan has a hard credit ceiling rather than paid overage.
- Free 方案使用 credits 硬上限，不会自动产生托管超额费用。
- No Vercel-Hobby-style noncommercial-only restriction was found in the
  reviewed Netlify Free documentation; current Self-Serve Agreement and AUP
  must still be accepted and rechecked before live commercial use.
- 已审核的 Netlify Free 文档中未发现类似 Vercel Hobby 的“仅限非商业”限制；真实商业
  使用前仍必须接受并重新检查最新 Self-Serve Agreement 与 AUP。

Rejected unchanged alternatives:

未选择的原样替代方案：

- Vercel Hobby: technically compatible but explicitly noncommercial.
- Vercel Hobby：技术兼容，但明确仅限非商业用途。
- Cloudflare Workers Free: 10 ms CPU/request and no supported native `sharp`
  path for this upload pipeline.
- Cloudflare Workers Free：每请求 10ms CPU，当前上传流程没有受支持的原生 `sharp`
  路径。
- Render Free: native Node-compatible fallback, but sleeps after 15 idle
  minutes, can take about one minute to wake, and is explicitly not for
  production.
- Render Free：可作为原生 Node 测试后备，但闲置 15 分钟后休眠，唤醒约一分钟，并
  明确不适用于生产。

---

## 0. What is and is not free / 哪些免费，哪些不免费

| Service / 服务                       | Free demo selection / 免费 Demo 选择                                              | Cost / 费用                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Netlify                              | Free, manual CLI deploys / Free，CLI 手动部署                                     | USD 0 until 300 monthly credits are exhausted / 300 月度 credits 内 0 美元               |
| Supabase                             | Two Free projects / 两个 Free 项目                                                | USD 0 within Free quotas / 免费额度内 0 美元                                             |
| Google OAuth                         | Testing consent screen and controlled test users / 测试 consent screen 与受控用户 | USD 0                                                                                    |
| Stripe                               | Test mode by default / 默认测试模式                                               | USD 0                                                                                    |
| Stripe live, optional / 可选真实付款 | Standard Checkout / 标准 Checkout                                                 | Transaction, refund-loss, and dispute-related fees only / 仅交易、退款损失和争议相关费用 |
| Resend                               | Disabled / 关闭                                                                   | USD 0                                                                                    |
| Domain                               | Netlify default hostname / Netlify 默认域名                                       | USD 0                                                                                    |
| GitHub Actions                       | Manual workflow only / 仅手动 workflow                                            | Subject to current GitHub Free terms / 以 GitHub 当前免费条款为准                        |

### Hard zero-cost controls / 零成本硬限制

- [ ] Stay on Netlify Free; do not add a paid credit pack.
- [ ] 保持 Netlify Free，不购买 credits。
- [ ] Do not add or enable auto recharge.
- [ ] 不添加或启用自动充值。
- [ ] Stay on Supabase Free; do not enable paid add-ons.
- [ ] 保持 Supabase Free，不启用付费附加项。
- [ ] Keep `RESEND_API_KEY` unset.
- [ ] `RESEND_API_KEY` 保持未设置。
- [ ] Use the free `netlify.app` hostname.
- [ ] 使用免费 `netlify.app` 域名。
- [ ] Use Stripe test mode unless the owner explicitly accepts transaction
      fees for a controlled live demonstration.
- [ ] 默认使用 Stripe 测试模式；只有业务所有者明确接受手续费时，才进行受控真实付款演示。

Netlify Free has a **hard 300-credit monthly limit**. When exhausted, all
projects on that team pause and visitors see `Site not available`. Free cannot
buy extra credits or enable auto recharge.

Netlify Free 每月有 **300 credits 硬上限**。用完后，该团队下所有项目暂停，访问者会
看到 `Site not available`。Free 不能购买额外 credits，也不能启用自动充值。

Supabase Free can pause after about one week of inactivity and provides no
managed backups. The operator may need to restore/wake the project from the
Supabase dashboard before a demo.

Supabase Free 可能在约一周无活动后暂停，而且没有托管备份。演示前可能需要操作人员在
Supabase Dashboard 恢复项目。

---

## 1. Free-track capacity limits / 免费 Track 容量限制

This track does **not** claim 300 simultaneous Realtime customers.

本 Track **不宣称**支持 300 名 Realtime 同时在线客户。

| Limit / 限制                             |          Free value / 免费额度 |
| ---------------------------------------- | -----------------------------: |
| Supabase Realtime concurrent connections |                            200 |
| Supabase database                        |                         500 MB |
| Supabase file storage                    |                           1 GB |
| Supabase egress                          |    5 GB uncached + 5 GB cached |
| Netlify monthly credits                  |                 300 hard limit |
| Netlify buffered binary request          | Approximately 4.5 MB effective |

Recommended demonstration target:

推荐 Demo 目标：

- 1 administrator.
- 1 名管理员。
- 5–25 controlled customer accounts.
- 5–25 个受控客户账户。
- One browser tab per participant.
- 每人一个浏览器标签页。
- Stripe test payments.
- Stripe 测试付款。
- No bulk email.
- 不发送批量邮件。

The code and database design still retain the paid production path for about
300 simultaneous customers. Upgrade to the Production Track before claiming
that capacity.

代码和数据库设计仍保留约 300 并发客户的付费生产路径。宣称该容量之前必须升级到
Production Track。

---

## 2. Free-track code behavior / 免费 Track 代码行为

Netlify builds set:

Netlify 构建会设置：

```dotenv
NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo
```

This changes only deployment-sensitive presentation and limits:

它只改变与部署相关的展示和限制：

- Shows an `MVP demo` availability/data-reset notice.
- 显示 `MVP demo` 可用性和数据可能重置的提示。
- Uses the host-safe **4 MiB** image limit, below Netlify's effective binary
  function limit and compatible with the retained paid hosting track.
- 使用主机安全的 **4 MiB** 图片上限，低于 Netlify 二进制 Function 的有效上限，
  同时兼容保留的付费托管 Track。
- `/api/health` reports `deploymentTrack: "free-demo"`.
- `/api/health` 返回 `deploymentTrack: "free-demo"`。

It does not weaken authentication, RLS, payment verification, storage privacy,
or deliverable gating.

它不会削弱认证、RLS、付款验证、存储隐私或交付锁定。

The paid Production Track remains the default when this variable is absent or
set to `production`.

变量不存在或设为 `production` 时，默认仍为付费 Production Track。

---

## 3. Verify repository and tools / 验证仓库与工具

```powershell
git status --porcelain
Get-Content .npmrc
npm ci
npm run check:public-dependencies
npm audit --audit-level=high
npm run verify
npm run test:e2e
```

Required:

要求：

- Clean approved release revision / 工作树干净且版本已批准
- Only `registry.npmjs.org` dependencies / 只使用公共 npm registry
- No Deere or internal packages / 无 Deere 或内部包
- Zero high/critical npm vulnerabilities / 无高危或严重 npm 漏洞
- Unit, component, browser tests and production build pass /
  单元、组件、浏览器测试和生产构建通过

---

## 4. Create two Supabase Free projects / 创建两个 Supabase Free 项目

Supabase Free currently allows two active projects. Use both:

Supabase Free 当前允许两个活动项目，应分别使用：

1. `veyra-demo-preview` — migrations, pgTAP, OAuth testing, destructive demo
   rehearsal.
2. `veyra-demo-preview` — 用于迁移、pgTAP、OAuth 测试和可破坏演练。
3. `veyra-demo` — stable public MVP demonstration.
4. `veyra-demo` — 稳定公共 MVP Demo。

Do not place real customer data in either project.

两个项目都不要保存真实客户数据。

### Apply Preview migrations and tests / Preview 迁移与测试

```powershell
npx supabase login
npx supabase link --project-ref YOUR_FREE_PREVIEW_PROJECT_REF
npx supabase db push --linked
npx supabase test db --linked supabase/tests/database
```

### Apply Demo migrations / Demo 迁移

```powershell
npx supabase link --project-ref YOUR_FREE_DEMO_PROJECT_REF
npx supabase db push --linked
npx supabase migration list --linked
```

Do not run `supabase/seed.sql` against the public Demo project if it contains
workflow examples you do not want visible. Create fictional records through
the application instead.

如果不希望示例流程公开，不要向公共 Demo 项目导入 `supabase/seed.sql`；应通过应用创建
虚构记录。

### Free-project checks / 免费项目检查

- [ ] All three Storage buckets are private.
- [ ] 三个 Storage bucket 均为 private。
- [ ] Anonymous users see only published portfolio metadata.
- [ ] 匿名用户只能看到已发布作品元数据。
- [ ] Customer A cannot access Customer B.
- [ ] 客户 A 无法访问客户 B。
- [ ] `messages` and `conversations` are in the Realtime publication.
- [ ] `messages` 与 `conversations` 已加入 Realtime publication。
- [ ] No paid add-on, PITR, custom domain, or branch is enabled.
- [ ] 未启用付费 add-on、PITR、自定义域名或分支。

---

## 5. Configure Google OAuth in testing mode / 以测试模式配置 Google OAuth

A completely free `netlify.app` demo should keep the Google OAuth consent
screen in **Testing** and use controlled test users. Public OAuth publication
may require owned-domain verification, which is outside this zero-domain-cost
track.

完全免费的 `netlify.app` Demo 应把 Google OAuth consent screen 保持为
**Testing**，仅使用受控 test users。公开发布 OAuth 可能要求验证自有域名，不属于
零域名费用 Track。

Create one Google Cloud testing project and two Web OAuth clients, one for each
Supabase Free project.

创建一个 Google Cloud 测试项目，并为两个 Supabase Free 项目分别创建 Web OAuth
client。

In both Supabase projects, disable Email/password, Phone, Anonymous, and every
other Auth provider, and disable manual identity linking. Enable only Google.
The database also requires the current JWT to contain an OAuth authentication
method plus a confirmed linked Google identity before customer/admin RLS or
RPC access, so password sessions from a linked account cannot use application
RLS or RPCs.

在两个 Supabase 项目中关闭 Email/password、Phone、Anonymous 和所有其他 Auth
provider，同时关闭 manual identity linking，只启用 Google。数据库还要求当前 JWT
包含 OAuth authentication method，并且账户具有已确认的 Google identity，才能使用
客户/管理员 RLS 和 RPC；因此即使账户已关联 Google，password session 也无法进入
应用。

Provider callback URLs:

服务商回调 URL：

```text
https://YOUR_FREE_PREVIEW_PROJECT_REF.supabase.co/auth/v1/callback
https://YOUR_FREE_DEMO_PROJECT_REF.supabase.co/auth/v1/callback
```

Request only:

只申请：

```text
openid
email
profile
```

Add every demonstration participant's real controlled Google account to the
OAuth test-user list. Do not add customers or unknown public users.

把每个 Demo 参与者的受控 Google 账户加入 OAuth test-user 列表；不要加入真实客户或
未知公众用户。

The exact Netlify URLs are added after §6 creates the two sites.

Netlify 精确 URL 在 §6 创建两个站点后添加。

---

## 6. Create two Netlify Free sites without Git auto-deploy / 创建两个无 Git 自动部署的 Netlify Free 站点

The audited `netlify-cli@27.8.0` is installed by `npm ci` from the committed
lockfile. The OpenNext adapter `@netlify/plugin-nextjs@5.16.0` is also pinned
in the same lockfile and declared in `netlify.toml`. Do not use `npx`, a global
Netlify CLI, or an unpinned transient version.

`npm ci` 会从已提交 lockfile 安装已审计的 `netlify-cli@27.8.0` 和
`@netlify/plugin-nextjs@5.16.0`，后者也在 `netlify.toml` 中显式声明。禁止使用
`npx`、全局 Netlify CLI 或未锁定的临时版本。

```powershell
.\node_modules\.bin\netlify.cmd login
$previewSite = .\node_modules\.bin\netlify.cmd sites:create `
  --disable-linking `
  --name YOUR_UNIQUE_VEYRA_DEMO_NAME-preview `
  --json | ConvertFrom-Json
$demoSite = .\node_modules\.bin\netlify.cmd sites:create `
  --disable-linking `
  --name YOUR_UNIQUE_VEYRA_DEMO_NAME `
  --json | ConvertFrom-Json
$previewSite.id
$demoSite.id
```

Record the two site IDs in the private deployment worksheet as
`NETLIFY_PREVIEW_SITE_ID` and `NETLIFY_DEMO_SITE_ID`.

把两个 site ID 私密记录为 `NETLIFY_PREVIEW_SITE_ID` 和
`NETLIFY_DEMO_SITE_ID`。

They must be different. The deployment wrapper refuses to deploy if both
variables contain the same site ID.

两个 ID 必须不同；如果两个变量相同，部署 wrapper 会拒绝执行。

`sites:create --disable-linking` creates blank sites without linking the local
directory or configuring repository webhooks/continuous deployment.

`sites:create --disable-linking` 创建空站点，不关联本地目录，也不配置仓库 webhook
或持续部署。

In the Netlify dashboard:

在 Netlify Dashboard：

- [ ] Confirm both sites belong to a **Free** team.
- [ ] 确认两个站点都属于 **Free** 团队。
- [ ] Do not add a payment method for hosting.
- [ ] 不为托管添加付款方式。
- [ ] Confirm auto recharge is unavailable/off.
- [ ] 确认自动充值不可用或关闭。
- [ ] Do not connect the Git repository.
- [ ] 不连接 Git 仓库。
- [ ] Stop automatic builds if any repository integration was added
      accidentally.
- [ ] 如误加仓库集成，立即停止自动构建。

The two stable free URLs will be:

两个稳定免费 URL：

```text
https://YOUR_UNIQUE_VEYRA_DEMO_NAME-preview.netlify.app
https://YOUR_UNIQUE_VEYRA_DEMO_NAME.netlify.app
```

No custom domain is required.

不需要自定义域名。

After the first successful deploy to each site, open each site's project
visibility settings and make both the main site and deploys public. Confirm an
incognito browser can reach each URL without Netlify authentication. Stripe
cannot call a private webhook.

两个站点首次成功部署后，在各自项目可见性设置中把主站和 deploy 设为 Public；使用
无痕浏览器确认无需 Netlify 登录即可访问。Stripe 无法调用私有 webhook。

---

## 7. Configure Demo OAuth URLs / 配置 Demo OAuth URL

For the Preview Supabase project:

Preview Supabase 使用：

```text
https://YOUR_UNIQUE_VEYRA_DEMO_NAME-preview.netlify.app
```

For the stable Demo project:

稳定 Demo 项目使用：

```text
https://YOUR_UNIQUE_VEYRA_DEMO_NAME.netlify.app
```

Configure each Supabase project:

分别配置每个 Supabase 项目：

- Site URL / Site URL
- Additional Redirect URL ending in `/auth/callback`
- Google client ID and secret for that project

Examples:

示例：

```text
https://YOUR_UNIQUE_VEYRA_DEMO_NAME-preview.netlify.app/auth/callback
https://YOUR_UNIQUE_VEYRA_DEMO_NAME.netlify.app/auth/callback
```

Add the same origins to the matching Google Web OAuth client's authorized
JavaScript origins.

把相同 origin 加入对应 Google Web OAuth client 的 Authorized JavaScript
origins。

---

## 8. Configure Netlify environment variables / 配置 Netlify 环境变量

Use the Netlify dashboard so secrets are not written to shell history.

使用 Netlify Dashboard，避免密钥写入 shell 历史。

### Preview site Production context / Preview 站点 Production 环境

```dotenv
NEXT_PUBLIC_APP_URL=https://YOUR_UNIQUE_VEYRA_DEMO_NAME-preview.netlify.app
NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_FREE_PREVIEW_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<preview-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<preview-service-role-key>
ADMIN_GOOGLE_EMAIL=<controlled-google-test-email>
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_...
BUSINESS_TIMEZONE=UTC
DEFAULT_CURRENCY=USD
DELIVERABLE_ALLOWED_HOSTS=www.dropbox.com,dropbox.com
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<preview-random-32-byte-base64>
AWS_LAMBDA_JS_RUNTIME=nodejs24.x
```

### Stable Demo site Production context / 稳定 Demo 站点 Production 环境

```dotenv
NEXT_PUBLIC_APP_URL=https://YOUR_UNIQUE_VEYRA_DEMO_NAME.netlify.app
NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_FREE_DEMO_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<demo-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<demo-service-role-key>
ADMIN_GOOGLE_EMAIL=<controlled-google-test-email>
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_...
BUSINESS_TIMEZONE=UTC
DEFAULT_CURRENCY=USD
DELIVERABLE_ALLOWED_HOSTS=www.dropbox.com,dropbox.com
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<different-demo-random-32-byte-base64>
AWS_LAMBDA_JS_RUNTIME=nodejs24.x
```

Leave `STRIPE_WEBHOOK_SECRET` unset until §9 creates each endpoint. Leave
`RESEND_API_KEY`, `EMAIL_FROM`, and `ADMIN_NOTIFICATION_EMAIL` completely
unset while Resend is disabled.

§9 创建各 webhook endpoint 前，`STRIPE_WEBHOOK_SECRET` 保持未设置。Resend 关闭时，
`RESEND_API_KEY`、`EMAIL_FROM` 和 `ADMIN_NOTIFICATION_EMAIL` 全部省略。

Change `BUSINESS_TIMEZONE`, `DEFAULT_CURRENCY`, administrator email, and
deliverable hosts to the actual Demo values.

把时区、货币、管理员邮箱和交付域名改为实际 Demo 值。

---

## 9. Configure Stripe test webhooks / 配置 Stripe 测试 Webhook

Create two separate Stripe **Sandboxes** (or separate test accounts), one for
Preview and one for the stable Demo. Do not put both endpoints in the same
test event namespace, because each matching event would be delivered to both
Supabase-backed environments.

创建两个相互独立的 Stripe **Sandbox**（或独立测试账户），分别用于 Preview 和稳定
Demo。不要把两个 endpoint 放在同一测试事件空间，否则每个匹配事件会同时发送到两个
使用不同 Supabase 的环境。

Create one webhook in each sandbox:

在每个 Sandbox 分别创建一个 webhook：

```text
https://YOUR_UNIQUE_VEYRA_DEMO_NAME-preview.netlify.app/api/webhooks/stripe
https://YOUR_UNIQUE_VEYRA_DEMO_NAME.netlify.app/api/webhooks/stripe
```

Subscribe to these exact 17 events in each sandbox:

每个 Sandbox 都订阅以下精确 17 个事件：

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

Put each endpoint's signing secret only in its matching site's Production
context.

每个 endpoint 的签名密钥只能放入对应站点的 Production context。

The Preview site must use the Preview sandbox's `sk_test_...`; the stable Demo
site must use the stable Demo sandbox's different `sk_test_...`.

Preview 站点必须使用 Preview Sandbox 的 `sk_test_...`；稳定 Demo 站点必须使用另一个
Demo Sandbox 的不同 `sk_test_...`。

After both endpoints exist, set `STRIPE_WEBHOOK_SECRET` in each matching site's
Production context **before** the first §11/§12 deployment. If a site was
already deployed during setup, redeploy that site once after setting the
secret.

两个 endpoint 创建后，把 `STRIPE_WEBHOOK_SECRET` 分别设置到对应的
站点 Production context，并在 §11/§12 首次部署**之前**完成。如设置过程中站点已经
部署，则设置密钥后只需重新部署该站点一次。

For a zero-cost Demo, keep `sk_test_...`. Stripe test mode has no transaction
fee.

零成本 Demo 保持使用 `sk_test_...`；Stripe 测试模式没有交易手续费。

### Optional live-payment demonstration / 可选真实付款演示

If the owner explicitly wants a real payment:

如所有者明确需要真实付款：

1. Complete Stripe merchant verification.
2. 完成 Stripe 商户认证。
3. Set `STRIPE_MODE=live` in the stable Demo context.
4. 在稳定 Demo context 设置 `STRIPE_MODE=live`。
5. Create a separate live webhook endpoint at
   `https://YOUR_UNIQUE_VEYRA_DEMO_NAME.netlify.app/api/webhooks/stripe`
   with the same 17 subscribed events.
6. 在稳定 Demo webhook URL 创建独立 live endpoint，并订阅同样 17 个事件。
7. Replace only the stable Demo context with `sk_live_...` and that live
   endpoint's signing secret.
8. 只替换稳定 Demo context 的 `sk_live_...` 和对应 live webhook secret。
9. Redeploy manually.
10. 手动重新部署。
11. Accept Stripe transaction, non-returned processing, refund, and dispute
    related fees where applicable.
12. 接受适用的 Stripe 交易、不可退处理、退款和争议相关费用。

Hosting remains free until Netlify or Supabase quotas are exhausted. Live
payment does not make those quotas larger.

启用真实付款不会提高 Netlify 或 Supabase 免费额度。

Recheck Netlify's current self-serve agreement and acceptable-use policy before
using a Free site for a live commercial transaction.

使用 Free 站点进行真实商业交易前，应重新检查 Netlify 最新自助服务协议和可接受使用
政策。

---

## 10. Build with the Netlify adapter / 使用 Netlify Adapter 构建

The checked-in `netlify.toml` selects Node 24, `free-demo`, and the normal
Next.js build. Netlify's official adapter packages native `sharp`.

仓库中的 `netlify.toml` 选择 Node 24、`free-demo` 和正常 Next.js 构建；Netlify 官方
adapter 负责打包原生 `sharp`。

Run:

执行：

```powershell
npm run free:build
```

This runs an account-independent `free-demo` Next.js build on Windows, macOS,
or Linux.

该命令在 Windows、macOS 或 Linux 上执行不依赖账户的 `free-demo` Next.js 构建。

Copy or clone the same approved revision into a Linux/WSL **ext4** directory
using Linux x64 with glibc, run `npm ci` there, authenticate the locked CLI,
and set both recorded site IDs:

把相同已批准版本复制或克隆到使用 Linux x64 + glibc 的 Linux/WSL **ext4** 目录，
执行 `npm ci`，使用锁定 CLI 登录，并设置两个已记录 site ID：

```bash
./node_modules/.bin/netlify login
export NETLIFY_PREVIEW_SITE_ID="<preview-site-id>"
export NETLIFY_DEMO_SITE_ID="<demo-site-id>"
npm run free:build:netlify
```

The `free:build:netlify` and `free:deploy:*` scripts deliberately refuse to run
outside Linux. Netlify CLI manual deploys build locally before upload, so the
final deploy commands must run from that same clean Linux/WSL worktree. The
repository's Linux verification bundles the server function, Edge middleware,
and native `sharp` successfully.

`free:build:netlify` 和 `free:deploy:*` 在非 Linux 环境会主动拒绝执行。Netlify CLI
手动部署会先在本机构建再上传，因此最终部署命令必须在同一个干净 Linux/WSL 工作树
执行。本仓库已在 Linux 成功打包 Server Function、Edge Middleware 和原生 `sharp`。

---

## 11. Deploy the free Preview manually / 手动部署免费 Preview

```bash
npm run free:deploy:preview
```

Expected URL:

预期 URL：

```text
https://YOUR_UNIQUE_VEYRA_DEMO_NAME-preview.netlify.app
```

This is a production deploy on the separate Preview site, so it consumes 15
credits. The separation is required so Preview functions cannot receive the
stable Demo site's runtime secrets.

这是独立 Preview 站点上的 Production deploy，因此消耗 15 credits。使用独立站点是
为了防止 Preview Function 获取稳定 Demo 站点的运行时密钥。

Sign in once with the controlled Preview Google account so Supabase creates
the auth identity, then immediately run the Preview half of §13. Sign out and
sign in again before testing administrator access.

先使用受控 Preview Google 账户登录一次，让 Supabase 创建 auth identity；随后立即
执行 §13 的 Preview 管理员同步。退出并重新登录后再测试管理员权限。

Verify:

验证：

- [ ] `/api/health` reports `free-demo`.
- [ ] `/api/health` 显示 `free-demo`。
- [ ] Demo banner is visible.
- [ ] Demo 提示可见。
- [ ] Google test-user login works.
- [ ] Google 测试用户登录正常。
- [ ] Customer/admin roles are isolated.
- [ ] 客户和管理员角色隔离。
- [ ] 4 MiB image succeeds; larger image is rejected before upload.
- [ ] 4 MiB 图片成功，更大图片在上传前被拒绝。
- [ ] Stripe test Checkout and webhook work.
- [ ] Stripe 测试 Checkout 与 webhook 正常。
- [ ] Private media and deliverables remain protected.
- [ ] 私有媒体和交付继续受保护。

---

## 12. Deploy the stable free Demo / 部署稳定免费 Demo

Each successful production deploy consumes 15 of the 300 monthly Netlify
credits. Both the Preview-site deploy and stable-Demo deploy count. Minimize
deploys and validate locally before publishing either site.

每次成功 Production deploy 消耗 300 月度 credits 中的 15；Preview 站点和稳定 Demo
站点都计费。发布任一站点前应先在本地验证并尽量减少部署。

Before deployment:

部署前：

```bash
git status --porcelain
npm run verify
npm run test:e2e
npm run check:public-dependencies
npm audit --audit-level=high
```

Then:

然后：

```bash
npm run free:deploy:production
```

Verify the stable URL:

验证稳定 URL：

```text
https://YOUR_UNIQUE_VEYRA_DEMO_NAME.netlify.app
```

Complete the same Preview smoke test using the Demo Supabase project.

使用 Demo Supabase 项目重复 Preview 冒烟测试。

Before role checks, sign in once with the controlled Demo Google account, run
the Demo half of §13, then sign out and sign in again.

角色检查前，先使用受控 Demo Google 账户登录一次，执行 §13 的 Demo 管理员同步，
然后退出并重新登录。

---

## 13. Synchronize the two Demo administrators / 同步两个 Demo 管理员

Run `npm run admin:sync` separately against Preview and Demo Supabase. Prompt
for each service-role key; do not commit or paste keys into command history.

分别对 Preview 和 Demo Supabase 执行 `npm run admin:sync`。安全输入各自
service-role key，不要提交或粘贴到命令历史。

The command calls the service-role-only `sync_admin_allowlist` database RPC.
That RPC serializes concurrent changes, verifies one confirmed Google identity
and profile, deactivates every other active administrator, activates the
target, and commits all changes atomically. On failure, the transaction rolls
back; it must never leave a partially changed allowlist. An exact retry returns
success with `changed=false`.

该命令调用仅限 service-role 的 `sync_admin_allowlist` 数据库 RPC。RPC 会串行化并发
修改，验证唯一已确认 Google identity 和 profile，停用其他所有管理员，启用目标，并
在一个事务中原子提交。失败时事务整体回滚，不会留下部分修改；精确重试会成功并返回
`changed=false`。

Use the same controlled Google test account only if that matches the intended
demonstration.

只有在符合演示设计时，两个项目才使用同一个受控 Google 测试账户。

For each project:

每个项目分别执行：

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://PROJECT_REF.supabase.co"
$env:ADMIN_GOOGLE_EMAIL = "<CONTROLLED_GOOGLE_TEST_EMAIL>"
$roleKey = Read-Host "Supabase service-role key" -AsSecureString
$rolePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($roleKey)
try {
  $env:SUPABASE_SERVICE_ROLE_KEY =
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($rolePointer)
  npm run admin:sync
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($rolePointer)
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_GOOGLE_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
}
```

---

## 14. Monitor the zero-cost limits / 监控零成本额度

Netlify Free credit consumption:

Netlify Free credits 消耗：

| Usage / 用量                                                  |          Credits |
| ------------------------------------------------------------- | ---------------: |
| Successful production deploy / 成功生产部署                   |          15 each |
| Preview-site production deploy / Preview 站点生产部署         |          15 each |
| Unused draft/branch deploy class / 未采用的 draft/branch 类型 | 0 deploy credits |
| Function compute / Function 计算                              |   10 per GB-hour |
| Bandwidth / 带宽                                              |        20 per GB |
| Web requests / Web 请求                                       |     2 per 10,000 |

Suggested warning levels:

建议提醒阈值：

- 150 credits: review usage / 150：检查用量
- 225 credits: freeze nonessential production deploys / 225：停止非必要生产部署
- 270 credits: disable public Demo access or accept likely pause /
  270：关闭公开 Demo 或接受即将暂停
- 300 credits: Netlify pauses all team projects / 300：Netlify 暂停团队所有项目

Check **Usage & billing > General** before and after every demonstration.

每次 Demo 前后检查 **Usage & billing > General**。

Supabase Free:

- Check Realtime connections, storage, egress, and database size.
- 检查 Realtime 连接、Storage、egress 和数据库大小。
- Keep active Realtime connections well below 200.
- Realtime 活跃连接保持远低于 200。
- Expect project pause after inactivity.
- 预期项目可能因无活动暂停。
- Create manual database and Storage backups before important demonstrations.
- 重要 Demo 前手动备份数据库与 Storage。

---

## 15. Free-track smoke test / 免费 Track 冒烟测试

- [ ] Public pages and portfolio render.
- [ ] 公共页面和作品集正常。
- [ ] Controlled Google test users sign in.
- [ ] 受控 Google 测试用户可登录。
- [ ] Exactly one configured account is administrator.
- [ ] 只有一个配置账户为管理员。
- [ ] Customer A cannot access Customer B.
- [ ] 客户 A 无法访问客户 B。
- [ ] Requests, messages, and 4 MiB images work.
- [ ] 请求、消息和 4 MiB 图片正常。
- [ ] New messages reorder the admin inbox.
- [ ] 新消息使管理员列表置顶。
- [ ] Quote, counteroffer, acceptance, and draft review work.
- [ ] 报价、还价、接受和草稿审核正常。
- [ ] Stripe test payment is webhook-confirmed.
- [ ] Stripe 测试付款由 webhook 确认。
- [ ] Deliverable remains locked before payment.
- [ ] 付款前交付保持锁定。
- [ ] Aftercare and history work.
- [ ] 售后和历史正常。
- [ ] No secrets or private URLs appear in logs.
- [ ] 日志无密钥或私有 URL。

---

## 16. Manual exports and disposable-data recovery / 手动导出与可丢弃数据恢复

Supabase Free provides no managed backup or complete application restore
guarantee. Before important demos, create forensic/reference exports:

Supabase Free 没有托管备份，也不保证完整应用恢复。重要 Demo 前可创建取证/参考导出：

```powershell
npx supabase link --project-ref YOUR_FREE_DEMO_PROJECT_REF
npx supabase db dump --linked --file <SECURE_PATH>\demo-schema.sql
if ($LASTEXITCODE -ne 0) { throw "Schema export failed." }
npx supabase db dump --linked --data-only --use-copy `
  --file <SECURE_PATH>\demo-data.sql
if ($LASTEXITCODE -ne 0) { throw "Data export failed." }
npx supabase --experimental storage cp --linked --recursive `
  ss:///commission-private `
  <SECURE_PATH>
if ($LASTEXITCODE -ne 0) { throw "Commission object export failed." }
npx supabase --experimental storage cp --linked --recursive `
  ss:///portfolio-public `
  <SECURE_PATH>
if ($LASTEXITCODE -ne 0) { throw "Portfolio object export failed." }
npx supabase --experimental storage cp --linked --recursive `
  ss:///deliverables-private `
  <SECURE_PATH>
if ($LASTEXITCODE -ne 0) { throw "Deliverable object export failed." }
```

Using the same `<SECURE_PATH>` destination creates three bucket-named
subdirectories and preserves the object-key layout. Do not append the bucket
name to the local destination.

三个命令使用同一个 `<SECURE_PATH>`，会创建三个 bucket 同名子目录并保留对象 key
布局；本地目标路径不要再次追加 bucket 名。

Store exports encrypted and outside Git. They are reference material, not a
proven full backup.

导出必须加密并保存在 Git 外部。它们只是参考资料，不是经过验证的完整备份。

### Why full restore is not promised / 为什么不承诺完整恢复

Application rows reference Supabase Auth identities, and Storage metadata must remain coordinated with object bytes. Restoring a raw data dump into an already migrated or seeded Supabase instance can conflict with platform rows and does not prove valid recovery. The Free track therefore treats customer, payment, message, and workflow data as disposable.

应用记录引用 Supabase Auth identity，Storage 元数据也必须与对象文件保持一致。把原始数据导入已迁移或已 seed 的 Supabase 可能与平台记录冲突，不能证明恢复有效。因此 Free Track 必须把客户、付款、消息和业务流程数据视为可丢弃数据。

### Free recovery procedure / 免费恢复流程

1. Release a Free project slot if both slots are occupied.
2. 如两个免费项目槽均占用，删除不再需要的项目以释放一个槽。
3. Create a new Supabase Free project.
4. 创建新的 Supabase Free 项目。
5. Link the CLI to the replacement and verify the target:
6. 把 CLI 关联到替代项目并确认目标：

   ```powershell
   npx supabase link --project-ref NEW_FREE_DEMO_PROJECT_REF
   npx supabase migration list --linked
   ```

7. Apply checked-in migrations with `supabase db push --linked`.
8. 使用 `supabase db push --linked` 应用仓库迁移。
9. Reconfigure Google OAuth, redirect URLs, Realtime, and private buckets.
   In the stable Demo site's Production context, replace all three Supabase
   values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY`.
10. 重新配置 Google OAuth、redirect URL、Realtime 和私有 bucket；在稳定 Demo
    站点的 Production context 中同时替换三个 Supabase 值：
    `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` 和
    `SUPABASE_SERVICE_ROLE_KEY`。
11. Redeploy the stable Demo site so embedded public Supabase values point to
    the replacement. This consumes 15 credits:
12. 重新部署稳定 Demo 站点，使嵌入的公共 Supabase 值指向替代项目；该操作消耗
    15 credits：

    ```bash
    export NETLIFY_PREVIEW_SITE_ID="<preview-site-id>"
    export NETLIFY_DEMO_SITE_ID="<demo-site-id>"
    npm run free:deploy:production
    ```

13. Sign in once with the controlled Google account so the replacement creates
    the Auth identity; run `admin:sync`, sign out, and sign in again.
14. 使用受控 Google 账户先登录一次，让替代项目创建 Auth identity；执行
    `admin:sync`，退出并重新登录。
15. Recreate fictional portfolio, request, quote, message, payment, and
    aftercare records through the application, using exports only as reference.
16. 通过应用重新创建虚构作品、请求、报价、消息、付款和售后，导出只作为参考。
17. Repeat the complete smoke test.
18. 重复完整冒烟测试。

If preserving customer or financial history is required, do not use this Free track. Upgrade to the Production Track with managed backups and a tested restore procedure before collecting that data.

如必须保存客户或财务历史，不要使用 Free Track；收集此类数据前应升级到具备托管备份和已验证恢复流程的 Production Track。
---

## 17. Rollback / 回滚

Netlify deploys are atomic:

Netlify 部署为原子版本：

1. Open the Netlify site.
2. 打开 Netlify 站点。
3. Go to **Deploys**.
4. 进入 **Deploys**。
5. Open the last known-good successful deployment.
6. 打开最近的正常成功部署。
7. Select **Publish Deploy**.
8. 选择 **Publish Deploy**。
9. Repeat OAuth, message, Checkout, and deliverable smoke tests.
10. 重复认证、聊天、Checkout 和交付测试。

Rollback does not consume production-deploy credits, but old Free deploys may
be removed after the platform retention period. Keep release records.

回滚不消耗生产部署 credits，但旧 Free deploy 可能在保留期后删除，因此要保存发布记录。

Do not reverse Supabase migrations automatically. Use a reviewed forward
correction or restore into a separate project.

不要自动反向执行 Supabase 迁移；应使用审核后的前向修复或恢复到独立项目。

---

## 18. When the free track is no longer sufficient / 免费 Track 何时不再适用

Upgrade to the paid Production Track when any of these is true:

出现以下任一情况时，应升级到付费 Production Track：

- More than 25 regularly active Demo users.
- 超过 25 名经常活跃的 Demo 用户。
- Approaching 200 Realtime connections.
- 接近 200 个 Realtime 连接。
- Public OAuth must accept arbitrary users instead of controlled test users.
- OAuth 需要接受任意公众用户，而不是受控 test users。
- Netlify approaches 225 credits repeatedly.
- Netlify 多次接近 225 credits。
- Supabase storage, egress, or database size approaches Free quotas.
- Supabase Storage、egress 或数据库大小接近免费额度。
- Continuous availability or managed backups are required.
- 需要持续可用性或托管备份。
- The business claims support for approximately 300 simultaneous customers.
- 业务需要宣称支持约 300 名同时在线客户。

Use `docs/deployment-bilingual.md` for the paid production upgrade path. The
application code, schema, and design remain the same; change provider plans,
environment values, upload limit track, and operational gates.

升级时使用 `docs/deployment-bilingual.md`。应用代码、schema 和设计保持不变；只需
调整服务方案、环境变量、上传限制 Track 和运维 Gate。

---

## Free MVP completion checklist / 免费 MVP 完成清单

- [ ] Netlify team is Free and has no auto recharge.
- [ ] Netlify 团队为 Free 且无自动充值。
- [ ] Both sites were created without Git linking.
- [ ] Preview 与 Demo 站点通过 `sites:create --disable-linking` 创建。
- [ ] Both sites and deploys are Public and webhook-accessible.
- [ ] 两个站点和 deploy 均设为 Public，可供受控用户和 Stripe webhook 访问。
- [ ] Git automatic deployment is not connected.
- [ ] 未连接 Git 自动部署。
- [ ] Two Supabase projects remain Free.
- [ ] 两个 Supabase 项目均为 Free。
- [ ] Google OAuth remains in Testing with controlled users.
- [ ] Google OAuth 保持 Testing 且仅受控用户。
- [ ] Resend is disabled.
- [ ] Resend 已关闭。
- [ ] Default `netlify.app` hostname is used.
- [ ] 使用默认 `netlify.app` 域名。
- [ ] Stripe is test mode, or only approved transaction fees apply.
- [ ] Stripe 为测试模式，或只产生已批准交易手续费。
- [ ] `NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo`.
- [ ] `NEXT_PUBLIC_DEPLOYMENT_TRACK=free-demo`。
- [ ] 4 MiB upload behavior is verified.
- [ ] 4 MiB 上传行为已验证。
- [ ] Credit and Supabase quota monitoring is assigned.
- [ ] 已指定人员监控 credits 与 Supabase 额度。
- [ ] Demo limitations are visible and documented.
- [ ] Demo 限制已显示并记录。

---

## Official references / 官方参考

Accessed 2026-09-17 / 访问日期 2026-09-17：

- Netlify pricing: <https://www.netlify.com/pricing/>
- Netlify credit hard limits and metering:
  <https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/>
- Netlify Next.js support:
  <https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/>
- Netlify Function limits:
  <https://docs.netlify.com/build/functions/configuration/>
- Netlify manual deploys:
  <https://docs.netlify.com/deploy/create-deploys/>
- Netlify self-serve terms:
  <https://www.netlify.com/legal/self-serve-subscription-agreement/>
- Supabase pricing and Free limits: <https://supabase.com/pricing>
- Supabase Realtime limits:
  <https://supabase.com/docs/guides/realtime/limits>
- Stripe pricing: <https://stripe.com/us/pricing>
- Stripe webhook requirements: <https://docs.stripe.com/webhooks>
