# 求职助手 Web 版 - 产品需求

## 技术栈
- 前端：React + Vite + TypeScript
- 样式：Tailwind CSS
- 路由：React Router v6
- Markdown 渲染：react-markdown
- 思维导图：markmap-lib + markmap-view
- 后端/DB：Supabase
- AI：DeepSeek API（流式输出，streaming）
- 文档解析：前端读取文本，PDF用pdfjs-dist

## Supabase 配置
- Project URL: https://pjfdizbugmglzzhcbnoo.supabase.co
- Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqZmRpemJ1Z21nbHp6aGNibm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODEzMTksImV4cCI6MjA4OTU1NzMxOX0.PNPyePPvOqT9i2ZRNfWrnjonWxb2mRtV9Phw56_0zKM

## DeepSeek API
- Base URL: https://api.deepseek.com
- API Key: sk-bed03e933b43468db214b0de2e62cd9d
- Model: deepseek-chat
- 重要：所有 AI 调用都用 stream: true 流式输出，实时展示内容

## 界面风格
- 简洁、现代、美观
- 主色调：深蓝/青色渐变（from-blue-600 to-cyan-500）
- 白色卡片，圆角设计
- 响应式，支持移动端和桌面端
- 顶部导航栏（桌面），底部导航栏（移动端）

## 功能模块

### 1. 登录/注册页（/auth）
- Supabase Auth 邮箱注册/登录
- 注册成功后跳转填写个人信息页
- 个人信息：昵称、年龄、职位类型（实习/校招/社招，下拉选择）、目标岗位
- 存入 Supabase profiles 表

### 2. 导航
- 桌面：顶部横向导航（Logo + 复盘 | 写简历 | 面试准备 | 我的 + 退出）
- 移动：底部 Tab（四个图标+文字）

### 3. 复盘模块（/review）
- 文本框输入工作经历
- 支持上传文档（PDF/Word/TXT），前端解析文本内容
- 点击"开始复盘"，调用 DeepSeek 流式输出，实时展示
- 结果以结构化 Markdown 渲染
- 结果页有"查看思维导图"按钮，用 markmap 渲染为思维导图
- 历史记录存入 Supabase reviews 表

### 4. 写简历模块（/resume）
分两步：
- 第一步：输入工作经历描述 + 可上传产出文档和原始简历 → 生成基础简历（Markdown渲染）
- 第二步：上传/输入目标岗位 JD → 基于基础简历生成定制化简历
- 支持一键复制 Markdown 内容
- 历史记录存入 Supabase resumes 表

### 5. 面试准备模块（/interview）
- 输入/上传目标岗位 JD
- 可关联已有复盘记录（下拉选择历史复盘）
- 生成内容（流式，分块展示）：
  - 自我介绍逐字稿（2分钟）
  - 10道面经题 + 参考答案
  - 模拟追问题
- 模拟面试功能：AI 扮演面试官，用户在输入框回答，AI 实时点评
- 存入 Supabase interview_preps 表

### 6. 我的（/profile）
- 查看/编辑个人信息
- 历史复盘列表（点击可查看详情）
- 历史简历列表（点击可查看详情）
- 退出登录

## 数据库表（已存在，直接用）
- profiles: id, user_id, nickname, age, job_type, target_position
- reviews: id, user_id, content, result, created_at
- resumes: id, user_id, base_content, jd_content, generated_resume, created_at
- interview_preps: id, user_id, jd_content, intro_script, questions, created_at

## 其他要求
- 所有页面未登录则跳转 /auth
- 错误处理友好，loading 状态清晰
- AI 流式输出时显示打字动画光标
- 代码结构清晰，组件化
