# 宝塔 Ubuntu 24 部署说明

## 1. 服务器准备

- 安装 `Node.js 18+`
- 安装 `PM2`
- 安装并启用 `Nginx`
- 确保服务器可以访问你的 MySQL

## 2. 上传项目

把项目上传到：

```bash
/www/wwwroot/iot-mall
```

进入项目目录后安装依赖：

```bash
npm install
```

## 3. 配置环境变量

项目当前直接读取系统环境变量。

建议至少配置下面这些变量：

```bash
PORT=3000
JWT_SECRET=请替换成你自己的长随机密钥

MYSQL_HOST=149.88.95.34
MYSQL_PORT=3306
MYSQL_DATABASE=iotmall
MYSQL_USER=iotmall
MYSQL_PASSWORD=MPDENDB2A4J86TrK

ADMIN_PHONE=17724888898
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
```

如果你使用宝塔的 PM2 管理器，可以直接在 PM2 的环境变量里填写。

## 4. 启动项目

```bash
pm2 start app.js --name iot-mall
pm2 save
pm2 startup
```

启动后默认监听：

```bash
http://127.0.0.1:3000
```

## 5. 配置 Nginx 反向代理

把站点反向代理到：

```bash
http://127.0.0.1:3000
```

## 6. 静态资源目录

部署时请确保这些目录一起上传：

- `uploads`
- `套餐图片`
- `设备图片`
- `收款码`

## 7. MySQL 说明

项目启动后会自动：

- 连接 MySQL
- 自动创建 `users / plans / devices / orders / settings` 表
- 首次启动时从 `data/*.json` 导入旧数据
- 自动补齐管理员账号

也就是说，你不需要再手动建表。

## 8. 前后台地址

前台首页：

```bash
/
```

后台地址：

```bash
/admin
```

## 9. 建议

- 生产环境务必修改默认后台账号密码
- `JWT_SECRET` 不要使用演示值
- 建议定期备份 MySQL 数据库和 `uploads` 目录
- 如果未来订单量继续增大，可以再把 MySQL 读写改成更细粒度的 SQL，而不是当前这种“兼顾迁移速度和稳定性”的结构
