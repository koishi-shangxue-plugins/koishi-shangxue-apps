import { Context, h } from "koishi";
import { Config, PageInstance } from "../types";
import { ensureUIControl } from "../utils";

/**
 * 注册 UI 控制相关命令
 */
export function registerUIControlCommands(
  ctx: Context,
  config: Config,
  pageRef: { current: PageInstance },
  commandNames: {
    automation: string | null;
    openUI: string | null;
    cancanUI: string | null;
    closeUI: string | null;
  }
) {
  const { automation, openUI, cancanUI, closeUI } = commandNames;

  // 打开UI控制
  if (openUI) {
    ctx.command(`${automation || "automation-console"}/${openUI}`, "打开UI控制台", {
      authority: config.table2.find(item => item.command === "打开UI控制")?.command_authority
    })
      .action(async ({ session }) => {
        if (pageRef.current) {
          await session.send("你已经打开了UI控制页面，请勿重复打开。若要退出，请发送【退出UI控制】");
          return;
        }

        try {
          pageRef.current = await ctx.puppeteer.page();
          await pageRef.current.goto(config.link, { waitUntil: 'networkidle2' });

          if (config.enable_auth) {
            const isLoggedIn = await pageRef.current.evaluate(() => {
              return !!document.querySelector('a[href^="/logs"]');
            });

            if (!isLoggedIn) {
              await pageRef.current.click('a[href^="/login"]');
              await pageRef.current.evaluate(() => {
                (document.querySelector('input[placeholder="用户名"]') as HTMLInputElement).value = '';
                (document.querySelector('input[placeholder="密码"]') as HTMLInputElement).value = '';
              });

              await pageRef.current.type('input[placeholder="用户名"]', config.text);
              await pageRef.current.type('input[placeholder="密码"]', config.secret);

              await pageRef.current.evaluate(() => {
                (document.querySelectorAll('button.k-button.primary')[1] as HTMLElement).click();
              });

              await pageRef.current.waitForSelector('a[href^="/logs"]');
            }
          }
          await pageRef.current.click('a[href="/"]');
          await session.execute(`${cancanUI}`);
          await session.send("UI控制台已打开并登录。");
        } catch (error) {
          ctx.logger.error('打开UI控制台时出错:', error);
          await session.send("打开UI控制台时出错，请重试。");
        }
      });
  }

  // 查看UI控制
  if (cancanUI) {
    ctx.command(`${automation || "automation-console"}/${cancanUI}`, "查看UI控制台当前页面", {
      authority: config.table2.find(item => item.command === "查看UI控制")?.command_authority
    })
      .action(async ({ session }) => {
        if (!await ensureUIControl(pageRef.current, config, session, openUI)) return;
        try {
          const screenshot = await pageRef.current!.screenshot();
          await session.send(h.image("data:image/jpeg;base64," + screenshot.toString('base64')));
        } catch (error) {
          ctx.logger.error('查看UI控制台时出错:', error);
          await session.send("查看UI控制台时出错，请重试。");
        }
      });
  }

  // 退出UI控制
  if (closeUI) {
    ctx.command(`${automation || "automation-console"}/${closeUI}`, "关闭UI控制台", {
      authority: config.table2.find(item => item.command === "退出UI控制")?.command_authority
    })
      .action(async ({ session }) => {
        if (!await ensureUIControl(pageRef.current, config, session, openUI)) return;

        try {
          await pageRef.current!.close();
          pageRef.current = null;
          await session.send("UI控制台已关闭。");
        } catch (error) {
          ctx.logger.error('关闭UI控制台时出错:', error);
          await session.send("关闭UI控制台时出错，请重试。");
        }
      });
  }
}
