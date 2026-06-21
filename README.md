# MeetWe

MeetWe 是一个基于通勤耗时公平性的约会地点推荐 Web MVP。前端使用 React + Vite，后端使用简单 Express 代理接入高德地图 Web 服务。

## 申请高德 Key

1. 进入高德开放平台：https://lbs.amap.com/
2. 创建应用。
3. 为前端高德 JS API 2.0 创建 Web 端 Key，得到：
   - `VITE_AMAP_JS_KEY`
   - `VITE_AMAP_SECURITY_CODE`
4. 为后端 Web 服务 API 创建 Web 服务 Key，得到：
   - `AMAP_WEB_SERVICE_KEY`

不要把真实 Key 写进代码或提交到仓库。

## 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
VITE_AMAP_JS_KEY=your_amap_js_key
VITE_AMAP_SECURITY_CODE=your_amap_security_code
AMAP_WEB_SERVICE_KEY=your_amap_web_service_key
```

`.env` 已加入 `.gitignore`。

## 安装依赖

```bash
npm install
```

## 运行项目

```bash
npm run dev
```

这会同时启动：

- Vite 前端：http://127.0.0.1:5173/
- Express 后端：http://127.0.0.1:5185/

前端通过 Vite proxy 请求 `/api`，避免在浏览器暴露 Web 服务 Key。

## Mock Fallback

以下情况会自动回退到模拟推荐数据：

- 未配置高德 Key
- 地理编码失败
- POI 搜索失败
- 公交路线规划失败
- 高德接口返回空数据

页面会提示：“地图服务暂时不可用，已为你展示模拟推荐结果。当前使用模拟数据展示，配置地图服务后可计算真实通勤时间。”

## 如何测试高德接入

1. 填好 `.env`。
2. 运行 `npm run dev`。
3. 进入 MeetWe，城市保持“上海”。
4. 参与者输入：
   - 小林：上海海事大学（临港校区）
   - 阿周：世纪公园
5. 类型选择“美食”。
6. 点击“生成推荐地”。

成功时页面会显示“已使用高德地图计算真实公共交通耗时。”，地图区域会加载高德地图，并展示参与者、约会中心和推荐地点。

第一版真实路线只计算公共交通；其他交通方式会保留在表单中，但推荐计算仍按公共交通执行。
