import { defineConfig } from 'vitepress'

// VitePress 站点配置：https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'yoooclaw',
  description: '独立 yoooclaw CLI 文档',
  lang: 'zh-CN',

  // 插件文档暂时隐藏：源文件保留但不参与构建、不出现在导航与搜索中
  srcExclude: ['plugin/**'],

  // 部署到 Cloudflare Pages，绑定自定义域 developer.yoooclaw.ai（根路径）
  // 故使用默认 base '/'

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'CLI', link: '/cli/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
          ],
        },
      ],
      '/cli/': [
        {
          text: '独立 CLI',
          items: [
            { text: '概述与安装', link: '/cli/' },
            { text: '架构与实现逻辑', link: '/cli/architecture' },
            { text: '多 api-key 设计', link: '/cli/multi-api-key' },
            { text: '存储与上下文构建', link: '/cli/storage' },
            { text: '命令体系与输出', link: '/cli/usage' },
            { text: '命令参考', link: '/cli/commands' },
            { text: 'Agent Skill', link: '/cli/skills' },
            { text: '调试与排错', link: '/cli/debugging' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/YoooClaw/cli' },
    ],

    search: {
      provider: 'local',
    },
  },
})
