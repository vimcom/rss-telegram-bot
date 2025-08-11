## .部署步骤（网页端操作）

### 步骤1：准备Cloudflare账户
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 注册/登录Cloudflare账户
3. 进入Workers & Pages页面

### 步骤2：创建D1数据库
1. 在Cloudflare Dashboard中，点击左侧菜单的 **D1 SQL Database**
2. 点击 **Create database** 按钮
3. 数据库名称填写：`rss-bot-db`
4. 点击 **Create** 创建数据库
5. 创建完成后，点击数据库名称进入详情页
6. 在 **Console** 标签页中，复制粘贴上面的SQL语句来创建表结构

### 步骤3：创建Telegram Bot
1. 在Telegram中找到 [@BotFather](https://t.me/botfather)
2. 发送 `/newbot` 命令
3. 按提示设置bot名称和用户名
4. 获得Bot Token（格式：`123456789:ABCdef...`）
5. 记录这个Token，稍后会用到

### 步骤4：创建Worker
1. 回到Cloudflare Dashboard的 **Workers & Pages** 页面
2. 点击 **Create application** → **Create Worker**
3. Worker名称填写：`rss-telegram-bot`
4. 点击 **Deploy** 创建基础Worker
5. 创建完成后点击 **Edit code** 进入编辑器

### 步骤5：配置Worker代码
1. 在Worker编辑器中，删除默认代码
2. 复制上面的 `src/index.js` 代码粘贴进去
3. 同时需要创建其他文件（rss-parser.js、telegram-bot.js、db-manager.js）
4. 在编辑器中使用 **Add file** 功能添加这些文件
5. 点击 **Save and deploy** 保存部署

### 步骤6：配置环境变量和绑定
1. 在Worker详情页面，点击 **Settings** 标签
2. 找到 **Environment Variables** 区域
3. 点击 **Add variable** 添加：
   - Variable name: `TELEGRAM_BOT_TOKEN`
   - Value: 你的Telegram Bot Token
4. 找到 **Bindings** 区域，点击 **Add binding**
5. 选择 **D1 database**：
   - Variable name: `DB`
   - D1 database: 选择之前创建的 `rss-bot-db`
6. 点击 **Save and deploy**

### 步骤7：设置Webhook
1. 获取你的Worker URL（类似：`https://rss-telegram-bot.你的用户名.workers.dev`）
2. 在浏览器中访问以下URL设置webhook：
   ```
   https://api.telegram.org/bot你的BOT_TOKEN/setWebhook?url=https://rss-telegram-bot.你的用户名.workers.dev/webhook
   ```
3. 看到 `{"ok":true,"result":true...}` 表示设置成功

### 步骤8：设置定时任务
1. 在Worker设置页面找到 **Triggers** 区域
2. 点击 **Add Cron Trigger**
3. Cron expression填写：`*/10 * * * *`（每10分钟执行一次）
4. 点击 **Add trigger**

## 5. 测试使用

### Bot命令测试
1. 在Telegram中找到你的Bot
2. 发送 `/start` 开始使用
3. 测试添加订阅：`/add https://feeds.feedburner.com/ruanyifeng`
4. 查看订阅列表：`/list`
5. 删除订阅：`/del 1`

### 功能特点
- ✅ 支持添加/删除单个或多个RSS订阅
- ✅ 重复订阅检测和提示
- ✅ RSS内容解析和HTML清理
- ✅ 格式化推送（标题+链接+内容预览+来源+时间）
- ✅ 防重复推送机制
- ✅ 定时检查RSS更新（每10分钟）
- ✅ 完全网页端部署，无需命令行

### 维护建议
- 定期检查Worker执行日志
- 可以手动访问 `/check-rss` 端点触发RSS检查
- 考虑添加用户权限管理（如需要）
- 监控数据库大小，定期清理旧数据

这个项目已经包含了所有需要的功能，可以直接部署使用!
