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

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: {
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

        outlineTitle: '本页目录',
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        langMenuLabel: '切换语言',
        docFooter: {
          prev: '上一页',
          next: '下一页',
        },
        lastUpdatedText: '最后更新于',
        notFound: {
          title: '页面未找到',
          quote: '你访问的页面不存在，或已被移动。',
          linkLabel: '返回首页',
          linkText: '返回首页',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'yoooclaw',
      description: 'Docs for the standalone yoooclaw CLI',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guide/getting-started' },
          { text: 'CLI', link: '/en/cli/' },
        ],

        sidebar: {
          '/en/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Getting Started', link: '/en/guide/getting-started' },
              ],
            },
          ],
          '/en/cli/': [
            {
              text: 'Standalone CLI',
              items: [
                { text: 'Overview & Installation', link: '/en/cli/' },
                { text: 'Architecture & Implementation', link: '/en/cli/architecture' },
                { text: 'Multi API-Key Design', link: '/en/cli/multi-api-key' },
                { text: 'Storage & Context Building', link: '/en/cli/storage' },
                { text: 'Command System & Output', link: '/en/cli/usage' },
                { text: 'Command Reference', link: '/en/cli/commands' },
                { text: 'Agent Skill', link: '/en/cli/skills' },
                { text: 'Debugging & Troubleshooting', link: '/en/cli/debugging' },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    socialLinks: [
      { icon: 'github', link: 'https://github.com/YoooClaw/cli' },
    ],

    search: {
      provider: 'local',
    },
  },
})
