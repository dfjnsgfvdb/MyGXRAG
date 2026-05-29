# 部署说明

## 构建前准备

确认依赖已安装：

```bash
npm install
```

确认项目根目录存在 `ai.config.json`，并包含有效的 DashScope API Key。

## 本地运行

启动后端：

```bash
npm run start-server
```

启动前端：

```bash
npm run dev
```

## 生产构建

```bash
npm run build
```

构建产物位于：

```text
dist/
```

## 部署建议

- 前端静态资源部署到 Nginx 或对象存储。
- 后端 `express.js` 独立部署为 Node.js 服务。
- 生产环境不要提交 `ai.config.json`，建议使用服务器环境变量管理密钥。
- 前端请求后端时，需要保证 `/rest/mock/*` 和 `/api/rag/reset` 能正确转发到后端服务。

## Nginx 示例

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/yaogan/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /rest/mock/ {
        proxy_pass http://127.0.0.1:9090/rest/mock/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/rag/ {
        proxy_pass http://127.0.0.1:9090/api/rag/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
