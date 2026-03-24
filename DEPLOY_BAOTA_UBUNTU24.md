# 宝塔 Ubuntu 24 部署说明

## 1. 服务器准备
- 安装 `Node.js 18+`
- 安装 `PM2`
- 安装并启用 `Nginx`
- 如果使用 MySQL，先准备好数据库和账号

## 2. 上传项目
把项目上传到：

```bash
/www/wwwroot/iot-mall
```

进入目录后安装依赖：

```bash
npm install
```

## 3. 配置环境变量
建议先复制 `.env.example`，再按实际环境填写。

最小可运行配置：

```bash
PORT=3000
JWT_SECRET=replace-with-a-long-random-secret
STORAGE_DRIVER=json

ADMIN_PHONE=17724888898
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password
```

如果要使用 MySQL，把存储模式切到 `mysql`，并补齐以下配置：

```bash
STORAGE_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=iot_mall
MYSQL_USER=replace_me
MYSQL_PASSWORD=replace_me
```

说明：
- `JWT_SECRET` 必须使用随机长字符串
- 生产环境不要使用默认管理员密码
- 如果首次启动没填 `ADMIN_PASSWORD`，系统会生成一次性管理员密码并打印到日志里

## 4. 启动项目

```bash
pm2 start app.js --name iot-mall
pm2 save
pm2 startup
```

默认监听地址：

```bash
http://127.0.0.1:3000
```

## 5. 配置 Nginx 反向代理
把站点反向代理到：

```bash
http://127.0.0.1:3000
```

## 6. 静态目录
部署时请确认这些目录已上传并具备读写权限：

- `uploads`
- `套餐图片`
- `设备图片`

## 7. 存储说明

### `json` 模式
- 适合本地开发、小规模部署、快速演示
- 数据保存在 `data/*.json`
- 不依赖外部 MySQL

### `mysql` 模式
- 适合正式环境
- 应用启动时会自动建表
- 首次启动时，如果表为空，会从 `data/*.json` 导入初始数据

## 8. 访问地址
前台：

```bash
/
```

后台：

```bash
/admin
```

## 9. 生产建议
- 使用 `mysql` 模式
- 立即修改管理员账号和密码
- 定期备份数据库和 `uploads`
- 给 `.env` 做权限隔离，不要提交到仓库
