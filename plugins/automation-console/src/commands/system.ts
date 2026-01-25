import { Context, h } from "koishi";
import { Config, PageInstance } from "../types";
import { getConsoleUrl } from "../utils";

/**
 * 注册系统相关命令
 */
export function registerSystemCommands(
  ctx: Context,
  config: Config,
  commandNames: {
    automation: string | null;
    restart: string | null;
    yarnUpToLatest: string | null;
    cancanLogs: string | null;
  }
) {
  const { automation, restart, yarnUpToLatest, cancanLogs } = commandNames;

  // 软重启Koishi
  if (restart) {
    ctx.command(`${automation || "automation-console"}.${restart}`, "重启Koishi控制台", {
      authority: config.commandTable.find(item => item.command === "软重启")?.command_authority
    })
      .action(async ({ session }) => {
        let page: PageInstance = null;

        try {
          // 打开页面并直接访问插件配置路由
          const consoleUrl = getConsoleUrl(ctx, config, '/plugins/');
          page = await ctx.puppeteer.page();
          await page.goto(consoleUrl, { waitUntil: 'networkidle2' });

          // 如果需要登录
          if (config.enable_auth && page.url().includes('/login')) {
            await page.evaluate(() => {
              (document.querySelector('input[placeholder="用户名"]') as HTMLInputElement).value = '';
              (document.querySelector('input[placeholder="密码"]') as HTMLInputElement).value = '';
            });

            await page.type('input[placeholder="用户名"]', config.text);
            await page.type('input[placeholder="密码"]', config.secret);

            await page.evaluate(() => {
              (document.querySelectorAll('button.k-button.primary')[1] as HTMLElement).click();
            });

            await page.waitForSelector('a[href^="/logs"]');
            await page.goto(consoleUrl, { waitUntil: 'networkidle2' });
          }

          // 点击【全局设置】
          await page.waitForSelector('.item .label[title="全局设置"]');
          await page.click('.item .label[title="全局设置"]');

          // 提示重启
          await session.send("正在【重启Koishi】...");

          // 点击重载按钮
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item:not(.disabled)');
            if (buttons.length >= 3) {
              (buttons[0] as HTMLElement).click(); // 点击第一个可用按钮【重载插件】
            }
          });

          await session.send("重启指令已执行。");
        } catch (error) {
          ctx.logger.error('重启Koishi时出错:', error);
          await session.send("重启Koishi时出错，请重试。");
        } finally {
          // 自动关闭页面
          if (page) {
            await page.close();
          }
        }
      });
  }

  // 小火箭更新依赖
  if (yarnUpToLatest) {
    ctx.command(`${automation || "automation-console"}.${yarnUpToLatest}`, "小火箭更新", {
      authority: config.commandTable.find(item => item.command === "小火箭更新依赖")?.command_authority
    })
      .action(async ({ session }) => {
        let page: PageInstance = null;

        try {
          // 打开页面并直接访问依赖管理路由
          const consoleUrl = getConsoleUrl(ctx, config, '/dependencies');
          page = await ctx.puppeteer.page();
          await page.goto(consoleUrl, { waitUntil: 'networkidle2' });

          // 如果需要登录
          if (config.enable_auth && page.url().includes('/login')) {
            await page.evaluate(() => {
              (document.querySelector('input[placeholder="用户名"]') as HTMLInputElement).value = '';
              (document.querySelector('input[placeholder="密码"]') as HTMLInputElement).value = '';
            });

            await page.type('input[placeholder="用户名"]', config.text);
            await page.type('input[placeholder="密码"]', config.secret);

            await page.evaluate(() => {
              (document.querySelectorAll('button.k-button.primary')[1] as HTMLElement).click();
            });

            await page.waitForSelector('a[href^="/logs"]');
            await page.goto(consoleUrl, { waitUntil: 'networkidle2' });
          }

          // 在页面上下文中执行脚本，查找按钮
          const canUpdate = await page.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item');
            const updateButton = buttons[0] as HTMLElement; // 假设第一个是【全部更新】按钮
            const refreshButton = buttons[3] as HTMLElement; // 假设第四个是【刷新】按钮

            if (!updateButton || updateButton.classList.contains('disabled')) {
              return false; // 【全部更新】按钮不可按
            }

            refreshButton.click(); // 点击【刷新】按钮
            return true; // 【全部更新】按钮可用
          });

          if (!canUpdate) {
            await session.send("当前已经全部是最新依赖了，无需更新");
            return;
          }

          // 等待配置的时间
          await new Promise(resolve => setTimeout(resolve, config.resolvetimeout * 1000));

          // 点击【全部更新】按钮
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item');
            const updateButton = buttons[0] as HTMLElement;
            updateButton.click();
          });

          // 点击【应用更改】按钮
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('.right .menu-item');
            const applyChangesButton = buttons[1] as HTMLElement; // 假设第二个是【应用更改】按钮
            applyChangesButton.click();
          });

          // 等待确认安装弹窗并点击【确认安装】
          await page.waitForSelector('.el-button--primary', { visible: true });
          await page.evaluate(() => {
            const confirmButton = document.querySelector('.el-button--primary') as HTMLElement;
            confirmButton.click();
          });

          await session.send("已确认安装");
        } catch (error) {
          ctx.logger.error("小火箭更新依赖时出错:", error);
          await session.send("更新依赖失败，请重试。");
        } finally {
          // 自动关闭页面
          if (page) {
            await page.close();
          }
        }
      });
  }

  // 查看日志
  if (cancanLogs) {
    ctx.command(`${automation || "automation-console"}.${cancanLogs}`, "查看日志截图", {
      authority: config.commandTable.find(item => item.command === "查看日志")?.command_authority
    })
      .action(async ({ session }) => {
        let page: PageInstance = null;

        try {
          // 打开页面并直接访问日志路由
          const consoleUrl = getConsoleUrl(ctx, config, '/logs');
          page = await ctx.puppeteer.page();
          await page.goto(consoleUrl, { waitUntil: 'networkidle2' });

          // 如果需要登录
          if (config.enable_auth && page.url().includes('/login')) {
            await page.evaluate(() => {
              (document.querySelector('input[placeholder="用户名"]') as HTMLInputElement).value = '';
              (document.querySelector('input[placeholder="密码"]') as HTMLInputElement).value = '';
            });

            await page.type('input[placeholder="用户名"]', config.text);
            await page.type('input[placeholder="密码"]', config.secret);

            await page.evaluate(() => {
              (document.querySelectorAll('button.k-button.primary')[1] as HTMLElement).click();
            });

            await page.waitForSelector('a[href^="/logs"]');
            await page.goto(consoleUrl, { waitUntil: 'networkidle2' });
          }

          // 截图并发送
          const screenshot = await page.screenshot();
          await session.send(h.image("data:image/jpeg;base64," + screenshot.toString('base64')));
        } catch (error) {
          ctx.logger.error('查看日志时出错:', error);
          await session.send("查看日志时出错，请重试。");
        } finally {
          // 自动关闭页面
          if (page) {
            await page.close();
          }
        }
      });
  }
}
