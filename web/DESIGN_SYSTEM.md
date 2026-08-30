# 群芳教育 Web 设计系统

## 设计方向

整体采用 Apple Music 式连续环境光与克制的 Liquid Glass：暖桃橙只作为背景氛围和重点提示，正文区域使用米白而非纯白，卡片与按钮通过半透明材质、细高光边和柔和阴影形成层次。信息密集页面仍优先保证扫描效率，不用装饰牺牲可读性。

## 修改入口

全局视觉参数集中在 `src/index.css` 的 `:root` 中，均以 `--ds-*` 命名：

| 目标 | 变量 |
| --- | --- |
| 页面底色 / 内容米白 | `--ds-canvas`、`--ds-content`、`--ds-content-raised` |
| 品牌强调色 | `--ds-accent`、`--ds-accent-deep` |
| 玻璃透明度 | `--ds-glass-fill`、`--ds-glass-fill-strong` |
| 玻璃描边 | `--ds-glass-line` |
| 模糊与饱和度 | `--ds-blur`、`--ds-blur-strong`、`--ds-saturation` |
| 圆角 | `--ds-radius-control`、`--ds-radius-card`、`--ds-radius-shell` |
| 阴影 | `--ds-shadow`、`--ds-shadow-hover` |
| 动效 | `--ds-ease-out`、`--ds-motion-enter`、`--ds-motion-control` |
| 全页环境光 | `--ds-environment` |

修改整套风格时优先只调整这些变量。Tailwind 的 `--color-*` 负责功能色和文本色，`--ds-*` 负责材质、空间和运动。

## 页面接入

桌面布局使用：

```tsx
<div className="app-design-shell flex min-h-screen flex-col">
  <header className="app-design-header">...</header>
  <main className="app-design-main ...">...</main>
</div>
```

教师、家长和学生移动布局使用：

```tsx
<div className="mobile-liquid-shell flex min-h-screen flex-col">
  <header className="mobile-liquid-header">...</header>
  <main className="app-design-main ...">
    <div className="mobile-liquid-page">...</div>
  </main>
</div>
```

优先复用 `card`、`card-interactive`、`card-elevated`、`table-container`、`table-head`、`table-row`、`input`、`select`、`btn-primary`、`btn-secondary`、`btn-danger`、`btn-ghost`、`nav-tab`、`nav-tab-active`、`empty-state`。弹窗和通知分别使用 `modal-glass`、`toast-glass`。

## 新页面检查

- 页面使用统一外壳，长页面底部仍有连续环境光。
- 卡片没有 `bg-white`，必要的实色内容面使用 `bg-surface` 米白色。
- 按钮使用 `btn-*`，不在页面内重复定义玻璃、阴影和动效。
- 桌面与 375px 移动端均无横向溢出、遮挡或底部导航错位。
- 焦点状态清楚，触控目标可用，`prefers-reduced-motion` 下不会保留位移动画。
- 设计改动不修改 API、权限、路由和业务交互。

动效来源遵循 [StyleKit 动效库](https://www.stylekit.top/zh/animations)，玻璃材质参考 [StyleKit Glassmorphism](https://www.stylekit.top/zh/styles/glassmorphism)。
